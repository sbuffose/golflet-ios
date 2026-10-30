import Foundation

extension LiveGolfletAPI {
    func groups() async throws -> [GolfletGroup] {
        GroupsParser.groups(from: try await request("GET", GroupsAPIPaths.list))
    }

    func createGroup(name: String, photoJPEG: Data?) async throws -> GolfletGroup {
        let json = try await request(
            "POST",
            GroupsAPIPaths.list,
            body: ["name": name, "matriculas": [String]()]
        )
        guard var group = GroupsParser.group(from: json["group"] ?? json) else { throw GolfletError.decoding("group") }
        if let photoJPEG, !photoJPEG.isEmpty {
            let photo = try await putGroupPhoto(id: group.id, jpeg: photoJPEG)
            if let updated = GroupsParser.group(from: photo["group"] ?? photo) {
                group = updated
            } else if let url = photo["photo_url"] as? String {
                group.photoURL = url
            }
        }
        return group
    }

    func group(id: String) async throws -> GolfletGroup {
        let json = try await request("GET", GroupsAPIPaths.detail(id))
        guard let group = GroupsParser.group(from: json["group"] ?? json) else { throw GolfletError.decoding("group") }
        return group
    }

    func updateGroup(id: String, name: String?, photoJPEG: Data?) async throws -> GolfletGroup {
        var json: [String: Any] = [:]
        if let name {
            json = try await request("PATCH", GroupsAPIPaths.detail(id), body: ["name": name])
        } else {
            json = try await request("GET", GroupsAPIPaths.detail(id))
        }
        if let photoJPEG, !photoJPEG.isEmpty {
            json = try await putGroupPhoto(id: id, jpeg: photoJPEG)
        }
        guard let group = GroupsParser.group(from: json["group"] ?? json) else { throw GolfletError.decoding("group") }
        return group
    }

    func leaveGroup(id: String) async throws {
        _ = try await request("POST", GroupsAPIPaths.leave(id), body: [:])
    }

    func removeMember(groupID: String, userID: String) async throws -> GolfletGroup {
        let json = try await request("DELETE", GroupsAPIPaths.member(groupID, userID: userID))
        guard let group = GroupsParser.group(from: json["group"] ?? json) else { throw GolfletError.decoding("group") }
        return group
    }

    func setMemberRole(groupID: String, userID: String, role: GroupRole) async throws -> GolfletGroup {
        let json = try await request(
            "PATCH",
            GroupsAPIPaths.member(groupID, userID: userID),
            body: ["role": role.rawValue]
        )
        guard let group = GroupsParser.group(from: json["group"] ?? json) else { throw GolfletError.decoding("group") }
        return group
    }

    func regenerateInvite(groupID: String) async throws -> GroupInviteLink {
        let json = try await request("POST", GroupsAPIPaths.link(groupID), body: ["action": "regenerate"])
        guard let link = GroupsParser.inviteLink(
            from: json["link"] ?? json["invite"] ?? (json["group"] as? [String: Any])?["link"] ?? json
        ) else {
            throw GolfletError.decoding("invite")
        }
        return link
    }

    func disableInvite(groupID: String) async throws -> GroupInviteLink {
        let json = try await request("POST", GroupsAPIPaths.link(groupID), body: ["action": "disable"])
        return GroupsParser.inviteLink(
            from: json["link"] ?? json["invite"] ?? (json["group"] as? [String: Any])?["link"] ?? json
        ) ?? .make(token: "", enabled: false)
    }

    func pendingInvites() async throws -> [GroupInvitePreview] {
        GroupsParser.invites(from: try await request("GET", GroupsAPIPaths.list))
    }

    func invitePreview(token: String) async throws -> GroupInvitePreview {
        let encoded = token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? token
        let json = try await request("GET", GroupsAPIPaths.join(encoded))
        guard var invite = GroupsParser.invite(from: json, fallbackToken: token) else {
            throw GolfletError.decoding("invite")
        }
        if invite.token.isEmpty { invite.token = token }
        return invite
    }

    func acceptInvite(token: String) async throws -> GolfletGroup {
        let json = try await respond(to: token, accept: true)
        if let group = GroupsParser.group(from: json["group"] ?? json) { return group }
        if let id = json["group_id"] as? String { return try await group(id: id) }
        throw GolfletError.decoding("group")
    }

    func declineInvite(token: String) async throws {
        _ = try await respond(to: token, accept: false)
    }

    func groupView(groupID: String) async throws -> GroupViewConfig {
        GroupsParser.viewConfig(from: try await request("GET", GroupsAPIPaths.view(groupID)))
    }

    func saveGroupView(groupID: String, config: GroupViewConfig) async throws -> GroupViewConfig {
        GroupsParser.viewConfig(from: try await request("PUT", GroupsAPIPaths.view(groupID), body: config.jsonBody))
    }

    func sharePrefs() async throws -> SharePrefs {
        GroupsParser.sharePrefs(from: try await request("GET", GroupsAPIPaths.sharePrefs))
    }

    func saveSharePrefs(_ prefs: SharePrefs) async throws -> SharePrefs {
        GroupsParser.sharePrefs(from: try await request("PUT", GroupsAPIPaths.sharePrefs, body: prefs.jsonBody))
    }

    func groupComparison(groupID: String, config: GroupViewConfig) async throws -> GroupComparison {
        var query = "range=\(config.range.rawValue)"
        if let course = config.courseFilter, !course.isEmpty {
            let encoded = course.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? course
            query += "&course=\(encoded)"
        }
        let json = try await request("GET", "\(GroupsAPIPaths.detail(groupID))?\(query)")
        return GroupsParser.comparison(from: json, fallback: config)
    }

    func groupPeriod(groupID: String, kind: ComparativoKind, off: Int) async throws -> ComparativoData {
        do {
            let json = try await request("GET", GroupsAPIPaths.period(groupID, kind: kind, off: off))
            return GroupsParser.period(from: json, fallbackKind: kind, fallbackOff: off)
        } catch let error as GolfletError {
            if error.httpStatus == 404 {
                throw GolfletError.server("No encontramos ese grupo.")
            }
            throw error
        }
    }

    func memberProfile(groupID: String, memberID: String) async throws -> GroupMemberProfile {
        do {
            let json = try await request("GET", GroupsAPIPaths.memberProfile(groupID, memberID: memberID))
            return GroupsParser.memberProfile(from: json, groupID: groupID, memberID: memberID)
        } catch let error as GolfletError {
            if error.httpStatus == 403 {
                return GroupsParser.lockedProfile(groupID: groupID, groupName: "", memberID: memberID, name: "", isMe: false)
            }
            if error.httpStatus == 404 {
                throw GolfletError.server("Esa persona no está en el grupo.")
            }
            if error == .notAuthenticated {
                throw error
            }
            throw error
        }
    }

    func memberRound(groupID: String, memberID: String, roundID: String) async throws -> SharedScorecard {
        do {
            let json = try await request("GET", GroupsAPIPaths.memberRound(groupID, memberID: memberID, roundID: roundID))
            guard let card = GroupsParser.scorecard(from: json, groupID: groupID) else {
                throw GolfletError.decoding("card")
            }
            return card
        } catch let error as GolfletError {
            if error.httpStatus == 403 {
                throw GolfletError.server("No comparte sus tarjetas hoyo por hoyo.")
            }
            if error.httpStatus == 404 {
                throw GolfletError.server("No encontramos esa tarjeta.")
            }
            throw error
        }
    }

    private func respond(to token: String, accept: Bool) async throws -> [String: Any] {
        if token.hasPrefix("group:") {
            let id = String(token.dropFirst(6))
            return try await request("POST", GroupsAPIPaths.respond(id), body: ["accept": accept])
        }
        let encoded = token.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? token
        return try await request("POST", GroupsAPIPaths.join(encoded), body: ["accept": accept])
    }

    private func putGroupPhoto(id: String, jpeg: Data) async throws -> [String: Any] {
        guard let url = URL(string: GroupsAPIPaths.photo(id), relativeTo: baseURL) else { throw GolfletError.invalidClub }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 45
        guard let token = KeychainStore.loadToken() else { throw GolfletError.notAuthenticated }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = jpeg

        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 45
        config.timeoutIntervalForResource = 45
        let (data, response) = try await URLSession(configuration: config).data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if status == 401 {
            KeychainStore.deleteToken()
            throw GolfletError.notAuthenticated
        }
        if status >= 400 {
            throw GolfletError.server(LivePayloadMapper.authMessage(from: json, fallback: "No se pudo guardar la foto."))
        }
        return json
    }
}

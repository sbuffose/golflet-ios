import Foundation

extension LiveGolfletAPI {
    func groups() async throws -> [GolfletGroup] {
        GroupsParser.groups(from: try await request("GET", GroupsAPIPaths.list))
    }

    func createGroup(name: String, photoJPEG: Data?) async throws -> GolfletGroup {
        let json = try await submitGroup(path: GroupsAPIPaths.list, method: "POST", name: name, photoJPEG: photoJPEG)
        guard let group = GroupsParser.group(from: json["group"] ?? json) else { throw GolfletError.decoding("group") }
        return group
    }

    func group(id: String) async throws -> GolfletGroup {
        let json = try await request("GET", GroupsAPIPaths.detail(id))
        guard let group = GroupsParser.group(from: json["group"] ?? json) else { throw GolfletError.decoding("group") }
        return group
    }

    func updateGroup(id: String, name: String?, photoJPEG: Data?) async throws -> GolfletGroup {
        let json = try await submitGroup(path: GroupsAPIPaths.detail(id), method: "PATCH", name: name, photoJPEG: photoJPEG)
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
            "POST",
            GroupsAPIPaths.memberRole(groupID, userID: userID),
            body: ["role": role.rawValue]
        )
        guard let group = GroupsParser.group(from: json["group"] ?? json) else { throw GolfletError.decoding("group") }
        return group
    }

    func regenerateInvite(groupID: String) async throws -> GroupInviteLink {
        let json = try await request("POST", GroupsAPIPaths.invite(groupID), body: [:])
        guard let link = GroupsParser.inviteLink(from: json["invite"] ?? json) else { throw GolfletError.decoding("invite") }
        return link
    }

    func disableInvite(groupID: String) async throws -> GroupInviteLink {
        let json = try await request("POST", GroupsAPIPaths.disableInvite(groupID), body: [:])
        return GroupsParser.inviteLink(from: json["invite"] ?? json) ?? .make(token: "", enabled: false)
    }

    func pendingInvites() async throws -> [GroupInvitePreview] {
        GroupsParser.invites(from: try await request("GET", GroupsAPIPaths.pendingInvites))
    }

    func invitePreview(token: String) async throws -> GroupInvitePreview {
        let json = try await request("GET", GroupsAPIPaths.preview(token), authorized: false)
        guard let invite = GroupsParser.invite(from: json["invite"] ?? json) else { throw GolfletError.decoding("invite") }
        return invite
    }

    func acceptInvite(token: String) async throws -> GolfletGroup {
        let json = try await request("POST", GroupsAPIPaths.accept(token), body: [:])
        guard let group = GroupsParser.group(from: json["group"] ?? json) else { throw GolfletError.decoding("group") }
        return group
    }

    func declineInvite(token: String) async throws {
        _ = try await request("POST", GroupsAPIPaths.decline(token), body: [:])
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
        let json = try await request("GET", "\(GroupsAPIPaths.comparison(groupID))?\(query)")
        return GroupsParser.comparison(from: json, fallback: config)
    }

    private func submitGroup(path: String, method: String, name: String?, photoJPEG: Data?) async throws -> [String: Any] {
        if let photoJPEG, !photoJPEG.isEmpty {
            return try await uploadGroup(path: path, method: method, name: name, photoJPEG: photoJPEG)
        }
        var body: [String: Any] = [:]
        if let name { body["name"] = name }
        return try await request(method, path, body: body)
    }

    private func uploadGroup(path: String, method: String, name: String?, photoJPEG: Data) async throws -> [String: Any] {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw GolfletError.invalidClub }
        let boundary = "Golflet\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 45
        guard let token = KeychainStore.loadToken() else { throw GolfletError.notAuthenticated }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        var body = Data()
        func field(_ key: String, _ value: String) {
            body.append(Data("--\(boundary)\r\n".utf8))
            body.append(Data("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".utf8))
            body.append(Data("\(value)\r\n".utf8))
        }
        if let name { field("name", name) }
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"photo\"; filename=\"group.jpg\"\r\n".utf8))
        body.append(Data("Content-Type: image/jpeg\r\n\r\n".utf8))
        body.append(photoJPEG)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        request.httpBody = body

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
            throw GolfletError.server(LivePayloadMapper.authMessage(from: json, fallback: "No se pudo guardar el grupo."))
        }
        return json
    }
}

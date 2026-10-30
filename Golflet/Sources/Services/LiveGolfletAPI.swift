import Foundation

struct LiveGolfletAPI: GolfletAPI {
    var baseURL: URL = URL(string: "https://golflet.vercel.app")!

    var isAuthenticated: Bool { KeychainStore.loadToken() != nil }
    var persistsLocally: Bool { false }

    func signInGolfistics(matricula: String, clave: String, savePassword: Bool) async throws -> GolfisticsSession {
        let json = try await request(
            "POST",
            "/api/auth/golfistics",
            body: [
                "matricula": matricula,
                "clave": clave,
                "save_password": savePassword
            ],
            authorized: false,
            captureToken: true
        )
        if KeychainStore.loadToken() == nil {
            throw GolfletError.server(LivePayloadMapper.authMessage(from: json, fallback: "No se pudo entrar."))
        }
        return LivePayloadMapper.golfisticsSession(from: json)
    }

    func startFirstSync(progressID: String, clubID: Int?) async throws -> SyncResult {
        var body: [String: Any] = ["progress_id": progressID]
        if let clubID { body["club_id"] = clubID }
        let json = try await request(
            "POST",
            "/api/accounts/first-sync",
            body: body,
            timeout: 180
        )
        return LivePayloadMapper.parseSync(json)
    }

    func signOut() async throws {
        _ = try? await request("POST", "/api/auth/sign-out", body: [:], authorized: true)
        KeychainStore.deleteToken()
    }

    func bootstrap() async throws -> AppSnapshot {
        let json = try await request("GET", "/api/data")
        return LivePayloadMapper.snapshot(from: json)
    }

    func clubCatalogue() async throws -> [ClubCatalogEntry] {
        let json = try await request("GET", "/api/clubs")
        return LivePayloadMapper.parseCatalogue(json)
    }

    func linkClub(matricula: String, password: String, savePassword: Bool, progressID: String, clubID: Int?) async throws -> SyncResult {
        var body: [String: Any] = [
            "matricula": matricula,
            "password": password,
            "save_password": savePassword,
            "progress_id": progressID
        ]
        if let clubID { body["club_id"] = clubID }
        let json = try await request("POST", "/api/accounts", body: body, timeout: 180)
        return LivePayloadMapper.parseSync(json)
    }

    func syncAccount(id: String, password: String?, savePassword: Bool, progressID: String) async throws -> SyncResult {
        var body: [String: Any] = ["progress_id": progressID]
        if let password, !password.isEmpty {
            body["password"] = password
            body["save_password"] = savePassword
        }
        let json = try await request("POST", "/api/accounts/\(id)/sync", body: body, timeout: 180)
        return LivePayloadMapper.parseSync(json)
    }

    func pollSyncProgress(progressID: String) async -> SyncAPIProgress? {
        guard let json = try? await request("GET", "/api/sync-progress/\(progressID)") else { return nil }
        return SyncProgressParser.parse(json)
    }

    func forgetPassword(accountId: String) async throws {
        _ = try await request("PATCH", "/api/accounts/\(accountId)", body: ["forget_password": true])
    }

    func unlink(accountId: String) async throws {
        _ = try await request("DELETE", "/api/accounts/\(accountId)")
    }

    func saveRoundNotes(roundId: String, putts: Int?, gir: Int?, fir: Int?, notes: String) async throws {
        var body: [String: Any] = ["notes": notes]
        if let putts { body["putts"] = putts } else { body["putts"] = "" }
        if let gir { body["gir"] = gir } else { body["gir"] = "" }
        if let fir { body["fir"] = fir } else { body["fir"] = "" }
        _ = try await request("PUT", "/api/rounds/\(roundId)/notes", body: body)
    }

    func saveBag(_ items: [BagClub]) async throws -> [BagClub] {
        let payload = items.map { ["club": $0.name, "carry": $0.carry as Any, "total": $0.total as Any] }
        let json = try await request("PUT", "/api/bag", body: ["bag": payload])
        return LivePayloadMapper.parseBag(json["bag"])
    }

    func gpsCourses(lat: Double?, lng: Double?) async throws -> GPSCourseList {
        var query: [String] = []
        if let lat, let lng {
            query.append("lat=\(lat)")
            query.append("lng=\(lng)")
        }
        let suffix = query.isEmpty ? "" : "?\(query.joined(separator: "&"))"
        return PlayParser.courses(try await request("GET", "/api/gps/courses\(suffix)"))
    }

    func gpsCourse(id: String, lat: Double?, lng: Double?) async throws -> GPSCourseDetail {
        var query: [String] = []
        if let lat, let lng {
            query.append("lat=\(lat)")
            query.append("lng=\(lng)")
        }
        let suffix = query.isEmpty ? "" : "?\(query.joined(separator: "&"))"
        guard let detail = PlayParser.courseDetail(try await request("GET", "/api/gps/courses/\(id)\(suffix)")) else {
            throw GolfletError.decoding("course")
        }
        return detail
    }

    func createLiveRound(courseId: String?, tee: String?, players: Int, modality: String) async throws -> LiveRound {
        var body: [String: Any] = [
            "players": PaceDefaults.clampPlayers(players),
            "modality": PaceDefaults.normalizeModality(modality)
        ]
        if let courseId { body["course_id"] = courseId }
        if let tee { body["tee"] = tee }
        let json = try await request("POST", "/api/live-rounds", body: body)
        guard let round = PlayParser.liveRound(json["live_round"] ?? json) else { throw GolfletError.decoding("live_round") }
        return round
    }

    func liveRound(id: String) async throws -> LiveRoundDetail {
        let json = try await request("GET", "/api/live-rounds/\(id)")
        guard let round = PlayParser.liveRound(json["live_round"]) else { throw GolfletError.decoding("live_round") }
        let shots = (json["shots"] as? [Any] ?? []).compactMap(PlayParser.shot)
        return LiveRoundDetail(liveRound: round, shots: shots, recap: PlayParser.recap(json["recap"]))
    }

    func patchLiveRound(id: String, body: [String: Any]) async throws -> LiveRound {
        let json = try await request("PATCH", "/api/live-rounds/\(id)", body: body)
        guard let round = PlayParser.liveRound(json["live_round"] ?? json) else { throw GolfletError.decoding("live_round") }
        return round
    }

    func postShots(liveRoundId: String, drafts: [ShotDraft]) async throws -> [Shot] {
        let payload: [String: Any]
        if drafts.count == 1, let first = drafts.first {
            payload = ShotQueue.payload(first)
        } else {
            payload = ["shots": drafts.prefix(200).map(ShotQueue.payload)]
        }
        let json = try await request("POST", "/api/live-rounds/\(liveRoundId)/shots", body: payload)
        return (json["shots"] as? [Any] ?? []).compactMap(PlayParser.shot)
    }

    func patchShot(id: String, body: [String: Any]) async throws -> Shot {
        let json = try await request("PATCH", "/api/shots/\(id)", body: body)
        guard let shot = PlayParser.shot(json["shot"] ?? json) else { throw GolfletError.decoding("shot") }
        return shot
    }

    func recap(roundId: String?, liveRoundId: String?) async throws -> Recap? {
        var query: [String] = []
        if let roundId { query.append("round_id=\(roundId)") }
        if let liveRoundId { query.append("live_round_id=\(liveRoundId)") }
        let suffix = query.isEmpty ? "" : "?\(query.joined(separator: "&"))"
        let json = try await request("GET", "/api/recaps\(suffix)")
        return PlayParser.recap(json["recap"])
    }

    func uploadRecap(audio: Data, roundId: String?, liveRoundId: String?, draft: RecapDraft?) async throws -> Recap {
        let json = try await upload("/api/recaps", audio: audio, roundId: roundId, liveRoundId: liveRoundId, draft: draft)
        guard let recap = PlayParser.recap(json["recap"] ?? json) else { throw GolfletError.decoding("recap") }
        return recap
    }

    func typedRecap(roundId: String?, liveRoundId: String?, draft: RecapDraft) async throws -> Recap {
        var body = draft.jsonBody
        if let roundId { body["round_id"] = roundId }
        if let liveRoundId { body["live_round_id"] = liveRoundId }
        let json = try await request("POST", "/api/recaps", body: body, timeout: 120)
        guard let recap = PlayParser.recap(json["recap"] ?? json) else { throw GolfletError.decoding("recap") }
        return recap
    }

    func patchRecap(id: String, body: [String: Any]) async throws -> Recap {
        let json = try await request("PATCH", "/api/recaps/\(id)", body: body, timeout: 120)
        guard let recap = PlayParser.recap(json["recap"] ?? json) else { throw GolfletError.decoding("recap") }
        return recap
    }

    func recurringMistakes() async throws -> RecurringReport {
        PlayParser.recurring(try await request("GET", "/api/recaps/recurring?last=10"))
    }

    func clubStats(code: String) async throws -> ClubStatsDetail {
        let json = try await request("GET", "/api/club-stats/\(code)")
        guard let detail = PlayParser.clubDetail(json) else { throw GolfletError.decoding("club-stats") }
        return detail
    }

    func metricDrilldown(metric: String, scope: String, year: Int, course: String, sort: String, order: String, range: String) async throws -> MetricDrilldown? {
        let path = "/api/metrics/\(metric)?scope=\(scope)&year=\(year)&course=\(course)&sort=\(sort)&order=\(order)&range=\(range)"
        return PlayParser.metric(try await request("GET", path))
    }

    func metricsSummary(range: String) async throws -> MetricsSummary {
        PlayParser.metricsSummary(try await request("GET", "/api/metrics/summary?range=\(range)"))
    }

    func gameMetrics(range: String) async throws -> GameMetrics {
        GameMetricsParser.metrics(try await request("GET", "/api/game-metrics?range=\(range)"))
    }

    func liveRoundHoles(id: String) async throws -> [LiveHoleRecord] {
        GameMetricsParser.holes(try await request("GET", "/api/live-rounds/\(id)/holes"))
    }

    func putLiveRoundHole(id: String, hole: Int, putts: Int?) async throws -> LiveHoleRecord {
        var body: [String: Any] = [:]
        if let putts { body["putts"] = putts }
        let json = try await request("PUT", "/api/live-rounds/\(id)/holes/\(hole)", body: body)
        return try parseHole(json)
    }

    func postLiveRoundPin(id: String, hole: Int, pin: LivePin, zone: PinZone) async throws -> LiveHoleRecord {
        var body: [String: Any] = ["lat": pin.lat, "lng": pin.lng, "zone": zone.rawValue]
        if let accuracy = pin.accuracyM { body["accuracy_m"] = accuracy }
        let json = try await request("POST", "/api/live-rounds/\(id)/holes/\(hole)/pin", body: body)
        return try parseHole(json)
    }

    func postLiveRoundPinReport(id: String, hole: Int, pin: LivePin) async throws -> LiveHoleRecord {
        var body: [String: Any] = ["lat": pin.lat, "lng": pin.lng]
        if let accuracy = pin.accuracyM { body["accuracy_m"] = accuracy }
        let json = try await request("POST", "/api/live-rounds/\(id)/holes/\(hole)/pin-report", body: body)
        return try parseHole(json)
    }

    private func parseHole(_ json: [String: Any]) throws -> LiveHoleRecord {
        guard let record = GameMetricsParser.hole(json["hole"] ?? json) else {
            throw GolfletError.decoding("hole")
        }
        return record
    }

    func courseStrategy(courseKey: String?, courseId: String?) async throws -> CourseStrategy {
        var query: [String] = []
        if let courseKey {
            let encoded = courseKey.addingPercentEncoding(withAllowedCharacters: Self.queryAllowed) ?? courseKey
            query.append("course_key=\(encoded)")
        }
        if let courseId {
            let encoded = courseId.addingPercentEncoding(withAllowedCharacters: Self.queryAllowed) ?? courseId
            query.append("course_id=\(encoded)")
        }
        let suffix = query.isEmpty ? "" : "?\(query.joined(separator: "&"))"
        let json = try await request("GET", "/api/strategy\(suffix)", authorized: false)
        return PlayParser.strategy(json)
    }

    private static let queryAllowed: CharacterSet = {
        var set = CharacterSet.alphanumerics
        set.insert(charactersIn: "-_.")
        return set
    }()

    func request(
        _ method: String,
        _ path: String,
        body: [String: Any]? = nil,
        authorized: Bool = true,
        captureToken: Bool = false,
        timeout: TimeInterval = 30
    ) async throws -> [String: Any] {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw GolfletError.invalidClub }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = timeout
        if authorized {
            guard let token = KeychainStore.loadToken() else { throw GolfletError.notAuthenticated }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = timeout
        config.timeoutIntervalForResource = timeout
        let session = URLSession(configuration: config)
        let (data, response) = try await session.data(for: request)
        let http = response as? HTTPURLResponse
        let status = http?.statusCode ?? 0

        let json: [String: Any]
        if let object = try? JSONSerialization.jsonObject(with: data) {
            if let dict = object as? [String: Any] {
                json = dict
            } else if let items = object as? [Any] {
                json = ["items": items]
            } else {
                json = [:]
            }
        } else {
            json = [:]
        }
        if captureToken, status < 400 {
            if let token = http?.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty {
                try KeychainStore.saveToken(token)
            } else if let token = json["token"] as? String, !token.isEmpty {
                try KeychainStore.saveToken(token)
            }
        }
        try throwIfFailed(status: status, json: json, authorized: authorized, path: path)
        return json
    }

    private func throwIfFailed(status: Int, json: [String: Any], authorized: Bool, path: String) throws {
        if let needsClub = LivePayloadMapper.needsClub(status: status, json: json) {
            throw needsClub
        }
        if path.hasPrefix("/api/auth/golfistics"), status >= 400 {
            throw GolfletError.auth(LivePayloadMapper.authFailure(status: status, json: json))
        }
        if status == 401 {
            if authorized { KeychainStore.deleteToken() }
            throw GolfletError.notAuthenticated
        }
        if path.hasPrefix("/api/accounts"), let error = LivePayloadMapper.accountError(status: status, json: json) {
            throw error
        }
        if status >= 400 {
            let message = LivePayloadMapper.authMessage(from: json, fallback: "No se pudo completar.")
            if status == 403 || status == 404 || status == 409 || status == 429 {
                throw GolfletError.http(status: status, message: message)
            }
            throw GolfletError.server(message)
        }
    }

    private func upload(
        _ path: String,
        audio: Data,
        roundId: String?,
        liveRoundId: String?,
        draft: RecapDraft? = nil
    ) async throws -> [String: Any] {
        guard audio.count >= 1_024 else { throw GolfletError.server("El audio es demasiado corto.") }
        guard audio.count <= 4_000_000 else { throw GolfletError.server("El audio no puede pasar de 4 MB.") }
        guard let url = URL(string: path, relativeTo: baseURL) else { throw GolfletError.invalidClub }
        let boundary = "Golflet\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120
        guard let token = KeychainStore.loadToken() else { throw GolfletError.notAuthenticated }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        var body = Data()
        func field(_ name: String, _ value: String) {
            body.append(Data("--\(boundary)\r\n".utf8))
            body.append(Data("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".utf8))
            body.append(Data("\(value)\r\n".utf8))
        }
        if let roundId { field("round_id", roundId) }
        if let liveRoundId { field("live_round_id", liveRoundId) }
        if let draft {
            field("transcript", draft.transcript)
            if let source = draft.source { field("source", source) }
            if let model = draft.resolvedModel { field("model", model) }
            if let duration = draft.durationS { field("duration_s", "\(Int(duration.rounded()))") }
            if let summary = draft.summary { field("summary", summary) }
            if let data = try? JSONSerialization.data(withJSONObject: draft.jsonBody["mistakes"] ?? []),
               let text = String(data: data, encoding: .utf8) {
                field("mistakes", text)
            }
            if let data = try? JSONSerialization.data(withJSONObject: draft.jsonBody["positives"] ?? []),
               let text = String(data: data, encoding: .utf8) {
                field("positives", text)
            }
        }
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"audio\"; filename=\"recap.m4a\"\r\n".utf8))
        body.append(Data("Content-Type: audio/mp4\r\n\r\n".utf8))
        body.append(audio)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        request.httpBody = body

        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 120
        let (data, response) = try await URLSession(configuration: config).data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        try throwIfFailed(status: status, json: json, authorized: true, path: path)
        return json
    }
}

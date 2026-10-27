import Foundation

struct LiveGolfletAPI: GolfletAPI {
    var baseURL: URL = URL(string: "https://golflet.vercel.app")!

    var isAuthenticated: Bool { KeychainStore.loadToken() != nil }
    var persistsLocally: Bool { false }

    func signUp(name: String, email: String, password: String) async throws {
        let json = try await request(
            "POST",
            "/api/auth/sign-up/email",
            body: ["name": name, "email": email, "password": password],
            authorized: false,
            captureToken: true
        )
        if KeychainStore.loadToken() == nil {
            throw GolfletError.server(LivePayloadMapper.authMessage(from: json, fallback: "No se pudo crear la cuenta."))
        }
    }

    func signIn(email: String, password: String) async throws {
        let json = try await request(
            "POST",
            "/api/auth/sign-in/email",
            body: ["email": email, "password": password],
            authorized: false,
            captureToken: true
        )
        if KeychainStore.loadToken() == nil {
            throw GolfletError.server(LivePayloadMapper.authMessage(from: json, fallback: "No se pudo entrar."))
        }
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

    func linkClub(clubID: Int?, baseURL: String?, matricula: String, password: String, savePassword: Bool, progressID: String) async throws -> SyncResult {
        var body: [String: Any] = [
            "matricula": matricula,
            "password": password,
            "save_password": savePassword,
            "progress_id": progressID
        ]
        if let clubID {
            body["club_id"] = clubID
        } else if let baseURL, !baseURL.isEmpty {
            body["base_url"] = baseURL
        }
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

    private func request(
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

        if captureToken {
            if let token = http?.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty {
                try KeychainStore.saveToken(token)
            }
        }

        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        try throwIfFailed(status: status, json: json, authorized: authorized)
        return json
    }

    private func throwIfFailed(status: Int, json: [String: Any], authorized: Bool) throws {
        if status == 401 {
            if authorized { KeychainStore.deleteToken() }
            throw GolfletError.notAuthenticated
        }
        if status >= 400 {
            throw GolfletError.server(LivePayloadMapper.authMessage(from: json, fallback: "No se pudo completar."))
        }
    }
}

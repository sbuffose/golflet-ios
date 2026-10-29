import Foundation

extension LiveGolfletAPI {
    func userSettings() async throws -> TextPrefs {
        let json = try await request("GET", TextPrefsParser.listPath)
        return TextPrefsParser.prefs(from: json) ?? .default
    }

    func saveUserSettings(_ prefs: TextPrefs) async throws -> TextPrefs {
        let json = try await request("PATCH", TextPrefsParser.listPath, body: TextPrefsParser.jsonBody(prefs))
        return TextPrefsParser.prefs(from: json) ?? prefs
    }
}

extension MockAPIClient {
    private static let textLock = NSLock()
    private static var mockTextPrefs = TextPrefs.default

    static func resetTextPrefs() {
        textLock.lock()
        mockTextPrefs = RuntimeFlags.testingTextPrefs ?? .default
        textLock.unlock()
    }

    func userSettings() async throws -> TextPrefs {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        if let testing = RuntimeFlags.testingTextPrefs { return testing }
        Self.textLock.lock()
        defer { Self.textLock.unlock() }
        return Self.mockTextPrefs
    }

    func saveUserSettings(_ prefs: TextPrefs) async throws -> TextPrefs {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        Self.textLock.lock()
        Self.mockTextPrefs = prefs
        Self.textLock.unlock()
        return prefs
    }
}

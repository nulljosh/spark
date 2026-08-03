import Foundation

/// Override these values in TestConfig.local.swift (gitignored) to run integration tests.
/// Integration tests are skipped when credentials are placeholder values.
enum TestConfig {
    static var username: String { _username }
    static var password: String { _password }
    static var baseURL: String { _baseURL }

    // Defaults (overridden by TestConfig.local.swift)
    nonisolated(unsafe) static var _username = "PLACEHOLDER"
    nonisolated(unsafe) static var _password = "PLACEHOLDER"
    nonisolated(unsafe) static var _baseURL = "https://sparkjar.heyitsmejosh.com"

    static var hasRealCredentials: Bool {
        username != "PLACEHOLDER" && password != "PLACEHOLDER"
    }
}

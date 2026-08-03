import Foundation

final class WatchAPI: @unchecked Sendable {
    static let shared = WatchAPI()

    private let baseURL = "https://sparkjar.heyitsmejosh.com"
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let defaults = UserDefaults.standard

    private let tokenKey = "spark_jwt"
    private let userKey = "spark_user"

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 15
        session = URLSession(configuration: config)
    }

    // MARK: - Auth

    var token: String? {
        get { defaults.string(forKey: tokenKey) }
        set { defaults.set(newValue, forKey: tokenKey) }
    }

    var username: String? {
        get { defaults.string(forKey: userKey) }
        set { defaults.set(newValue, forKey: userKey) }
    }

    var isLoggedIn: Bool { token != nil && !(token?.isEmpty ?? true) }

    func login(username: String, password: String) async throws -> AuthResponse {
        let payload = ["username": username, "password": password]
        let body = try JSONSerialization.data(withJSONObject: payload)
        let data = try await post("/api/auth/login", body: body)
        let auth = try decoder.decode(AuthResponse.self, from: data)
        token = auth.token
        self.username = auth.username
        return auth
    }

    func logout() {
        token = nil
        username = nil
    }

    // MARK: - Posts

    func fetchPosts() async throws -> [WatchPost] {
        let data = try await fetch("/api/posts")
        let result = try decoder.decode(PostsResponse.self, from: data)
        cache(data, forKey: "posts")
        return result.posts
    }

    func cachedPosts() -> [WatchPost]? {
        guard let data = defaults.data(forKey: "cache_posts") else { return nil }
        return try? decoder.decode(PostsResponse.self, from: data).posts
    }

    func vote(postId: String, type: String) async throws {
        guard let encoded = postId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else { return }
        let payload = ["voteType": type]
        let body = try JSONSerialization.data(withJSONObject: payload)
        _ = try await post("/api/posts/\(encoded)/vote", body: body, auth: true)
    }

    func createPost(title: String, content: String, category: String) async throws -> WatchPost {
        let payload = ["title": title, "content": content, "category": category]
        let body = try JSONSerialization.data(withJSONObject: payload)
        let data = try await post("/api/posts", body: body, auth: true)
        return try decoder.decode(WatchPost.self, from: data)
    }

    // MARK: - Internal

    private func fetch(_ path: String) async throws -> Data {
        guard let url = URL(string: baseURL + path) else {
            throw URLError(.badURL)
        }
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw URLError(.badServerResponse)
        }
        return data
    }

    private func post(_ path: String, body: Data, auth: Bool = false) async throws -> Data {
        guard let url = URL(string: baseURL + path) else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if auth, let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = body
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw URLError(.badServerResponse)
        }
        return data
    }

    private func cache(_ data: Data, forKey key: String) {
        defaults.set(data, forKey: "cache_\(key)")
        defaults.set(Date().timeIntervalSince1970, forKey: "cache_\(key)_time")
    }
}

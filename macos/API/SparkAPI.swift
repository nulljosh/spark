import Foundation

enum APIError: LocalizedError, Equatable {
    case invalidURL
    case badResponse(Int)
    case decodingError(String)
    case serverError(String)
    case unauthorized
    case rateLimited

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .badResponse(let code): return "Server returned \(code)"
        case .decodingError(let msg): return "Decode error: \(msg)"
        case .serverError(let msg): return msg
        case .unauthorized: return "Session expired. Please sign in again."
        case .rateLimited: return "Too many requests. Try again shortly."
        }
    }
}

protocol SparkAPIProtocol: Sendable {
    func login(username: String, password: String) async throws -> AuthResponse
    func register(username: String, email: String?, password: String) async throws -> AuthResponse
    func deleteAccount() async throws
    func fetchPosts() async throws -> [Post]
    func createPost(title: String, content: String, category: String, linkedRepo: String?) async throws -> Post
    func vote(postId: String, type: String) async throws
    func deletePost(id: String) async throws
    func requestEnrichment(postId: String) async throws
    func fetchIdeaBases() async throws -> [IdeaBase]
    func createIdeaBase(topic: String, description: String?) async throws -> IdeaBase
    func fetchRfs() async throws -> [RFSEntry]
    func saveToken(_ token: String)
    func loadToken() -> String?
    func clearToken()
}

final class SparkAPI: SparkAPIProtocol, Sendable {
    static let shared = SparkAPI()

    static let unauthorizedNotification = Notification.Name("SparkAPIUnauthorized")

    private let baseURL = "https://sparkjar.heyitsmejosh.com"
    private let tokenKey = "spark_jwt"
    private let session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        session = URLSession(configuration: config)
    }

    // MARK: - Token

    func saveToken(_ token: String) {
        guard let data = token.data(using: .utf8) else { return }
        KeychainHelper.save(key: tokenKey, data: data)
    }

    func loadToken() -> String? {
        guard let data = KeychainHelper.load(key: tokenKey) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func clearToken() {
        KeychainHelper.delete(key: tokenKey)
    }

    // MARK: - Request helpers

    private func url(_ path: String) throws -> URL {
        guard let url = URL(string: baseURL + path) else { throw APIError.invalidURL }
        return url
    }

    private func request(_ path: String, method: String = "GET", body: Data? = nil, auth: Bool = false) throws -> URLRequest {
        var req = URLRequest(url: try url(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if auth, let token = loadToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = body
        return req
    }

    private func validated(_ req: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.badResponse(0) }

        if http.statusCode == 401 {
            NotificationCenter.default.post(name: Self.unauthorizedNotification, object: nil)
            throw APIError.unauthorized
        }

        if http.statusCode == 429 {
            throw APIError.rateLimited
        }

        guard (200...299).contains(http.statusCode) else {
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let msg = json["error"] as? String {
                throw APIError.serverError(msg)
            }
            throw APIError.badResponse(http.statusCode)
        }
        return data
    }

    private func perform<T: Decodable>(_ req: URLRequest) async throws -> T {
        let data = try await validated(req)
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error.localizedDescription)
        }
    }

    private func performVoid(_ req: URLRequest) async throws {
        _ = try await validated(req)
    }

    private func encodedId(_ id: String) throws -> String {
        guard let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
            throw APIError.invalidURL
        }
        return encoded
    }

    // MARK: - Auth

    func login(username: String, password: String) async throws -> AuthResponse {
        let body = try JSONSerialization.data(withJSONObject: ["username": username, "password": password])
        let req = try request("/api/auth/login", method: "POST", body: body)
        let result: AuthResponse = try await perform(req)
        saveToken(result.token)
        return result
    }

    func register(username: String, email: String?, password: String) async throws -> AuthResponse {
        var payload: [String: String] = ["username": username, "password": password]
        if let email, !email.isEmpty { payload["email"] = email }
        let body = try JSONSerialization.data(withJSONObject: payload)
        let req = try request("/api/auth/register", method: "POST", body: body)
        let result: AuthResponse = try await perform(req)
        saveToken(result.token)
        return result
    }

    func deleteAccount() async throws {
        let req = try request("/api/auth?action=delete-account", method: "POST", auth: true)
        try await performVoid(req)
        clearToken()
    }

    // MARK: - Posts

    func fetchPosts() async throws -> [Post] {
        let req = try request("/api/posts")
        let result: PostsResponse = try await perform(req)
        return result.posts
    }

    func createPost(title: String, content: String, category: String, linkedRepo: String? = nil) async throws -> Post {
        var payload: [String: String] = ["title": title, "content": content, "category": category]
        if let repo = linkedRepo, !repo.isEmpty { payload["linked_repo"] = repo }
        let body = try JSONSerialization.data(withJSONObject: payload)
        let req = try request("/api/posts", method: "POST", body: body, auth: true)
        struct Resp: Decodable { let post: Post }
        let result: Resp = try await perform(req)
        return result.post
    }

    func vote(postId: String, type: String) async throws {
        let id = try encodedId(postId)
        let payload = ["voteType": type]
        let body = try JSONSerialization.data(withJSONObject: payload)
        let req = try request("/api/posts/\(id)/vote", method: "POST", body: body, auth: true)
        try await performVoid(req)
    }

    func deletePost(id: String) async throws {
        let req = try request("/api/posts/\(try encodedId(id))", method: "DELETE", auth: true)
        try await performVoid(req)
    }

    // MARK: - AI

    func requestEnrichment(postId: String) async throws {
        let payload = ["id": postId]
        let body = try JSONSerialization.data(withJSONObject: payload)
        let req = try request("/api/ai?type=enrich", method: "POST", body: body, auth: true)
        try await performVoid(req)
    }

    func fetchIdeaBases() async throws -> [IdeaBase] {
        let req = try request("/api/ai?type=idea-base")
        struct Resp: Decodable { let ideaBases: [IdeaBase] }
        let result: Resp = try await perform(req)
        return result.ideaBases
    }

    func createIdeaBase(topic: String, description: String? = nil) async throws -> IdeaBase {
        var payload: [String: String] = ["topic": topic]
        if let d = description, !d.isEmpty { payload["description"] = d }
        let body = try JSONSerialization.data(withJSONObject: payload)
        let req = try request("/api/ai?type=idea-base", method: "POST", body: body, auth: true)
        struct Resp: Decodable { let ideaBase: IdeaBase }
        let result: Resp = try await perform(req)
        return result.ideaBase
    }

    func fetchRfs() async throws -> [RFSEntry] {
        let req = try request("/api/ai?type=rfs")
        struct Resp: Decodable { let rfs: [RFSEntry] }
        let result: Resp = try await perform(req)
        return result.rfs
    }
}

private struct PostsResponse: Decodable {
    let posts: [Post]
    let mode: String?
}

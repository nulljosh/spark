import Foundation

struct SparkWidgetAPI {
    static let baseURL = "https://sparkjar.heyitsmejosh.com"
    private nonisolated(unsafe) static let defaults = UserDefaults(suiteName: "group.com.jt.spark")

    private static var session: URLSession {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 15
        return URLSession(configuration: config)
    }

    // MARK: - Posts

    static func fetchPosts() async throws -> [WidgetPost] {
        let data = try await fetch("/api/posts")
        let response = try JSONDecoder().decode(PostsAPIResponse.self, from: data)
        cache(data, forKey: "posts")
        return response.posts
    }

    static func cachedPosts() -> [WidgetPost] {
        guard let data = defaults?.data(forKey: "widget_posts") else { return [] }
        return (try? JSONDecoder().decode(PostsAPIResponse.self, from: data))?.posts ?? []
    }

    // MARK: - Stats (derived from posts)

    static func computeStats(from posts: [WidgetPost]) -> SparkStats {
        let totalPosts = posts.count
        let totalVotes = posts.reduce(0) { $0 + $1.score }
        let uniqueAuthors = Set(posts.compactMap { $0.author?.username })
        return SparkStats(totalPosts: totalPosts, totalVotes: totalVotes, activeUsers: uniqueAuthors.count)
    }

    static func cachedStats() -> SparkStats {
        let posts = cachedPosts()
        guard !posts.isEmpty else { return .empty }
        return computeStats(from: posts)
    }

    // MARK: - Sorted accessors

    static func hotPosts(from posts: [WidgetPost]) -> [WidgetPost] {
        posts.sorted { $0.score > $1.score }
    }

    static func newPosts(from posts: [WidgetPost]) -> [WidgetPost] {
        posts.sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
    }

    // MARK: - Internal

    private static func fetch(_ path: String) async throws -> Data {
        guard let url = URL(string: baseURL + path) else {
            throw URLError(.badURL)
        }
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw URLError(.badServerResponse)
        }
        return data
    }

    private static func cache(_ data: Data, forKey key: String) {
        defaults?.set(data, forKey: "widget_\(key)")
        defaults?.set(Date().timeIntervalSince1970, forKey: "widget_\(key)_time")
    }
}

// MARK: - Wire type

private struct PostsAPIResponse: Codable {
    let posts: [WidgetPost]
    let mode: String?
}

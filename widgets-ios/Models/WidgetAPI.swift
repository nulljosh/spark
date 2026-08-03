import Foundation

struct WidgetAPI {
    static let baseURL = "https://sparkjar.heyitsmejosh.com"
    private static nonisolated(unsafe) let defaults = UserDefaults(suiteName: "group.com.jt.spark")

    private static var session: URLSession {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 15
        return URLSession(configuration: config)
    }

    // MARK: - Hot Posts

    static func fetchHotPosts() async throws -> [SparkPost] {
        let data = try await fetch("/api/posts?sort=hot&limit=3")
        let posts = try JSONDecoder().decode([SparkPost].self, from: data)
        cache(data, forKey: "hot_posts")
        return posts
    }

    static func cachedHotPosts() -> [SparkPost] {
        guard let data = defaults?.data(forKey: "widget_hot_posts") else { return [] }
        return (try? JSONDecoder().decode([SparkPost].self, from: data)) ?? []
    }

    // MARK: - New Posts

    static func fetchNewPosts() async throws -> [SparkPost] {
        let data = try await fetch("/api/posts?sort=new&limit=3")
        let posts = try JSONDecoder().decode([SparkPost].self, from: data)
        cache(data, forKey: "new_posts")
        return posts
    }

    static func cachedNewPosts() -> [SparkPost] {
        guard let data = defaults?.data(forKey: "widget_new_posts") else { return [] }
        return (try? JSONDecoder().decode([SparkPost].self, from: data)) ?? []
    }

    // MARK: - Stats

    static func fetchStats() async throws -> SparkStats {
        let data = try await fetch("/api/posts?limit=1000")
        let posts = try JSONDecoder().decode([SparkPost].self, from: data)
        let stats = SparkStats(totalPosts: posts.count, yourPosts: 0)
        cache(data, forKey: "stats")
        return stats
    }

    static func cachedStats() -> SparkStats {
        guard let data = defaults?.data(forKey: "widget_stats") else {
            return SparkStats(totalPosts: 0, yourPosts: 0)
        }
        let posts = (try? JSONDecoder().decode([SparkPost].self, from: data)) ?? []
        return SparkStats(totalPosts: posts.count, yourPosts: 0)
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

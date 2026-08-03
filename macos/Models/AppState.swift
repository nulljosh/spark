import Foundation
import Observation

@MainActor
@Observable
final class AppState {
    var user: AuthResponse?
    var posts: [Post] = []
    var showAuth: Bool = false
    var isLoading: Bool = false
    var isFeedLoading: Bool = false
    var error: String?
    var errorBanner: String?

    var isLoggedIn: Bool { user != nil }

    private(set) var votingPostIds: Set<String> = []

    private static let userCacheKey = "spark_auth_user"
    private var lastVoteTimes: [String: Date] = [:]
    private let voteDebounceInterval: TimeInterval = 0.5

    private var unauthorizedObserver: (any NSObjectProtocol)?

    let api: SparkAPIProtocol

    init(api: SparkAPIProtocol = SparkAPI.shared) {
        self.api = api
        restoreSession()
        observeUnauthorized()
    }

    private func observeUnauthorized() {
        unauthorizedObserver = NotificationCenter.default.addObserver(
            forName: SparkAPI.unauthorizedNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.handleUnauthorized()
            }
        }
    }

    private func handleUnauthorized() {
        api.clearToken()
        KeychainHelper.delete(key: Self.userCacheKey)
        user = nil
        posts = []
        showAuth = true
        errorBanner = "Session expired. Please sign in again."
    }

    func login(username: String, password: String) async {
        await authenticate {
            try await self.api.login(username: username, password: password)
        }
    }

    func register(username: String, email: String?, password: String) async {
        await authenticate {
            try await self.api.register(username: username, email: email, password: password)
        }
    }

    func logout() {
        api.clearToken()
        KeychainHelper.delete(key: Self.userCacheKey)
        user = nil
        posts = []
        errorBanner = nil
    }

    func deleteAccount() async -> Bool {
        do {
            try await api.deleteAccount()
            logout()
            return true
        } catch {
            errorBanner = error.localizedDescription
            return false
        }
    }

    func loadPosts() async {
        isFeedLoading = true
        do {
            posts = try await api.fetchPosts()
            errorBanner = nil
        } catch let apiError as APIError where apiError == .unauthorized {
            // handled by notification observer
        } catch {
            errorBanner = error.localizedDescription
        }
        isFeedLoading = false
    }

    @discardableResult
    func createPost(title: String, content: String, category: String, linkedRepo: String? = nil) async throws -> Post {
        let post = try await api.createPost(title: title, content: content, category: category, linkedRepo: linkedRepo)
        posts.insert(post, at: 0)
        return post
    }

    func requestEnrichment(postId: String) async {
        do {
            try await api.requestEnrichment(postId: postId)
        } catch {
            errorBanner = error.localizedDescription
        }
    }

    func exportPostURL(postId: String) -> URL {
        URL(string: "https://sparkjar.heyitsmejosh.com/api/ai?type=notes&id=\(postId)")!
    }

    func fetchIdeaBases() async throws -> [IdeaBase] {
        try await api.fetchIdeaBases()
    }

    func createIdeaBase(topic: String, description: String? = nil) async throws -> IdeaBase {
        try await api.createIdeaBase(topic: topic, description: description)
    }

    func fetchRfs() async throws -> [RFSEntry] {
        try await api.fetchRfs()
    }

    func deletePost(id: String) async throws {
        try await api.deletePost(id: id)
        posts.removeAll { $0.id == id }
    }

    func vote(postId: String, type: String) async {
        let now = Date()
        if let last = lastVoteTimes[postId], now.timeIntervalSince(last) < voteDebounceInterval {
            return
        }
        lastVoteTimes[postId] = now

        guard !votingPostIds.contains(postId) else { return }
        votingPostIds.insert(postId)

        let originalPosts = posts
        if let idx = posts.firstIndex(where: { $0.id == postId }) {
            let delta = type == "up" ? 1 : -1
            let old = posts[idx]
            posts[idx] = Post(
                id: old.id,
                title: old.title,
                content: old.content,
                category: old.category,
                score: old.score + delta,
                author: old.author,
                createdAt: old.createdAt,
                enriched: old.enriched,
                enrichmentSpec: old.enrichmentSpec,
                enrichmentPlan: old.enrichmentPlan,
                linkedRepo: old.linkedRepo
            )
        }

        do {
            try await api.vote(postId: postId, type: type)
        } catch let apiError as APIError where apiError == .unauthorized {
            posts = originalPosts
        } catch {
            posts = originalPosts
            self.errorBanner = error.localizedDescription
        }

        votingPostIds.remove(postId)
    }

    func dismissError() {
        errorBanner = nil
    }

    // MARK: - Private

    private func restoreSession() {
        guard let token = api.loadToken(), !token.isEmpty else { return }
        guard let data = KeychainHelper.load(key: Self.userCacheKey),
              let saved = try? JSONDecoder().decode(AuthResponse.self, from: data) else { return }
        user = saved
    }

    private func authenticate(_ action: () async throws -> AuthResponse) async {
        isLoading = true
        error = nil
        do {
            let auth = try await action()
            user = auth
            persistUser(auth)
            showAuth = false
            await loadPosts()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    private func persistUser(_ auth: AuthResponse) {
        if let data = try? JSONEncoder().encode(auth) {
            KeychainHelper.save(key: Self.userCacheKey, data: data)
        }
    }
}

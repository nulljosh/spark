import Foundation
@testable import Spark

final class MockSparkAPI: SparkAPIProtocol, @unchecked Sendable {
    var loginResult: Result<AuthResponse, Error> = .success(
        AuthResponse(token: "mock_token", username: "testuser", userId: "uid1")
    )
    var registerResult: Result<AuthResponse, Error> = .success(
        AuthResponse(token: "mock_token", username: "newuser", userId: "uid2")
    )
    var appleSignInResult: Result<AuthResponse, Error> = .success(
        AuthResponse(token: "mock_token", username: "appleuser", userId: "uid3")
    )
    var fetchPostsResult: Result<[Post], Error> = .success([])
    var createPostResult: Result<Post, Error> = .success(
        Post(id: "new1", title: "New", content: "Body", category: "Tech", score: 0, author: Post.Author(username: "testuser"), createdAt: nil)
    )
    var voteResult: Result<Void, Error> = .success(())
    var deletePostResult: Result<Void, Error> = .success(())
    var fetchCommentsResult: Result<[Comment], Error> = .success([])
    var addCommentResult: Result<Comment, Error> = .success(
        Comment(id: "c1", postId: "p1", userId: "uid1", username: "testuser", content: "Test comment", createdAt: nil)
    )
    var fetchCommentCountsResult: Result<[String: Int], Error> = .success([:])
    var fetchUserProfileResult: Result<UserProfile, Error> = .success(
        UserProfile(username: "testuser", createdAt: nil, posts: [])
    )
    var fetchRfsResult: Result<[RFSEntry], Error> = .success([])

    var savedToken: String?
    var tokenCleared = false
    var loginCallCount = 0
    var registerCallCount = 0
    var appleSignInCallCount = 0
    var fetchPostsCallCount = 0
    var createPostCallCount = 0
    var voteCallCount = 0
    var deleteCallCount = 0
    var fetchCommentsCallCount = 0
    var addCommentCallCount = 0
    var fetchCommentCountsCallCount = 0
    var fetchUserProfileCallCount = 0

    var lastVotePostId: String?
    var lastVoteType: String?
    var lastCommentPostId: String?
    var lastCommentContent: String?
    var lastDeleteId: String?

    func login(username: String, password: String) async throws -> AuthResponse {
        loginCallCount += 1
        return try loginResult.get()
    }

    func register(username: String, email: String?, password: String) async throws -> AuthResponse {
        registerCallCount += 1
        return try registerResult.get()
    }

    func appleSignIn(identityToken: String, givenName: String?, familyName: String?, email: String?) async throws -> AuthResponse {
        appleSignInCallCount += 1
        return try appleSignInResult.get()
    }

    func fetchPosts() async throws -> [Post] {
        fetchPostsCallCount += 1
        return try fetchPostsResult.get()
    }

    func createPost(title: String, content: String, category: String) async throws -> Post {
        createPostCallCount += 1
        return try createPostResult.get()
    }

    func vote(postId: String, type: String) async throws {
        voteCallCount += 1
        lastVotePostId = postId
        lastVoteType = type
        try voteResult.get()
    }

    func deletePost(id: String) async throws {
        deleteCallCount += 1
        lastDeleteId = id
        try deletePostResult.get()
    }

    func fetchComments(postId: String) async throws -> [Comment] {
        fetchCommentsCallCount += 1
        return try fetchCommentsResult.get()
    }

    func addComment(postId: String, content: String) async throws -> Comment {
        addCommentCallCount += 1
        lastCommentPostId = postId
        lastCommentContent = content
        return try addCommentResult.get()
    }

    func fetchCommentCounts(postIds: [String]) async throws -> [String: Int] {
        fetchCommentCountsCallCount += 1
        return try fetchCommentCountsResult.get()
    }

    func fetchUserProfile(username: String) async throws -> UserProfile {
        fetchUserProfileCallCount += 1
        return try fetchUserProfileResult.get()
    }

    func fetchRfs() async throws -> [RFSEntry] {
        return try fetchRfsResult.get()
    }

    func saveToken(_ token: String) {
        savedToken = token
    }

    func loadToken() -> String? {
        return savedToken
    }

    func clearToken() {
        savedToken = nil
        tokenCleared = true
    }
}

package com.nulljosh.sparkjar

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class Author(val username: String, val userId: String)

@Serializable
data class Post(
    val id: String,
    val title: String,
    val content: String = "",
    val category: String = "tech",
    val author: Author,
    val score: Int = 0,
    val createdAt: String = "",
    val pinned: Boolean = false,
)

@Serializable
private data class PostsResponse(val posts: List<Post>)

@Serializable
private data class PostResponse(val post: Post)

// Scope: read-only. Browsing posts needs no account -- api/posts.js's GET
// routes are public. Posting/commenting/voting are session-cookie
// auth-gated (api/auth.js) and are a separate, real login-flow decision,
// not attempted here. See roadmap.md.
class SparkjarClient(private val baseUrl: String = "https://sparkjar.heyitsmejosh.com") {
    private val http = HttpClient {
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
    }

    suspend fun posts(limit: Int = 30): List<Post> =
        http.get("$baseUrl/api/posts") { parameter("limit", limit) }.body<PostsResponse>().posts

    suspend fun post(id: String): Post = http.get("$baseUrl/api/posts") { parameter("id", id) }.body<PostResponse>().post
}

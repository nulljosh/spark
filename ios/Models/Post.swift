import Foundation

struct Post: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    /// Optional because the feed endpoint (`GET /api/posts`) deliberately
    /// omits it — see api/posts.js, "Only fetch columns needed for the feed
    /// list view (no content)". Declaring it non-optional made every feed
    /// load throw `keyNotFound`, which is what App Review saw as an error
    /// message on launch (Guideline 2.1(a)). The detail fetch supplies it.
    let content: String?
    let category: String
    let score: Int
    let author: Author?
    let createdAt: String?
    // LLM enrichment
    let enriched: Bool?
    let enrichmentSpec: String?
    let enrichmentPlan: String?
    let linkedRepo: String?
    let enrichmentRequestedAt: String?

    struct Author: Codable, Hashable {
        let username: String
    }
}

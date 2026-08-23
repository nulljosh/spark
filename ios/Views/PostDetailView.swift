import SwiftUI

struct PostDetailView: View {
    @Environment(AppState.self) private var appState
    let post: Post

    private var currentPost: Post {
        appState.posts.first(where: { $0.id == post.id }) ?? post
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 10) {
                    CategoryBadge(category: currentPost.category)
                    Spacer()
                    if let createdAt = currentPost.createdAt {
                        Text(relativeDate(createdAt))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Text(currentPost.title)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 8) {
                    Image(systemName: "person.crop.circle")
                        .foregroundStyle(.secondary)
                    Text(currentPost.author?.username ?? "Unknown")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if currentPost.enriched == true {
                        Image(systemName: "sparkles")
                            .font(.caption)
                            .foregroundStyle(.green)
                    } else if currentPost.enrichmentRequestedAt != nil {
                        Image(systemName: "clock")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }

                if let repo = currentPost.linkedRepo, let url = URL(string: repo) {
                    Link(destination: url) {
                        Label(repo, systemImage: "arrow.up.right.square")
                            .font(.caption)
                            .foregroundStyle(.blue)
                            .lineLimit(1)
                    }
                }

                Divider()

                Text(currentPost.content ?? "")
                    .font(.body)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)

                // LLM enrichment panels
                if let spec = currentPost.enrichmentSpec, !spec.isEmpty {
                    Divider()
                    VStack(alignment: .leading, spacing: 8) {
                        Text("SPEC")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(spec)
                            .font(.callout)
                            .foregroundStyle(.primary)
                    }
                }

                if let plan = currentPost.enrichmentPlan, !plan.isEmpty {
                    Divider()
                    VStack(alignment: .leading, spacing: 8) {
                        Text("PLAN")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text(plan)
                            .font(.callout)
                            .foregroundStyle(.primary)
                    }
                }

                Divider()

                HStack(spacing: 14) {
                    VoteButton(label: "up", icon: "arrow.up", postId: currentPost.id)
                    Text("\(currentPost.score)")
                        .font(.title3.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.primary)
                        .contentTransition(.numericText(value: Double(currentPost.score)))
                        .animation(.spring(duration: 0.3), value: currentPost.score)
                    VoteButton(label: "down", icon: "arrow.down", postId: currentPost.id)
                    Spacer()
                    ScoreBadge(score: currentPost.score)
                }

                Divider()

                CommentsView(postId: currentPost.id)
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if appState.isLoggedIn && !(currentPost.enriched ?? false) && currentPost.enrichmentRequestedAt == nil {
                    Button {
                        Task { try? await appState.requestEnrichment(postId: currentPost.id) }
                    } label: {
                        Image(systemName: "wand.and.stars")
                    }
                }
                ShareLink(item: "\(currentPost.title)\n\n\(currentPost.content ?? "")") {
                    Image(systemName: "square.and.arrow.up")
                }
            }
        }
    }

    private func relativeDate(_ iso: String) -> String {
        DateFormatting.relativeDate(iso)
    }
}

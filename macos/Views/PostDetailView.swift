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
                    if currentPost.enriched == true {
                        Label("AI Enhanced", systemImage: "sparkles")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color.sparkBlue)
                    } else if currentPost.enriched == nil || currentPost.enriched == false {
                        EmptyView()
                    }
                    Spacer()
                    if let createdAt = currentPost.createdAt {
                        Text(relativeDate(createdAt))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Text(currentPost.title)
                    .font(.title2.weight(.bold))
                    .textSelection(.enabled)

                HStack(spacing: 8) {
                    Image(systemName: "person.crop.circle")
                        .foregroundStyle(.secondary)
                    Text(currentPost.author?.username ?? "Unknown")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                if let repo = currentPost.linkedRepo, !repo.isEmpty, let url = URL(string: repo) {
                    Link(destination: url) {
                        Label(repo, systemImage: "chevron.left.forwardslash.chevron.right")
                            .font(.caption)
                            .foregroundStyle(Color.sparkBlue)
                            .lineLimit(1)
                    }
                }

                Divider()

                Text(currentPost.content ?? "")
                    .font(.body)
                    .textSelection(.enabled)

                if currentPost.enriched == true {
                    if let spec = currentPost.enrichmentSpec {
                        Divider()
                        VStack(alignment: .leading, spacing: 6) {
                            Text("SPEC")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Text(spec)
                                .font(.caption)
                                .textSelection(.enabled)
                        }
                    }
                    if let plan = currentPost.enrichmentPlan {
                        Divider()
                        VStack(alignment: .leading, spacing: 6) {
                            Text("PLAN")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            Text(plan)
                                .font(.caption)
                                .textSelection(.enabled)
                        }
                    }
                }

                Divider()

                HStack(spacing: 14) {
                    VoteButton(label: "up", icon: "arrow.up", postId: currentPost.id)
                    Text("\(currentPost.score)")
                        .font(.title3.monospacedDigit().weight(.semibold))
                        .contentTransition(.numericText(value: Double(currentPost.score)))
                        .animation(.spring(duration: 0.3), value: currentPost.score)
                    VoteButton(label: "down", icon: "arrow.down", postId: currentPost.id)
                    Spacer()

                    if appState.isLoggedIn && currentPost.enriched != true {
                        Button {
                            Task { await appState.requestEnrichment(postId: currentPost.id) }
                        } label: {
                            Label("Enrich", systemImage: "wand.and.stars")
                                .font(.caption)
                        }
                        .buttonStyle(.bordered)
                        .help("Request AI write-up")
                    }

                    if currentPost.enriched == true {
                        Link(destination: appState.exportPostURL(postId: currentPost.id)) {
                            Label("Export", systemImage: "arrow.down.doc")
                                .font(.caption)
                        }
                        .buttonStyle(.bordered)
                        .help("Export as markdown")
                    }

                    if canDelete {
                        Button(role: .destructive) {
                            Task {
                                do {
                                    try await appState.deletePost(id: currentPost.id)
                                } catch {
                                    appState.errorBanner = error.localizedDescription
                                }
                            }
                        } label: {
                            Image(systemName: "trash")
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.plain)
                        .help("Delete post")
                    }

                    ShareLink(item: "\(currentPost.title)\n\n\(currentPost.content ?? "")") {
                        Image(systemName: "square.and.arrow.up")
                    }
                }
            }
            .padding(24)
        }
    }

    private var canDelete: Bool {
        guard let username = appState.user?.username else { return false }
        return currentPost.author?.username == username
    }
}

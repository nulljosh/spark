import SwiftUI

struct PostDetailView: View {
    let post: WatchPost
    @State private var currentScore: Int
    @State private var isVoting = false
    @State private var votedUp = false
    @State private var votedDown = false

    init(post: WatchPost) {
        self.post = post
        _currentScore = State(initialValue: post.score)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                // Category badge
                Text(post.category.uppercased())
                    .font(.system(size: 9, weight: .bold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.sparkBlue.opacity(0.25), in: Capsule())
                    .foregroundStyle(Color.sparkBlue)

                // Title
                Text(post.title)
                    .font(.headline)
                    .fixedSize(horizontal: false, vertical: true)

                // Author + time
                HStack(spacing: 4) {
                    if let author = post.author {
                        Image(systemName: "person.circle")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text(author.username)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if let date = post.createdAt {
                        Text(relativeDate(date))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }

                Divider()

                // Content
                Text(post.content ?? "")
                    .font(.caption)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)

                Divider()

                // Vote controls
                HStack(spacing: 16) {
                    Spacer()

                    Button {
                        Task { await vote("up") }
                    } label: {
                        Image(systemName: votedUp ? "arrow.up.circle.fill" : "arrow.up.circle")
                            .font(.title3)
                            .foregroundStyle(votedUp ? Color.sparkBlue : .secondary)
                    }
                    .buttonStyle(.plain)
                    .disabled(isVoting || !WatchAPI.shared.isLoggedIn)

                    Text("\(currentScore)")
                        .font(.title3.monospacedDigit().bold())
                        .contentTransition(.numericText(value: Double(currentScore)))
                        .animation(.spring(duration: 0.3), value: currentScore)

                    Button {
                        Task { await vote("down") }
                    } label: {
                        Image(systemName: votedDown ? "arrow.down.circle.fill" : "arrow.down.circle")
                            .font(.title3)
                            .foregroundStyle(votedDown ? Color.loss : .secondary)
                    }
                    .buttonStyle(.plain)
                    .disabled(isVoting || !WatchAPI.shared.isLoggedIn)

                    Spacer()
                }
                .padding(.vertical, 4)

                if !WatchAPI.shared.isLoggedIn {
                    Text("Sign in to vote")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func vote(_ type: String) async {
        isVoting = true
        let delta = type == "up" ? 1 : -1
        currentScore += delta

        if type == "up" { votedUp = true; votedDown = false }
        else { votedDown = true; votedUp = false }

        do {
            try await WatchAPI.shared.vote(postId: post.id, type: type)
        } catch {
            currentScore -= delta
            if type == "up" { votedUp = false }
            else { votedDown = false }
        }
        isVoting = false
    }

    // MARK: - Date formatting

    private static let isoFormatter: ISO8601DateFormatter = {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fmt
    }()

    private static let isoFormatterNoFraction: ISO8601DateFormatter = {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime]
        return fmt
    }()

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let fmt = RelativeDateTimeFormatter()
        fmt.unitsStyle = .abbreviated
        return fmt
    }()

    private func relativeDate(_ iso: String) -> String {
        guard let date = Self.isoFormatter.date(from: iso)
                ?? Self.isoFormatterNoFraction.date(from: iso) else { return "" }
        return Self.relativeFormatter.localizedString(for: date, relativeTo: Date())
    }
}

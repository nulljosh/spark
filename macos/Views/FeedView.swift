import SwiftUI

enum SortMode: String, CaseIterable {
    case hot = "Hot"
    case new = "New"
}

struct FeedView: View {
    @Environment(AppState.self) private var appState
    @State private var selectedCategory = "All"
    @State private var searchText = ""
    @State private var sortMode: SortMode = .hot
    @State private var selectedPost: Post?

    private let categories = ["All", "Technology", "Design", "Business", "Science", "Other"]

    private var filteredPosts: [Post] {
        var result = appState.posts.filter { post in
            matchesCategory(post.category) && matchesSearch(post)
        }
        switch sortMode {
        case .hot:
            break // API default sort
        case .new:
            result.sort { a, b in
                (a.createdAt ?? "") > (b.createdAt ?? "")
            }
        }
        return result
    }

    private func matchesCategory(_ category: String) -> Bool {
        guard selectedCategory != "All" else { return true }
        switch selectedCategory {
        case "Technology":
            return category.caseInsensitiveCompare("Technology") == .orderedSame ||
                category.caseInsensitiveCompare("Tech") == .orderedSame
        default:
            return category.caseInsensitiveCompare(selectedCategory) == .orderedSame
        }
    }

    private func matchesSearch(_ post: Post) -> Bool {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return true }
        return post.title.localizedCaseInsensitiveContains(query) ||
            post.content?.localizedCaseInsensitiveContains(query) == true ||
            post.category.localizedCaseInsensitiveContains(query) ||
            (post.author?.username.localizedCaseInsensitiveContains(query) ?? false)
    }

    var body: some View {
        NavigationSplitView {
            VStack(spacing: 0) {
                // Toolbar bar
                HStack(spacing: 8) {
                    Picker("Sort", selection: $sortMode) {
                        ForEach(SortMode.allCases, id: \.self) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 120)

                    Spacer()

                    Menu {
                        ForEach(categories, id: \.self) { category in
                            Button {
                                selectedCategory = category
                            } label: {
                                HStack {
                                    Text(category)
                                    if selectedCategory == category {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "line.3.horizontal.decrease.circle")
                            Text(selectedCategory)
                                .font(.caption)
                        }
                    }
                    .menuStyle(.borderlessButton)
                    .fixedSize()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)

                Divider()

                if appState.isFeedLoading && appState.posts.isEmpty {
                    VStack {
                        Spacer()
                        ProgressView("Loading posts...")
                        Spacer()
                    }
                    .frame(maxWidth: .infinity)
                } else if appState.posts.isEmpty {
                    VStack(spacing: 8) {
                        Spacer()
                        Image(systemName: "flame")
                            .font(.largeTitle)
                            .foregroundStyle(.secondary)
                        Text("No posts yet")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                        Text("Be the first to share an idea.")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity)
                } else if filteredPosts.isEmpty {
                    VStack(spacing: 8) {
                        Spacer()
                        Image(systemName: "magnifyingglass")
                            .font(.largeTitle)
                            .foregroundStyle(.secondary)
                        Text("No matches")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .frame(maxWidth: .infinity)
                } else {
                    List(filteredPosts, selection: $selectedPost) { post in
                        PostRow(post: post)
                            .tag(post)
                    }
                    .listStyle(.inset(alternatesRowBackgrounds: true))
                }
            }
            .navigationSplitViewColumnWidth(min: 280, ideal: 340, max: 500)
            .searchable(text: $searchText, prompt: "Search posts")
        } detail: {
            if let post = selectedPost {
                PostDetailView(post: post)
            } else {
                Text("Select a post")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Spark")
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button {
                    Task { await appState.loadPosts() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .help("Refresh (Cmd-R)")
            }
            ToolbarItem(placement: .automatic) {
                if appState.isLoggedIn {
                    Button {
                        appState.logout()
                    } label: {
                        Image(systemName: "person.fill.checkmark")
                            .foregroundStyle(Color.sparkBlue)
                    }
                    .help("Signed in as \(appState.user?.username ?? "")")
                } else {
                    Button("Sign In") {
                        appState.showAuth = true
                    }
                    .tint(.sparkBlue)
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .refreshFeed)) { _ in
            Task { await appState.loadPosts() }
        }
        .task { await appState.loadPosts() }
    }
}

// MARK: - Post Row

struct PostRow: View {
    @Environment(AppState.self) private var appState
    let post: Post

    private var currentPost: Post {
        appState.posts.first(where: { $0.id == post.id }) ?? post
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                CategoryBadge(category: currentPost.category)
                Spacer()
                if let author = currentPost.author {
                    Text(author.username)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Text(currentPost.title)
                .font(.headline)
                .lineLimit(2)

            Text(currentPost.content ?? "")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            HStack(spacing: 10) {
                VoteButton(label: "up", icon: "arrow.up", postId: currentPost.id)
                Text("\(currentPost.score)")
                    .font(.subheadline.monospacedDigit())
                    .contentTransition(.numericText(value: Double(currentPost.score)))
                    .animation(.spring(duration: 0.3), value: currentPost.score)
                VoteButton(label: "down", icon: "arrow.down", postId: currentPost.id)
                Spacer()
                if let date = currentPost.createdAt {
                    Text(relativeDate(date))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Vote Button

struct VoteButton: View {
    @Environment(AppState.self) private var appState
    let label: String
    let icon: String
    let postId: String

    private var isVoting: Bool {
        appState.votingPostIds.contains(postId)
    }

    var body: some View {
        Button {
            Task { await appState.vote(postId: postId, type: label) }
        } label: {
            if isVoting {
                ProgressView()
                    .controlSize(.small)
            } else {
                Image(systemName: icon)
                    .font(.subheadline)
                    .foregroundStyle(appState.isLoggedIn ? Color.sparkBlue : Color.secondary)
            }
        }
        .buttonStyle(.plain)
        .disabled(!appState.isLoggedIn || isVoting)
    }
}

// MARK: - Date Helpers

private nonisolated(unsafe) let isoFormatter: ISO8601DateFormatter = {
    let fmt = ISO8601DateFormatter()
    fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fmt
}()

private nonisolated(unsafe) let isoFormatterNoFraction: ISO8601DateFormatter = {
    let fmt = ISO8601DateFormatter()
    fmt.formatOptions = [.withInternetDateTime]
    return fmt
}()

private nonisolated(unsafe) let relativeFormatter: RelativeDateTimeFormatter = {
    let fmt = RelativeDateTimeFormatter()
    fmt.unitsStyle = .abbreviated
    return fmt
}()

func relativeDate(_ iso: String) -> String {
    guard let date = isoFormatter.date(from: iso)
        ?? isoFormatterNoFraction.date(from: iso) else { return "" }
    return relativeFormatter.localizedString(for: date, relativeTo: Date())
}

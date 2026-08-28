import AuthenticationServices
import LocalAuthentication
import SwiftUI
import UIKit

// MARK: - Root

struct ContentView: View {
    @Environment(AppState.self) private var appState
    @State private var selectedTab = 0

    var body: some View {
        @Bindable var appState = appState
        TabView(selection: $selectedTab) {
            FeedView()
                .tabItem { Label("Feed", systemImage: selectedTab == 0 ? "flame.fill" : "flame") }
                .tag(0)
                .toolbar(.hidden, for: .tabBar)
            CreateView(selectedTab: $selectedTab)
                .tabItem { Label("Create", systemImage: selectedTab == 1 ? "plus.circle.fill" : "plus.circle") }
                .tag(1)
                .toolbar(.hidden, for: .tabBar)
            ProfileView()
                .tabItem { Label("Profile", systemImage: selectedTab == 2 ? "person.circle.fill" : "person.circle") }
                .tag(2)
                .toolbar(.hidden, for: .tabBar)
            IdeaBaseView()
                .tabItem { Label("Ideas", systemImage: selectedTab == 3 ? "lightbulb.fill" : "lightbulb") }
                .tag(3)
                .toolbar(.hidden, for: .tabBar)
        }
        .toolbar(.hidden, for: .tabBar)
        .tint(.sparkBlue)
        .onChange(of: selectedTab) { _, _ in
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
        .sheet(isPresented: $appState.showAuth) {
            AuthSheet()
        }
        .overlay(alignment: .top) {
            if appState.errorBanner != nil {
                ErrorBanner()
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .padding(.top, 4)
            }
        }
        .overlay(alignment: .bottom) {
            SparkFloatingTabBar(selectedTab: $selectedTab)
                .padding(.bottom, 8)
        }
        .animation(.spring(duration: 0.3), value: appState.errorBanner != nil)
    }
}

// MARK: - Error Banner

struct ErrorBanner: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        if let msg = appState.errorBanner {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.white)
                Text(msg)
                    .font(.caption)
                    .foregroundStyle(.white)
                    .lineLimit(2)
                Spacer()
                Button {
                    appState.dismissError()
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption2.bold())
                        .foregroundStyle(.white.opacity(0.8))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.red.opacity(0.9), in: RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal, 16)
            .padding(.top, 4)
        }
    }
}

// MARK: - Feed

struct FeedView: View {
    @Environment(AppState.self) private var appState
    @State private var selectedCategory = "All"
    @State private var searchText = ""

    private let categories = ["All", "Technology", "Design", "Business", "Science", "Other"]

    private var filteredPosts: [Post] {
        appState.sortedPosts.filter { post in
            matchesCategory(post.category) && matchesSearch(post)
        }
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
        NavigationStack {
            Group {
                if appState.isFeedLoading && appState.posts.isEmpty {
                    VStack {
                        Spacer()
                        ProgressView("Loading posts...")
                        Spacer()
                    }
                } else if appState.posts.isEmpty {
                    ContentUnavailableView("No posts yet", systemImage: "flame", description: Text("Be the first to share an idea."))
                } else {
                    List {
                        categoryFilterBar
                            .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)

                        if filteredPosts.isEmpty {
                            ContentUnavailableView("No matches", systemImage: "magnifyingglass", description: Text("No posts match the current filter."))
                                .listRowSeparator(.hidden)
                                .listRowBackground(Color.clear)
                        } else {
                            ForEach(filteredPosts) { post in
                                NavigationLink(value: post) {
                                    PostCard(post: post)
                                }
                                .buttonStyle(.plain)
                                .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                                .listRowSeparator(.hidden)
                                .listRowBackground(Color.clear)
                            }
                        }
                    }
                    .listStyle(.plain)
                    .refreshable { await appState.loadPosts() }
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Spark")
            .searchable(text: $searchText, prompt: "Search posts")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    @Bindable var state = appState
                    Picker("Sort", selection: $state.sortMode) {
                        ForEach(AppState.SortMode.allCases, id: \.self) { mode in
                            Label(mode.rawValue, systemImage: mode == .hot ? "flame" : "clock")
                                .tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .fixedSize()
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    AuthButton()
                }
            }
            .navigationDestination(for: Post.self) { post in
                PostDetailView(post: post)
            }
            .task { await appState.loadPosts() }
        }
    }

    private var categoryFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(categories, id: \.self) { category in
                    Button {
                        selectedCategory = category
                    } label: {
                        Text(category)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(
                                selectedCategory == category ? Color.sparkBlue : Color.secondary.opacity(0.12),
                                in: Capsule()
                            )
                            .foregroundStyle(selectedCategory == category ? .white : .primary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
    }
}

struct PostCard: View {
    @Environment(AppState.self) private var appState
    let post: Post

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                CategoryBadge(category: post.category)
                Spacer()
                if let author = post.author {
                    Text(author.username)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Text(post.title)
                .font(.headline)
                .foregroundStyle(.primary)
                .lineLimit(2)

            Text(post.content ?? "")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(3)

            HStack(spacing: 12) {
                VoteButton(label: "up", icon: "arrow.up", postId: post.id)
                Text("\(post.score)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.primary)
                    .contentTransition(.numericText(value: Double(post.score)))
                    .animation(.spring(duration: 0.3), value: post.score)
                VoteButton(label: "down", icon: "arrow.down", postId: post.id)
                ScoreBadge(score: post.score)

                if post.enriched == true {
                    Image(systemName: "sparkles")
                        .font(.caption2)
                        .foregroundStyle(.green)
                        .accessibilityLabel("AI enriched")
                } else if post.enrichmentRequestedAt != nil {
                    Image(systemName: "clock")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                        .accessibilityLabel("Enrichment pending")
                }

                Spacer()

                if let count = appState.commentCounts[post.id], count > 0 {
                    Label("\(count)", systemImage: "bubble.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel("\(count) comment\(count == 1 ? "" : "s")")
                }
                if let date = post.createdAt {
                    Text(DateFormatting.relativeDate(date))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(14)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(post.title) by \(post.author?.username ?? "unknown"), \(post.score) votes, \(post.category)")
    }

}

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
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            Task { await appState.vote(postId: postId, type: label) }
        } label: {
            if isVoting {
                ProgressView()
                    .controlSize(.mini)
            } else {
                Image(systemName: icon)
                    .font(.subheadline)
                    .foregroundStyle(appState.isLoggedIn ? Color.sparkBlue : Color.secondary)
                    .symbolEffect(.bounce, value: isVoting)
            }
        }
        .buttonStyle(.plain)
        .disabled(!appState.isLoggedIn || isVoting)
        .accessibilityLabel("Vote \(label)")
    }
}

struct CategoryBadge: View {
    @Environment(\.colorScheme) private var colorScheme
    let category: String

    var body: some View {
        Text(category)
            .font(.caption2)
            .fontWeight(.semibold)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.sparkBlue.opacity(colorScheme == .dark ? 0.25 : 0.15), in: Capsule())
            .foregroundStyle(Color.sparkBlue)
    }
}

// MARK: - Create

struct CreateView: View {
    @Environment(AppState.self) private var appState
    @Binding var selectedTab: Int

    @State private var title = ""
    @State private var content = ""
    @State private var category = "General"
    @State private var linkedRepo = ""
    @State private var autoEnrich = true
    @State private var isPosting = false
    @State private var errorMsg: String?
    @State private var showSuccess = false

    let categories = ["General", "Tech", "Science", "Art", "Business", "Other"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Idea") {
                    TextField("Title", text: $title)
                    TextField("Description", text: $content, axis: .vertical)
                        .lineLimit(4...8)
                    HStack {
                        Spacer()
                        Text("\(content.count)/500")
                            .font(.caption)
                            .foregroundStyle(content.count > 500 ? .red : .secondary)
                    }
                }
                Section("Category") {
                    Picker("Category", selection: $category) {
                        ForEach(categories, id: \.self) { Text($0) }
                    }
                    .pickerStyle(.menu)
                }
                Section("Repository (optional)") {
                    TextField("Git URL", text: $linkedRepo)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Toggle("Request AI write-up", isOn: $autoEnrich)
                }
                if let err = errorMsg {
                    Section {
                        Text(err)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
                Section {
                    Button(action: post) {
                        if isPosting {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Post")
                                .frame(maxWidth: .infinity)
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(!canPost)
                }
            }
            .navigationTitle("Create")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    AuthButton()
                }
            }
            .alert("Posted!", isPresented: $showSuccess) {
                Button("OK") { selectedTab = 0 }
            }
            .overlay {
                if !appState.isLoggedIn {
                    ContentUnavailableView {
                        Label("Sign in to post", systemImage: "lock")
                    } description: {
                        Text("Create an account or log in to share ideas.")
                    } actions: {
                        Button("Sign In") { appState.showAuth = true }
                            .buttonStyle(.borderedProminent)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(.systemGroupedBackground))
                }
            }
        }
    }

    private var canPost: Bool {
        appState.isLoggedIn && !title.trimmingCharacters(in: .whitespaces).isEmpty &&
        !content.trimmingCharacters(in: .whitespaces).isEmpty && content.count <= 500 && !isPosting
    }

    private func post() {
        isPosting = true
        errorMsg = nil
        Task {
            do {
                try await appState.createPost(
                    title: title,
                    content: content,
                    category: category,
                    linkedRepo: linkedRepo.isEmpty ? nil : linkedRepo
                )
                if autoEnrich, let post = appState.posts.first {
                    try? await appState.requestEnrichment(postId: post.id)
                }
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                title = ""
                content = ""
                category = "General"
                linkedRepo = ""
                showSuccess = true
            } catch {
                errorMsg = error.localizedDescription
            }
            isPosting = false
        }
    }
}

// MARK: - Profile

struct ProfileView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.colorScheme) private var colorScheme
    @State private var confirmingDeleteAccount = false

    var myPosts: [Post] {
        guard let username = appState.user?.username else { return [] }
        return appState.posts.filter { $0.author?.username == username }
    }

    var body: some View {
        NavigationStack {
            List {
                if appState.isLoggedIn, let user = appState.user {
                    Section {
                        HStack(spacing: 14) {
                            Circle()
                                .fill(Color.sparkBlue.opacity(colorScheme == .dark ? 0.25 : 0.15))
                                .frame(width: 60, height: 60)
                                .overlay(
                                    Text(String(user.username.prefix(1)).uppercased())
                                        .font(.title2.bold())
                                        .foregroundStyle(Color.sparkBlue)
                                )
                            VStack(alignment: .leading, spacing: 2) {
                                Text(user.username)
                                    .font(.headline)
                                Text("\(myPosts.count) post\(myPosts.count == 1 ? "" : "s")")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }

                    if !myPosts.isEmpty {
                        Section("Your Posts") {
                            ForEach(myPosts) { post in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(post.title)
                                        .font(.subheadline.weight(.medium))
                                        .lineLimit(2)
                                    HStack {
                                        CategoryBadge(category: post.category)
                                        Spacer()
                                        Label("\(post.score)", systemImage: "arrow.up")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .padding(.vertical, 2)
                            }
                            .onDelete { offsets in
                                let toDelete = offsets.map { myPosts[$0] }
                                for post in toDelete {
                                    Task {
                                        do {
                                            try await appState.deletePost(id: post.id)
                                        } catch {
                                            appState.errorBanner = error.localizedDescription
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Section {
                        Button(role: .destructive) {
                            appState.logout()
                        } label: {
                            Label("Sign Out", systemImage: "arrow.right.square")
                        }
                    }

                    Section {
                        Button(role: .destructive) {
                            confirmingDeleteAccount = true
                        } label: {
                            Label("Delete Account", systemImage: "trash")
                        }
                    } footer: {
                        Text("Permanently deletes your account. This cannot be undone.")
                    }
                } else {
                    Section {
                        VStack(spacing: 12) {
                            Image(systemName: "person.circle")
                                .font(.system(size: 48))
                                .foregroundStyle(.secondary)
                            Text("Not signed in")
                                .font(.headline)
                            Button("Sign In / Register") {
                                appState.showAuth = true
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.sparkBlue)
                            .accessibilityIdentifier("signin_button")
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                    }
                    .listRowBackground(Color.clear)
                }
            }
            .navigationTitle("Profile")
            .confirmationDialog(
                "Delete your account?",
                isPresented: $confirmingDeleteAccount,
                titleVisibility: .visible
            ) {
                Button("Delete Account", role: .destructive) {
                    Task { _ = await appState.deleteAccount() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This permanently deletes your account. This cannot be undone.")
            }
        }
    }
}

// MARK: - Auth Sheet

struct AuthSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var tab = 0
    @State private var username = ""
    @State private var email = ""
    @State private var password = ""
    @State private var biometryType: LABiometryType = .none

    private var canUseBiometrics: Bool {
        biometryType != .none
    }

    private var biometricLabel: String {
        biometryType == .faceID ? "Face ID" : "Touch ID"
    }

    private var biometricIcon: String {
        biometryType == .faceID ? "faceid" : "touchid"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Picker("Mode", selection: $tab) {
                    Text("Sign In").tag(0)
                    Text("Register").tag(1)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                if tab == 0, canUseBiometrics, appState.hasSavedBiometricCredentials() {
                    Button {
                        Task {
                            await appState.biometricLogin()
                        }
                    } label: {
                        Label("Sign in with \(biometricLabel)", systemImage: biometricIcon)
                            .frame(maxWidth: .infinity)
                            .fontWeight(.semibold)
                    }
                    .buttonStyle(.bordered)
                    .tint(.sparkBlue)
                    .padding(.horizontal)
                }

                VStack(spacing: 12) {
                    SignInWithAppleButton(.signIn) { request in
                        request.requestedScopes = [.email, .fullName]
                    } onCompletion: { result in
                        Task { await appState.handleAppleSignIn(result: result) }
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 50)
                    .padding(.horizontal)
                }

                HStack {
                    Rectangle().frame(height: 1).foregroundStyle(.quaternary)
                    Text("or").font(.caption).foregroundStyle(.secondary)
                    Rectangle().frame(height: 1).foregroundStyle(.quaternary)
                }
                .padding(.horizontal, 32)

                VStack(spacing: 14) {
                    TextField("Username", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)
                        .padding(.horizontal)

                    if tab == 1 {
                        TextField("Email (optional)", text: $email)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)
                            .padding(.horizontal)
                    }

                    SecureField("Password", text: $password)
                        .textFieldStyle(.roundedBorder)
                        .padding(.horizontal)
                }

                if let err = appState.error {
                    Text(err)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.horizontal)
                }

                Button(action: submit) {
                    if appState.isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text(tab == 0 ? "Sign In" : "Create Account")
                            .frame(maxWidth: .infinity)
                            .fontWeight(.semibold)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(.sparkBlue)
                .controlSize(.large)
                .disabled(!canSubmit)
                .padding(.horizontal)

                Spacer()
            }
            .padding(.top, 24)
            .navigationTitle(tab == 0 ? "Sign In" : "Register")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        appState.error = nil
                        dismiss()
                    }
                }
            }
            .onAppear {
                biometryType = appState.biometricBiometryType()
            }
        }
    }

    private var canSubmit: Bool {
        !username.isEmpty && !password.isEmpty && !appState.isLoading
    }

    private func submit() {
        Task {
            if tab == 0 {
                await appState.login(username: username, password: password)
            } else {
                await appState.register(username: username, email: email.isEmpty ? nil : email, password: password)
            }
        }
    }
}

// MARK: - Auth Toolbar Button

struct AuthButton: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        if appState.isLoggedIn {
            Button {
                appState.logout()
            } label: {
                Image(systemName: "person.fill.checkmark")
                    .foregroundStyle(Color.sparkBlue)
            }
        } else {
            Button("Sign In") {
                appState.showAuth = true
            }
            .tint(.sparkBlue)
        }
    }
}

// MARK: - Score Badge

struct ScoreBadge: View {
    let score: Int

    private var tier: (String, Color)? {
        if score >= 1_000_000 { return ("star.fill", .yellow) }
        if score >= 1_000 { return ("star.fill", Color(.systemGray3)) }
        if score >= 100 { return ("star.fill", .orange) }
        return nil
    }

    var body: some View {
        if let (icon, color) = tier {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(color)
                .accessibilityLabel(badgeLabel)
        }
    }

    private var badgeLabel: String {
        if score >= 1_000_000 { return "Gold badge" }
        if score >= 1_000 { return "Silver badge" }
        if score >= 100 { return "Bronze badge" }
        return ""
    }
}

// MARK: - Date Formatting

enum DateFormatting {
    nonisolated(unsafe) static let isoFormatter: ISO8601DateFormatter = {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fmt
    }()

    nonisolated(unsafe) static let isoFormatterNoFraction: ISO8601DateFormatter = {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime]
        return fmt
    }()

    nonisolated(unsafe) static let relativeFormatter: RelativeDateTimeFormatter = {
        let fmt = RelativeDateTimeFormatter()
        fmt.unitsStyle = .abbreviated
        return fmt
    }()

    static func relativeDate(_ iso: String) -> String {
        guard let date = isoFormatter.date(from: iso)
                ?? isoFormatterNoFraction.date(from: iso) else { return "" }
        return relativeFormatter.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Floating Tab Bar

private struct SparkFloatingTabBar: View {
    @Binding var selectedTab: Int

    private let tabs: [(icon: String, fill: String, label: String)] = [
        ("flame", "flame.fill", "Feed"),
        ("plus.circle", "plus.circle.fill", "Create"),
        ("person.circle", "person.circle.fill", "Profile"),
        ("lightbulb", "lightbulb.fill", "Ideas"),
    ]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(tabs.indices, id: \.self) { index in
                Button {
                    selectedTab = index
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                } label: {
                    Image(systemName: selectedTab == index ? tabs[index].fill : tabs[index].icon)
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(selectedTab == index ? Color.sparkBlue : Color.secondary)
                        .symbolEffect(.bounce, value: selectedTab == index)
                        .frame(width: 50, height: 40)
                        .background {
                            if selectedTab == index {
                                Capsule().fill(Color.sparkBlue.opacity(0.1))
                            }
                        }
                }
                .frame(maxWidth: .infinity)
                .buttonStyle(.plain)
                .accessibilityLabel(tabs[index].label)
                .accessibilityIdentifier("tabbar_\(tabs[index].label.lowercased())")
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .frame(maxWidth: 320)
        .liquidGlass(in: Capsule(), interactive: true)
        .overlay(Capsule().stroke(Color.primary.opacity(0.08), lineWidth: 1))
        .shadow(color: .black.opacity(0.1), radius: 12, y: 4)
    }
}

// MARK: - Color Extension

extension Color {
    static let sparkBlue = Color(hex: "0071e3")

    init(hex: String) {
        let scanner = Scanner(string: hex)
        var rgb: UInt64 = 0
        scanner.scanHexInt64(&rgb)
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}

#Preview {
    ContentView()
        .environment(AppState())
}

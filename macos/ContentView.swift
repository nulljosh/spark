import SwiftUI

enum SidebarItem: String, CaseIterable, Identifiable {
    case feed = "Feed"
    case create = "Create"
    case ideaBases = "Idea Bases"
    case profile = "Profile"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .feed: return "flame"
        case .create: return "plus.circle"
        case .ideaBases: return "lightbulb"
        case .profile: return "person.circle"
        }
    }
}

struct ContentView: View {
    @Environment(AppState.self) private var appState
    @State private var selectedItem: SidebarItem = .feed

    var body: some View {
        @Bindable var appState = appState
        NavigationSplitView {
            List(SidebarItem.allCases, selection: $selectedItem) { item in
                Label(item.rawValue, systemImage: item.icon)
                    .tag(item)
            }
            .navigationSplitViewColumnWidth(min: 160, ideal: 180, max: 220)
            .listStyle(.sidebar)
        } detail: {
            ZStack(alignment: .top) {
                switch selectedItem {
                case .feed:
                    FeedView()
                case .create:
                    CreateView(selectedItem: $selectedItem)
                case .ideaBases:
                    IdeaBaseView()
                case .profile:
                    ProfileView()
                }

                if appState.errorBanner != nil {
                    ErrorBanner()
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .animation(.spring(duration: 0.3), value: appState.errorBanner != nil)
            // The detail column had no minimum, so it was the pane that gave way
            // when space ran short -- the sidebar kept its 160 and the content
            // disappeared entirely.
            .frame(minWidth: 640, minHeight: 480)
        }
        .sheet(isPresented: $appState.showAuth) {
            AuthSheet()
                .environment(appState)
        }
        .onReceive(NotificationCenter.default.publisher(for: .navigateToCreate)) { _ in
            if appState.isLoggedIn {
                selectedItem = .create
            } else {
                appState.showAuth = true
            }
        }
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
            .background(Color.red.opacity(0.9), in: RoundedRectangle(cornerRadius: 8))
            .padding(.horizontal, 16)
            .padding(.top, 4)
        }
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

// MARK: - Category Badge

struct CategoryBadge: View {
    let category: String

    var body: some View {
        Text(category)
            .font(.caption2)
            .fontWeight(.semibold)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.sparkBlue.opacity(0.15), in: Capsule())
            .foregroundStyle(Color.sparkBlue)
    }
}

#Preview {
    ContentView()
        .environment(AppState())
}

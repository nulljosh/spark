import SwiftUI

@main
struct SparkApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appState)
                // ponytail: 820 is the real floor -- sidebar 160 + feed list 280 +
                // post detail 320. The old 700 let the window shrink below what the
                // panes need, which is how content ended up clipped off both edges.
                .frame(minWidth: 820, minHeight: 520)
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 900, height: 650)
        // Without this the window ignores the content's minWidth entirely and can be
        // dragged (or restored from saved state) narrower than the split view needs,
        // at which point the detail pane collapses and the app opens as a bare
        // sidebar. .frame(minWidth:) alone does not constrain an AppKit window.
        .windowResizability(.contentMinSize)
        .commands {
            CommandGroup(after: .newItem) {
                Button("New Post") {
                    NotificationCenter.default.post(name: .navigateToCreate, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)
            }
            CommandGroup(after: .toolbar) {
                Button("Refresh Feed") {
                    NotificationCenter.default.post(name: .refreshFeed, object: nil)
                }
                .keyboardShortcut("r", modifiers: .command)
            }
        }
    }
}

extension Notification.Name {
    static let navigateToCreate = Notification.Name("navigateToCreate")
    static let refreshFeed = Notification.Name("refreshFeed")
}

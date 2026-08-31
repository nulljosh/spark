import SwiftUI

@main
struct SparkApp: App {
    @State private var appState = AppState()
    @State private var showSplash = true

    var body: some Scene {
        WindowGroup {
            ZStack {
                ContentView()
                    .environment(appState)
                    .overlay { WhatsNewSheet() }

                if showSplash {
                    SplashView()
                        .transition(.opacity)
                        .zIndex(1)
                }
            }
            .animation(.easeInOut(duration: 0.8), value: showSplash)
            .task {
                try? await Task.sleep(for: .seconds(1.2))
                showSplash = false
            }
            .shareApp("https://sparkjar.heyitsmejosh.com")
        }
    }
}

struct SplashView: View {
    @State private var scale: CGFloat = 0.8
    @State private var opacity: Double = 0

    var body: some View {
        ZStack {
            Color.sparkBlue
                .ignoresSafeArea()

            VStack(spacing: 16) {
                Image(systemName: "lightbulb.fill")
                    .font(.system(size: 72, weight: .light))
                    .foregroundStyle(.white)

                Text("Spark")
                    .font(.system(size: 42, weight: .bold, design: .default))
                    .foregroundStyle(.white)
            }
            .scaleEffect(scale)
            .opacity(opacity)
        }
        .onAppear {
            withAnimation(.spring(duration: 0.6)) {
                scale = 1.0
                opacity = 1.0
            }
        }
    }
}

// MARK: - Share

// ponytail: one overlay rather than a per-screen toolbar button — these root views share no
// navigation container to hang a .toolbar on. Move it into a toolbar per screen if this ever
// covers something that matters.
private struct AppShareOverlay: ViewModifier {
    let link: String

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottomTrailing) {
            if let url = URL(string: link) {
                ShareLink(item: url) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 15, weight: .medium))
                        .padding(10)
                        .background(.regularMaterial, in: Circle())
                }
                .buttonStyle(.plain)
                .padding(16)
            }
        }
    }
}

private extension View {
    func shareApp(_ link: String) -> some View { modifier(AppShareOverlay(link: link)) }
}

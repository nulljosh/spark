import WidgetKit
import SwiftUI

struct NewPostsWidget: Widget {
    let kind = "NewPostsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NewPostsProvider()) { entry in
            NewPostsWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("New Ideas")
        .description("Latest submissions on Spark.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct NewPostsWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: NewPostsEntry

    var body: some View {
        switch family {
        case .systemSmall:
            smallView
        case .systemMedium:
            mediumView
        case .systemLarge:
            largeView
        default:
            smallView
        }
    }

    // MARK: - Small

    private var smallView: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "sparkles")
                    .foregroundStyle(Color.sparkBlue)
                Text("New Ideas")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if entry.posts.isEmpty && !entry.isPlaceholder {
                Text("No posts yet")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            } else {
                ForEach(entry.posts.prefix(2)) { post in
                    VStack(alignment: .leading, spacing: 1) {
                        Text(post.title)
                            .font(.system(size: 11, weight: .semibold))
                            .lineLimit(2)
                        HStack(spacing: 4) {
                            if let ts = post.createdAt {
                                Text(relativeTime(ts))
                                    .font(.system(size: 9))
                                    .foregroundStyle(.tertiary)
                            }
                            Spacer()
                            HStack(spacing: 2) {
                                Image(systemName: "arrow.up")
                                    .font(.system(size: 8))
                                Text("\(post.score)")
                                    .font(.system(size: 9).monospacedDigit())
                            }
                            .foregroundStyle(Color.sparkBlue)
                        }
                    }
                }
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .redacted(reason: entry.isPlaceholder ? .placeholder : [])
    }

    // MARK: - Medium

    private var mediumView: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: "sparkles")
                    .foregroundStyle(Color.sparkBlue)
                Text("New Ideas")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
                Spacer()
                Text(entry.date, style: .time)
                    .font(.system(size: 9))
                    .foregroundStyle(.tertiary)
            }

            Spacer(minLength: 2)

            if entry.posts.isEmpty && !entry.isPlaceholder {
                Text("No posts yet")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            } else {
                ForEach(Array(entry.posts.prefix(3).enumerated()), id: \.element.id) { index, post in
                    HStack(spacing: 8) {
                        Circle()
                            .fill(Color.sparkBlue.opacity(0.15))
                            .frame(width: 24, height: 24)
                            .overlay(
                                Text(String(post.author?.username.prefix(1).uppercased() ?? "?"))
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(Color.sparkBlue)
                            )

                        VStack(alignment: .leading, spacing: 1) {
                            Text(post.title)
                                .font(.system(size: 12, weight: .semibold))
                                .lineLimit(1)
                            HStack(spacing: 6) {
                                SparkCategoryPill(post.category)
                                if let ts = post.createdAt {
                                    Text(relativeTime(ts))
                                        .font(.system(size: 9))
                                        .foregroundStyle(.tertiary)
                                }
                            }
                        }

                        Spacer()

                        HStack(spacing: 2) {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 9, weight: .bold))
                            Text("\(post.score)")
                                .font(.system(size: 11, weight: .bold).monospacedDigit())
                        }
                        .foregroundStyle(Color.sparkBlue)
                    }
                    if index < min(entry.posts.count, 3) - 1 {
                        Divider()
                    }
                }
            }

            Spacer(minLength: 2)
        }
        .redacted(reason: entry.isPlaceholder ? .placeholder : [])
    }

    // MARK: - Large

    private var largeView: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "sparkles")
                    .foregroundStyle(Color.sparkBlue)
                Text("New Ideas")
                    .font(.headline)
                Spacer()
                Text(entry.date, style: .time)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Divider()

            if entry.posts.isEmpty && !entry.isPlaceholder {
                Spacer()
                HStack {
                    Spacer()
                    Text("No posts yet")
                        .font(.subheadline)
                        .foregroundStyle(.tertiary)
                    Spacer()
                }
                Spacer()
            } else {
                ForEach(Array(entry.posts.prefix(5).enumerated()), id: \.element.id) { index, post in
                    HStack(spacing: 10) {
                        Circle()
                            .fill(Color.sparkBlue.opacity(0.15))
                            .frame(width: 30, height: 30)
                            .overlay(
                                Text(String(post.author?.username.prefix(1).uppercased() ?? "?"))
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(Color.sparkBlue)
                            )

                        VStack(alignment: .leading, spacing: 3) {
                            Text(post.title)
                                .font(.subheadline.weight(.semibold))
                                .lineLimit(1)
                            Text(post.content ?? "")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                            HStack(spacing: 8) {
                                SparkCategoryPill(post.category)
                                if let author = post.author {
                                    Text(author.username)
                                        .font(.system(size: 9))
                                        .foregroundStyle(.tertiary)
                                }
                                Spacer()
                                if let ts = post.createdAt {
                                    Text(relativeTime(ts))
                                        .font(.system(size: 9))
                                        .foregroundStyle(.tertiary)
                                }
                            }
                        }

                        Spacer()

                        VStack(spacing: 2) {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 10, weight: .bold))
                            Text("\(post.score)")
                                .font(.system(size: 13, weight: .bold).monospacedDigit())
                        }
                        .foregroundStyle(Color.sparkBlue)
                        .frame(width: 36)
                    }
                    .padding(.vertical, 2)

                    if index < min(entry.posts.count, 5) - 1 {
                        Divider()
                    }
                }
            }

            Spacer()
        }
        .redacted(reason: entry.isPlaceholder ? .placeholder : [])
    }
}

// MARK: - Date Helper

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

private nonisolated(unsafe) let relativeFmt: RelativeDateTimeFormatter = {
    let fmt = RelativeDateTimeFormatter()
    fmt.unitsStyle = .abbreviated
    return fmt
}()

func relativeTime(_ iso: String) -> String {
    guard let date = isoFormatter.date(from: iso)
        ?? isoFormatterNoFraction.date(from: iso) else { return "" }
    return relativeFmt.localizedString(for: date, relativeTo: Date())
}

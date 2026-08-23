import WidgetKit
import SwiftUI

struct HotPostsWidget: Widget {
    let kind = "HotPostsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HotPostsProvider()) { entry in
            HotPostsWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Hot Ideas")
        .description("Top trending ideas on Spark, ranked by votes.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct HotPostsWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: HotPostsEntry

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
                Image(systemName: "flame.fill")
                    .foregroundStyle(Color.sparkOrange)
                Text("Hot Ideas")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }

            Spacer()

            if entry.posts.isEmpty && !entry.isPlaceholder {
                Text("No posts yet")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            } else {
                ForEach(Array(entry.posts.prefix(2).enumerated()), id: \.element.id) { index, post in
                    smallPostRow(post, rank: index + 1)
                }
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .redacted(reason: entry.isPlaceholder ? .placeholder : [])
    }

    private func smallPostRow(_ post: WidgetPost, rank: Int) -> some View {
        HStack(spacing: 6) {
            Text("\(rank)")
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(Color.sparkBlue)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 1) {
                Text(post.title)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(2)
                HStack(spacing: 3) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 8))
                    Text("\(post.score)")
                        .font(.system(size: 9, weight: .medium).monospacedDigit())
                }
                .foregroundStyle(Color.sparkBlue)
            }
        }
    }

    // MARK: - Medium

    private var mediumView: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: "flame.fill")
                    .foregroundStyle(Color.sparkOrange)
                Text("Hot Ideas")
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
                    mediumPostRow(post, rank: index + 1)
                    if index < min(entry.posts.count, 3) - 1 {
                        Divider()
                    }
                }
            }

            Spacer(minLength: 2)
        }
        .redacted(reason: entry.isPlaceholder ? .placeholder : [])
    }

    private func mediumPostRow(_ post: WidgetPost, rank: Int) -> some View {
        HStack(spacing: 8) {
            Text("\(rank)")
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundStyle(Color.sparkBlue)
                .frame(width: 20)

            VStack(alignment: .leading, spacing: 2) {
                Text(post.title)
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(1)
                HStack(spacing: 6) {
                    SparkCategoryPill(post.category)
                    if let author = post.author {
                        Text(author.username)
                            .font(.system(size: 9))
                            .foregroundStyle(.tertiary)
                    }
                }
            }

            Spacer()

            VStack(spacing: 1) {
                Image(systemName: "arrow.up")
                    .font(.system(size: 9, weight: .bold))
                Text("\(post.score)")
                    .font(.system(size: 11, weight: .bold).monospacedDigit())
            }
            .foregroundStyle(Color.sparkBlue)
            .frame(width: 32)
        }
    }

    // MARK: - Large

    private var largeView: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "flame.fill")
                    .foregroundStyle(Color.sparkOrange)
                Text("Hot Ideas")
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
                    largePostRow(post, rank: index + 1)
                    if index < min(entry.posts.count, 5) - 1 {
                        Divider()
                    }
                }
            }

            Spacer()
        }
        .redacted(reason: entry.isPlaceholder ? .placeholder : [])
    }

    private func largePostRow(_ post: WidgetPost, rank: Int) -> some View {
        HStack(spacing: 10) {
            Text("\(rank)")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundStyle(rank <= 3 ? Color.sparkOrange : Color.sparkBlue)
                .frame(width: 24)

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
                        Label(author.username, systemImage: "person.fill")
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
    }
}

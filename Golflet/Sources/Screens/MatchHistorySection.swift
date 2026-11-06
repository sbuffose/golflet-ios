import SwiftUI
#if canImport(PhotosUI)
import PhotosUI
#endif

struct MatchHistorySection: View {
    @Environment(\.palette) private var p
    var records: [MatchFormatRecord]
    var matches: [PlayedMatch]
    var canAttach: Bool
    var onPhoto: ((String, Data) async -> Void)?

    @State private var picked: [String: Data] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Partidos")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if records.isEmpty && matches.isEmpty {
                Text("No hay partidos cargados.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                    .accessibilityIdentifier("match-history-empty")
            } else {
                if !records.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(records) { record in
                            HStack {
                                Text(record.title)
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Spacer()
                                Text(record.line)
                                    .font(GType.headline)
                                    .tabular()
                                    .foregroundStyle(p.ink)
                            }
                            Text(record.detail)
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                        }
                    }
                    .accessibilityIdentifier("match-records")
                }
                ForEach(matches) { match in
                    matchRow(match)
                }
            }
        }
    }

    private func matchRow(_ match: PlayedMatch) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(match.formatTitle.isEmpty ? "Partido" : match.formatTitle)
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                Spacer()
                Text(match.resultTitle)
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
            }
            if !match.opponent.isEmpty {
                Text(match.opponent)
                    .font(GType.body)
                    .foregroundStyle(p.ink)
            }
            if let summary = match.summary, !summary.isEmpty {
                Text(summary)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
            if !match.dateLabel.isEmpty {
                Text(match.dateLabel)
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            }
            memory(match)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityIdentifier("match-\(match.id)")
    }

    @ViewBuilder
    private func memory(_ match: PlayedMatch) -> some View {
        if let data = picked[match.id], let image = image(data) {
            image
                .resizable()
                .scaledToFill()
                .frame(height: 140)
                .clipped()
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .accessibilityLabel("Foto del partido")
        } else if let url = match.photoURL.flatMap(URL.init(string:)), url.scheme == "https" || url.scheme == "http" {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFill()
                }
            }
            .frame(height: 140)
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .accessibilityLabel("Foto del partido")
        }
        #if canImport(PhotosUI)
        if canAttach && match.allowsPhoto, let onPhoto {
            PhotosPicker(selection: Binding<PhotosPickerItem?>(
                get: { nil },
                set: { item in
                    Task {
                        guard let data = try? await item?.loadTransferable(type: Data.self) else { return }
                        picked[match.id] = data
                        await onPhoto(match.id, data)
                    }
                }
            ), matching: .images) {
                Text(picked[match.id] == nil && match.photoURL == nil ? "Sumar foto del recuerdo" : "Cambiar foto")
                    .font(GType.label)
                    .foregroundStyle(p.primary)
            }
            .accessibilityIdentifier("match-photo-\(match.id)")
        }
        #endif
    }

    private func image(_ data: Data) -> Image? {
        #if canImport(UIKit)
        if let ui = UIImage(data: data) { return Image(uiImage: ui) }
        #endif
        return nil
    }
}

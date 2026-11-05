import SwiftUI

enum TeeTimePrep {
    static func canchaLine(course: String) -> String {
        let name = course.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { return "La reserva no trae el nombre de la cancha." }
        return name
    }

    static func forecastLine(_ forecast: String?) -> String {
        let text = forecast?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if text.isEmpty { return "Este horario no trae pronóstico." }
        return text
    }

    static func strategyLine(course: String, strategy: CourseStrategy?) -> String {
        let name = course.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { return "Sin el nombre de la cancha no hay estrategia para preparar." }
        let overview = strategy?.overview?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !overview.isEmpty { return overview }
        let plans = (strategy?.holes ?? []).compactMap { hole -> String? in
            let title = hole.planTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !title.isEmpty else { return nil }
            return "Hoyo \(hole.hole) · \(title)"
        }
        if plans.isEmpty { return "Todavía no hay estrategia cargada para esta cancha." }
        return plans.prefix(3).joined(separator: "\n")
    }
}

struct TeeTimePrepView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let booking: TeeTime
    @State private var strategy: CourseStrategy?

    var body: some View {
        GScreen(id: "screen-tee-prep") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(booking.chipWhen)
                            .font(GType.largeTitle)
                            .foregroundStyle(p.ink)
                        Text(booking.clubName)
                            .font(GType.section)
                            .foregroundStyle(p.ink)
                        if let partners = booking.companionsLine {
                            Text(partners)
                                .font(GType.body)
                                .foregroundStyle(p.ink2)
                        }
                    }
                    block("Cancha", TeeTimePrep.canchaLine(course: booking.course), "tee-prep-cancha")
                    block("Pronóstico", TeeTimePrep.forecastLine(booking.forecast), "tee-prep-forecast")
                    block("Estrategia", TeeTimePrep.strategyLine(course: booking.course, strategy: strategy), "tee-prep-strategy")
                }
                .padding(20)
            }
        }
        .accessibilityIdentifier("screen-tee-prep")
        .safeAreaInset(edge: .top) { MetricBackBar() }
        .task { await loadStrategy() }
    }

    private func block(_ title: String, _ body: String, _ id: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(GType.section)
                .foregroundStyle(p.ink)
            GCard(radius: 18, padding: 14) {
                Text(body)
                    .font(GType.body)
                    .foregroundStyle(p.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier(id)
            }
        }
    }

    private func loadStrategy() async {
        let course = booking.course.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !course.isEmpty else { return }
        strategy = try? await model.api.courseStrategy(
            courseKey: CourseIdentity.key(for: course),
            courseId: CourseIdentity.id(for: course)
        )
    }
}

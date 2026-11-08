import Foundation

struct CardClubRead: Sendable {
    var club: String
    var ok: Bool
    var newRounds: Int
    var message: String
}

/// Same words as web `latestCardOutcome`. One club with no new card does not hide another club that failed.
enum CardPullNote {
    static func text(_ results: [CardClubRead]) -> String {
        if results.isEmpty { return "No hay una clave guardada para leer el club." }
        let ok = results.filter(\.ok)
        let bad = results.filter { !$0.ok }
        let added = ok.reduce(0) { $0 + $1.newRounds }
        let fail = bad.map { item in
            let msg = item.message.isEmpty ? "No pudimos leer el club." : item.message
            return item.club.isEmpty ? msg : "\(item.club): \(msg)"
        }.joined(separator: " ")
        if ok.isEmpty { return fail.isEmpty ? "No pudimos leer el club. La tarjeta en pantalla no cambió." : fail }
        if !bad.isEmpty {
            let head = added > 0
                ? (added == 1 ? "Llegó una tarjeta nueva." : "Llegaron \(added) tarjetas nuevas.")
                : "No hay una tarjeta nueva en los clubes que respondieron."
            return "\(head) \(fail)"
        }
        if added == 0 { return "No hay una tarjeta nueva. La última sigue siendo la que ya ves." }
        return added == 1 ? "Llegó una tarjeta nueva." : "Llegaron \(added) tarjetas nuevas."
    }
}

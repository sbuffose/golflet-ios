import Foundation

/// Cancha Vieja de Mar del Plata, tee azul.
///
/// Par, hándicap y yardas son la tarjeta publicada (par 70, 6.020 yd).
/// El hoyo 1 es par 4 de 445 yd y el 2 es par 3 de 195 yd. En este repo no
/// hay bunkers, OB ni falsos frentes medidos hoyo por hoyo, así que el plan
/// no inventa esas distancias.
enum MdPPlans {
    static func strategy(matching key: String) -> CourseStrategy? {
        let folded = key.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased()
        if folded.contains("nueva") { return nil }
        let isVieja = folded.contains("vieja")
            || folded.contains("mar del plata")
            || folded.contains("mardelplata")
            || folded.contains("mdp")
        return isVieja ? vieja : nil
    }

    static var vieja: CourseStrategy {
        CourseStrategy(
            courseId: "209-mdp-vieja",
            courseKey: "7:Cancha Vieja",
            overview: "Cancha Vieja, tee azul: par 70, 6.020 yd. Links de médanos: rough pesado, viento cruzado y greens con caída. Cada hoyo usa par, yardas y hándicap de la tarjeta.",
            overviewPublishedAt: nil,
            publishedHoles: Array(1...18),
            holes: blue.map(plan)
        )
    }

    private struct Card {
        var hole: Int
        var par: Int
        var hcp: Int
        var yards: Int
    }

    /// Tee azul. Out 2.966, in 3.054.
    private static let blue: [Card] = [
        Card(hole: 1, par: 4, hcp: 3, yards: 445),
        Card(hole: 2, par: 3, hcp: 13, yards: 195),
        Card(hole: 3, par: 5, hcp: 1, yards: 569),
        Card(hole: 4, par: 4, hcp: 11, yards: 287),
        Card(hole: 5, par: 3, hcp: 15, yards: 146),
        Card(hole: 6, par: 4, hcp: 7, yards: 354),
        Card(hole: 7, par: 5, hcp: 5, yards: 503),
        Card(hole: 8, par: 3, hcp: 17, yards: 126),
        Card(hole: 9, par: 4, hcp: 9, yards: 341),
        Card(hole: 10, par: 4, hcp: 14, yards: 307),
        Card(hole: 11, par: 4, hcp: 8, yards: 355),
        Card(hole: 12, par: 3, hcp: 16, yards: 172),
        Card(hole: 13, par: 5, hcp: 4, yards: 564),
        Card(hole: 14, par: 3, hcp: 18, yards: 164),
        Card(hole: 15, par: 4, hcp: 6, yards: 384),
        Card(hole: 16, par: 4, hcp: 10, yards: 367),
        Card(hole: 17, par: 4, hcp: 2, yards: 410),
        Card(hole: 18, par: 4, hcp: 12, yards: 331)
    ]

    private static func plan(_ card: Card) -> HoleStrategy {
        let shot = tee(par: card.par, yards: card.yards)
        return HoleStrategy(
            hole: card.hole,
            planTitle: shot.title,
            planText: "Par \(card.par), \(card.yards) yd del tee azul. Hándicap \(card.hcp). \(shot.club) al \(shot.target.lowercased()).",
            teeClub: shot.club,
            teeTarget: shot.target,
            target: nil,
            hazards: [],
            why: "Tarjeta azul: \(card.yards) yd, par \(card.par), hándicap \(card.hcp).",
            missSide: "centro",
            missNote: "Si errás, corto y al centro.",
            greenSlope: nil,
            greenLeave: nil,
            greenNotes: "Greens rápidos y con caída.",
            variants: [:],
            publishedAt: nil
        )
    }

    private static func tee(par: Int, yards: Int) -> (club: String, target: String, title: String) {
        switch par {
        case 3:
            let club = yards <= 140 ? "Wedge" : (yards <= 175 ? "Hierro" : "Híbrido")
            return (club, "Centro del green", "Al centro del green")
        case 5:
            return ("Driver", "Centro", "En tres golpes")
        default:
            if yards < 330 {
                return ("Híbrido", "Centro del fairway", "Híbrido al centro")
            }
            return ("Driver", "Centro del fairway", "Driver al centro")
        }
    }
}

import Foundation

/// Published plans for Jockey Azul and Colorada.
/// `GET /api/strategy` on golflet.vercel.app returns `holes: []` for both
/// course keys, and this repo cannot write that API. These plans fill the
/// hole list when the response is empty. Yardages are the club scorecard
/// (tee Azul / tee Rojo). Holes 7 and 8 of Azul keep the measured plan.
enum JockeyPlans {
    static func strategy(matching key: String) -> CourseStrategy? {
        let folded = key.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased()
        if folded.contains("colorada") { return colorada }
        if folded.contains("azul") || folded == "1:azul" { return azul }
        return nil
    }

    static func merging(remote: CourseStrategy, requestedKey: String?) -> CourseStrategy {
        if !remote.holes.isEmpty { return remote }
        let key = remote.courseKey.isEmpty ? (requestedKey ?? remote.courseId) : remote.courseKey
        return strategy(matching: key) ?? remote
    }

    static var azul: CourseStrategy {
        course(
            id: "118-jockey-azul",
            key: "1:Azul",
            overview: "Cancha corta y técnica. El rough castiga y varios greens caen hacia adelante. Pensá el palo de salida hoyo por hoyo.",
            holes: azulYards.map { hole in
                if hole.n == 7 { return azul7 }
                if hole.n == 8 { return azul8 }
                return plan(hole, course: "Azul")
            }
        )
    }

    static var colorada: CourseStrategy {
        course(
            id: "118-jockey-colorada",
            key: "1:Colorada",
            overview: "Más larga que la Azul, con pares 4 de drive y tres pares 5. El rough pesa. Salí al centro y dejá el approach entero.",
            holes: coloradaYards.map { plan($0, course: "Colorada") }
        )
    }

    private static func course(id: String, key: String, overview: String, holes: [HoleStrategy]) -> CourseStrategy {
        CourseStrategy(
            courseId: id,
            courseKey: key,
            overview: overview,
            overviewPublishedAt: "2026-11-06T12:00:00Z",
            publishedHoles: holes.map(\.hole),
            holes: holes
        )
    }

    private struct Yard {
        var n: Int
        var par: Int
        var hcp: Int
        var yards: Int
    }

    private static let azulYards: [Yard] = [
        Yard(n: 1, par: 5, hcp: 5, yards: 485), Yard(n: 2, par: 5, hcp: 1, yards: 474),
        Yard(n: 3, par: 4, hcp: 9, yards: 345), Yard(n: 4, par: 4, hcp: 3, yards: 340),
        Yard(n: 5, par: 3, hcp: 15, yards: 122), Yard(n: 6, par: 4, hcp: 17, yards: 327),
        Yard(n: 7, par: 4, hcp: 13, yards: 168), Yard(n: 8, par: 5, hcp: 7, yards: 411),
        Yard(n: 9, par: 4, hcp: 11, yards: 407), Yard(n: 10, par: 5, hcp: 4, yards: 483),
        Yard(n: 11, par: 3, hcp: 14, yards: 186), Yard(n: 12, par: 4, hcp: 16, yards: 409),
        Yard(n: 13, par: 4, hcp: 8, yards: 393), Yard(n: 14, par: 3, hcp: 18, yards: 150),
        Yard(n: 15, par: 4, hcp: 12, yards: 343), Yard(n: 16, par: 3, hcp: 10, yards: 377),
        Yard(n: 17, par: 4, hcp: 2, yards: 490), Yard(n: 18, par: 4, hcp: 6, yards: 452)
    ]

    private static let coloradaYards: [Yard] = [
        Yard(n: 1, par: 4, hcp: 5, yards: 425), Yard(n: 2, par: 4, hcp: 11, yards: 350),
        Yard(n: 3, par: 3, hcp: 17, yards: 148), Yard(n: 4, par: 5, hcp: 9, yards: 490),
        Yard(n: 5, par: 4, hcp: 13, yards: 340), Yard(n: 6, par: 4, hcp: 7, yards: 355),
        Yard(n: 7, par: 4, hcp: 1, yards: 425), Yard(n: 8, par: 3, hcp: 15, yards: 208),
        Yard(n: 9, par: 4, hcp: 3, yards: 415), Yard(n: 10, par: 5, hcp: 4, yards: 470),
        Yard(n: 11, par: 5, hcp: 12, yards: 540), Yard(n: 12, par: 3, hcp: 18, yards: 175),
        Yard(n: 13, par: 4, hcp: 2, yards: 444), Yard(n: 14, par: 4, hcp: 6, yards: 390),
        Yard(n: 15, par: 5, hcp: 10, yards: 511), Yard(n: 16, par: 4, hcp: 8, yards: 401),
        Yard(n: 17, par: 3, hcp: 16, yards: 170), Yard(n: 18, par: 4, hcp: 14, yards: 354)
    ]

    private static func plan(_ hole: Yard, course: String) -> HoleStrategy {
        let advice = teeAdvice(par: hole.par, yards: hole.yards, hcp: hole.hcp)
        return HoleStrategy(
            hole: hole.n,
            planTitle: advice.title,
            planText: advice.text,
            teeClub: advice.club,
            teeTarget: advice.target,
            target: nil,
            hazards: [
                StrategyHazard(
                    id: "\(course.lowercased())-\(hole.n)",
                    type: "rough",
                    typeLabel: "Rough",
                    side: advice.miss,
                    sideLabel: advice.miss == "izquierda" ? "Izquierda" : "Derecha",
                    fromYd: nil,
                    carryYd: nil,
                    fromM: nil,
                    carryM: nil,
                    note: advice.hazard,
                    at: nil
                )
            ],
            why: "Par \(hole.par), \(hole.yards) yd desde el tee de juego, hándicap \(hole.hcp) de la cancha.",
            missSide: advice.miss,
            missNote: advice.hazard,
            greenSlope: nil,
            greenLeave: "Abajo del hoyo",
            greenNotes: "Mejor corto que pasado.",
            variants: [
                .medio: StrategyVariant(teeClub: advice.club, plan: advice.text)
            ],
            publishedAt: "2026-11-06T12:00:00Z"
        )
    }

    private static func teeAdvice(par: Int, yards: Int, hcp: Int) -> (title: String, text: String, club: String, target: String, miss: String, hazard: String) {
        let hard = hcp <= 4 ? " Es de los más duros: centro antes que un golpe heroico." : ""
        let easy = hcp >= 15 ? " Acá se defiende el par. Un golpe de más vale más que el riesgo." : ""
        switch par {
        case 3 where yards < 140:
            return ("Wedge al centro", "Par 3 corto, \(yards) yd. Wedge o hierro 9 al medio del green. No lo pases.\(easy)", "PW", "Centro del green", "corto", "Si errás, que sea corto. Largo no vuelve.")
        case 3 where yards < 190:
            return ("Hierro al centro", "Par 3 de \(yards) yd. Hierro medio al centro, sin cazar la bandera.\(easy)", "Hierro 7", "Centro del green", "corto", "El rough de adelante es mejor que pasarlo.")
        case 3:
            return ("Hierro largo, sin pasarte", "Par 3 largo, \(yards) yd. Salí con lo que llegue cómodo y dejalo en el medio.\(hard)", "Híbrido", "Centro del green", "corto", "No lo cacees: pasado queda muerto.")
        case 5 where yards < 500:
            return ("Dos golpes y un wedge", "Par 5 de \(yards) yd. Driver al centro y un segundo que deje wedge entero. No lo fuerces en dos.\(hard)", "Driver", "Centro del fairway", "izquierda", "El rough te saca el segundo golpe. Mejor el centro.")
        case 5:
            return ("Jugalo en tres", "Par 5 de \(yards) yd. Tres golpes. El segundo es posición, no distancia.\(hard)", "Driver", "Lado ancho del fairway", "izquierda", "Un layup al centro le gana al rough.")
        case 4 where yards < 330:
            return ("Híbrido y wedge", "Par 4 corto, \(yards) yd. Híbrido o hierro largo y dejá un wedge. El driver no hace falta.\(easy)", "Híbrido", "Centro, corto del problema", "izquierda", "Pasarte desde el tee te deja un approach incómodo.")
        case 4 where yards < 390:
            return ("Madera al centro", "Par 4 de \(yards) yd. Madera o híbrido al centro. El approach tiene que quedar entero.\(easy)", "Madera 3", "Centro del fairway", "derecha", "Del rough el hierro no entra igual. Pagá el centro.")
        default:
            return ("Driver al lado ancho", "Par 4 de \(yards) yd. Driver al lado más ancho y un hierro al centro del green.\(hard)", "Driver", "Lado ancho", "izquierda", "Un drive al rough te deja el segundo golpe largo.")
        }
    }

    private static let azul7 = HoleStrategy(
        hole: 7,
        planTitle: "Híbrido al centro y wedge al green",
        planText: "Salida con híbrido buscando el centro del fairway, corto del bunker de la derecha. Queda un segundo de 120–140 yd del green abierto.",
        teeClub: "Híbrido",
        teeTarget: "Centro del fairway, apuntando al árbol solo del fondo",
        target: GPSCoord(lat: -34.4866, lng: -58.5296),
        hazards: [
            StrategyHazard(
                id: "h7-left",
                type: "bunker",
                typeLabel: "Bunker",
                side: "izquierda",
                sideLabel: "Izquierda",
                fromYd: 131,
                carryYd: 151,
                fromM: 120,
                carryM: 138,
                note: "Bunker de fairway a la izquierda: agarra el gancho corto.",
                at: nil
            ),
            StrategyHazard(
                id: "h7-right",
                type: "bunker",
                typeLabel: "Bunker",
                side: "derecha",
                sideLabel: "Derecha",
                fromYd: 293,
                carryYd: 325,
                fromM: 268,
                carryM: 297,
                note: "Bunker a la derecha: empieza a 293 yd de la salida, carry 325 yd.",
                at: nil
            ),
            StrategyHazard(
                id: "h7-front",
                type: "bunker",
                typeLabel: "Bunker",
                side: "frente_green",
                sideLabel: "Frente al green",
                fromYd: 332,
                carryYd: 359,
                fromM: 304,
                carryM: 328,
                note: "Bunker frente al green: empieza a 332 yd de la salida, carry 359 yd.",
                at: nil
            )
        ],
        why: "El bunker de la derecha agarra los drives de 290 a 325 yd y el de la izquierda castiga el gancho corto. Con híbrido quedás antes y el approach entra con más spin a un green que cae hacia adelante.",
        missSide: "izquierda",
        missNote: "Si errás, que sea a la izquierda, corto del bunker.",
        greenSlope: "Cae de atrás hacia adelante",
        greenLeave: "Abajo del hoyo, nunca pasada",
        greenNotes: "Green que cae hacia adelante: quedate corto y abajo.",
        variants: [
            .scratch: StrategyVariant(teeClub: "Madera 3", plan: "Madera 3 al centro, corto del bunker de la derecha. Queda un wedge corto."),
            .medio: StrategyVariant(teeClub: "Híbrido", plan: "Híbrido al centro. El segundo queda 120–140 yd con wedge."),
            .alto: StrategyVariant(teeClub: "Híbrido", plan: "Híbrido al centro, sin forzar. El segundo es un hierro o híbrido al green.")
        ],
        publishedAt: "2026-10-28T12:00:00Z"
    )

    private static let azul8 = HoleStrategy(
        hole: 8,
        planTitle: "Hierro largo al centro",
        planText: "Salida con hierro 4 o 5 al centro del fairway. El green está protegido adelante: mejor quedar corto que largo.",
        teeClub: "Hierro 4",
        teeTarget: "Centro del fairway",
        target: nil,
        hazards: [
            StrategyHazard(
                id: "h8-front",
                type: "bunker",
                typeLabel: "Bunker",
                side: "frente_green",
                sideLabel: "Frente al green",
                fromYd: 310,
                carryYd: 335,
                fromM: 283,
                carryM: 306,
                note: "Bunker frente al green: no lo desafíes con la salida.",
                at: nil
            )
        ],
        why: "Un hierro te deja un approach cómodo y saca de juego el bunker de adelante.",
        missSide: "corto",
        missNote: "Si errás, que sea corto. Largo no tiene recovery.",
        greenSlope: "Cae de adelante hacia atrás",
        greenLeave: "Abajo, corto del hoyo",
        greenNotes: "No pases el hoyo.",
        variants: [
            .alto: StrategyVariant(teeClub: "Híbrido", plan: "Híbrido al centro. El segundo puede ser un pitch.")
        ],
        publishedAt: "2026-10-28T12:00:00Z"
    )
}

import Foundation

struct LessonDrill: Identifiable, Hashable {
    var id: String
    var title: String
    var detail: String
}

struct GolfLesson: Identifiable, Hashable {
    var id: String
    var category: String
    var title: String
    var minutes: Int
    var why: String
    var steps: [String]
    var drills: [LessonDrill]
}

enum LessonsCatalog {
    static let categories: [(String, String)] = [
        ("tee", "Drive"),
        ("app", "Approach"),
        ("corto", "Juego corto"),
        ("putt", "Putt"),
        ("estrategia", "Estrategia")
    ]

    static let all: [GolfLesson] = [
        GolfLesson(id: "tee-1", category: "tee", title: "Salida al fairway, no a la distancia", minutes: 8,
                   why: "Un drive en el rough cuesta más que 20 metros menos en el fairway.",
                   steps: ["Elegí un objetivo chico detrás del fairway, no el fairway entero.", "Si el hoyo se angosta donde llega tu driver, salí con madera o híbrido.", "Misma rutina en cada salida: detrás de la pelota, línea, dos ensayos, pegar."],
                   drills: [LessonDrill(id: "tee-1a", title: "Fairway de 25 m", detail: "En el driving, marcá dos banderas a 25 m de ancho. 14 pelotas: contá cuántas caen adentro."), LessonDrill(id: "tee-1b", title: "Palo según el hoyo", detail: "Antes de cada pelota decí un hoyo de tu cancha y elegí el palo de salida.")]),
        GolfLesson(id: "tee-2", category: "tee", title: "Alineación con varilla", minutes: 6,
                   why: "La mayoría de las salidas falladas empiezan en los pies.",
                   steps: ["Varilla en el piso apuntando al objetivo.", "Pies, cadera y hombros paralelos a la varilla.", "Sacá la varilla cada 3 pelotas y repetí sin ayuda."],
                   drills: [LessonDrill(id: "tee-2a", title: "15 drives con varilla", detail: "Alterná: 3 con varilla, 2 sin."), LessonDrill(id: "tee-2b", title: "Rutina cronometrada", detail: "Rutina completa en menos de 25 segundos, 10 veces.")]),
        GolfLesson(id: "app-1", category: "app", title: "Al centro del green", minutes: 8,
                   why: "Desde más de 140 m, apuntar a la bandera rara vez paga: el centro baja tus dobles.",
                   steps: ["Mirá dónde está la bandera y dónde está el problema.", "Si la bandera está cerca de un bunker o del agua, apuntá al centro.", "Elegí el palo para llegar al fondo del green, no al frente."],
                   drills: [LessonDrill(id: "app-1a", title: "9 pelotas, 3 palos", detail: "Hierro 8, 7 y 6 a un mismo green: contá cuántas quedan en el green."), LessonDrill(id: "app-1b", title: "Un palo más", detail: "En la práctica, a par 3, pegá con un palo más y swing suave.")]),
        GolfLesson(id: "app-2", category: "app", title: "Distancias de tus hierros", minutes: 7,
                   why: "Si no sabés cuánto pega cada hierro, cada approach es una apuesta.",
                   steps: ["Pegá 10 pelotas con cada hierro y anotá dónde caen.", "Quedate con el promedio, no con la mejor.", "Cargalas en tu bolsa de Golflet."],
                   drills: [LessonDrill(id: "app-2a", title: "Promedio de un hierro", detail: "10 pelotas con el 7, anotá la distancia de caída de cada una."), LessonDrill(id: "app-2b", title: "Escalera de hierros", detail: "Del PW al 5, 3 pelotas cada uno, mirando el salto entre palos.")]),
        GolfLesson(id: "corto-1", category: "corto", title: "El chip que rueda", minutes: 7,
                   why: "Desde cerca del green, la pelota que rueda es más fácil de controlar que la que vuela.",
                   steps: ["Pelota atrás en el stance, peso adelante.", "Movimiento de putt con un hierro 8 o 9.", "Elegí dónde pica: un metro adentro del green."],
                   drills: [LessonDrill(id: "corto-1a", title: "Pique en la toalla", detail: "Toalla a 1 m del borde del green: 20 chips picando en la toalla."), LessonDrill(id: "corto-1b", title: "Arriba y abajo", detail: "5 pelotas alrededor del green: chip y putt, contá cuántas en 2 golpes.")]),
        GolfLesson(id: "corto-2", category: "corto", title: "Salir del bunker al primer intento", minutes: 8,
                   why: "Un bunker que se queda en el bunker es un golpe perdido entero.",
                   steps: ["Cara abierta, pies firmes en la arena.", "Pegale a la arena 3 cm antes de la pelota.", "Terminá el swing: no frenes en la arena."],
                   drills: [LessonDrill(id: "corto-2a", title: "Línea en la arena", detail: "Dibujá una línea y pegá en ella sin pelota, 10 veces."), LessonDrill(id: "corto-2b", title: "10 afuera", detail: "10 pelotas: todas tienen que salir al green.")]),
        GolfLesson(id: "putt-1", category: "putt", title: "Lag putting: dejarla cerca", minutes: 7,
                   why: "Los 3 putts casi siempre empiezan en un primer putt largo que queda lejos.",
                   steps: ["Mirá el hoyo, no la pelota, en los ensayos.", "Pensá en la velocidad, no en la línea.", "Objetivo: que quede a menos de un metro."],
                   drills: [LessonDrill(id: "putt-1a", title: "Círculo de un metro", detail: "Desde 10, 12 y 15 m, 3 pelotas cada uno: contá cuántas quedan adentro del círculo."), LessonDrill(id: "putt-1b", title: "Escalera", detail: "Pelotas a 6, 9 y 12 m: cada una tiene que pasar la anterior sin pasar 1 m el hoyo.")]),
        GolfLesson(id: "putt-2", category: "putt", title: "Embocar los cortos", minutes: 6,
                   why: "De un metro el promedio del Tour emboca casi todas. Cada una que se va es un golpe.",
                   steps: ["Elegí un punto en la línea a 30 cm de la pelota.", "Mantené la cabeza quieta hasta que suene.", "Mismo golpe, misma velocidad, siempre."],
                   drills: [LessonDrill(id: "putt-2a", title: "Reloj de un metro", detail: "4 pelotas alrededor del hoyo a 1 m. Si fallás, volvés a empezar."), LessonDrill(id: "putt-2b", title: "25 seguidos", detail: "Desde 80 cm: 25 embocados seguidos.")]),
        GolfLesson(id: "est-1", category: "estrategia", title: "Jugar a tu número", minutes: 6,
                   why: "Sumar menos no es pegar mejor: es elegir mejor.",
                   steps: ["Mirá la libreta del hoyo antes de salir.", "Elegí el lado de donde es más fácil el siguiente golpe.", "Si hay problema, jugá lejos del problema aunque quede más largo."],
                   drills: [LessonDrill(id: "est-1a", title: "Plan de la vuelta", detail: "Antes de jugar, escribí el palo de salida de cada hoyo."), LessonDrill(id: "est-1b", title: "Hoyo en el practice", detail: "Simulá 9 hoyos en el driving: salida, approach y palo, cambiando de hoyo.")]),
        GolfLesson(id: "est-2", category: "estrategia", title: "Después de un mal golpe", minutes: 5,
                   why: "El doble bogey casi siempre es un mal golpe seguido de una mala decisión.",
                   steps: ["Primero sacala a donde estés cómodo.", "No intentes el golpe heroico.", "Bogey es un buen resultado después de un error."],
                   drills: [LessonDrill(id: "est-2a", title: "Salida de los árboles", detail: "5 pelotas: sacala al fairway con un hierro bajo."), LessonDrill(id: "est-2b", title: "Regla del bogey", detail: "En tu próxima vuelta, anotá cuántas veces evitaste el doble.")])
    ]

    static func lesson(_ id: String) -> GolfLesson {
        all.first { $0.id == id } ?? all[0]
    }

    static func weakCategories(from totals: [SGTotals]) -> [SGCategory] {
        let n = max(totals.count, 1)
        let avg: [SGCategory: Double] = Dictionary(uniqueKeysWithValues: SGCategory.allCases.map { cat in
            (cat, totals.map { $0[cat] }.reduce(0, +) / Double(n))
        })
        return SGCategory.allCases.sorted { (avg[$0] ?? 0) < (avg[$1] ?? 0) }
    }
}

enum ExampleRounds {
    /// Simulated rounds on Azul lengths. Not anyone's real cards. Labeled "Datos de ejemplo".
    static let seeds: [(id: String, title: String, seed: Int)] = [
        ("e0", "Sáb 26-sep · Cancha Azul", 11),
        ("e1", "Sáb 3-oct · Cancha Azul", 23),
        ("e2", "Sáb 10-oct · Cancha Azul", 37),
        ("e3", "Sáb 17-oct · Cancha Azul", 41),
        ("e4", "Sáb 24-oct · Cancha Azul", 58),
        ("e5", "Sáb 31-oct · Cancha Azul", 73)
    ]

    static func simulate(seed: Int) -> [SGShot] {
        var rng = SeededRNG(seed)
        var shots: [SGShot] = []
        for n in 1...18 {
            let hole = AzulCourse.hole(n)
            var d = hole.meters
            var lie: SGLie = .salida
            var k = 0
            while lie != .hoyo && k < 10 {
                var endLie: SGLie
                var endM: Double
                var pen = false
                if lie == .green {
                    let feet = d * 3.2808
                    let p = feet < 3 ? 0.97 : feet < 6 ? 0.7 : feet < 10 ? 0.42 : feet < 20 ? 0.2 : feet < 40 ? 0.08 : 0.03
                    if rng.next() < p { endLie = .hoyo; endM = 0 }
                    else { endLie = .green; endM = feet < 25 ? 0.2 + rng.next() * 0.7 : 0.5 + rng.next() * 1.6 }
                } else if d <= 46 {
                    let q = rng.next()
                    if q < 0.08 { endLie = .hoyo; endM = 0 }
                    else if q < 0.85 { endLie = .green; endM = (1 + rng.next() * 5) * (d / 25 + 0.5) }
                    else { endLie = .rough; endM = d * (0.3 + rng.next() * 0.3) }
                } else if lie == .salida && hole.par >= 4 {
                    let carry = min(d - 60, 205 + (rng.next() - 0.5) * 45)
                    let q = rng.next()
                    endM = max(30, d - carry)
                    if q < 0.6 { endLie = .fairway }
                    else if q < 0.92 { endLie = .rough }
                    else if q < 0.975 { endLie = .bunker }
                    else { endLie = .agua; pen = true }
                } else if d <= 175 {
                    let p = (d < 100 ? 0.65 : d < 140 ? 0.45 : 0.28)
                        * (lie == .fairway || lie == .salida ? 1 : lie == .rough ? 0.7 : 0.55)
                    if rng.next() < p { endLie = .green; endM = 3 + rng.next() * 11 * (d / 110) }
                    else { endLie = rng.next() < 0.22 ? .bunker : .rough; endM = 6 + rng.next() * 24 }
                } else {
                    let carry = 150 + (rng.next() - 0.5) * 40
                    endM = max(20, d - carry)
                    endLie = rng.next() < 0.6 ? .fairway : .rough
                }
                let holed = endLie == .hoyo
                shots.append(StrokesGained.shot(
                    hole: n, index: k, startLie: lie, startM: d,
                    endLie: endLie, endM: endM, holed: holed, penalty: pen, par: hole.par
                ))
                lie = endLie == .agua ? .rough : endLie
                d = endM
                k += 1
            }
        }
        return shots
    }

    static func all() -> [(id: String, title: String, shots: [SGShot])] {
        seeds.map { ($0.id, $0.title, simulate(seed: $0.seed)) }
    }
}

struct SeededRNG {
    private var state: UInt32
    init(_ seed: Int) { state = UInt32(truncatingIfNeeded: seed) }
    mutating func next() -> Double {
        state = state &+ 0x6D2B79F5
        var t = state ^ (state >> 15)
        t = t &* (1 | t)
        t = t &+ ((t ^ (t >> 7)) &* (61 | t))
        t ^= t >> 14
        return Double(t) / 4294967296.0
    }
}

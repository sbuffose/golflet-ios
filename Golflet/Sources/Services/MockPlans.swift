import Foundation

enum MockPlans {
    static let setup = PlanSetup(
        courses: [
            PlanSetupCourse(clubCode: "118", course: "Azul", clubName: "Jockey Club Buenos Aires", holes: 18, mine: true),
            PlanSetupCourse(clubCode: "118", course: "Colorada", clubName: "Jockey Club Buenos Aires", holes: 18, mine: true)
        ],
        today: "2026-10-30"
    )

    static let clubs: [PlanBagEntry] = [
        bag("Dr", "Driver", 248, 268),
        bag("3W", "Madera 3", 220, 232),
        bag("Hy", "Híbrido", 195, 206),
        bag("4i", "Hierro 4", 185, 194),
        bag("5i", "Hierro 5", 174, 182),
        bag("6i", "Hierro 6", 162, 170),
        bag("7i", "Hierro 7", 150, 158),
        bag("8i", "Hierro 8", 138, 145),
        bag("9i", "Hierro 9", 126, 132),
        bag("PW", "PW", 114, 120),
        bag("SW", "SW", 88, 94),
        bag("LW", "LW", 68, 74)
    ]

    static func detail(id: String = "plan-azul-1", clubCode: String = "118", course: String = "Azul", date: String = "2026-10-30", teeTime: String = "09:30", startHole: Int = 1) -> PlanDetail {
        let map = courseMap(clubCode: clubCode, course: course)
        let pars: [Int?] = [5, 4, 4, 3, 4, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4, 5, 3, 4]
        let schedule = PlanCore.holeSchedule(teeTime: teeTime, startHole: startHole, minPerHole: 14, pars: pars)
        let wind = PlanWind(kmh: 14, fromDeg: 250, gustKmh: 22)
        let holes = schedule.map { row in
            let mapped = map.hole(row.hole)
            return PlanHoleRow(
                hole: row.hole,
                par: pars[safe: row.hole - 1] ?? nil,
                playLengthYd: mapped?.playLengthYd,
                eta: row.eta,
                order: row.order,
                minutes: row.minutes,
                bearingTrue: mapped?.bearingTrue,
                wind: wind,
                playsLikeYd: 8,
                wxTempC: 17.4,
                wxPrecipMm: 0,
                shots: [],
                relevamiento: false
            )
        }
        return PlanDetail(
            plan: PlanRecord(
                id: id,
                clubCode: clubCode,
                course: course,
                date: date,
                teeTime: teeTime,
                startHole: startHole,
                minPerHole: 14,
                distSource: "libreto",
                teeTimeID: nil
            ),
            course: PlanCourseInfo(
                clubCode: clubCode,
                course: course,
                clubName: clubCode == "209" ? "Mar del Plata Golf Club" : "Jockey Club Buenos Aires",
                numberingUnconfirmed: course.lowercased() == "azul",
                usualTee: "BLANCO",
                hasMap: true,
                hasGreenGuide: false
            ),
            holes: holes,
            forecastStatus: "ok",
            windModel: PlanCore.windLabel,
            torneo: .open
        )
    }

    static func courseMap(clubCode: String, course: String) -> CourseMap {
        CourseMap(clubCode: clubCode, course: course, holes: [hole1], markerRef: "centro")
    }

    private static func bag(_ code: String, _ label: String, _ carry: Int, _ total: Int) -> PlanBagEntry {
        PlanBagEntry(code: code, label: label, carryYd: carry, totalYd: total, gpsOK: false, gpsMean: nil, gpsCov: nil)
    }

    private static let hole1: CourseMapHole = {
        let tee = PlanLL(lng: -58.532351, lat: -34.485427)
        let mid = PlanLL(lng: -58.53055, lat: -34.48412)
        let front = PlanLL(lng: -58.52894679, lat: -34.48311941)
        let center = PlanLL(lng: -58.52881, lat: -34.48305197)
        let back = PlanLL(lng: -58.52870807, lat: -34.48298896)
        let line = [tee, mid, center]
        let fairway: [PlanLL] = [
            PlanLL(lng: -58.53255, lat: -34.48555),
            PlanLL(lng: -58.53205, lat: -34.48522),
            PlanLL(lng: -58.53025, lat: -34.48392),
            PlanLL(lng: -58.52895, lat: -34.48292),
            PlanLL(lng: -58.52855, lat: -34.48318),
            PlanLL(lng: -58.53085, lat: -34.48438)
        ]
        let green: [PlanLL] = [
            PlanLL(lng: -58.52905, lat: -34.48318),
            PlanLL(lng: -58.52870, lat: -34.48290),
            PlanLL(lng: -58.52855, lat: -34.48302),
            PlanLL(lng: -58.52892, lat: -34.48322)
        ]
        let bunkerPoly: [PlanLL] = [
            PlanLL(lng: -58.52935, lat: -34.48355),
            PlanLL(lng: -58.52910, lat: -34.48340),
            PlanLL(lng: -58.52900, lat: -34.48355),
            PlanLL(lng: -58.52925, lat: -34.48368)
        ]
        let marker150 = PlanLL(lng: -58.52972, lat: -34.48358)
        let marker200 = PlanLL(lng: -58.53012, lat: -34.48382)
        return CourseMapHole(
            hole: 1,
            line: line,
            playLengthYd: 521,
            tees: [CourseMapTee(center: tee, polygon: [], toGreenYd: 521)],
            green: CourseMapGreen(polygon: green, center: center, front: front, back: back),
            fairways: [fairway],
            bunkers: [CourseMapBunker(polygon: bunkerPoly, center: PlanLL(lng: -58.52918, lat: -34.48352))],
            water: [],
            woods: [],
            markers: [
                CourseMapMarker(yards: 200, fromTeeYd: 321, point: marker200, across: [
                    PlanLL(lng: -58.53032, lat: -34.48370), PlanLL(lng: -58.52992, lat: -34.48394)
                ], color: nil),
                CourseMapMarker(yards: 150, fromTeeYd: 371, point: marker150, across: [
                    PlanLL(lng: -58.52992, lat: -34.48346), PlanLL(lng: -58.52952, lat: -34.48370)
                ], color: nil)
            ],
            hazards: [
                CourseMapHazard(kind: "bunker", side: "der.", reachYd: 235, carryYd: 255, greenside: true, inPlay: true, text: "Bunker der. a 235–255 yd de la salida (carry 255)", center: PlanLL(lng: -58.52918, lat: -34.48352))
            ],
            bearingTrue: 52,
            cardYards: ["NEGRO": 542, "AZUL": 521, "BLANCO": 496, "AMARILLO": 468, "ROJO": 421],
            par: 5,
            coverageNotes: ["Fuera de límites (OB): no está mapeado en OSM."],
            markersRef: "centro"
        )
    }()
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

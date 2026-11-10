import XCTest
@testable import Golflet

final class ParityFixesTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
    }

    private func hole(number: Int, tee: GPSCoord?, pin: GPSCoord?) -> GPSHole {
        GPSHole(
            number: number,
            par: 4,
            hcp: 7,
            yards: ["blanco": 380],
            green: GPSGreen(front: nil, center: pin, back: nil),
            tee: tee
        )
    }

    func testRoundTrackMatchesThisCourseAndDoesNotGuess() {
        let azul = Course(clubCode: "118", clubName: "Jockey", name: "Azul", holes: [])
        let colorado = Course(clubCode: "118", clubName: "Jockey", name: "Colorado", holes: [])
        let other = Course(clubCode: "200", clubName: "Otro", name: "Azul", holes: [])
        let matched = RoundTrackCourse.match(courses: [azul, colorado, other], clubCode: "118", name: "Azul")
        XCTAssertEqual(matched?.name, "Azul")
        XCTAssertEqual(matched?.clubCode, "118")
        XCTAssertNil(RoundTrackCourse.match(courses: [azul, other], clubCode: "", name: "Azul"))
        XCTAssertEqual(RoundTrackCourse.match(courses: [colorado], clubCode: "", name: "colorado")?.clubCode, "118")
        XCTAssertNil(RoundTrackCourse.match(courses: [other], clubCode: "118", name: "Azul"))
    }

    func testWindFromConventionAndMissingBearing() {
        XCTAssertEqual(HoleWind.degrees(from: "N"), 0)
        XCTAssertEqual(HoleWind.degrees(from: "sur"), 180)
        XCTAssertEqual(HoleWind.degrees(from: "SO"), 225)
        XCTAssertNil(HoleWind.degrees(from: "variable"))

        let east = hole(number: 1, tee: GPSCoord(lat: 0, lng: 0), pin: GPSCoord(lat: 0, lng: 0.01))
        let bearing = HoleWind.bearing(of: east)
        XCTAssertEqual(bearing ?? -1, 90, accuracy: 1)
        XCTAssertEqual(HoleWind.relative(windFromDeg: 90, bearingDeg: bearing), .contra)
        XCTAssertEqual(HoleWind.relative(windFromDeg: 270, bearingDeg: bearing), .favor)
        XCTAssertEqual(HoleWind.relative(windFromDeg: 0, bearingDeg: bearing), .cruzado)

        let rows = HoleWind.rows(holes: [east], windFromDeg: 90, speedKmh: 20)
        XCTAssertEqual(rows.first?.relative, .contra)
        XCTAssertEqual(rows.first?.line, "Hoyo 1 · en contra · 20 km/h")

        let blind = hole(number: 2, tee: nil, pin: GPSCoord(lat: 1, lng: 1))
        let missing = HoleWind.rows(holes: [blind], windFromDeg: 180, speedKmh: 20)
        XCTAssertEqual(missing.first?.relative, .unavailable)
        XCTAssertTrue(missing.first?.line.contains("sin rumbo") == true)
        XCTAssertFalse(HoleWind.relativeText(windFromDeg: nil, holes: missing).contains("en contra"))
        XCTAssertTrue(HoleWind.relativeText(windFromDeg: 180, holes: []).contains("Sin rumbo verificado"))
    }

    func testWeatherUsesHoleBearingWhenItExists() {
        let east = hole(number: 3, tee: GPSCoord(lat: 0, lng: 0), pin: GPSCoord(lat: 0, lng: 0.02))
        var booking = TeeTime(id: "tt", startsAt: date(2026, 11, 7), clubName: "Jockey", clubCode: "118", course: "Azul", companions: [])
        booking.windKmh = 20
        booking.windFrom = "este"
        let report = WeatherPlay.report(booking: booking, rounds: [], bag: [], holes: [east]).lines.joined(separator: "\n")
        XCTAssertTrue(report.contains("en contra"))
        XCTAssertFalse(report.contains("palo más"))
        XCTAssertFalse(report.contains("a favor"))
    }

    func testLatestOfficialIndexBeatsOlderCard() {
        let october = HIPoint(date: date(2026, 10, 28), handicap: 3.1)
        let november = HIPoint(date: date(2026, 11, 4), handicap: 3.7)
        XCTAssertEqual(OfficialHandicap.latest(player: 3.1, history: [october, november]) ?? 0, 3.7, accuracy: 0.001)
        XCTAssertEqual(OfficialHandicap.latest(player: 3.1, history: []) ?? 0, 3.1, accuracy: 0.001)
        let home = StatsEngine.home(rounds: [], officialIndex: 3.7)
        XCTAssertEqual(home.handicapIndex, 3.7, accuracy: 0.001)
    }

    func testHIChangeNamesTheScorecardNotTheClub() {
        let card = IndexCardRef(id: "c1", date: date(2026, 10, 20), course: "Colorada", differential: 2, gross: 70)
        let text = HIChangeLabel.cardText(card)
        XCTAssertTrue(text.contains("Colorada"))
        XCTAssertTrue(text.contains("diferencial"))
        XCTAssertTrue(text.contains("gross 70"))
        XCTAssertFalse(text.contains("índice"))
        XCTAssertFalse(text.contains("Mar del Plata"))
        XCTAssertEqual(HIChangeLabel.indexLine(delta: 0.6), "El índice subió \(FormatAR.one(0.6))")
        XCTAssertTrue(HIChangeLabel.indexLine(delta: -0.4).contains("bajó"))
        XCTAssertEqual(HIChangeLabel.unidentified, "No puedo identificar la tarjeta.")
        let missing = IndexShift(verified: false, enteredBest8: [], leftBest8: [], agedOut: [], enteredWindow: [])
        XCTAssertTrue(HIChangeLabel.groups(missing).isEmpty)
        let aged = IndexCardRef(id: "n0", date: date(2026, 1, 1), course: "Nueva", differential: 12, gross: 90)
        let shift = IndexShift(verified: true, enteredBest8: [card], leftBest8: [], agedOut: [aged], enteredWindow: [])
        XCTAssertEqual(HIChangeLabel.groups(shift).map(\.title), ["Entró en las 8", "Salió de las últimas 20"])
    }

    func testMonthLabelsStayShortAndKeepCounts() {
        let bars = (1...8).map { month in
            MonthlyScoreBar(month: "", date: date(2026, month, 1), birdies: month, pars: month + 1)
        }
        let columns = MonthWindow.columns(from: bars, calendar: calendar)
        XCTAssertEqual(columns.count, 8)
        XCTAssertEqual(columns.map(\.shortLabel), ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago"])
        XCTAssertEqual(columns.first?.birdies, 1)
        XCTAssertEqual(columns.last?.pars, 9)
        XCTAssertEqual(columns.first?.fullLabel, "enero 2026")
        XCTAssertTrue(columns.first?.showsYear == true)
        XCTAssertFalse(columns[1].showsYear)
        XCTAssertEqual(MonthWindow.visible, 6)
        XCTAssertFalse(columns.contains { $0.shortLabel.contains(" ") })
    }

    func testGroupCreateDecodesFlatBodyAndKeepsRequestedName() {
        let parsed = GroupCreateDecode.group(from: ["id": "g-scratch", "invited": [String]()], requestedName: "Scratch")
        XCTAssertEqual(parsed?.id, "g-scratch")
        XCTAssertEqual(parsed?.name, "Scratch")
        XCTAssertNil(parsed?.photoURL)

        let numeric = GroupCreateDecode.group(from: ["id": 44], requestedName: "Scratch")
        XCTAssertEqual(numeric?.id, "44")
        XCTAssertEqual(numeric?.name, "Scratch")

        XCTAssertNil(GroupCreateDecode.group(from: ["invited": [String]()], requestedName: "Scratch"))
        XCTAssertNil(GroupsParser.group(from: ["id": "g-1"]))
    }

    func testGroupRetrySameNameAndOptionalPhoto() async throws {
        MockAPIClient.resetGroups()
        let api = MockAPIClient(autoSession: true)
        let first = try await api.createGroup(name: "Scratch", photoJPEG: nil, idempotencyKey: "submit-1")
        let retry = try await api.createGroup(name: "Scratch", photoJPEG: nil, idempotencyKey: "submit-1")
        XCTAssertEqual(first.id, retry.id)
        XCTAssertNil(first.photoURL)

        let other = try await api.createGroup(name: "Scratch", photoJPEG: nil, idempotencyKey: "submit-2")
        XCTAssertNotEqual(first.id, other.id)
        XCTAssertEqual(other.name, "Scratch")

        let withPhoto = try await api.updateGroup(id: first.id, name: nil, photoJPEG: Data([0xFF, 0xD8, 0xFF]))
        XCTAssertNotNil(withPhoto.photoURL)
        let listed = try await api.group(id: first.id)
        XCTAssertEqual(listed.photoURL, withPhoto.photoURL)

        let untouched = try await api.updateGroup(id: other.id, name: nil, photoJPEG: Data())
        XCTAssertNil(untouched.photoURL)
    }

    func testTrackConfirmsTeeFlagShotPenaltyAndDrop() {
        var state = TrackSession.State()
        let tee = TrackPoint(lat: 1, lng: 1)
        let flag = TrackPoint(lat: 1.001, lng: 1.001)
        let shot = TrackPoint(lat: 1.0004, lng: 1.0004)
        state = TrackSession.set(state, at: tee)
        XCTAssertEqual(state.phase, .confirmFlag)
        XCTAssertEqual(state.tee, tee)
        state = TrackSession.set(state, at: flag)
        XCTAssertEqual(state.phase, .tracking)

        let near = TrackSession.enter(state, at: shot, club: "PW", onCup: false)
        XCTAssertTrue(near.recorded)
        XCTAssertFalse(near.holed)
        XCTAssertEqual(near.state.strokeCount, 1)
        XCTAssertEqual(near.state.ball, shot)

        var penalty = TrackSession.beginPenalty(near.state)
        let whereItWent = TrackSession.enter(penalty, at: TrackPoint(lat: 1.002, lng: 1.002), club: nil, onCup: false)
        XCTAssertEqual(whereItWent.state.phase, .relief)
        XCTAssertEqual(whereItWent.state.strokeCount, 2)

        let reloaded = TrackSession.reload(whereItWent.state)
        XCTAssertEqual(reloaded.phase, .tracking)
        XCTAssertEqual(reloaded.ball, shot)
        XCTAssertEqual(reloaded.strokeCount, 2)

        penalty = TrackSession.beginPenalty(reloaded)
        let again = TrackSession.enter(penalty, at: TrackPoint(lat: 9, lng: 9), club: nil, onCup: false)
        var dropping = TrackSession.chooseDrop(again.state)
        XCTAssertEqual(dropping.phase, .drop)
        let drop = TrackPoint(lat: 1.0008, lng: 1.0008)
        dropping = TrackSession.set(dropping, at: drop)
        XCTAssertEqual(dropping.phase, .tracking)
        XCTAssertEqual(dropping.ball, drop)
        XCTAssertEqual(dropping.strokeCount, 3)
        XCTAssertEqual(dropping.marks.last?.drop, true)
        XCTAssertEqual(dropping.marks.last?.countsStroke, false)

        let cancelled = TrackSession.cancel(again.state)
        XCTAssertEqual(cancelled.phase, .tracking)
        XCTAssertEqual(cancelled.strokeCount, 2)

        XCTAssertFalse(TrackSession.onCup(meters: 3))
        XCTAssertTrue(TrackSession.onCup(meters: 0.4))
        XCTAssertEqual(TrackSession.puttFeet(meters: 3), 10)
        XCTAssertNil(TrackSession.puttFeet(meters: 40))

        let onTheCup = TrackSession.enter(state, at: flag, club: "PW", onCup: true, putting: false)
        XCTAssertFalse(onTheCup.holed)
        let putt = TrackSession.enter(state, at: flag, club: "Pt", onCup: true, putting: true)
        XCTAssertTrue(putt.holed)
        XCTAssertEqual(GroupPeriod.parse("12m"), .year)
        XCTAssertEqual(GroupPeriod.parse("3m"), .all)
        XCTAssertEqual(GroupPeriod.parse("1w"), .week)

        var played = TrackSession.set(TrackSession.State(), at: TrackPoint(lat: 1, lng: 1))
        played = TrackSession.set(played, at: TrackPoint(lat: 1.01, lng: 1.01))
        let lost = TrackSession.lostBall(played, at: TrackPoint(lat: 1.004, lng: 1.004), club: "Dr", provisional: true)
        XCTAssertEqual(lost.strokeCount, 3)
        XCTAssertEqual(lost.marks.map(\.lost), [true, false, false])
        XCTAssertEqual(lost.marks[1].penalty, true)
        XCTAssertEqual(lost.marks[2].provisional, true)
        XCTAssertEqual(lost.ball, TrackPoint(lat: 1.004, lng: 1.004))
        XCTAssertEqual(TrackSession.undoSpan(lost), 3)
        XCTAssertEqual(TrackSession.undo(lost).strokeCount, 0)
        XCTAssertEqual(TrackSession.holeClose(par: 4, strokes: 5, putts: 2), "5 golpes · 2 putts · Bogey")
        XCTAssertEqual(TrackSession.holeClose(par: 4, strokes: 5, putts: nil), "5 golpes · Putts sin confirmar · Bogey")
        XCTAssertEqual(TrackSession.suggest(yards: 150, bag: [("Driver", 230), ("7i", 155), ("Putter", nil)]), "7i")
        XCTAssertEqual(HoleWind.shotNote(kmh: nil, tempC: nil, rainMm: nil, from: nil), "Clima no disponible")
        XCTAssertFalse(HoleWind.shotNote(kmh: 18, tempC: 21, rainMm: 1, from: nil).contains("yd"))
        XCTAssertTrue(HoleWind.shotNote(kmh: 18, tempC: 21, rainMm: 1, from: nil).contains("18 km/h"))
    }
}

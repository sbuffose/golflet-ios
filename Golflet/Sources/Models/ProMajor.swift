import Foundation

/// Professional majors only. A club tournament never lights this badge.
/// Colors are that event's own marks, not the Golflet navy.
enum ProMajor {
    struct Event: Equatable, Sendable {
        var name: String
        var short: String
        var start: Date
        var end: Date
        var background: UInt32
        var foreground: UInt32
        var url: URL
    }

    static func current(on now: Date, calendar: Calendar = .current) -> Event? {
        events(calendar: calendar).first { event in
            let open = calendar.startOfDay(for: event.start)
            let close = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: event.end)) ?? event.end
            return now >= open && now < close
        }
    }

    static func events(calendar: Calendar) -> [Event] {
        [
            event("Masters", short: "Masters", year: 2026, month: 4, start: 9, end: 12, background: 0x006747, foreground: 0xFDE021, url: "https://www.masters.com", calendar: calendar),
            event("PGA Championship", short: "PGA", year: 2026, month: 5, start: 14, end: 17, background: 0x00205B, foreground: 0xC4A35A, url: "https://www.pgachampionship.com", calendar: calendar),
            event("U.S. Open", short: "U.S. Open", year: 2026, month: 6, start: 18, end: 21, background: 0x00205B, foreground: 0xBF0D3E, url: "https://www.usopen.com", calendar: calendar),
            event("The Open", short: "The Open", year: 2026, month: 7, start: 16, end: 19, background: 0x6B1C2B, foreground: 0xE4C56A, url: "https://www.theopen.com", calendar: calendar),
            event("Masters", short: "Masters", year: 2027, month: 4, start: 8, end: 11, background: 0x006747, foreground: 0xFDE021, url: "https://www.masters.com", calendar: calendar),
            event("Ryder Cup", short: "Ryder", year: 2027, month: 9, start: 17, end: 19, background: 0x012169, foreground: 0xC5B783, url: "https://www.rydercup.com", calendar: calendar)
        ]
    }

    private static func event(
        _ name: String,
        short: String,
        year: Int,
        month: Int,
        start: Int,
        end: Int,
        background: UInt32,
        foreground: UInt32,
        url: String,
        calendar: Calendar
    ) -> Event {
        Event(
            name: name,
            short: short,
            start: day(year, month, start, calendar),
            end: day(year, month, end, calendar),
            background: background,
            foreground: foreground,
            url: URL(string: url)!
        )
    }

    private static func day(_ year: Int, _ month: Int, _ day: Int, _ calendar: Calendar) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day)) ?? .distantPast
    }
}

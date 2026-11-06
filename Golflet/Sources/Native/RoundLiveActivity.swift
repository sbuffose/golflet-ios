import Foundation
import ActivityKit

@MainActor
enum RoundLiveActivity {
    private static var currentID: String?

    static func start(
        course: GPSCourseDetail,
        liveRound: LiveRound,
        here: GPSCoord?,
        shots: [Shot],
        practice: Bool = false,
        headingDeg: Double? = nil,
        windKmh: Int? = nil,
        windFromDeg: Double? = nil,
        matchHonor: String? = nil,
        matchStatus: String? = nil
    ) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let state = LiveRoundState.make(course: course, hole: liveRound.currentHole, here: here, shots: shots, practice: practice, headingDeg: headingDeg, windKmh: windKmh, windFromDeg: windFromDeg, matchHonor: matchHonor, matchStatus: matchStatus)
        let attributes = RoundActivityAttributes(
            courseName: course.course,
            clubName: course.clubName,
            liveRoundId: liveRound.id
        )
        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: Date().addingTimeInterval(60 * 60 * 6)),
                pushType: nil
            )
            currentID = activity.id
            for old in Activity<RoundActivityAttributes>.activities where old.id != activity.id {
                Task { await old.end(nil, dismissalPolicy: .immediate) }
            }
        } catch {
            return
        }
    }

    static func update(
        course: GPSCourseDetail,
        hole: Int,
        here: GPSCoord?,
        shots: [Shot],
        practice: Bool = false,
        headingDeg: Double? = nil,
        windKmh: Int? = nil,
        windFromDeg: Double? = nil,
        matchHonor: String? = nil,
        matchStatus: String? = nil
    ) {
        let state = LiveRoundState.make(
            course: course,
            hole: hole,
            here: here,
            shots: shots,
            practice: practice,
            headingDeg: headingDeg,
            windKmh: windKmh,
            windFromDeg: windFromDeg,
            matchHonor: matchHonor,
            matchStatus: matchStatus
        )
        let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(60 * 30))
        for activity in Activity<RoundActivityAttributes>.activities where activity.attributes.liveRoundId == currentLiveID() || currentID == activity.id {
            Task { await activity.update(content) }
        }
    }

    static func end() {
        for activity in Activity<RoundActivityAttributes>.activities {
            Task { await activity.end(nil, dismissalPolicy: .immediate) }
        }
        currentID = nil
    }

    private static func currentLiveID() -> String? {
        OfflinePlay.loadActive()?.roundId
    }
}

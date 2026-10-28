import Foundation
import ActivityKit

@MainActor
enum RoundLiveActivity {
    private static var currentID: String?

    static func start(course: GPSCourseDetail, liveRound: LiveRound, here: GPSCoord?, shots: [Shot]) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        end()
        let state = LiveRoundState.make(course: course, hole: liveRound.currentHole, here: here, shots: shots)
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
        } catch {
            currentID = nil
        }
    }

    static func update(course: GPSCourseDetail, hole: Int, here: GPSCoord?, shots: [Shot]) {
        let state = LiveRoundState.make(course: course, hole: hole, here: here, shots: shots)
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

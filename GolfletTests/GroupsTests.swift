import XCTest
@testable import Golflet

final class GroupsTests: XCTestCase {
    override func setUp() {
        super.setUp()
        PendingInviteStore.clear()
        MockAPIClient.resetGroups()
    }

    func testInviteUniversalAndCustomScheme() {
        XCTAssertEqual(
            GolfletURL.parse(URL(string: "https://golflet.vercel.app/g/invite-mdp")!),
            .openInvite(token: "invite-mdp")
        )
        XCTAssertEqual(
            GolfletURL.parse(URL(string: "https://www.golflet.vercel.app/g/abc-123")!),
            .openInvite(token: "abc-123")
        )
        XCTAssertEqual(
            GolfletURL.parse(URL(string: "golflet://g/invite-mdp")!),
            .openInvite(token: "invite-mdp")
        )
        XCTAssertEqual(GolfletURL.inviteURL(token: "invite-mdp").absoluteString, "https://golflet.vercel.app/g/invite-mdp")
        XCTAssertEqual(AssociatedDomains.applinks, "applinks:golflet.vercel.app")
        XCTAssertEqual(GolfletURL.parse(URL(string: "golflet://play?course=Jockey")!), .startRound(hint: "Jockey"))
        XCTAssertNil(GolfletURL.inviteToken(from: URL(string: "https://example.com/g/nope")!))
    }

    func testPendingTokenSurvivesLogin() async throws {
        PendingInviteStore.save("invite-mdp")
        XCTAssertEqual(PendingInviteStore.load(), "invite-mdp")

        let api = MockAPIClient(autoSession: false)
        XCTAssertFalse(api.isAuthenticated)
        _ = try await api.signInGolfistics(matricula: "94506", clave: "secreta", savePassword: true)
        let preview = try await api.invitePreview(token: PendingInviteStore.load()!)
        XCTAssertEqual(preview.name, "Sábados de MdP")
        XCTAssertEqual(preview.ownerName, "Clara Ruiz")
        XCTAssertFalse(preview.alreadyMember)

        let group = try await api.acceptInvite(token: preview.token)
        XCTAssertEqual(group.name, "Sábados de MdP")
        XCTAssertEqual(group.myRole, .member)
        PendingInviteStore.clear()
        XCTAssertNil(PendingInviteStore.load())
    }

    func testCreateGroupMakesCreatorAdminAndBuildsInviteURL() async throws {
        let api = MockAPIClient(autoSession: true)
        let group = try await api.createGroup(name: "  Birdie Club  ", photoJPEG: Data("foto".utf8))
        XCTAssertEqual(group.name, "Birdie Club")
        XCTAssertEqual(group.myRole, .admin)
        XCTAssertTrue(group.owner.isOwner)
        XCTAssertEqual(group.members.count, 1)
        XCTAssertEqual(group.invite?.url.host, "golflet.vercel.app")
        XCTAssertTrue(group.invite?.url.path.hasPrefix("/g/") == true)
        XCTAssertNotNil(group.photoURL)
    }

    func testAdminCanPromoteDemoteAndRemove() async throws {
        let api = MockAPIClient(autoSession: true)
        let promoted = try await api.setMemberRole(groupID: "g-jockey", userID: MockGroupStore.anaID, role: .admin)
        XCTAssertEqual(promoted.members.first { $0.id == MockGroupStore.anaID }?.role, .admin)

        let demoted = try await api.setMemberRole(groupID: "g-jockey", userID: MockGroupStore.anaID, role: .member)
        XCTAssertEqual(demoted.members.first { $0.id == MockGroupStore.anaID }?.role, .member)

        let removed = try await api.removeMember(groupID: "g-jockey", userID: MockGroupStore.anaID)
        XCTAssertFalse(removed.members.contains { $0.id == MockGroupStore.anaID })
    }

    func testAnyoneCanLeaveAndViewIsPerMember() async throws {
        let api = MockAPIClient(autoSession: true)
        var config = GroupViewConfig.default
        config.metrics = [.gross, .birdies]
        config.range = .threeMonths
        config.courseFilter = "Azul"
        let saved = try await api.saveGroupView(groupID: "g-jockey", config: config)
        XCTAssertEqual(saved.range, .threeMonths)
        XCTAssertEqual(saved.courseFilter, "Azul")
        XCTAssertEqual(try await api.groupView(groupID: "g-jockey").metrics, [.gross, .birdies])

        try await api.leaveGroup(id: "g-jockey")
        let remaining = try await api.groups()
        XCTAssertFalse(remaining.contains { $0.id == "g-jockey" })
    }

    func testSharePrefsHideMetricFromRanking() async throws {
        let api = MockAPIClient(autoSession: true)
        let comparison = try await api.groupComparison(groupID: "g-jockey", config: .default)
        let handicap = comparison.rows.first { $0.metric == .handicap }
        XCTAssertNotNil(handicap)
        let ana = handicap?.values.first { $0.memberID == MockGroupStore.anaID }
        XCTAssertEqual(ana?.shared, false)
        XCTAssertEqual(ana?.display, "No compartido")
        XCTAssertFalse(handicap?.ranked().contains { $0.memberID == MockGroupStore.anaID } == true)
        XCTAssertEqual(handicap?.rank(of: MockGroupStore.anaID), nil)
        XCTAssertNotNil(handicap?.rank(of: MockGroupStore.meID))
    }

    func testQueCompartoNeverListsPrivateNotes() {
        let titles = ShareCategory.allCases.map(\.title).joined(separator: " ").lowercased()
        XCTAssertFalse(titles.contains("nota"))
        XCTAssertFalse(titles.contains("voz"))
        XCTAssertFalse(titles.contains("estrateg"))
        XCTAssertEqual(ShareCategory.allCases.count, 9)
        XCTAssertEqual(SharePrefs.allShared.jsonBody["voice"], nil)
        XCTAssertEqual(SharePrefs.allShared.jsonBody["notes"], nil)
        XCTAssertEqual(SharePrefs.allShared.jsonBody["strategy"], nil)
    }

    func testParsesFlexibleGroupPayload() {
        let json: [String: Any] = [
            "group": [
                "id": "g1",
                "name": "Birdies",
                "photo_url": "https://golflet.vercel.app/g/p.jpg",
                "my_role": "admin",
                "owner": ["id": "u1", "name": "Ana Pérez", "role": "admin", "is_owner": true],
                "members": [
                    ["id": "u1", "name": "Ana Pérez", "role": "admin", "is_owner": true],
                    ["user_id": "u2", "display_name": "Luis Gómez", "role": "member"]
                ],
                "invite": ["token": "tok-1", "enabled": true]
            ]
        ]
        let group = GroupsParser.group(from: json)
        XCTAssertEqual(group?.name, "Birdies")
        XCTAssertEqual(group?.members.count, 2)
        XCTAssertEqual(group?.invite?.url.absoluteString, "https://golflet.vercel.app/g/tok-1")
        XCTAssertTrue(group?.isAdmin == true)
    }

    func testRegenerateAndDisableInvite() async throws {
        let api = MockAPIClient(autoSession: true)
        let original = try await api.group(id: "g-jockey").invite?.token
        let next = try await api.regenerateInvite(groupID: "g-jockey")
        XCTAssertNotEqual(next.token, original)
        XCTAssertTrue(next.enabled)
        let disabled = try await api.disableInvite(groupID: "g-jockey")
        XCTAssertFalse(disabled.enabled)
    }
}

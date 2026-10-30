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
        let view = try await api.groupView(groupID: "g-jockey")
        XCTAssertEqual(view.metrics, [.gross, .birdies])

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
        XCTAssertEqual(ShareCategory.allCases.count, 11)
        XCTAssertNil(SharePrefs.allShared.jsonBody["voice"])
        XCTAssertNil(SharePrefs.allShared.jsonBody["notes"])
        XCTAssertNil(SharePrefs.allShared.jsonBody["strategy"])
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
                "link": ["url": "https://golflet.vercel.app/g/tok-1", "enabled": true]
            ]
        ]
        let group = GroupsParser.group(from: json)
        XCTAssertEqual(group?.name, "Birdies")
        XCTAssertEqual(group?.members.count, 2)
        XCTAssertEqual(group?.invite?.url.absoluteString, "https://golflet.vercel.app/g/tok-1")
        XCTAssertTrue(group?.isAdmin == true)
    }

    func testParsesGroupsV2JoinAndSharing() {
        XCTAssertEqual(GroupsAPIPaths.sharePrefs, "/api/me/sharing")
        XCTAssertEqual(GroupsAPIPaths.join("abc"), "/api/groups/join/abc")
        XCTAssertEqual(GroupsAPIPaths.link("g1"), "/api/groups/g1/link")
        XCTAssertEqual(GroupsAPIPaths.photo("g1"), "/api/groups/g1/photo")

        let invite = GroupsParser.invite(
            from: [
                "status": "pending",
                "group": [
                    "id": "g9",
                    "name": "Sábados",
                    "owner": "Clara Ruiz",
                    "members": 3,
                    "photo_url": "https://golflet.vercel.app/p.jpg"
                ]
            ],
            fallbackToken: "invite-mdp"
        )
        XCTAssertEqual(invite?.token, "invite-mdp")
        XCTAssertEqual(invite?.name, "Sábados")
        XCTAssertEqual(invite?.ownerName, "Clara Ruiz")
        XCTAssertEqual(invite?.groupID, "g9")

        let pending = GroupsParser.invites(from: [
            "invitations": [
                ["group_id": "g2", "name": "Birdie Club", "invited_by": "Ana"]
            ]
        ])
        XCTAssertEqual(pending.first?.token, "group:g2")
        XCTAssertEqual(pending.first?.name, "Birdie Club")

        let prefs = GroupsParser.sharePrefs(from: [
            "prefs": ["scores": true, "handicap": false, "score_types": true, "gps": false]
        ])
        XCTAssertTrue(prefs.scoring)
        XCTAssertFalse(prefs.handicap)
        XCTAssertTrue(prefs.birdiesPars)
        XCTAssertFalse(prefs.gpsDistances)
        XCTAssertEqual((SharePrefs.allShared.jsonBody["prefs"] as? [String: Any])?["scores"] as? Bool, true)
        XCTAssertEqual((SharePrefs.allShared.jsonBody["prefs"] as? [String: Any])?["profile"] as? Bool, true)
        XCTAssertEqual((SharePrefs.allShared.jsonBody["prefs"] as? [String: Any])?["rounds_detail"] as? Bool, false)
        XCTAssertNil((SharePrefs.allShared.jsonBody["prefs"] as? [String: Any])?["voice"])

        let periodPrefs = GroupsParser.sharePrefs(from: [
            "prefs": ["profile": false, "rounds_detail": true]
        ])
        XCTAssertFalse(periodPrefs.profile)
        XCTAssertTrue(periodPrefs.holeByHole)
    }

    func testGroupPeriodLeaderboardAndHiddenScores() async throws {
        XCTAssertEqual(GroupsAPIPaths.period("g-jockey", kind: .semana, off: 0), "/api/groups/g-jockey/period?kind=semana&off=0")
        XCTAssertEqual(GroupsAPIPaths.memberProfile("g1", memberID: "ana"), "/api/groups/g1/members/ana/profile")
        XCTAssertTrue(GroupsAPIPaths.memberRound("g1", memberID: "ana", roundID: "r/1").contains("/rounds/"))

        let api = MockAPIClient(autoSession: true)
        let week = try await api.groupPeriod(groupID: "g-jockey", kind: .semana, off: 0)
        XCTAssertEqual(week.leaderboard.rows.first?.memberID, MockGroupStore.meID)
        XCTAssertEqual(week.leaderboard.rest.first?.state, .hidden)
        XCTAssertEqual(week.leaderboard.rest.first?.memberID, MockGroupStore.anaID)
        XCTAssertTrue(week.gpsOrCardsAny)
        XCTAssertFalse(week.member(MockGroupStore.anaID)?.profileShared ?? true)

        let empty = try await api.groupPeriod(groupID: "g-jockey", kind: .mes, off: 1)
        XCTAssertTrue(empty.leaderboard.rows.isEmpty)
        XCTAssertFalse(empty.gpsOrCardsAny)

        let me = try await api.memberProfile(groupID: "g-jockey", memberID: MockGroupStore.meID)
        XCTAssertTrue(me.member.isMe)
        XCTAssertFalse(me.locked)
        XCTAssertEqual(me.rounds?.count, 2)

        let ana = try await api.memberProfile(groupID: "g-jockey", memberID: MockGroupStore.anaID)
        XCTAssertTrue(ana.locked)
        XCTAssertNil(ana.rounds)

        let card = try await api.memberRound(groupID: "g-jockey", memberID: MockGroupStore.meID, roundID: "r-demo-1")
        XCTAssertEqual(card.holes.count, 18)
        XCTAssertEqual(card.gross, 76)

        do {
            _ = try await api.memberRound(groupID: "g-jockey", memberID: MockGroupStore.anaID, roundID: "x")
            XCTFail("Ana no comparte tarjetas")
        } catch let error as GolfletError {
            XCTAssertEqual(error.httpStatus, 403)
        }

        let parsed = GroupsParser.period(from: [
            "group": ["id": "g1", "name": "Birdies"],
            "period": ["kind": "semana", "off": 0, "short": "esta", "label": "lun–dom", "in_progress": true, "prev_off": 1],
            "members": [[
                "member_id": "u1",
                "name": "Ana Pérez",
                "is_me": true,
                "profile": true,
                "stats": ["best_net": ["v": -3, "n": 1]]
            ]],
            "stats": [["key": "best_net", "short": "Neto", "label": "Mejor neto", "fmt": "tp", "low": true]],
            "boards": ["best_net": ["leaders": ["u1"], "ranked": true, "rows": [["member_id": "u1", "pos": 1, "state": "ranked"]]]],
            "leaderboard": ["rows": [["member_id": "u1", "pos": 1]], "rest": []],
            "mins": ["r": 1, "gh": 9, "dr": 9],
            "data": ["gps_or_cards_any": true]
        ], fallbackKind: .mes, fallbackOff: 2)
        XCTAssertEqual(parsed.groupName, "Birdies")
        XCTAssertEqual(parsed.period.kind, .semana)
        XCTAssertEqual(parsed.leaderboard.rows.first?.pos, 1)
        XCTAssertEqual(parsed.member("u1")?.stats["best_net"]?.value, -3)
    }

    func testNeedsClubDoesNotStoreUntilSuccess() async throws {
        let api = MockAPIClient(autoSession: false)
        do {
            _ = try await api.linkClub(matricula: "124", password: "clave123", savePassword: true, progressID: "p1")
            XCTFail("Tenía que pedir club")
        } catch let error as GolfletError {
            XCTAssertEqual(error.needsClub?.clubs.first?.id, 124)
            XCTAssertTrue(error.needsClub?.clubs.contains { $0.name.contains("San Isidro") } == true)
        }
        XCTAssertFalse(api.isAuthenticated)

        do {
            _ = try await api.linkClub(matricula: "124", password: "mala", savePassword: true, progressID: "p2", clubID: 124)
            XCTFail("Clave mala")
        } catch let error as GolfletError {
            XCTAssertEqual(error, .wrongGolfisticsCredentials)
        }

        let ok = try await api.linkClub(matricula: "124", password: "clave123", savePassword: true, progressID: "p3", clubID: 124)
        XCTAssertTrue(ok.ok)
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

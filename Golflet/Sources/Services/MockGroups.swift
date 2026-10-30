import Foundation

extension MockAPIClient {
    private static let groupsLock = NSLock()
    private static var store = MockGroupStore.seed()

    static func resetGroups() {
        groupsLock.lock()
        store = MockGroupStore.seed()
        groupsLock.unlock()
        resetNotifications()
    }

    func groups() async throws -> [GolfletGroup] {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-no-groups") {
            return []
        }
        return mutate { store, me in
            store.groups.filter { $0.members.contains { $0.id == me } }
        }
    }

    func createGroup(name: String, photoJPEG: Data?) async throws -> GolfletGroup {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw GolfletError.server("Ponéle un nombre al grupo.") }
        let me = currentMember(role: .admin, owner: true)
        let token = "invite-\(UUID().uuidString.prefix(8).lowercased())"
        let group = GolfletGroup(
            id: "g-\(UUID().uuidString.prefix(8).lowercased())",
            name: trimmed,
            photoURL: photoJPEG == nil ? nil : "mock://group/\(token)",
            owner: me,
            members: [me],
            myRole: .admin,
            invite: .make(token: token)
        )
        return mutate { store, _ in
            store.groups.append(group)
            store.views[group.id] = .default
            return group
        }
    }

    func group(id: String) async throws -> GolfletGroup {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return try mutate { store, me in
            guard let group = store.groups.first(where: { $0.id == id && $0.members.contains { $0.id == me } }) else {
                throw GolfletError.server("No encontramos ese grupo.")
            }
            return group
        }
    }

    func updateGroup(id: String, name: String?, photoJPEG: Data?) async throws -> GolfletGroup {
        try requireAdmin(id)
        return try mutate { store, _ in
            guard let index = store.groups.firstIndex(where: { $0.id == id }) else {
                throw GolfletError.server("No encontramos ese grupo.")
            }
            if let name {
                let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { throw GolfletError.server("Ponéle un nombre al grupo.") }
                store.groups[index].name = trimmed
            }
            if photoJPEG != nil {
                store.groups[index].photoURL = "mock://group/\(id)"
            }
            return store.groups[index]
        }
    }

    func leaveGroup(id: String) async throws {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        try mutate { store, me in
            guard let index = store.groups.firstIndex(where: { $0.id == id }) else { return }
            store.groups[index].members.removeAll { $0.id == me }
            if store.groups[index].members.isEmpty {
                store.groups.remove(at: index)
            } else if store.groups[index].owner.id == me, let next = store.groups[index].members.first {
                store.groups[index].owner = next
            }
        }
    }

    func removeMember(groupID: String, userID: String) async throws -> GolfletGroup {
        try requireAdmin(groupID)
        return try mutate { store, me in
            guard let index = store.groups.firstIndex(where: { $0.id == groupID }) else {
                throw GolfletError.server("No encontramos ese grupo.")
            }
            guard userID != me else { throw GolfletError.server("Para irte usá Salir del grupo.") }
            store.groups[index].members.removeAll { $0.id == userID }
            return store.groups[index]
        }
    }

    func setMemberRole(groupID: String, userID: String, role: GroupRole) async throws -> GolfletGroup {
        try requireAdmin(groupID)
        return try mutate { store, _ in
            guard let index = store.groups.firstIndex(where: { $0.id == groupID }) else {
                throw GolfletError.server("No encontramos ese grupo.")
            }
            guard let memberIndex = store.groups[index].members.firstIndex(where: { $0.id == userID }) else {
                throw GolfletError.server("Esa persona ya no está en el grupo.")
            }
            store.groups[index].members[memberIndex].role = role
            if userID == MockGroupStore.meID {
                store.groups[index].myRole = role
            }
            return store.groups[index]
        }
    }

    func regenerateInvite(groupID: String) async throws -> GroupInviteLink {
        try requireAdmin(groupID)
        return try mutate { store, _ in
            guard let index = store.groups.firstIndex(where: { $0.id == groupID }) else {
                throw GolfletError.server("No encontramos ese grupo.")
            }
            let link = GroupInviteLink.make(token: "invite-\(UUID().uuidString.prefix(8).lowercased())")
            store.groups[index].invite = link
            return link
        }
    }

    func disableInvite(groupID: String) async throws -> GroupInviteLink {
        try requireAdmin(groupID)
        return try mutate { store, _ in
            guard let index = store.groups.firstIndex(where: { $0.id == groupID }) else {
                throw GolfletError.server("No encontramos ese grupo.")
            }
            var link = store.groups[index].invite ?? .make(token: "disabled")
            link.enabled = false
            store.groups[index].invite = link
            return link
        }
    }

    func pendingInvites() async throws -> [GroupInvitePreview] {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return mutate { $0.pending }
    }

    func invitePreview(token: String) async throws -> GroupInvitePreview {
        try mutate { store, me in
            if let pending = store.pending.first(where: { $0.token == token }) {
                return pending
            }
            if let group = store.groups.first(where: { $0.invite?.token == token }) {
                return GroupInvitePreview(
                    token: token,
                    groupID: group.id,
                    name: group.name,
                    photoURL: group.photoURL,
                    ownerName: group.owner.name,
                    ownerInitials: group.owner.initials,
                    members: group.members,
                    alreadyMember: group.members.contains { $0.id == me }
                )
            }
            throw GolfletError.server("Esa invitación ya no vale.")
        }
    }

    func acceptInvite(token: String) async throws -> GolfletGroup {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        let group = try mutate { store, me in
            if let pendingIndex = store.pending.firstIndex(where: { $0.token == token }) {
                let pending = store.pending.remove(at: pendingIndex)
                if let existing = store.groups.firstIndex(where: { $0.id == pending.groupID }) {
                    if !store.groups[existing].members.contains(where: { $0.id == me }) {
                        store.groups[existing].members.append(currentMember(role: .member, owner: false))
                    }
                    store.groups[existing].myRole = store.groups[existing].members.first { $0.id == me }?.role ?? .member
                    return store.groups[existing]
                }
                let member = currentMember(role: .member, owner: false)
                let owner = GroupMember(
                    id: "owner-\(pending.token)",
                    name: pending.ownerName,
                    initials: pending.ownerInitials,
                    photoURL: nil,
                    role: .admin,
                    isOwner: true
                )
                let group = GolfletGroup(
                    id: pending.groupID ?? "g-\(pending.token)",
                    name: pending.name,
                    photoURL: pending.photoURL,
                    owner: owner,
                    members: pending.members + [member],
                    myRole: .member,
                    invite: .make(token: token, enabled: false)
                )
                store.groups.append(group)
                store.views[group.id] = .default
                return group
            }
            guard let index = store.groups.firstIndex(where: { $0.invite?.token == token && $0.invite?.enabled == true }) else {
                throw GolfletError.server("Esa invitación ya no vale.")
            }
            if !store.groups[index].members.contains(where: { $0.id == me }) {
                store.groups[index].members.append(currentMember(role: .member, owner: false))
            }
            store.groups[index].myRole = store.groups[index].members.first { $0.id == me }?.role ?? .member
            return store.groups[index]
        }
        Self.dropInviteNotification(token: token)
        return group
    }

    func declineInvite(token: String) async throws {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        mutate { store, _ in
            store.pending.removeAll { $0.token == token }
        }
        Self.dropInviteNotification(token: token)
    }

    func groupView(groupID: String) async throws -> GroupViewConfig {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return mutate { $0.views[groupID] ?? .default }
    }

    func saveGroupView(groupID: String, config: GroupViewConfig) async throws -> GroupViewConfig {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return mutate { store, _ in
            store.views[groupID] = config
            return config
        }
    }

    func sharePrefs() async throws -> SharePrefs {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return mutate { $0.share[MockGroupStore.meID] ?? .allShared }
    }

    func saveSharePrefs(_ prefs: SharePrefs) async throws -> SharePrefs {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return mutate { store, _ in
            store.share[MockGroupStore.meID] = prefs
            return prefs
        }
    }

    func groupComparison(groupID: String, config: GroupViewConfig) async throws -> GroupComparison {
        let group = try await group(id: groupID)
        let prefsByMember = mutate { store, _ in store.share }
        let rows = config.metrics.map { metric in
            GroupComparisonRow(
                metric: metric,
                values: group.members.map { member in
                    let shared = (prefsByMember[member.id] ?? .allShared).isShared(metric.category)
                    let sample = MockGroupStore.sample(metric: metric, memberID: member.id)
                    return MemberMetricValue(
                        memberID: member.id,
                        memberName: member.name,
                        initials: member.initials,
                        shared: shared,
                        value: shared ? sample.value : nil,
                        text: shared ? sample.text : nil
                    )
                }
            )
        }
        return GroupComparison(groupID: groupID, config: config, rows: rows)
    }

    func groupPeriod(groupID: String, kind: ComparativoKind, off: Int) async throws -> ComparativoData {
        _ = try await group(id: groupID)
        return MockComparativo.period(groupID: groupID, kind: kind, off: off)
    }

    func memberProfile(groupID: String, memberID: String) async throws -> GroupMemberProfile {
        _ = try await group(id: groupID)
        guard let profile = MockComparativo.profile(groupID: groupID, memberID: memberID) else {
            throw GolfletError.http(status: 404, message: "Esa persona no está en el grupo.")
        }
        return profile
    }

    func memberRound(groupID: String, memberID: String, roundID: String) async throws -> SharedScorecard {
        _ = try await group(id: groupID)
        let profile = try await memberProfile(groupID: groupID, memberID: memberID)
        if profile.rounds == nil {
            throw GolfletError.http(status: 403, message: "No comparte sus tarjetas hoyo por hoyo.")
        }
        guard let card = MockComparativo.card(groupID: groupID, memberID: memberID, roundID: roundID) else {
            throw GolfletError.http(status: 404, message: "No encontramos esa tarjeta.")
        }
        return card
    }

    private func requireAdmin(_ groupID: String) throws {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        try mutate { store, me in
            guard let group = store.groups.first(where: { $0.id == groupID }) else {
                throw GolfletError.server("No encontramos ese grupo.")
            }
            guard group.members.first(where: { $0.id == me })?.role == .admin else {
                throw GolfletError.server("Solo un admin puede hacer eso.")
            }
        }
    }

    private func currentMember(role: GroupRole, owner: Bool) -> GroupMember {
        GroupMember(
            id: MockGroupStore.meID,
            name: "Jugador Demo",
            initials: "JD",
            photoURL: nil,
            role: role,
            isOwner: owner
        )
    }

    private func mutate<T>(_ work: (inout MockGroupStore, String) throws -> T) rethrows -> T {
        Self.groupsLock.lock()
        defer { Self.groupsLock.unlock() }
        return try work(&Self.store, MockGroupStore.meID)
    }

    private func mutate<T>(_ work: (MockGroupStore) -> T) -> T {
        Self.groupsLock.lock()
        defer { Self.groupsLock.unlock() }
        return work(Self.store)
    }
}

struct MockGroupStore: Sendable {
    static let meID = "demo"
    static let anaID = "ana"
    static let luisID = "luis"

    var groups: [GolfletGroup]
    var pending: [GroupInvitePreview]
    var views: [String: GroupViewConfig]
    var share: [String: SharePrefs]

    static func seed() -> MockGroupStore {
        let me = GroupMember(id: meID, name: "Jugador Demo", initials: "JD", photoURL: nil, role: .admin, isOwner: true)
        let ana = GroupMember(id: anaID, name: "Ana Pérez", initials: "AP", photoURL: nil, role: .member, isOwner: false)
        let luis = GroupMember(id: luisID, name: "Luis Gómez", initials: "LG", photoURL: nil, role: .admin, isOwner: false)
        let jockey = GolfletGroup(
            id: "g-jockey",
            name: "Los del Jockey",
            photoURL: nil,
            owner: me,
            members: [me, ana, luis],
            myRole: .admin,
            invite: .make(token: "invite-jockey")
        )
        var anaShare = SharePrefs.allShared
        anaShare.handicap = false
        anaShare.gpsDistances = false
        anaShare.profile = false
        anaShare.scoring = false
        var meShare = SharePrefs.allShared
        meShare.holeByHole = true
        var luisShare = SharePrefs.allShared
        luisShare.holeByHole = true
        let pending = GroupInvitePreview(
            token: "invite-mdp",
            groupID: "g-mdp",
            name: "Sábados de MdP",
            photoURL: nil,
            ownerName: "Clara Ruiz",
            ownerInitials: "CR",
            members: [
                GroupMember(id: "clara", name: "Clara Ruiz", initials: "CR", photoURL: nil, role: .admin, isOwner: true),
                GroupMember(id: "nico", name: "Nico Díaz", initials: "ND", photoURL: nil, role: .member, isOwner: false)
            ],
            alreadyMember: false
        )
        return MockGroupStore(
            groups: [jockey],
            pending: [pending],
            views: ["g-jockey": .default],
            share: [meID: meShare, anaID: anaShare, luisID: luisShare]
        )
    }

    static func sample(metric: GroupMetricKind, memberID: String) -> (value: Double?, text: String?) {
        let shift: Double = {
            switch memberID {
            case meID: return 0
            case anaID: return -1.4
            case luisID: return 2.1
            default: return 0.8
            }
        }()
        switch metric {
        case .gross: return (80 + shift, nil)
        case .net: return (73 + shift, nil)
        case .handicap: return (3.1 + shift, nil)
        case .birdies: return (18 - shift, nil)
        case .pars: return (42 + shift, nil)
        case .eagles: return (memberID == meID ? 3 : 1, nil)
        case .gir: return (48 + shift, nil)
        case .fir: return (56 + shift, nil)
        case .putts: return (31.2 + shift * 0.4, nil)
        case .gpsDrive: return (228 + shift * 4, nil)
        case .bagCarry: return (214 + shift * 3, nil)
        case .ball: return (nil, memberID == anaID ? "Pro V1" : "TP5x")
        }
    }
}

enum MockComparativo {
    static func period(groupID: String, kind: ComparativoKind, off: Int) -> ComparativoData {
        let empty = off > 0
        let stats = Self.stats
        let members = empty ? Self.members(withRounds: false) : Self.members(withRounds: true)
        let boards = Dictionary(uniqueKeysWithValues: stats.map { def in
            (def.key, board(for: def, members: members, empty: empty))
        })
        let leaderRows: [ComparativoLeaderRow]
        let rest: [ComparativoLeaderRow]
        if empty {
            leaderRows = []
            rest = members.map { ComparativoLeaderRow(memberID: $0.memberID, pos: 0, state: .noData) }
        } else {
            leaderRows = [
                ComparativoLeaderRow(memberID: MockGroupStore.meID, pos: 1, state: .ranked),
                ComparativoLeaderRow(memberID: MockGroupStore.luisID, pos: 2, state: .ranked)
            ]
            rest = [ComparativoLeaderRow(memberID: MockGroupStore.anaID, pos: 0, state: .hidden)]
        }
        return ComparativoData(
            groupID: groupID,
            groupName: "Los del Jockey",
            period: ComparativoPeriod(
                kind: kind,
                off: off,
                short: kind == .semana ? (off == 0 ? "27–2 nov" : "20–26 oct") : (off == 0 ? "Octubre" : "Septiembre"),
                label: kind == .semana ? (off == 0 ? "lun 27 oct – dom 2 nov" : "lun 20 oct – dom 26 oct") : (off == 0 ? "octubre 2026" : "septiembre 2026"),
                inProgress: off == 0,
                prevOff: off + 1,
                nextOff: off == 0 ? nil : off - 1
            ),
            members: members,
            stats: stats,
            boards: boards,
            leaderboard: ComparativoLeaderboard(rows: leaderRows, rest: rest),
            mins: ComparativoMins(r: 1, gh: 9, dr: 9, mg: 3, pr: 1, gp: 6),
            gpsOrCardsAny: !empty
        )
    }

    static func profile(groupID: String, memberID: String) -> GroupMemberProfile? {
        let names = [
            MockGroupStore.meID: "Jugador Demo",
            MockGroupStore.anaID: "Ana Pérez",
            MockGroupStore.luisID: "Luis Gómez"
        ]
        guard let name = names[memberID] else { return nil }
        let isMe = memberID == MockGroupStore.meID
        if memberID == MockGroupStore.anaID {
            return GroupsParser.lockedProfile(
                groupID: groupID,
                groupName: "Los del Jockey",
                memberID: memberID,
                name: name,
                isMe: false
            )
        }
        let year = ProfileYear(
            rounds: 18,
            avgGross: memberID == MockGroupStore.luisID ? 82.4 : 79.1,
            bestGross: memberID == MockGroupStore.luisID ? "76" : "72",
            avgNet: memberID == MockGroupStore.luisID ? 74.2 : 71.8,
            bestNet: memberID == MockGroupStore.luisID ? "69" : "67",
            handicapIndex: memberID == MockGroupStore.luisID ? 5.2 : 3.1,
            types: [
                "eagles": ProfileTypeStat(perRound: 0.1, total: 2),
                "birdies": ProfileTypeStat(perRound: 2.4, total: 43),
                "pars": ProfileTypeStat(perRound: 9.1, total: 164),
                "bogeys": ProfileTypeStat(perRound: 5.2, total: 94)
            ],
            par: [
                "par3": ProfileParStat(avg: 3.21, n: 72),
                "par4": ProfileParStat(avg: 4.38, n: 198),
                "par5": ProfileParStat(avg: 5.12, n: 54)
            ],
            putting: ProfilePutting(rounds: 12, roundsGir: 12, roundsFir: 11, avgPutts: 30.4, avgGir: 8.2, avgFir: 9.1)
        )
        let rounds = [
            ProfileRound(roundID: "r-\(memberID)-1", date: Date(), dateLabel: ComparativoFormat.day(Date()), courseLabel: "Azul", gross: 76, net: 73, toPar: 4),
            ProfileRound(roundID: "r-\(memberID)-2", date: Date().addingTimeInterval(-86400 * 8), dateLabel: ComparativoFormat.day(Date().addingTimeInterval(-86400 * 8)), courseLabel: "Colorada", gross: 81, net: 77, toPar: 9)
        ]
        return GroupMemberProfile(
            groupID: groupID,
            groupName: "Los del Jockey",
            member: ComparativoMember(
                memberID: memberID,
                name: name,
                initials: GroupsParser.initials(name),
                color: nil,
                isMe: isMe,
                profileShared: true,
                stats: [:]
            ),
            locked: false,
            clubs: ["Jockey Club Buenos Aires"],
            shares: [
                "scores": true,
                "handicap": true,
                "score_types": true,
                "holes": true,
                "gir_fir": true,
                "putting": true,
                "rounds_detail": true
            ],
            year: year,
            hiHistory: [
                HIPoint(date: Date().addingTimeInterval(-86400 * 360), handicap: 4.2),
                HIPoint(date: Date(), handicap: year.handicapIndex ?? 3.1)
            ],
            rounds: rounds
        )
    }

    static func card(groupID: String, memberID: String, roundID: String) -> SharedScorecard? {
        _ = roundID
        guard let profile = profile(groupID: groupID, memberID: memberID) else { return nil }
        let holes = (1...18).map { number -> SharedHole in
            let par = [5, 5, 4, 4, 3, 4, 4, 4, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5][number - 1]
            let score = par + (number == 2 ? -1 : number == 8 ? 1 : 0)
            return SharedHole(hole: number, par: par, score: score)
        }
        return SharedScorecard(
            groupID: groupID,
            member: profile.member,
            date: Date(),
            dateLabel: ComparativoFormat.day(Date()),
            courseLabel: "Azul",
            gross: 76,
            net: 73,
            toPar: 4,
            putts: 30,
            gir: 8,
            fir: 9,
            holes: holes
        )
    }

    private static func members(withRounds: Bool) -> [ComparativoMember] {
        let me = value(memberID: MockGroupStore.meID, name: "Jugador Demo", isMe: true, hidden: false, withRounds: withRounds, net: -3, gross: 0, avg: 76.0)
        let luis = value(memberID: MockGroupStore.luisID, name: "Luis Gómez", isMe: false, hidden: false, withRounds: withRounds, net: 1, gross: 4, avg: 81.0)
        let ana = value(memberID: MockGroupStore.anaID, name: "Ana Pérez", isMe: false, hidden: true, withRounds: false, net: nil, gross: nil, avg: nil)
        return [me, luis, ana]
    }

    private static func value(
        memberID: String,
        name: String,
        isMe: Bool,
        hidden: Bool,
        withRounds: Bool,
        net: Double?,
        gross: Double?,
        avg: Double?
    ) -> ComparativoMember {
        var stats: [String: ComparativoStatValue] = [:]
        if hidden {
            stats["best_net"] = ComparativoStatValue(value: nil, n: 0, have: 0, need: 1, hidden: true, extra: [:])
            stats["best_gross"] = ComparativoStatValue(value: nil, n: 0, have: 0, need: 1, hidden: true, extra: [:])
            stats["avg_gross"] = ComparativoStatValue(value: nil, n: 0, have: 0, need: 1, hidden: true, extra: [:])
            stats["rounds"] = ComparativoStatValue(value: nil, n: 0, have: 0, need: 1, hidden: true, extra: [:])
        } else if withRounds {
            stats["best_net"] = ComparativoStatValue(value: net, n: 2, have: 2, need: 1, hidden: false, extra: ["score": "73", "course": "Azul", "date": "2026-10-27"])
            stats["best_gross"] = ComparativoStatValue(value: gross, n: 2, have: 2, need: 1, hidden: false, extra: ["score": "76", "course": "Azul", "date": "2026-10-27"])
            stats["avg_gross"] = ComparativoStatValue(value: avg, n: 2, have: 2, need: 1, hidden: false, extra: ["to_par": "2.5"])
            stats["rounds"] = ComparativoStatValue(value: 2, n: 2, have: 2, need: 1, hidden: false, extra: [:])
            stats["hi_change"] = ComparativoStatValue(value: -0.2, n: 2, have: 2, need: 1, hidden: false, extra: ["from": "3,3", "to": "3,1"])
            stats["birdies"] = ComparativoStatValue(value: 5, n: 2, have: 2, need: 1, hidden: false, extra: ["per_round": "2.5"])
            stats["eagles"] = ComparativoStatValue(value: 0, n: 2, have: 2, need: 1, hidden: false, extra: [:])
            stats["birdie_pct"] = ComparativoStatValue(value: 8.3, n: 36, have: 36, need: 18, hidden: false, extra: ["count": "3"])
            stats["pars"] = ComparativoStatValue(value: 18, n: 2, have: 2, need: 1, hidden: false, extra: [:])
            stats["bogey_avoid"] = ComparativoStatValue(value: 22.2, n: 36, have: 36, need: 18, hidden: false, extra: ["count": "8"])
            stats["par3"] = ComparativoStatValue(value: 3.2, n: 8, have: 8, need: 4, hidden: false, extra: [:])
            stats["par4"] = ComparativoStatValue(value: 4.4, n: 20, have: 20, need: 8, hidden: false, extra: [:])
            stats["par5"] = ComparativoStatValue(value: 5.1, n: 8, have: 8, need: 4, hidden: false, extra: [:])
            stats["gir"] = ComparativoStatValue(value: 52, n: 18, have: 18, need: 9, hidden: false, extra: ["hit": "9"])
            stats["fir"] = ComparativoStatValue(value: 58, n: 14, have: 14, need: 9, hidden: false, extra: ["hit": "8"])
            stats["scrambling"] = ComparativoStatValue(value: 40, n: 9, have: 9, need: 3, hidden: false, extra: ["saved": "4"])
            stats["putts_round"] = ComparativoStatValue(value: 30.5, n: 2, have: 2, need: 1, hidden: false, extra: [:])
            stats["putts_gir"] = ComparativoStatValue(value: 1.82, n: 9, have: 9, need: 6, hidden: false, extra: [:])
        }
        return ComparativoMember(
            memberID: memberID,
            name: name,
            initials: GroupsParser.initials(name),
            color: nil,
            isMe: isMe,
            profileShared: memberID != MockGroupStore.anaID,
            stats: stats
        )
    }

    private static func board(for def: ComparativoStatDef, members: [ComparativoMember], empty: Bool) -> ComparativoBoard {
        if empty {
            return ComparativoBoard(
                key: def.key,
                leaders: [],
                ranked: false,
                rows: members.map { ComparativoBoardRow(memberID: $0.memberID, pos: nil, state: $0.stats[def.key]?.hidden == true ? .hidden : .noData) }
            )
        }
        var ranked: [ComparativoBoardRow] = []
        var rest: [ComparativoBoardRow] = []
        for member in members {
            let stat = member.stats[def.key]
            if stat?.hidden == true {
                rest.append(ComparativoBoardRow(memberID: member.memberID, pos: nil, state: .hidden))
            } else if stat?.value != nil {
                ranked.append(ComparativoBoardRow(memberID: member.memberID, pos: ranked.count + 1, state: .ranked))
            } else {
                rest.append(ComparativoBoardRow(memberID: member.memberID, pos: nil, state: .noData))
            }
        }
        return ComparativoBoard(
            key: def.key,
            leaders: ranked.first.map { [$0.memberID] } ?? [],
            ranked: !ranked.isEmpty,
            rows: ranked + rest
        )
    }

    private static let stats: [ComparativoStatDef] = [
        .init(key: "rounds", short: "Rondas", label: "Rondas jugadas", desc: "Tarjetas de 18 hoyos en el período.", format: "n", minKey: nil, lowerIsBetter: false, gps: false),
        .init(key: "best_net", short: "Mejor neto", label: "Mejor neto vs par", desc: "La mejor tarjeta neta contra el par.", format: "tp", minKey: nil, lowerIsBetter: true, gps: false),
        .init(key: "best_gross", short: "Mejor gross", label: "Mejor gross vs par", desc: "La mejor tarjeta gross contra el par.", format: "tp", minKey: nil, lowerIsBetter: true, gps: false),
        .init(key: "avg_gross", short: "Prom. golpes", label: "Promedio de golpes", desc: "Promedio gross de las tarjetas del período.", format: "f", minKey: "r", lowerIsBetter: true, gps: false),
        .init(key: "hi_change", short: "HI", label: "Cambio de hándicap", desc: "Cambio del índice en el período.", format: "hi", minKey: nil, lowerIsBetter: true, gps: false),
        .init(key: "eagles", short: "Águilas", label: "Águilas o mejor", desc: "Águilas o mejor en el período.", format: "n", minKey: nil, lowerIsBetter: false, gps: false),
        .init(key: "birdies", short: "Birdies", label: "Birdies", desc: "Birdies en el período.", format: "n", minKey: nil, lowerIsBetter: false, gps: false),
        .init(key: "birdie_pct", short: "Birdie %", label: "Birdie o mejor (% de hoyos)", desc: "Porcentaje de hoyos en birdie o mejor.", format: "p", minKey: "r", lowerIsBetter: false, gps: false),
        .init(key: "pars", short: "Pares", label: "Pares", desc: "Pares en el período.", format: "n", minKey: nil, lowerIsBetter: false, gps: false),
        .init(key: "bogey_avoid", short: "Bogey+", label: "Bogey o peor (% de hoyos)", desc: "Porcentaje de hoyos en bogey o peor.", format: "p", minKey: "r", lowerIsBetter: true, gps: false),
        .init(key: "par3", short: "Par 3", label: "Promedio en par 3", desc: "Promedio en par 3.", format: "f2", minKey: "r", lowerIsBetter: true, gps: false),
        .init(key: "par4", short: "Par 4", label: "Promedio en par 4", desc: "Promedio en par 4.", format: "f2", minKey: "r", lowerIsBetter: true, gps: false),
        .init(key: "par5", short: "Par 5", label: "Promedio en par 5", desc: "Promedio en par 5.", format: "f2", minKey: "r", lowerIsBetter: true, gps: false),
        .init(key: "gir", short: "GIR", label: "Greens en regulación", desc: "Greens en regulación.", format: "p", minKey: "gh", lowerIsBetter: false, gps: true),
        .init(key: "fir", short: "Fairways", label: "Fairways", desc: "Calles pegadas.", format: "p", minKey: "dr", lowerIsBetter: false, gps: true),
        .init(key: "scrambling", short: "Scrambling", label: "Scrambling", desc: "Ups and downs.", format: "p", minKey: "mg", lowerIsBetter: false, gps: true),
        .init(key: "putts_round", short: "Putts", label: "Putts por ronda", desc: "Putts por ronda.", format: "f", minKey: "pr", lowerIsBetter: true, gps: true),
        .init(key: "putts_gir", short: "Putts GIR", label: "Putts por green en regulación", desc: "Putts en greens en regulación.", format: "f2", minKey: "gp", lowerIsBetter: true, gps: true)
    ]
}

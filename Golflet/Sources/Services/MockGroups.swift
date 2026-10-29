import Foundation

extension MockAPIClient {
    private static let groupsLock = NSLock()
    private static var store = MockGroupStore.seed()

    static func resetGroups() {
        groupsLock.lock()
        store = MockGroupStore.seed()
        groupsLock.unlock()
    }

    func groups() async throws -> [GolfletGroup] {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
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
        return try mutate { store, me in
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
    }

    func declineInvite(token: String) async throws {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        mutate { store, _ in
            store.pending.removeAll { $0.token == token }
        }
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
            share: [meID: .allShared, anaID: anaShare, luisID: .allShared]
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

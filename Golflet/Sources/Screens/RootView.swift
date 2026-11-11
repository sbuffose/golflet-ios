import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.golfletTypeToken) private var typeToken
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage("golflet.launch.seen") private var seenLaunch = false
    @State private var showSplash = true
    @State private var splashWasFirst = !UserDefaults.standard.bool(forKey: "golflet.launch.seen")

    var body: some View {
        let _ = typeToken
        let _ = model.textPrefs
        Group {
            if model.showsOnboarding {
                NavigationStack { OnboardingView() }
            } else if model.isSignedIn {
                mainTabs
            } else {
                AuthView()
            }
        }
        .task {
            await model.load()
            await model.consumeIntent()
        }
        .onChange(of: IntentRouter.shared.pending) { _, _ in
            Task { await model.consumeIntent() }
        }
        .onChange(of: model.isSignedIn) { _, signedIn in
            if signedIn {
                Task { await model.consumePendingInvite() }
            }
        }
        .overlay {
            // En el onboarding la espera es la de Roberto (Saltar sigue ahí).
            // Este panel queda para un sync que arranca ya dentro de la app.
            if model.syncSession != nil, !model.showsOnboarding {
                SyncProgressView()
                    .golfletChrome()
                    .environment(model)
                    .ignoresSafeArea()
                    .transition(.identity)
            }
        }
        .animation(nil, value: model.syncSession?.id)
        .overlay(alignment: .bottom) {
            if let toast = model.toastMessage {
                Text(toast)
                    .font(GType.headline)
                    .foregroundStyle(p.onPrimary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(p.primary)
                    .clipShape(Capsule())
                    .padding(.bottom, 72)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task(id: toast) {
                        try? await Task.sleep(for: .seconds(2.4))
                        if model.toastMessage == toast { model.toastMessage = nil }
                    }
            }
        }
        .animation(.easeInOut(duration: 0.28), value: model.toastMessage)
        .overlay {
            if showSplash {
                LaunchSplash(firstLaunch: splashWasFirst, reduceMotion: reduceMotion) {
                    seenLaunch = true
                    withAnimation(.easeOut(duration: reduceMotion ? 0.15 : 0.35)) {
                        showSplash = false
                    }
                }
                .transition(.opacity)
            }
        }
    }

    @ViewBuilder
    private var mainTabs: some View {
        let bindings = Bindable(model)
        tabPages
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.22), value: model.selectedTab)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !model.showsLiveHole && !model.showsPlay {
                    GolfletTabBar(selection: bindings.selectedTab)
                        .transition(.opacity)
                }
            }
            .modifier(GSelectionHaptic(reduce: reduceMotion, trigger: model.selectedTab))
        .sheet(item: bindings.presentedRound) { round in
            NavigationStack {
                RoundDetailView(round: round)
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(isPresented: bindings.showsClubs) {
            NavigationStack {
                ClubsView()
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(isPresented: bindings.showsNotifications) {
            NavigationStack {
                NotificationsView()
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(isPresented: bindings.showsGroups) {
            NavigationStack {
                GroupsView()
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(isPresented: bindings.showsCreateGroup) {
            NavigationStack {
                CreateGroupView()
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(isPresented: bindings.showsSharePrefs) {
            NavigationStack {
                SharePrefsView()
            }
            .golfletChrome()
            .environment(model)
        }
        .fullScreenCover(item: bindings.presentedInvite) { invite in
            NavigationStack {
                GroupInviteView(invite: invite)
            }
            .golfletChrome()
            .environment(model)
        }
        .fullScreenCover(item: Binding(
            get: { model.presentedGroupID.map { GroupRef(id: $0) } },
            set: { model.presentedGroupID = $0?.id }
        )) { ref in
            NavigationStack {
                GroupDetailView(groupID: ref.id)
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(item: Binding(
            get: { (model.showsCreateGroup || model.presentedGroupID != nil) ? nil : model.inviteShare },
            set: { model.inviteShare = $0 }
        )) { payload in
            NavigationStack {
                InviteShareView(payload: payload)
            }
            .golfletChrome()
            .environment(model)
        }
        .fullScreenCover(isPresented: bindings.showsReconstruct) {
            NavigationStack {
                ReconstructView()
            }
            .golfletChrome()
            .environment(model)
        }
        .fullScreenCover(isPresented: bindings.showsPlay) {
            NavigationStack {
                PlayCourseView()
            }
            .golfletChrome()
            .environment(model)
        }
        .fullScreenCover(isPresented: bindings.showsLiveHole) {
            NavigationStack {
                LiveHoleView(start: model.liveHoleNumber)
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(item: bindings.presentedRecap) { target in
            NavigationStack {
                RecapView(roundId: target.roundId, liveRoundId: target.liveRoundId)
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(item: Binding(
            get: { model.presentedHole.map { HoleRef(number: $0) } },
            set: { model.presentedHole = $0?.number }
        )) { ref in
            NavigationStack {
                HoleDetailView(courseName: model.selectedCourseName, holeNumber: ref.number)
                    .id(ref.number)
            }
            .golfletChrome()
            .environment(model)
        }
    }

    @ViewBuilder
    private var tabPages: some View {
        ZStack {
            switch model.selectedTab {
            case .resumen:
                NavigationStack { SummaryView(showsBack: false) }
            case .rondas:
                NavigationStack { RoundsView(showsBack: false) }
            case .cancha:
                NavigationStack { CourseView(showsBack: false) }
            case .bolsa:
                NavigationStack { BagView(showsBack: false) }
            default:
                NavigationStack { HomeView() }
            }
        }
        .transition(reduceMotion ? .identity : .opacity)
    }
}

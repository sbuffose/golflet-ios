import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    var body: some View {
        Group {
            if !model.isAuthenticated {
                AuthView()
            } else {
                mainTabs
            }
        }
        .task { await model.load() }
        .fullScreenCover(isPresented: Binding(
            get: { model.syncSession != nil },
            set: { if !$0, model.syncSession?.outcome != .running { model.syncSession = nil } }
        )) {
            SyncProgressView()
                .golfletChrome()
                .environment(model)
                .interactiveDismissDisabled()
        }
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
    }

    @ViewBuilder
    private var mainTabs: some View {
        let bindings = Bindable(model)
        TabView(selection: bindings.selectedTab) {
            NavigationStack { HomeView() }
                .tabItem { Label(AppTab.inicio.title, systemImage: AppTab.inicio.systemImage) }
                .tag(AppTab.inicio)
                .accessibilityIdentifier("tab-inicio")

            NavigationStack { SummaryView() }
                .tabItem { Label(AppTab.resumen.title, systemImage: AppTab.resumen.systemImage) }
                .tag(AppTab.resumen)
                .accessibilityIdentifier("tab-resumen")

            NavigationStack { RoundsView() }
                .tabItem { Label(AppTab.rondas.title, systemImage: AppTab.rondas.systemImage) }
                .tag(AppTab.rondas)
                .accessibilityIdentifier("tab-rondas")

            NavigationStack { CourseView() }
                .tabItem { Label(AppTab.cancha.title, systemImage: AppTab.cancha.systemImage) }
                .tag(AppTab.cancha)
                .accessibilityIdentifier("tab-cancha")

            NavigationStack { BagView() }
                .tabItem { Label(AppTab.bolsa.title, systemImage: AppTab.bolsa.systemImage) }
                .tag(AppTab.bolsa)
                .accessibilityIdentifier("tab-bolsa")
        }
        .tint(p.primary)
        .onAppear { configureTabBar() }
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

    private func configureTabBar() {
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(p.bg)
        appearance.shadowColor = UIColor(p.hairline)
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }
}

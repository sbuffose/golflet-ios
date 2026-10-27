import SwiftUI
import SwiftData

@main
struct GolfletApp: App {
    @State private var model: AppModel
    private let container: ModelContainer

    init() {
        let schema = Schema([RoundNote.self, HoleExtra.self, BagClubRecord.self])
        let container = try! ModelContainer(for: schema, configurations: ModelConfiguration(isStoredInMemoryOnly: false))
        self.container = container
        let notes = NotesStore(container: container)
        _model = State(initialValue: AppModel(api: MockAPIClient(), notes: notes))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .modelContainer(container)
                .golfletChrome()
                .preferredColorScheme(nil)
        }
    }
}

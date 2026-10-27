import SwiftUI
import SwiftData

@main
struct GolfletApp: App {
    @State private var model: AppModel
    private let container: ModelContainer

    init() {
        let schema = Schema([RoundNote.self, HoleExtra.self, BagClubRecord.self])
        let uiTesting = ProcessInfo.processInfo.arguments.contains("-ui-testing")
            || ProcessInfo.processInfo.arguments.contains("-ui-testing-auth")
        let preferred = ModelConfiguration(isStoredInMemoryOnly: uiTesting)
        let container = (try? ModelContainer(for: schema, configurations: preferred))
            ?? (try! ModelContainer(for: schema, configurations: ModelConfiguration(isStoredInMemoryOnly: true)))
        self.container = container
        let notes = NotesStore(container: container)
        _model = State(initialValue: AppModel(api: APIFactory.make(), notes: notes))
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

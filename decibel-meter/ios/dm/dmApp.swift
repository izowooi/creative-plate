import SwiftUI

@main
@MainActor
struct SoriApp: App {
    @StateObject private var model = MeterModel()
    @Environment(\.scenePhase) private var scenePhase

    init() { Diagnostics.configure() }

    var body: some Scene {
        WindowGroup {
            ContentView(model: model)
                .onChange(of: scenePhase) { _, phase in
                    if phase == .background { model.stop(reason: "background_stopped") }
                }
        }
    }
}

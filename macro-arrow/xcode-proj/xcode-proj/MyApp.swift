import SwiftUI

@main struct MyApp: App {
    @State private var controller = MacroController()

    var body: some Scene {
        // .menu 스타일: 메뉴가 키 창이 되지 않아 대상 앱의 포커스를 빼앗지 않는다.
        MenuBarExtra {
            MenuContent(controller: controller)
        } label: {
            Image(systemName: controller.isRunning ? "record.circle.fill" : "camera.viewfinder")
        }
        .menuBarExtraStyle(.menu)

        Settings {
            SettingsView(controller: controller)
        }
    }
}

private struct MenuContent: View {
    let controller: MacroController

    var body: some View {
        if controller.isRunning {
            Text("실행 중 \(controller.progress)/\(controller.count)")
        } else {
            Text("대기 중 · ⌃ 두 번 탭으로 시작/중단")
        }
        Text("\(controller.count)회 · 간격 \(controller.interval.formatted())초")
        if let error = controller.lastError {
            Text("오류: \(error)")
        }

        Button(controller.isRunning ? "중단" : "시작") { controller.toggle() }

        Divider()

        if !controller.hasAccessibility {
            Button("손쉬운 사용 권한 요청…") { controller.requestAccessibility() }
        }
        if !controller.hasScreenRecording {
            Button("화면 기록 권한 요청…") { controller.requestScreenRecording() }
        }
        Button("저장 폴더 열기") {
            let folder = controller.lastFolder ?? controller.rootFolder
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            NSWorkspace.shared.open(folder)
        }
        SettingsLink {
            Text("설정…")
        }
        .keyboardShortcut(",")

        Divider()

        Button("종료") { NSApplication.shared.terminate(nil) }
            .keyboardShortcut("q")
    }
}

private struct SettingsView: View {
    @Bindable var controller: MacroController

    var body: some View {
        Form {
            Stepper(value: $controller.count, in: 1...10_000) {
                LabeledContent("반복 횟수") {
                    TextField("", value: $controller.count, format: .number)
                        .frame(width: 70)
                }
            }
            Stepper(value: $controller.interval, in: 0...10, step: 0.05) {
                LabeledContent("간격(초)") {
                    TextField("", value: $controller.interval, format: .number.precision(.fractionLength(0...2)))
                        .frame(width: 70)
                }
            }
            Text("한 번 반복 = 캡처 → 간격 → → 키 → 간격")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .formStyle(.grouped)
        .frame(width: 320)
        .onAppear { NSApplication.shared.activate() }
    }
}

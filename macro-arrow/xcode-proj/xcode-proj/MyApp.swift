import SwiftUI

@main struct MyApp: App {
    @State private var controller = MacroController()

    var body: some Scene {
        // Window 장면은 창을 닫으면 앱이 종료되고 다시 열리지도 않는다.
        // WindowGroup 은 창을 닫아도 앱이 남아 ⌃ 두 번 탭을 계속 받고, 앱 더블클릭·Dock 클릭으로 창이 다시 열린다.
        WindowGroup("Macro Arrow") {
            MainView(controller: controller)
        }
        .windowResizability(.contentSize)
        .commands {
            CommandGroup(replacing: .newItem) {}  // 창은 하나만
        }
    }
}

private struct MainView: View {
    @Bindable var controller: MacroController
    // 권한 상태는 관찰 대상이 아니므로 앱이 다시 활성화될 때(설정 앱에서 돌아올 때) 새로 그린다.
    @State private var refreshTick = 0
    // 창이 열릴 때 입력란이 포커스를 잡으면 엇나간 키 입력이 횟수를 바꿀 수 있어 포커스를 비워 둔다.
    @FocusState private var focusedField: Field?

    private enum Field { case count, interval }

    var body: some View {
        Form {
            Section {
                if controller.isRunning {
                    ProgressView(value: Double(controller.progress), total: Double(controller.count)) {
                        Text("실행 중 \(controller.progress)/\(controller.count)")
                    }
                    Button("중단") { controller.toggle() }
                } else {
                    Text("대기 중")
                        .font(.headline)
                    Text("캡처할 창을 클릭한 뒤 ⌃(control)를 빠르게 두 번 탭하면 시작합니다. 실행 중에 다시 두 번 탭하면 멈춥니다.")
                        .foregroundStyle(.secondary)
                }
                if let error = controller.lastError {
                    Text("오류: \(error)")
                        .foregroundStyle(.red)
                }
            }

            if !controller.hasAccessibility || !controller.hasScreenRecording {
                Section("권한 필요") {
                    if !controller.hasAccessibility {
                        Button("손쉬운 사용 권한 요청…") { controller.requestAccessibility() }
                    }
                    if !controller.hasScreenRecording {
                        Button("화면 기록 권한 요청…") { controller.requestScreenRecording() }
                    }
                    Text("권한을 준 뒤에는 앱을 다시 켜야 적용됩니다.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .id(refreshTick)
            }

            Section("설정") {
                Picker("캡처 대상", selection: $controller.captureTarget) {
                    ForEach(CaptureTarget.allCases) { Text($0.title).tag($0) }
                }
                Stepper(value: $controller.count, in: 1...10_000) {
                    LabeledContent("반복 횟수") {
                        TextField("", value: $controller.count, format: .number)
                            .focused($focusedField, equals: .count)
                            .frame(width: 70)
                    }
                }
                Stepper(value: $controller.interval, in: 0...10, step: 0.05) {
                    LabeledContent("간격(초)") {
                        TextField("", value: $controller.interval, format: .number.precision(.fractionLength(0...2)))
                            .focused($focusedField, equals: .interval)
                            .frame(width: 70)
                    }
                }
                Text("한 번 반복 = 캡처 → 간격 → → 키 → 간격")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .disabled(controller.isRunning)

            Section {
                Button("저장 폴더 열기") {
                    let folder = controller.lastFolder ?? controller.rootFolder
                    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    NSWorkspace.shared.open(folder)
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 380)
        .fixedSize(horizontal: false, vertical: true)
        .defaultFocus($focusedField, nil)
        .onAppear { focusedField = nil }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            refreshTick += 1
        }
    }
}

import SwiftUI
import UIKit

private enum SoriStyle {
    static let background = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.055, green: 0.10, blue: 0.095, alpha: 1) : UIColor(red: 0.965, green: 0.965, blue: 0.945, alpha: 1) })
    static let card = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.085, green: 0.15, blue: 0.14, alpha: 1) : .white })
    static let accent = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.83, green: 0.96, blue: 0.80, alpha: 1) : UIColor(red: 0.09, green: 0.43, blue: 0.37, alpha: 1) })
    static let secondary = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.71, green: 0.77, blue: 0.73, alpha: 1) : UIColor(red: 0.35, green: 0.40, blue: 0.38, alpha: 1) })
    static let coral = Color(red: 0.88, green: 0.42, blue: 0.27)
}

struct ContentView: View {
    @ObservedObject var model: MeterModel
    @State private var sheet: Sheet?
    private enum Sheet: String, Identifiable { case settings, calibration, summary; var id: String { rawValue } }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(tr("app_name")).font(.system(.largeTitle, design: .rounded).weight(.bold))
                        Text(tr("tagline")).font(.subheadline).foregroundStyle(SoriStyle.secondary)
                    }
                    Spacer()
                    Button { sheet = .settings } label: {
                        Image(systemName: "slider.horizontal.3").font(.title3).frame(width: 48, height: 48)
                            .background(SoriStyle.card, in: Circle())
                    }.accessibilityLabel(tr("settings")).accessibilityIdentifier("settings")
                }
                HStack(spacing: 7) {
                    Circle().fill(model.running ? SoriStyle.accent : .secondary.opacity(0.5)).frame(width: 7, height: 7)
                    Text(tr(model.isDemo ? "sample_data" : model.phase == .starting ? "starting" : model.phase == .stopping ? "stopping" : model.running ? "live" : model.hasMeasurement ? "finished" : "ready"))
                        .font(.subheadline.weight(.medium)).lineLimit(1).minimumScaleFactor(0.6)
                    Spacer()
                    Text(duration(model.snapshot.seconds)).monospacedDigit().font(.subheadline)
                        .lineLimit(1).minimumScaleFactor(0.5)
                        .foregroundStyle(SoriStyle.secondary).accessibilityLabel(tr("elapsed") + ": " + duration(model.snapshot.seconds))
                }
                MeterGauge(snapshot: model.snapshot, estimate: model.estimate, hasMeasurement: model.hasMeasurement)
                StatisticsRow(snapshot: model.snapshot, estimate: model.estimate, available: model.hasMeasurement)
                Text(tr(model.hasMeasurement ? "estimate_short" : "start_hint"))
                    .font(.footnote).foregroundStyle(SoriStyle.secondary).multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity).fixedSize(horizontal: false, vertical: true)
                if let message = model.notice {
                    VStack(alignment: .leading, spacing: 12) {
                        notice(message, warning: message != "calibration_saved")
                        if message == "permission_denied" {
                            Button(tr("open_settings")) { openSettings() }.buttonStyle(.bordered)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
                AdvancedSection(identifier: "advanced") {
                    VStack(alignment: .leading, spacing: 16) {
                        LabeledContent(tr("raw_input"), value: model.hasMeasurement ? level(model.snapshot.current, floor: true) + " dBFS" : "—")
                            .accessibilityIdentifier("raw_input")
                        LabeledContent(tr("estimate_method"), value: tr(model.calibrated ? "estimate_calibrated" : "estimate_default"))
                        LabeledContent(tr("estimate_adjustment"), value: "+" + level(model.estimate.offset) + " dB")
                        Button { sheet = .calibration } label: {
                            Label(tr("calibration"), systemImage: "slider.horizontal.3")
                        }.buttonStyle(.bordered).accessibilityIdentifier("calibration")
                        if model.profileMismatch { notice("calibration_mismatch", warning: false) }
                        if model.snapshot.currentClipped { notice("clipping", warning: true) }
                        Text(tr("recent60") + " · dBFS").font(.subheadline.weight(.medium))
                        LevelChart(points: model.snapshot.points, offset: 0, calibrated: false).frame(height: 96)
                        Text(model.conditions?.routeName ?? tr("unknown_input")).font(.subheadline)
                        Text(tr("rms100") + " · " + ((model.conditions?.weighting ?? model.weighting) == .a ? "A" : tr("flat")))
                            .font(.caption).foregroundStyle(SoriStyle.secondary)
                        Text(tr("estimate_explainer")).font(.footnote).foregroundStyle(SoriStyle.secondary)
                    }
                }
                if model.isDemo { Text(tr("sample_hint")).font(.caption).foregroundStyle(SoriStyle.secondary) }
            }.frame(maxWidth: 620).padding(.horizontal, 24).padding(.top, 12).padding(.bottom, 24).frame(maxWidth: .infinity)
        }
        .background(SoriStyle.background)
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 12) {
                Button {
                    if model.running || model.phase == .starting { model.stop() } else { model.start() }
                } label: {
                    HStack(spacing: 10) {
                        if model.busy { ProgressView().tint(.white) }
                        else { Image(systemName: model.running ? "stop.fill" : "waveform") }
                        Text(tr(model.phase == .starting ? "cancel" : model.phase == .stopping ? "stopping" : model.running ? "stop" : model.hasMeasurement ? "measure_again" : "start")).fontWeight(.semibold)
                    }.frame(maxWidth: .infinity).frame(minHeight: 56)
                }
                .buttonStyle(.plain).foregroundStyle(model.running ? Color.white : Color(red: 0.055, green: 0.16, blue: 0.14))
                .background(model.running ? Color(red: 0.14, green: 0.35, blue: 0.30) : Color(red: 0.83, green: 0.96, blue: 0.80), in: Capsule())
                .disabled(model.phase == .stopping).accessibilityIdentifier("measure")
                if model.lastReport != nil && !model.running && !model.busy {
                    Button { sheet = .summary } label: {
                        Image(systemName: "chart.bar.doc.horizontal").font(.title3).frame(width: 56, height: 56)
                            .background(SoriStyle.card, in: Circle())
                    }.accessibilityLabel(tr("summary")).accessibilityIdentifier("summary")
                }
            }.frame(maxWidth: 620).padding(.horizontal, 24).padding(.top, 12).padding(.bottom, 12)
                .frame(maxWidth: .infinity).background(SoriStyle.background)
        }
        .tint(SoriStyle.accent)
        .sheet(item: $sheet) { item in
            switch item {
            case .settings: SettingsView(model: model)
            case .calibration: CalibrationView(model: model)
            case .summary: SummaryView(model: model)
            }
        }
    }

    private func notice(_ key: String, warning: Bool) -> some View {
        Label(tr(key), systemImage: warning ? "exclamationmark.circle" : "info.circle")
            .font(.footnote).fixedSize(horizontal: false, vertical: true)
            .foregroundStyle(warning ? SoriStyle.coral : SoriStyle.accent)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct MeterGauge: View {
    let snapshot: MeterSnapshot
    let estimate: LevelEstimate
    let hasMeasurement: Bool
    @ScaledMetric(relativeTo: .largeTitle) private var numeralSize = 76.0
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private var expanded: Bool { dynamicTypeSize >= .xxxLarge }
    private var value: Double { estimate.decibels(snapshot.current) }
    private var progress: Double { min(1, max(0, value / 120)) }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                if !expanded {
                Canvas { context, size in
                    let radius = min(size.width * 0.44, 103)
                    let center = CGPoint(x: size.width / 2, y: 121)
                    for index in 0...60 {
                        let angle = (150 + Double(index) * 4) * .pi / 180
                        let length = index % 5 == 0 ? 14.0 : 7.0
                        var tick = Path()
                        tick.move(to: CGPoint(x: center.x + cos(angle) * (radius - length), y: center.y + sin(angle) * (radius - length)))
                        tick.addLine(to: CGPoint(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius))
                        context.stroke(tick, with: .color(hasMeasurement && Double(index) / 60 <= progress ? SoriStyle.accent : Color.secondary.opacity(0.19)),
                                       style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    }
                }.accessibilityHidden(true)
                }
                VStack(spacing: 6) {
                    Text(tr("sound_now")).font(.subheadline).foregroundStyle(SoriStyle.secondary)
                    Text(hasMeasurement ? simpleLevel(value) : "—")
                        .font(.system(size: min(numeralSize, 102), weight: .medium, design: .rounded)).monospacedDigit()
                        .minimumScaleFactor(0.55).lineLimit(1).frame(maxWidth: expanded ? 290 : 185)
                    Text(verbatim: "dB").font(.title3.weight(.medium)).foregroundStyle(SoriStyle.secondary)
                }.padding(.horizontal, 37).offset(y: 14)
            }.frame(height: expanded ? 260 : 212)
        }.accessibilityElement(children: .ignore)
            .accessibilityLabel(tr("sound_now"))
            .accessibilityValue(hasMeasurement ? simpleLevel(value) + " dB, " + tr("estimate_short") : tr("ready"))
            .accessibilityIdentifier("level")
    }
}

private struct StatisticsRow: View {
    let snapshot: MeterSnapshot
    let estimate: LevelEstimate
    let available: Bool
    var body: some View {
        HStack(spacing: 10) {
            statistic("minimum", snapshot.minimum)
            statistic("average", snapshot.average)
            statistic("maximum", snapshot.maximum)
        }
    }
    private func statistic(_ key: String, _ value: Double) -> some View {
        VStack(spacing: 10) {
            Text(tr(key)).font(.caption).foregroundStyle(SoriStyle.secondary).lineLimit(2).minimumScaleFactor(0.75)
            Text(available ? simpleLevel(estimate.decibels(value)) : "—").font(.system(.title, design: .rounded).weight(.semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            Text(verbatim: "dB").font(.caption).foregroundStyle(SoriStyle.secondary)
        }.frame(maxWidth: .infinity).padding(.vertical, 16).padding(.horizontal, 4)
            .background(SoriStyle.card, in: RoundedRectangle(cornerRadius: 20))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier(key)
    }
}

private struct LevelChart: View {
    let points: [LevelPoint]
    let offset: Double
    let calibrated: Bool
    var body: some View {
        Canvas { context, size in
            let plotWidth = size.width - 29
            let low = calibrated ? 0.0 : -120.0
            for index in 0...2 {
                let y = Double(index) * (size.height - 8) / 2 + 4
                var grid = Path(); grid.move(to: CGPoint(x: 0, y: y)); grid.addLine(to: CGPoint(x: plotWidth, y: y))
                context.stroke(grid, with: .color(.secondary.opacity(0.12)), style: StrokeStyle(lineWidth: 1, dash: [3, 4]))
                context.draw(Text(String(Int(low + 120 - Double(index) * 60))).font(.system(size: 10)).foregroundColor(SoriStyle.secondary),
                             at: CGPoint(x: size.width, y: y), anchor: .trailing)
            }
            guard let last = points.last else { return }
            let start = last.seconds - 60
            var path = Path()
            var firstX = 0.0
            for (index, point) in points.enumerated() {
                let x = max(0, min(plotWidth, (point.seconds - start) / 60 * plotWidth))
                let y = (1 - min(1, max(0, (point.dbfs + offset - low) / 120))) * (size.height - 8) + 4
                if index == 0 { path.move(to: CGPoint(x: x, y: y)); firstX = x }
                else { path.addLine(to: CGPoint(x: x, y: y)) }
            }
            var fill = path
            fill.addLine(to: CGPoint(x: plotWidth, y: size.height)); fill.addLine(to: CGPoint(x: firstX, y: size.height)); fill.closeSubpath()
            context.fill(fill, with: .color(SoriStyle.accent.opacity(0.09)))
            context.stroke(path, with: .color(SoriStyle.accent), style: StrokeStyle(lineWidth: 2, lineJoin: .round))
        }.accessibilityElement(children: .ignore).accessibilityLabel(tr("recent60"))
            .accessibilityValue(points.isEmpty ? tr("ready") : "\(level((points.map(\.dbfs).min() ?? 0) + offset)) – \(level((points.map(\.dbfs).max() ?? 0) + offset))")
    }
}

private struct AdvancedSection<Content: View>: View {
    let identifier: String
    @ViewBuilder let content: Content
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(.easeInOut(duration: 0.2)) { expanded.toggle() } } label: {
                HStack {
                    Text(tr("advanced")).font(.subheadline.weight(.medium))
                    Spacer()
                    Image(systemName: expanded ? "chevron.up" : "chevron.down").font(.footnote.weight(.semibold))
                }.frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
            }.buttonStyle(.plain).foregroundStyle(SoriStyle.accent)
                .accessibilityIdentifier(identifier).accessibilityValue(tr(expanded ? "advanced_open" : "advanced_closed"))
            if expanded { content.padding(.top, 16) }
        }.padding(.horizontal, 18).padding(.vertical, 8).background(SoriStyle.card, in: RoundedRectangle(cornerRadius: 22))
    }
}

private struct SettingsView: View {
    @ObservedObject var model: MeterModel
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle(tr("keep_awake"), isOn: $model.keepAwake)
                } footer: { Text(tr("keep_awake_explainer")) }
                Section {
                    Toggle(tr("diagnostics"), isOn: $model.diagnosticsEnabled).disabled(!Diagnostics.available)
                        .accessibilityIdentifier("diagnostics")
                } footer: { Text(tr("diagnostics_explainer")) }
                Section {
                    NavigationLink(tr("privacy")) { InformationView(title: "privacy", paragraphs: ["privacy_explainer", "diagnostics_explainer"]) }
                    NavigationLink(tr("about")) { InformationView(title: "about", paragraphs: ["simple_about"]) }
                    NavigationLink(tr("licenses")) {
                        ScrollView {
                            Text(licenseText()).font(.caption).textSelection(.enabled).padding(24)
                        }.navigationTitle(tr("licenses")).navigationBarTitleDisplayMode(.inline)
                    }
                    Button(tr("locale")) { openSettings() }
                    LabeledContent(tr("version"), value: "1.0 (1)")
                }
                Section {
                    AdvancedSection(identifier: "settings_advanced") {
                        Picker(tr("weighting"), selection: $model.weighting) { Text("A").tag(Weighting.a); Text(tr("flat")).tag(Weighting.flat) }
                            .disabled(model.phase != .idle).accessibilityIdentifier("weighting")
                        NavigationLink(tr("calibration")) { CalibrationForm(model: model) }
                        if let input = model.conditions {
                            Text(input.routeName)
                            Text("\(input.sampleRate) Hz · \(input.channels) ch").foregroundStyle(SoriStyle.secondary)
                        }
                        Text(tr("estimate_explainer")).font(.footnote).foregroundStyle(SoriStyle.secondary)
                        Text(tr("filter_explainer")).font(.footnote).foregroundStyle(SoriStyle.secondary)
                    }
                }
            }.navigationTitle(tr("settings")).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button(tr("done")) { dismiss() } } }
        }.tint(SoriStyle.accent)
    }
}

private struct InformationView: View {
    let title: String
    let paragraphs: [String]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                ForEach(paragraphs, id: \.self) { Text(tr($0)).font(.body).fixedSize(horizontal: false, vertical: true) }
            }.frame(maxWidth: 620, alignment: .leading).padding(24).frame(maxWidth: .infinity)
        }.navigationTitle(tr(title)).navigationBarTitleDisplayMode(.inline)
    }
}

private struct CalibrationView: View {
    @ObservedObject var model: MeterModel
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            CalibrationForm(model: model)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button(tr("done")) { dismiss() } } }
        }.tint(SoriStyle.accent)
    }
}

private struct CalibrationForm: View {
    @ObservedObject var model: MeterModel
    @State private var name = ""
    @State private var reference = ""
    @State private var notes = ""
    @State private var matches = false
    @State private var confirmReset = false
    private var referenceValue: Double? { Double(reference.replacingOccurrences(of: ",", with: ".")) }
    var body: some View {
        Form {
            Section {
                Text(tr("calibration_intro")).font(.subheadline)
                Picker(tr("profiles"), selection: $model.selectedProfileID) {
                    Text(tr("none")).tag("")
                    ForEach(model.profiles) { Text($0.name).tag($0.id) }
                }.disabled(model.phase != .idle)
                ForEach(model.profiles) { profile in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(profile.name)
                            Text("\(profile.conditions.weighting.rawValue) · \(profile.conditions.sampleRate) Hz · \(profile.conditions.routeName)")
                                .font(.caption).foregroundStyle(SoriStyle.secondary)
                        }
                        Spacer()
                        Button(role: .destructive) { model.removeProfile(profile.id) } label: { Image(systemName: "trash") }
                            .accessibilityLabel(tr("delete_profile") + ": " + profile.name).disabled(model.phase != .idle)
                    }
                }
            }
            Section {
                TextField(tr("profile_name"), text: $name).accessibilityIdentifier("profile_name")
                TextField(tr("reference_db"), text: $reference).keyboardType(.decimalPad).accessibilityIdentifier("reference_db")
                TextField(tr("notes"), text: $notes, axis: .vertical).lineLimit(2...4)
                LabeledContent(tr("weighting"), value: model.weighting == .a ? "A · dBA" : tr("flat") + " · dB SPL")
                Toggle(tr("reference_agreement"), isOn: $matches)
                if model.running && model.snapshot.canCalibrate {
                    LabeledContent(tr("relative_level"), value: level(model.snapshot.calibrationLevel ?? -120) + " dBFS")
                } else { Text(tr("stable_required")).font(.footnote).foregroundStyle(SoriStyle.secondary) }
                Button(tr("save_profile")) {
                    if let value = referenceValue, model.saveCalibration(name: name, reference: value, notes: notes) {
                        name = ""; reference = ""; notes = ""; matches = false
                    }
                }.disabled(!model.running || !model.snapshot.canCalibrate || !matches || name.trimmingCharacters(in: .whitespaces).isEmpty || !(20...140).contains(referenceValue ?? -1) || model.profiles.count >= 20)
                    .accessibilityIdentifier("save_calibration")
            } header: { Text(tr("create_profile")) } footer: { Text(tr("reference_unit_hint")) }
            if !model.profiles.isEmpty {
                Section { Button(tr("reset"), role: .destructive) { confirmReset = true }.disabled(model.phase != .idle) }
            }
        }.navigationTitle(tr("calibration")).navigationBarTitleDisplayMode(.inline)
            .confirmationDialog(tr("reset_confirm"), isPresented: $confirmReset, titleVisibility: .visible) {
                Button(tr("reset"), role: .destructive) { model.resetProfiles() }
            }
    }
}

private struct SharedFile: Identifiable { let id = UUID(); let url: URL }
private struct SummaryView: View {
    @ObservedObject var model: MeterModel
    @Environment(\.dismiss) private var dismiss
    @State private var file: SharedFile?
    @State private var exporting = false
    @State private var confirmDelete = false
    var body: some View {
        NavigationStack {
            ScrollView {
                if let report = model.lastReport {
                    VStack(alignment: .leading, spacing: 24) {
                        if report.stopReason == "demo" { Text(tr("sample_data")).font(.caption).foregroundStyle(SoriStyle.secondary) }
                        Text(duration(report.snapshot.seconds)).font(.system(.largeTitle, design: .rounded).weight(.medium)).monospacedDigit()
                        if let date = ISO8601DateFormatter().date(from: report.startedAt) {
                            Text(date.formatted(date: .abbreviated, time: .shortened)).font(.subheadline).foregroundStyle(SoriStyle.secondary)
                        }
                        StatisticsRow(snapshot: report.snapshot, estimate: report.estimate, available: true)
                        Text(tr("estimate_short")).font(.footnote).foregroundStyle(SoriStyle.secondary)
                        Button {
                            exporting = true
                            Task {
                                if let url = await model.exportURL() { file = SharedFile(url: url) }
                                else { model.notice = "error_export" }
                                exporting = false
                            }
                        } label: { Label(tr("share_result"), systemImage: "square.and.arrow.up").frame(maxWidth: .infinity).padding(.vertical, 10) }
                            .buttonStyle(.borderedProminent).disabled(exporting).accessibilityIdentifier("share_csv")
                        AdvancedSection(identifier: "summary_advanced") {
                            VStack(alignment: .leading, spacing: 16) {
                                Text(tr("recent60") + " · dBFS").font(.subheadline)
                                LevelChart(points: report.snapshot.points, offset: 0, calibrated: false).frame(height: 140)
                                LabeledContent(tr("input"), value: report.conditions.routeName)
                                LabeledContent(tr("clipped_total"), value: String(report.snapshot.clipped))
                                LabeledContent(tr("estimate_method"), value: tr(report.calibrated ? "estimate_calibrated" : "estimate_default"))
                                Text(tr("estimate_explainer")).font(.footnote).foregroundStyle(SoriStyle.secondary)
                                Text(tr("summary_hint")).font(.footnote).foregroundStyle(SoriStyle.secondary)
                            }
                        }
                        Button(tr("clear_session"), role: .destructive) { confirmDelete = true }.frame(maxWidth: .infinity)
                    }.frame(maxWidth: 620).padding(24).frame(maxWidth: .infinity)
                }
            }.background(SoriStyle.background).navigationTitle(tr("summary")).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button(tr("done")) { dismiss() } } }
                .sheet(item: $file) { ShareSheet(url: $0.url) }
                .confirmationDialog(tr("delete_confirm"), isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button(tr("clear_session"), role: .destructive) { model.clearSession(); dismiss() }
                }
        }.tint(SoriStyle.accent)
    }
}

private struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: [url], applicationActivities: nil) }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private func simpleLevel(_ value: Double) -> String { String(format: "%.0f", locale: .current, value) }
private func level(_ value: Double, floor: Bool = false) -> String {
    if floor && value <= -119.95 { return "≤−120" }
    return String(format: "%.1f", locale: .current, value).replacingOccurrences(of: "-", with: "−")
}
private func duration(_ seconds: Double) -> String {
    let whole = Int(max(0, seconds))
    return String(format: "%02d:%02d:%02d", whole / 3600, (whole / 60) % 60, whole % 60)
}
private func openSettings() { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } }
private func licenseText() -> String {
    guard let url = Bundle.main.url(forResource: "ThirdPartyNotices", withExtension: "txt") else { return "" }
    return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
}

@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.izowooi.dm.ui

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.WindowManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.izowooi.dm.*
import com.izowooi.dm.R
import com.izowooi.dm.core.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Locale
import kotlin.math.*

@Composable
private fun t(key: String): String = stringResource(TextResources.id(key))

@Composable
fun MeterScreen(state: MeterState, model: MeterViewModel) {
    val context = LocalContext.current
    var sheet by remember { mutableStateOf<String?>(null) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) model.start() else model.permissionDenied()
    }
    DisposableEffect(state.running, state.keepAwake) {
        val window = (context as? Activity)?.window
        if (state.running && state.keepAwake) window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose { window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }
    Scaffold(modifier = Modifier.semantics { testTagsAsResourceId = true }, containerColor = MaterialTheme.colorScheme.background, bottomBar = {
        Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background).navigationBarsPadding()
            .padding(horizontal = 24.dp, vertical = 12.dp), horizontalArrangement = Arrangement.Center) {
            Row(Modifier.widthIn(max = 620.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Button(onClick = {
                    if (state.running || state.phase == CapturePhase.STARTING) model.stop()
                    else if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) model.start()
                    else permission.launch(Manifest.permission.RECORD_AUDIO)
                }, modifier = Modifier.weight(1f).heightIn(min = 60.dp).testTag("measure"), enabled = state.phase != CapturePhase.STOPPING,
                    shape = RoundedCornerShape(32.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = if (state.running) Color(0xFF24594B) else Color(0xFFD4F5CC),
                        contentColor = if (state.running) Color.White else Color(0xFF102E2C))) {
                    if (state.busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    else if (state.running) Box(Modifier.size(14.dp).background(Color.White, RoundedCornerShape(3.dp)))
                    else Icon(Icons.Default.PlayArrow, null, Modifier.size(22.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(t(if (state.phase == CapturePhase.STARTING) "cancel" else if (state.phase == CapturePhase.STOPPING) "stopping" else if (state.running) "stop" else if (state.hasMeasurement) "measure_again" else "start"), fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
                }
                if (state.lastReport != null && !state.running && !state.busy) {
                    FilledTonalIconButton(onClick = { sheet = "summary" }, Modifier.size(56.dp).testTag("summary")) {
                        Icon(Icons.Default.List, t("summary"))
                    }
                }
            }
        }
    }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
            Column(Modifier.widthIn(max = 668.dp).padding(horizontal = 24.dp).padding(top = 14.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(t("app_name"), style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(4.dp))
                        Text(t("tagline"), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    FilledTonalIconButton(onClick = { sheet = "settings" }, Modifier.size(48.dp).testTag("settings")) {
                        Icon(Icons.Default.Settings, t("settings"))
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(7.dp).background(if (state.running) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, CircleShape))
                    Spacer(Modifier.width(8.dp))
                    Text(t(if (state.demo) "sample_data" else if (state.phase == CapturePhase.STARTING) "starting" else if (state.phase == CapturePhase.STOPPING) "stopping" else if (state.running) "live" else if (state.hasMeasurement) "finished" else "ready"),
                        style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                    Text(duration(state.snapshot.seconds), style = MaterialTheme.typography.bodyMedium.copy(fontFeatureSettings = "tnum"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    MeterGauge(state)
                    AssistChip(onClick = { sheet = "calibration" }, label = { Text(t(if (state.calibrated) "calibrated" else "uncalibrated")) },
                        leadingIcon = { Icon(if (state.calibrated) Icons.Default.Check else Icons.Default.Edit, null, Modifier.size(16.dp)) },
                        shape = RoundedCornerShape(24.dp), modifier = Modifier.testTag("calibration"))
                    Text(t(if (state.calibrated) "estimated_hint" else "relative_hint"), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                }
                if (state.snapshot.currentClipped) Notice("clipping", true)
                if (state.profileMismatch) Notice("calibration_mismatch", false)
                state.notice?.let { message ->
                    Column {
                        Notice(message, message != "calibration_saved")
                        if (message == "permission_denied") TextButton(onClick = { openSettings(context) }) { Text(t("open_settings")) }
                    }
                }
                Statistics(state.snapshot, state.offset, state.hasMeasurement)
                Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.surface) {
                    Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(t("recent60"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                            Text(state.unit + if (state.conditions?.weighting == Weighting.A && !state.calibrated) " · A" else "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        LevelChart(state.snapshot.points, state.offset, state.calibrated, Modifier.fillMaxWidth().height(96.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("−60 s", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("0 s", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Default.Info, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Column(Modifier.weight(1f)) {
                        Text(state.conditions?.routeName ?: t("unknown_input"), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(4.dp))
                        Text(t("rms100"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(if ((state.conditions?.weighting ?: state.weighting) == Weighting.A) "A" else t("flat"), style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.background(MaterialTheme.colorScheme.surface, CircleShape).padding(horizontal = 12.dp, vertical = 8.dp))
                }
                if (state.demo) Text(t("sample_hint"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    if (sheet != null) {
        val modal = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { sheet = null }, sheetState = modal, containerColor = MaterialTheme.colorScheme.background) {
            Column(Modifier.fillMaxWidth().fillMaxHeight(0.92f)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 24.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(t(sheet!!), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
                    IconButton(onClick = { sheet = null }) { Icon(Icons.Default.Close, t("done")) }
                }
                Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 18.dp).padding(bottom = 30.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    when (sheet) {
                        "settings" -> SettingsContent(state, model, openCalibration = { sheet = "calibration" })
                        "calibration" -> CalibrationContent(state, model)
                        "summary" -> SummaryContent(state, model) { sheet = null }
                    }
                }
            }
        }
    }
}

@Composable private fun MeterGauge(state: MeterState) {
    val accent = MaterialTheme.colorScheme.primary
    val track = MaterialTheme.colorScheme.outlineVariant
    val value = state.snapshot.current + state.offset
    val progress = ((value - if (state.calibrated) 0 else -120) / 120).coerceIn(0.0, 1.0)
    val accessible = t("current_level") + ", " + if (state.hasMeasurement) level(value, !state.calibrated) + " " + state.unit + ", " + t(if (state.calibrated) "estimated_level" else "relative_level") else t("ready")
    val density = LocalDensity.current
    val expanded = density.fontScale > 1.3f
    val measurer = rememberTextMeasurer()
    BoxWithConstraints(Modifier.fillMaxWidth().height(if (expanded) 260.dp else 212.dp).clearAndSetSemantics { contentDescription = accessible }.testTag("level"), contentAlignment = Alignment.Center) {
        if (!expanded) Canvas(Modifier.fillMaxSize()) {
            val radius = min(size.width * 0.44f, 103.dp.toPx())
            val center = Offset(size.width / 2, 121.dp.toPx())
            repeat(61) { index ->
                val angle = (150 + index * 4) * PI / 180
                val length = if (index % 5 == 0) 14.dp.toPx() else 7.dp.toPx()
                drawLine(if (state.hasMeasurement && index / 60.0 <= progress) accent else track,
                    Offset(center.x + cos(angle).toFloat() * (radius - length), center.y + sin(angle).toFloat() * (radius - length)),
                    Offset(center.x + cos(angle).toFloat() * radius, center.y + sin(angle).toFloat() * radius),
                    strokeWidth = 3.dp.toPx(), cap = StrokeCap.Round)
            }
        }
        val reading = if (state.hasMeasurement) level(value, !state.calibrated) else "—"
        val maximumWidth = with(density) { minOf(if (expanded) 290.dp else 185.dp, maxWidth - 64.dp).toPx() }
        val baseSize = (if (expanded) 104f / density.fontScale else 78f).sp
        val textStyle = TextStyle(fontSize = baseSize, fontWeight = FontWeight.Medium, fontFeatureSettings = "tnum")
        val measuredWidth = measurer.measure(AnnotatedString(reading), style = textStyle, softWrap = false, maxLines = 1).size.width
        val gaugeFontSize = (baseSize.value * min(1f, maximumWidth / max(1, measuredWidth))).sp
        Column(Modifier.padding(horizontal = 32.dp).offset(y = 14.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(t("current_level"), style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.5.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(reading,
                fontSize = gaugeFontSize,
                fontWeight = FontWeight.Medium, style = TextStyle(fontFeatureSettings = "tnum"), maxLines = 1)
            Text(state.unit + " · " + t(if (state.calibrated) "estimated_level" else "relative_level"),
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        }
    }
}

@Composable private fun Statistics(snapshot: MeterSnapshot, offset: Double, available: Boolean) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        listOf("minimum" to snapshot.minimum, "average" to snapshot.average, "maximum" to snapshot.maximum).forEach { (key, value) ->
            Surface(modifier = Modifier.weight(1f), shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surface) {
                Column(Modifier.padding(horizontal = 6.dp, vertical = 16.dp).semantics(mergeDescendants = true) {},
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(t(key), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                    Text(if (available) level(value + offset) else "—", style = MaterialTheme.typography.titleLarge.copy(fontFeatureSettings = "tnum"), fontWeight = FontWeight.SemiBold, maxLines = 1)
                }
            }
        }
    }
}

@Composable private fun LevelChart(points: List<LevelPoint>, offset: Double, calibrated: Boolean, modifier: Modifier = Modifier) {
    val accent = MaterialTheme.colorScheme.primary
    val track = MaterialTheme.colorScheme.outlineVariant
    val secondary = MaterialTheme.colorScheme.onSurfaceVariant
    val label = t("recent60") + if (points.isEmpty()) "" else ", " + level(points.minOf { it.dbfs } + offset) + " – " + level(points.maxOf { it.dbfs } + offset)
    Canvas(modifier.semantics { contentDescription = label }) {
        val plotWidth = size.width - 29.dp.toPx()
        val low = if (calibrated) 0.0 else -120.0
        val paint = android.graphics.Paint().apply { color = android.graphics.Color.argb(255, (secondary.red * 255).toInt(), (secondary.green * 255).toInt(), (secondary.blue * 255).toInt()); textSize = 10.sp.toPx(); textAlign = android.graphics.Paint.Align.RIGHT; isAntiAlias = true }
        repeat(3) { index ->
            val y = index * (size.height - 8.dp.toPx()) / 2 + 4.dp.toPx()
            drawLine(track.copy(alpha = 0.55f), Offset(0f, y), Offset(plotWidth, y), strokeWidth = 1.dp.toPx())
            drawContext.canvas.nativeCanvas.drawText((low + 120 - index * 60).toInt().toString(), size.width, y + 3.dp.toPx(), paint)
        }
        if (points.isNotEmpty()) {
            val start = points.last().seconds - 60
            val path = Path()
            var firstX = 0f
            points.forEachIndexed { index, point ->
                val x = ((point.seconds - start) / 60 * plotWidth).toFloat().coerceIn(0f, plotWidth)
                val y = (1 - ((point.dbfs + offset - low) / 120).coerceIn(0.0, 1.0)).toFloat() * (size.height - 8.dp.toPx()) + 4.dp.toPx()
                if (index == 0) { path.moveTo(x, y); firstX = x } else path.lineTo(x, y)
            }
            val fill = Path().apply { addPath(path); lineTo(plotWidth, size.height); lineTo(firstX, size.height); close() }
            drawPath(fill, accent.copy(alpha = 0.09f))
            drawPath(path, accent, style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round))
        }
    }
}

@Composable private fun Notice(key: String, warning: Boolean) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(Icons.Default.Info, null, Modifier.size(18.dp), tint = if (warning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
        Text(t(key), style = MaterialTheme.typography.bodySmall, color = if (warning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
    }
}

@Composable private fun SettingsContent(state: MeterState, model: MeterViewModel, openCalibration: () -> Unit) {
    val context = LocalContext.current
    var showLicenses by remember { mutableStateOf(false) }
    Text(t("weighting"), style = MaterialTheme.typography.titleSmall)
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        FilterChip(selected = state.weighting == Weighting.A, onClick = { model.weighting(Weighting.A) }, label = { Text("A") }, enabled = state.phase == CapturePhase.IDLE)
        FilterChip(selected = state.weighting == Weighting.FLAT, onClick = { model.weighting(Weighting.FLAT) }, label = { Text(t("flat")) }, enabled = state.phase == CapturePhase.IDLE)
    }
    TextButton(onClick = openCalibration) { Icon(Icons.Default.Edit, null); Spacer(Modifier.width(8.dp)); Text(t("calibration")) }
    SettingsToggle("keep_awake", "keep_awake_explainer", state.keepAwake, model::keepAwake)
    HorizontalDivider()
    SettingsToggle("diagnostics", "diagnostics_explainer", state.diagnostics, model::diagnostics)
    HorizontalDivider()
    Text(t("privacy"), style = MaterialTheme.typography.titleMedium)
    Text(t("privacy_explainer"), style = MaterialTheme.typography.bodyMedium)
    Text(t("about"), style = MaterialTheme.typography.titleMedium)
    Text(t("accuracy_explainer"), style = MaterialTheme.typography.bodyMedium)
    Text(t("filter_explainer"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    TextButton(onClick = { openSettings(context, language = true) }) { Text(t("locale")) }
    Text(t("locale_hint"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    TextButton(onClick = { showLicenses = true }) { Text(t("licenses")) }
    Text(t("version") + " 1.0 (1)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    if (showLicenses) {
        val notices = remember { context.assets.open("ThirdPartyNotices.txt").bufferedReader().use { it.readText() } }
        AlertDialog(onDismissRequest = { showLicenses = false }, title = { Text(t("licenses")) },
            text = { Text(notices, Modifier.heightIn(max = 420.dp).verticalScroll(rememberScrollState()), style = MaterialTheme.typography.bodySmall) },
            confirmButton = { TextButton(onClick = { showLicenses = false }) { Text(t("done")) } })
    }
}

@Composable private fun SettingsToggle(title: String, description: String, checked: Boolean, change: (Boolean) -> Unit) {
    val accessibleTitle = t(title)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(t(title), Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
            Switch(checked = checked, onCheckedChange = change, modifier = Modifier.semantics { contentDescription = accessibleTitle }.testTag(title))
        }
        Text(t(description), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable private fun CalibrationContent(state: MeterState, model: MeterViewModel) {
    var name by remember { mutableStateOf("") }
    var reference by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var matches by remember { mutableStateOf(false) }
    var reset by remember { mutableStateOf(false) }
    Text(t("calibration_intro"), style = MaterialTheme.typography.bodyMedium)
    Text(t("profiles"), style = MaterialTheme.typography.titleMedium)
    Row(verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected = state.selectedProfile.isEmpty(), onClick = { model.selectProfile("") }, enabled = state.phase == CapturePhase.IDLE)
        Text(t("none"))
    }
    state.profiles.forEach { profile ->
        Row(verticalAlignment = Alignment.CenterVertically) {
            RadioButton(selected = state.selectedProfile == profile.id, onClick = { model.selectProfile(profile.id) }, enabled = state.phase == CapturePhase.IDLE)
            Column(Modifier.weight(1f)) {
                Text(profile.name)
                Text("${profile.conditions.weighting} · ${profile.conditions.sampleRate} Hz · ${profile.conditions.routeName}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = { model.removeProfile(profile.id) }, enabled = state.phase == CapturePhase.IDLE) { Icon(Icons.Default.Delete, t("delete_profile")) }
        }
    }
    HorizontalDivider()
    Text(t("create_profile"), style = MaterialTheme.typography.titleMedium)
    OutlinedTextField(value = name, onValueChange = { name = it.take(60) }, label = { Text(t("profile_name")) }, modifier = Modifier.fillMaxWidth().testTag("profile_name"), singleLine = true)
    OutlinedTextField(value = reference, onValueChange = { reference = it.take(8) }, label = { Text(t("reference_db")) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth().testTag("reference_db"), singleLine = true)
    OutlinedTextField(value = notes, onValueChange = { notes = it.take(300) }, label = { Text(t("notes")) }, modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 4)
    Text(t("weighting") + ": " + if (state.weighting == Weighting.A) "A · dBA" else t("flat") + " · dB SPL", style = MaterialTheme.typography.labelLarge)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = matches, onCheckedChange = { matches = it })
        Text(t("reference_agreement"), style = MaterialTheme.typography.bodyMedium)
    }
    if (state.running && state.snapshot.canCalibrate) Text(t("relative_level") + ": " + level(state.snapshot.calibrationLevel) + " dBFS")
    else Text(t("stable_required"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Button(onClick = {
        if (model.saveCalibration(name, reference.replace(',', '.').toDoubleOrNull() ?: 0.0, notes)) {
            name = ""; reference = ""; notes = ""; matches = false
        }
    }, enabled = state.running && state.snapshot.canCalibrate && matches && name.isNotBlank() && (reference.replace(',', '.').toDoubleOrNull() ?: 0.0) in 20.0..140.0 && state.profiles.size < 20,
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).testTag("save_calibration")) { Text(t("save_profile")) }
    Text(t("reference_unit_hint"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    if (state.profiles.isNotEmpty()) TextButton(onClick = { reset = true }, enabled = state.phase == CapturePhase.IDLE) { Text(t("reset"), color = MaterialTheme.colorScheme.error) }
    if (reset) AlertDialog(onDismissRequest = { reset = false }, title = { Text(t("reset_confirm")) }, confirmButton = { TextButton(onClick = { model.resetProfiles(); reset = false }) { Text(t("reset")) } }, dismissButton = { TextButton(onClick = { reset = false }) { Text(t("cancel")) } })
}

@Composable private fun SummaryContent(state: MeterState, model: MeterViewModel, dismiss: () -> Unit) {
    val report = state.lastReport ?: return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var exporting by remember { mutableStateOf(false) }
    var delete by remember { mutableStateOf(false) }
    if (report.stopReason == "demo") Text(t("sample_data"), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(duration(report.snapshot.seconds), style = MaterialTheme.typography.headlineLarge)
    val date = runCatching { java.time.Instant.parse(report.startedAt).atZone(java.time.ZoneId.systemDefault())
        .format(java.time.format.DateTimeFormatter.ofLocalizedDateTime(java.time.format.FormatStyle.MEDIUM, java.time.format.FormatStyle.SHORT)) }.getOrDefault(report.startedAt)
    Text(date, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(t(if (report.calibrated) "estimated_level" else "relative_level") + " · " + report.unit, style = MaterialTheme.typography.bodyMedium)
    Statistics(report.snapshot, report.offset, true)
    LevelChart(report.snapshot.points, report.offset, report.calibrated, Modifier.fillMaxWidth().height(170.dp))
    Text(t("input") + ": " + report.conditions.routeName)
    Text(t("clipped_total") + ": " + report.snapshot.clipped)
    Text(t("summary_hint"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Button(onClick = {
        exporting = true
        scope.launch {
            try {
                val file = withContext(Dispatchers.IO) {
                    val folder = File(context.cacheDir, "exports").apply { mkdirs() }
                    File(folder, "Sori-measurement.csv").apply { writeText(report.csv()) }
                }
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
                val intent = Intent(Intent.ACTION_SEND).setType("text/csv").putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                context.startActivity(Intent.createChooser(intent, context.getString(R.string.share)))
            } catch (_: Exception) { model.exportFailed() }
            exporting = false
        }
    }, enabled = !exporting, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).testTag("share_csv")) {
        Icon(Icons.Default.Share, null); Spacer(Modifier.width(8.dp)); Text(t("share"))
    }
    TextButton(onClick = { delete = true }, modifier = Modifier.fillMaxWidth()) { Text(t("clear_session"), color = MaterialTheme.colorScheme.error) }
    if (delete) AlertDialog(onDismissRequest = { delete = false }, title = { Text(t("delete_confirm")) }, confirmButton = { TextButton(onClick = { model.clearSession(); dismiss() }) { Text(t("clear_session")) } }, dismissButton = { TextButton(onClick = { delete = false }) { Text(t("cancel")) } })
}

private fun level(value: Double, floor: Boolean = false): String = if (floor && value <= -119.95) "≤−120" else String.format(Locale.getDefault(), "%.1f", value).replace('-', '−')
private fun duration(seconds: Double): String { val whole = max(0, seconds.toInt()); return String.format(Locale.ROOT, "%02d:%02d:%02d", whole / 3600, whole / 60 % 60, whole % 60) }
private fun openSettings(context: Context, language: Boolean = false) {
    val action = if (language && Build.VERSION.SDK_INT >= 33) Settings.ACTION_APP_LOCALE_SETTINGS else Settings.ACTION_APPLICATION_DETAILS_SETTINGS
    context.startActivity(Intent(action, Uri.parse("package:${context.packageName}")))
}

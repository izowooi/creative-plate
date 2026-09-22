package com.izowooi.dm.data

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.AtomicFile
import com.izowooi.dm.core.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

class LocalStore(context: Context) {
    private val folder = File(context.noBackupFilesDir, "sori").apply { mkdirs() }
    companion object { private val io = Executors.newSingleThreadExecutor() }
    private val main = Handler(Looper.getMainLooper())

    fun profiles(): List<CalibrationProfile> = try {
        val values = JSONArray(File(folder, "profiles.json").readText())
        (0 until minOf(values.length(), 20)).map { profile(values.getJSONObject(it)) }
    } catch (_: Exception) { emptyList() }

    fun saveProfiles(profiles: List<CalibrationProfile>) {
        val json = JSONArray(profiles.map { it.json() }).toString()
        io.execute { write("profiles.json", json) }
    }

    fun loadReport(result: (SessionReport?) -> Unit) {
        io.execute {
            val report = try { report(JSONObject(File(folder, "last-session.json").readText())) } catch (_: Exception) { null }
            main.post { result(report) }
        }
    }

    fun saveReport(report: SessionReport) { io.execute { write("last-session.json", report.json().toString()) } }
    fun clearReport() { io.execute { File(folder, "last-session.json").delete() } }

    private fun write(name: String, text: String) {
        val file = AtomicFile(File(folder, name))
        var stream: java.io.FileOutputStream? = null
        try { stream = file.startWrite(); stream.write(text.toByteArray(Charsets.UTF_8)); file.finishWrite(stream) }
        catch (_: Exception) { stream?.let { file.failWrite(it) } }
    }

    private fun InputConditions.json() = JSONObject().put("device", device).put("routeId", routeId).put("routeName", routeName)
        .put("sampleRate", sampleRate).put("channels", channels).put("source", source).put("weighting", weighting.name)
        .put("gain", gain).put("pipeline", pipeline)
    private fun input(o: JSONObject) = InputConditions(o.getString("device"), o.getString("routeId"), o.getString("routeName"),
        o.getInt("sampleRate"), o.getInt("channels"), o.getString("source"), Weighting.valueOf(o.getString("weighting")),
        o.getString("gain"), o.getString("pipeline"))
    private fun CalibrationProfile.json() = JSONObject().put("id", id).put("name", name).put("createdAt", createdAt)
        .put("referenceDb", referenceDb).put("measuredDbfs", measuredDbfs).put("notes", notes).put("conditions", conditions.json())
    private fun profile(o: JSONObject) = CalibrationProfile(o.getString("id"), o.getString("name"), o.getString("createdAt"),
        o.getDouble("referenceDb"), o.getDouble("measuredDbfs"), o.getString("notes"), input(o.getJSONObject("conditions")))
    private fun LevelPoint.json() = JSONObject().put("seconds", seconds).put("dbfs", dbfs).put("count", count).put("clipped", clipped)
    private fun point(o: JSONObject) = LevelPoint(o.getDouble("seconds"), o.getDouble("dbfs"), o.getInt("count"), o.getInt("clipped"))
    private fun points(a: JSONArray) = (0 until a.length()).map { point(a.getJSONObject(it)) }
    private fun MeterSnapshot.json() = JSONObject().put("current", current).put("minimum", minimum).put("average", average)
        .put("maximum", maximum).put("seconds", seconds).put("count", count).put("clipped", clipped).put("currentClipped", currentClipped)
        .put("points", JSONArray(points.map { it.json() }))
    private fun snapshot(o: JSONObject) = MeterSnapshot(o.getDouble("current"), o.getDouble("minimum"), o.getDouble("average"),
        o.getDouble("maximum"), o.getDouble("seconds"), o.getLong("count"), o.getLong("clipped"), o.getBoolean("currentClipped"), points(o.getJSONArray("points")))
    private fun SessionReport.json() = JSONObject().put("startedAt", startedAt).put("endedAt", endedAt)
        .put("conditions", conditions.json()).put("calibration", calibration?.json() ?: JSONObject.NULL)
        .put("snapshot", snapshot.json()).put("readings", JSONArray(readings.map { it.json() })).put("stopReason", stopReason)
    private fun report(o: JSONObject) = SessionReport(o.getString("startedAt"), o.getString("endedAt"), input(o.getJSONObject("conditions")),
        if (o.isNull("calibration")) null else profile(o.getJSONObject("calibration")), snapshot(o.getJSONObject("snapshot")),
        points(o.getJSONArray("readings")), o.getString("stopReason"))
}

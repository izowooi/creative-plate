package com.izowooi.dm

import android.app.Application
import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.crashlytics.FirebaseCrashlytics

class SoriApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)
        Diagnostics.setEnabled(this, getSharedPreferences("sori", MODE_PRIVATE).getBoolean("diagnostics", false))
    }
}

object Diagnostics {
    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences("sori", Context.MODE_PRIVATE).edit().putBoolean("diagnostics", enabled).apply()
        if (FirebaseApp.getApps(context).isEmpty()) return
        FirebaseApp.getInstance().setDataCollectionDefaultEnabled(enabled)
        FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(enabled)
        if (!enabled) FirebaseCrashlytics.getInstance().deleteUnsentReports()
    }
}

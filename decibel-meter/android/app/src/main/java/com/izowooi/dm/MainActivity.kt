package com.izowooi.dm

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import com.izowooi.dm.ui.MeterScreen
import com.izowooi.dm.ui.theme.DmTheme

class MainActivity : ComponentActivity() {
    private val model by lazy { ViewModelProvider(this)[MeterViewModel::class.java] }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (BuildConfig.DEBUG && intent.getBooleanExtra("sori_demo", false)) model.showDemo()
        setContent {
            val state by model.state.collectAsStateWithLifecycle()
            DmTheme { MeterScreen(state, model) }
        }
    }
    override fun onStop() {
        if (!isChangingConfigurations) model.stop("background_stopped")
        super.onStop()
    }
}

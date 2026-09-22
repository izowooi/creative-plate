package com.izowooi.dm.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Light = lightColorScheme(
    primary = Color(0xFF176E5F), onPrimary = Color.White,
    primaryContainer = Color(0xFFD4F5CC), onPrimaryContainer = Color(0xFF102E2C),
    secondary = Color(0xFF526963), secondaryContainer = Color(0xFFEAF1E8),
    background = Color(0xFFF6F6F1), onBackground = Color(0xFF192724),
    surface = Color.White, onSurface = Color(0xFF192724),
    surfaceVariant = Color(0xFFECEFE7), onSurfaceVariant = Color(0xFF596660),
    outlineVariant = Color(0xFFDEE4DB), error = Color(0xFFAC4B2C),
)
private val Dark = darkColorScheme(
    primary = Color(0xFFD4F5CC), onPrimary = Color(0xFF102E2C),
    primaryContainer = Color(0xFF24594B), onPrimaryContainer = Color(0xFFD4F5CC),
    secondary = Color(0xFFB5CCC2), secondaryContainer = Color(0xFF284139),
    background = Color(0xFF0E1A18), onBackground = Color(0xFFE6EEE5),
    surface = Color(0xFF162624), onSurface = Color(0xFFE6EEE5),
    surfaceVariant = Color(0xFF24352E), onSurfaceVariant = Color(0xFFB5C4BA),
    outlineVariant = Color(0xFF34473E), error = Color(0xFFF0A687),
)

@Composable
fun DmTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (darkTheme) Dark else Light, content = content)
}

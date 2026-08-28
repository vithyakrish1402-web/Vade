package com.enctxt.presentation.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * The Vade palette, carried verbatim from the web token sheet (client/src/index.css).
 *
 * Emerald is reserved for privacy signal — verification, reveal, and the unread count — and
 * appears nowhere else. Warnings use a warm ochre rather than red, so "Key changed" reads as
 * serious without alarm styling.
 */
@Immutable
data class VadeColors(
    val bg: Color,
    val surface: Color,
    val surface2: Color,
    val text: Color,
    val muted: Color,
    val faint: Color,
    val line: Color,
    val accent: Color,
    val accentInk: Color,
    val accentTint: Color,
    val warn: Color,
    val warnTint: Color,
    /** The inverted pair — outgoing bubbles, primary buttons, the compose action. */
    val outBg: Color,
    val outFg: Color,
    val scrim: Color,
    val isDark: Boolean
)

val VadeLightColors = VadeColors(
    bg = Color(0xFFFCFCFB),
    surface = Color(0xFFF2F2F0),
    surface2 = Color(0xFFE9E9E6),
    text = Color(0xFF141516),
    muted = Color(0xFF77776F),
    faint = Color(0xFFA3A39C),
    line = Color(0x1A141516),
    accent = Color(0xFF0F9D6B),
    accentInk = Color(0xFF0B7A53),
    accentTint = Color(0xFFE8F5EF),
    warn = Color(0xFF9A5B12),
    warnTint = Color(0xFFFBF1E2),
    outBg = Color(0xFF141516),
    outFg = Color(0xFFFCFCFB),
    scrim = Color(0x6B0A0B0C),
    isDark = false
)

val VadeDarkColors = VadeColors(
    bg = Color(0xFF0D0E0F),
    surface = Color(0xFF191B1C),
    surface2 = Color(0xFF232627),
    text = Color(0xFFF4F4F2),
    muted = Color(0xFF8D8F8C),
    faint = Color(0xFF6B6D6A),
    line = Color(0x1FF4F4F2),
    accent = Color(0xFF2EC38A),
    accentInk = Color(0xFF4FD8A3),
    accentTint = Color(0x1F2EC38A),
    warn = Color(0xFFE0A95F),
    warnTint = Color(0x21E0A95F),
    outBg = Color(0xFFF4F4F2),
    outFg = Color(0xFF0D0E0F),
    scrim = Color(0x8C08090A),
    isDark = true
)

val LocalVadeColors = staticCompositionLocalOf { VadeLightColors }

/**
 * Figtree is the web face. Compose would need it vendored as a font resource or pulled through
 * a downloadable-fonts provider; neither is worth a runtime dependency on a third party for an
 * app whose whole premise is that nothing leaves the device. The platform sans-serif is used
 * instead, and every size, weight and tracking below matches the spec exactly. Swapping in a
 * bundled Figtree is a one-line change here.
 */
val VadeFontFamily = FontFamily.SansSerif

/** The spec's type roles, one style each. */
object VadeType {
    val screenTitle = TextStyle(
        fontFamily = VadeFontFamily,
        fontSize = 30.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.026).em,
        lineHeight = 33.sp
    )
    val displayTitle = TextStyle(
        fontFamily = VadeFontFamily,
        fontSize = 38.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.032).em,
        lineHeight = 40.sp
    )
    val stepTitle = TextStyle(
        fontFamily = VadeFontFamily,
        fontSize = 24.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.022).em,
        lineHeight = 29.sp
    )
    val sheetTitle = TextStyle(
        fontFamily = VadeFontFamily,
        fontSize = 21.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.02).em,
        lineHeight = 25.sp
    )
    val name = TextStyle(
        fontFamily = VadeFontFamily,
        fontSize = 15.5.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.012).em
    )
    /** Protected text: the +2% tracking keeps homoglyph runs from crowding. */
    val message = TextStyle(
        fontFamily = VadeFontFamily,
        fontSize = 15.sp,
        fontWeight = FontWeight.Normal,
        letterSpacing = 0.02.em,
        lineHeight = 22.sp
    )
    /** Revealed plaintext: same size, normal tracking. */
    val plain = TextStyle(
        fontFamily = VadeFontFamily,
        fontSize = 15.sp,
        fontWeight = FontWeight.Normal,
        lineHeight = 22.sp
    )
    val rowSecondary = TextStyle(
        fontFamily = VadeFontFamily,
        fontSize = 13.sp,
        fontWeight = FontWeight.Normal
    )
    val meta = TextStyle(
        fontFamily = VadeFontFamily,
        fontSize = 11.5.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.01.em
    )
    val sectionLabel = TextStyle(
        fontFamily = VadeFontFamily,
        fontSize = 11.sp,
        fontWeight = FontWeight.Normal,
        letterSpacing = 0.09.em
    )
    val body = TextStyle(
        fontFamily = VadeFontFamily,
        fontSize = 14.5.sp,
        fontWeight = FontWeight.Normal,
        lineHeight = 21.sp
    )
    val bodySmall = TextStyle(
        fontFamily = VadeFontFamily,
        fontSize = 12.5.sp,
        fontWeight = FontWeight.Normal,
        lineHeight = 18.sp
    )
    val button = TextStyle(
        fontFamily = VadeFontFamily,
        fontSize = 15.5.sp,
        fontWeight = FontWeight.Bold
    )
}

/** 4 · icon gap, 9 · stack, 13 · row, 18 · gutter, 26 · section, 35 · screen. */
object VadeSpace {
    val gap = 4.dp
    val stack = 9.dp
    val row = 13.dp
    val gutter = 18.dp
    val section = 26.dp
    val screen = 35.dp

    /** The horizontal screen gutter used by every list and settings surface. */
    val screenPadding = 22.dp

    /** Minimum touch target. Visual size may be smaller than the target. */
    val touchTarget = 48.dp
}

object VadeShape {
    val pill = CircleShape
    val card = RoundedCornerShape(20.dp)
    val dialog = RoundedCornerShape(26.dp)
    val sheet = RoundedCornerShape(topStart = 30.dp, topEnd = 30.dp)
    val pad = RoundedCornerShape(34.dp)
    val banner = RoundedCornerShape(18.dp)

    /** 22px all round, with the 7px tail corner on the sender's side. */
    val bubbleOutgoing = RoundedCornerShape(22.dp, 22.dp, 7.dp, 22.dp)
    val bubbleIncoming = RoundedCornerShape(22.dp, 22.dp, 22.dp, 7.dp)
}

/** Icon sizes: 22 in navigation, 19–20 for actions, 12–13 inline with meta text. */
object VadeIconSize {
    val nav = 22.dp
    val action = 19.dp
    val inline = 13.dp
    val small = 12.dp
}

/**
 * Reads the active token set. Prefer this over `MaterialTheme.colorScheme` in Vade screens —
 * the Material scheme below exists so stock Material components inherit sensible colors, but
 * it cannot express roles like `faint`, `warnTint` or the inverted pair.
 */
val vadeColors: VadeColors
    @Composable
    @ReadOnlyComposable
    get() = LocalVadeColors.current

@Composable
fun VadeTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colors = if (darkTheme) VadeDarkColors else VadeLightColors

    // Mapped so any stock Material component picks up the palette rather than Material purple.
    val materialScheme = if (darkTheme) {
        darkColorScheme(
            primary = colors.accent,
            onPrimary = colors.outFg,
            secondary = colors.surface2,
            onSecondary = colors.text,
            background = colors.bg,
            onBackground = colors.text,
            surface = colors.surface,
            onSurface = colors.text,
            surfaceVariant = colors.surface2,
            onSurfaceVariant = colors.muted,
            outline = colors.faint,
            outlineVariant = colors.line,
            error = colors.warn,
            onError = colors.bg,
            scrim = colors.scrim
        )
    } else {
        lightColorScheme(
            primary = colors.accent,
            onPrimary = colors.outFg,
            secondary = colors.surface2,
            onSecondary = colors.text,
            background = colors.bg,
            onBackground = colors.text,
            surface = colors.surface,
            onSurface = colors.text,
            surfaceVariant = colors.surface2,
            onSurfaceVariant = colors.muted,
            outline = colors.faint,
            outlineVariant = colors.line,
            error = colors.warn,
            onError = colors.bg,
            scrim = colors.scrim
        )
    }

    CompositionLocalProvider(LocalVadeColors provides colors) {
        MaterialTheme(
            colorScheme = materialScheme,
            typography = MaterialTheme.typography.copy(
                bodyLarge = VadeType.body,
                bodyMedium = VadeType.rowSecondary,
                labelLarge = VadeType.meta
            ),
            content = content
        )
    }
}

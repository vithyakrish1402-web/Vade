package com.enctxt.presentation.components.vade

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.enctxt.core.privacy.ProtectedRenderMode
import com.enctxt.core.privacy.ProtectedTextEngine
import com.enctxt.presentation.theme.VadeShape
import com.enctxt.presentation.theme.VadeSpace
import com.enctxt.presentation.theme.VadeType
import com.enctxt.presentation.theme.vadeColors

/**
 * `HOMOGLYPH` is presented as "Classic" — the engine name is kept internally so stored
 * preferences and the cross-platform test vectors stay valid.
 */
fun protectionStyleLabel(mode: ProtectedRenderMode): String = when (mode) {
    ProtectedRenderMode.ILLUSION -> "Illusion"
    ProtectedRenderMode.PATTERN -> "Pattern"
    else -> "Classic"
}

private fun protectionStyleDescription(mode: ProtectedRenderMode): String = when (mode) {
    ProtectedRenderMode.ILLUSION -> "Reads as an ordinary, unrelated message."
    ProtectedRenderMode.PATTERN -> "No letterforms — rhythm and an intent marker only."
    else -> "Look-alike letterforms keep the shape of the sentence."
}

val SELECTABLE_PROTECTION_MODES = listOf(
    ProtectedRenderMode.HOMOGLYPH,
    ProtectedRenderMode.ILLUSION,
    ProtectedRenderMode.PATTERN
)

/** A fixed, local sample. Never a real message — the picker must not leak thread content. */
private const val PREVIEW_SAMPLE = "See you at the station tonight"

/**
 * The three rendering styles, each with a live preview of the same sample sentence.
 *
 * This is a local rendering preference only. It changes nothing about encryption and is never
 * transmitted — the copy above the picker says so, because a privacy control that looks like a
 * security control is worse than no control.
 */
@Composable
fun ProtectionStylePicker(
    selected: ProtectedRenderMode,
    onSelect: (ProtectedRenderMode) -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = vadeColors

    val previews = remember {
        SELECTABLE_PROTECTION_MODES.associateWith { mode ->
            try {
                ProtectedTextEngine.protect(PREVIEW_SAMPLE, mode)
            } catch (_: Exception) {
                ""
            }
        }
    }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(VadeSpace.stack)
    ) {
        SELECTABLE_PROTECTION_MODES.forEach { mode ->
            val isSelected = mode == selected

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(VadeShape.card)
                    .background(colors.surface)
                    .border(
                        width = 1.5.dp,
                        color = if (isSelected) colors.accent else Color.Transparent,
                        shape = VadeShape.card
                    )
                    .selectable(
                        selected = isSelected,
                        role = Role.RadioButton,
                        onClick = { onSelect(mode) }
                    )
                    .heightIn(min = VadeSpace.touchTarget)
                    .padding(horizontal = 15.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Box(
                    modifier = Modifier
                        .padding(top = 2.dp)
                        .size(18.dp)
                        .background(
                            if (isSelected) colors.accent else Color.Transparent,
                            CircleShape
                        )
                        .border(
                            1.5.dp,
                            if (isSelected) colors.accent else colors.faint,
                            CircleShape
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    if (isSelected) {
                        Box(
                            modifier = Modifier
                                .size(7.dp)
                                .background(colors.surface, CircleShape)
                        )
                    }
                }

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        protectionStyleLabel(mode),
                        style = VadeType.name.copy(fontSize = 15.sp),
                        color = colors.text
                    )
                    Text(
                        protectionStyleDescription(mode),
                        style = VadeType.bodySmall,
                        color = colors.muted,
                        modifier = Modifier.padding(top = 1.dp)
                    )
                    Text(
                        previews[mode].orEmpty(),
                        style = VadeType.message.copy(fontSize = 13.5.sp),
                        color = colors.text.copy(alpha = 0.85f),
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
        }
    }
}

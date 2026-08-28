package com.enctxt.presentation.components.vade

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.enctxt.core.security.ContactSecurityState
import com.enctxt.presentation.theme.VadeIconSize
import com.enctxt.presentation.theme.VadeShape
import com.enctxt.presentation.theme.VadeSpace
import com.enctxt.presentation.theme.VadeType
import com.enctxt.presentation.theme.vadeColors

enum class VadeButtonVariant { Solid, Outline, Text, Warn }

enum class VadeButtonSize(val height: Dp) { Large(52.dp), Medium(48.dp), Small(44.dp) }

/**
 * The pill action. Solid is the inverted pair, outline is a hairline on the ground, text is the
 * quiet tertiary. Material's ripple stands in for the web hover tint; pressed states keep the
 * same token rather than introducing a new colour.
 */
@Composable
fun VadeButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: VadeButtonVariant = VadeButtonVariant.Solid,
    size: VadeButtonSize = VadeButtonSize.Large,
    enabled: Boolean = true,
    isLoading: Boolean = false
) {
    val colors = vadeColors

    val container = when (variant) {
        VadeButtonVariant.Solid -> colors.outBg
        VadeButtonVariant.Warn -> colors.warn
        else -> Color.Transparent
    }
    val content = when (variant) {
        VadeButtonVariant.Solid -> colors.outFg
        VadeButtonVariant.Warn -> colors.bg
        else -> colors.muted
    }

    Button(
        onClick = onClick,
        enabled = enabled && !isLoading,
        modifier = modifier.heightIn(min = size.height),
        shape = VadeShape.pill,
        border = if (variant == VadeButtonVariant.Outline) BorderStroke(1.dp, colors.line) else null,
        contentPadding = PaddingValues(horizontal = 22.dp),
        elevation = null,
        colors = ButtonDefaults.buttonColors(
            containerColor = container,
            contentColor = content,
            disabledContainerColor = container.copy(alpha = 0.45f),
            disabledContentColor = content.copy(alpha = 0.45f)
        )
    ) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = content
            )
        } else {
            Text(text, style = VadeType.button)
        }
    }
}

/**
 * A circular icon action. The drawn diameter can be smaller than the 48dp target — the target
 * is enforced separately so nothing on screen has to grow to be tappable.
 */
@Composable
fun VadeIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    filled: Boolean = false,
    diameter: Dp = 40.dp,
    tint: Color? = null
) {
    val colors = vadeColors
    Box(
        modifier = modifier
            .size(VadeSpace.touchTarget)
            .clip(CircleShape)
            .clickable(onClick = onClick, role = Role.Button),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .size(diameter)
                .background(if (filled) colors.outBg else Color.Transparent, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = tint ?: if (filled) colors.outFg else colors.text,
                modifier = Modifier.size(VadeIconSize.action)
            )
        }
    }
}

/** 52dp pill field, surface fill, accent border on focus. */
@Composable
fun VadeField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    isPassword: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    enabled: Boolean = true,
    isError: Boolean = false,
    supportingText: String? = null
) {
    val colors = vadeColors
    var isRevealed by remember { mutableStateOf(false) }

    Column(modifier = modifier) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            isError = isError,
            singleLine = true,
            shape = VadeShape.pill,
            textStyle = VadeType.body.copy(color = colors.text),
            placeholder = { Text(placeholder, style = VadeType.body, color = colors.muted) },
            visualTransformation = if (isPassword && !isRevealed) {
                PasswordVisualTransformation()
            } else {
                VisualTransformation.None
            },
            keyboardOptions = KeyboardOptions(
                keyboardType = if (isPassword) KeyboardType.Password else keyboardType
            ),
            trailingIcon = if (isPassword) {
                {
                    // The user's own credential, not message content: no gesture, no timer.
                    IconButton(onClick = { isRevealed = !isRevealed }) {
                        Icon(
                            imageVector = if (isRevealed) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = if (isRevealed) "Hide password" else "Show password",
                            tint = colors.muted,
                            modifier = Modifier.size(VadeIconSize.action)
                        )
                    }
                }
            } else {
                null
            },
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = colors.surface,
                unfocusedContainerColor = colors.surface,
                disabledContainerColor = colors.surface,
                errorContainerColor = colors.surface,
                focusedBorderColor = colors.accent,
                unfocusedBorderColor = Color.Transparent,
                disabledBorderColor = Color.Transparent,
                errorBorderColor = colors.warn,
                cursorColor = colors.accent,
                focusedTextColor = colors.text,
                unfocusedTextColor = colors.text
            ),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
        )

        if (supportingText != null) {
            Text(
                text = supportingText,
                style = VadeType.bodySmall,
                color = if (isError) colors.warn else colors.muted,
                modifier = Modifier.padding(start = 20.dp, top = 6.dp)
            )
        }
    }
}

/** A circle carrying the first letter of the display name. Vade has no photos. */
@Composable
fun VadeAvatar(name: String, modifier: Modifier = Modifier, size: Dp = 44.dp) {
    val colors = vadeColors
    Box(
        modifier = modifier
            .size(size)
            .background(colors.surface, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = name.trim().take(1).uppercase().ifEmpty { "?" },
            style = VadeType.name.copy(fontSize = (size.value * 0.34f).sp),
            color = colors.text
        )
    }
}

/**
 * Verified is quiet, unverified has no icon at all, and only "Key changed" is loud. The label
 * is always present — an icon never carries the meaning alone.
 */
@Composable
fun SecurityChip(
    state: ContactSecurityState,
    modifier: Modifier = Modifier,
    inline: Boolean = false
) {
    val colors = vadeColors

    data class Presentation(val label: String, val color: Color, val background: Color, val warning: Boolean, val verified: Boolean)

    val presentation = when (state) {
        is ContactSecurityState.Verified ->
            Presentation("Verified", colors.accentInk, colors.accentTint, warning = false, verified = true)
        is ContactSecurityState.KeyChanged ->
            Presentation("Key changed", colors.warn, colors.warnTint, warning = true, verified = false)
        else ->
            Presentation("Unverified", colors.muted, colors.surface, warning = false, verified = false)
    }

    val icon: @Composable () -> Unit = {
        when {
            presentation.verified -> Icon(
                Icons.Default.Check,
                contentDescription = null,
                tint = presentation.color,
                modifier = Modifier.size(VadeIconSize.inline)
            )
            presentation.warning -> Icon(
                Icons.Default.Warning,
                contentDescription = null,
                tint = presentation.color,
                modifier = Modifier.size(VadeIconSize.inline)
            )
            else -> Unit
        }
    }

    if (inline) {
        Row(
            modifier = modifier,
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp)
        ) {
            icon()
            Text(presentation.label, style = VadeType.rowSecondary.copy(fontSize = 12.sp), color = presentation.color)
        }
    } else {
        Row(
            modifier = modifier
                .height(30.dp)
                .background(presentation.background, VadeShape.pill)
                .padding(horizontal = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            icon()
            Text(presentation.label, style = VadeType.meta.copy(fontSize = 13.sp), color = presentation.color)
        }
    }
}

/** The 11sp uppercase label heading each settings group and list section. */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text.uppercase(),
        style = VadeType.sectionLabel,
        color = vadeColors.faint,
        modifier = modifier.padding(start = 2.dp, bottom = 8.dp)
    )
}

/** A 20dp-radius surface holding hairline-divided rows. */
@Composable
fun SettingsGroup(
    modifier: Modifier = Modifier,
    label: String? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(modifier = modifier) {
        if (label != null) SectionLabel(label)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(VadeShape.card)
                .background(vadeColors.surface),
            content = content
        )
    }
}

@Composable
fun SettingsRow(
    label: String,
    modifier: Modifier = Modifier,
    value: String? = null,
    onClick: (() -> Unit)? = null,
    showChevron: Boolean = onClick != null,
    showDivider: Boolean = true
) {
    val colors = vadeColors

    Column {
        Row(
            modifier = modifier
                .fillMaxWidth()
                .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
                .heightIn(min = VadeSpace.touchTarget)
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(label, style = VadeType.body.copy(fontSize = 15.sp), color = colors.text, modifier = Modifier.weight(1f))
            if (value != null) Text(value, style = VadeType.body, color = colors.muted)
            if (showChevron) {
                Icon(
                    Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = colors.faint,
                    modifier = Modifier.size(17.dp)
                )
            }
        }
        if (showDivider) HorizontalDivider(color = colors.line, thickness = 1.dp)
    }
}

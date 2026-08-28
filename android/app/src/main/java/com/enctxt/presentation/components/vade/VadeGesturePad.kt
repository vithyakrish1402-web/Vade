package com.enctxt.presentation.components.vade

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.enctxt.core.gesture.GesturePoint
import com.enctxt.presentation.theme.VadeShape
import com.enctxt.presentation.theme.vadeColors

/**
 * Strokes shorter than this are rejected before they are ever compared. Short flicks are
 * neither memorable nor distinctive, so they are refused at enrollment as well as at reveal.
 */
const val MIN_MEMORABLE_PATH_LENGTH_DP = 100f

enum class GesturePadSkin { Ground, Overlay }

/**
 * The nine-dot pad, shared by enrollment and reveal.
 *
 * One continuous stroke — pointer down to pointer up. A cancelled pointer discards the stroke
 * entirely rather than submitting a partial one. Points are converted to density-independent
 * units before they leave, so recognition behaves the same on every screen, and raw
 * coordinates are never persisted from here.
 */
@Composable
fun GesturePad(
    onStroke: (List<GesturePoint>) -> Unit,
    modifier: Modifier = Modifier,
    hasError: Boolean = false,
    skin: GesturePadSkin = GesturePadSkin.Ground,
    size: Dp = 280.dp,
    enabled: Boolean = true,
    contentDescriptionText: String = "Gesture pad. Draw your shape in one continuous stroke."
) {
    val colors = vadeColors
    val density = LocalDensity.current
    val isOverlay = skin == GesturePadSkin.Overlay

    var pathPoints by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var dpPoints by remember { mutableStateOf<List<GesturePoint>>(emptyList()) }

    val strokeColor = when {
        isOverlay && hasError -> Color(0xE6F0B48A)
        isOverlay -> Color(0xEBFFFFFF)
        hasError -> colors.warn
        else -> colors.text
    }
    val dotColor = if (isOverlay) Color(0x47FFFFFF) else colors.faint

    Box(
        modifier = modifier
            .size(size)
            .clip(VadeShape.pad)
            .background(if (isOverlay) Color(0x0FFFFFFF) else colors.surface)
            .border(
                width = if (isOverlay) 1.dp else 1.5.dp,
                color = when {
                    isOverlay -> Color(0x29FFFFFF)
                    hasError -> colors.warn
                    else -> Color.Transparent
                },
                shape = VadeShape.pad
            )
            .semantics { contentDescription = contentDescriptionText }
    ) {
        Canvas(
            modifier = Modifier
                .size(size)
                .pointerInput(enabled) {
                    if (!enabled) return@pointerInput
                    detectDragGestures(
                        onDragStart = { offset ->
                            pathPoints = listOf(offset)
                            dpPoints = listOf(offset.toGesturePoint(density))
                        },
                        onDrag = { change, _ ->
                            pathPoints = pathPoints + change.position
                            dpPoints = dpPoints + change.position.toGesturePoint(density)
                        },
                        onDragEnd = {
                            val completed = dpPoints
                            pathPoints = emptyList()
                            dpPoints = emptyList()
                            if (completed.size > 1) onStroke(completed)
                        },
                        onDragCancel = {
                            pathPoints = emptyList()
                            dpPoints = emptyList()
                        }
                    )
                }
        ) {
            val step = this.size.width / 4f
            for (row in 1..3) {
                for (column in 1..3) {
                    drawCircle(
                        color = dotColor,
                        radius = 4.dp.toPx(),
                        center = Offset(step * column, step * row)
                    )
                }
            }

            if (pathPoints.size > 1) {
                val path = Path().apply {
                    moveTo(pathPoints.first().x, pathPoints.first().y)
                    for (index in 1 until pathPoints.size) {
                        lineTo(pathPoints[index].x, pathPoints[index].y)
                    }
                }
                drawPath(
                    path = path,
                    color = strokeColor,
                    style = Stroke(width = 3.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                )
            }
        }
    }
}

/** Progress pips: the active one widens from 7dp to 26dp. */
@Composable
fun GesturePips(
    total: Int,
    completed: Int,
    modifier: Modifier = Modifier,
    skin: GesturePadSkin = GesturePadSkin.Ground
) {
    val colors = vadeColors
    val isOverlay = skin == GesturePadSkin.Overlay

    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(total) { index ->
            val isDone = index < completed
            val isActive = index == completed

            val width by animateDpAsState(
                targetValue = if (isDone || isActive) 26.dp else 7.dp,
                animationSpec = tween(180),
                label = "pipWidth"
            )
            val color by animateColorAsState(
                targetValue = when {
                    isDone -> colors.accent
                    isActive -> if (isOverlay) Color(0xE6FFFFFF) else colors.text
                    else -> if (isOverlay) Color(0x47FFFFFF) else colors.line
                },
                animationSpec = tween(180),
                label = "pipColor"
            )

            Box(
                modifier = Modifier
                    .width(width)
                    .height(7.dp)
                    .background(color, CircleShape)
            )
        }
    }
}

/** Shared guard so enrollment and reveal reject the same too-short strokes. */
fun isMemorableStroke(points: List<GesturePoint>): Boolean {
    if (points.size < 2) return false
    var length = 0f
    for (index in 1 until points.size) {
        val dx = points[index].x - points[index - 1].x
        val dy = points[index].y - points[index - 1].y
        length += kotlin.math.sqrt(dx * dx + dy * dy)
    }
    return length >= MIN_MEMORABLE_PATH_LENGTH_DP
}

private fun Offset.toGesturePoint(density: Density): GesturePoint = with(density) {
    GesturePoint(x = x.toDp().value, y = y.toDp().value)
}

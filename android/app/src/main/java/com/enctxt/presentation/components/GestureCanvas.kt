package com.enctxt.presentation.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.enctxt.core.gesture.GesturePoint

/**
 * Interactive drawing canvas for gesture enrollment and authentication (Layer 3).
 *
 * Captures a single continuous stroke via low-level pointer input (down / move / up / cancel).
 * Emitted points are converted from raw pixels to density-independent (dp) units before
 * [onStrokeComplete] fires, so recognition behaves consistently across device densities —
 * see GestureNormalizer. A pointer-cancel event discards the in-progress stroke entirely
 * (never calls [onStrokeComplete]).
 */
@Composable
fun GestureCanvas(
    onStrokeComplete: (List<GesturePoint>) -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 240.dp,
    strokeColor: Color = Color(0xFF10B981),
    enabled: Boolean = true
) {
    val density = LocalDensity.current
    var pathPoints by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var rawDpPoints by remember { mutableStateOf<List<GesturePoint>>(emptyList()) }

    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(20.dp))
            .background(Color(0xFF020617))
            .border(1.dp, Color(0xFF334155), RoundedCornerShape(20.dp))
    ) {
        Canvas(
            modifier = Modifier
                .size(size)
                .pointerInput(enabled) {
                    if (!enabled) return@pointerInput
                    detectDragGestures(
                        onDragStart = { offset ->
                            pathPoints = listOf(offset)
                            rawDpPoints = listOf(offset.toGesturePoint(density))
                        },
                        onDrag = { change, _ ->
                            pathPoints = pathPoints + change.position
                            rawDpPoints = rawDpPoints + change.position.toGesturePoint(density)
                        },
                        onDragEnd = {
                            val completed = rawDpPoints
                            pathPoints = emptyList()
                            rawDpPoints = emptyList()
                            if (completed.isNotEmpty()) onStrokeComplete(completed)
                        },
                        onDragCancel = {
                            // Discard — never surfaces a partial/cancelled stroke.
                            pathPoints = emptyList()
                            rawDpPoints = emptyList()
                        }
                    )
                }
        ) {
            if (pathPoints.size > 1) {
                val path = androidx.compose.ui.graphics.Path().apply {
                    moveTo(pathPoints.first().x, pathPoints.first().y)
                    for (i in 1 until pathPoints.size) {
                        lineTo(pathPoints[i].x, pathPoints[i].y)
                    }
                }
                drawPath(
                    path = path,
                    color = strokeColor,
                    style = Stroke(width = 6f, cap = StrokeCap.Round, join = StrokeJoin.Round)
                )
            }
        }

        if (pathPoints.isEmpty()) {
            Box(modifier = Modifier.size(size)) {
                Text(
                    text = "Draw here",
                    color = Color(0xFF475569),
                    fontSize = MaterialTheme.typography.labelMedium.fontSize,
                    modifier = Modifier.align(androidx.compose.ui.Alignment.Center)
                )
            }
        }
    }
}

private fun Offset.toGesturePoint(density: androidx.compose.ui.unit.Density): GesturePoint {
    return with(density) {
        GesturePoint(x = x.toDp().value, y = y.toDp().value)
    }
}

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { Point } from '../../utils/gestureNormalize';
import { RotateCcw } from 'lucide-react';

export interface GestureCanvasProps {
  onStrokeComplete: (points: Point[]) => void;
  width?: number;
  height?: number;
  strokeColor?: string;
  disabled?: boolean;
  clearOnComplete?: boolean;
  className?: string;
}

export const GestureCanvas: React.FC<GestureCanvasProps> = ({
  onStrokeComplete,
  width = 280,
  height = 280,
  strokeColor = '#10b981', // Emerald 500
  disabled = false,
  clearOnComplete = false,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const currentPointsRef = useRef<Point[]>([]);

  // Setup High-DPI canvas
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = strokeColor;
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 8;
  }, [width, height, strokeColor]);

  useEffect(() => {
    setupCanvas();
  }, [setupCanvas]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, width * dpr, height * dpr);
    currentPointsRef.current = [];
  }, [width, height]);

  // Extract relative canvas coordinates from pointer event
  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Capture pointer
    canvas.setPointerCapture(e.pointerId);
    clearCanvas();

    const pt = getCoordinates(e);
    currentPointsRef.current = [pt];
    setIsDrawing(true);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const pt = getCoordinates(e);
    currentPointsRef.current.push(pt);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    const completedStroke = [...currentPointsRef.current];
    if (clearOnComplete) {
      clearCanvas();
    }

    if (completedStroke.length > 0) {
      onStrokeComplete(completedStroke);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    clearCanvas();
  };

  return (
    <div className={`relative flex flex-col items-center select-none ${className}`}>
      <div className="relative rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950 shadow-inner group">
        {/* Subtle grid pattern background for orientation */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle, #64748b 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
          }}
        />

        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          className={`cursor-crosshair block touch-none ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          style={{ touchAction: 'none' }}
        />

        {/* Clear Button */}
        <button
          type="button"
          onClick={clearCanvas}
          disabled={disabled}
          className="absolute bottom-2.5 right-2.5 p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition-colors border border-slate-700 cursor-pointer"
          title="Clear canvas"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

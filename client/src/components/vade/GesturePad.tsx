import React, { useCallback, useRef, useState } from 'react';
import { calculatePathLength, type Point } from '../../utils/gestureNormalize';

/**
 * Strokes shorter than this are rejected before they are ever compared. Short flicks are
 * neither memorable nor distinctive, so they are refused at enrollment and at reveal alike.
 */
export const MIN_MEMORABLE_PATH_LENGTH = 100;

export type GesturePadSkin = 'light' | 'overlay';

interface GesturePadProps {
  /** Fires once per completed stroke — pointer down to pointer up. */
  onStroke: (points: Point[]) => void;
  /** Draws the pad and stroke in ochre after a mismatch. */
  hasError?: boolean;
  /** `overlay` is the translucent pad used on the dark reveal scrim. */
  skin?: GesturePadSkin;
  size?: number;
  disabled?: boolean;
  label?: string;
}

const DOT_FRACTIONS = [0.25, 0.5, 0.75];

/**
 * The nine-dot pad shared by enrollment and reveal.
 *
 * One continuous stroke: pointer down to pointer up, no multi-stroke shapes. Raw coordinates
 * are handed to `onStroke` and never persisted from here — the caller normalises and stores
 * only a salted hash.
 */
export const GesturePad: React.FC<GesturePadProps> = ({
  onStroke,
  hasError = false,
  skin = 'light',
  size = 280,
  disabled = false,
  label = 'Gesture pad. Draw your shape in one continuous stroke.',
}) => {
  const [points, setPoints] = useState<Point[]>([]);
  const drawingRef = useRef(false);
  const padRef = useRef<HTMLDivElement>(null);

  const isOverlay = skin === 'overlay';

  const pointFrom = useCallback((event: React.PointerEvent): Point => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    setPoints([pointFrom(event)]);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    const next = pointFrom(event);
    setPoints((previous) => [...previous, next]);
  };

  const finish = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setPoints((current) => {
      if (current.length > 1) onStroke(current);
      return [];
    });
  };

  const strokeColor = isOverlay
    ? hasError
      ? 'rgba(240,180,138,.9)'
      : 'rgba(255,255,255,.92)'
    : hasError
      ? 'var(--v-warn)'
      : 'var(--v-text)';

  const dotColor = isOverlay ? 'rgba(255,255,255,.28)' : 'var(--v-faint)';

  return (
    <div
      ref={padRef}
      role="application"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finish}
      onPointerLeave={finish}
      onPointerCancel={finish}
      style={{ width: size, height: size, touchAction: 'none' }}
      className={[
        'relative rounded-pad select-none',
        disabled ? 'opacity-45' : 'cursor-crosshair',
        isOverlay
          ? 'bg-white/[0.06] border border-white/[0.16]'
          : `bg-surface border-[1.5px] ${hasError ? 'border-warn' : 'border-transparent'}`,
      ].join(' ')}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        {DOT_FRACTIONS.map((fy) =>
          DOT_FRACTIONS.map((fx) => (
            <circle key={`${fx}-${fy}`} cx={size * fx} cy={size * fy} r={4} fill={dotColor} />
          ))
        )}
        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke={strokeColor}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

interface GesturePipsProps {
  total: number;
  /** How many strokes have already been accepted. */
  completed: number;
  skin?: GesturePadSkin;
}

/** Progress pips: the active one widens from 7px to 26px. */
export const GesturePips: React.FC<GesturePipsProps> = ({ total, completed, skin = 'light' }) => {
  const isOverlay = skin === 'overlay';

  return (
    <div className="flex items-center gap-[9px]" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => {
        const done = index < completed;
        const active = index === completed;
        return (
          <span
            key={index}
            className="h-[7px] rounded-full transition-[width,background-color] duration-[180ms] ease-out"
            style={{
              width: done || active ? 26 : 7,
              background: done
                ? 'var(--v-accent)'
                : active
                  ? isOverlay
                    ? 'rgba(255,255,255,.9)'
                    : 'var(--v-text)'
                  : isOverlay
                    ? 'rgba(255,255,255,.28)'
                    : 'var(--v-line)',
            }}
          />
        );
      })}
    </div>
  );
};

/** Shared guard so enrollment and reveal reject the same too-short strokes. */
export function isMemorableStroke(points: Point[]): boolean {
  return calculatePathLength(points) >= MIN_MEMORABLE_PATH_LENGTH;
}

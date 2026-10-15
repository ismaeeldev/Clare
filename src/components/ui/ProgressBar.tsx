/**
 * ProgressBar — extracted verbatim from App.jsx lines 401-410. Simple
 * value/max horizontal bar, used by Stats' 4-tile grid.
 */
export interface ProgressBarProps {
  value: number;
  max: number;
  color?: string;
  height?: number;
}

export function ProgressBar({ value, max, color = "var(--color-gold)", height = 4 }: ProgressBarProps) {
  return (
    <div className="overflow-hidden bg-bg-dark" style={{ height, borderRadius: height }}>
      <div
        className="h-full transition-[width] duration-[0.6s] ease-in-out"
        style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color, borderRadius: height }}
      />
    </div>
  );
}

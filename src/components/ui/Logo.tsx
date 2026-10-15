/**
 * Logo — extracted from App.jsx lines 336-352 (the ◈ Claré wordmark).
 * Promoted to src/components/ui/ (rather than kept per-feature) since it's
 * a cross-screen brand element, used at minimum in Onboarding's ProfilSetup
 * header and likely other headers as further screens are extracted.
 *
 * Sizing preserved exactly from the original's size-based formula
 * (iconBox = size+10, radius = size/2.5, iconFontSize = size*0.65,
 * textFontSize = size+2) rather than approximated with fixed Tailwind
 * classes, since the original is parameterized and reused at different
 * sizes across the app.
 */
export interface LogoProps {
  size?: number;
  light?: boolean;
}

export function Logo({ size = 20, light = false }: LogoProps) {
  const boxSize = size + 10;
  const radius = size / 2.5;
  const iconFontSize = size * 0.65;
  const textFontSize = size + 2;

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center justify-center"
        style={{
          width: boxSize,
          height: boxSize,
          borderRadius: radius,
          background: light
            ? "var(--color-gold)"
            : "linear-gradient(135deg, var(--color-navy), var(--navy-700))",
        }}
      >
        <span
          style={{ fontSize: iconFontSize, color: light ? "var(--color-navy)" : "var(--color-gold)" }}
        >
          ◈
        </span>
      </div>
      <span
        className="font-display font-extrabold tracking-[-0.03em]"
        style={{ fontSize: textFontSize, color: light ? "var(--color-white)" : "var(--color-navy)" }}
      >
        Claré
      </span>
    </div>
  );
}

import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "./Button";

/**
 * UpgradePrompt — shown in place of an AI action's real button/result on
 * screens that mix free content with one gated AI feature (Focus, Idées,
 * Journal, Nutrition, Stats, Agenda, Home — unlike Chat/Prep Dimanche,
 * which have no free content at all and are fully locked via
 * PremiumRoute). Reuses AlertBox's warning-tone visual language
 * (bg-gold-light/border-gold, per that component's own WCAG-corrected
 * "-text" variant convention) rather than inventing a new tone, since this
 * is informational/upsell, not an error.
 */
export function UpgradePrompt({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-start gap-2.5 rounded-md border border-gold/25 bg-gold-light px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <Lock size={15} className="mt-0.5 shrink-0 text-gold-text" />
        <p className="text-body-sm font-medium text-gold-text" style={{ lineHeight: 1.6 }}>
          {message}
        </p>
      </div>
      <Button variant="primary" size="sm" onClick={() => navigate("/billing")}>
        Passer Premium — 19,90 € / mois →
      </Button>
    </div>
  );
}

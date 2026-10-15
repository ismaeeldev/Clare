/**
 * EmojiSlider — extracted from App.jsx lines 412-432, verbatim. Used for
 * energy/mood 1-5 selectors (Journal, this batch) and likely other rating
 * inputs later. Radius verified precisely against source (borderRadius: 10)
 * per the recurring radius-mismatch lesson from Home/Onboarding/Chat.
 */
export interface EmojiSliderProps {
  value: number;
  onChange: (value: number) => void;
  emojis: string[];
  label: string;
}

export function EmojiSlider({ value, onChange, emojis, label }: EmojiSliderProps) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between">
        <span className="text-label font-bold uppercase tracking-[0.06em] text-meta">{label}</span>
        <span className="text-label font-bold text-gold-text">{value}/5</span>
      </div>
      <div className="flex gap-1.5">
        {emojis.map((e, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i + 1)}
            aria-label={`${label} : ${i + 1} sur 5`}
            aria-pressed={value === i + 1}
            className={`flex-1 rounded-[10px] py-2.5 text-lg transition-opacity duration-150 ${
              value === i + 1 ? "bg-navy opacity-100" : "bg-bg-dark opacity-40 hover:opacity-70"
            }`}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

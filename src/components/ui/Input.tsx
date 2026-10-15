import { forwardRef, useId, useState } from "react";
import type { InputHTMLAttributes, ChangeEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * Input — per docs/02_ThemeGuideline.md §6.3.
 * White bg, 2px border (border -> navy on filled/focus), radius-lg (14px),
 * 16px font (prevents iOS zoom-on-focus). Label above (label type token),
 * helper text below (body-sm, text-light, optional 💡 hint prefix), error
 * state (border -> red, helper text -> red).
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, hint, error, className, id, value, defaultValue, onChange, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hasError = !!error;

    // Bug fix (found during Step 1.2 gap-check): the "filled" border-navy
    // state from §6.3 must track live user input, not just the initial
    // value/defaultValue prop — otherwise an uncontrolled input (no `value`
    // prop, the pattern most real forms in Steps 2-3 will use) never shows
    // the filled state as the user types, only while focused.
    const [isFilled, setIsFilled] = useState(() => !!(value ?? defaultValue));
    const isControlled = value !== undefined;
    const hasValue = isControlled ? !!value : isFilled;

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) setIsFilled(!!e.target.value);
      onChange?.(e);
    };

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-2 block text-label font-bold uppercase tracking-[0.06em] text-meta"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          aria-invalid={hasError || undefined}
          aria-describedby={helperText || hint || error ? `${inputId}-helper` : undefined}
          className={cn(
            "box-border w-full rounded-lg border-2 bg-white px-4 py-3.5 font-ui text-[16px] text-text outline-none transition-colors",
            hasError
              ? "border-red"
              : hasValue
                ? "border-navy"
                : "border-border focus:border-navy",
            className
          )}
          {...props}
        />
        {(helperText || hint || error) && (
          <p
            id={`${inputId}-helper`}
            className={cn(
              "mt-1.5 text-body-sm leading-normal",
              hasError ? "text-red-text" : "text-meta"
            )}
          >
            {hasError ? error : hint ? `💡 ${hint}` : helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

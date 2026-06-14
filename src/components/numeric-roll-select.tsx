"use client";

/** Диапазон целых для выпадающего списка (удобно как «ролл» на телефоне). */
export function rangeOptions(min: number, max: number): number[] {
  if (max < min) return [];
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

type NumericRollSelectProps = {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function NumericRollSelect({ value, onChange, min, max, disabled, className, "aria-label": ariaLabel }: NumericRollSelectProps) {
  const opts = rangeOptions(min, max);
  const n = Math.round(Number(value) || 0);
  const safe = Math.min(max, Math.max(min, n));
  return (
    <select
      aria-label={ariaLabel}
      className={className}
      disabled={disabled}
      value={safe}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {opts.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

"use client";

import { useMemo } from "react";

type Props = {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
  /** Показать пустую опцию (value отправляется как "") */
  allowEmpty?: boolean;
  emptyLabel?: string;
};

/**
 * Нативный &lt;select&gt; по диапазону целых чисел: на телефоне открывается колесо/лист, без ручного набора.
 */
export function IntegerRollSelect({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  className,
  id,
  name,
  allowEmpty,
  emptyLabel = "-",
  ...rest
}: Props) {
  const options = useMemo(() => {
    const out: number[] = [];
    for (let i = min; i <= max; i += step) out.push(i);
    return out;
  }, [min, max, step]);

  const strVal = allowEmpty && (value === null || value === undefined || Number.isNaN(value)) ? "" : String(value);

  return (
    <select
      id={id}
      name={name}
      className={className}
      disabled={disabled}
      value={strVal}
      onChange={(e) => {
        const v = e.target.value;
        if (allowEmpty && v === "") onChange(Number.NaN);
        else onChange(Number(v));
      }}
      aria-label={rest["aria-label"]}
    >
      {allowEmpty ? (
        <option value="" key="__empty">
          {emptyLabel}
        </option>
      ) : null}
      {options.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

/** Список опций для RHF / нативных форм без обёртки */
export function integerOptions(min: number, max: number, step = 1): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = [];
  for (let i = min; i <= max; i += step) out.push({ value: i, label: String(i) });
  return out;
}

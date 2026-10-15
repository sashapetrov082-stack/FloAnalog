// Мелкие общие элементы интерфейса.

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:opacity-90",
  secondary: "border border-border bg-surface hover:bg-background",
  ghost: "text-muted hover:text-foreground",
  danger: "border border-border bg-surface text-red-600 hover:bg-background dark:text-red-400",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-2xl px-5 py-3 text-base font-medium transition disabled:opacity-40 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-border bg-surface p-5 ${className}`}>{children}</section>;
}

/** Выбор числа кнопками «−» и «+». */
export function Stepper({
  value,
  min,
  max,
  onChange,
  unit,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  unit: (n: number) => string;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4" role="group" aria-label={label}>
      <Button
        variant="secondary"
        className="w-14 text-2xl"
        aria-label="Меньше"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </Button>
      <div className="text-center text-3xl font-semibold tabular-nums" aria-live="polite">
        {unit(value)}
      </div>
      <Button
        variant="secondary"
        className="w-14 text-2xl"
        aria-label="Больше"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </Button>
    </div>
  );
}

export function Disclaimer() {
  return (
    <div className="flex flex-col gap-2 text-sm text-muted">
      <p>Прогноз приблизительный. Приложение не является методом контрацепции и не ставит диагнозов.</p>
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          Конфиденциальность
        </a>
        <a href="/terms" className="underline underline-offset-2 hover:text-foreground">
          Соглашение
        </a>
      </p>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-accent" : "bg-border"}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-6" : "left-1"}`}
        />
      </button>
    </label>
  );
}

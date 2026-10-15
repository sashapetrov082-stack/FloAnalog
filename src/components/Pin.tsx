"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PIN_LENGTH, type PinCheck } from "@/lib/pin";
import { Button } from "./ui";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

/** Ввод PIN-кода: точки и цифровая клавиатура, работает и с физической клавиатурой. */
export function PinEntry({
  title,
  hint,
  error,
  disabled = false,
  onComplete,
}: {
  title: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  onComplete: (pin: string) => void;
}) {
  const [value, setValue] = useState("");
  const valueRef = useRef("");

  const update = (next: string) => {
    valueRef.current = next;
    setValue(next);
  };

  const press = useCallback(
    (key: string) => {
      if (disabled) return;
      const current = valueRef.current;
      if (key === "⌫") return update(current.slice(0, -1));
      if (!/^\d$/.test(key) || current.length >= PIN_LENGTH) return;
      const next = current + key;
      update(next);
      if (next.length === PIN_LENGTH) {
        // Даём последней точке закраситься, затем отдаём PIN и очищаем поле.
        setTimeout(() => {
          update("");
          onComplete(next);
        }, 120);
      }
    },
    [disabled, onComplete],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Backspace") press("⌫");
      else press(e.key);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {hint && <p className="mt-2 text-muted">{hint}</p>}
      </div>
      <div className="flex gap-4" aria-label={`Введено цифр: ${value.length} из ${PIN_LENGTH}`} role="status">
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-accent ${i < value.length ? "bg-accent" : ""}`}
          />
        ))}
      </div>
      <p className="min-h-10 max-w-xs text-center text-sm text-warning" role="alert">
        {error}
      </p>
      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {KEYS.map((key, i) =>
          key ? (
            <button
              key={i}
              type="button"
              disabled={disabled}
              aria-label={key === "⌫" ? "Стереть" : key}
              onClick={() => press(key)}
              className="aspect-[4/3] rounded-2xl border border-border bg-surface text-2xl font-medium tabular-nums transition hover:bg-background disabled:opacity-40"
            >
              {key}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
    </div>
  );
}

function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return s < 60 ? `${s} с` : `${Math.ceil(s / 60)} мин`;
}

function failureText(result: Extract<PinCheck, { ok: false }>): string {
  if (result.lockedForMs > 0) return `Слишком много попыток. Попробуйте через ${formatWait(result.lockedForMs)}.`;
  return result.attemptsLeft <= 2
    ? `Неверный PIN-код. Осталось попыток до паузы: ${result.attemptsLeft}.`
    : "Неверный PIN-код.";
}

/** Экран блокировки при открытии приложения. */
export function LockScreen({
  verify,
  forgotText,
  onForgot,
  initialLockedUntil,
}: {
  verify: (pin: string) => Promise<PinCheck | null>;
  /** Пауза после неудачных попыток, сохранённая с прошлого раза. */
  initialLockedUntil: number;
  /** Что произойдёт при сбросе PIN — зависит от того, есть ли аккаунт. */
  forgotText: string;
  onForgot: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(initialLockedUntil);
  const [now, setNow] = useState(() => Date.now());
  const [confirmForgot, setConfirmForgot] = useState(false);
  const [busy, setBusy] = useState(false);

  // Обратный отсчёт блокировки.
  useEffect(() => {
    if (lockedUntil <= now) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil, now]);
  const waiting = lockedUntil > now;

  const submit = async (pin: string) => {
    const result = await verify(pin);
    if (!result || result.ok) return;
    setError(failureText(result));
    if (result.lockedForMs > 0) {
      setLockedUntil(Date.now() + result.lockedForMs);
      setNow(Date.now());
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      {confirmForgot ? (
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">Сбросить PIN-код?</h1>
          <p className="text-muted">{forgotText}</p>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onForgot().finally(() => setBusy(false));
            }}
          >
            Сбросить
          </Button>
          <Button variant="ghost" onClick={() => setConfirmForgot(false)}>
            Назад
          </Button>
        </div>
      ) : (
        <>
          <PinEntry
            title="Введите PIN-код"
            error={waiting ? `Слишком много попыток. Попробуйте через ${formatWait(lockedUntil - now)}.` : error}
            disabled={waiting}
            onComplete={submit}
          />
          <Button variant="ghost" onClick={() => setConfirmForgot(true)}>
            Забыли PIN-код?
          </Button>
        </>
      )}
    </main>
  );
}

type SetupMode = "enable" | "change" | "disable";

/** Включение, смена и выключение PIN-кода. Смена и выключение — только после ввода текущего. */
export function PinSetupDialog({
  mode,
  verify,
  onEnable,
  onDisable,
  onClose,
}: {
  mode: SetupMode;
  verify: (pin: string) => Promise<PinCheck | null>;
  onEnable: (pin: string) => Promise<void>;
  onDisable: () => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"current" | "new" | "repeat">(mode === "enable" ? "new" : "current");
  const [first, setFirst] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);

  const onComplete = async (pin: string) => {
    setError(null);
    if (step === "current") {
      const result = await verify(pin);
      if (!result) return;
      if (!result.ok) {
        setError(failureText(result));
        if (result.lockedForMs > 0) {
          setDisabled(true);
          setTimeout(() => setDisabled(false), result.lockedForMs);
        }
        return;
      }
      if (mode === "disable") {
        await onDisable();
        return onClose();
      }
      return setStep("new");
    }
    if (step === "new") {
      setFirst(pin);
      return setStep("repeat");
    }
    if (pin !== first) {
      setError("PIN-коды не совпали. Придумайте PIN-код ещё раз.");
      setFirst("");
      return setStep("new");
    }
    await onEnable(pin);
    onClose();
  };

  const titles = {
    current: "Текущий PIN-код",
    new: mode === "change" ? "Новый PIN-код" : "Придумайте PIN-код",
    repeat: "Повторите PIN-код",
  };

  return (
    <div role="dialog" aria-modal aria-label="PIN-код" className="fixed inset-0 z-30 overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 px-4 py-6">
        <div className="flex justify-end">
          <Button variant="ghost" className="-mr-3 px-3" onClick={onClose} aria-label="Закрыть">
            ✕
          </Button>
        </div>
        <PinEntry
          key={step}
          title={titles[step]}
          hint={step === "new" ? "4 цифры. Не используйте дату рождения и 1234." : undefined}
          error={error}
          disabled={disabled}
          onComplete={onComplete}
        />
      </div>
    </div>
  );
}

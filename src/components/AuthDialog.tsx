"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "./ui";

function authErrorText(error: { message?: string; status?: number; code?: string }): string {
  const message = error.message?.toLowerCase() ?? "";
  if (error.status === 429 || message.includes("rate limit") || error.code === "over_email_send_rate_limit") {
    return "Слишком много писем подряд. Подождите минуту и попробуйте ещё раз.";
  }
  if (message.includes("expired") || message.includes("invalid") || error.code === "otp_expired") {
    return "Код неверный или устарел. Проверьте письмо или запросите новый код.";
  }
  if (message.includes("email")) return "Проверьте адрес почты.";
  return "Не получилось. Проверьте интернет и попробуйте ещё раз.";
}

/** Вход и регистрация по одноразовому коду из письма — без пароля. */
export function AuthDialog({ onSignedIn, onClose }: { onSignedIn: (user: User) => void; onClose: () => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sendCode = async () => {
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setError(authErrorText(error));
    setCode("");
    setStep("code");
  };

  const verify = async () => {
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error || !data.user) return setError(authErrorText(error ?? {}));
    onSignedIn(data.user);
  };

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <div role="dialog" aria-modal aria-label="Вход" className="fixed inset-0 z-30 overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 px-4 py-6">
        <header className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold">{step === "email" ? "Вход или регистрация" : "Введите код из письма"}</h1>
          <Button variant="ghost" className="-mr-3 px-3" onClick={onClose} aria-label="Закрыть">
            ✕
          </Button>
        </header>

        {step === "email" ? (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (emailValid && consent && !busy) sendCode();
            }}
          >
            <p className="text-muted">
              Пароль не нужен: пришлём на почту код для входа. Если аккаунта ещё нет, он создастся. Данные с этого
              устройства перенесутся в аккаунт.
            </p>
            <label className="flex flex-col gap-2">
              <span className="text-sm text-muted">Почта</span>
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                className="min-h-12 rounded-2xl border border-border bg-surface px-4 text-lg"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                Я согласна на хранение и обработку моих данных о здоровье (цикл, симптомы, заметки) на серверах в ЕС —
                только для работы приложения. Данные не передаются рекламным сервисам, удалить их можно в любой момент.
              </span>
            </label>
            <Button type="submit" disabled={!emailValid || !consent || busy}>
              {busy ? "Отправляем…" : "Получить код"}
            </Button>
          </form>
        ) : (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim().length >= 6 && !busy) verify();
            }}
          >
            <p className="text-muted">
              Отправили код на <span className="font-medium text-foreground">{email.trim()}</span>. Письмо может прийти
              через минуту; проверьте папку «Спам».
            </p>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              aria-label="Код из письма"
              maxLength={10}
              className="min-h-14 rounded-2xl border border-border bg-surface px-4 text-center text-3xl tracking-[0.3em] tabular-nums"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <Button type="submit" disabled={code.trim().length < 6 || busy}>
              {busy ? "Проверяем…" : "Войти"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={sendCode}>
              Отправить код ещё раз
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
            >
              Изменить почту
            </Button>
          </form>
        )}

        {error && (
          <p role="alert" className="rounded-2xl bg-warning-soft p-4 text-sm text-warning">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

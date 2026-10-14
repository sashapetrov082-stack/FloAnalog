import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/** Адрес, с которым открыли сайт, — до того как Supabase уберёт из него параметры входа по ссылке. */
let landingUrl: string | null = null;

/**
 * Клиент Supabase для браузера. Возвращает null, если ключи не заданы —
 * тогда приложение работает только в гостевом режиме.
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (typeof window !== "undefined") landingUrl = window.location.href;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && key ? createBrowserClient(url, key) : null;
  return client;
}

/**
 * Что пошло не так со входом по ссылке из письма, если сайт открыли по такой ссылке.
 * Вызывается после проверки сессии: `signedIn` — получилось ли войти.
 */
export function linkSignInProblem(signedIn: boolean): string | null {
  if (!landingUrl) return null;
  const url = new URL(landingUrl);
  const params = new URLSearchParams(url.hash.slice(1));
  url.searchParams.forEach((v, k) => params.set(k, v));
  landingUrl = null;

  const errorCode = params.get("error_code") ?? "";
  const description = (params.get("error_description") ?? "").toLowerCase();
  if (params.has("error")) {
    if (errorCode === "otp_expired" || description.includes("expired") || description.includes("invalid")) {
      return "Ссылка для входа устарела или уже использована. Запросите новое письмо в «Настройках».";
    }
    return "Не получилось войти по ссылке. Запросите новое письмо в «Настройках».";
  }
  if (params.has("code") && !signedIn) {
    return "Не получилось войти по ссылке. Откройте ссылку в том же браузере, где запрашивали вход (не во встроенном браузере почтового приложения), или запросите новое письмо.";
  }
  return null;
}

/** Убирает из адресной строки параметры входа, чтобы при обновлении страницы не было повторной попытки. */
export function cleanAuthParamsFromUrl(): void {
  const url = new URL(window.location.href);
  const authKeys = ["code", "error", "error_code", "error_description"];
  const hadParams = authKeys.some((k) => url.searchParams.has(k)) || /error|access_token/.test(url.hash);
  if (!hadParams) return;
  authKeys.forEach((k) => url.searchParams.delete(k));
  url.hash = "";
  window.history.replaceState(null, "", url.toString());
}

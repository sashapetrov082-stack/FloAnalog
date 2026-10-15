"use client";

// Откуда берутся данные: гостевой режим (только устройство) или аккаунт
// (сервер + копия на устройстве). Изменения сначала сохраняются на устройстве,
// затем отправляются на сервер; если связи нет — отправятся при следующей возможности.

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { IsoDate } from "@/lib/cycle/dates";
import { todayLocal } from "@/lib/format";
import {
  clearGuestData,
  deleteRecord,
  loadGuestData,
  parseGuestData,
  readRecord,
  saveGuestData,
  writeRecord,
  type GuestData,
} from "@/lib/guest/store";
import { cleanAuthParamsFromUrl, getSupabase, linkSignInProblem } from "@/lib/supabase/client";
import { predict } from "@/lib/cycle/predict";
import { predictionRow, savePredictionSnapshot } from "@/lib/pair";
import { disablePush } from "@/lib/push";
import { diffData, isEmptyOps, mergeGuestIntoAccount } from "@/lib/sync/diff";
import { deleteAccount, fetchAccountData, pushOps, recordHealthConsent } from "@/lib/sync/remote";

export type SyncStatus = "syncing" | "synced" | "offline";

export type CycleState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "guest"; data: GuestData | null; today: IsoDate }
  | { status: "account"; data: GuestData | null; today: IsoDate; userId: string; email: string; sync: SyncStatus };

/** Копия данных аккаунта на устройстве и последнее состояние, подтверждённое сервером. */
interface AccountCache {
  data: GuestData;
  synced: GuestData | null;
}

const cacheKey = (userId: string) => `account:${userId}`;

async function readCache(userId: string): Promise<AccountCache | null> {
  const raw = (await readRecord(cacheKey(userId))) as Partial<AccountCache> | undefined;
  const data = parseGuestData(raw?.data);
  if (!data) return null;
  return { data, synced: parseGuestData(raw?.synced) };
}

export function useCycleData() {
  const [state, setState] = useState<CycleState>({ status: "loading" });
  /** Сообщение о неудачном входе по ссылке из письма. */
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const userRef = useRef<User | null>(null);
  const cacheRef = useRef<AccountCache | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const setSync = (sync: SyncStatus) =>
    setState((s) => (s.status === "account" ? { ...s, sync } : s));

  /** Отправляет на сервер всё, что изменилось с последней успешной отправки. Вызовы идут строго по очереди. */
  const flush = useCallback(() => {
    queue.current = queue.current.then(async () => {
      const sb = getSupabase();
      const user = userRef.current;
      if (!sb || !user) return;
      // Пока идёт отправка, данные могут снова измениться — тогда отправляем ещё раз.
      for (;;) {
        const cache = cacheRef.current;
        if (!cache) return;
        const ops = diffData(cache.synced, cache.data);
        if (isEmptyOps(ops)) return setSync("synced");
        setSync("syncing");
        try {
          await pushOps(sb, user.id, ops);
        } catch {
          return setSync("offline");
        }
        cacheRef.current = { data: cacheRef.current?.data ?? cache.data, synced: cache.data };
        await writeRecord(cacheKey(user.id), cacheRef.current).catch(() => undefined);
      }
    });
    return queue.current;
  }, []);

  /** Вход в аккаунт: показать копию с устройства, догрузить сервер, перенести гостевые данные. */
  const enterAccount = useCallback(
    async (user: User) => {
      const sb = getSupabase();
      if (!sb) return;
      userRef.current = user;
      const cached = await readCache(user.id);
      cacheRef.current = cached;
      // Пока грузится сервер, показываем копию аккаунта или то, что уже было на экране.
      setState((s) => ({
        status: "account",
        data: cached?.data ?? (s.status === "guest" ? s.data : null),
        today: todayLocal(),
        userId: user.id,
        email: user.email ?? "",
        sync: "syncing",
      }));

      try {
        // 1. Неотправленные изменения с этого устройства.
        await flush();
        if (cacheRef.current && !isEmptyOps(diffData(cacheRef.current.synced, cacheRef.current.data))) {
          throw new Error("offline");
        }
        // 2. Свежие данные с сервера (могли измениться на другом устройстве).
        let remote = await fetchAccountData(sb, user.id);
        // Согласие дано галочкой перед отправкой письма; записываем при первом входе —
        // и по коду, и по ссылке из письма. Повторные входы ничего не меняют.
        await recordHealthConsent(sb, user.id).catch(() => undefined);
        // 3. Гостевые данные с этого устройства переезжают в аккаунт.
        const guest = await loadGuestData();
        if (guest) {
          const merged = mergeGuestIntoAccount(remote, guest);
          await pushOps(sb, user.id, diffData(remote, merged));
          remote = merged;
          await clearGuestData();
        }
        // 4. Изменения, сделанные на экране, пока шла загрузка.
        if (cacheRef.current && cacheRef.current !== cached) {
          const merged = mergeGuestIntoAccount(remote, cacheRef.current.data);
          await pushOps(sb, user.id, diffData(remote, merged));
          remote = merged;
        }
        cacheRef.current = { data: remote, synced: remote };
        await writeRecord(cacheKey(user.id), cacheRef.current);
        setState((s) => (s.status === "account" ? { ...s, data: remote, sync: "synced" } : s));
      } catch {
        if (cacheRef.current) setSync("offline");
        else
          setState({
            status: "error",
            message: "Не удалось загрузить данные аккаунта. Проверьте интернет и обновите страницу.",
          });
      }
    },
    [flush],
  );

  // Старт: есть ли вход в аккаунт.
  useEffect(() => {
    (async () => {
      try {
        const sb = getSupabase();
        const session = sb ? (await sb.auth.getSession()).data.session : null;
        setAuthNotice(linkSignInProblem(Boolean(session)));
        cleanAuthParamsFromUrl();
        if (session) return enterAccount(session.user);
        setState({ status: "guest", data: await loadGuestData(), today: todayLocal() });
      } catch {
        setState({
          status: "error",
          message:
            "Браузер не даёт сохранять данные на устройстве — так бывает в режиме инкогнито или при запрете хранения данных сайтов. Откройте сайт в обычной вкладке.",
        });
      }
    })();
  }, [enterAccount]);

  // Новая дата после полуночи и повторная отправка при возвращении связи.
  useEffect(() => {
    const refresh = () => {
      setState((s) =>
        (s.status === "guest" || s.status === "account") && s.today !== todayLocal() ? { ...s, today: todayLocal() } : s,
      );
      if (document.visibilityState === "visible") flush();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [flush]);

  const save = useCallback(
    (data: GuestData) => {
      setState((s) => (s.status === "guest" || s.status === "account" ? { ...s, data } : s));
      const user = userRef.current;
      if (!user) {
        saveGuestData(data).catch(() =>
          setState({ status: "error", message: "Не получилось сохранить данные на устройстве." }),
        );
        return;
      }
      cacheRef.current = { data, synced: cacheRef.current?.synced ?? null };
      writeRecord(cacheKey(user.id), cacheRef.current).then(flush, () => setSync("offline"));
    },
    [flush],
  );

  const resetGuest = useCallback(() => {
    setState((s) => (s.status === "guest" ? { ...s, data: null } : s));
    clearGuestData().catch(() => undefined);
  }, []);

  /** Вызывается после успешной проверки кода из письма. */
  const signedIn = useCallback((user: User) => enterAccount(user), [enterAccount]);

  /** Выход: данные остаются в аккаунте, копия с устройства удаляется. */
  const signOut = useCallback(async () => {
    const sb = getSupabase();
    const user = userRef.current;
    await queue.current;
    // Уведомления для этого аккаунта на этом устройстве больше не нужны.
    await disablePush(sb).catch(() => undefined);
    await sb?.auth.signOut();
    if (user) await deleteRecord(cacheKey(user.id));
    userRef.current = null;
    cacheRef.current = null;
    setState({ status: "guest", data: null, today: todayLocal() });
  }, []);

  /** Удаление аккаунта со всеми данными на сервере и на устройстве. */
  const removeAccount = useCallback(async () => {
    const sb = getSupabase();
    const user = userRef.current;
    if (!sb || !user) return;
    await disablePush(sb).catch(() => undefined);
    await deleteAccount(sb);
    await sb.auth.signOut();
    await deleteRecord(cacheKey(user.id));
    userRef.current = null;
    cacheRef.current = null;
    setState({ status: "guest", data: null, today: todayLocal() });
  }, []);

  // Опорные даты прогноза для партнёра: отправляем, когда прогноз изменился.
  // Партнёр увидит их, только если владелица разрешила (это проверяет база).
  const lastSnapshot = useRef<string | null>(null);
  const accountData = state.status === "account" ? state.data : null;
  const accountToday = state.status === "account" ? state.today : null;
  useEffect(() => {
    const sb = getSupabase();
    const user = userRef.current;
    if (!sb || !user || !accountData || !accountToday) return;
    const p = predict({
      periods: accountData.periods,
      today: accountToday,
      defaultCycleLength: accountData.settings.cycleLength,
      defaultPeriodLength: accountData.settings.periodLength,
    });
    const row = p ? predictionRow(p, accountToday) : null;
    // Дата расчёта сама по себе не повод отправлять: партнёр считает «сегодня» сам.
    const key = JSON.stringify(row && { ...row, computed_for: null, cycle_day: null, phase: null });
    if (key === lastSnapshot.current) return;
    const timer = setTimeout(() => {
      savePredictionSnapshot(sb, user.id, row).then(
        () => (lastSnapshot.current = key),
        () => undefined, // не получилось — повторим при следующем изменении
      );
    }, 1500);
    return () => clearTimeout(timer);
  }, [accountData, accountToday]);

  return {
    state,
    save,
    resetGuest,
    signedIn,
    signOut,
    removeAccount,
    retrySync: flush,
    authNotice,
    dismissAuthNotice: () => setAuthNotice(null),
  };
}

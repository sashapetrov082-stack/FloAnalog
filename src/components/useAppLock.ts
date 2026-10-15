"use client";

// Замок приложения PIN-кодом: настройка на этом устройстве, блокировка при открытии
// и после того, как приложение побыло в фоне.

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteRecord, readRecord, writeRecord } from "@/lib/guest/store";
import { checkPin, createPinRecord, parsePinRecord, type PinCheck, type PinRecord } from "@/lib/pin";

const KEY = "pin";
/** Через сколько в фоне снова спрашивать PIN. */
const BACKGROUND_LOCK_MS = 60_000;

export type LockState = { status: "loading" } | { status: "ready"; enabled: boolean; locked: boolean };

export function useAppLock() {
  const [state, setState] = useState<LockState>({ status: "loading" });
  const record = useRef<PinRecord | null>(null);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    readRecord(KEY)
      .then((raw) => {
        record.current = parsePinRecord(raw);
        setState({ status: "ready", enabled: !!record.current, locked: !!record.current });
      })
      .catch(() => setState({ status: "ready", enabled: false, locked: false }));
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (record.current && hiddenAt.current && Date.now() - hiddenAt.current > BACKGROUND_LOCK_MS) {
        setState({ status: "ready", enabled: true, locked: true });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const verify = useCallback(async (pin: string): Promise<PinCheck | null> => {
    if (!record.current) return null;
    const result = await checkPin(record.current, pin, Date.now());
    record.current = result.record;
    await writeRecord(KEY, result.record);
    if (result.ok) setState({ status: "ready", enabled: true, locked: false });
    return result;
  }, []);

  const enable = useCallback(async (pin: string) => {
    const next = await createPinRecord(pin);
    await writeRecord(KEY, next);
    record.current = next;
    setState({ status: "ready", enabled: true, locked: false });
  }, []);

  /** Выключить PIN (после проверки старого) или стереть его вместе с данными. */
  const disable = useCallback(async () => {
    await deleteRecord(KEY);
    record.current = null;
    setState({ status: "ready", enabled: false, locked: false });
  }, []);

  /** До какого момента ввод PIN заблокирован после неудачных попыток. */
  const lockedUntil = useCallback(() => record.current?.lockedUntil ?? 0, []);

  return { state, verify, enable, disable, lockedUntil };
}

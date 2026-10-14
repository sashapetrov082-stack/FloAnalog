// Гостевой режим: все данные хранятся только в браузере (IndexedDB).
// При регистрации они переедут в аккаунт (сделаем вместе с синхронизацией).

import type { Period } from "@/lib/cycle/predict";
import { assertIsoDate } from "@/lib/cycle/dates";

export interface GuestSettings {
  cycleLength: number;
  periodLength: number;
}

export interface GuestData {
  version: 1;
  settings: GuestSettings;
  periods: Period[];
}

const DB_NAME = "floanalog";
const STORE = "guest";
const KEY = "data";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Проверка формы данных: битые или чужие данные не должны ронять приложение. */
export function parseGuestData(raw: unknown): GuestData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<GuestData>;
  if (data.version !== 1 || !data.settings || !Array.isArray(data.periods)) return null;
  const { cycleLength, periodLength } = data.settings;
  if (!Number.isInteger(cycleLength) || !Number.isInteger(periodLength)) return null;
  try {
    const periods = data.periods.map((p) => {
      assertIsoDate(p.start);
      if (p.end) assertIsoDate(p.end);
      return { start: p.start, end: p.end ?? null };
    });
    return { version: 1, settings: { cycleLength, periodLength }, periods };
  } catch {
    return null;
  }
}

export async function loadGuestData(): Promise<GuestData | null> {
  const raw = await withStore("readonly", (store) => store.get(KEY));
  return parseGuestData(raw);
}

export async function saveGuestData(data: GuestData): Promise<void> {
  await withStore("readwrite", (store) => store.put(data, KEY));
}

export async function clearGuestData(): Promise<void> {
  await withStore("readwrite", (store) => store.delete(KEY));
}

// Хранилище на устройстве (IndexedDB): гостевые данные и копия данных аккаунта.
// Гостевые данные при входе переезжают в аккаунт (см. src/lib/sync).

import type { Period } from "@/lib/cycle/predict";
import { assertIsoDate } from "@/lib/cycle/dates";
import type { DayLog, DayLogs, FlowLevel, OvulationTest } from "@/lib/journal";

export type TrackingMode = "cycle" | "conception";

export interface GuestSettings {
  cycleLength: number;
  periodLength: number;
  /** Цель: просто отслеживать цикл или зачатие. Нет поля — «cycle». */
  mode?: TrackingMode;
}

export interface GuestData {
  version: 2;
  settings: GuestSettings;
  periods: Period[];
  dayLogs: DayLogs;
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

const FLOW_LEVELS: FlowLevel[] = ["spotting", "light", "medium", "heavy"];
const OVULATION_TESTS: OvulationTest[] = ["negative", "positive", "peak"];

/** Температура из хранилища: число 34–43 (как ограничение в базе), два знака после запятой. */
export function parseTemperature(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 34 && n <= 43 ? Math.round(n * 100) / 100 : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function parseDayLogs(raw: unknown): DayLogs {
  if (!raw || typeof raw !== "object") return {};
  const logs: DayLogs = {};
  for (const [date, value] of Object.entries(raw as Record<string, unknown>)) {
    assertIsoDate(date);
    const log = (value ?? {}) as Partial<DayLog>;
    logs[date] = {
      flow: FLOW_LEVELS.includes(log.flow as FlowLevel) ? log.flow : null,
      symptoms: stringList(log.symptoms),
      moods: stringList(log.moods),
      note: typeof log.note === "string" ? log.note : "",
      temperature: parseTemperature(log.temperature),
      ovulationTest: OVULATION_TESTS.includes(log.ovulationTest as OvulationTest) ? log.ovulationTest : null,
    };
  }
  return logs;
}

/**
 * Проверка формы данных: битые или чужие данные не должны ронять приложение.
 * Данные старой версии 1 (без журнала) переводятся в версию 2.
 */
export function parseGuestData(raw: unknown): GuestData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as { version?: unknown; settings?: Partial<GuestSettings>; periods?: Period[]; dayLogs?: unknown };
  if ((data.version !== 1 && data.version !== 2) || !data.settings || !Array.isArray(data.periods)) return null;
  const { cycleLength, periodLength } = data.settings;
  if (typeof cycleLength !== "number" || typeof periodLength !== "number") return null;
  if (!Number.isInteger(cycleLength) || !Number.isInteger(periodLength)) return null;
  try {
    const periods = data.periods.map((p) => {
      assertIsoDate(p.start);
      if (p.end) assertIsoDate(p.end);
      return { start: p.start, end: p.end ?? null };
    });
    const mode: TrackingMode = data.settings.mode === "conception" ? "conception" : "cycle";
    return { version: 2, settings: { cycleLength, periodLength, mode }, periods, dayLogs: parseDayLogs(data.dayLogs) };
  } catch {
    return null;
  }
}

export async function readRecord(key: string): Promise<unknown> {
  return withStore("readonly", (store) => store.get(key));
}

export async function writeRecord(key: string, value: unknown): Promise<void> {
  await withStore("readwrite", (store) => store.put(value, key));
}

export async function deleteRecord(key: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(key));
}

export async function loadGuestData(): Promise<GuestData | null> {
  return parseGuestData(await readRecord(KEY));
}

export async function saveGuestData(data: GuestData): Promise<void> {
  await writeRecord(KEY, data);
}

export async function clearGuestData(): Promise<void> {
  await deleteRecord(KEY);
}

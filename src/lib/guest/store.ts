// Хранилище на устройстве (IndexedDB): гостевые данные и копия данных аккаунта.
// Гостевые данные при входе переезжают в аккаунт (см. src/lib/sync).

import type { Period } from "@/lib/cycle/predict";
import { assertIsoDate, type IsoDate } from "@/lib/cycle/dates";
import type { Habit, HabitChecks } from "@/lib/habits";
import type { DayLog, DayLogs, FlowLevel, OvulationTest } from "@/lib/journal";

export type TrackingMode = "cycle" | "conception" | "pregnancy";

export interface GuestSettings {
  cycleLength: number;
  periodLength: number;
  /** Цель: просто отслеживать цикл или зачатие. Нет поля — «cycle». */
  mode?: TrackingMode;
  /** Беременность: первый день последних месячных — от него считается срок. */
  pregnancyLmp?: IsoDate | null;
}

export interface GuestData {
  version: 2;
  settings: GuestSettings;
  periods: Period[];
  dayLogs: DayLogs;
  /** Трекер привычек. Нет поля — привычек нет. */
  habits?: Habit[];
  habitChecks?: HabitChecks;
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

function habitsPart(rawHabits: unknown, rawChecks: unknown): Pick<GuestData, "habits" | "habitChecks"> {
  const habits = parseHabits(rawHabits);
  return habits.length ? { habits, habitChecks: parseHabitChecks(rawChecks, habits) } : {};
}

export function parseMode(value: unknown): TrackingMode {
  return value === "conception" || value === "pregnancy" ? value : "cycle";
}

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseHabits(raw: unknown): Habit[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((h: Partial<Habit>) => {
    if (!h || typeof h.id !== "string" || !UUID_RE.test(h.id)) return [];
    if (typeof h.name !== "string" || !h.name.trim()) return [];
    const goal = Number.isInteger(h.goal) ? Math.min(31, Math.max(1, h.goal!)) : 31;
    const position = Number.isInteger(h.position) ? Math.min(999, Math.max(0, h.position!)) : 0;
    return [{ id: h.id, name: h.name.slice(0, 60), emoji: typeof h.emoji === "string" ? h.emoji.slice(0, 16) : "", goal, position }];
  });
}

function parseHabitChecks(raw: unknown, habits: Habit[]): HabitChecks {
  if (!raw || typeof raw !== "object") return {};
  const ids = new Set(habits.map((h) => h.id));
  const checks: HabitChecks = {};
  for (const [date, value] of Object.entries(raw as Record<string, unknown>)) {
    assertIsoDate(date);
    const list = [...new Set(stringList(value).filter((id) => ids.has(id)))];
    if (list.length) checks[date] = list;
  }
  return checks;
}

/**
 * Проверка формы данных: битые или чужие данные не должны ронять приложение.
 * Данные старой версии 1 (без журнала) переводятся в версию 2.
 */
export function parseGuestData(raw: unknown): GuestData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as {
    version?: unknown;
    settings?: Partial<GuestSettings>;
    periods?: Period[];
    dayLogs?: unknown;
    habits?: unknown;
    habitChecks?: unknown;
  };
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
    const mode = parseMode(data.settings.mode);
    const lmp = data.settings.pregnancyLmp;
    if (lmp) assertIsoDate(lmp);
    return {
      version: 2,
      settings: { cycleLength, periodLength, mode, pregnancyLmp: lmp ?? null },
      periods,
      dayLogs: parseDayLogs(data.dayLogs),
      ...habitsPart(data.habits, data.habitChecks),
    };
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

// Импорт истории месячных из Flo, Clue или списка дат.
// Официальных схем экспорта нет, поэтому разбор гибкий: в JSON ищем либо диапазоны
// «начало — конец» месячных, либо отдельные дни с отметкой кровотечения.

import { assertIsoDate, compareDates, diffDays, type IsoDate } from "@/lib/cycle/dates";
import type { Period } from "@/lib/cycle/predict";

/** Самые ранние и поздние даты, которые принимаем (защита от мусора в файле). */
const MIN_DATE = "1990-01-01";
const MAX_PERIOD_DAYS = 14;
/** Дни кровотечения с разрывом до стольких дней считаются одними месячными. */
const MERGE_GAP = 2;
/** Импортированные месячные ближе этого к уже отмеченным считаем теми же. */
const SAME_PERIOD_DAYS = 7;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function validIso(y: number, m: number, d: number): IsoDate | null {
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  try {
    assertIsoDate(iso);
  } catch {
    return null;
  }
  return iso >= MIN_DATE ? iso : null;
}

/** Дата из строки или числа: 2026-03-12, 2026-03-12T00:00:00Z, 12.03.2026, 12/03/2026, unix-время. */
export function parseLooseDate(value: unknown): IsoDate | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Секунды или миллисекунды с 1970 года.
    const ms = value > 1e11 ? value : value * 1000;
    if (ms < Date.UTC(1990, 0, 1) || ms > Date.UTC(2100, 0, 1)) return null;
    const d = new Date(ms);
    return validIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  if (m) return validIso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
  if (m) return validIso(+m[3], +m[2], +m[1]);
  return null;
}

/** Склеивает отдельные дни кровотечения в месячные. */
export function daysToPeriods(days: IsoDate[]): Period[] {
  const sorted = [...new Set(days)].sort(compareDates);
  const periods: Period[] = [];
  for (const day of sorted) {
    const last = periods.at(-1);
    if (last && last.end && diffDays(last.end, day) <= MERGE_GAP && diffDays(last.start, day) < MAX_PERIOD_DAYS) {
      last.end = day;
    } else {
      periods.push({ start: day, end: day });
    }
  }
  return periods;
}

const PERIOD_WORD = /period|menstru|bleed|flow|месячн/i;
const NO_FLOW = /^(none|no|false|0|нет)$/i;

function isBleedingValue(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "number") return v > 0;
  if (typeof v === "string") return v.trim() !== "" && !NO_FLOW.test(v.trim());
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return ["option", "value", "intensity", "level", "flow"].some((k) => k in o && isBleedingValue(o[k]));
  }
  return false;
}

/** Первая дата из полей, подходящих под шаблоны; шаблоны проверяются по порядку (точные — раньше). */
function findDate(o: Record<string, unknown>, ...patterns: RegExp[]): IsoDate | null {
  for (const pattern of patterns) {
    for (const [k, v] of Object.entries(o)) {
      if (!pattern.test(k)) continue;
      const d = parseLooseDate(v);
      if (d) return d;
    }
  }
  return null;
}

/** Обходит JSON и собирает месячные: диапазоны и дни кровотечения. */
export function extractPeriodsFromJson(root: unknown): Period[] {
  const ranges: Period[] = [];
  const days: IsoDate[] = [];

  const walk = (node: unknown, context: string) => {
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, context));
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const keys = Object.keys(o).join(" ");
    const about = `${context} ${keys} ${typeof o.type === "string" ? o.type : ""} ${typeof o.category === "string" ? o.category : ""}`;

    // 1. Диапазон: { period_start_date, period_end_date } / { start, end } в контексте месячных.
    // Сначала поля именно про месячные: в записи цикла бывают и «конец цикла», и «конец месячных».
    const start = findDate(o, /(period|menstru|bleed)\w*(start|begin)/i, /start|begin|from/i);
    const end = findDate(o, /(period|menstru|bleed)\w*(end|finish)/i, /end|finish|^to$/i);
    if (start && PERIOD_WORD.test(about)) {
      const len = end ? diffDays(start, end) : 0;
      if (len >= 0 && len < MAX_PERIOD_DAYS) {
        ranges.push({ start, end: end ?? null });
        return;
      }
    }

    // 2. День: { day | date, period | type: "period", value: ... }.
    const day = findDate(o, /^(day|date|datetime|timestamp)$/i);
    if (day) {
      const typeIsPeriod = typeof o.type === "string" && PERIOD_WORD.test(o.type);
      const flagKey = Object.keys(o).find((k) => /^(period|bleeding|flow|menstruation)$/i.test(k));
      if ((typeIsPeriod && isBleedingValue(o.value ?? o.option ?? true)) || (flagKey && isBleedingValue(o[flagKey]))) {
        days.push(day);
        return;
      }
    }

    for (const [k, v] of Object.entries(o)) if (v && typeof v === "object") walk(v, `${context} ${k}`);
  };

  walk(root, "");
  return normalize([...ranges, ...daysToPeriods(days)]);
}

/**
 * Список дат, по одной записи в строке: «12.03.2026» (начало) или «12.03.2026 – 16.03.2026».
 * Возвращает месячные и строки, которые не удалось разобрать.
 */
export function parseDateList(text: string): { periods: Period[]; bad: string[] } {
  const periods: Period[] = [];
  const bad: string[] = [];
  const token = /\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4}/g;
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const dates = (line.match(token) ?? []).map(parseLooseDate);
    const [start, end = null] = dates;
    const length = start && end ? diffDays(start, end) : 0;
    if (!start || dates.length > 2 || dates.includes(null) || length < 0 || length >= MAX_PERIOD_DAYS) {
      bad.push(line);
    } else {
      periods.push({ start, end });
    }
  }
  return { periods: normalize(periods), bad };
}

/** Сортировка и удаление повторов: месячные, начавшиеся в пределах недели, — одни и те же. */
function normalize(periods: Period[]): Period[] {
  const sorted = [...periods].sort((a, b) => compareDates(a.start, b.start));
  const out: Period[] = [];
  for (const p of sorted) {
    const last = out.at(-1);
    if (last && diffDays(last.start, p.start) <= SAME_PERIOD_DAYS) {
      if (p.end && (!last.end || compareDates(p.end, last.end) > 0)) last.end = p.end;
    } else {
      out.push({ ...p });
    }
  }
  return out;
}

export interface ImportPlan {
  /** Все найденные месячные. */
  found: Period[];
  /** Новые — их добавим. */
  added: Period[];
  /** Совпали с уже отмеченными. */
  skipped: number;
}

/** Что добавится к уже отмеченным месячным. Будущие даты не импортируем. */
export function planImport(existing: Period[], imported: Period[], today: IsoDate): ImportPlan {
  const found = imported.filter((p) => compareDates(p.start, today) <= 0);
  const added = found.filter(
    (p) => !existing.some((e) => Math.abs(diffDays(e.start, p.start)) <= SAME_PERIOD_DAYS),
  );
  return { found, added, skipped: found.length - added.length };
}

export function applyImport(existing: Period[], plan: ImportPlan): Period[] {
  return [...existing, ...plan.added].sort((a, b) => compareDates(a.start, b.start));
}

/** Для подсказки «с марта 2024 по октябрь 2026». */
export function rangeOf(periods: Period[]): { from: IsoDate; to: IsoDate } | null {
  if (periods.length === 0) return null;
  const last = periods.at(-1)!;
  return { from: periods[0].start, to: last.end ?? last.start };
}

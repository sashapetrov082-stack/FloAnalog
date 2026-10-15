// Отчёт для врача: факты из отметок за период — даты и длины циклов, месячных, частота симптомов.
// Без прогнозов и без выводов о здоровье. Чистые функции: «сегодня» передаётся параметром.

import type { DayLogs, FlowLevel } from "@/lib/journal";
import { addDays, compareDates, diffDays, type IsoDate } from "./dates";
import { MAX_VALID_CYCLE, MIN_VALID_CYCLE, type Period } from "./predict";

export interface ReportCycle {
  start: IsoDate;
  /** Конец месячных, если отмечен. */
  end: IsoDate | null;
  /** Длина месячных в днях, если отмечен конец. */
  periodDays: number | null;
  /** Длина цикла — до начала следующих месячных; у последнего цикла — null. */
  cycleDays: number | null;
  /** Длина цикла вне 15–60 дней: возможно, пропущена отметка. В средние не входит. */
  unusual: boolean;
  /** Самые обильные выделения, отмеченные в эти месячные. */
  heaviestFlow: FlowLevel | null;
}

export interface ReportCount {
  id: string;
  days: number;
}

export interface CycleReport {
  from: IsoDate;
  to: IsoDate;
  cycles: ReportCycle[];
  stats: {
    cycleCount: number;
    avgCycle: number | null;
    minCycle: number | null;
    maxCycle: number | null;
    avgPeriod: number | null;
  };
  /** Сколько дней отмечен каждый симптом, по убыванию. */
  symptoms: ReportCount[];
  moods: ReportCount[];
  /** Дней с записями в журнале. */
  loggedDays: number;
  notes: { date: IsoDate; text: string }[];
}

const FLOW_ORDER: FlowLevel[] = ["spotting", "light", "medium", "heavy"];

/** Начало периода отчёта: примерно `months` месяцев назад. */
export function reportStart(today: IsoDate, months: number): IsoDate {
  return addDays(today, -Math.round(months * 30.44));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function avg(values: number[]): number | null {
  return values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

function count(lists: string[][]): ReportCount[] {
  const map = new Map<string, number>();
  for (const list of lists) for (const id of new Set(list)) map.set(id, (map.get(id) ?? 0) + 1);
  return [...map].map(([id, days]) => ({ id, days })).sort((a, b) => b.days - a.days || a.id.localeCompare(b.id));
}

export function buildReport(input: {
  periods: Period[];
  dayLogs: DayLogs;
  today: IsoDate;
  months: number;
  includeNotes: boolean;
}): CycleReport {
  const { today, dayLogs } = input;
  const from = reportStart(today, input.months);
  const inRange = (d: IsoDate) => compareDates(d, from) >= 0 && compareDates(d, today) <= 0;
  const sorted = [...input.periods].sort((a, b) => compareDates(a.start, b.start));

  const cycles: ReportCycle[] = [];
  sorted.forEach((p, i) => {
    if (!inRange(p.start)) return;
    const next = sorted[i + 1];
    const cycleDays = next ? diffDays(p.start, next.start) : null;
    let heaviest: FlowLevel | null = null;
    const last = p.end ?? addDays(p.start, 13);
    for (let d = p.start; compareDates(d, last) <= 0 && compareDates(d, today) <= 0; d = addDays(d, 1)) {
      const flow = dayLogs[d]?.flow;
      if (flow && (!heaviest || FLOW_ORDER.indexOf(flow) > FLOW_ORDER.indexOf(heaviest))) heaviest = flow;
    }
    cycles.push({
      start: p.start,
      end: p.end ?? null,
      periodDays: p.end ? diffDays(p.start, p.end) + 1 : null,
      cycleDays,
      unusual: cycleDays !== null && (cycleDays < MIN_VALID_CYCLE || cycleDays > MAX_VALID_CYCLE),
      heaviestFlow: heaviest,
    });
  });

  const lengths = cycles.filter((c) => c.cycleDays !== null && !c.unusual).map((c) => c.cycleDays!);
  const periodDays = cycles.map((c) => c.periodDays).filter((n): n is number => n !== null && n <= 14);
  const days = Object.keys(dayLogs).filter(inRange).sort(compareDates);

  return {
    from,
    to: today,
    cycles,
    stats: {
      cycleCount: lengths.length,
      avgCycle: avg(lengths),
      minCycle: lengths.length ? Math.min(...lengths) : null,
      maxCycle: lengths.length ? Math.max(...lengths) : null,
      avgPeriod: avg(periodDays),
    },
    symptoms: count(days.map((d) => dayLogs[d].symptoms)),
    moods: count(days.map((d) => dayLogs[d].moods)),
    loggedDays: days.length,
    notes: input.includeNotes
      ? days.filter((d) => dayLogs[d].note?.trim()).map((d) => ({ date: d, text: dayLogs[d].note!.trim() }))
      : [],
  };
}

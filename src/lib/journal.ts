// Журнал дня: выделения, симптомы, настроение, личная заметка.
// Поля совпадают с таблицей day_logs, чтобы перенос в аккаунт был один в один.

import type { IsoDate } from "@/lib/cycle/dates";

export type FlowLevel = "spotting" | "light" | "medium" | "heavy";
export type OvulationTest = "negative" | "positive" | "peak";

export interface DayLog {
  flow?: FlowLevel | null;
  symptoms: string[];
  moods: string[];
  note?: string;
  /** Базальная температура, °C. Партнёру не показывается никогда. */
  temperature?: number | null;
  /** Тест на овуляцию (ЛГ). Партнёру не показывается никогда. */
  ovulationTest?: OvulationTest | null;
}

/** Допустимый диапазон базальной температуры при вводе. */
export const TEMPERATURE_MIN = 35;
export const TEMPERATURE_MAX = 38.5;

export const OVULATION_TESTS: { id: OvulationTest; label: string }[] = [
  { id: "negative", label: "Отрицательный" },
  { id: "positive", label: "Положительный" },
  { id: "peak", label: "Пик" },
];

export type DayLogs = Record<IsoDate, DayLog>;

export const NOTE_MAX_LENGTH = 2000;

export const FLOW_LEVELS: { id: FlowLevel; label: string }[] = [
  { id: "spotting", label: "Мажущие" },
  { id: "light", label: "Скудные" },
  { id: "medium", label: "Умеренные" },
  { id: "heavy", label: "Обильные" },
];

export interface Option {
  id: string;
  label: string;
}

export const SYMPTOM_GROUPS: { id: string; title: string; options: Option[] }[] = [
  {
    id: "pain",
    title: "Боль",
    options: [
      { id: "cramps", label: "Спазмы внизу живота" },
      { id: "headache", label: "Головная боль" },
      { id: "migraine", label: "Мигрень" },
      { id: "back_pain", label: "Боль в пояснице" },
      { id: "breast_tenderness", label: "Чувствительность груди" },
      { id: "joint_pain", label: "Боль в суставах" },
    ],
  },
  {
    id: "body",
    title: "Тело",
    options: [
      { id: "fatigue", label: "Усталость" },
      { id: "insomnia", label: "Бессонница" },
      { id: "dizziness", label: "Головокружение" },
      { id: "acne", label: "Высыпания" },
      { id: "cravings", label: "Тяга к еде" },
      { id: "swelling", label: "Отёки" },
    ],
  },
  {
    id: "digestion",
    title: "Пищеварение",
    options: [
      { id: "bloating", label: "Вздутие" },
      { id: "nausea", label: "Тошнота" },
      { id: "constipation", label: "Запор" },
      { id: "diarrhea", label: "Диарея" },
    ],
  },
  {
    id: "discharge",
    title: "Выделения",
    options: [
      { id: "discharge_none", label: "Нет" },
      { id: "discharge_sticky", label: "Липкие" },
      { id: "discharge_creamy", label: "Кремообразные" },
      { id: "discharge_watery", label: "Водянистые" },
      { id: "discharge_egg_white", label: "Как яичный белок" },
      { id: "discharge_unusual", label: "Необычные" },
    ],
  },
  {
    id: "libido",
    title: "Либидо и энергия",
    options: [
      { id: "libido_high", label: "Либидо выше обычного" },
      { id: "libido_low", label: "Либидо ниже обычного" },
      { id: "energy_high", label: "Много энергии" },
      { id: "energy_low", label: "Мало энергии" },
    ],
  },
];

export const MOODS: Option[] = [
  { id: "calm", label: "Спокойствие" },
  { id: "happy", label: "Радость" },
  { id: "energetic", label: "Бодрость" },
  { id: "irritable", label: "Раздражительность" },
  { id: "anxious", label: "Тревога" },
  { id: "sad", label: "Грусть" },
  { id: "mood_swings", label: "Перепады настроения" },
  { id: "apathy", label: "Апатия" },
];

const labels = new Map<string, string>([
  ...SYMPTOM_GROUPS.flatMap((g) => g.options.map((o) => [o.id, o.label] as const)),
  ...MOODS.map((o) => [o.id, o.label] as const),
  ...FLOW_LEVELS.map((o) => [o.id, o.label] as const),
]);

const testLabels: Record<OvulationTest, string> = {
  negative: "Тест на овуляцию: отрицательный",
  positive: "Тест на овуляцию: положительный",
  peak: "Тест на овуляцию: пик",
};

/** «36,72 °C» */
export function formatTemperature(t: number): string {
  return `${t.toFixed(2).replace(".", ",")} °C`;
}

export function optionLabel(id: string): string {
  return labels.get(id) ?? id;
}

export function emptyLog(): DayLog {
  return { flow: null, symptoms: [], moods: [], note: "" };
}

export function isEmptyLog(log: DayLog): boolean {
  return (
    !log.flow &&
    log.symptoms.length === 0 &&
    log.moods.length === 0 &&
    !log.note?.trim() &&
    log.temperature == null &&
    !log.ovulationTest
  );
}

/** Добавляет значение в список или убирает его оттуда. */
export function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Записывает журнал дня; пустой журнал удаляется, чтобы не копить пустые записи. */
export function setDayLog(logs: DayLogs, date: IsoDate, log: DayLog): DayLogs {
  const next = { ...logs };
  if (isEmptyLog(log)) delete next[date];
  else next[date] = { ...log, note: log.note?.slice(0, NOTE_MAX_LENGTH) };
  return next;
}

/** Короткое описание дня: «Умеренные · Спазмы внизу живота · Усталость». */
export function summarizeLog(log: DayLog): string[] {
  return [
    ...[...(log.flow ? [log.flow] : []), ...log.symptoms, ...log.moods].map(optionLabel),
    ...(log.temperature != null ? [formatTemperature(log.temperature)] : []),
    ...(log.ovulationTest ? [testLabels[log.ovulationTest]] : []),
  ];
}

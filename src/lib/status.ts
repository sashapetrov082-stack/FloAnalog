// Статус дня владелицы и готовые просьбы для общей ленты пары.

import type { Option } from "@/lib/journal";

export interface DayStatus {
  /** 1 — мало, 2 — нормально, 3 — много. */
  energy: number | null;
  mood: "low" | "neutral" | "good" | null;
  needs: string[];
  /** 1 — ниже обычного, 2 — обычное, 3 — выше обычного. */
  libido: number | null;
}

export const EMPTY_STATUS: DayStatus = { energy: null, mood: null, needs: [], libido: null };

export const ENERGY: { value: number; label: string }[] = [
  { value: 1, label: "Мало" },
  { value: 2, label: "Нормально" },
  { value: 3, label: "Много" },
];

export const MOOD: { value: NonNullable<DayStatus["mood"]>; label: string; emoji: string }[] = [
  { value: "low", label: "Так себе", emoji: "😔" },
  { value: "neutral", label: "Ровное", emoji: "😐" },
  { value: "good", label: "Хорошее", emoji: "🙂" },
];

export const NEEDS: Option[] = [
  { id: "care", label: "Забота" },
  { id: "alone", label: "Побыть одной" },
  { id: "hugs", label: "Обнимашки" },
  { id: "quiet", label: "Тишина" },
  { id: "sweets", label: "Сладкое" },
  { id: "attention", label: "Внимание" },
];

export const LIBIDO: { value: number; label: string }[] = [
  { value: 1, label: "Ниже обычного" },
  { value: 2, label: "Обычное" },
  { value: 3, label: "Выше обычного" },
];

/** Готовые просьбы — одно касание. */
export const REQUESTS = ["Принеси грелку", "Купи шоколадку", "Обними", "Приготовь чай", "Побудь рядом"];

export function isEmptyStatus(s: DayStatus): boolean {
  return s.energy === null && s.mood === null && s.needs.length === 0 && s.libido === null;
}

/** «Энергии мало · 😔 · нужно: забота, тишина» — для экрана партнёра. */
export function describeStatus(s: Partial<DayStatus>): string[] {
  const parts: string[] = [];
  const energy = ENERGY.find((e) => e.value === s.energy);
  if (energy) parts.push(`Энергия: ${energy.label.toLowerCase()}`);
  const mood = MOOD.find((m) => m.value === s.mood);
  if (mood) parts.push(`Настроение: ${mood.emoji} ${mood.label.toLowerCase()}`);
  if (s.needs?.length) {
    parts.push(`Нужно: ${s.needs.map((id) => NEEDS.find((n) => n.id === id)?.label.toLowerCase() ?? id).join(", ")}`);
  }
  const libido = LIBIDO.find((l) => l.value === s.libido);
  if (libido) parts.push(`Либидо: ${libido.label.toLowerCase()}`);
  return parts;
}

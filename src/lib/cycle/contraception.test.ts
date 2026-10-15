import { describe, expect, it } from "vitest";
import {
  describeScheme,
  dueReminder,
  isHormonalCycleControl,
  schemeDay,
  withdrawalDays,
  type ContraceptionSettings,
} from "./contraception";

const pill21: ContraceptionSettings = { method: "pill", regimen: "21_7", startDate: "2026-10-01" };

describe("схема контрацепции", () => {
  it("таблетки 21+7: активные дни, перерыв, следующая упаковка", () => {
    const d1 = schemeDay(pill21, "2026-10-01")!;
    expect([d1.day, d1.phase, d1.actions]).toEqual([1, "active", ["take_pill"]]);
    expect(d1.nextBreakStart).toBe("2026-10-22");
    expect(describeScheme(pill21, schemeDay(pill21, "2026-10-12")!)).toBe("Таблетка 12 из 21");
    const brk = schemeDay(pill21, "2026-10-24")!;
    expect([brk.phase, brk.actions, describeScheme(pill21, brk)]).toEqual(["break", [], "Перерыв: день 3 из 7"]);
    expect(brk.nextCycleStart).toBe("2026-10-29");
    expect(brk.nextBreakStart).toBe("2026-11-19");
    // Схема повторяется: через 28 дней снова таблетка 1.
    expect(schemeDay(pill21, "2026-10-29")!.day).toBe(1);
    expect(schemeDay(pill21, "2026-09-30")).toBeNull();
  });

  it("24+4 и без перерыва", () => {
    const s24: ContraceptionSettings = { ...pill21, regimen: "24_4" };
    expect(schemeDay(s24, "2026-10-24")!.phase).toBe("active");
    expect(schemeDay(s24, "2026-10-25")!.phase).toBe("break");
    const s28: ContraceptionSettings = { ...pill21, regimen: "28_0" };
    expect(schemeDay(s28, "2026-10-28")!.actions).toEqual(["take_pill"]);
    expect(schemeDay(s28, "2026-10-28")!.nextBreakStart).toBeNull();
  });

  it("кольцо и пластырь: действия в нужные дни", () => {
    const ring: ContraceptionSettings = { method: "ring", regimen: null, startDate: "2026-10-01" };
    expect(schemeDay(ring, "2026-10-01")!.actions).toEqual(["insert_ring"]);
    expect(schemeDay(ring, "2026-10-10")!.actions).toEqual([]);
    expect(schemeDay(ring, "2026-10-22")!.actions).toEqual(["remove_ring"]);
    expect(schemeDay(ring, "2026-10-29")!.actions).toEqual(["insert_ring"]);
    const patch: ContraceptionSettings = { method: "patch", regimen: null, startDate: "2026-10-01" };
    expect(["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"].map((d) => schemeDay(patch, d)!.actions[0])).toEqual([
      "apply_patch",
      "apply_patch",
      "apply_patch",
      "remove_patch",
    ]);
    expect(describeScheme(patch, schemeDay(patch, "2026-10-10")!)).toBe("Пластырь 2 из 3: день 3 из 7");
  });

  it("прогноз фертильности скрывается при гормональных методах, кроме мини-пили", () => {
    expect(isHormonalCycleControl(pill21)).toBe(true);
    expect(isHormonalCycleControl({ ...pill21, regimen: "pop" })).toBe(false);
    expect(isHormonalCycleControl({ method: "none", regimen: null, startDate: null })).toBe(false);
  });

  it("ожидаемое кровотечение отмены — в перерыв", () => {
    expect(withdrawalDays(pill21, "2026-10-12", 1)).toEqual(["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"]);
    expect(withdrawalDays(pill21, "2026-10-24", 1)).toEqual(["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"]);
    expect(withdrawalDays({ ...pill21, regimen: "28_0" }, "2026-10-12")).toEqual([]);
  });

  it("напоминание: с выбранного времени, повтор через час, не после отметки", () => {
    const s = { ...pill21, reminderMinutes: 21 * 60 };
    expect(dueReminder(s, "2026-10-05", 20 * 60 + 59, false)).toBeNull();
    expect(dueReminder(s, "2026-10-05", 21 * 60, false)).toBe("first");
    expect(dueReminder(s, "2026-10-05", 22 * 60, false)).toBe("repeat");
    expect(dueReminder(s, "2026-10-05", 22 * 60, true)).toBeNull();
    expect(dueReminder(s, "2026-10-24", 21 * 60, false)).toBeNull(); // перерыв
    const ring = { method: "ring" as const, regimen: null, startDate: "2026-10-01", reminderMinutes: 9 * 60 };
    expect(dueReminder(ring, "2026-10-22", 9 * 60 + 5, false)).toBe("first");
    expect(dueReminder(ring, "2026-10-22", 11 * 60, false)).toBe("first"); // у кольца без повтора
    expect(dueReminder(ring, "2026-10-21", 10 * 60, false)).toBeNull();
    expect(dueReminder(ring, "2026-10-22", 10 * 60, true)).toBeNull();
  });
});

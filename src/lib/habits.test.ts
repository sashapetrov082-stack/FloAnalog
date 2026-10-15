import { describe, expect, it } from "vitest";
import {
  habitMonthStats,
  monthDays,
  monthSummary,
  moveHabit,
  removeHabit,
  sortHabits,
  streak,
  toggleCheck,
  type Habit,
  type HabitChecks,
} from "./habits";

const water: Habit = { id: "w", name: "Вода", emoji: "💧", goal: 31, position: 0 };
const read: Habit = { id: "r", name: "Читать", emoji: "📚", goal: 10, position: 1 };

describe("привычки", () => {
  it("отметка и снятие, пустые дни удаляются", () => {
    let c: HabitChecks = {};
    c = toggleCheck(c, "2026-01-05", "w");
    c = toggleCheck(c, "2026-01-05", "r");
    expect(c).toEqual({ "2026-01-05": ["w", "r"] });
    c = toggleCheck(toggleCheck(c, "2026-01-05", "w"), "2026-01-05", "r");
    expect(c).toEqual({});
  });

  it("серия: подряд до сегодня, или до вчера, если сегодня ещё не отмечено", () => {
    const c: HabitChecks = { "2026-01-03": ["w"], "2026-01-04": ["w"], "2026-01-05": ["w"], "2026-01-01": ["w"] };
    expect(streak(c, "w", "2026-01-05")).toBe(3);
    expect(streak(c, "w", "2026-01-06")).toBe(3);
    expect(streak(c, "w", "2026-01-07")).toBe(0);
  });

  it("статистика привычки за месяц: цель можно перевыполнить", () => {
    const c: HabitChecks = Object.fromEntries(monthDays(2026, 1).slice(0, 16).map((d) => [d, ["r"]]));
    const s = habitMonthStats(read, c, 2026, 1, "2026-01-20");
    expect([s.done, s.goal, s.ratio]).toEqual([16, 10, 1.6]);
    expect(monthDays(2026, 2)).toHaveLength(28);
  });

  it("проценты по дням, неделям и месяцу — без будущих дней", () => {
    const c: HabitChecks = {
      "2026-01-01": ["w", "r"],
      "2026-01-02": ["w"],
      "2026-01-08": ["w"],
      "2026-01-20": ["w", "r"], // будущее — не считается
    };
    const m = monthSummary([water, read], c, 2026, 1, "2026-01-10");
    expect(m.days[0].percent).toBe(1);
    expect(m.days[1].percent).toBe(0.5);
    expect(m.days[19].percent).toBeNull();
    expect(m.weeks.map((w) => [w.from, w.to])).toEqual([
      ["2026-01-01", "2026-01-07"],
      ["2026-01-08", "2026-01-14"],
      ["2026-01-15", "2026-01-21"],
      ["2026-01-22", "2026-01-28"],
      ["2026-01-29", "2026-01-31"],
    ]);
    expect(m.weeks[0].percent).toBeCloseTo(3 / 14);
    expect(m.weeks[1].percent).toBeCloseTo(1 / 6); // прошло 3 дня недели
    expect(m.weeks[2].percent).toBeNull();
    expect(m.percent).toBeCloseTo(4 / 20);
    expect(monthSummary([], c, 2026, 1, "2026-01-10").percent).toBeNull();
  });

  it("удаление вместе с отметками и порядок", () => {
    const r = removeHabit([water, read], { "2026-01-01": ["w", "r"], "2026-01-02": ["r"] }, "r");
    expect(r).toEqual({ habits: [water], checks: { "2026-01-01": ["w"] } });
    const moved = moveHabit([water, read], "r", -1);
    expect(sortHabits(moved).map((h) => h.id)).toEqual(["r", "w"]);
    expect(moveHabit([water, read], "w", -1)).toEqual([water, read]);
  });
});

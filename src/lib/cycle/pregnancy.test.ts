import { describe, expect, it } from "vitest";
import { weekInfo, weekTips } from "@/lib/pregnancy-weeks";
import { addDays } from "./dates";
import { dueDate, formatGestation, gestation, lmpFromDueDate } from "./pregnancy";

describe("режим беременности", () => {
  it("дата родов по правилу Негеле и обратно", () => {
    expect(dueDate("2026-01-01")).toBe("2026-10-08");
    expect(lmpFromDueDate("2026-10-08")).toBe("2026-01-01");
  });

  it("срок, триместр, дней до родов", () => {
    const g = gestation("2026-07-20", "2026-10-15")!;
    expect([g.weeks, g.days, g.currentWeek, g.trimester]).toEqual([12, 3, 13, 1]);
    expect(g.dueDate).toBe("2027-04-26");
    expect(g.daysLeft).toBe(193);
    expect(gestation("2026-07-20", "2026-07-19")).toBeNull();
    expect(gestation("2026-01-01", "2026-10-15")!.weeks).toBe(41);
    expect(gestation("2025-12-01", "2026-10-15")).toBeNull(); // больше 42 недель
  });

  it("границы триместров: 13+6 — первый, 14+0 — второй, 28+0 — третий", () => {
    expect(gestation("2026-01-01", "2026-04-08")!.trimester).toBe(1); // 13+6
    expect(gestation("2026-01-01", "2026-04-09")!.trimester).toBe(2); // 14+0
    expect(gestation("2026-01-01", "2026-07-16")!.trimester).toBe(3); // 28+0
  });

  it("склонения", () => {
    expect(formatGestation(12, 3)).toBe("12 недель 3 дня");
    expect(formatGestation(21, 1)).toBe("21 неделя 1 день");
    expect(formatGestation(22, 0)).toBe("22 недели");
    expect(formatGestation(0, 5)).toBe("5 дней");
    expect(formatGestation(11, 6)).toBe("11 недель 6 дней");
  });

  it("тексты есть для каждой недели с 4-й по 40-ю", () => {
    for (let w = 4; w <= 40; w++) expect(weekInfo(w)?.baby.length).toBeGreaterThan(10);
    expect(weekInfo(3)).toBeNull();
    expect(weekInfo(42)).toEqual(weekInfo(40));
    expect(weekTips(8).join(" ")).toMatch(/фолиевую/);
    expect(weekTips(30).join(" ")).toMatch(/шевеления/);
  });

  it("тексты недель не спорят с триместром", () => {
    for (let w = 4; w <= 40; w++) {
      // Неделя w идёт с (w−1)+0 по (w−1)+6: триместр на её начало и конец одинаков.
      const t = gestation("2026-01-01", addDays("2026-01-01", (w - 1) * 7))!.trimester;
      const text = weekInfo(w)!.baby;
      if (/Начался второй/.test(text)) expect(t).toBe(2);
      if (/Начался третий/.test(text)) expect(t).toBe(3);
      if (/первого триместра|Первый триместр подходит/.test(text)) expect(t).toBe(1);
      if (/второго триместра/.test(text)) expect(t).toBe(2);
    }
  });
});

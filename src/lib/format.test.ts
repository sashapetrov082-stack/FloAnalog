import { describe, expect, it } from "vitest";
import { formatMonthTitle, formatRange, pluralDays, todayLocal } from "./format";

describe("format", () => {
  it("диапазоны дат", () => {
    expect(formatRange("2026-11-12", "2026-11-14")).toBe("12–14 ноября");
    expect(formatRange("2026-11-30", "2026-12-02")).toBe("30 ноября – 2 декабря");
    expect(formatRange("2026-11-14", "2026-11-14")).toBe("14 ноября");
  });

  it("заголовок месяца", () => {
    expect(formatMonthTitle(2026, 10)).toBe("Октябрь 2026");
  });

  it("склонение «дней»", () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map(pluralDays)).toEqual([
      "1 день", "2 дня", "5 дней", "11 дней", "12 дней", "21 день", "22 дня", "25 дней", "111 дней",
    ]);
  });

  it("сегодня по локальным часам", () => {
    expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

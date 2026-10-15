import { describe, expect, it } from "vitest";
import type { GuestData } from "@/lib/guest/store";
import { diffData, isEmptyOps, mergeGuestIntoAccount } from "./diff";

const base: GuestData = {
  version: 2,
  settings: { cycleLength: 28, periodLength: 5 },
  periods: [
    { start: "2026-09-01", end: "2026-09-05" },
    { start: "2026-09-29", end: null },
  ],
  dayLogs: { "2026-09-30": { flow: "medium", symptoms: ["cramps"], moods: [], note: "" } },
};

describe("diffData", () => {
  it("без изменений — пусто", () => {
    expect(isEmptyOps(diffData(base, structuredClone(base)))).toBe(true);
  });

  it("первая отправка — всё целиком", () => {
    const ops = diffData(null, base);
    expect(ops.settings).toEqual(base.settings);
    expect(ops.upsertPeriods).toHaveLength(2);
    expect(ops.upsertLogs).toHaveLength(1);
  });

  it("новые, изменённые и удалённые месячные", () => {
    const next: GuestData = {
      ...base,
      periods: [{ start: "2026-09-29", end: "2026-10-03" }, { start: "2026-10-27", end: null }],
    };
    const ops = diffData(base, next);
    expect(ops.upsertPeriods).toEqual(next.periods);
    expect(ops.deletePeriodStarts).toEqual(["2026-09-01"]);
    expect(ops.settings).toBeNull();
  });

  it("перенос начала месячных — удаление старого и добавление нового", () => {
    const next: GuestData = { ...base, periods: [base.periods[0], { start: "2026-09-27", end: null }] };
    const ops = diffData(base, next);
    expect(ops.deletePeriodStarts).toEqual(["2026-09-29"]);
    expect(ops.upsertPeriods).toEqual([{ start: "2026-09-27", end: null }]);
  });

  it("журнал: изменение, удаление, порядок значений не важен", () => {
    const reordered: GuestData = {
      ...base,
      dayLogs: { "2026-09-30": { flow: "medium", symptoms: ["cramps"], moods: [], note: "" } },
    };
    expect(isEmptyOps(diffData(base, reordered))).toBe(true);

    const changed: GuestData = {
      ...base,
      dayLogs: { "2026-10-01": { flow: null, symptoms: [], moods: ["calm"], note: "" } },
    };
    const ops = diffData(base, changed);
    expect(ops.upsertLogs.map(([d]) => d)).toEqual(["2026-10-01"]);
    expect(ops.deleteLogDates).toEqual(["2026-09-30"]);
  });

  it("изменение настроек", () => {
    const ops = diffData(base, { ...base, settings: { cycleLength: 30, periodLength: 5 } });
    expect(ops.settings).toEqual({ cycleLength: 30, periodLength: 5 });
  });
});

describe("mergeGuestIntoAccount", () => {
  const empty: GuestData = { version: 2, settings: { cycleLength: 28, periodLength: 5 }, periods: [], dayLogs: {} };

  it("новый аккаунт получает гостевые данные и настройки", () => {
    const guest = { ...base, settings: { cycleLength: 31, periodLength: 6 } };
    expect(mergeGuestIntoAccount(empty, guest)).toEqual(guest);
  });

  it("аккаунт с данными: добавляются только новые месячные, при совпадении побеждает аккаунт", () => {
    const account: GuestData = {
      ...empty,
      settings: { cycleLength: 29, periodLength: 4 },
      periods: [{ start: "2026-09-02", end: "2026-09-06" }],
      dayLogs: { "2026-09-30": { flow: "light", symptoms: [], moods: [], note: "" } },
    };
    const merged = mergeGuestIntoAccount(account, base);
    expect(merged.settings).toEqual(account.settings);
    // 1 сентября и 2 сентября — одни и те же месячные, остаются из аккаунта.
    expect(merged.periods).toEqual([{ start: "2026-09-02", end: "2026-09-06" }, { start: "2026-09-29", end: null }]);
    expect(merged.dayLogs["2026-09-30"].flow).toBe("light");
  });
});

describe("синхронизация привычек", () => {
  const h1 = { id: "11111111-1111-4111-8111-111111111111", name: "Вода", emoji: "💧", goal: 31, position: 0 };
  const h2 = { id: "22222222-2222-4222-8222-222222222222", name: "Книга", emoji: "📚", goal: 10, position: 1 };
  const withHabits: GuestData = { ...base, habits: [h1, h2], habitChecks: { "2026-10-01": [h1.id, h2.id] } };

  it("новые привычки и отметки, снятые отметки, удалённая привычка", () => {
    const first = diffData(base, withHabits);
    expect(first.upsertHabits).toHaveLength(2);
    expect(first.addChecks).toEqual([[h1.id, "2026-10-01"], [h2.id, "2026-10-01"]]);
    const next: GuestData = { ...withHabits, habits: [{ ...h1, goal: 20 }], habitChecks: { "2026-10-02": [h1.id] } };
    const ops = diffData(withHabits, next);
    expect(ops.upsertHabits).toEqual([{ ...h1, goal: 20 }]);
    expect(ops.deleteHabitIds).toEqual([h2.id]);
    expect(ops.addChecks).toEqual([[h1.id, "2026-10-02"]]);
    // Отметка удалённой привычки уйдёт каскадом — отдельно не удаляем.
    expect(ops.removeChecks).toEqual([[h1.id, "2026-10-01"]]);
    expect(isEmptyOps(diffData(withHabits, structuredClone(withHabits)))).toBe(true);
  });

  it("гостевые привычки добавляются к привычкам аккаунта", () => {
    const account: GuestData = { ...base, habits: [h1], habitChecks: { "2026-10-01": [h1.id] } };
    const guest: GuestData = { ...base, habits: [{ ...h2, position: 0 }], habitChecks: { "2026-10-01": [h2.id] } };
    const merged = mergeGuestIntoAccount(account, guest);
    expect(merged.habits?.map((h) => [h.id, h.position])).toEqual([[h1.id, 0], [h2.id, 1]]);
    expect(merged.habitChecks).toEqual({ "2026-10-01": [h1.id, h2.id] });
  });
});

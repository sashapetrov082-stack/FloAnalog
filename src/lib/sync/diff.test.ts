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

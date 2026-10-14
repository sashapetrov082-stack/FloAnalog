import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { clearGuestData, loadGuestData, parseGuestData, saveGuestData, type GuestData } from "./store";

const sample: GuestData = {
  version: 1,
  settings: { cycleLength: 29, periodLength: 5 },
  periods: [{ start: "2026-10-01", end: null }],
};

describe("гостевое хранилище", () => {
  it("сохраняет, читает и удаляет данные", async () => {
    expect(await loadGuestData()).toBeNull();
    await saveGuestData(sample);
    expect(await loadGuestData()).toEqual(sample);
    await clearGuestData();
    expect(await loadGuestData()).toBeNull();
  });

  it("битые данные не принимаются", () => {
    expect(parseGuestData(null)).toBeNull();
    expect(parseGuestData({ version: 2 })).toBeNull();
    expect(parseGuestData({ ...sample, periods: [{ start: "вчера" }] })).toBeNull();
    expect(parseGuestData({ ...sample, settings: { cycleLength: "28", periodLength: 5 } })).toBeNull();
  });
});

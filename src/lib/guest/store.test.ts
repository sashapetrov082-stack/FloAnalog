import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { clearGuestData, loadGuestData, parseGuestData, saveGuestData, type GuestData } from "./store";

const sample: GuestData = {
  version: 2,
  settings: { cycleLength: 29, periodLength: 5, mode: "pregnancy", pregnancyLmp: "2026-09-01" },
  periods: [{ start: "2026-10-01", end: null }],
  dayLogs: {
    "2026-10-02": {
      flow: "medium",
      symptoms: ["cramps"],
      moods: ["calm"],
      note: "грелка помогла",
      temperature: 36.55,
      ovulationTest: "negative",
    },
  },
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
    expect(parseGuestData({ version: 3 })).toBeNull();
    expect(parseGuestData({ ...sample, dayLogs: { "не дата": {} } })).toBeNull();
    expect(parseGuestData({ ...sample, periods: [{ start: "вчера" }] })).toBeNull();
    expect(parseGuestData({ ...sample, settings: { cycleLength: "28", periodLength: 5 } })).toBeNull();
  });

  it("данные версии 1 переводятся в версию 2 с пустым журналом", () => {
    const v1 = { version: 1, settings: sample.settings, periods: sample.periods };
    expect(parseGuestData(v1)).toEqual({ ...sample, dayLogs: {} });
  });

  it("неизвестные значения в журнале отбрасываются", () => {
    const parsed = parseGuestData({ ...sample, dayLogs: { "2026-10-02": { flow: "lots", symptoms: ["cramps", 5] } } });
    expect(parsed?.dayLogs["2026-10-02"]).toEqual({
      flow: null,
      symptoms: ["cramps"],
      moods: [],
      note: "",
      temperature: null,
      ovulationTest: null,
    });
    const odd = parseGuestData({
      ...sample,
      dayLogs: { "2026-10-02": { symptoms: [], temperature: 50, ovulationTest: "maybe" } },
    });
    expect(odd?.dayLogs["2026-10-02"]).toMatchObject({ temperature: null, ovulationTest: null });
    expect(parseGuestData({ ...sample, settings: { cycleLength: 28, periodLength: 5 } })?.settings.mode).toBe("cycle");
  });
});

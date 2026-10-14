import { describe, expect, it } from "vitest";
import { emptyLog, isEmptyLog, MOODS, NOTE_MAX_LENGTH, setDayLog, summarizeLog, SYMPTOM_GROUPS, toggle } from "./journal";

describe("журнал дня", () => {
  it("около 30 симптомов в 5 группах, идентификаторы не повторяются", () => {
    const ids = [...SYMPTOM_GROUPS.flatMap((g) => g.options.map((o) => o.id)), ...MOODS.map((m) => m.id)];
    expect(SYMPTOM_GROUPS).toHaveLength(5);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(30);
  });

  it("toggle добавляет и убирает", () => {
    expect(toggle(["a"], "b")).toEqual(["a", "b"]);
    expect(toggle(["a", "b"], "a")).toEqual(["b"]);
  });

  it("пустой журнал удаляется, непустой сохраняется", () => {
    const withLog = setDayLog({}, "2026-10-14", { ...emptyLog(), symptoms: ["cramps"] });
    expect(withLog["2026-10-14"].symptoms).toEqual(["cramps"]);
    expect(setDayLog(withLog, "2026-10-14", emptyLog())).toEqual({});
    expect(isEmptyLog({ ...emptyLog(), note: "   " })).toBe(true);
  });

  it("заметка обрезается до лимита", () => {
    const logs = setDayLog({}, "2026-10-14", { ...emptyLog(), note: "x".repeat(NOTE_MAX_LENGTH + 10) });
    expect(logs["2026-10-14"].note).toHaveLength(NOTE_MAX_LENGTH);
  });

  it("краткое описание дня", () => {
    expect(summarizeLog({ flow: "medium", symptoms: ["cramps"], moods: ["calm"] })).toEqual([
      "Умеренные",
      "Спазмы внизу живота",
      "Спокойствие",
    ]);
  });
});

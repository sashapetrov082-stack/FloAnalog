import { describe, expect, it } from "vitest";
import { buildMessage, CYCLE_REMINDER, isAllowed, shouldSend } from "./notify";

describe("уведомления", () => {
  it("роли: партнёр не может прислать «новый статус», владелица — «выполнено»", () => {
    expect(isAllowed("owner", "status")).toBe(true);
    expect(isAllowed("partner", "status")).toBe(false);
    expect(isAllowed("partner", "done")).toBe(true);
    expect(isAllowed("owner", "done")).toBe(false);
    expect(isAllowed("owner", "anything")).toBe(false);
  });

  it("не чаще: статус — раз в час, остальное — раз в минуту", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    expect(shouldSend("status", null, now)).toBe(true);
    expect(shouldSend("status", new Date("2026-10-16T11:30:00Z"), now)).toBe(false);
    expect(shouldSend("status", new Date("2026-10-16T10:59:00Z"), now)).toBe(true);
    expect(shouldSend("note", new Date("2026-10-16T11:59:30Z"), now)).toBe(false);
    expect(shouldSend("note", new Date("2026-10-16T11:58:59Z"), now)).toBe(true);
  });

  it("тексты нейтральные, без подробностей", () => {
    expect(buildMessage("request", "Аня")).toEqual({
      title: "Трекер",
      body: "Аня: новая просьба",
      tag: "request",
      url: "/?tab=pair",
    });
    expect(buildMessage("drawing", null).body).toBe("Партнёр: новый рисунок");
    const all = [buildMessage("status", "А"), buildMessage("note", "А"), CYCLE_REMINDER].map((m) => m.body).join(" ");
    expect(all).not.toMatch(/месячн|симптом|овуляц|либидо/i);
  });
});

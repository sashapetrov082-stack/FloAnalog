import { describe, expect, it } from "vitest";
import {
  buildMessage,
  contraceptionReminder,
  contraceptionReminderKey,
  explainTest,
  CYCLE_REMINDER,
  isAllowed,
  localClock,
  parseTime,
  shouldSend,
} from "./notify";

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

  it("контрацепция: местное время, ключи, нейтральный текст", () => {
    const now = new Date("2026-10-15T22:30:00Z");
    expect(localClock(now, "Europe/Berlin")).toEqual({ date: "2026-10-16", minutes: 30 });
    expect(localClock(now, "America/New_York")).toEqual({ date: "2026-10-15", minutes: 18 * 60 + 30 });
    expect(localClock(new Date("2026-10-15T00:05:00Z"), "UTC")).toEqual({ date: "2026-10-15", minutes: 5 });
    expect(localClock(now, "Not/AZone")).toBeNull();
    expect(parseTime("21:05:00")).toBe(21 * 60 + 5);
    expect(contraceptionReminderKey("repeat", "2026-10-16")).toBe("contra-r:2026-10-16");
    for (const kind of ["first", "repeat"] as const) {
      expect(contraceptionReminder(kind).body).not.toMatch(/таблет|контрацеп|кольц|пластыр|цикл/i);
    }
  });

  it("проверка уведомлений: понятная причина", () => {
    expect(explainTest({ reason: "push-not-configured" }).text).toMatch(/Vercel/);
    expect(explainTest({ devices: 0, sent: 0, errors: [], thisDevice: false }).text).toMatch(/не знает это устройство/);
    expect(explainTest({ devices: 1, sent: 0, errors: [403], thisDevice: true }).text).toMatch(/не из одной пары/);
    expect(explainTest({ devices: 1, sent: 0, errors: [0], hosts: ["web.push.apple.com"], thisDevice: true }).text).toMatch(
      /web\.push\.apple\.com/,
    );
    expect(explainTest({ devices: 1, sent: 1, errors: [], thisDevice: true }).ok).toBe(true);
    expect(explainTest({ reason: "db-not-ready" }).text).toMatch(/20261019000000_push\.sql/);
    expect(explainTest({ devices: 0, sent: 0, errors: [], thisDevice: false, saveError: "boom" }).text).toMatch(/boom/);
  });
});

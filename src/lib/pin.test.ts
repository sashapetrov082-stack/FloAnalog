import { describe, expect, it } from "vitest";
import { checkPin, createPinRecord, isValidPin, lockoutMs, parsePinRecord } from "./pin";

describe("PIN-код", () => {
  it("принимаются только 4 цифры", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(["123", "12345", "12a4", ""].some(isValidPin)).toBe(false);
  });

  it("хранится хэш с солью, а не сам PIN", async () => {
    const a = await createPinRecord("1234");
    const b = await createPinRecord("1234");
    expect(JSON.stringify(a)).not.toContain("1234");
    expect(a.hash).not.toBe(b.hash); // разная соль
  });

  it("верный PIN проходит и сбрасывает счётчик неудач", async () => {
    const record = { ...(await createPinRecord("2580")), failures: 3 };
    const result = await checkPin(record, "2580", 1000);
    expect(result.ok).toBe(true);
    expect(result.record.failures).toBe(0);
  });

  it("после 5 неудач — блокировка, во время блокировки не проверяется даже верный PIN", async () => {
    let record = await createPinRecord("2580");
    let now = 1_000_000;
    for (let i = 1; i <= 4; i++) {
      const r = await checkPin(record, "0000", now);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.attemptsLeft).toBe(5 - i);
      record = r.record;
    }
    const fifth = await checkPin(record, "0000", now);
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) expect(fifth.lockedForMs).toBe(30_000);
    record = fifth.record;

    const duringLock = await checkPin(record, "2580", now + 10_000);
    expect(duringLock.ok).toBe(false);

    now += 31_000;
    const sixth = await checkPin(record, "1111", now);
    if (!sixth.ok) expect(sixth.lockedForMs).toBe(60_000);
    const afterLock = await checkPin(sixth.record, "2580", now + 61_000);
    expect(afterLock.ok).toBe(true);
  });

  it("блокировки растут и упираются в 15 минут", () => {
    expect([4, 5, 6, 7, 8, 20].map(lockoutMs)).toEqual([0, 30_000, 60_000, 300_000, 900_000, 900_000]);
  });

  it("битая запись не принимается", () => {
    expect(parsePinRecord(null)).toBeNull();
    expect(parsePinRecord({ version: 2 })).toBeNull();
  });
});

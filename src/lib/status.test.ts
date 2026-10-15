import { describe, expect, it } from "vitest";
import { describeStatus, EMPTY_STATUS, isEmptyStatus } from "./status";

describe("статус дня", () => {
  it("пустой статус", () => {
    expect(isEmptyStatus(EMPTY_STATUS)).toBe(true);
    expect(isEmptyStatus({ ...EMPTY_STATUS, needs: ["care"] })).toBe(false);
  });

  it("описание для партнёра", () => {
    expect(describeStatus({ energy: 1, mood: "low", needs: ["care", "quiet"] })).toEqual([
      "Энергия: мало",
      "Настроение: 😔 так себе",
      "Нужно: забота, тишина",
    ]);
  });

  it("либидо попадает в описание, только если пришло с сервера", () => {
    expect(describeStatus({ energy: 2 })).toEqual(["Энергия: нормально"]);
    expect(describeStatus({ libido: 3 })).toEqual(["Либидо: выше обычного"]);
  });
});

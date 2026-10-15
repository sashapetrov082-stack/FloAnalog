import { describe, expect, it } from "vitest";
import { partnerCycleInfo, type PartnerFertility, type PartnerPrediction } from "./partner";

const prediction: PartnerPrediction = {
  computed_for: "2026-10-01",
  last_period_start: "2026-10-01",
  cycle_length: 28,
  period_length: 5,
  next_period_date: "2026-10-29",
  next_period_earliest: "2026-10-28",
  next_period_latest: "2026-10-30",
};
const fertility: PartnerFertility = {
  ovulation_date: "2026-10-15",
  fertile_start: "2026-10-10",
  fertile_end: "2026-10-16",
};

describe("partnerCycleInfo", () => {
  it("день цикла считается на сегодня, а не на дату расчёта", () => {
    expect(partnerCycleInfo(prediction, null, "2026-10-14").cycleDay).toBe(14);
  });

  it("фазы с доступом к фертильности", () => {
    const phase = (d: string) => partnerCycleInfo(prediction, fertility, d).phase;
    expect(phase("2026-10-03")).toBe("menstruation");
    expect(phase("2026-10-07")).toBe("follicular");
    expect(phase("2026-10-12")).toBe("fertile");
    expect(phase("2026-10-15")).toBe("ovulation");
    expect(phase("2026-10-20")).toBe("luteal");
  });

  it("без доступа к фертильности фазы «фертильно» и «овуляция» не показываются", () => {
    const phase = (d: string) => partnerCycleInfo(prediction, null, d).phase;
    expect(phase("2026-10-12")).toBe("follicular");
    expect(phase("2026-10-15")).toBe("luteal");
    expect(partnerCycleInfo(prediction, null, "2026-10-12").fertileWindow).toBeNull();
  });

  it("дни до месячных и задержка", () => {
    expect(partnerCycleInfo(prediction, null, "2026-10-20").daysUntilPeriod).toBe(8);
    const late = partnerCycleInfo(prediction, null, "2026-11-02");
    expect(late.daysUntilPeriod).toBe(0);
    expect(late.delayDays).toBe(4);
  });
});

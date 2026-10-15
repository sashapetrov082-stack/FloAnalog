// Что показать партнёру на сегодня по опорным датам прогноза владелицы.
// Фертильные дни и овуляция — только если владелица разрешила их показывать.

import { addDays, compareDates, diffDays, type IsoDate } from "./dates";
import { LUTEAL_PHASE_DAYS, type Phase } from "./predict";

export interface PartnerPrediction {
  computed_for: IsoDate;
  last_period_start: IsoDate;
  cycle_length: number;
  period_length: number;
  next_period_date: IsoDate;
  next_period_earliest: IsoDate;
  next_period_latest: IsoDate;
}

export interface PartnerFertility {
  ovulation_date: IsoDate;
  fertile_start: IsoDate;
  fertile_end: IsoDate;
}

export interface PartnerCycleInfo {
  cycleDay: number;
  /** Без доступа к фертильности — только месячные, фолликулярная и лютеиновая фазы. */
  phase: Phase;
  nextPeriod: { earliest: IsoDate; latest: IsoDate };
  /** Дней до самого раннего ожидаемого начала месячных (0 — уже сейчас). */
  daysUntilPeriod: number;
  delayDays: number;
  fertileWindow: { start: IsoDate; end: IsoDate } | null;
}

export function partnerCycleInfo(
  prediction: PartnerPrediction,
  fertility: PartnerFertility | null,
  today: IsoDate,
): PartnerCycleInfo {
  const cycleDay = diffDays(prediction.last_period_start, today) + 1;
  const lastPeriodEnd = addDays(prediction.last_period_start, prediction.period_length - 1);
  const delayDays = Math.max(0, diffDays(prediction.next_period_date, today));

  let phase: Phase;
  if (compareDates(today, lastPeriodEnd) <= 0) {
    phase = "menstruation";
  } else if (fertility && today === fertility.ovulation_date) {
    phase = "ovulation";
  } else if (
    fertility &&
    compareDates(today, fertility.fertile_start) >= 0 &&
    compareDates(today, fertility.fertile_end) <= 0
  ) {
    phase = "fertile";
  } else {
    // Граница фолликулярной и лютеиновой фаз — расчётная овуляция.
    const ovulation = fertility?.ovulation_date ?? addDays(prediction.next_period_date, -LUTEAL_PHASE_DAYS);
    phase = compareDates(today, ovulation) < 0 ? "follicular" : "luteal";
  }

  return {
    cycleDay,
    phase,
    nextPeriod: { earliest: prediction.next_period_earliest, latest: prediction.next_period_latest },
    daysUntilPeriod: Math.max(0, diffDays(today, prediction.next_period_earliest)),
    delayDays,
    fertileWindow: fertility ? { start: fertility.fertile_start, end: fertility.fertile_end } : null,
  };
}

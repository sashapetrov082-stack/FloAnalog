"use client";

import { useState } from "react";
import { addDays, type IsoDate } from "@/lib/cycle/dates";
import { DEFAULT_CYCLE_LENGTH, DEFAULT_PERIOD_LENGTH } from "@/lib/cycle/predict";
import type { GuestData } from "@/lib/guest/store";
import { pluralDays } from "@/lib/format";
import { Button, Disclaimer, Stepper } from "./ui";

type Step = "welcome" | "last-period" | "cycle" | "period";
const STEPS: Step[] = ["welcome", "last-period", "cycle", "period"];

export function Onboarding({ today, onDone }: { today: IsoDate; onDone: (data: GuestData) => void }) {
  const [step, setStep] = useState<Step>("welcome");
  const [lastPeriod, setLastPeriod] = useState<IsoDate | null>(null);
  const [cycleLength, setCycleLength] = useState(DEFAULT_CYCLE_LENGTH);
  const [periodLength, setPeriodLength] = useState(DEFAULT_PERIOD_LENGTH);

  const index = STEPS.indexOf(step);
  const next = () => setStep(STEPS[index + 1]);
  const back = () => setStep(STEPS[index - 1]);

  const finish = () =>
    onDone({
      version: 2,
      settings: { cycleLength, periodLength },
      periods: lastPeriod ? [{ start: lastPeriod, end: null }] : [],
      dayLogs: {},
    });

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8">
      {index > 0 && (
        <div className="mb-8 flex items-center gap-3">
          <Button variant="ghost" className="-ml-3 px-3" onClick={back} aria-label="Назад">
            ←
          </Button>
          <div className="flex flex-1 gap-1.5" aria-hidden>
            {STEPS.slice(1).map((s, i) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full ${i < index ? "bg-accent" : "bg-border"}`} />
            ))}
          </div>
        </div>
      )}

      {step === "welcome" && (
        <div className="flex flex-1 flex-col justify-center gap-6">
          <h1 className="text-4xl font-semibold tracking-tight">Трекер цикла</h1>
          <p className="text-lg text-muted">
            Календарь месячных, прогноз и подсказки. Три вопроса — и прогноз готов.
          </p>
          <p className="rounded-2xl bg-fertile-soft p-4 text-sm">
            Регистрация не нужна. Пока вы не создадите аккаунт, данные хранятся только на этом устройстве.
          </p>
          <Button onClick={next}>Начать</Button>
          <Disclaimer />
        </div>
      )}

      {step === "last-period" && (
        <div className="flex flex-1 flex-col gap-6">
          <h1 className="text-2xl font-semibold">Когда начались последние месячные?</h1>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-muted">Первый день месячных</span>
            <input
              type="date"
              className="min-h-12 rounded-2xl border border-border bg-surface px-4 text-lg"
              max={today}
              min={addDays(today, -90)}
              value={lastPeriod ?? ""}
              onChange={(e) => setLastPeriod(e.target.value || null)}
            />
          </label>
          <div className="mt-auto flex flex-col gap-3">
            <Button onClick={next} disabled={!lastPeriod}>
              Дальше
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setLastPeriod(null);
                next();
              }}
            >
              Не помню — отмечу, когда начнутся
            </Button>
          </div>
        </div>
      )}

      {step === "cycle" && (
        <div className="flex flex-1 flex-col gap-6">
          <h1 className="text-2xl font-semibold">Сколько дней обычно длится цикл?</h1>
          <p className="text-muted">От первого дня одних месячных до первого дня следующих. Чаще всего 24–35 дней.</p>
          <Stepper
            label="Длина цикла"
            value={cycleLength}
            min={15}
            max={60}
            onChange={setCycleLength}
            unit={pluralDays}
          />
          <div className="mt-auto flex flex-col gap-3">
            <Button onClick={next}>Дальше</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCycleLength(DEFAULT_CYCLE_LENGTH);
                next();
              }}
            >
              Не знаю — пусть будет 28
            </Button>
          </div>
        </div>
      )}

      {step === "period" && (
        <div className="flex flex-1 flex-col gap-6">
          <h1 className="text-2xl font-semibold">Сколько дней обычно идут месячные?</h1>
          <Stepper
            label="Длина месячных"
            value={periodLength}
            min={1}
            max={14}
            onChange={setPeriodLength}
            unit={pluralDays}
          />
          <p className="text-muted">Прогноз станет точнее, когда вы отметите несколько циклов.</p>
          <div className="mt-auto flex flex-col gap-3">
            <Button onClick={finish}>Готово</Button>
          </div>
        </div>
      )}
    </main>
  );
}

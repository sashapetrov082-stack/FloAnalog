"use client";

import { useMemo, useState } from "react";
import { compareDates, diffDays, type IsoDate } from "@/lib/cycle/dates";
import {
  findPeriodAt,
  markPeriodEnd,
  markPeriodStart,
  ongoingPeriod,
  removePeriod,
} from "@/lib/cycle/periods";
import { predict, type Phase, type Prediction, type Warning } from "@/lib/cycle/predict";
import type { GuestData } from "@/lib/guest/store";
import { formatDayMonth, formatLong, formatRange, pluralDays } from "@/lib/format";
import { Calendar } from "./Calendar";
import { Button, Card, Disclaimer, Stepper } from "./ui";

const phaseLabel: Record<Phase, string> = {
  menstruation: "Месячные",
  follicular: "Фолликулярная фаза",
  fertile: "Фертильные дни",
  ovulation: "Овуляция (прогноз)",
  luteal: "Лютеиновая фаза",
};

function warningText(w: Warning): string {
  switch (w.type) {
    case "short_cycle":
      return `Средняя длина цикла — ${pluralDays(w.averageLength)}, это короче обычного. Если так повторяется, стоит обсудить это с гинекологом.`;
    case "long_cycle":
      return `Средняя длина цикла — ${pluralDays(w.averageLength)}, это длиннее обычного. Если так повторяется, стоит обсудить это с гинекологом.`;
    case "delay":
      return `Месячные задерживаются на ${pluralDays(w.days)}. Так бывает из-за стресса, болезни, смены режима или беременности. Если задержка продолжается, сделайте тест и обратитесь к врачу.`;
  }
}

function nextPeriodText(p: Prediction, today: IsoDate): string {
  if (p.delayDays > 0) return `Задержка ${pluralDays(p.delayDays)}`;
  const { earliest, latest } = p.nextPeriod;
  const days = diffDays(today, earliest);
  const when = days <= 0 ? "в ближайшие дни" : `через ${pluralDays(days)}`;
  return `${formatRange(earliest, latest)} · ${when}`;
}

export function Dashboard({
  data,
  today,
  onChange,
  onReset,
}: {
  data: GuestData;
  today: IsoDate;
  onChange: (data: GuestData) => void;
  onReset: () => void;
}) {
  const { periods, settings } = data;
  const [selected, setSelected] = useState<IsoDate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const prediction = useMemo(
    () =>
      predict({
        periods,
        today,
        defaultCycleLength: settings.cycleLength,
        defaultPeriodLength: settings.periodLength,
      }),
    [periods, today, settings],
  );
  const periodLength = prediction?.periodLength ?? settings.periodLength;
  const ongoing = ongoingPeriod(periods, today, periodLength);

  const setPeriods = (next: GuestData["periods"]) => onChange({ ...data, periods: next });

  const markStart = (date: IsoDate) => setPeriods(markPeriodStart(periods, date, periodLength));
  const markEnd = (date: IsoDate) => {
    const next = markPeriodEnd(periods, date);
    if (next) setPeriods(next);
    else setNotice("Не нашли месячные, которые начались в последние 2 недели до этой даты.");
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <header>
        <p className="text-sm text-muted">Сегодня</p>
        <h1 className="text-2xl font-semibold first-letter:uppercase">{formatLong(today)}</h1>
      </header>

      {prediction ? (
        <Card className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <div className="text-5xl font-semibold tabular-nums">
                {prediction.cycleDay}
                <span className="ml-2 text-lg font-normal text-muted">день цикла</span>
              </div>
              <div className="mt-1 text-base font-medium text-accent">{phaseLabel[prediction.phase]}</div>
            </div>
          </div>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-muted">Следующие месячные</dt>
              <dd className="text-base font-medium">{nextPeriodText(prediction, today)}</dd>
            </div>
            <div>
              <dt className="text-muted">Фертильное окно</dt>
              <dd className="text-base font-medium">
                {formatRange(prediction.fertileWindow.start, prediction.fertileWindow.end)}
              </dd>
            </div>
          </dl>
          {!prediction.basedOnHistory && (
            <p className="text-sm text-muted">
              Пока прогноз по вашим ответам. Он станет точнее, когда вы отметите начало следующих месячных.
            </p>
          )}
        </Card>
      ) : (
        <Card>
          <p className="text-base">
            Отметьте первый день месячных — и мы построим прогноз. Можно выбрать прошедший день в календаре ниже.
          </p>
        </Card>
      )}

      {prediction?.warnings.map((w) => (
        <p key={w.type} className="rounded-2xl bg-warning-soft p-4 text-sm text-warning" role="note">
          {warningText(w)}
        </p>
      ))}

      {ongoing ? (
        <Button onClick={() => markEnd(today)}>Месячные закончились сегодня</Button>
      ) : (
        <Button onClick={() => markStart(today)}>Месячные начались сегодня</Button>
      )}

      <Card>
        <Calendar
          periods={periods}
          prediction={prediction}
          today={today}
          selected={selected}
          onSelect={(d) => {
            setNotice(null);
            setSelected(d === selected ? null : d);
          }}
        />
      </Card>

      {selected && (
        <DayPanel
          date={selected}
          today={today}
          periods={periods}
          periodLength={periodLength}
          notice={notice}
          onStart={() => markStart(selected)}
          onEnd={() => markEnd(selected)}
          onRemove={(start) => setPeriods(removePeriod(periods, start))}
          onClose={() => setSelected(null)}
        />
      )}

      <Settings data={data} onChange={onChange} onReset={onReset} />

      <footer className="pb-4 pt-2">
        <Disclaimer />
      </footer>
    </main>
  );
}

function DayPanel({
  date,
  today,
  periods,
  periodLength,
  notice,
  onStart,
  onEnd,
  onRemove,
  onClose,
}: {
  date: IsoDate;
  today: IsoDate;
  periods: GuestData["periods"];
  periodLength: number;
  notice: string | null;
  onStart: () => void;
  onEnd: () => void;
  onRemove: (start: IsoDate) => void;
  onClose: () => void;
}) {
  const isFuture = compareDates(date, today) > 0;
  const period = findPeriodAt(periods, date, periodLength);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold first-letter:uppercase">{formatLong(date)}</h2>
        <Button variant="ghost" className="-mr-3 -mt-2 px-3" onClick={onClose} aria-label="Закрыть">
          ✕
        </Button>
      </div>

      {isFuture ? (
        <p className="text-sm text-muted">Будущие дни отметить нельзя — здесь только прогноз.</p>
      ) : period ? (
        <>
          <p className="text-sm text-muted">
            Месячные с {formatDayMonth(period.start)}
            {period.end ? ` по ${formatDayMonth(period.end)}` : " (конец не отмечен)"}.
          </p>
          {date !== period.start && <Button onClick={onEnd}>Закончились в этот день</Button>}
          <Button variant="danger" onClick={() => onRemove(period.start)}>
            Удалить эти месячные
          </Button>
        </>
      ) : (
        <>
          <Button onClick={onStart}>Месячные начались в этот день</Button>
          <Button variant="secondary" onClick={onEnd}>
            Месячные закончились в этот день
          </Button>
        </>
      )}
      {notice && <p className="text-sm text-warning">{notice}</p>}
    </Card>
  );
}

function Settings({
  data,
  onChange,
  onReset,
}: {
  data: GuestData;
  onChange: (data: GuestData) => void;
  onReset: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const set = (patch: Partial<GuestData["settings"]>) => onChange({ ...data, settings: { ...data.settings, ...patch } });

  return (
    <details className="rounded-3xl border border-border bg-surface p-5">
      <summary className="cursor-pointer text-base font-medium">Настройки и данные</summary>
      <div className="mt-5 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Обычная длина цикла (пока мало отметок)</p>
          <Stepper
            label="Длина цикла"
            value={data.settings.cycleLength}
            min={15}
            max={60}
            onChange={(cycleLength) => set({ cycleLength })}
            unit={pluralDays}
          />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Обычная длина месячных</p>
          <Stepper
            label="Длина месячных"
            value={data.settings.periodLength}
            min={1}
            max={14}
            onChange={(periodLength) => set({ periodLength })}
            unit={pluralDays}
          />
        </div>
        <p className="text-sm text-muted">
          Данные хранятся только в этом браузере. Если очистить данные сайта или сменить устройство, они пропадут —
          синхронизация появится вместе с регистрацией.
        </p>
        {confirming ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">Удалить все отметки и настройки с этого устройства? Это нельзя отменить.</p>
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" onClick={onReset}>
                Удалить
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Удалить все данные
          </Button>
        )}
      </div>
    </details>
  );
}

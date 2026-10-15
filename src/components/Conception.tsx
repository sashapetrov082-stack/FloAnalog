"use client";

import { useMemo, useState } from "react";
import {
  FERTILITY_LABEL,
  fertilityToday,
  temperatures,
  type FertilityLevel,
  type TempPoint,
  type TemperatureShift,
} from "@/lib/cycle/conception";
import { compareDates, diffDays, type IsoDate } from "@/lib/cycle/dates";
import type { Prediction } from "@/lib/cycle/predict";
import { formatDayMonth, formatRange } from "@/lib/format";
import { formatTemperature, type DayLogs } from "@/lib/journal";
import { Button, Card } from "./ui";

const SOURCE_LABEL = {
  prediction: "по прогнозу",
  test: "по тесту на овуляцию",
  temperature: "по температуре",
} as const;

const LEVEL_DOT: Record<FertilityLevel, string> = {
  high: "bg-fertile",
  medium: "bg-fertile-soft ring-1 ring-fertile",
  low: "bg-border",
};

/** Карточка режима зачатия на вкладке «Сегодня». */
export function ConceptionCard({
  prediction,
  dayLogs,
  today,
  contraceptionOn,
  onLog,
}: {
  prediction: Prediction;
  dayLogs: DayLogs;
  today: IsoDate;
  contraceptionOn: boolean;
  onLog: () => void;
}) {
  const f = useMemo(() => fertilityToday(prediction, dayLogs, today), [prediction, dayLogs, today]);
  const points = useMemo(
    () => temperatures(dayLogs, prediction.lastPeriodStart, today),
    [dayLogs, prediction.lastPeriodStart, today],
  );
  const positiveTests = useMemo(
    () =>
      Object.entries(dayLogs)
        .filter(
          ([d, l]) =>
            (l.ovulationTest === "positive" || l.ovulationTest === "peak") &&
            compareDates(d, prediction.lastPeriodStart) >= 0 &&
            compareDates(d, today) <= 0,
        )
        .map(([d]) => d),
    [dayLogs, prediction.lastPeriodStart, today],
  );
  const loggedToday = dayLogs[today]?.temperature != null || !!dayLogs[today]?.ovulationTest;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-sm text-muted">Режим зачатия</p>
        <p className="flex items-center gap-2 text-2xl font-semibold">
          <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${LEVEL_DOT[f.level]}`} aria-hidden />
          Фертильность: {FERTILITY_LABEL[f.level]}
        </p>
        <p className="mt-1 text-sm">{f.reason}</p>
      </div>

      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="text-muted">Овуляция ({SOURCE_LABEL[f.source]})</dt>
          <dd className="text-base font-medium">
            {f.source === "temperature" ? "около " : ""}
            {formatDayMonth(f.ovulation)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Фертильное окно по прогнозу</dt>
          <dd className="text-base font-medium">
            {formatRange(prediction.fertileWindow.start, prediction.fertileWindow.end)}
          </dd>
        </div>
      </dl>

      {points.length > 0 ? (
        <TemperatureChart
          points={points}
          cycleStart={prediction.lastPeriodStart}
          cycleLength={prediction.cycleLength}
          today={today}
          fertileWindow={prediction.fertileWindow}
          shift={f.shift}
          positiveTests={positiveTests}
        />
      ) : (
        <p className="text-sm text-muted">
          Отмечайте базальную температуру каждое утро — после подъёма температуры станет видно, что овуляция,
          вероятно, прошла. Тесты на овуляцию подскажут её приближение.
        </p>
      )}

      <Button variant="secondary" onClick={onLog}>
        {loggedToday ? "Изменить температуру и тест" : "Отметить температуру и тест"}
      </Button>

      {contraceptionOn && (
        <p className="rounded-2xl bg-warning-soft p-3 text-sm text-warning" role="note">
          В настройках отмечена контрацепция. Если вы её больше не используете, выключите её там — иначе прогноз
          может быть неточным.
        </p>
      )}
      <p className="text-xs text-muted">
        Это ориентир для планирования, а не диагноз. Если беременность не наступает в течение года (после 35 лет — полугода),
        стоит обратиться к врачу.
      </p>
    </Card>
  );
}

// --- График базальной температуры текущего цикла ---

const W = 340;
const H = 190;
const PAD = { left: 34, right: 10, top: 12, bottom: 26 };

function fmt(t: number): string {
  return t.toFixed(1).replace(".", ",");
}

export function TemperatureChart({
  points,
  cycleStart,
  cycleLength,
  today,
  fertileWindow,
  shift,
  positiveTests,
}: {
  points: TempPoint[];
  cycleStart: IsoDate;
  cycleLength: number;
  today: IsoDate;
  fertileWindow: { start: IsoDate; end: IsoDate };
  shift: TemperatureShift | null;
  positiveTests: IsoDate[];
}) {
  const [hover, setHover] = useState<TempPoint | null>(null);
  const dayOf = (d: IsoDate) => diffDays(cycleStart, d) + 1;
  const lastDay = Math.max(cycleLength, dayOf(today), ...points.map((p) => dayOf(p.date)));

  const temps = points.map((p) => p.temp).concat(shift ? [shift.coverline] : []);
  let yMin = Math.floor((Math.min(...temps) - 0.1) * 10) / 10;
  let yMax = Math.ceil((Math.max(...temps) + 0.1) * 10) / 10;
  if (yMax - yMin < 0.6) {
    const mid = (yMax + yMin) / 2;
    yMin = Math.floor((mid - 0.3) * 10) / 10;
    yMax = Math.ceil((mid + 0.3) * 10) / 10;
  }
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (day: number) => PAD.left + ((day - 1) / Math.max(1, lastDay - 1)) * plotW;
  const y = (t: number) => PAD.top + (1 - (t - yMin) / (yMax - yMin)) * plotH;

  const step = yMax - yMin > 1.2 ? 0.4 : 0.2;
  const ticks: number[] = [];
  for (let t = Math.ceil(yMin / step - 1e-9) * step; t <= yMax + 1e-9; t += step) ticks.push(Math.round(t * 10) / 10);
  const dayTicks = [1, 8, 15, 22, 29, 36, 43].filter((d) => d <= lastDay);

  const path = points.map((p, i) => `${i ? "L" : "M"}${x(dayOf(p.date)).toFixed(1)},${y(p.temp).toFixed(1)}`).join("");
  const band = {
    from: Math.max(1, dayOf(fertileWindow.start)),
    to: Math.min(lastDay, dayOf(fertileWindow.end)),
  };

  const nearest = (clientX: number, rect: DOMRect) => {
    const svgX = ((clientX - rect.left) / rect.width) * W;
    let best = points[0];
    for (const p of points) if (Math.abs(x(dayOf(p.date)) - svgX) < Math.abs(x(dayOf(best.date)) - svgX)) best = p;
    return best;
  };

  const summary = `График базальной температуры: ${points.length} измерений, от ${fmt(Math.min(...points.map((p) => p.temp)))} до ${fmt(
    Math.max(...points.map((p) => p.temp)),
  )} °C${shift ? `, подъём с ${formatDayMonth(shift.firstHigh)}, линия покрытия ${formatTemperature(shift.coverline)}` : ""}.`;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between text-sm">
        <span className="font-medium">Базальная температура, °C</span>
        <span className="tabular-nums text-muted" aria-live="polite">
          {hover ? `${formatDayMonth(hover.date)} · ${formatTemperature(hover.temp)}` : "день цикла →"}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label={summary}
        onPointerMove={(e) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerDown={(e) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setHover(null)}
      >
        {band.from <= band.to && (
          <rect
            x={x(band.from) - 3}
            y={PAD.top}
            width={x(band.to) - x(band.from) + 6}
            height={plotH}
            rx={4}
            className="fill-fertile-soft"
          />
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-muted text-[10px] tabular-nums">
              {fmt(t)}
            </text>
          </g>
        ))}
        {dayTicks.map((d) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="middle" className="fill-muted text-[10px] tabular-nums">
            {d}
          </text>
        ))}
        {shift && (
          <g>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(shift.coverline)}
              y2={y(shift.coverline)}
              className="stroke-muted"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            <text x={W - PAD.right} y={y(shift.coverline) - 4} textAnchor="end" className="fill-muted text-[10px]">
              линия покрытия
            </text>
          </g>
        )}
        {positiveTests.map((d) => (
          <g key={d}>
            <line
              x1={x(dayOf(d))}
              x2={x(dayOf(d))}
              y1={PAD.top}
              y2={PAD.top + plotH}
              className="stroke-fertile"
              strokeWidth={1.5}
              strokeDasharray="2 3"
            />
            <text x={x(dayOf(d))} y={PAD.top + 9} textAnchor="middle" className="fill-foreground text-[9px] font-semibold">
              ЛГ+
            </text>
          </g>
        ))}
        {hover && (
          <line
            x1={x(dayOf(hover.date))}
            x2={x(dayOf(hover.date))}
            y1={PAD.top}
            y2={PAD.top + plotH}
            className="stroke-foreground/40"
            strokeWidth={1}
          />
        )}
        <path d={path} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p) => (
          <circle
            key={p.date}
            cx={x(dayOf(p.date))}
            cy={y(p.temp)}
            r={hover?.date === p.date ? 5.5 : 4}
            className="fill-accent stroke-surface"
            strokeWidth={2}
          />
        ))}
      </svg>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-sm bg-fertile-soft" aria-hidden /> фертильное окно (прогноз)
        </span>
        {shift && <span>пунктир — линия покрытия</span>}
        {positiveTests.length > 0 && <span>ЛГ+ — положительный тест</span>}
      </p>
    </figure>
  );
}

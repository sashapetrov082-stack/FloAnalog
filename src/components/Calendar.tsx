"use client";

import { useMemo, useState } from "react";
import { dayMarks, monthGrid, type DayMark } from "@/lib/cycle/calendar";
import type { IsoDate } from "@/lib/cycle/dates";
import type { Period, Prediction } from "@/lib/cycle/predict";
import { formatDayMonth, formatMonthTitle } from "@/lib/format";
import { Button } from "./ui";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const markClass: Record<DayMark, string> = {
  period: "bg-period text-white font-semibold",
  "predicted-period": "border-2 border-dashed border-period text-period",
  fertile: "bg-fertile-soft",
  ovulation: "bg-fertile text-white font-semibold",
};

const markLabel: Record<DayMark, string> = {
  period: "месячные",
  "predicted-period": "прогноз месячных",
  fertile: "фертильный день",
  ovulation: "овуляция (прогноз)",
};

export function Calendar({
  periods,
  prediction,
  withdrawal = null,
  takenDates = null,
  today,
  loggedDates,
  selected,
  onSelect,
}: {
  periods: Period[];
  prediction: Prediction | null;
  /** Гормональная контрацепция: прогноз — кровотечение отмены, без фертильных дней. */
  withdrawal?: IsoDate[] | null;
  /** Дни, когда отмечен приём контрацепции. */
  takenDates?: Set<IsoDate> | null;
  today: IsoDate;
  loggedDates: Set<IsoDate>;
  selected: IsoDate | null;
  onSelect: (date: IsoDate) => void;
}) {
  const [view, setView] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const marks = useMemo(
    () => dayMarks(periods, prediction, today, withdrawal),
    [periods, prediction, today, withdrawal],
  );
  const weeks = monthGrid(view.year, view.month);

  const shift = (delta: number) =>
    setView(({ year, month }) => {
      const m = month - 1 + delta;
      return { year: year + Math.floor(m / 12), month: (((m % 12) + 12) % 12) + 1 };
    });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" className="px-3" onClick={() => shift(-1)} aria-label="Предыдущий месяц">
          ‹
        </Button>
        <h2 className="text-lg font-semibold">{formatMonthTitle(view.year, view.month)}</h2>
        <Button variant="ghost" className="px-3" onClick={() => shift(1)} aria-label="Следующий месяц">
          ›
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted" aria-hidden>
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1" role="grid">
        {weeks.flat().map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />;
          const mark = marks.get(date);
          const isToday = date === today;
          const isSelected = date === selected;
          const logged = loggedDates.has(date);
          const taken = takenDates?.has(date) ?? false;
          const markText = mark === "predicted-period" && withdrawal ? "ожидаемое кровотечение отмены" : mark && markLabel[mark];
          const label = `${formatDayMonth(date)}${markText ? `, ${markText}` : ""}${logged ? ", есть записи" : ""}${taken ? ", приём отмечен" : ""}${isToday ? ", сегодня" : ""}`;
          return (
            <button
              key={date}
              type="button"
              aria-label={label}
              aria-pressed={isSelected}
              onClick={() => onSelect(date)}
              className={`relative flex aspect-square items-center justify-center rounded-full text-sm tabular-nums transition ${
                mark ? markClass[mark] : "hover:bg-background"
              } ${isSelected ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface" : ""}`}
            >
              {Number(date.slice(8))}
              {isToday && (
                <span className="absolute inset-0.5 rounded-full border-2 border-foreground/70" aria-hidden />
              )}
              {taken && (
                <span className="absolute right-0.5 top-0 text-[10px] font-bold leading-none text-fertile" aria-hidden>
                  ✓
                </span>
              )}
              {logged && (
                <span
                  className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${
                    mark === "period" || mark === "ovulation" ? "bg-white" : "bg-accent"
                  }`}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-period" /> Месячные
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 border-dashed border-period" />{" "}
          {withdrawal ? "Кровотечение отмены" : "Прогноз"}
        </li>
        {!withdrawal && (
          <>
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-fertile-soft ring-1 ring-fertile" /> Фертильные дни
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-fertile" /> Овуляция
            </li>
          </>
        )}
        {takenDates && (
          <li className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-fertile">✓</span> Приём отмечен
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Есть записи
        </li>
      </ul>
    </div>
  );
}

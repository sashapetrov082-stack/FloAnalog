"use client";

import { useMemo, useState } from "react";
import { METHODS, REGIMENS, type ContraceptionSettings } from "@/lib/cycle/contraception";
import type { IsoDate } from "@/lib/cycle/dates";
import { buildReport } from "@/lib/cycle/report";
import { formatDayMonth } from "@/lib/format";
import type { GuestData } from "@/lib/guest/store";
import { optionLabel } from "@/lib/journal";
import { Button } from "./ui";

const PERIODS = [3, 6, 12] as const;

/** Полная дата для документа: «15.10.2026». */
function dmy(date: IsoDate): string {
  return `${date.slice(8)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
}

function days(n: number | null): string {
  return n === null ? "—" : String(n).replace(".", ",");
}

/**
 * Отчёт для врача. Показывается вместо экранов приложения, чтобы при печати
 * (и сохранении в PDF) на бумагу попадал только он.
 */
export function Report({
  data,
  today,
  contraception,
  onClose,
}: {
  data: GuestData;
  today: IsoDate;
  contraception: ContraceptionSettings | null;
  onClose: () => void;
}) {
  const [months, setMonths] = useState<number>(6);
  const [includeNotes, setIncludeNotes] = useState(false);
  const report = useMemo(
    () => buildReport({ periods: data.periods, dayLogs: data.dayLogs, today, months, includeNotes }),
    [data, today, months, includeNotes],
  );
  const { stats } = report;
  const method =
    contraception && contraception.method !== "none"
      ? [
          METHODS.find((m) => m.id === contraception.method)?.label,
          contraception.method === "pill" && REGIMENS.find((r) => r.id === contraception.regimen)?.label,
        ]
          .filter(Boolean)
          .join(", ")
      : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-16 pt-6 print:max-w-none print:p-0">
      <div className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 print:hidden">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Отчёт для врача</h1>
          <Button variant="ghost" className="px-3" onClick={onClose} aria-label="Закрыть">
            ✕
          </Button>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Период">
          {PERIODS.map((m) => (
            <Button
              key={m}
              role="radio"
              aria-checked={months === m}
              variant={months === m ? "primary" : "secondary"}
              className="px-4"
              onClick={() => setMonths(m)}
            >
              {m === 12 ? "Год" : `${m} мес.`}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={includeNotes}
            onChange={(e) => setIncludeNotes(e.target.checked)}
            className="h-5 w-5 accent-[var(--accent)]"
          />
          <span>Добавить мои личные заметки</span>
        </label>
        <Button onClick={() => window.print()}>Сохранить PDF или распечатать</Button>
        <p className="text-sm text-muted">
          В окне печати выберите «Сохранить как PDF». На iPhone: «Поделиться» → «Напечатать», затем снова
          «Поделиться» — сохранить в «Файлы» или отправить.
        </p>
      </div>

      <article className="report flex flex-col gap-5 rounded-3xl border border-border bg-surface p-5 text-sm print:rounded-none print:border-0 print:p-0">
        <header>
          <h2 className="text-xl font-semibold">Менструальный цикл: отметки за период</h2>
          <p className="text-muted">
            {dmy(report.from)} — {dmy(report.to)}. Составлено {dmy(today)} в приложении «Трекер цикла».
          </p>
        </header>

        <section>
          <h3 className="mb-2 font-semibold">Кратко</h3>
          <table className="w-full border-collapse">
            <tbody>
              <Row label="Отмечено месячных" value={String(report.cycles.length)} />
              <Row
                label="Средняя длина цикла"
                value={
                  stats.avgCycle === null
                    ? "недостаточно данных"
                    : `${days(stats.avgCycle)} дн. (от ${stats.minCycle} до ${stats.maxCycle}, циклов: ${stats.cycleCount})`
                }
              />
              <Row label="Средняя длина месячных" value={stats.avgPeriod === null ? "—" : `${days(stats.avgPeriod)} дн.`} />
              <Row label="Дней с записями о самочувствии" value={String(report.loggedDays)} />
              {method && (
                <Row
                  label="Контрацепция"
                  value={`${method}${contraception?.startDate ? `, текущая схема с ${dmy(contraception.startDate)}` : ""}`}
                />
              )}
            </tbody>
          </table>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Циклы</h3>
          {report.cycles.length === 0 ? (
            <p className="text-muted">За этот период месячные не отмечены.</p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="py-1 pr-2 font-normal">Начало месячных</th>
                  <th className="py-1 pr-2 font-normal">Длительность</th>
                  <th className="py-1 pr-2 font-normal">Выделения (макс.)</th>
                  <th className="py-1 font-normal">Длина цикла</th>
                </tr>
              </thead>
              <tbody>
                {report.cycles.map((c) => (
                  <tr key={c.start} className="border-b border-border">
                    <td className="py-1 pr-2 tabular-nums">{dmy(c.start)}</td>
                    <td className="py-1 pr-2">{c.periodDays === null ? "конец не отмечен" : `${c.periodDays} дн.`}</td>
                    <td className="py-1 pr-2">{c.heaviestFlow ? optionLabel(c.heaviestFlow) : "—"}</td>
                    <td className="py-1">
                      {c.cycleDays === null ? "текущий" : `${c.cycleDays} дн.`}
                      {c.unusual && " *"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {report.cycles.some((c) => c.unusual) && (
            <p className="mt-1 text-muted">* Вне 15–60 дней — возможно, пропущена отметка; в средние не входит.</p>
          )}
        </section>

        <CountSection title="Симптомы" items={report.symptoms} empty="Симптомы за этот период не отмечены." />
        <CountSection title="Настроение" items={report.moods} empty="Настроение за этот период не отмечено." />

        {includeNotes && (
          <section>
            <h3 className="mb-2 font-semibold">Заметки</h3>
            {report.notes.length === 0 ? (
              <p className="text-muted">Заметок за этот период нет.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {report.notes.map((n) => (
                  <li key={n.date}>
                    <span className="text-muted">{formatDayMonth(n.date)}:</span>{" "}
                    <span className="whitespace-pre-wrap">{n.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <footer className="border-t border-border pt-3 text-xs text-muted">
          Данные внесены пользовательницей вручную. Отчёт не содержит прогнозов и не является медицинским
          заключением.
        </footer>
      </article>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-border">
      <td className="py-1 pr-3 text-muted">{label}</td>
      <td className="py-1">{value}</td>
    </tr>
  );
}

function CountSection({ title, items, empty }: { title: string; items: { id: string; days: number }[]; empty: string }) {
  return (
    <section>
      <h3 className="mb-2 font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        <table className="w-full border-collapse text-left">
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-b border-border">
                <td className="py-1 pr-3">{optionLabel(s.id)}</td>
                <td className="py-1 tabular-nums text-muted">
                  {s.days} дн.
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

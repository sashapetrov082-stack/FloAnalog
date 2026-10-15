"use client";

import { useState } from "react";
import type { IsoDate } from "@/lib/cycle/dates";
import { formatGestation, gestation } from "@/lib/cycle/pregnancy";
import { formatDayMonth, pluralDays } from "@/lib/format";
import { PARTNER_TIPS, URGENT_SIGNS, weekInfo, weekTips } from "@/lib/pregnancy-weeks";
import { Card } from "./ui";

const TRIMESTER = { 1: "Первый триместр", 2: "Второй триместр", 3: "Третий триместр" } as const;

function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Пройдено до даты родов">
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, value * 100)}%` }} />
    </div>
  );
}

function dueText(daysLeft: number, due: IsoDate): string {
  if (daysLeft > 0) return `${formatDayMonth(due)} · через ${pluralDays(daysLeft)}`;
  if (daysLeft === 0) return `${formatDayMonth(due)} · сегодня`;
  return `${formatDayMonth(due)} · прошла ${pluralDays(-daysLeft)} назад`;
}

/** Карточки режима беременности на вкладке «Сегодня». */
export function PregnancyToday({ lmp, today }: { lmp: IsoDate | null; today: IsoDate }) {
  const [urgentOpen, setUrgentOpen] = useState(false);
  const g = lmp ? gestation(lmp, today) : null;
  if (!g) {
    return (
      <Card>
        <p className="text-base">
          Укажите в «Настройках» → «Цель» первый день последних месячных или дату родов, которую назвал врач, — и мы
          покажем срок.
        </p>
      </Card>
    );
  }
  const info = weekInfo(g.currentWeek);
  const tips = weekTips(g.currentWeek);
  return (
    <>
      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-muted">Срок беременности</p>
          <p className="text-4xl font-semibold tabular-nums">{formatGestation(g.weeks, g.days)}</p>
          <p className="mt-1 text-base font-medium text-accent">
            {g.currentWeek}-я неделя · {TRIMESTER[g.trimester]}
          </p>
        </div>
        <Progress value={g.progress} />
        <dl className="grid gap-1 text-sm">
          <dt className="text-muted">Предполагаемая дата родов</dt>
          <dd className="text-base font-medium">{dueText(g.daysLeft, g.dueDate)}</dd>
        </dl>
      </Card>

      {info && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{g.currentWeek}-я неделя</h2>
          <p className="text-sm">
            <span className="text-muted">Размер: </span>
            {info.size}
          </p>
          <p className="text-base">{info.baby}</p>
          {tips.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">
            Общая информация — у каждой беременности свой темп. Она не заменяет консультацию врача, который ведёт вашу
            беременность.
          </p>
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <button
          type="button"
          aria-expanded={urgentOpen}
          onClick={() => setUrgentOpen(!urgentOpen)}
          className="flex items-center justify-between gap-2 text-left text-lg font-semibold"
        >
          Когда срочно к врачу
          <span aria-hidden className="text-muted">
            {urgentOpen ? "−" : "+"}
          </span>
        </button>
        {urgentOpen && (
          <>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {URGENT_SIGNS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="text-sm text-warning">
              При любом из этих признаков обратитесь к врачу сразу или вызовите скорую — не ждите планового приёма.
            </p>
          </>
        )}
      </Card>
    </>
  );
}

/** Что видит партнёр, если владелица разрешила. */
export function PartnerPregnancy({ lmp, today, name }: { lmp: IsoDate; today: IsoDate; name: string }) {
  const g = gestation(lmp, today);
  if (!g) return null;
  const info = weekInfo(g.currentWeek);
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="text-sm text-muted">Беременность</p>
        <p className="text-3xl font-semibold tabular-nums">{formatGestation(g.weeks, g.days)}</p>
        <p className="mt-1 text-base font-medium text-accent">
          {g.currentWeek}-я неделя · {TRIMESTER[g.trimester]}
        </p>
      </div>
      <Progress value={g.progress} />
      <p className="text-sm">
        <span className="text-muted">Предполагаемая дата родов: </span>
        {dueText(g.daysLeft, g.dueDate)}
      </p>
      {info && (
        <p className="text-sm">
          <span className="text-muted">Размер малыша: </span>
          {info.size}. {info.baby}
        </p>
      )}
      <p className="rounded-2xl bg-period-soft p-3 text-sm">{PARTNER_TIPS[g.trimester]}</p>
      <p className="text-xs text-muted">{name} решает, что вам показывать; срок считается автоматически.</p>
    </Card>
  );
}

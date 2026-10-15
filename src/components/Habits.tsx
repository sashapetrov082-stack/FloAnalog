"use client";

import { useMemo, useState } from "react";
import { addDays, compareDates, type IsoDate } from "@/lib/cycle/dates";
import { formatDayMonth, formatMonthTitle } from "@/lib/format";
import type { GuestData } from "@/lib/guest/store";
import {
  HABIT_EMOJIS,
  HABIT_NAME_MAX,
  HABIT_TEMPLATES,
  habitMonthStats,
  isChecked,
  MAX_HABITS,
  monthSummary,
  moveHabit,
  removeHabit,
  sortHabits,
  streak,
  toggleCheck,
  type Habit,
  type HabitChecks,
} from "@/lib/habits";
import { Button, Card } from "./ui";

const WEEKDAY = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function weekday(date: IsoDate): string {
  // 1 января 2024 — понедельник.
  const d = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse("2024-01-01T00:00:00Z")) / 86_400_000);
  return WEEKDAY[((d % 7) + 7) % 7];
}

function pct(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

/** Цвет прогресса к цели: достигнута, половина, меньше половины. */
function progressClass(ratio: number): string {
  return ratio >= 1 ? "bg-fertile" : ratio >= 0.5 ? "bg-warning/60" : "bg-period/50";
}

const WEEK_TINT = ["bg-period-soft/60", "bg-fertile-soft/60"];

function newId(): string {
  return crypto.randomUUID();
}

export function HabitsTab({ data, today, onChange }: { data: GuestData; today: IsoDate; onChange: (d: GuestData) => void }) {
  const habits = useMemo(() => sortHabits(data.habits ?? []), [data.habits]);
  const checks = useMemo(() => data.habitChecks ?? {}, [data.habitChecks]);
  const [view, setView] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [day, setDay] = useState<IsoDate>(today);
  const [editing, setEditing] = useState(false);
  const [bar, setBar] = useState<IsoDate | null>(null);

  const save = (next: { habits?: Habit[]; checks?: HabitChecks }) =>
    onChange({ ...data, habits: next.habits ?? habits, habitChecks: next.checks ?? checks });
  const toggle = (date: IsoDate, id: string) => {
    if (compareDates(date, today) > 0) return;
    save({ checks: toggleCheck(checks, date, id) });
  };
  const summary = useMemo(
    () => monthSummary(habits, checks, view.year, view.month, today),
    [habits, checks, view, today],
  );
  const shift = (delta: number) =>
    setView(({ year, month }) => {
      const m = month - 1 + delta;
      return { year: year + Math.floor(m / 12), month: (((m % 12) + 12) % 12) + 1 };
    });

  if (editing || habits.length === 0) {
    return (
      <HabitEditor
        habits={habits}
        onSave={(next, removed) => {
          let c = checks;
          let h = next;
          for (const id of removed) ({ habits: h, checks: c } = removeHabit(h, c, id));
          save({ habits: h, checks: c });
          setEditing(false);
        }}
        onCancel={habits.length ? () => setEditing(false) : null}
      />
    );
  }

  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const barDay = bar ? summary.days.find((d) => d.date === bar) : null;

  return (
    <>
      <header className="flex items-end justify-between gap-2">
        <div>
          <p className="text-sm text-muted">Привычки</p>
          <h1 className="text-2xl font-semibold">Отметки за день</h1>
        </div>
        <Button variant="ghost" className="px-3" onClick={() => setEditing(true)}>
          Изменить
        </Button>
      </header>

      <Card className="flex flex-col gap-3">
        <div className="flex gap-1.5" role="radiogroup" aria-label="День">
          {week.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={d === day}
              aria-label={formatDayMonth(d)}
              onClick={() => setDay(d)}
              className={`flex flex-1 flex-col items-center rounded-2xl py-1.5 text-xs ${
                d === day ? "bg-accent text-accent-foreground" : "bg-background text-muted"
              }`}
            >
              <span>{weekday(d)}</span>
              <span className="text-base font-semibold tabular-nums">{Number(d.slice(8))}</span>
            </button>
          ))}
        </div>
        <ul className="flex flex-col">
          {habits.map((h) => {
            const done = isChecked(checks, day, h.id);
            const s = streak(checks, h.id, today);
            return (
              <li key={h.id} className="border-b border-border last:border-0">
                <button
                  type="button"
                  aria-pressed={done}
                  onClick={() => toggle(day, h.id)}
                  className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
                >
                  <span className="text-xl" aria-hidden>
                    {h.emoji || "✅"}
                  </span>
                  <span className="flex-1">
                    <span className="block text-base">{h.name}</span>
                    {s > 1 && <span className="block text-xs text-muted">серия {s} дн. 🔥</span>}
                  </span>
                  <span
                    aria-hidden
                    className={`flex h-8 w-8 items-center justify-center rounded-xl border-2 text-lg font-bold transition ${
                      done ? "border-accent bg-accent text-accent-foreground" : "border-border"
                    }`}
                  >
                    {done ? "✓" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" className="px-3" onClick={() => shift(-1)} aria-label="Предыдущий месяц">
            ‹
          </Button>
          <div className="text-center">
            <h2 className="text-lg font-semibold">{formatMonthTitle(view.year, view.month)}</h2>
            <p className="text-sm text-muted">выполнено {pct(summary.percent)}</p>
          </div>
          <Button variant="ghost" className="px-3" onClick={() => shift(1)} aria-label="Следующий месяц">
            ›
          </Button>
        </div>

        {/* Процент выполненного по дням; дни на 100% — зелёные с огоньком. */}
        <figure className="flex flex-col gap-1">
          <figcaption className="h-5 text-center text-sm tabular-nums text-muted" aria-live="polite">
            {barDay ? `${formatDayMonth(barDay.date)} · ${pct(barDay.percent)}` : "Нажмите на столбик, чтобы увидеть день"}
          </figcaption>
          <div className="flex h-24 items-end gap-[2px] border-b border-border" role="group" aria-label="Выполнение по дням">
            {summary.days.map((d) => (
              <button
                key={d.date}
                type="button"
                aria-label={`${formatDayMonth(d.date)}: ${pct(d.percent)}`}
                onClick={() => setBar(d.date === bar ? null : d.date)}
                className="relative flex h-full flex-1 flex-col justify-end"
              >
                {d.percent === 1 && (
                  <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[9px]" aria-hidden>
                    🔥
                  </span>
                )}
                <span
                  className={`block w-full rounded-t-[3px] ${
                    d.percent === 1 ? "bg-fertile" : "bg-period/45"
                  } ${d.date === bar ? "outline outline-2 outline-foreground/60" : ""}`}
                  style={{ height: `${Math.max(d.percent ? 4 : 0, (d.percent ?? 0) * 84)}%` }}
                />
              </button>
            ))}
          </div>
        </figure>

        <ul className="flex flex-wrap gap-1.5 text-xs">
          {summary.weeks.map((w, i) => (
            <li key={w.index} className={`rounded-full px-2.5 py-1 ${WEEK_TINT[i % 2]}`}>
              {w.index} нед. · {pct(w.percent)}
            </li>
          ))}
        </ul>

        <MonthGrid habits={habits} checks={checks} days={summary.days.map((d) => d.date)} today={today} onToggle={toggle} />

        <ul className="flex flex-col gap-3">
          {habits.map((h) => {
            const s = habitMonthStats(h, checks, view.year, view.month, today);
            return (
              <li key={h.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span>
                    {h.emoji} {h.name}
                  </span>
                  <span className="tabular-nums text-muted">
                    {s.done}/{s.goal} · {Math.round(s.ratio * 100)}%{s.streak > 1 ? ` · серия ${s.streak}` : ""}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                  <div className={`h-full rounded-full ${progressClass(s.ratio)}`} style={{ width: `${Math.min(100, s.ratio * 100)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

/** Таблица месяца как в Excel: привычки по строкам, дни по столбцам. Листается вбок, названия на месте. */
function MonthGrid({
  habits,
  checks,
  days,
  today,
  onToggle,
}: {
  habits: Habit[];
  checks: HabitChecks;
  days: IsoDate[];
  today: IsoDate;
  onToggle: (date: IsoDate, id: string) => void;
}) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface" />
            {days.map((d, i) => (
              <th
                key={d}
                className={`px-0.5 pb-1 font-normal ${WEEK_TINT[Math.floor(i / 7) % 2]} ${i === 0 ? "rounded-tl-lg" : ""}`}
              >
                <span className={`block tabular-nums ${d === today ? "font-bold text-accent" : ""}`}>{Number(d.slice(8))}</span>
                <span className="block text-[10px] text-muted">{weekday(d)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {habits.map((h) => (
            <tr key={h.id}>
              <th
                scope="row"
                className="sticky left-0 z-10 max-w-28 truncate bg-surface pr-2 text-left font-normal"
                title={h.name}
              >
                {h.emoji} {h.name}
              </th>
              {days.map((d, i) => {
                const done = isChecked(checks, d, h.id);
                const future = compareDates(d, today) > 0;
                return (
                  <td key={d} className={`p-0.5 ${WEEK_TINT[Math.floor(i / 7) % 2]}`}>
                    <button
                      type="button"
                      disabled={future}
                      aria-pressed={done}
                      aria-label={`${h.name}, ${formatDayMonth(d)}`}
                      onClick={() => onToggle(d, h.id)}
                      className={`flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-bold ${
                        done ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"
                      } ${future ? "opacity-40" : ""}`}
                    >
                      {done ? "✓" : ""}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Список привычек: добавить, переименовать, цель, порядок, удалить. */
function HabitEditor({
  habits,
  onSave,
  onCancel,
}: {
  habits: Habit[];
  onSave: (habits: Habit[], removed: string[]) => void;
  onCancel: (() => void) | null;
}) {
  const [list, setList] = useState<Habit[]>(habits);
  const [removed, setRemoved] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const full = list.length >= MAX_HABITS;
  const add = (h: { name: string; emoji: string; goal: number }) =>
    !full && setList([...list, { id: newId(), ...h, position: list.length }]);
  const update = (id: string, patch: Partial<Habit>) => setList(list.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  const unused = HABIT_TEMPLATES.filter((t) => !list.some((h) => h.name === t.name));
  const valid = list.every((h) => h.name.trim().length > 0);

  return (
    <>
      <header>
        <p className="text-sm text-muted">Привычки</p>
        <h1 className="text-2xl font-semibold">{habits.length ? "Мои привычки" : "Трекер привычек"}</h1>
      </header>
      {habits.length === 0 && list.length === 0 && (
        <p className="text-base text-muted">
          Отмечайте каждый день, что получилось, — и смотрите прогресс за месяц. Начните с готовых или добавьте свою.
        </p>
      )}

      {list.length > 0 && (
        <Card className="flex flex-col gap-4">
          {sortHabits(list).map((h, i, arr) => (
            <div key={h.id} className="flex flex-col gap-2 border-b border-border pb-4 last:border-0 last:pb-0">
              <div className="flex items-center gap-2">
                <select
                  aria-label="Значок"
                  value={h.emoji}
                  onChange={(e) => update(h.id, { emoji: e.target.value })}
                  className="h-11 rounded-xl border border-border bg-surface px-1 text-xl"
                >
                  {[...new Set([h.emoji, ...HABIT_EMOJIS])].filter(Boolean).map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Название"
                  value={h.name}
                  maxLength={HABIT_NAME_MAX}
                  onChange={(e) => update(h.id, { name: e.target.value })}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-base"
                />
              </div>
              <div className="flex items-center gap-2" role="group" aria-label={`Цель: ${h.name}`}>
                <span className="text-sm text-muted">Цель</span>
                <button
                  type="button"
                  className="h-9 w-9 rounded-xl border border-border bg-surface text-lg disabled:opacity-40"
                  aria-label="Меньше"
                  disabled={h.goal <= 1}
                  onClick={() => update(h.id, { goal: h.goal - 1 })}
                >
                  −
                </button>
                <span className="w-7 text-center text-base font-semibold tabular-nums">{h.goal}</span>
                <button
                  type="button"
                  className="h-9 w-9 rounded-xl border border-border bg-surface text-lg disabled:opacity-40"
                  aria-label="Больше"
                  disabled={h.goal >= 31}
                  onClick={() => update(h.id, { goal: h.goal + 1 })}
                >
                  +
                </button>
                <span className="text-sm text-muted">раз в месяц</span>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" className="px-3" disabled={i === 0} onClick={() => setList(moveHabit(list, h.id, -1))} aria-label="Выше">
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  className="px-3"
                  disabled={i === arr.length - 1}
                  onClick={() => setList(moveHabit(list, h.id, 1))}
                  aria-label="Ниже"
                >
                  ↓
                </Button>
                <div className="flex-1" />
                {confirmDelete === h.id ? (
                  <Button
                    variant="danger"
                    onClick={() => {
                      setList(list.filter((x) => x.id !== h.id));
                      if (habits.some((x) => x.id === h.id)) setRemoved([...removed, h.id]);
                      setConfirmDelete(null);
                    }}
                  >
                    Удалить с отметками
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setConfirmDelete(h.id)}>
                    Удалить
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Добавить</h2>
        {full ? (
          <p className="text-sm text-muted">Можно вести до {MAX_HABITS} привычек.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {unused.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => add(t)}
                  className="min-h-10 rounded-full border border-border bg-surface px-3 py-2 text-sm hover:bg-background"
                >
                  {t.emoji} {t.name}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => add({ name: "Новая привычка", emoji: "✅", goal: 31 })}>
              + Своя привычка
            </Button>
          </>
        )}
      </Card>

      <div className="flex gap-2">
        <Button className="flex-1" disabled={!valid || list.length === 0} onClick={() => onSave(list.map((h) => ({ ...h, name: h.name.trim() })), removed)}>
          Сохранить
        </Button>
        {onCancel && (
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Отмена
          </Button>
        )}
      </div>
    </>
  );
}

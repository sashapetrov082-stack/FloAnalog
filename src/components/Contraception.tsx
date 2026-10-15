"use client";

import { useCallback, useEffect, useState } from "react";
import {
  describeScheme,
  isHormonalCycleControl,
  METHODS,
  REGIMENS,
  schemeDay,
  type Action,
  type ContraceptionSettings,
  type Method,
} from "@/lib/cycle/contraception";
import { addDays, compareDates, type IsoDate } from "@/lib/cycle/dates";
import {
  deviceTimezone,
  getContraception,
  listTaken,
  NO_CONTRACEPTION,
  saveContraception,
  setTaken,
  type ContraceptionConfig,
} from "@/lib/contraception";
import { formatDayMonth, formatRange } from "@/lib/format";
import { getPushState } from "@/lib/push";
import { getSupabase } from "@/lib/supabase/client";
import { Button, Card, Toggle } from "./ui";

export interface ContraceptionState {
  /** null — ещё загружается (или нет связи). */
  config: ContraceptionConfig | null;
  taken: Set<IsoDate>;
  save: (config: ContraceptionConfig) => Promise<void>;
  setTakenOn: (date: IsoDate, taken: boolean) => Promise<void>;
}

/** Контрацепция владелицы: настройки и отметки за последние два месяца. Только для аккаунта. */
export function useContraception(userId: string | null, today: IsoDate): ContraceptionState {
  const [config, setConfig] = useState<ContraceptionConfig | null>(null);
  const [taken, setTakenSet] = useState<Set<IsoDate>>(new Set());

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !userId) return;
    let cancelled = false;
    Promise.all([getContraception(sb), listTaken(sb, addDays(today, -62), addDays(today, 1))]).then(
      ([c, dates]) => {
        if (cancelled) return;
        setConfig(c);
        setTakenSet(new Set(dates));
      },
      () => undefined, // нет связи — карточки просто не покажутся
    );
    return () => {
      cancelled = true;
    };
  }, [userId, today]);

  const save = useCallback(
    async (next: ContraceptionConfig) => {
      const sb = getSupabase();
      if (!sb || !userId) return;
      await saveContraception(sb, userId, next);
      setConfig(next);
    },
    [userId],
  );

  const setTakenOn = useCallback(
    async (date: IsoDate, value: boolean) => {
      const sb = getSupabase();
      if (!sb || !userId) return;
      const update = (s: Set<IsoDate>) => {
        const next = new Set(s);
        if (value) next.add(date);
        else next.delete(date);
        return next;
      };
      setTakenSet(update);
      try {
        await setTaken(sb, userId, date, value);
      } catch (e) {
        setTakenSet((s) => {
          const back = new Set(s);
          if (value) back.delete(date);
          else back.add(date);
          return back;
        });
        throw e;
      }
    },
    [userId],
  );

  return { config: userId ? config : null, taken, save, setTakenOn };
}

const DONE_LABEL: Record<Action, string> = {
  take_pill: "Принята",
  insert_ring: "Кольцо вставлено",
  remove_ring: "Кольцо снято",
  apply_patch: "Пластырь наклеен",
  remove_patch: "Пластырь снят",
};

const TODO_LABEL: Record<Action, string> = {
  take_pill: "Сегодня — таблетка",
  insert_ring: "Сегодня — вставить новое кольцо",
  remove_ring: "Сегодня — снять кольцо, начинается перерыв",
  apply_patch: "Сегодня — наклеить новый пластырь",
  remove_patch: "Сегодня — снять пластырь, начинается перерыв",
};

function newCycleText(s: ContraceptionSettings, date: IsoDate, today: IsoDate): string {
  const when = date === addDays(today, 1) ? "завтра" : formatDayMonth(date);
  if (s.method === "pill") return `Новая упаковка — ${when}`;
  if (s.method === "ring") return `Новое кольцо — ${when}`;
  return `Новый пластырь — ${when}`;
}

/** Следующее действие с кольцом или пластырем, если сегодня ничего делать не нужно. */
function nextActionText(s: ContraceptionSettings, day: number, today: IsoDate): string | null {
  if (s.method === "ring") return `Снять кольцо — ${formatDayMonth(addDays(today, 22 - day))}`;
  if (s.method === "patch") {
    const next = [8, 15, 22].find((d) => d > day);
    if (!next) return null;
    return `${next === 22 ? "Снять пластырь" : "Сменить пластырь"} — ${formatDayMonth(addDays(today, next - day))}`;
  }
  return null;
}

/** Карточка на вкладке «Сегодня». */
export function ContraceptionToday({ state, today }: { state: ContraceptionState; today: IsoDate }) {
  const [error, setError] = useState<string | null>(null);
  const c = state.config;
  if (!c || c.method === "none" || !c.startDate) return null;

  const info = schemeDay(c, today);
  const hormonal = isHormonalCycleControl(c);
  const takenToday = state.taken.has(today);
  const yesterday = addDays(today, -1);
  const missedYesterday =
    c.method === "pill" && !!schemeDay(c, yesterday)?.actions.includes("take_pill") && !state.taken.has(yesterday);

  const mark = async (date: IsoDate, value: boolean) => {
    setError(null);
    try {
      await state.setTakenOn(date, value);
    } catch {
      setError("Не получилось сохранить отметку. Проверьте интернет и попробуйте ещё раз.");
    }
  };

  if (!info) {
    return (
      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Контрацепция</h2>
        <p className="text-sm text-muted">Схема начнётся {formatDayMonth(c.startDate)}.</p>
      </Card>
    );
  }

  const action = info.actions[0] ?? null;
  const withdrawalFrom = info.nextBreakStart && addDays(info.nextBreakStart, 1);
  const withdrawalTo = info.nextBreakStart && addDays(info.nextBreakStart, Math.min(4, info.breakTotal));

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="text-sm text-muted">Контрацепция</p>
        <p className="text-2xl font-semibold">{describeScheme(c, info)}</p>
      </div>

      {action && (
        <>
          <p className="text-base">{TODO_LABEL[action]}</p>
          {takenToday ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-fertile-soft p-3">
              <span className="font-medium">✓ {DONE_LABEL[action]}</span>
              <Button variant="ghost" className="px-3" onClick={() => mark(today, false)}>
                Отменить
              </Button>
            </div>
          ) : (
            <Button onClick={() => mark(today, true)}>{DONE_LABEL[action]}</Button>
          )}
        </>
      )}

      {missedYesterday && (
        <div className="flex flex-col gap-2 rounded-2xl bg-warning-soft p-3 text-sm text-warning" role="note">
          <p>
            Вчера таблетка не отмечена. Если приём пропущен — посмотрите, что советует инструкция к вашим таблеткам,
            или спросите врача.
          </p>
          <button
            type="button"
            className="self-start underline underline-offset-2"
            onClick={() => mark(yesterday, true)}
          >
            Я приняла, просто не отметила
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-1 text-sm text-muted">
        {info.phase === "break" ? (
          <>
            <li>{newCycleText(c, info.nextCycleStart, today)}</li>
            {hormonal && <li>В перерыв обычно бывает кровотечение отмены.</li>}
          </>
        ) : (
          <>
            {!action && nextActionText(c, info.day, today) && <li>{nextActionText(c, info.day, today)}</li>}
            {info.nextBreakStart && c.method === "pill" && (
              <li>Перерыв — с {formatDayMonth(info.nextBreakStart)}</li>
            )}
            {hormonal && withdrawalFrom && withdrawalTo && (
              <li>Кровотечение отмены ожидается примерно {formatRange(withdrawalFrom, withdrawalTo)}</li>
            )}
          </>
        )}
        {hormonal && <li>Фертильное окно и овуляцию при этом методе не показываем.</li>}
      </ul>
      {error && <p className="text-sm text-warning">{error}</p>}
    </Card>
  );
}

const START_LABEL: Record<Exclude<Method, "none">, string> = {
  pill: "Первый день текущей упаковки",
  ring: "День, когда вставлено текущее кольцо",
  patch: "День, когда наклеен первый пластырь цикла",
};

/** Настройка метода и напоминаний. */
export function ContraceptionSettingsCard({ state, today }: { state: ContraceptionState; today: IsoDate }) {
  const [draft, setDraft] = useState<ContraceptionConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pushOn, setPushOn] = useState<boolean | null>(null);

  useEffect(() => {
    getPushState().then((s) => setPushOn(s === "on"), () => setPushOn(false));
  }, []);

  if (!state.config) return null;
  const form = draft ?? state.config;
  const set = (patch: Partial<ContraceptionConfig>) => {
    setMessage(null);
    setDraft({ ...form, ...patch });
  };
  const changed = draft !== null && JSON.stringify(draft) !== JSON.stringify(state.config);
  const valid =
    form.method === "none" ||
    (!!form.startDate && compareDates(form.startDate, today) <= 0 && (form.method !== "pill" || !!form.regimen));

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = form.method === "none" ? { ...NO_CONTRACEPTION, reminderTime: form.reminderTime } : form;
      await state.save({ ...next, timezone: deviceTimezone() });
      setDraft(null);
      setMessage({ ok: true, text: "Сохранено" });
    } catch {
      setMessage({ ok: false, text: "Не получилось сохранить. Проверьте интернет и попробуйте ещё раз." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Контрацепция</h2>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Метод">
        {METHODS.map((m) => (
          <Button
            key={m.id}
            role="radio"
            aria-checked={form.method === m.id}
            variant={form.method === m.id ? "primary" : "secondary"}
            className="px-4"
            onClick={() =>
              set({
                method: m.id,
                regimen: m.id === "pill" ? (form.regimen ?? "21_7") : null,
                startDate: m.id === "none" ? null : (form.startDate ?? today),
              })
            }
          >
            {m.label}
          </Button>
        ))}
      </div>

      {form.method === "pill" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-muted">Схема приёма — как в инструкции к вашим таблеткам</legend>
          {REGIMENS.map((r) => (
            <label key={r.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-3">
              <input
                type="radio"
                name="regimen"
                className="mt-1 accent-[var(--accent)]"
                checked={form.regimen === r.id}
                onChange={() => set({ regimen: r.id })}
              />
              <span>
                <span className="block font-medium">{r.label}</span>
                <span className="block text-sm text-muted">{r.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {form.method !== "none" && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">{START_LABEL[form.method]}</span>
            <input
              type="date"
              value={form.startDate ?? ""}
              max={today}
              onChange={(e) => set({ startDate: e.target.value || null })}
              className="rounded-2xl border border-border bg-surface px-4 py-3 text-base"
            />
          </label>

          <Toggle label="Напоминать" checked={form.remindersOn} onChange={(remindersOn) => set({ remindersOn })} />
          {form.remindersOn && (
            <>
              <label className="flex items-center justify-between gap-4">
                <span>Время</span>
                <input
                  type="time"
                  value={form.reminderTime}
                  onChange={(e) => e.target.value && set({ reminderTime: e.target.value })}
                  className="rounded-2xl border border-border bg-surface px-4 py-2 text-base"
                />
              </label>
              <p className="text-sm text-muted">
                {form.method === "pill"
                  ? "Напомним в это время, а если таблетка не отмечена — ещё раз через час."
                  : "Напомним в дни, когда нужно вставить или снять кольцо, сменить пластырь."}{" "}
                Текст уведомления нейтральный — «Ежедневное напоминание».
              </p>
              {pushOn === false && (
                <p className="text-sm text-warning">Чтобы напоминания приходили, включите уведомления выше.</p>
              )}
            </>
          )}
        </>
      )}

      {changed && (
        <Button disabled={busy || !valid} onClick={submit}>
          Сохранить
        </Button>
      )}
      {message && (
        <p className={`text-sm ${message.ok ? "text-fertile" : "text-warning"}`} role="status">
          {message.text}
        </p>
      )}
      <p className="text-sm text-muted">
        Приложение помогает не забыть о приёме, но не заменяет инструкцию к препарату и консультацию врача.
      </p>
    </Card>
  );
}

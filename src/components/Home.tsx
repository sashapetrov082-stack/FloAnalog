"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { isHormonalCycleControl, withdrawalDays } from "@/lib/cycle/contraception";
import { addDays, compareDates, diffDays, type IsoDate } from "@/lib/cycle/dates";
import { dueDate, lmpFromDueDate } from "@/lib/cycle/pregnancy";
import {
  findPeriodAt,
  markPeriodEnd,
  markPeriodStart,
  ongoingPeriod,
  periodEnd,
  removePeriod,
  askIfStillGoing,
  flowDaysOf,
} from "@/lib/cycle/periods";
import { predict, type Phase, type Prediction, type Warning } from "@/lib/cycle/predict";
import type { GuestData } from "@/lib/guest/store";
import { formatDayMonth, formatLong, formatRange, pluralDays } from "@/lib/format";
import { emptyLog, FLOW_LEVELS, setDayLog, summarizeLog, type DayLog, type FlowLevel } from "@/lib/journal";
import { exportContraception } from "@/lib/contraception";
import { getMyLinks } from "@/lib/pair";
import { getSupabase } from "@/lib/supabase/client";
import { Calendar } from "./Calendar";
import { ConceptionCard } from "./Conception";
import { PregnancyToday } from "./Pregnancy";
import { ContraceptionSettingsCard, ContraceptionToday, useContraception, type ContraceptionState } from "./Contraception";
import { DayLogEditor } from "./DayLogEditor";
import { ImportDialog } from "./ImportDialog";
import { DrawingsTab } from "./Drawings";
import { HabitsTab } from "./Habits";
import { PairTab } from "./PairTab";
import { PushCard } from "./PushCard";
import { Report } from "./Report";
import { StatusCard } from "./StatusCard";
import type { SyncStatus } from "./useCycleData";
import { Button, Card, Disclaimer, Stepper } from "./ui";

type Tab = "today" | "calendar" | "habits" | "pair" | "drawings" | "settings";
type PairRole = "owner" | "partner" | null;

export interface PinControl {
  enabled: boolean;
  onSetup: (mode: "enable" | "change" | "disable") => void;
}

export interface AccountInfo {
  userId: string;
  email: string;
  sync: SyncStatus;
  onSignOut: () => Promise<void>;
  onDelete: () => Promise<void>;
  onRetry: () => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Сегодня" },
  { id: "calendar", label: "Календарь" },
  { id: "habits", label: "Привычки" },
  { id: "pair", label: "Пара" },
  { id: "drawings", label: "Рисунки" },
  { id: "settings", label: "Настройки" },
];

/** Иконки вкладок: линии 24×24, цвет — от текста кнопки. */
function TabIcon({ tab, active }: { tab: Tab; active: boolean }) {
  const shapes: Record<Tab, ReactNode> = {
    today: <path d="M12 3c3.6 4.5 6 7.8 6 10.6a6 6 0 0 1-12 0C6 10.8 8.4 7.5 12 3z" />,
    calendar: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>
    ),
    habits: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <path d="M8 12.3l2.8 2.8L16.3 9.5" />
      </>
    ),
    pair: <path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" />,
    drawings: <path d="M4.5 19.5l4.3-1 10-10a2.2 2.2 0 0 0-3.1-3.1l-10 10-1.2 4.1zM14 7l3 3" />,
    settings: (
      <>
        <path d="M4 7h9M18 7h2M4 17h3M12 17h8" />
        <circle cx="15.5" cy="7" r="2.5" />
        <circle cx="9.5" cy="17" r="2.5" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[26px] w-[26px]"
      fill={active ? "currentColor" : "none"}
      fillOpacity={0.15}
      stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {shapes[tab]}
    </svg>
  );
}

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

export function Home({
  data,
  today,
  onChange,
  onReset,
  account,
  onSignIn,
  pin,
}: {
  data: GuestData;
  today: IsoDate;
  onChange: (data: GuestData) => void;
  onReset: () => void;
  account: AccountInfo | null;
  onSignIn: (() => void) | null;
  pin: PinControl;
}) {
  const { periods, settings, dayLogs } = data;
  const [tab, setTab] = useState<Tab>(() => {
    // Партнёр, вошедший через «Я партнёр — у меня есть код», сразу попадает во вкладку «Пара».
    if (typeof window === "undefined") return "today";
    const start = sessionStorage.getItem("start-tab");
    if (start === "pair") {
      sessionStorage.removeItem("start-tab");
      return "pair";
    }
    // Переход из уведомления: /?tab=pair и т. п.
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("tab");
    if (fromUrl) {
      url.searchParams.delete("tab");
      window.history.replaceState(null, "", url.toString());
    }
    return TABS.some((t) => t.id === fromUrl) ? (fromUrl as Tab) : "today";
  });
  // Роль в паре. Партнёру не нужны свой цикл и журнал — у него только «Пара», «Рисунки», «Настройки».
  const roleKey = account ? `pair-role:${account.userId}` : null;
  const [pairRole, setPairRole] = useState<PairRole>(() => {
    if (!roleKey || typeof window === "undefined") return null;
    const cached = localStorage.getItem(roleKey);
    return cached === "owner" || cached === "partner" ? cached : null;
  });
  const updateRole = useCallback(
    (role: PairRole) => {
      setPairRole(role);
      if (roleKey) {
        if (role) localStorage.setItem(roleKey, role);
        else localStorage.removeItem(roleKey);
      }
    },
    [roleKey],
  );
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !account) return;
    getMyLinks(sb).then((links) => updateRole(links[0]?.role ?? null), () => undefined);
  }, [account?.userId, updateRole]); // eslint-disable-line react-hooks/exhaustive-deps
  const partnerMode = pairRole === "partner";
  const visibleTabs = partnerMode ? TABS.filter((t) => t.id !== "today" && t.id !== "calendar") : TABS;
  const shownTab: Tab = partnerMode && (tab === "today" || tab === "calendar") ? "pair" : tab;
  const contraception = useContraception(account && !partnerMode ? account.userId : null, today);
  const hormonal = contraception.config !== null && isHormonalCycleControl(contraception.config);
  const withdrawal = useMemo(
    () => (hormonal && contraception.config ? withdrawalDays(contraception.config, today, 6) : null),
    [hormonal, contraception.config, today],
  );
  const [reportOpen, setReportOpen] = useState(false);
  const conception = settings.mode === "conception";
  const pregnant = settings.mode === "pregnancy";
  const [selected, setSelected] = useState<IsoDate | null>(null);
  const [editing, setEditing] = useState<IsoDate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Отмеченные выделения продлевают месячные, у которых ещё не отмечен конец.
  const flowDays = useMemo(() => flowDaysOf(dayLogs), [dayLogs]);
  const prediction = useMemo(
    () =>
      predict({
        periods,
        today,
        defaultCycleLength: settings.cycleLength,
        defaultPeriodLength: settings.periodLength,
        flowDays,
      }),
    [periods, today, settings, flowDays],
  );
  const periodLength = prediction?.periodLength ?? settings.periodLength;
  const ongoing = ongoingPeriod(periods, today);
  const stillGoing = askIfStillGoing(periods, today, periodLength, flowDays);
  const todayPeriod = findPeriodAt(periods, today, periodLength, flowDays);
  const loggedDates = useMemo(() => new Set(Object.keys(dayLogs)), [dayLogs]);

  const setPeriods = (next: GuestData["periods"]) => onChange({ ...data, periods: next });
  const markStart = (date: IsoDate) => setPeriods(markPeriodStart(periods, date, periodLength));
  const markEnd = (date: IsoDate) => {
    const next = markPeriodEnd(periods, date);
    if (next) setPeriods(next);
    else setNotice("Не нашли месячные, которые начались в последние 2 недели до этой даты.");
  };
  const saveLog = (date: IsoDate, log: DayLog) => onChange({ ...data, dayLogs: setDayLog(dayLogs, date, log) });

  if (reportOpen) {
    return (
      <Report
        data={data}
        today={today}
        contraception={contraception.config}
        onClose={() => setReportOpen(false)}
      />
    );
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pb-32 pt-6">
        {shownTab === "today" && (
          <>
            {account?.sync === "offline" && (
              <p className="rounded-2xl bg-warning-soft p-3 text-sm text-warning" role="status">
                Нет связи с сервером. Изменения сохранены на устройстве и отправятся, когда появится интернет.
              </p>
            )}
            <header>
              <p className="text-sm text-muted">Сегодня</p>
              <h1 className="text-2xl font-semibold first-letter:uppercase">{formatLong(today)}</h1>
            </header>

            {pregnant && <PregnancyToday lmp={settings.pregnancyLmp ?? null} today={today} />}

            {!pregnant && stillGoing && (
              <StillGoingCard
                start={stillGoing.start}
                expectedEnd={periodEnd(stillGoing, periodLength, flowDays)}
                today={today}
                onYes={(flow) => saveLog(today, { ...(dayLogs[today] ?? emptyLog()), flow })}
                onNo={(end) => markEnd(end)}
              />
            )}

            {!hormonal && !pregnant && <CycleCard prediction={prediction} today={today} uncertain={!!stillGoing} />}

            {conception && !pregnant && prediction && (
              <ConceptionCard
                prediction={prediction}
                dayLogs={dayLogs}
                today={today}
                contraceptionOn={!!contraception.config && contraception.config.method !== "none"}
                onLog={() => setEditing(today)}
              />
            )}

            {!pregnant && <ContraceptionToday state={contraception} today={today} />}

            {!hormonal && !pregnant && prediction?.warnings.map((w) => (
              <p key={w.type} className="rounded-2xl bg-warning-soft p-4 text-sm text-warning" role="note">
                {warningText(w)}
              </p>
            ))}

            {pregnant || stillGoing ? null : ongoing ? (
              <Button onClick={() => markEnd(today)}>Месячные закончились сегодня</Button>
            ) : todayPeriod?.end ? (
              <p className="rounded-2xl bg-period-soft p-4 text-sm">
                Месячные отмечены: {formatRange(todayPeriod.start, todayPeriod.end)}. Изменить можно в календаре.
              </p>
            ) : (
              <Button onClick={() => markStart(today)}>Месячные начались сегодня</Button>
            )}

            {account && periods.length > 0 && <StatusCard userId={account.userId} today={today} />}

            <Card className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Как вы сегодня?</h2>
              <LogSummary log={dayLogs[today]} empty="Отметьте самочувствие, настроение и симптомы — так будет видно, как они связаны с циклом." />
              <Button variant="secondary" onClick={() => setEditing(today)}>
                {dayLogs[today] ? "Изменить" : "Отметить самочувствие"}
              </Button>
            </Card>

            <Disclaimer />
          </>
        )}

        {shownTab === "calendar" && (
          <>
            <Card>
              <Calendar
                periods={periods}
                prediction={prediction}
                flowDays={flowDays}
                withdrawal={pregnant ? [] : withdrawal}
                hideForecast={pregnant}
                takenDates={contraception.config?.method === "none" ? null : contraception.taken}
                today={today}
                loggedDates={loggedDates}
                selected={selected}
                onSelect={(d) => {
                  setNotice(null);
                  setSelected(d === selected ? null : d);
                }}
              />
            </Card>
            {selected ? (
              <DayPanel
                date={selected}
                today={today}
                periods={periods}
                periodLength={periodLength}
                flowDays={flowDays}
                log={dayLogs[selected]}
                notice={notice}
                onStart={() => markStart(selected)}
                onEnd={() => markEnd(selected)}
                onRemove={(start) => setPeriods(removePeriod(periods, start))}
                onEditLog={() => setEditing(selected)}
                onClose={() => setSelected(null)}
              />
            ) : (
              <p className="px-1 text-sm text-muted">Нажмите на день, чтобы отметить месячные или заполнить журнал.</p>
            )}
          </>
        )}

        {shownTab === "habits" && <HabitsTab data={data} today={today} onChange={onChange} />}

        {shownTab === "pair" && (
          <PairTab userId={account?.userId ?? null} today={today} onSignIn={onSignIn} onRole={updateRole} />
        )}

        {shownTab === "drawings" && <DrawingsTab userId={account?.userId ?? null} />}

        {shownTab === "settings" && (
          <SettingsTab
            data={data}
            onChange={onChange}
            onReset={onReset}
            today={today}
            account={account}
            onSignIn={onSignIn}
            pin={pin}
            partnerMode={partnerMode}
            contraception={contraception}
            onReport={() => setReportOpen(true)}
          />
        )}
      </main>

      <nav
        aria-label="Разделы"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-md">
          {visibleTabs.map((t) => (
            <li key={t.id} className="flex-1">
              <button
                type="button"
                aria-current={shownTab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
                className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 pb-2 pt-2.5 text-[11px] leading-none tracking-tight min-[380px]:text-xs ${
                  shownTab === t.id ? "font-semibold text-accent" : "text-muted"
                }`}
              >
                <TabIcon tab={t.id} active={shownTab === t.id} />
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {editing && (
        <DayLogEditor
          key={editing}
          date={editing}
          log={dayLogs[editing]}
          conception={conception}
          onChange={(log) => saveLog(editing, log)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function CycleCard({
  prediction,
  today,
  uncertain = false,
}: {
  prediction: Prediction | null;
  today: IsoDate;
  /** Не ясно, закончились ли месячные, — фазу пока не называем. */
  uncertain?: boolean;
}) {
  if (!prediction) {
    return (
      <Card>
        <p className="text-base">
          Отметьте первый день месячных — и мы построим прогноз. Прошедший день можно выбрать во вкладке «Календарь».
        </p>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <div className="text-5xl font-semibold tabular-nums">
          {prediction.cycleDay}
          <span className="ml-2 text-lg font-normal text-muted">день цикла</span>
        </div>
        {!uncertain && <div className="mt-1 text-base font-medium text-accent">{phaseLabel[prediction.phase]}</div>}
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
  );
}

function LogSummary({ log, empty }: { log: DayLog | undefined; empty: string }) {
  const items = log ? summarizeLog(log) : [];
  if (items.length === 0 && !log?.note) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((label) => (
            <li key={label} className="rounded-full bg-period-soft px-3 py-1 text-sm">
              {label}
            </li>
          ))}
        </ul>
      )}
      {log?.note && <p className="whitespace-pre-wrap text-sm text-muted">{log.note}</p>}
    </div>
  );
}

function DayPanel({
  date,
  today,
  periods,
  periodLength,
  flowDays,
  log,
  notice,
  onStart,
  onEnd,
  onRemove,
  onEditLog,
  onClose,
}: {
  date: IsoDate;
  today: IsoDate;
  periods: GuestData["periods"];
  periodLength: number;
  flowDays: ReadonlySet<IsoDate>;
  log: DayLog | undefined;
  notice: string | null;
  onStart: () => void;
  onEnd: () => void;
  onRemove: (start: IsoDate) => void;
  onEditLog: () => void;
  onClose: () => void;
}) {
  const isFuture = compareDates(date, today) > 0;
  const period = findPeriodAt(periods, date, periodLength, flowDays);

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
      ) : (
        <>
          <LogSummary log={log} empty="Журнал за этот день пуст." />
          <Button variant="secondary" onClick={onEditLog}>
            {log ? "Изменить журнал дня" : "Заполнить журнал дня"}
          </Button>
          {period ? (
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
        </>
      )}
      {notice && <p className="text-sm text-warning">{notice}</p>}
    </Card>
  );
}

async function exportData(data: GuestData, today: IsoDate, withAccount: boolean) {
  const sb = getSupabase();
  // Контрацепция хранится только в аккаунте — добавляем её в файл, если удаётся получить.
  const contraception = withAccount && sb ? await exportContraception(sb).catch(() => undefined) : undefined;
  const blob = new Blob([JSON.stringify(contraception ? { ...data, contraception } : data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cycle-tracker-${today}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  // Сразу отзывать ссылку нельзя: часть браузеров ещё не начала скачивание.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const syncLabel: Record<SyncStatus, string> = {
  synced: "Все данные сохранены в аккаунте",
  syncing: "Сохраняем…",
  offline: "Нет связи — изменения отправятся позже",
};

function AccountCard({ account, onSignIn }: { account: AccountInfo | null; onSignIn: (() => void) | null }) {
  const [confirming, setConfirming] = useState<"signout" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!account) {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Аккаунт</h2>
        {onSignIn ? (
          <>
            <p className="text-sm text-muted">
              Войдите по почте, чтобы данные не потерялись при смене телефона и были доступны на всех устройствах. Пароль не
              нужен.
            </p>
            <Button onClick={onSignIn}>Войти или создать аккаунт</Button>
          </>
        ) : (
          <p className="text-sm text-muted">Вход по почте скоро появится.</p>
        )}
      </Card>
    );
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError("Не получилось. Проверьте интернет и попробуйте ещё раз.");
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Аккаунт</h2>
      <p className="text-base">{account.email}</p>
      <p className={`text-sm ${account.sync === "offline" ? "text-warning" : "text-muted"}`}>
        {syncLabel[account.sync]}
      </p>
      {account.sync === "offline" && (
        <Button variant="secondary" onClick={account.onRetry}>
          Повторить отправку
        </Button>
      )}

      {confirming === "signout" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            {account.sync === "synced"
              ? "Данные останутся в аккаунте, а с этого устройства будут удалены."
              : "Часть изменений ещё не отправлена и пропадёт при выходе. Лучше дождаться связи."}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => run(account.onSignOut)}>
              Выйти
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirming(null)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : confirming === "delete" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            Аккаунт и все данные — месячные, журнал, настройки — будут удалены с сервера и с этого устройства. Это нельзя
            отменить.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" className="flex-1" disabled={busy} onClick={() => run(account.onDelete)}>
              Удалить навсегда
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirming(null)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Button variant="secondary" onClick={() => setConfirming("signout")}>
            Выйти
          </Button>
          <Button variant="danger" onClick={() => setConfirming("delete")}>
            Удалить аккаунт
          </Button>
        </>
      )}
      {error && <p className="text-sm text-warning">{error}</p>}
    </Card>
  );
}

function SettingsTab({
  data,
  today,
  onChange,
  onReset,
  account,
  onSignIn,
  pin,
  partnerMode,
  contraception,
  onReport,
}: {
  data: GuestData;
  today: IsoDate;
  onChange: (data: GuestData) => void;
  onReset: () => void;
  account: AccountInfo | null;
  onSignIn: (() => void) | null;
  pin: PinControl;
  partnerMode: boolean;
  contraception: ContraceptionState;
  onReport: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  const set = (patch: Partial<GuestData["settings"]>) => onChange({ ...data, settings: { ...data.settings, ...patch } });

  return (
    <>
      <h1 className="text-2xl font-semibold">Настройки</h1>

      <AccountCard account={account} onSignIn={onSignIn} />

      {account && <PushCard partnerMode={partnerMode} />}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">PIN-код</h2>
        <p className="text-sm text-muted">
          {pin.enabled
            ? "Включён: приложение спрашивает PIN-код при открытии и после минуты в фоне."
            : "Защитит календарь и журнал, если телефон окажется в чужих руках."}
        </p>
        {pin.enabled ? (
          <>
            <Button variant="secondary" onClick={() => pin.onSetup("change")}>
              Изменить PIN-код
            </Button>
            <Button variant="ghost" onClick={() => pin.onSetup("disable")}>
              Выключить PIN-код
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => pin.onSetup("enable")}>
            Включить PIN-код
          </Button>
        )}
      </Card>

      {!partnerMode && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Цель</h2>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Цель">
            {(
              [
                ["cycle", "Отслеживать цикл"],
                ["conception", "Хочу забеременеть"],
                ["pregnancy", "Беременность"],
              ] as const
            ).map(([mode, label]) => (
              <Button
                key={mode}
                role="radio"
                aria-checked={(data.settings.mode ?? "cycle") === mode}
                variant={(data.settings.mode ?? "cycle") === mode ? "primary" : "secondary"}
                className="px-4"
                onClick={() =>
                  set(
                    mode === "pregnancy" && !data.settings.pregnancyLmp
                      ? { mode, pregnancyLmp: lastStart(data.periods) }
                      : { mode },
                  )
                }
              >
                {label}
              </Button>
            ))}
          </div>
          {data.settings.mode === "pregnancy" && (
            <PregnancyDates
              lmp={data.settings.pregnancyLmp ?? null}
              today={today}
              onChange={(pregnancyLmp) => set({ pregnancyLmp })}
            />
          )}
          <p className="text-sm text-muted">
            {data.settings.mode === "pregnancy"
              ? "Вместо прогноза цикла — срок по неделям, дата родов и что происходит на этой неделе. Партнёр увидит срок, только если вы включите это во вкладке «Пара»."
              : data.settings.mode === "conception"
              ? "На вкладке «Сегодня» — фертильность на сегодня и график базальной температуры. Температура и тесты на овуляцию партнёру не видны никогда."
              : "В режиме зачатия появятся фертильность на сегодня, базальная температура и тесты на овуляцию."}
          </p>
        </Card>
      )}

      {!partnerMode && (
      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Обычная длина цикла — пока отмечено мало циклов</p>
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
      </Card>
      )}

      {account && !partnerMode && <ContraceptionSettingsCard state={contraception} today={today} />}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Ваши данные</h2>
        {!account && (
          <p className="text-sm text-muted">
            Сейчас данные хранятся только в этом браузере. Если очистить данные сайта или сменить устройство, они
            пропадут — чтобы этого не случилось, войдите в аккаунт.
          </p>
        )}
        {!partnerMode && (
          <Button variant="secondary" onClick={onReport}>
            Отчёт для врача (PDF)
          </Button>
        )}
        <Button variant="secondary" onClick={() => void exportData(data, today, !!account)}>
          Скачать мои данные
        </Button>
        {account ? null : confirming ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">Удалить все отметки, журнал и настройки с этого устройства? Это нельзя отменить.</p>
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
      </Card>

      {/* Нужно немногим — поэтому в самом низу и неброско. */}
      {!partnerMode && (
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            className="text-sm text-muted underline underline-offset-2 hover:text-foreground"
            onClick={() => setImporting(true)}
          >
            Перенести историю из другого приложения
          </button>
          {imported !== null && (
            <p className="text-sm text-fertile" role="status">
              Добавлено месячных: {imported}. Прогноз пересчитан.
            </p>
          )}
          {importing && (
            <ImportDialog
              periods={data.periods}
              today={today}
              onClose={() => setImporting(false)}
              onImport={(periods, added) => {
                onChange({ ...data, periods });
                setImported(added);
                setImporting(false);
              }}
            />
          )}
        </div>
      )}

      <Disclaimer />
    </>
  );
}

function lastStart(periods: GuestData["periods"]): IsoDate | null {
  return periods.reduce<IsoDate | null>((last, p) => (!last || compareDates(p.start, last) > 0 ? p.start : last), null);
}

/** Начало беременности: первый день последних месячных или дата родов, которую назвал врач. */
function PregnancyDates({
  lmp,
  today,
  onChange,
}: {
  lmp: IsoDate | null;
  today: IsoDate;
  onChange: (lmp: IsoDate | null) => void;
}) {
  const input = "rounded-2xl border border-border bg-surface px-4 py-3 text-base";
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">Первый день последних месячных</span>
        <input
          type="date"
          className={input}
          value={lmp ?? ""}
          max={today}
          min={addDays(today, -300)}
          onChange={(e) => onChange(e.target.value || null)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">или предполагаемая дата родов (если её назвал врач)</span>
        <input
          type="date"
          className={input}
          value={lmp ? dueDate(lmp) : ""}
          min={today}
          max={addDays(today, 300)}
          onChange={(e) => onChange(e.target.value ? lmpFromDueDate(e.target.value) : null)}
        />
      </label>
    </div>
  );
}

/** Конец месячных не отмечен, а обычная длина прошла — спрашиваем, идут ли ещё. */
function StillGoingCard({
  start,
  expectedEnd,
  today,
  onYes,
  onNo,
}: {
  start: IsoDate;
  expectedEnd: IsoDate;
  today: IsoDate;
  onYes: (flow: FlowLevel) => void;
  onNo: (end: IsoDate) => void;
}) {
  const day = diffDays(start, today) + 1;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Месячные ещё идут?</h2>
      <p className="text-sm text-muted">
        Начались {formatDayMonth(start)}, сегодня {day}-й день. Конец пока не отмечен.
      </p>
      <p className="text-sm">Да, ещё идут — какие сегодня:</p>
      <div className="flex flex-wrap gap-2">
        {FLOW_LEVELS.map((f) => (
          <Button key={f.id} variant="secondary" className="px-4" onClick={() => onYes(f.id)}>
            {f.label}
          </Button>
        ))}
      </div>
      <Button onClick={() => onNo(expectedEnd)}>Нет, закончились {formatDayMonth(expectedEnd)}</Button>
      <p className="text-xs text-muted">Закончились в другой день — отметьте его в календаре.</p>
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { describeScheme, METHODS, REGIMENS, schemeDay } from "@/lib/cycle/contraception";
import { addDays, type IsoDate } from "@/lib/cycle/dates";
import { partnerCycleInfo } from "@/lib/cycle/partner";
import type { Phase } from "@/lib/cycle/predict";
import { formatDayMonth, formatRange, pluralDays } from "@/lib/format";
import { optionLabel } from "@/lib/journal";
import {
  approveLink,
  createInviteCode,
  getLastPartnerView,
  getMyLinks,
  getPartnerView,
  getProfile,
  getShareSettings,
  redeemInviteCode,
  revokeLink,
  saveProfile,
  updateShareSettings,
  type PairLink,
  type PairProfile,
  type PartnerView,
  type ShareKey,
  type ShareSettings,
} from "@/lib/pair";
import { getSupabase } from "@/lib/supabase/client";
import { describeStatus } from "@/lib/status";
import { PartnerPregnancy } from "./Pregnancy";
import { SharedFeed } from "./SharedFeed";
import { Button, Card, Toggle } from "./ui";

const phaseLabel: Record<Phase, string> = {
  menstruation: "Месячные",
  follicular: "Фолликулярная фаза",
  fertile: "Фертильные дни",
  ovulation: "Овуляция (прогноз)",
  luteal: "Лютеиновая фаза",
};

/** Мягкие подсказки партнёру — без медицинских утверждений. */
const phaseHint: Record<Phase, string> = {
  menstruation: "Может понадобиться больше заботы, тепла и отдыха.",
  follicular: "Часто в это время больше энергии и сил.",
  fertile: "По прогнозу — фертильные дни.",
  ovulation: "По прогнозу — день овуляции.",
  luteal: "Ближе к месячным возможны усталость и перепады настроения — поддержка будет кстати.",
};

const shareLabels: Record<ShareKey, string> = {
  prediction: "Фаза и прогноз месячных",
  fertility: "Фертильные дни и овуляция",
  periods: "Даты месячных",
  daily_status: "Статус дня: энергия, настроение, что нужно",
  libido: "Либидо в статусе дня",
  mood: "Настроение из журнала",
  symptoms: "Симптомы из журнала",
  contraception: "Контрацепция: метод и отметки о приёме",
  pregnancy: "Беременность: срок и дата родов",
};

function errorText(e: unknown): string {
  const message = e instanceof Error ? e.message : "";
  // Сообщения из функций базы уже по-русски.
  return /[а-яё]/i.test(message) ? message : "Не получилось. Проверьте интернет и попробуйте ещё раз.";
}

function isAdult(birthDate: IsoDate, today: IsoDate): boolean {
  const [y, m, d] = birthDate.split("-").map(Number);
  return `${y + 18}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` <= today;
}

export function PairTab({
  userId,
  today,
  onSignIn,
  onRole,
}: {
  userId: string | null;
  today: IsoDate;
  onSignIn: (() => void) | null;
  /** Роль в паре изменилась (подключились, отключились) — для набора вкладок. */
  onRole?: (role: "owner" | "partner" | null) => void;
}) {
  const sb = getSupabase();
  const [profile, setProfile] = useState<PairProfile | null>(null);
  const [links, setLinks] = useState<PairLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!sb || !userId) return;
    try {
      const [p, l] = await Promise.all([getProfile(sb, userId), getMyLinks(sb)]);
      setProfile(p);
      setLinks(l);
      onRole?.(l[0]?.role ?? null);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [sb, userId, onRole]);

  useEffect(() => {
    // Загрузка данных пары при открытии вкладки.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const link = links?.[0] ?? null;

  // Пока ждём второго участника — проверяем раз в несколько секунд.
  const waiting = link?.status === "pending" && link.role === "partner";
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(reload, 8000);
    return () => clearInterval(t);
  }, [waiting, reload]);

  if (!userId || !sb) {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Режим пары</h2>
        <p className="text-sm text-muted">
          Поделитесь с партнёром фазой и прогнозом — он будет понимать, когда вам нужно больше заботы. Вы решаете,
          что он видит, и можете отключить его в любой момент. Для режима пары нужен аккаунт — у вас и у партнёра.
        </p>
        {onSignIn && <Button onClick={onSignIn}>Войти или создать аккаунт</Button>}
      </Card>
    );
  }

  if (error && !links) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-warning">{error}</p>
        <Button variant="secondary" onClick={reload}>
          Повторить
        </Button>
      </Card>
    );
  }

  if (!profile || !links) return <div aria-busy className="h-40" />;

  if (!profile.displayName || !profile.birthDate) {
    return <ProfileForm initial={profile} today={today} onSave={async (p) => {
      await saveProfile(sb, userId, p);
      await reload();
    }} />;
  }

  if (!isAdult(profile.birthDate, today)) {
    return (
      <Card>
        <p className="text-sm text-muted">Режим пары доступен с 18 лет.</p>
      </Card>
    );
  }

  if (!link) return <NoLink onChanged={reload} />;

  if (link.role === "owner" && link.status === "pending") {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{link.otherName ?? "Партнёр"} хочет подключиться</h2>
        <p className="text-sm text-muted">
          После подтверждения партнёр увидит только фазу и прогноз месячных. Остальное вы сможете включить сами.
        </p>
        <Action label="Разрешить" run={() => approveLink(sb, link.linkId)} after={reload} />
        <Action label="Отклонить" variant="ghost" run={() => revokeLink(sb, link.linkId)} after={reload} />
      </Card>
    );
  }

  if (link.role === "partner" && link.status === "pending") {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Ждём подтверждения</h2>
        <p className="text-sm text-muted">
          {link.otherName ?? "Владелица календаря"} должна подтвердить подключение в своём приложении. Экран
          обновится сам.
        </p>
        <Action label="Отменить запрос" variant="ghost" run={() => revokeLink(sb, link.linkId)} after={reload} />
      </Card>
    );
  }

  return link.role === "owner" ? (
    <OwnerActive link={link} meId={userId} today={today} onChanged={reload} />
  ) : (
    <PartnerActive link={link} meId={userId} today={today} onChanged={reload} />
  );
}

function Action({
  label,
  run,
  after,
  variant = "primary",
  confirm,
}: {
  label: string;
  run: () => Promise<unknown>;
  after: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  confirm?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await run();
      after();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };
  if (confirm && asking) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{confirm}</p>
        <div className="flex gap-2">
          <Button variant="danger" className="flex-1" disabled={busy} onClick={go}>
            {label}
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => setAsking(false)}>
            Отмена
          </Button>
        </div>
      </div>
    );
  }
  return (
    <>
      <Button variant={variant} disabled={busy} onClick={confirm ? () => setAsking(true) : go}>
        {label}
      </Button>
      {error && <p className="text-sm text-warning">{error}</p>}
    </>
  );
}

function ProfileForm({
  initial,
  today,
  onSave,
}: {
  initial: PairProfile;
  today: IsoDate;
  onSave: (p: PairProfile) => Promise<void>;
}) {
  const [name, setName] = useState(initial.displayName ?? "");
  const [birthDate, setBirthDate] = useState(initial.birthDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(birthDate);

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Режим пары</h2>
      <p className="text-sm text-muted">
        Чтобы подключиться друг к другу, укажите имя — его увидит второй участник — и дату рождения: режим пары
        доступен с 18 лет.
      </p>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-muted">Имя</span>
        <input
          className="min-h-12 rounded-2xl border border-border bg-surface px-4 text-lg"
          maxLength={50}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-muted">Дата рождения</span>
        <input
          type="date"
          className="min-h-12 rounded-2xl border border-border bg-surface px-4 text-lg"
          max={today}
          min={addDays(today, -365 * 100)}
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
      </label>
      <Button
        disabled={!valid || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSave({ displayName: name.trim(), birthDate });
          } catch (e) {
            setError(errorText(e));
            setBusy(false);
          }
        }}
      >
        Продолжить
      </Button>
      {error && <p className="text-sm text-warning">{error}</p>}
    </Card>
  );
}

function NoLink({ onChanged }: { onChanged: () => void }) {
  const sb = getSupabase()!;
  const [code, setCode] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Пока код на экране — ждём, когда партнёр его введёт.
  useEffect(() => {
    if (!code) return;
    const t = setInterval(onChanged, 8000);
    return () => clearInterval(t);
  }, [code, onChanged]);

  const share = async () => {
    if (!code) return;
    const text = `Код для подключения к моему календарю: ${code}. Открой ${window.location.origin} → «Пара» → «У меня есть код». Код действует 24 часа.`;
    if (navigator.share) {
      await navigator.share({ text }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    }
  };

  return (
    <>
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Пригласить партнёра</h2>
        <p className="text-sm text-muted">
          Партнёр увидит только то, что вы разрешите, — по умолчанию фазу и прогноз месячных. Отключить его можно в
          любой момент.
        </p>
        {code ? (
          <>
            <p className="rounded-2xl bg-period-soft py-4 text-center text-3xl font-semibold tracking-[0.25em] tabular-nums">
              {code}
            </p>
            <p className="text-sm text-muted">
              Код действует 24 часа и срабатывает один раз. Когда партнёр введёт его, здесь появится запрос — без
              вашего подтверждения он ничего не увидит.
            </p>
            <Button variant="secondary" onClick={share}>
              {copied ? "Скопировано" : "Отправить код"}
            </Button>
          </>
        ) : (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                setCode(await createInviteCode(sb));
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Получить код приглашения
          </Button>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">У меня есть код</h2>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const linkId = await redeemInviteCode(sb, input.replace(/[^a-z0-9]/gi, "").toUpperCase());
              if (!linkId) setError("Код неверный или устарел. Попросите прислать новый.");
              else onChanged();
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            aria-label="Код приглашения"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={12}
            className="min-h-12 rounded-2xl border border-border bg-surface px-4 text-center text-2xl uppercase tracking-[0.25em]"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={busy || input.replace(/[^a-z0-9]/gi, "").length < 8}>
            Подключиться
          </Button>
        </form>
      </Card>
      {error && <p className="px-1 text-sm text-warning">{error}</p>}
    </>
  );
}

function OwnerActive({
  link,
  meId,
  today,
  onChanged,
}: {
  link: PairLink;
  meId: string;
  today: IsoDate;
  onChanged: () => void;
}) {
  const sb = getSupabase()!;
  const [settings, setSettings] = useState<ShareSettings | null>(null);
  const [lastView, setLastView] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getShareSettings(sb, link.linkId).then(setSettings, (e) => setError(errorText(e)));
    getLastPartnerView(sb, link.linkId).then(setLastView, () => undefined);
  }, [sb, link.linkId]);

  const toggle = async (key: ShareKey, value: boolean) => {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, [key]: value });
    try {
      await updateShareSettings(sb, link.linkId, { [key]: value });
    } catch (e) {
      setSettings(previous);
      setError(errorText(e));
    }
  };

  const name = link.otherName ?? "Партнёр";
  return (
    <>
      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Партнёр: {name}</h2>
        <p className="text-sm text-muted">
          {lastView
            ? `Последний раз смотрел(а) ваши данные: ${new Date(lastView).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`
            : "Ещё не открывал(а) ваши данные."}
        </p>
      </Card>

      <Card className="flex flex-col gap-1">
        <h2 className="mb-2 text-lg font-semibold">Что видит {name}</h2>
        {settings ? (
          (Object.keys(shareLabels) as ShareKey[]).map((key) => (
            <Toggle key={key} label={shareLabels[key]} checked={settings[key]} onChange={(v) => toggle(key, v)} />
          ))
        ) : (
          <div aria-busy className="h-40" />
        )}
        <p className="mt-2 text-sm text-muted">Личные заметки партнёр не увидит никогда.</p>
        {error && <p className="text-sm text-warning">{error}</p>}
      </Card>

      <SharedFeed linkId={link.linkId} meId={meId} role="owner" otherName={name} today={today} />

      <Card className="flex flex-col gap-3">
        <Action
          label="Отключить партнёра"
          variant="danger"
          confirm={`${name} сразу потеряет доступ к вашим данным. Подключиться снова можно будет только по новому коду.`}
          run={() => revokeLink(sb, link.linkId)}
          after={onChanged}
        />
      </Card>
    </>
  );
}

function PartnerActive({
  link,
  meId,
  today,
  onChanged,
}: {
  link: PairLink;
  meId: string;
  today: IsoDate;
  onChanged: () => void;
}) {
  const sb = getSupabase()!;
  const [view, setView] = useState<PartnerView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getPartnerView(sb, addDays(today, -120), addDays(today, 60)).then(
      (v) => {
        setView(v);
        setError(null);
        if (!v) onChanged(); // доступ отозван
      },
      (e) => setError(errorText(e)),
    );
  }, [sb, today, onChanged]);

  useEffect(() => {
    load();
  }, [load]);

  const name = view?.ownerName ?? link.otherName ?? "Партнёр";
  const info = view?.prediction ? partnerCycleInfo(view.prediction, view.fertility ?? null, today) : null;
  const recentLogs = (view?.dayLogs ?? []).filter((l) => l.date >= addDays(today, -6) && l.date <= today).reverse();
  const lastPeriods = (view?.periods ?? []).slice(-3).reverse();
  const nothingShared =
    view &&
    !view.prediction &&
    !view.periods &&
    !view.dayLogs &&
    !view.dailyStatus &&
    !view.contraception &&
    !view.pregnancy;
  const todayStatus = view?.dailyStatus?.find((d) => d.date === today);
  const statusLines = todayStatus ? describeStatus(todayStatus) : [];

  return (
    <>
      <header>
        <p className="text-sm text-muted">Календарь</p>
        <h1 className="text-2xl font-semibold">{name}</h1>
      </header>

      {view === undefined && !error && <div aria-busy className="h-40" />}
      {error && <p className="text-sm text-warning">{error}</p>}

      {info && (
        <Card className="flex flex-col gap-3">
          <div>
            <div className="text-5xl font-semibold tabular-nums">
              {info.cycleDay}
              <span className="ml-2 text-lg font-normal text-muted">день цикла</span>
            </div>
            <div className="mt-1 text-base font-medium text-accent">{phaseLabel[info.phase]}</div>
          </div>
          <p className="text-sm">{phaseHint[info.phase]}</p>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-muted">Следующие месячные</dt>
              <dd className="text-base font-medium">
                {info.delayDays > 0
                  ? `Ожидались ${formatRange(info.nextPeriod.earliest, info.nextPeriod.latest)}`
                  : `${formatRange(info.nextPeriod.earliest, info.nextPeriod.latest)}${
                      info.daysUntilPeriod > 0 ? ` · через ${pluralDays(info.daysUntilPeriod)}` : " · в ближайшие дни"
                    }`}
              </dd>
            </div>
            {info.fertileWindow && (
              <div>
                <dt className="text-muted">Фертильное окно</dt>
                <dd className="text-base font-medium">{formatRange(info.fertileWindow.start, info.fertileWindow.end)}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      {view?.pregnancy && <PartnerPregnancy lmp={view.pregnancy.lmp} today={today} name={name} />}

      {view?.contraception && <PartnerContraception c={view.contraception} today={today} />}

      {view?.dailyStatus && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Статус на сегодня</h2>
          {statusLines.length > 0 ? (
            <ul className="flex flex-col gap-1 text-base">
              {statusLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Сегодня статус ещё не отмечен.</p>
          )}
        </Card>
      )}

      {lastPeriods.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Последние месячные</h2>
          <ul className="text-sm">
            {lastPeriods.map((p) => (
              <li key={p.start}>{p.end ? formatRange(p.start, p.end) : `с ${formatRange(p.start, p.start)}`}</li>
            ))}
          </ul>
        </Card>
      )}

      {view?.dayLogs && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Последние дни</h2>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted">За неделю отметок нет.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {recentLogs.map((l) => (
                <li key={l.date}>
                  <span className="text-muted">{formatRange(l.date, l.date)}: </span>
                  {[...(l.moods ?? []), ...(l.symptoms ?? [])].map(optionLabel).join(", ") || "—"}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {nothingShared && (
        <Card>
          <p className="text-sm text-muted">Пока для вас ничего не открыто.</p>
        </Card>
      )}

      {view && <SharedFeed linkId={link.linkId} meId={meId} role="partner" otherName={name} today={today} />}

      <Card className="flex flex-col gap-3">
        <Button variant="secondary" onClick={load}>
          Обновить
        </Button>
        <Action
          label="Отключиться"
          variant="danger"
          confirm="Вы перестанете видеть календарь. Подключиться снова можно будет только по новому коду."
          run={() => revokeLink(sb, link.linkId)}
          after={onChanged}
        />
      </Card>
    </>
  );
}

function PartnerContraception({ c, today }: { c: NonNullable<PartnerView["contraception"]>; today: IsoDate }) {
  const info = schemeDay(c, today);
  const method = METHODS.find((m) => m.id === c.method)?.label ?? "";
  const regimen = c.method === "pill" ? REGIMENS.find((r) => r.id === c.regimen)?.label : null;
  const action = info?.actions[0];
  const done = c.takenDates.includes(today);
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Контрацепция</h2>
      <p className="text-sm text-muted">
        {method}
        {regimen ? ` · ${regimen}` : ""}
      </p>
      {info ? (
        <>
          <p className="text-base font-medium">{describeScheme(c, info)}</p>
          {action && (
            <p className={`text-sm ${done ? "text-fertile" : "text-muted"}`}>
              {done ? "✓ Сегодня отмечено" : "Сегодня ещё не отмечено"}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">Схема начнётся {formatDayMonth(c.startDate)}.</p>
      )}
    </Card>
  );
}

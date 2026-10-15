// Какие push-уведомления отправлять и с каким текстом. Чистые функции — используются
// на сервере (src/app/api/notify) и проверяются тестами.
// Тексты нейтральные: уведомление видно на экране блокировки, поэтому без слов о цикле и симптомах.

export type NotifyEvent = "status" | "note" | "request" | "done" | "drawing";
export type PairRole = "owner" | "partner";

/** Какие события может вызвать каждая роль. */
const ALLOWED: Record<PairRole, NotifyEvent[]> = {
  owner: ["status", "note", "request", "drawing"],
  partner: ["note", "done", "drawing"],
};

export function isAllowed(role: PairRole, event: string): event is NotifyEvent {
  return (ALLOWED[role] as string[]).includes(event);
}

/** Не чаще чем раз в столько миллисекунд от одного человека. */
export const THROTTLE_MS: Record<NotifyEvent | "cycle_reminder" | "test", number> = {
  status: 60 * 60_000,
  note: 60_000,
  request: 60_000,
  done: 60_000,
  drawing: 60_000,
  cycle_reminder: 20 * 60 * 60_000,
  test: 30_000,
};

export function shouldSend(event: keyof typeof THROTTLE_MS, lastSentAt: Date | null, now: Date): boolean {
  return !lastSentAt || now.getTime() - lastSentAt.getTime() >= THROTTLE_MS[event];
}

export interface PushMessage {
  title: string;
  body: string;
  tag: string;
  url: string;
}

export function buildMessage(event: NotifyEvent, senderName: string | null): PushMessage {
  const name = senderName?.trim() || "Партнёр";
  const text: Record<NotifyEvent, string> = {
    status: "новый статус дня",
    note: "новая заметка",
    request: "новая просьба",
    done: "просьба выполнена ✓",
    drawing: "новый рисунок",
  };
  return {
    title: "Трекер",
    body: `${name}: ${text[event]}`,
    tag: event,
    url: event === "drawing" ? "/?tab=drawings" : "/?tab=pair",
  };
}

export const CYCLE_REMINDER: PushMessage = {
  title: "Трекер",
  body: "Скоро новый цикл — загляните в календарь",
  tag: "cycle_reminder",
  url: "/?tab=today",
};

/** Напоминание о контрацепции. Ни слова о таблетках: уведомление видно на экране блокировки. */
export function contraceptionReminder(kind: "first" | "repeat"): PushMessage {
  return {
    title: "Трекер",
    body: kind === "first" ? "Ежедневное напоминание" : "Напоминание: ещё не отмечено",
    tag: "daily_reminder",
    url: "/?tab=today",
  };
}

/** Ключ в notify_log: одно первое и одно повторное напоминание в местный день. */
export function contraceptionReminderKey(kind: "first" | "repeat", localDate: string): string {
  return `${kind === "first" ? "contra" : "contra-r"}:${localDate}`;
}

/** Местные дата (YYYY-MM-DD) и минуты с полуночи в часовом поясе `timeZone`. Неизвестный пояс — null. */
export function localClock(now: Date, timeZone: string): { date: string; minutes: number } | null {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(now)
        .map((p) => [p.type, p.value]),
    );
    return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
  } catch {
    return null;
  }
}

/** «21:00» или «21:00:00» → минуты с полуночи. */
export function parseTime(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export const TEST_MESSAGE: PushMessage = {
  title: "Трекер",
  body: "Проверка уведомлений: всё работает",
  tag: "test",
  url: "/?tab=settings",
};

export interface TestResult {
  reason?: "push-not-configured" | "throttled" | "db-not-ready" | "db-error";
  detail?: string;
  /** Ошибка при сохранении подписки этого устройства (из браузера). */
  saveError?: string;
  devices?: number;
  sent?: number;
  errors?: number[];
  hosts?: string[];
  thisDevice?: boolean;
}

/** Понятное объяснение результата проверочного уведомления. */
export function explainTest(r: TestResult): { ok: boolean; text: string } {
  if (r.reason === "push-not-configured") {
    return {
      ok: false,
      text: "На сервере не настроены ключи уведомлений. Проверьте переменные VAPID и SUPABASE_SERVICE_ROLE_KEY в Vercel и сделайте Redeploy.",
    };
  }
  if (r.reason === "throttled") return { ok: false, text: "Подождите полминуты и попробуйте ещё раз." };
  if (r.reason === "db-not-ready") {
    return {
      ok: false,
      text: "В базе нет таблицы для уведомлений. Выполните в Supabase → SQL Editor файл supabase/migrations/20261019000000_push.sql.",
    };
  }
  const errors = r.errors ?? [];
  if (r.reason === "db-error") {
    const denied = /42501|permission denied/i.test(r.detail ?? "");
    return {
      ok: false,
      text: denied
        ? "Серверу не хватает прав к базе: в Vercel в SUPABASE_SERVICE_ROLE_KEY, похоже, указан публичный ключ вместо секретного (service_role). Ошибка: " + r.detail
        : `Сервер не смог прочитать базу. Ошибка: ${r.detail}`,
    };
  }
  if (!r.thisDevice && r.saveError) {
    return { ok: false, text: `Сервер не принял подписку этого устройства: ${r.saveError}` };
  }
  if (!r.thisDevice) {
    return {
      ok: false,
      text: "Сервер не знает это устройство. Нажмите «Выключить уведомления», затем «Включить уведомления» снова.",
    };
  }
  if (errors.includes(403) || errors.includes(401)) {
    return {
      ok: false,
      text: "Служба уведомлений отклонила ключ. Похоже, NEXT_PUBLIC_VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY в Vercel не из одной пары.",
    };
  }
  if (errors.includes(404) || errors.includes(410)) {
    return { ok: false, text: "Подписка этого устройства устарела. Включите уведомления заново." };
  }
  if (errors.includes(0)) {
    return { ok: false, text: `Сервер не смог связаться со службой уведомлений (${(r.hosts ?? []).join(", ")}).` };
  }
  if (errors.length > 0 && !r.sent) return { ok: false, text: `Ошибка службы уведомлений: ${errors.join(", ")}.` };
  return {
    ok: true,
    text: `Сервер отправил уведомление (устройств: ${r.sent}). Если оно не появилось в течение минуты — дело в доставке на телефон: проверьте настройки уведомлений для приложения, режим «Фокус» / «Не беспокоить» и VPN.`,
  };
}

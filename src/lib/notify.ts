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
export const THROTTLE_MS: Record<NotifyEvent | "cycle_reminder", number> = {
  status: 60 * 60_000,
  note: 60_000,
  request: 60_000,
  done: 60_000,
  drawing: 60_000,
  cycle_reminder: 20 * 60 * 60_000,
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

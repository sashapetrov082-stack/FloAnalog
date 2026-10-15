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

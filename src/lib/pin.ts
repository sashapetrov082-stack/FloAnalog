// PIN-код на вход в приложение. Хранится только хэш (PBKDF2 с солью), сам PIN — нигде.
// Это замок интерфейса от случайного доступа к телефону, а не шифрование данных.

export const PIN_LENGTH = 4;
const ITERATIONS = 150_000;

export interface PinRecord {
  version: 1;
  salt: string;
  hash: string;
  /** Неудачные попытки подряд. */
  failures: number;
  /** До какого момента ввод заблокирован (мс с 1970 г.). */
  lockedUntil: number;
}

/** Через сколько неудачных попыток начинается блокировка. */
const FREE_ATTEMPTS = 5;

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return toBase64(new Uint8Array(bits));
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export async function createPinRecord(pin: string): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new Error("PIN-код — 4 цифры");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { version: 1, salt: toBase64(salt), hash: await derive(pin, salt), failures: 0, lockedUntil: 0 };
}

/** Сравнение без раннего выхода, чтобы время проверки не подсказывало совпадение. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Длительность блокировки после очередной неудачи: 30 с, 1 мин, 5 мин, затем 15 мин. */
export function lockoutMs(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  const steps = [30_000, 60_000, 5 * 60_000, 15 * 60_000];
  return steps[Math.min(failures - FREE_ATTEMPTS, steps.length - 1)];
}

export type PinCheck =
  | { ok: true; record: PinRecord }
  | { ok: false; record: PinRecord; lockedForMs: number; attemptsLeft: number };

/**
 * Проверяет PIN и возвращает обновлённую запись (счётчик неудач, блокировка).
 * `now` передаётся параметром, чтобы логику можно было проверить тестами.
 */
export async function checkPin(record: PinRecord, pin: string, now: number): Promise<PinCheck> {
  if (record.lockedUntil > now) {
    return { ok: false, record, lockedForMs: record.lockedUntil - now, attemptsLeft: 0 };
  }
  const matches = isValidPin(pin) && sameString(await derive(pin, fromBase64(record.salt)), record.hash);
  if (matches) return { ok: true, record: { ...record, failures: 0, lockedUntil: 0 } };

  const failures = record.failures + 1;
  const lock = lockoutMs(failures);
  return {
    ok: false,
    record: { ...record, failures, lockedUntil: lock ? now + lock : 0 },
    lockedForMs: lock,
    attemptsLeft: Math.max(0, FREE_ATTEMPTS - failures),
  };
}

export function parsePinRecord(raw: unknown): PinRecord | null {
  const r = raw as Partial<PinRecord> | null;
  if (!r || r.version !== 1 || typeof r.salt !== "string" || typeof r.hash !== "string") return null;
  return {
    version: 1,
    salt: r.salt,
    hash: r.hash,
    failures: Number.isInteger(r.failures) ? (r.failures as number) : 0,
    lockedUntil: typeof r.lockedUntil === "number" ? r.lockedUntil : 0,
  };
}

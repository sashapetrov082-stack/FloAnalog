// Режим пары: запросы к Supabase. Все проверки (возраст, один партнёр, одноразовый код,
// подтверждение, видимость) — на стороне базы, здесь только вызовы.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IsoDate } from "@/lib/cycle/dates";
import type { PartnerFertility, PartnerPrediction } from "@/lib/cycle/partner";
import type { Prediction } from "@/lib/cycle/predict";
import type { DayStatus } from "@/lib/status";

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export interface PairProfile {
  displayName: string | null;
  birthDate: IsoDate | null;
}

export async function getProfile(sb: SupabaseClient, userId: string): Promise<PairProfile> {
  const p = check(await sb.from("profiles").select("display_name, birth_date").eq("id", userId).single());
  return { displayName: p?.display_name ?? null, birthDate: p?.birth_date ?? null };
}

export async function saveProfile(sb: SupabaseClient, userId: string, profile: PairProfile): Promise<void> {
  check(
    await sb
      .from("profiles")
      .update({ display_name: profile.displayName, birth_date: profile.birthDate })
      .eq("id", userId),
  );
}

export interface PairLink {
  linkId: string;
  role: "owner" | "partner";
  status: "pending" | "active";
  otherName: string | null;
  createdAt: string;
}

export async function getMyLinks(sb: SupabaseClient): Promise<PairLink[]> {
  const rows = check(await sb.rpc("get_my_links")) as {
    link_id: string;
    role: "owner" | "partner";
    status: "pending" | "active";
    other_name: string | null;
    created_at: string;
  }[];
  return (rows ?? []).map((r) => ({
    linkId: r.link_id,
    role: r.role,
    status: r.status,
    otherName: r.other_name,
    createdAt: r.created_at,
  }));
}

export async function createInviteCode(sb: SupabaseClient): Promise<string> {
  return check(await sb.rpc("create_invite_code")) as string;
}

/** Возвращает id ожидающей связи или null, если код неверный или устарел. */
export async function redeemInviteCode(sb: SupabaseClient, code: string): Promise<string | null> {
  return check(await sb.rpc("redeem_invite_code", { p_code: code })) as string | null;
}

export async function approveLink(sb: SupabaseClient, linkId: string): Promise<void> {
  check(await sb.rpc("approve_partner_link", { p_link_id: linkId }));
}

export async function revokeLink(sb: SupabaseClient, linkId: string): Promise<void> {
  check(await sb.rpc("revoke_partner_link", { p_link_id: linkId }));
}

export const SHARE_KEYS = ["prediction", "fertility", "periods", "daily_status", "libido", "mood", "symptoms"] as const;
export type ShareKey = (typeof SHARE_KEYS)[number];
export type ShareSettings = Record<ShareKey, boolean>;

export async function getShareSettings(sb: SupabaseClient, linkId: string): Promise<ShareSettings> {
  const s = check(await sb.from("share_settings").select(SHARE_KEYS.join(", ")).eq("link_id", linkId).single());
  return s as unknown as ShareSettings;
}

export async function updateShareSettings(
  sb: SupabaseClient,
  linkId: string,
  patch: Partial<ShareSettings>,
): Promise<void> {
  check(
    await sb
      .from("share_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("link_id", linkId),
  );
}

/** Когда партнёр последний раз смотрел данные (журнал видит только владелица). */
export async function getLastPartnerView(sb: SupabaseClient, linkId: string): Promise<string | null> {
  const rows = check(
    await sb.from("access_log").select("viewed_at").eq("link_id", linkId).order("viewed_at", { ascending: false }).limit(1),
  );
  return rows?.[0]?.viewed_at ?? null;
}

export interface PartnerView {
  linkId: string;
  ownerName: string | null;
  settings: ShareSettings;
  prediction?: PartnerPrediction;
  fertility?: PartnerFertility;
  periods?: { start: IsoDate; end: IsoDate | null }[];
  dayLogs?: { date: IsoDate; moods?: string[]; symptoms?: string[] }[];
  dailyStatus?: ({ date: IsoDate } & Partial<DayStatus>)[];
}

export async function getPartnerView(sb: SupabaseClient, from: IsoDate, to: IsoDate): Promise<PartnerView | null> {
  const v = check(await sb.rpc("get_partner_view", { p_from: from, p_to: to })) as Record<string, never> | null;
  if (!v) return null;
  return {
    linkId: v.link_id,
    ownerName: v.owner_name,
    settings: v.settings,
    prediction: v.prediction ?? undefined,
    fertility: v.fertility ?? undefined,
    periods: v.periods ?? undefined,
    dayLogs: v.day_logs ?? undefined,
    dailyStatus: v.daily_status ?? undefined,
  };
}

/** Строка таблицы predictions — опорные даты прогноза, которые видит партнёр (если разрешено). */
export function predictionRow(prediction: Prediction, today: IsoDate) {
  return {
    computed_for: today,
    cycle_day: prediction.cycleDay,
    phase: prediction.phase,
    next_period_date: prediction.nextPeriod.date,
    next_period_earliest: prediction.nextPeriod.earliest,
    next_period_latest: prediction.nextPeriod.latest,
    ovulation_date: prediction.ovulation,
    fertile_start: prediction.fertileWindow.start,
    fertile_end: prediction.fertileWindow.end,
    last_period_start: prediction.lastPeriodStart,
    cycle_length: prediction.cycleLength,
    period_length: prediction.periodLength,
  };
}

export async function savePredictionSnapshot(
  sb: SupabaseClient,
  userId: string,
  row: ReturnType<typeof predictionRow> | null,
): Promise<void> {
  if (!row) {
    check(await sb.from("predictions").delete().eq("user_id", userId));
    return;
  }
  check(
    await sb
      .from("predictions")
      .upsert({ user_id: userId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" }),
  );
}

// --- Статус дня владелицы ---

export async function getDayStatus(sb: SupabaseClient, userId: string, date: IsoDate): Promise<DayStatus | null> {
  const r = check(
    await sb.from("daily_status").select("energy, mood, needs, libido").eq("user_id", userId).eq("date", date).maybeSingle(),
  );
  return r ? { energy: r.energy, mood: r.mood, needs: r.needs ?? [], libido: r.libido } : null;
}

export async function saveDayStatus(sb: SupabaseClient, userId: string, date: IsoDate, status: DayStatus | null) {
  if (!status) {
    check(await sb.from("daily_status").delete().eq("user_id", userId).eq("date", date));
    return;
  }
  check(
    await sb
      .from("daily_status")
      .upsert({ user_id: userId, date, ...status, updated_at: new Date().toISOString() }, { onConflict: "user_id,date" }),
  );
}

// --- Общая лента пары ---

export interface SharedNote {
  id: string;
  authorId: string;
  date: IsoDate;
  kind: "note" | "request";
  body: string;
  doneAt: string | null;
  heartedAt: string | null;
  createdAt: string;
}

export async function listNotes(sb: SupabaseClient, linkId: string): Promise<SharedNote[]> {
  const rows = check(
    await sb
      .from("shared_notes")
      .select("id, author_id, date, kind, body, done_at, hearted_at, created_at")
      .eq("link_id", linkId)
      .order("created_at", { ascending: false })
      .limit(50),
  );
  return (rows ?? []).map((r) => ({
    id: r.id,
    authorId: r.author_id,
    date: r.date,
    kind: r.kind,
    body: r.body,
    doneAt: r.done_at,
    heartedAt: r.hearted_at,
    createdAt: r.created_at,
  }));
}

export async function addNote(
  sb: SupabaseClient,
  linkId: string,
  note: { date: IsoDate; kind: "note" | "request"; body: string },
): Promise<void> {
  check(await sb.from("shared_notes").insert({ link_id: linkId, ...note }));
}

export async function setNoteFlag(
  sb: SupabaseClient,
  noteId: string,
  flag: "done_at" | "hearted_at",
  on: boolean,
): Promise<void> {
  check(await sb.from("shared_notes").update({ [flag]: on ? new Date().toISOString() : null }).eq("id", noteId));
}

export async function deleteNote(sb: SupabaseClient, noteId: string): Promise<void> {
  check(await sb.from("shared_notes").delete().eq("id", noteId));
}

// --- Рисунки ---

export interface SavedDrawing {
  id: string;
  authorId: string;
  drawing: import("@/lib/drawing").Drawing;
  seenAt: string | null;
  createdAt: string;
}

export async function listDrawings(sb: SupabaseClient, linkId: string): Promise<SavedDrawing[]> {
  const { parseDrawing } = await import("@/lib/drawing");
  const rows = check(
    await sb
      .from("drawings")
      .select("id, author_id, background, strokes, seen_at, created_at")
      .eq("link_id", linkId)
      .order("created_at", { ascending: false })
      .limit(30),
  );
  return (rows ?? []).map((r) => ({
    id: r.id,
    authorId: r.author_id,
    drawing: parseDrawing({ background: r.background, strokes: r.strokes }),
    seenAt: r.seen_at,
    createdAt: r.created_at,
  }));
}

export async function addDrawing(
  sb: SupabaseClient,
  linkId: string,
  drawing: import("@/lib/drawing").Drawing,
): Promise<void> {
  check(await sb.from("drawings").insert({ link_id: linkId, background: drawing.background, strokes: drawing.strokes }));
}

export async function markDrawingSeen(sb: SupabaseClient, id: string): Promise<void> {
  check(await sb.from("drawings").update({ seen_at: new Date().toISOString() }).eq("id", id).is("seen_at", null));
}

export async function deleteDrawing(sb: SupabaseClient, id: string): Promise<void> {
  check(await sb.from("drawings").delete().eq("id", id));
}

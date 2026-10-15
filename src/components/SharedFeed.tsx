"use client";

import { useCallback, useEffect, useState } from "react";
import type { IsoDate } from "@/lib/cycle/dates";
import { formatDayMonth } from "@/lib/format";
import { addNote, deleteNote, listNotes, setNoteFlag, type SharedNote } from "@/lib/pair";
import { REQUESTS } from "@/lib/status";
import { getSupabase } from "@/lib/supabase/client";
import { Button, Card } from "./ui";

const NOTE_MAX = 500;

/** Общая лента пары: заметки к дням и просьбы с отметкой «Сделано». */
export function SharedFeed({
  linkId,
  meId,
  role,
  otherName,
  today,
}: {
  linkId: string;
  meId: string;
  role: "owner" | "partner";
  otherName: string;
  today: IsoDate;
}) {
  const sb = getSupabase()!;
  const [notes, setNotes] = useState<SharedNote[] | null>(null);
  const [text, setText] = useState("");
  const [asRequest, setAsRequest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listNotes(sb, linkId).then(setNotes, () => setError("Не удалось загрузить ленту. Проверьте интернет."));
  }, [sb, linkId]);

  // Лента обновляется сама, пока вкладка открыта.
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      load();
    } catch {
      setError("Не получилось. Проверьте интернет и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  /** `fromInput` — отправлен текст из поля; готовые просьбы поле не трогают. */
  const post = (kind: "note" | "request", body: string, fromInput = false) =>
    run(async () => {
      await addNote(sb, linkId, { date: today, kind, body });
      if (fromInput) {
        // Стираем только отправленное: если за это время дописали — оставляем.
        setText((current) => (current.trim() === body ? "" : current));
        setAsRequest(false);
      }
    });

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Общая лента</h2>

      {role === "owner" && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">Попросить в одно касание</span>
          <div className="flex flex-wrap gap-2">
            {REQUESTS.map((r) => (
              <button
                key={r}
                type="button"
                disabled={busy}
                onClick={() => post("request", r)}
                className="min-h-10 rounded-full border border-border bg-surface px-3.5 py-2 text-sm transition hover:bg-background disabled:opacity-40"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) post(asRequest ? "request" : "note", text.trim(), true);
        }}
      >
        <textarea
          aria-label="Новая заметка"
          className="min-h-20 rounded-2xl border border-border bg-surface p-3 text-base"
          maxLength={NOTE_MAX}
          placeholder={role === "owner" ? "Например: «в субботу годовщина»" : "Написать заметку…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex items-center justify-between gap-3">
          {role === "owner" ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--accent)]"
                checked={asRequest}
                onChange={(e) => setAsRequest(e.target.checked)}
              />
              Это просьба
            </label>
          ) : (
            <span />
          )}
          <Button type="submit" variant="secondary" disabled={busy || !text.trim()}>
            Отправить
          </Button>
        </div>
      </form>

      {error && <p className="text-sm text-warning">{error}</p>}

      {notes === null ? (
        <div aria-busy className="h-20" />
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted">
          Здесь будут заметки к дням и просьбы. {role === "owner" ? "Начните с просьбы выше." : ""}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((n) => {
            const mine = n.authorId === meId;
            const done = Boolean(n.doneAt);
            return (
              <li key={n.id} className={`rounded-2xl p-3 ${mine ? "bg-background" : "bg-period-soft"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-muted">
                    {formatDayMonth(n.date)} · {mine ? "Вы" : otherName}
                    {n.kind === "request" && " · просьба"}
                  </p>
                  {mine && (
                    <button
                      type="button"
                      aria-label="Удалить заметку"
                      className="-m-1 p-1 text-muted hover:text-foreground"
                      onClick={() => run(() => deleteNote(sb, n.id))}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <p className={`mt-1 whitespace-pre-wrap ${done ? "text-muted line-through" : ""}`}>{n.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  {n.kind === "request" &&
                    (role === "partner" ? (
                      <button
                        type="button"
                        aria-pressed={done}
                        disabled={busy}
                        onClick={() => run(() => setNoteFlag(sb, n.id, "done_at", !done))}
                        className={`rounded-full border px-3 py-1 ${done ? "border-fertile bg-fertile text-white" : "border-border bg-surface"}`}
                      >
                        {done ? "Сделано ✓" : "Сделано"}
                      </button>
                    ) : (
                      <span className={done ? "font-medium text-fertile" : "text-muted"}>
                        {done ? "Сделано ✓" : "Ждёт"}
                      </span>
                    ))}
                  {!mine ? (
                    <button
                      type="button"
                      aria-label={n.heartedAt ? "Убрать сердечко" : "Поставить сердечко"}
                      aria-pressed={Boolean(n.heartedAt)}
                      disabled={busy}
                      onClick={() => run(() => setNoteFlag(sb, n.id, "hearted_at", !n.heartedAt))}
                      className="rounded-full border border-border bg-surface px-3 py-1"
                    >
                      {n.heartedAt ? "❤️" : "🤍"}
                    </button>
                  ) : (
                    n.heartedAt && <span aria-label={`${otherName} поставил(а) сердечко`}>❤️</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

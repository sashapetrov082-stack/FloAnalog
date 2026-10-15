"use client";

import { useEffect, useRef, useState } from "react";
import type { IsoDate } from "@/lib/cycle/dates";
import { getDayStatus, saveDayStatus } from "@/lib/pair";
import { EMPTY_STATUS, ENERGY, isEmptyStatus, LIBIDO, MOOD, NEEDS, type DayStatus } from "@/lib/status";
import { notifyPartner } from "@/lib/push";
import { getSupabase } from "@/lib/supabase/client";
import { toggle } from "@/lib/journal";
import { Card } from "./ui";

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-10 rounded-full border px-3.5 py-2 text-sm transition ${
        selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface hover:bg-background"
      }`}
    >
      {children}
    </button>
  );
}

/** Статус дня в одно касание. Хранится в аккаунте; партнёр видит его, если владелица разрешила. */
export function StatusCard({ userId, today }: { userId: string; today: IsoDate }) {
  const sb = getSupabase();
  const [status, setStatus] = useState<DayStatus | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sb) return;
    getDayStatus(sb, userId, today).then(
      (s) => setStatus(s ?? EMPTY_STATUS),
      () => setStatus(EMPTY_STATUS),
    );
  }, [sb, userId, today]);

  if (!sb || !status) return null;

  // Быстрые касания подряд отправляем одним запросом.
  const update = (patch: Partial<DayStatus>) => {
    const next = { ...status, ...patch };
    setStatus(next);
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveDayStatus(sb, userId, today, isEmptyStatus(next) ? null : next).then(
        () => {
          setSaveState("saved");
          // Сервер уведомит партнёра, только если статус ему разрешено видеть, и не чаще раза в час.
          if (!isEmptyStatus(next)) notifyPartner(sb, "status");
        },
        () => setSaveState("error"),
      );
    }, 600);
  };

  const pick = <K extends "energy" | "mood" | "libido">(key: K, value: DayStatus[K]) =>
    update({ [key]: status[key] === value ? null : value } as Partial<DayStatus>);

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Статус дня</h2>
        <p className="text-sm text-muted">Партнёр увидит его, если вы разрешили это во вкладке «Пара».</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">Энергия</span>
        <div className="flex flex-wrap gap-2">
          {ENERGY.map((e) => (
            <Chip key={e.value} selected={status.energy === e.value} onClick={() => pick("energy", e.value)}>
              {e.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">Настроение</span>
        <div className="flex flex-wrap gap-2">
          {MOOD.map((m) => (
            <Chip key={m.value} selected={status.mood === m.value} onClick={() => pick("mood", m.value)}>
              <span aria-hidden>{m.emoji}</span> {m.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">Мне сейчас нужно</span>
        <div className="flex flex-wrap gap-2">
          {NEEDS.map((n) => (
            <Chip key={n.id} selected={status.needs.includes(n.id)} onClick={() => update({ needs: toggle(status.needs, n.id) })}>
              {n.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">Либидо — партнёр видит, только если включено отдельно</span>
        <div className="flex flex-wrap gap-2">
          {LIBIDO.map((l) => (
            <Chip key={l.value} selected={status.libido === l.value} onClick={() => pick("libido", l.value)}>
              {l.label}
            </Chip>
          ))}
        </div>
      </div>

      <p className="min-h-5 text-sm text-muted" role="status">
        {saveState === "saving" && "Сохраняем…"}
        {saveState === "saved" && "Сохранено"}
        {saveState === "error" && <span className="text-warning">Не сохранилось — проверьте интернет и коснитесь ещё раз.</span>}
      </p>
    </Card>
  );
}

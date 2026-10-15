"use client";

import { useEffect, useState } from "react";
import type { IsoDate } from "@/lib/cycle/dates";
import { formatLong } from "@/lib/format";
import {
  emptyLog,
  FLOW_LEVELS,
  MOODS,
  NOTE_MAX_LENGTH,
  OVULATION_TESTS,
  SYMPTOM_GROUPS,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
  toggle,
  type DayLog,
  type Option,
} from "@/lib/journal";
import { Button } from "./ui";

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-10 rounded-full border px-4 py-2 text-sm transition ${
        selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface hover:bg-background"
      }`}
    >
      {children}
    </button>
  );
}

function ChipGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-base font-semibold">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o.id} selected={selected.includes(o.id)} onClick={() => onToggle(o.id)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </fieldset>
  );
}

/** Полноэкранный журнал дня. Изменения сохраняются сразу. */
export function DayLogEditor({
  date,
  log,
  onChange,
  onClose,
  conception = false,
}: {
  date: IsoDate;
  log: DayLog | undefined;
  onChange: (log: DayLog) => void;
  onClose: () => void;
  /** Режим зачатия: показать температуру и тест на овуляцию первыми. */
  conception?: boolean;
}) {
  const [draft, setDraft] = useState<DayLog>(() => log ?? emptyLog());
  const showConception = conception || draft.temperature != null || !!draft.ovulationTest;

  // Закрытие по Esc и блокировка прокрутки фона.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const update = (patch: Partial<DayLog>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange(next);
  };

  return (
    <div role="dialog" aria-modal aria-label="Журнал дня" className="fixed inset-0 z-20 overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-7 px-4 pb-28 pt-6">
        <header className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-muted">Журнал дня</p>
            <h1 className="text-2xl font-semibold first-letter:uppercase">{formatLong(date)}</h1>
          </div>
          <Button variant="ghost" className="-mr-3 px-3" onClick={onClose} aria-label="Закрыть">
            ✕
          </Button>
        </header>

        {showConception && (
          <>
            <TemperatureField value={draft.temperature ?? null} onChange={(temperature) => update({ temperature })} />
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-base font-semibold">Тест на овуляцию</legend>
              <div className="flex flex-wrap gap-2">
                {OVULATION_TESTS.map((t) => (
                  <Chip
                    key={t.id}
                    selected={draft.ovulationTest === t.id}
                    onClick={() => update({ ovulationTest: draft.ovulationTest === t.id ? null : t.id })}
                  >
                    {t.label}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-base font-semibold">Месячные</legend>
          <div className="flex flex-wrap gap-2">
            {FLOW_LEVELS.map((f) => (
              <Chip
                key={f.id}
                selected={draft.flow === f.id}
                onClick={() => update({ flow: draft.flow === f.id ? null : f.id })}
              >
                {f.label}
              </Chip>
            ))}
          </div>
        </fieldset>

        <ChipGroup
          title="Настроение"
          options={MOODS}
          selected={draft.moods}
          onToggle={(id) => update({ moods: toggle(draft.moods, id) })}
        />

        {SYMPTOM_GROUPS.map((g) => (
          <ChipGroup
            key={g.id}
            title={g.title}
            options={g.options}
            selected={draft.symptoms}
            onToggle={(id) => update({ symptoms: toggle(draft.symptoms, id) })}
          />
        ))}

        <label className="flex flex-col gap-3">
          <span className="text-base font-semibold">Заметка</span>
          <textarea
            className="min-h-28 rounded-2xl border border-border bg-surface p-4 text-base"
            maxLength={NOTE_MAX_LENGTH}
            placeholder="Только для вас"
            value={draft.note ?? ""}
            onChange={(e) => update({ note: e.target.value })}
          />
        </label>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <Button className="w-full" onClick={onClose}>
            Готово
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Базальная температура: можно вводить через запятую или точку. Пустое поле — удалить. */
function TemperatureField({ value, onChange }: { value: number | null; onChange: (t: number | null) => void }) {
  const [text, setText] = useState(() => (value == null ? "" : value.toFixed(2).replace(".", ",")));
  const parsed = Number(text.trim().replace(",", "."));
  const valid = text.trim() === "" || (Number.isFinite(parsed) && parsed >= TEMPERATURE_MIN && parsed <= TEMPERATURE_MAX);
  return (
    <label className="flex flex-col gap-2">
      <span className="text-base font-semibold">Базальная температура, °C</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="например, 36,55"
        value={text}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d.,]/g, "").slice(0, 5);
          setText(next);
          const n = Number(next.trim().replace(",", "."));
          if (next.trim() === "") onChange(null);
          else if (Number.isFinite(n) && n >= TEMPERATURE_MIN && n <= TEMPERATURE_MAX) onChange(Math.round(n * 100) / 100);
        }}
        aria-invalid={!valid}
        className="w-40 rounded-2xl border border-border bg-surface px-4 py-3 text-lg tabular-nums"
      />
      <span className={`text-sm ${valid ? "text-muted" : "text-warning"}`}>
        {valid
          ? "Утром, сразу после сна, до того как встать, — в одно и то же время."
          : `Введите значение от ${TEMPERATURE_MIN} до ${String(TEMPERATURE_MAX).replace(".", ",")}`}
      </span>
    </label>
  );
}

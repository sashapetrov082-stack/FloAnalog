"use client";

import { useState } from "react";
import type { IsoDate } from "@/lib/cycle/dates";
import type { Period } from "@/lib/cycle/predict";
import { formatDayMonth, formatRange } from "@/lib/format";
import { ImportError, readImportFile } from "@/lib/import/file";
import { applyImport, parseDateList, planImport, rangeOf, type ImportPlan } from "@/lib/import/periods";
import { Button, Card } from "./ui";

function yearOf(date: IsoDate) {
  return date.slice(0, 4);
}

/** Импорт истории месячных из Flo, Clue или списком дат. Всё разбирается на устройстве. */
export function ImportDialog({
  periods,
  today,
  onImport,
  onClose,
}: {
  periods: Period[];
  today: IsoDate;
  onImport: (next: Period[], added: number) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"file" | "list">("file");
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = (found: Period[]) => {
    if (found.length === 0) {
      setPlan(null);
      setError(
        mode === "file"
          ? "В файле не нашлось дат месячных. Попробуйте вкладку «Списком дат» — их можно переписать из истории в приложении."
          : "Не нашлось ни одной даты.",
      );
      return;
    }
    setError(null);
    setPlan(planImport(periods, found, today));
  };

  const range = plan ? rangeOf(plan.found) : null;

  return (
    <div role="dialog" aria-modal aria-label="Импорт" className="fixed inset-0 z-30 overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
        <header className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold">Перенос истории месячных</h1>
          <Button variant="ghost" className="-mr-3 px-3" onClick={onClose} aria-label="Закрыть">
            ✕
          </Button>
        </header>
        <p className="text-sm text-muted">
          С историей прогноз сразу станет точнее. Файл разбирается прямо на этом устройстве и никуда не отправляется.
        </p>

        <div className="grid grid-cols-2 gap-2" role="tablist">
          {(["file", "list"] as const).map((m) => (
            <Button
              key={m}
              role="tab"
              aria-selected={mode === m}
              variant={mode === m ? "primary" : "secondary"}
              onClick={() => {
                setMode(m);
                setPlan(null);
                setError(null);
              }}
            >
              {m === "file" ? "Из файла" : "Списком дат"}
            </Button>
          ))}
        </div>

        {mode === "file" ? (
          <Card className="flex flex-col gap-3 text-sm">
            <p>
              <b>Flo:</b> запросите копию своих данных в формате JSON —{" "}
              <a className="text-accent underline" href="https://help.flo.health/hc/en-us/articles/360054973811" target="_blank" rel="noreferrer">
                инструкция Flo
              </a>
              . Файл придёт на почту в архиве с паролем.
            </p>
            <p>
              <b>Clue:</b> запросите копию данных —{" "}
              <a className="text-accent underline" href="https://support.helloclue.com/hc/en-us/articles/17320910724125" target="_blank" rel="noreferrer">
                инструкция Clue
              </a>
              . Придёт ссылка на архив с паролем.
            </p>
            <p className="text-muted">
              Распакуйте архив паролем из письма и выберите файл <b>.json</b> (у Clue — <b>measurements.json</b>). Архив без
              пароля можно выбрать целиком.
            </p>
            <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-2xl bg-accent px-5 py-3 font-medium text-accent-foreground">
              {busy ? "Читаем файл…" : "Выбрать файл"}
              <input
                type="file"
                accept=".json,.cluedata,.zip,.txt,application/json,application/zip,text/plain"
                className="sr-only"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setBusy(true);
                  try {
                    preview(await readImportFile(file));
                  } catch (err) {
                    setPlan(null);
                    setError(err instanceof ImportError ? err.message : "Не получилось прочитать файл.");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
          </Card>
        ) : (
          <Card className="flex flex-col gap-3 text-sm">
            <p>
              По одной записи в строке: дата начала или начало и конец. Даты можно переписать из истории циклов во Flo
              или Clue.
            </p>
            <textarea
              aria-label="Даты месячных"
              className="min-h-40 rounded-2xl border border-border bg-surface p-3 font-mono text-base"
              placeholder={"12.03.2026\n09.04.2026 – 13.04.2026\n2026-05-07"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button
              variant="secondary"
              disabled={!text.trim()}
              onClick={() => {
                const result = parseDateList(text);
                setBad(result.bad);
                preview(result.periods);
              }}
            >
              Проверить
            </Button>
            {bad.length > 0 && (
              <p className="text-warning">
                Не поняли строки: {bad.slice(0, 3).join("; ")}
                {bad.length > 3 ? ` и ещё ${bad.length - 3}` : ""}. Они не будут импортированы.
              </p>
            )}
          </Card>
        )}

        {error && <p className="rounded-2xl bg-warning-soft p-4 text-sm text-warning">{error}</p>}

        {plan && range && (
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              Найдено месячных: {plan.found.length}
              {yearOf(range.from) === yearOf(range.to)
                ? ` (${formatRange(range.from, range.to)} ${yearOf(range.to)})`
                : ` (${formatDayMonth(range.from)} ${yearOf(range.from)} — ${formatDayMonth(range.to)} ${yearOf(range.to)})`}
            </h2>
            <p className="text-sm text-muted">
              {plan.added.length > 0 ? `Новых: ${plan.added.length}.` : "Все они уже отмечены."}
              {plan.skipped > 0 && ` Уже есть в календаре: ${plan.skipped} — их не трогаем.`}
            </p>
            {plan.added.length > 0 && (
              <Button onClick={() => onImport(applyImport(periods, plan), plan.added.length)}>
                Добавить {plan.added.length} в календарь
              </Button>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

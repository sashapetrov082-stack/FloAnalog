"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addPoint,
  BACKGROUNDS,
  BRUSHES,
  COLORS,
  MAX_POINTS,
  paintDrawing,
  pointCount,
  SIZES,
  type Brush,
  type Drawing,
  type Stroke,
} from "@/lib/drawing";
import {
  addDrawing,
  deleteDrawing,
  getMyLinks,
  listDrawings,
  markDrawingSeen,
  type PairLink,
  type SavedDrawing,
} from "@/lib/pair";
import { notifyPartner } from "@/lib/push";
import { getSupabase } from "@/lib/supabase/client";
import { Button, Card } from "./ui";

/** Холст фиксированного размера в CSS-пикселях с учётом плотности экрана. */
function useCanvas(size: number) {
  const ref = useRef<HTMLCanvasElement>(null);
  const getCtx = useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return null;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }, [size]);
  return [ref, getCtx] as const;
}

/** Ширина, доступная холсту (квадрат по ширине контейнера). */
function useSquareSize(max = 480) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize(Math.min(max, Math.floor(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [max]);
  return [ref, size] as const;
}

/** Показ рисунка; `play` — проиграть штрих за штрихом. */
export function DrawingView({ drawing, play = false, label }: { drawing: Drawing; play?: boolean; label: string }) {
  const [boxRef, boxSize] = useSquareSize();
  const [ref, getCtx] = useCanvas(boxSize);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    const ctx = getCtx();
    if (!ctx || !boxSize) return;
    if (!play && replay === 0) {
      paintDrawing(ctx, drawing, boxSize);
      return;
    }
    // Длительность зависит от количества точек: 1,5–5 секунд.
    const duration = Math.min(5000, Math.max(1500, pointCount(drawing.strokes) * 4));
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      paintDrawing(ctx, drawing, boxSize, progress);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [drawing, play, replay, boxSize, getCtx]);

  return (
    <div ref={boxRef} className="relative w-full">
      <canvas
        ref={ref}
        role="img"
        aria-label={label}
        style={{ width: boxSize, height: boxSize }}
        className="mx-auto block rounded-3xl"
      />
      <button
        type="button"
        aria-label="Проиграть рисунок"
        onClick={() => setReplay((r) => r + 1)}
        className="absolute bottom-3 right-3 rounded-full bg-black/30 px-3 py-1.5 text-sm text-white backdrop-blur"
      >
        ▶
      </button>
    </div>
  );
}

/** Редактор на весь экран. */
export function DrawingEditor({
  otherName,
  onSend,
  onClose,
}: {
  otherName: string;
  onSend: (d: Drawing) => Promise<void>;
  onClose: () => void;
}) {
  const [boxRef, boxSize] = useSquareSize(560);
  const [ref, getCtx] = useCanvas(boxSize);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [brush, setBrush] = useState<Brush>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [background, setBackground] = useState(BACKGROUNDS[0].id);
  const [panel, setPanel] = useState<"brush" | "background" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = pointCount(strokes) >= MAX_POINTS;

  useEffect(() => {
    const ctx = getCtx();
    if (!ctx || !boxSize) return;
    paintDrawing(ctx, { background, strokes: current ? [...strokes, current] : strokes }, boxSize);
  }, [strokes, current, background, boxSize, getCtx]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const toPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * 1000, ((e.clientY - rect.top) / rect.height) * 1000] as const;
  };

  return (
    <div role="dialog" aria-modal aria-label="Рисунок" className="fixed inset-0 z-30 flex flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 px-4 py-4">
        <header className="flex items-center justify-between gap-2">
          <Button variant="ghost" className="-ml-3 px-3" onClick={onClose}>
            Отмена
          </Button>
          <h1 className="text-base font-semibold">Рисунок · {otherName}</h1>
          <Button
            className="px-4 py-2"
            disabled={busy || strokes.length === 0}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSend({ background, strokes });
              } catch {
                setError("Не отправилось. Проверьте интернет и попробуйте ещё раз.");
                setBusy(false);
              }
            }}
          >
            {busy ? "…" : "Отправить"}
          </Button>
        </header>

        <div ref={boxRef} className="w-full">
          <canvas
            ref={ref}
            aria-label="Холст для рисования"
            style={{ width: boxSize, height: boxSize, touchAction: "none" }}
            className="mx-auto block rounded-3xl shadow-sm"
            onPointerDown={(e) => {
              if (full) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const [x, y] = toPoint(e);
              setPanel(null);
              setCurrent({ c: color, s: size, b: brush, p: addPoint([], x, y) });
            }}
            onPointerMove={(e) => {
              if (!current) return;
              const [x, y] = toPoint(e);
              setCurrent((c) => (c ? { ...c, p: addPoint(c.p, x, y) } : c));
            }}
            onPointerUp={() => {
              if (current) setStrokes((s) => [...s, current]);
              setCurrent(null);
            }}
            onPointerCancel={() => setCurrent(null)}
          />
        </div>

        {full && <p className="text-sm text-warning">Холст заполнен — отправьте рисунок или отмените последние штрихи.</p>}
        {error && <p className="text-sm text-warning">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="secondary" className="px-4" disabled={!strokes.length} onClick={() => setStrokes((s) => s.slice(0, -1))} aria-label="Отменить штрих">
              ↶
            </Button>
            <Button variant="secondary" className="px-4" disabled={!strokes.length} onClick={() => setStrokes([])} aria-label="Очистить">
              🗑
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant={panel === "brush" ? "primary" : "secondary"} className="px-4" onClick={() => setPanel(panel === "brush" ? null : "brush")}>
              Кисть
            </Button>
            <Button variant={panel === "background" ? "primary" : "secondary"} className="px-4" onClick={() => setPanel(panel === "background" ? null : "background")}>
              Фон
            </Button>
          </div>
        </div>

        {/* Цвета всегда под рукой. */}
        <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Цвет">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`Цвет ${c}`}
              onClick={() => setColor(c)}
              style={{ background: c }}
              className={`h-9 w-9 rounded-full border border-border ${color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`}
            />
          ))}
        </div>

        {panel === "brush" && (
          <Card className="flex flex-col gap-3">
            <div className="grid grid-cols-4 gap-2">
              {BRUSHES.map((b) => (
                <Button key={b.id} variant={brush === b.id ? "primary" : "secondary"} className="px-2 text-sm" onClick={() => setBrush(b.id)}>
                  {b.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center justify-around" role="radiogroup" aria-label="Толщина">
              {SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={size === s}
                  aria-label={`Толщина ${s}`}
                  onClick={() => setSize(s)}
                  className={`flex h-12 w-12 items-center justify-center rounded-full ${size === s ? "bg-period-soft" : ""}`}
                >
                  <span className="rounded-full bg-foreground" style={{ width: s / 1.5 + 2, height: s / 1.5 + 2 }} />
                </button>
              ))}
            </div>
          </Card>
        )}

        {panel === "background" && (
          <Card className="grid grid-cols-3 gap-2">
            {BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={background === b.id}
                onClick={() => setBackground(b.id)}
                style={{ background: `linear-gradient(135deg, ${b.stops[0]}, ${b.stops[1]})` }}
                className={`h-16 rounded-2xl text-sm font-medium ${b.id === "night" ? "text-white" : "text-foreground"} ${background === b.id ? "ring-2 ring-foreground" : ""}`}
              >
                {b.label}
              </button>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ч назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

/** Вкладка «Рисунки». */
export function DrawingsTab({ userId }: { userId: string | null }) {
  const sb = getSupabase();
  const [link, setLink] = useState<PairLink | null | undefined>(undefined);
  const [items, setItems] = useState<SavedDrawing[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [opened, setOpened] = useState<SavedDrawing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb || !userId) return;
    try {
      const active = (await getMyLinks(sb)).find((l) => l.status === "active") ?? null;
      setLink(active);
      setItems(active ? await listDrawings(sb, active.linkId) : []);
      setError(null);
    } catch {
      setError("Не удалось загрузить рисунки. Проверьте интернет.");
    }
  }, [sb, userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const otherName = link?.otherName ?? "Партнёр";
  const latestFromOther = items?.find((d) => d.authorId !== userId) ?? null;

  // Новый рисунок от партнёра отмечаем просмотренным, когда он на экране.
  useEffect(() => {
    if (sb && latestFromOther && !latestFromOther.seenAt) markDrawingSeen(sb, latestFromOther.id).catch(() => undefined);
  }, [sb, latestFromOther]);

  if (!sb || !userId) {
    return (
      <Card>
        <p className="text-sm text-muted">Рисунки друг для друга работают в режиме пары — войдите в аккаунт и подключите партнёра во вкладке «Пара».</p>
      </Card>
    );
  }
  if (error && link === undefined) return <p className="text-sm text-warning">{error}</p>;
  if (link === undefined || items === null) return <div aria-busy className="h-40" />;
  if (!link) {
    return (
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Рисунки друг для друга</h2>
        <p className="text-sm text-muted">Подключите партнёра во вкладке «Пара» — и сможете отправлять друг другу рисунки.</p>
      </Card>
    );
  }

  return (
    <>
      <header>
        <p className="text-sm text-muted">Рисунки</p>
        <h1 className="text-2xl font-semibold">Вы и {link.otherName ?? "партнёр"}</h1>
      </header>

      {latestFromOther ? (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {link.otherName ?? "Партнёр"} · {timeAgo(latestFromOther.createdAt)}
          </p>
          <DrawingView drawing={latestFromOther.drawing} play={!latestFromOther.seenAt} label={`Рисунок: ${link.otherName ?? "партнёр"}`} />
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-muted">{otherName} ещё ничего не нарисовал(а). Начните первыми!</p>
        </Card>
      )}

      <Button onClick={() => setEditing(true)}>Нарисовать</Button>
      {error && <p className="text-sm text-warning">{error}</p>}

      {items.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Все рисунки</h2>
          <ul className="grid grid-cols-3 gap-2">
            {items.map((d) => (
              <li key={d.id}>
                <button type="button" className="block w-full" onClick={() => setOpened(d)} aria-label={`Открыть рисунок: ${d.authorId === userId ? "вы" : (link.otherName ?? "партнёр")}`}>
                  <Thumb drawing={d.drawing} />
                  <span className="mt-1 block text-xs text-muted">{d.authorId === userId ? "Вы" : link.otherName}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {opened && (
        <div role="dialog" aria-modal aria-label="Рисунок" className="fixed inset-0 z-30 overflow-y-auto bg-background">
          <div className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">
                {opened.authorId === userId ? "Вы" : link.otherName} · {timeAgo(opened.createdAt)}
              </p>
              <Button variant="ghost" className="-mr-3 px-3" onClick={() => setOpened(null)} aria-label="Закрыть">
                ✕
              </Button>
            </div>
            <DrawingView drawing={opened.drawing} play label="Рисунок" />
            {opened.authorId === userId && (
              <Button
                variant="danger"
                onClick={async () => {
                  await deleteDrawing(sb, opened.id).catch(() => setError("Не удалось удалить."));
                  setOpened(null);
                  load();
                }}
              >
                Удалить рисунок
              </Button>
            )}
          </div>
        </div>
      )}

      {editing && (
        <DrawingEditor
          otherName={otherName}
          onClose={() => setEditing(false)}
          onSend={async (d) => {
            await addDrawing(sb, link.linkId, d);
            notifyPartner(sb, "drawing");
            setEditing(false);
            load();
          }}
        />
      )}
    </>
  );
}

function Thumb({ drawing }: { drawing: Drawing }) {
  const [boxRef, boxSize] = useSquareSize(200);
  const [ref, getCtx] = useCanvas(boxSize);
  useEffect(() => {
    const ctx = getCtx();
    if (ctx && boxSize) paintDrawing(ctx, drawing, boxSize);
  }, [drawing, boxSize, getCtx]);
  return (
    <div ref={boxRef} className="w-full">
      <canvas ref={ref} style={{ width: boxSize, height: boxSize }} className="block rounded-2xl" />
    </div>
  );
}

// Рисунки друг для друга: формат хранения, кисти, фоны и отрисовка на canvas.
// Координаты хранятся в долях холста (0…1000), поэтому рисунок одинаково
// выглядит на телефоне и компьютере.

export const SCALE = 1000;
/** Ограничение размера — совпадает с проверкой в базе (300 КБ). */
export const MAX_POINTS = 20_000;

export type Brush = "pen" | "neon" | "rainbow" | "marker";

export interface Stroke {
  /** Цвет (#rrggbb). У радуги не используется. */
  c: string;
  /** Толщина в долях холста (из 1000). */
  s: number;
  b: Brush;
  /** Точки подряд: x1, y1, x2, y2, … в долях холста. */
  p: number[];
}

export interface Drawing {
  background: string;
  strokes: Stroke[];
}

export const BRUSHES: { id: Brush; label: string }[] = [
  { id: "pen", label: "Кисть" },
  { id: "neon", label: "Неон" },
  { id: "rainbow", label: "Радуга" },
  { id: "marker", label: "Маркер" },
];

export const COLORS = ["#e0557f", "#c2416b", "#ff8a3d", "#ffd23f", "#4cc2b1", "#3d7bff", "#8b5cf6", "#1f1a1c", "#ffffff"];

export const SIZES = [6, 12, 20, 32];

export const BACKGROUNDS: { id: string; label: string; stops: [string, string] }[] = [
  { id: "blush", label: "Румянец", stops: ["#ffd6e3", "#f7a8c1"] },
  { id: "lavender", label: "Лаванда", stops: ["#e6dcff", "#b9a3f5"] },
  { id: "peach", label: "Персик", stops: ["#ffe7d1", "#ffc19e"] },
  { id: "mint", label: "Мята", stops: ["#d9f7ee", "#9fe3cf"] },
  { id: "night", label: "Ночь", stops: ["#2b2040", "#59325e"] },
  { id: "paper", label: "Бумага", stops: ["#fffaf5", "#f3ece4"] },
];

export function pointCount(strokes: Stroke[]): number {
  return strokes.reduce((n, s) => n + s.p.length / 2, 0);
}

/** Проверка рисунка, пришедшего с сервера: битые штрихи отбрасываем, а не падаем. */
export function parseDrawing(raw: { background?: unknown; strokes?: unknown }): Drawing {
  const background = BACKGROUNDS.some((b) => b.id === raw.background) ? (raw.background as string) : "blush";
  const strokes = Array.isArray(raw.strokes)
    ? raw.strokes.filter(
        (s): s is Stroke =>
          !!s &&
          typeof s.c === "string" &&
          /^#[0-9a-f]{6}$/i.test(s.c) &&
          typeof s.s === "number" &&
          BRUSHES.some((b) => b.id === s.b) &&
          Array.isArray(s.p) &&
          s.p.length >= 2 &&
          s.p.length % 2 === 0 &&
          s.p.every((v: unknown) => typeof v === "number" && v >= 0 && v <= SCALE),
      )
    : [];
  return { background, strokes };
}

/** Добавляет точку, пропуская слишком близкие — так рисунок меньше весит. */
export function addPoint(points: number[], x: number, y: number, minStep = 3): number[] {
  const px = Math.round(Math.min(SCALE, Math.max(0, x)));
  const py = Math.round(Math.min(SCALE, Math.max(0, y)));
  const n = points.length;
  if (n >= 2 && Math.hypot(points[n - 2] - px, points[n - 1] - py) < minStep) return points;
  return [...points, px, py];
}

/** Часть рисунка для проигрывания: первые `progress` (0…1) от всех точек по порядку. */
export function partialStrokes(strokes: Stroke[], progress: number): Stroke[] {
  const total = pointCount(strokes);
  let left = Math.ceil(total * Math.min(1, Math.max(0, progress)));
  const out: Stroke[] = [];
  for (const s of strokes) {
    if (left <= 0) break;
    const take = Math.min(left, s.p.length / 2);
    out.push(take * 2 === s.p.length ? s : { ...s, p: s.p.slice(0, take * 2) });
    left -= take;
  }
  return out;
}

// --- Отрисовка (только в браузере) ---

export function paintBackground(ctx: CanvasRenderingContext2D, id: string, w: number, h: number) {
  const bg = BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0];
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, bg.stops[0]);
  g.addColorStop(1, bg.stops[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function strokePath(ctx: CanvasRenderingContext2D, p: number[], k: number) {
  ctx.beginPath();
  ctx.moveTo(p[0] * k, p[1] * k);
  if (p.length === 2) {
    ctx.lineTo(p[0] * k + 0.01, p[1] * k);
  } else {
    // Сглаживание: кривые через середины отрезков.
    for (let i = 2; i < p.length - 2; i += 2) {
      const mx = ((p[i] + p[i + 2]) / 2) * k;
      const my = ((p[i + 1] + p[i + 3]) / 2) * k;
      ctx.quadraticCurveTo(p[i] * k, p[i + 1] * k, mx, my);
    }
    ctx.lineTo(p[p.length - 2] * k, p[p.length - 1] * k);
  }
  ctx.stroke();
}

export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, size: number) {
  const k = size / SCALE;
  const width = Math.max(1, stroke.s * k);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = width;

  if (stroke.b === "rainbow") {
    // Радуга: цвет меняется вдоль линии.
    const p = stroke.p;
    for (let i = 0; i < p.length - 2; i += 2) {
      ctx.strokeStyle = `hsl(${(i * 4) % 360} 90% 60%)`;
      ctx.beginPath();
      ctx.moveTo(p[i] * k, p[i + 1] * k);
      ctx.lineTo(p[i + 2] * k, p[i + 3] * k);
      ctx.stroke();
    }
    if (p.length === 2) strokePath(ctx, p, k);
  } else if (stroke.b === "neon") {
    ctx.strokeStyle = stroke.c;
    ctx.shadowColor = stroke.c;
    ctx.shadowBlur = width * 1.5;
    strokePath(ctx, stroke.p, k);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = width * 0.35;
    strokePath(ctx, stroke.p, k);
  } else if (stroke.b === "marker") {
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = stroke.c;
    strokePath(ctx, stroke.p, k);
  } else {
    ctx.strokeStyle = stroke.c;
    strokePath(ctx, stroke.p, k);
  }
  ctx.restore();
}

/** Рисует рисунок на квадратном холсте размера `size` пикселей. */
export function paintDrawing(ctx: CanvasRenderingContext2D, drawing: Drawing, size: number, progress = 1) {
  paintBackground(ctx, drawing.background, size, size);
  for (const s of progress >= 1 ? drawing.strokes : partialStrokes(drawing.strokes, progress)) paintStroke(ctx, s, size);
}

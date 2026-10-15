// Генерирует иконки приложения из SVG: node scripts/make-icons.mjs
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

// padding — доля поля вокруг знака (для «маскируемой» иконки Android нужен запас).
const svg = (padding) => {
  const s = 512;
  const r = s * (0.19 - padding * 0.12);
  const cx = s / 2, cy = s / 2, d = r * 0.62;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ec6f96"/><stop offset="1" stop-color="#b8365f"/></linearGradient></defs>
  <rect width="${s}" height="${s}" fill="url(#g)"/>
  <circle cx="${cx - d}" cy="${cy}" r="${r}" fill="none" stroke="#fff" stroke-width="${s * 0.045}"/>
  <circle cx="${cx + d}" cy="${cy}" r="${r}" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="${s * 0.045}"/>
</svg>`;
};

const out = [
  ["public/icon-192.png", 192, 0],
  ["public/icon-512.png", 512, 0],
  ["public/icon-maskable-512.png", 512, 1],
  ["src/app/apple-icon.png", 180, 0],
  ["src/app/icon.png", 64, 0],
];
for (const [file, size, pad] of out) {
  await writeFile(file, await sharp(Buffer.from(svg(pad))).resize(size, size).png().toBuffer());
  console.log(file);
}

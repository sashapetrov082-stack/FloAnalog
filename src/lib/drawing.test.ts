import { describe, expect, it } from "vitest";
import { addPoint, parseDrawing, partialStrokes, pointCount, type Stroke } from "./drawing";

const a: Stroke = { c: "#e0557f", s: 12, b: "pen", p: [0, 0, 10, 10, 20, 20] };
const b: Stroke = { c: "#3d7bff", s: 6, b: "neon", p: [100, 100, 200, 200] };

describe("рисунки", () => {
  it("точки ограничены холстом, слишком близкие пропускаются", () => {
    expect(addPoint([], -5, 1200)).toEqual([0, 1000]);
    expect(addPoint([10, 10], 11, 11)).toEqual([10, 10]);
    expect(addPoint([10, 10], 20, 10)).toEqual([10, 10, 20, 10]);
  });

  it("проигрывание: часть точек по порядку штрихов", () => {
    expect(pointCount([a, b])).toBe(5);
    expect(partialStrokes([a, b], 0)).toEqual([]);
    expect(partialStrokes([a, b], 0.4)).toEqual([{ ...a, p: [0, 0, 10, 10] }]);
    expect(partialStrokes([a, b], 0.8)).toEqual([a, { ...b, p: [100, 100] }]);
    expect(partialStrokes([a, b], 1)).toEqual([a, b]);
  });

  it("битые данные с сервера отбрасываются", () => {
    const d = parseDrawing({
      background: "unknown",
      strokes: [a, { ...b, c: "red" }, { ...b, p: [1, 2, 3] }, { ...b, b: "laser" }, { ...b, p: [5000, 1] }, null],
    });
    expect(d.background).toBe("blush");
    expect(d.strokes).toEqual([a]);
  });
});

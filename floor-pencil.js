/* Wall-pencil geometry. Drafts never mutate the saved floor plan. */
(function (root, factory) {
  const api = typeof module === "object" && module.exports ? factory(require("./floor-geometry.js"), require("./floor-partition.js")) : factory(root.PanelFloorGeometry, root.PanelFloorPartition);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PanelFloorPencil = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (G, Partition) {
  "use strict";
  const EPS = 1e-6, MIN = .15;
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const id = () => globalThis.crypto?.randomUUID?.() || `pencil-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const round = (n) => Math.round(n * 1e6) / 1e6;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const validPoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 100 && Math.abs(p.y) <= 100;
  function project(p, a, b) {
    const u = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1)));
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  }
  function meets(a, b, c, d) {
    return cross(a, b, c) * cross(a, b, d) < -EPS && cross(c, d, a) * cross(c, d, b) < -EPS ||
      [[a, c, d], [b, c, d], [c, a, b], [d, a, b]].some(([p, u, v]) => distance(p, project(p, u, v)) < EPS);
  }
  function snapTargets(plan, point, hostId) {
    const targets = [];
    for (const room of plan.rooms) {
      G.edgesOf(room).forEach(({ a, b, ring, hole }) => {
        const signed = ring.vertices.reduce((sum, a, i) => { const b = ring.vertices[(i + 1) % ring.vertices.length]; return sum + a.x * b.y - b.x * a.y; }, 0), sign = (signed >= 0 ? 1 : -1) * (hole ? -1 : 1), thickness = room.id === hostId ? 0 : plan.wallThicknessM;
        const length = distance(a, b);
        if (!length) return;
        // Room polygons describe clear inside dimensions. The outside face of
        // a shared wall is one wall thickness away, rather than inside a room.
        const dx = (b.y - a.y) / length * sign * thickness, dy = -(b.x - a.x) / length * sign * thickness;
        const u = { x: a.x + dx, y: a.y + dy }, v = { x: b.x + dx, y: b.y + dy };
        targets.push({ point: u, hint: "Кут суміжної стіни" }, { point: v, hint: "Кут суміжної стіни" }, { point: project(point, u, v), hint: "Прив’язка до стіни" });
      });
    }
    return targets;
  }
  function resolve(plan, vertices, raw, { orthogonal = true, snap = true, gridM = .1, toleranceM = .18 } = {}) {
    if (!validPoint(raw)) throw new Error("Точка має бути в межах ±100 м.");
    const last = vertices.at(-1), first = vertices[0], tolerance = Math.max(.03, Math.min(.3, toleranceM));
    if (vertices.length >= 3 && distance(raw, first) <= tolerance) return { point: { ...first }, close: true, hint: "Замкнути кімнату", axis: "", orthogonal };
    const step = Number.isFinite(gridM) && gridM >= .01 && gridM <= 1 ? gridM : .1;
    let point = snap ? { x: Math.round(raw.x / step) * step, y: Math.round(raw.y / step) * step } : { ...raw }, axis = "", hint = snap ? "Сітка" : "";
    if (last && orthogonal) {
      axis = Math.abs(raw.x - last.x) >= Math.abs(raw.y - last.y) ? "x" : "y";
      point[axis === "x" ? "y" : "x"] = last[axis === "x" ? "y" : "x"];
      hint = axis === "x" ? "Горизонтально · 0°" : "Вертикально · 90°";
    }
    if (snap) {
      const host = plan.rooms.find((r) => G.contains(r, first || raw));
      const target = snapTargets(plan, point, host?.id).filter((t) => distance(t.point, raw) <= tolerance && (!axis || Math.abs(t.point[axis === "x" ? "y" : "x"] - last[axis === "x" ? "y" : "x"]) < EPS)).sort((a, b) => distance(a.point, raw) - distance(b.point, raw))[0];
      if (target) { point = target.point; hint = target.hint; }
      else if (last && axis) {
        const candidates = [...vertices.slice(0, -1), ...plan.rooms.flatMap(G.verticesOf)].filter((p) => Math.abs(p[axis] - raw[axis]) <= tolerance).sort((a, b) => Math.abs(a[axis] - raw[axis]) - Math.abs(b[axis] - raw[axis]));
        if (candidates.length) { point[axis] = candidates[0][axis]; hint += " · вирівняно з кутом"; }
      }
    }
    return { point: { x: round(point.x), y: round(point.y) }, close: false, axis, hint, orthogonal };
  }
  function append(vertices, point) {
    if (!validPoint(point)) throw new Error("Точка має бути в межах ±100 м.");
    if (vertices.length >= 48) throw new Error("У кімнаті може бути не більше 48 кутів.");
    const last = vertices.at(-1), previous = vertices.at(-2);
    if (last && distance(last, point) < MIN - EPS) throw new Error("Стіна має бути не коротшою за 0,15 м.");
    if (previous && Math.abs(cross(previous, last, point)) < EPS && (last.x - previous.x) * (point.x - last.x) + (last.y - previous.y) * (point.y - last.y) < 0) throw new Error("Стіна повертається поверх попередньої. Скасуйте останній кут.");
    for (let i = 0; last && i < vertices.length - 2; i++) if (meets(vertices[i], vertices[i + 1], last, point)) throw new Error("Нова стіна перетинає вже намальований контур.");
    return [...vertices.map((p) => ({ ...p })), { x: round(point.x), y: round(point.y) }];
  }
  function closures(vertices, orthogonal = true) {
    const points = vertices.map((p) => ({ x: p.x, y: p.y }));
    if (points.length > 1 && distance(points[0], points.at(-1)) < EPS) points.pop();
    if (points.length < 3) return [points];
    const first = points[0], last = points.at(-1), previous = points.at(-2);
    if (!orthogonal || Math.abs(first.x - last.x) < EPS || Math.abs(first.y - last.y) < EPS) return [points];
    const elbows = [{ x: first.x, y: last.y }, { x: last.x, y: first.y }];
    if (Math.abs(last.x - previous.x) > Math.abs(last.y - previous.y)) elbows.reverse();
    return elbows.map((elbow) => [...points, elbow]);
  }
  function complete(input, vertices, { orthogonal = true, name = "" } = {}) {
    if (input.geometryMode !== "free") throw new Error("Спочатку підготуйте довільну геометрію плану.");
    if (input.rooms.length >= 24) throw new Error("На плані може бути не більше 24 кімнат.");
    let error;
    for (const polygon of closures(vertices, orthogonal)) {
      try {
        if (polygon.length < 3) throw new Error("Намалюйте щонайменше дві стіни й три кути, потім замкніть контур.");
        const plan = copy(input), roomId = id(), box = G.bounds(polygon);
        const room = { id: roomId, kind: "room", name: String(name).trim() || Partition.nextName(plan.rooms), row: "bottom", order: plan.rooms.length, widthM: box.widthM, depthM: box.depthM, routeLevelM: 0, doorU: .5, windowWall: "none", vertices: polygon, walls: polygon.map(() => ({ id: id(), removed: false, doorU: null, windowU: null })) };
        if (!plan.points.some((p) => p.type === "panel")) {
          const panel = { id: id(), type: "panel", label: "Щ1", name: "Щиток", roomId, u: 0, v: .5, heightM: 1.5, circuitId: "" }, shape = { ...room, ...box };
          G.place(panel, shape, G.fit(shape, G.position(shape, panel), true)); plan.points.push(panel);
        }
        plan.geometryConfirmed = false;
        const result = Partition.insert(plan, room);
        return { ...result, plan: G.stitchSharedWalls(result.plan, roomId) };
      } catch (problem) { error ||= problem; }
    }
    throw error;
  }
  return { resolve, append, closures, complete };
});

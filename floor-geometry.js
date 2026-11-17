/* Editable room polygons, shared wall operations and paths through actual openings. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PanelFloorGeometry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const EPS = 1e-6;
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const uid = () => globalThis.crypto?.randomUUID?.() || `wall-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const round = (v) => Math.round(v * 1e6) / 1e6;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const mix = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  const signedArea = (v) => v.reduce((s, a, i) => { const b = v[(i + 1) % v.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;
  const area = (v) => Math.abs(signedArea(v));
  const bounds = (v) => { const x = Math.min(...v.map((p) => p.x)), y = Math.min(...v.map((p) => p.y)); return { x, y, widthM: round(Math.max(...v.map((p) => p.x)) - x), depthM: round(Math.max(...v.map((p) => p.y)) - y) }; };
  const contours = (room) => [room, ...(room.holes || [])];
  const verticesOf = (room) => contours(room).flatMap((ring) => ring.vertices);
  const areaOf = (room) => area(room.vertices) - (room.holes || []).reduce((sum, ring) => sum + area(ring.vertices), 0);
  function edgesOf(room) {
    let start = 0;
    return contours(room).flatMap((ring, contour) => {
      const offset = start; start += ring.vertices.length;
      return ring.vertices.map((a, local) => ({ a, b: ring.vertices[(local + 1) % ring.vertices.length], wall: ring.walls[local], index: offset + local, endIndex: offset + (local + 1) % ring.vertices.length, ring, local, hole: contour > 0 }));
    });
  }
  const edgeAt = (room, index) => room && Array.isArray(room.vertices) && Number.isInteger(index) && index >= 0 ? edgesOf(room).find((edge) => edge.index === index) : undefined;
  const vertexAt = (room, index) => edgeAt(room, index)?.a;
  const wallAt = (room, index) => edgeAt(room, index)?.wall;
  function offsetContour(vertices, thickness) {
    const signed = vertices.reduce((sum, p, i) => { const q = vertices[(i + 1) % vertices.length]; return sum + p.x * q.y - q.x * p.y; }, 0), sign = signed >= 0 ? 1 : -1;
    const lines = vertices.map((a, i) => { const b = vertices[(i + 1) % vertices.length], length = dist(a, b), dx = (b.x - a.x) / length, dy = (b.y - a.y) / length; return { x: a.x + dy * sign * thickness, y: a.y - dx * sign * thickness, dx, dy }; });
    return lines.map((line, i) => {
      const previous = lines[(i - 1 + lines.length) % lines.length], denominator = previous.dx * line.dy - previous.dy * line.dx;
      if (Math.abs(denominator) < 1e-9) return { x: round(line.x), y: round(line.y) };
      const t = ((line.x - previous.x) * line.dy - (line.y - previous.y) * line.dx) / denominator, p = { x: previous.x + previous.dx * t, y: previous.y + previous.dy * t };
      if (dist(p, vertices[i]) > thickness * 10) throw new Error("Кут кімнати надто гострий для заданої товщини стін.");
      return { x: round(p.x), y: round(p.y) };
    });
  }
  function projection(p, a, b) {
    const length2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const u = length2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length2)) : 0;
    const q = mix(a, b, u); return { ...q, u, distance: dist(p, q) };
  }
  function nearest(room, p, activeOnly = false) {
    return edgesOf(room).map(({ a, b, index }) => ({ ...projection(p, a, b), index })).filter((p) => !activeOnly || !wallAt(room, p.index).removed).sort((a, b) => a.distance - b.distance)[0] || null;
  }
  function contains(room, p, boundary = true) {
    // Stored relative point coordinates are rounded; tolerate 0.1 mm at a wall
    // for routing while keeping strict interior tests for room overlap.
    if (nearest(room, p)?.distance < (boundary ? .0001 : EPS)) return boundary;
    const inside = (v) => { let result = false; for (let i = 0, j = v.length - 1; i < v.length; j = i++) if ((v[i].y > p.y) !== (v[j].y > p.y) && p.x < (v[j].x - v[i].x) * (p.y - v[i].y) / (v[j].y - v[i].y) + v[i].x) result = !result; return result; };
    return inside(room.vertices) && !(room.holes || []).some((ring) => inside(ring.vertices));
  }
  const fit = (room, p, snap = false) => {
    const q = nearest(room, p, snap);
    return snap && q ? { x: q.x, y: q.y } : contains(room, p) ? { x: p.x, y: p.y } : q ? { x: q.x, y: q.y } : p;
  };
  const position = (room, point) => ({ x: room.x + point.u * room.widthM, y: room.y + point.v * room.depthM });
  function place(point, room, pos) {
    const q = fit(room, pos); point.u = round(Math.max(0, Math.min(1, (q.x - room.x) / room.widthM))); point.v = round(Math.max(0, Math.min(1, (q.y - room.y) / room.depthM)));
  }
  function centroid(room) {
    const v = room.vertices, b = bounds(v), centre = { x: b.x + b.widthM / 2, y: b.y + b.depthM / 2 };
    if (contains(room, centre, false)) return centre;
    // Put labels in usable floor space, away from an internal room or a notch.
    // The bounding-box centre can lie in the excluded part of either shape.
    let best = null, clearance = 0;
    for (let x = 1; x < 10; x += 2) for (let y = 1; y < 10; y += 2) {
      const p = { x: b.x + b.widthM * x / 10, y: b.y + b.depthM * y / 10 };
      if (!contains(room, p, false)) continue;
      const margin = nearest(room, p).distance;
      if (margin > clearance) { best = p; clearance = margin; }
    }
    if (best) return best;
    // A concave room's bounding-box centre can be outside it.
    const candidates = edgesOf(room).map(({ a, b }) => mix(a, b, .5));
    for (const p of candidates) { const q = mix(p, centre, .02); if (contains(room, q, false)) return q; }
    return v[0];
  }
  function layout(plan) {
    const rooms = plan.rooms.map((r) => ({ ...r, ...bounds(r.vertices), areaM2: areaOf(r) }));
    const minX = Math.min(0, ...rooms.map((r) => r.x - plan.wallThicknessM)), minY = Math.min(0, ...rooms.map((r) => r.y - plan.wallThicknessM));
    const maxX = Math.max(2, ...rooms.map((r) => r.x + r.widthM + plan.wallThicknessM)), maxY = Math.max(2, ...rooms.map((r) => r.y + r.depthM + plan.wallThicknessM));
    return { rooms, hall: rooms.find((r) => r.kind === "hall"), minX, minY, width: maxX - minX, height: maxY - minY, areaM2: rooms.filter((r) => r.kind !== "outdoor").reduce((s, r) => s + r.areaM2, 0) };
  }
  function validate(room) {
    if (room.holes != null && (!Array.isArray(room.holes) || room.holes.length > 23)) throw new Error("Некоректні внутрішні контури кімнати.");
    if (verticesOf(room).length > 256) throw new Error("У кімнаті забагато кутів.");
    contours(room).forEach(validateContour);
    const plain = (ring) => ({ vertices: ring.vertices, walls: ring.walls });
    (room.holes || []).forEach((hole, i, all) => {
      const crosses = hole.vertices.some((a, k) => room.vertices.some((b, j) => segmentsMeet(a, hole.vertices[(k + 1) % hole.vertices.length], b, room.vertices[(j + 1) % room.vertices.length])));
      if (hole.vertices.some((p) => !contains(plain(room), p, false)) || crosses) throw new Error("Внутрішній контур виходить за кімнату.");
      if (all.slice(i + 1).some((other) => roomsOverlap(plain(hole), plain(other)))) throw new Error("Внутрішні контури накладаються.");
    });
    if (areaOf(room) < .16 - EPS) throw new Error("Залишкова площа кімнати надто мала.");
    const b = bounds(room.vertices); if (b.widthM < .4 || b.depthM < .4 || b.widthM > 50 || b.depthM > 50) throw new Error("Габарити кімнати мають бути 0,4–50 м.");
    Object.assign(room, b); delete room.x; delete room.y;
  }
  function validateContour(room) {
    const v = room.vertices;
    if (!Array.isArray(v) || v.length < 3 || v.length > 48 || !Array.isArray(room.walls) || room.walls.length !== v.length) throw new Error("Кімната повинна мати 3–48 кутів і відповідні стіни.");
    if (v.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 100 || Math.abs(p.y) > 100)) throw new Error("Координати стін мають бути в межах ±100 м.");
    if (area(v) < .16 - EPS || v.some((a, i) => dist(a, v[(i + 1) % v.length]) < .15 - EPS)) throw new Error("Кімната надто мала або стіна коротша за 0,15 м.");
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
      if (j === i + 1 || (i === 0 && j === v.length - 1)) continue;
      const a = v[i], b = v[(i + 1) % v.length], c = v[j], d = v[(j + 1) % v.length];
      if (segmentsMeet(a, b, c, d)) throw new Error("Стіни кімнати не можуть перетинатися або накладатися.");
    }
    room.walls.forEach((wall) => {
      if (typeof wall.id !== "string" || !wall.id) throw new Error("Стіна повинна мати стабільний ідентифікатор."); wall.removed = wall.removed === true;
      for (const key of ["doorU", "windowU"]) if (wall[key] != null && (!Number.isFinite(wall[key]) || wall[key] < 0 || wall[key] > 1)) throw new Error("Некоректне положення отвору в стіні.");
    });
  }
  function segmentsMeet(a, b, c, d) {
    if (cross(a, b, c) * cross(a, b, d) < -EPS && cross(c, d, a) * cross(c, d, b) < -EPS) return true;
    return [projection(a, c, d).distance, projection(b, c, d).distance, projection(c, a, b).distance, projection(d, a, b).distance].some((v) => v < EPS);
  }
  function normalize(plan) {
    plan.rooms.forEach(validate);
    const wallIds = plan.rooms.flatMap((r) => edgesOf(r).map((e) => e.wall.id));
    if (new Set(wallIds).size !== wallIds.length) throw new Error("Повторені ідентифікатори стін.");
    for (let i = 0; i < plan.rooms.length; i++) for (let j = i + 1; j < plan.rooms.length; j++) {
      const a = plan.rooms[i], b = plan.rooms[j];
      if (roomsOverlap(a, b)) throw new Error(`Кімнати «${a.name}» і «${b.name}» накладаються.`);
    }
    return plan;
  }
  function roomsOverlap(a, b) {
    const aa = bounds(a.vertices), bb = bounds(b.vertices);
    if (aa.x + aa.widthM <= bb.x + EPS || bb.x + bb.widthM <= aa.x + EPS || aa.y + aa.depthM <= bb.y + EPS || bb.y + bb.depthM <= aa.y + EPS) return false;
    const samples = (r) => [...verticesOf(r), ...edgesOf(r).map(({ a, b }) => mix(a, b, .5)), centroid(r)];
    return samples(a).some((p) => contains(b, p, false)) || samples(b).some((p) => contains(a, p, false)) || edgesOf(a).some(({ a: p, b: q }) => edgesOf(b).some(({ a: u, b: v }) => cross(p, q, u) * cross(p, q, v) < -EPS && cross(u, v, p) * cross(u, v, q) < -EPS));
  }
  function inward(room, index) {
    const { a, b, ring, hole } = edgeAt(room, index), length = dist(a, b);
    const signed = ring.vertices.reduce((sum, p, i) => { const q = ring.vertices[(i + 1) % ring.vertices.length]; return sum + p.x * q.y - q.x * p.y; }, 0), sign = (signed >= 0 ? 1 : -1) * (hole ? -1 : 1);
    return { x: -(b.y - a.y) / length * sign, y: (b.x - a.x) / length * sign };
  }
  function relation(a, b, c, d, thickness) {
    const length = dist(a, b), otherLength = dist(c, d);
    if (!length || !otherLength || Math.abs((b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x)) / (length * otherLength) > .015) return null;
    const gap = Math.abs(cross(a, b, c)) / length;
    if (gap > thickness * 1.35 + .015) return null;
    const u = (p) => ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length ** 2;
    const lo = Math.max(0, Math.min(u(c), u(d))), hi = Math.min(1, Math.max(u(c), u(d)));
    return (hi - lo) * length > .14 ? { lo, hi, gap } : null;
  }
  function neighbours(plan, roomId, index) {
    const room = plan.rooms.find((r) => r.id === roomId), { a, b } = edgeAt(room, index), result = [];
    plan.rooms.filter((r) => r.id !== roomId).forEach((r) => edgesOf(r).forEach(({ a: c, b: d, index: j }) => { const rel = relation(a, b, c, d, plan.wallThicknessM); if (rel) result.push({ room: r, index: j, ...rel }); }));
    return result;
  }
  function sharedWalls(plan) {
    const pairs = [];
    plan.rooms.forEach((room, ri) => edgesOf(room).forEach(({ a, b, index: i }) => {
      const na = inward(room, i);
      plan.rooms.slice(ri + 1).forEach((other) => edgesOf(other).forEach(({ a: c, b: d, index: j }) => {
        const nb = inward(other, j), rel = relation(a, b, c, d, plan.wallThicknessM);
        if (!rel || na.x * nb.x + na.y * nb.y > -.99) return;
        const from = mix(a, b, rel.lo), to = mix(a, b, rel.hi), oppositeFrom = projection(from, c, d), oppositeTo = projection(to, c, d);
        pairs.push({ roomId: room.id, otherId: other.id, index: i, otherIndex: j, lo: rel.lo, hi: rel.hi, from, to, oppositeFrom: { x: oppositeFrom.x, y: oppositeFrom.y }, oppositeTo: { x: oppositeTo.x, y: oppositeTo.y }, gap: rel.gap, lengthM: dist(from, to), removed: wallAt(room, i).removed || wallAt(other, j).removed });
      }));
    }));
    return pairs;
  }
  function stitchSharedWalls(input, roomId) {
    const plan = copy(input), cuts = new Map();
    sharedWalls(plan).filter((pair) => pair.roomId === roomId || pair.otherId === roomId).forEach((pair) => {
      for (const [id, index, ends] of [[pair.roomId, pair.index, [pair.from, pair.to]], [pair.otherId, pair.otherIndex, [pair.oppositeFrom, pair.oppositeTo]]]) {
        const room = plan.rooms.find((r) => r.id === id), { a, b } = edgeAt(room, index), key = `${id}:${index}`;
        if (!cuts.has(key)) cuts.set(key, { room, index, values: [] });
        ends.forEach((p) => { const u = projection(p, a, b).u; if (Math.min(u, 1 - u) * dist(a, b) >= .15 - EPS) cuts.get(key).values.push(u); });
      }
    });
    const entries = [...cuts.values()].sort((a, b) => a.room.id.localeCompare(b.room.id) || b.index - a.index);
    entries.forEach(({ room, index, values }) => {
      const edge = edgeAt(room, index), length = dist(edge.a, edge.b);
      const usable = [...new Set(values.map(round))].sort((a, b) => a - b).filter((u, i, all) => !i || (u - all[i - 1]) * length >= .15 - EPS);
      if (usable.length) splitAt(room, index, usable, true);
    });
    return normalize(plan);
  }
  function splitAt(room, index, cuts, automatic = false) {
    const { a, b, wall: edge, ring, local } = edgeAt(room, index), positions = [0, ...cuts.filter((u) => u > EPS && u < 1 - EPS), 1].sort((a, b) => a - b).filter((u, i, list) => !i || u - list[i - 1] > EPS);
    const vertices = positions.slice(0, -1).map((u, i) => i ? { ...mix(a, b, u), ...(automatic ? { auto: true } : {}) } : { ...a }), walls = positions.slice(0, -1).map((u, i) => {
      const w = { ...edge, id: i ? uid() : edge.id };
      for (const key of ["doorU", "windowU"]) w[key] = edge[key] != null && edge[key] >= u && edge[key] < positions[i + 1] ? (edge[key] - u) / (positions[i + 1] - u) : null;
      return w;
    });
    ring.vertices.splice(local, 1, ...vertices); ring.walls.splice(local, 1, ...walls);
  }
  function materialize(input, arrangement) {
    if (input.geometryMode === "free") return copy(input);
    const plan = copy(input); plan.geometryMode = "free"; plan.geometryConfirmed = false;
    plan.rooms.forEach((room) => {
      const r = arrangement.rooms.find((r) => r.id === room.id);
      room.vertices = [{ x: r.x, y: r.y }, { x: r.x + r.widthM, y: r.y }, { x: r.x + r.widthM, y: r.y + r.depthM }, { x: r.x, y: r.y + r.depthM }];
      room.walls = room.vertices.map(() => ({ id: uid(), removed: false, doorU: null, windowU: null }));
      if (room.row !== "hall") room.walls[room.row === "top" ? 2 : 0].doorU = room.row === "top" ? 1 - room.doorU : room.doorU;
      const index = { north: 0, east: 1, south: 2, west: 3 }[room.windowWall]; if (index != null) room.walls[index].windowU = .5;
      room.widthM = r.widthM; room.depthM = r.depthM;
    });
    // Segment long shared boundaries, including the corridor, so moving one wall
    // does not move the entire side of every adjoining room.
    const source = copy(plan);
    plan.rooms.forEach((room) => {
      const original = source.rooms.find((r) => r.id === room.id);
      for (let index = original.vertices.length - 1; index >= 0; index--) {
        const a = original.vertices[index], b = original.vertices[(index + 1) % original.vertices.length], cuts = [];
        neighbours(source, room.id, index).forEach((other) => { const r = other.room; [r.vertices[other.index], r.vertices[(other.index + 1) % r.vertices.length]].forEach((p) => { const q = projection(p, a, b); if (q.u > .001 && q.u < .999 && Math.min(q.u, 1 - q.u) * dist(a, b) >= .15) cuts.push(q.u); }); });
        // Keep only cuts separated by a usable wall length.
        const unique = [...new Set(cuts)].sort((a, b) => a - b).filter((u, i, all) => !i || (u - all[i - 1]) * dist(a, b) >= .15);
        if (unique.length) splitAt(room, index, unique, true);
      }
    });
    return normalize(plan);
  }
  function reproject(plan, before, scaledRoom = null) {
    const old = layout(before), after = layout(plan);
    plan.points.forEach((point) => {
      const a = old.rooms.find((r) => r.id === point.roomId), b = after.rooms.find((r) => r.id === point.roomId);
      if (!a || !b) return;
      let pos = position(a, point);
      if (scaledRoom === point.roomId) pos = { x: b.x + point.u * b.widthM, y: b.y + point.v * b.depthM };
      else {
        const on = nearest(a, pos);
        const oldEdge = on && edgeAt(a, on.index), newEdge = oldEdge && edgesOf(b).find((edge) => edge.wall.id === oldEdge.wall.id);
        const sameSurface = newEdge && Math.abs(cross(oldEdge.a, oldEdge.b, newEdge.a)) / dist(oldEdge.a, oldEdge.b) < EPS && Math.abs(cross(oldEdge.a, oldEdge.b, newEdge.b)) / dist(oldEdge.a, oldEdge.b) < EPS && projection(pos, newEdge.a, newEdge.b).distance < .0001;
        if (on?.distance < .04 && newEdge && !sameSurface) { pos.x += (newEdge.a.x - oldEdge.a.x) * (1 - on.u) + (newEdge.b.x - oldEdge.b.x) * on.u; pos.y += (newEdge.a.y - oldEdge.a.y) * (1 - on.u) + (newEdge.b.y - oldEdge.b.y) * on.u; }
        if (on?.distance < .04 && !newEdge && point.type !== "light" && nearest(b, pos, true)?.distance > .04) { pos = fit(b, pos, true); point.placementReview = true; }
      }
      if (dist(fit(b, pos), pos) > .0001) point.placementReview = true;
      place(point, b, pos);
    });
    plan.geometryConfirmed = false; return normalize(plan);
  }
  function refreshInnerBoundaries(plan, before) {
    const pairs = before.rooms.some((r) => r.holes?.some((h) => h.sourceRoomId)) ? sharedWalls(before) : [];
    plan.rooms.forEach((parent) => (parent.holes || []).forEach((hole) => {
      const child = plan.rooms.find((r) => r.id === hole.sourceRoomId), oldChild = before.rooms.find((r) => r.id === hole.sourceRoomId), oldParent = before.rooms.find((r) => r.id === parent.id), oldHole = oldParent?.holes?.find((h) => h.sourceRoomId === hole.sourceRoomId);
      if (!child || !oldChild || !oldHole || JSON.stringify(child.vertices) === JSON.stringify(oldChild.vertices)) return;
      validateContour(child);
      const oldOffset = offsetContour(oldChild.vertices, before.wallThicknessM), nextOffset = offsetContour(child.vertices, plan.wallThicknessM);
      const nextFaces = child.walls.map((wall, i) => ({ wall, a: nextOffset[i], b: nextOffset[(i + 1) % nextOffset.length] }));
      const faceById = new Map(nextFaces.map((face) => [face.wall.id, face]));
      const oldFace = (point) => oldOffset.map((a, i) => ({ ...projection(point, a, oldOffset[(i + 1) % oldOffset.length]), i })).sort((a, b) => a.distance - b.distance)[0];
      const moved = oldHole.vertices.map((point) => { const edge = oldFace(point), face = faceById.get(oldChild.walls[edge.i].id); return face ? { ...point, ...mix(face.a, face.b, edge.u) } : null; });
      if (moved.every(Boolean) && child.walls.length === oldChild.walls.length) {
        hole.vertices = moved.map((p) => ({ ...p, x: round(p.x), y: round(p.y) }));
      } else {
        // A deleted real corner changes the offset polygon's topology. Preserve
        // surviving face IDs and openings rather than retaining the old cutout.
        const used = new Set(plan.rooms.flatMap((r) => contours(r).filter((ring) => ring !== hole).flatMap((ring) => ring.walls.map((w) => w.id))));
        hole.vertices = nextOffset;
        hole.walls = nextFaces.map((face) => {
          const oldIndex = oldChild.walls.findIndex((w) => w.id === face.wall.id), pair = pairs.filter((s) => s.roomId === child.id && s.index === oldIndex && s.otherId === parent.id || s.otherId === child.id && s.otherIndex === oldIndex && s.roomId === parent.id).sort((a, b) => b.lengthM - a.lengthM)[0];
          const previous = pair && wallAt(oldParent, pair.roomId === parent.id ? pair.index : pair.otherIndex), wall = previous ? { ...previous } : { removed: false, doorU: null, windowU: null };
          if (!wall.id || used.has(wall.id)) wall.id = uid(); used.add(wall.id); return wall;
        });
      }
      // Openings on both faces share one world position along their wall.
      hole.walls.forEach((wall, i) => {
        const a = hole.vertices[i], b = hole.vertices[(i + 1) % hole.vertices.length], middle = mix(a, b, .5);
        const match = nextFaces.map((face) => ({ face, distance: projection(middle, face.a, face.b).distance })).sort((a, b) => a.distance - b.distance)[0]?.face;
        if (!match) return;
        wall.removed = match.wall.removed;
        const sourceIndex = child.walls.findIndex((w) => w.id === match.wall.id), sourceA = child.vertices[sourceIndex], sourceB = child.vertices[(sourceIndex + 1) % child.vertices.length];
        for (const key of ["doorU", "windowU"]) {
          if (match.wall[key] == null) { wall[key] = null; continue; }
          const opening = mix(sourceA, sourceB, match.wall[key]), length2 = dist(a, b) ** 2, u = ((opening.x - a.x) * (b.x - a.x) + (opening.y - a.y) * (b.y - a.y)) / length2;
          wall[key] = u >= -EPS && u <= 1 + EPS ? Math.max(0, Math.min(1, u)) : null;
        }
      });
    }));
  }
  function preserveContourDirection(plan, before) {
    plan.rooms.forEach((room) => {
      const old = before.rooms.find((r) => r.id === room.id); if (!old) return;
      const previous = contours(old);
      contours(room).forEach((ring, index) => { if (previous[index] && signedArea(previous[index].vertices) * signedArea(ring.vertices) < 0) throw new Error("Переміщення не може вивертати контур кімнати. Зупиніть стіну до протилежної межі."); });
    });
  }
  function moveVertices(input, roomId, changes, scaled = false, { anchors = [], wallIndex = null } = {}) {
    const plan = copy(input), source = input.rooms.find((r) => r.id === roomId), updates = new Map();
    if (!source) throw new Error("Оберіть кімнату для редагування.");
    const shared = sharedWalls(input), sourcePairs = shared.filter((s) => s.roomId === roomId || s.otherId === roomId), ownIndex = (s) => s.roomId === roomId ? s.index : s.otherIndex, otherId = (s) => s.roomId === roomId ? s.otherId : s.roomId;
    changes.forEach(({ index, dx, dy }) => {
      const origin = vertexAt(source, index);
      if (!origin || !Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error("Некоректне переміщення кута.");
      const incident = sourcePairs.filter((s) => { const edge = edgeAt(source, ownIndex(s)); return edge.index === index || edge.endIndex === index; });
      const linkedRooms = new Set((wallIndex == null ? incident : sourcePairs.filter((s) => ownIndex(s) === wallIndex)).map(otherId)), junctionRooms = new Set(incident.map(otherId));
      // A shared face moves both rooms. An outer wall only carries automatic
      // junctions on its neighbours; it must not pull their fixed corners.
      plan.rooms.forEach((r) => verticesOf(r).forEach((p, i) => { if (r.id === roomId && i === index || r.id !== roomId && (linkedRooms.has(r.id) || p.auto && junctionRooms.has(r.id)) && dist(origin, p) <= input.wallThicknessM * 1.5 + .015) updates.set(`${r.id}:${i}`, { room: r, index: i, dx, dy }); }));
      const edge = edgeAt(source, index), child = edge.hole && input.rooms.find((r) => r.id === edge.ring.sourceRoomId);
      if (child) {
        const corners = offsetContour(child.vertices, input.wallThicknessM), corner = corners.findIndex((p) => dist(p, origin) < .00001);
        if (corner >= 0) updates.set(`${child.id}:${corner}`, { room: plan.rooms.find((r) => r.id === child.id), index: corner, dx, dy });
      }
    });
    updates.forEach(({ room, index, dx, dy }) => { const p = vertexAt(room, index); p.x = round(p.x + dx); p.y = round(p.y + dy); });
    const edited = plan.rooms.find((r) => r.id === roomId), constraints = new Map();
    validateContour(edited);
    preserveContourDirection(plan, input);
    sourcePairs.forEach((pair) => {
      const own = edgeAt(edited, ownIndex(pair)), otherRoom = plan.rooms.find((r) => r.id === otherId(pair)), otherIndex = pair.roomId === roomId ? pair.otherIndex : pair.index, other = edgeAt(otherRoom, otherIndex), oldOther = edgeAt(input.rooms.find((r) => r.id === otherRoom.id), otherIndex);
      if (own.hole || other.hole || pair.lengthM < dist(oldOther.a, oldOther.b) - .0001) return;
      const n = inward(edited, own.index), a = { x: own.a.x - n.x * pair.gap, y: own.a.y - n.y * pair.gap }, b = { x: own.b.x - n.x * pair.gap, y: own.b.y - n.y * pair.gap };
      for (const index of [other.index, other.endIndex]) { const key = `${otherRoom.id}:${index}`; if (!constraints.has(key)) constraints.set(key, { room: otherRoom, index, lines: [] }); constraints.get(key).lines.push({ a, b }); }
    });
    constraints.forEach(({ room, index, lines }) => {
      const original = vertexAt(room, index), first = lines[0], dx = first.b.x - first.a.x, dy = first.b.y - first.a.y, other = lines.find((line) => Math.abs(dx * (line.b.y - line.a.y) - dy * (line.b.x - line.a.x)) > EPS);
      let point;
      if (other) {
        const ex = other.b.x - other.a.x, ey = other.b.y - other.a.y, t = ((other.a.x - first.a.x) * ey - (other.a.y - first.a.y) * ex) / (dx * ey - dy * ex);
        point = { x: first.a.x + dx * t, y: first.a.y + dy * t };
      } else { const u = ((original.x - first.a.x) * dx + (original.y - first.a.y) * dy) / (dx * dx + dy * dy); point = { x: first.a.x + dx * u, y: first.a.y + dy * u }; }
      if (lines.some((line) => Math.abs(cross(line.a, line.b, point)) / dist(line.a, line.b) > .0001)) throw new Error("Зміна створює несумісний стик спільних стін.");
      Object.assign(original, { x: round(point.x), y: round(point.y) });
    });
    // The wall used as an alignment reference must stay at its original level.
    anchors.forEach(({ roomId: id, index }) => { Object.assign(vertexAt(plan.rooms.find((r) => r.id === id), index), copy(vertexAt(input.rooms.find((r) => r.id === id), index))); });
    preserveContourDirection(plan, input);
    refreshInnerBoundaries(plan, input);
    // A moving T-junction can reach or pass an existing corner. Its automatic
    // split must disappear instead of leaving a zero-length or folded edge.
    plan.rooms.filter((r) => r.id !== roomId).flatMap(contours).forEach((room) => {
      for (let i = room.vertices.length - 1; i >= 0 && room.vertices.length > 3; i--) {
        const count = room.vertices.length, p = room.vertices[i], before = room.vertices[(i - 1 + count) % count], after = room.vertices[(i + 1) % count];
        if (!p.auto || Math.abs(cross(before, p, after)) > .00001) continue;
        const folded = (p.x - before.x) * (after.x - p.x) + (p.y - before.y) * (after.y - p.y) < 0;
        if (folded || Math.min(dist(before, p), dist(p, after)) < .15) mergeAutomaticCorner(room, i);
      }
    });
    normalize(plan); return reproject(plan, input, scaled ? roomId : null);
  }
  const moveVertex = (p, room, index, dx, dy) => moveVertices(p, room, [{ index, dx, dy }]);
  function moveWall(p, roomId, index, dx, dy) {
    const room = p.rooms.find((r) => r.id === roomId), edge = edgeAt(room, index);
    if (!edge || !Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error("Оберіть стіну й задайте коректне переміщення.");
    const { a, b, endIndex } = edge, len = dist(a, b), nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len, offset = dx * nx + dy * ny;
    return moveVertices(p, roomId, [{ index, dx: nx * offset, dy: ny * offset }, { index: endIndex, dx: nx * offset, dy: ny * offset }], false, { wallIndex: index });
  }
  function dragWall(input, roomId, index, dx, dy, { magnet = true, snapDistanceM = .22, gridStepM = 0 } = {}) {
    const room = input.rooms.find((r) => r.id === roomId);
    if (!room || !vertexAt(room, index) || !Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(snapDistanceM) || snapDistanceM < 0 || !Number.isFinite(gridStepM) || gridStepM < 0) throw new Error("Некоректне переміщення стіни.");
    const { a, b, endIndex: nextIndex } = edgeAt(room, index), normal = inward(room, index), length = dist(a, b), tx = (b.x - a.x) / length, ty = (b.y - a.y) / length;
    const offset = dx * normal.x + dy * normal.y, candidates = [];
    if (magnet && !wallAt(room, index).removed) input.rooms.filter((r) => r.id !== roomId).forEach((other) => edgesOf(other).forEach(({ a: c, b: d, index: j, endIndex: k, wall }) => {
      const otherNormal = inward(other, j);
      if (wall.removed || normal.x * otherNormal.x + normal.y * otherNormal.y < 1 - 1e-10) return;
      const targetOffset = (c.x - a.x) * normal.x + (c.y - a.y) * normal.y, correction = Math.abs(targetOffset - offset);
      if (correction > snapDistanceM + EPS) return;
      const u = (p) => (p.x - a.x) * tx + (p.y - a.y) * ty, lo = Math.min(u(c), u(d)), hi = Math.max(u(c), u(d)), gap = Math.max(0, lo - length, -hi);
      if (gap > input.wallThicknessM + snapDistanceM + EPS) return;
      candidates.push({ other, j, k, targetOffset, correction, gap, from: { x: a.x + normal.x * targetOffset + tx * Math.min(0, lo), y: a.y + normal.y * targetOffset + ty * Math.min(0, lo) }, to: { x: a.x + normal.x * targetOffset + tx * Math.max(length, hi), y: a.y + normal.y * targetOffset + ty * Math.max(length, hi) } });
    }));
    candidates.sort((a, b) => a.correction - b.correction || a.gap - b.gap || a.other.id.localeCompare(b.other.id) || a.j - b.j);
    // Use the pointer position for magnetic acquisition, before grid rounding:
    // neighbouring walls do not necessarily sit on the same grid origin.
    for (const target of candidates) {
      const sx = normal.x * target.targetOffset, sy = normal.y * target.targetOffset;
      try {
        const plan = moveVertices(input, roomId, [{ index, dx: sx, dy: sy }, { index: nextIndex, dx: sx, dy: sy }], false, { wallIndex: index, anchors: [{ roomId: target.other.id, index: target.j }, { roomId: target.other.id, index: target.k }] });
        return { plan, dx: round(sx), dy: round(sy), alignment: { targetId: target.other.id, from: target.from, to: target.to } };
      } catch { /* Try another reference rather than saving an invalid contour. */ }
    }
    const gx = gridStepM ? Math.round(dx / gridStepM) * gridStepM : dx, gy = gridStepM ? Math.round(dy / gridStepM) * gridStepM : dy, distance = gx * normal.x + gy * normal.y;
    return { plan: moveWall(input, roomId, index, gx, gy), dx: round(normal.x * distance), dy: round(normal.y * distance), alignment: null };
  }
  function moveRoom(p, roomId, dx, dy) {
    const plan = copy(p), room = plan.rooms.find((r) => r.id === roomId);
    if (!room || !Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error("Некоректне переміщення кімнати.");
    const moving = new Set([roomId]);
    for (let count = 0; count < plan.rooms.length; count++) plan.rooms.filter((r) => moving.has(r.id)).forEach((r) => (r.holes || []).forEach((hole) => { if (hole.sourceRoomId && plan.rooms.some((s) => s.id === hole.sourceRoomId)) moving.add(hole.sourceRoomId); }));
    const rings = new Set(plan.rooms.filter((r) => moving.has(r.id)).flatMap(contours));
    plan.rooms.forEach((r) => (r.holes || []).filter((hole) => moving.has(hole.sourceRoomId)).forEach((hole) => rings.add(hole)));
    rings.forEach((ring) => ring.vertices.forEach((v) => { v.x = round(v.x + dx); v.y = round(v.y + dy); })); normalize(plan);
    // Moving a whole room is independent; attached points keep their relative positions.
    const before = layout(p), after = layout(plan);
    plan.points.forEach((point) => { const old = before.rooms.find((r) => r.id === point.roomId), r = after.rooms.find((r) => r.id === point.roomId), pos = position(old, point); if (moving.has(point.roomId)) { pos.x += dx; pos.y += dy; } else if (!contains(r, pos)) point.placementReview = true; place(point, r, pos); });
    plan.geometryConfirmed = false; return plan;
  }
  function dockRoom(input, roomId, dx, dy, { magnet = true, snapDistanceM = .22, alignEnds = true } = {}) {
    const source = input.rooms.find((r) => r.id === roomId);
    if (!source || !Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error("Некоректне переміщення кімнати.");
    if (source.holes?.some((h) => h.sourceRoomId) || input.rooms.some((r) => r.holes?.some((h) => h.sourceRoomId === roomId))) return { plan: moveRoom(input, roomId, dx, dy), docking: null };
    const shifted = (r, sx, sy) => { const next = copy(r); verticesOf(next).forEach((p) => { p.x = round(p.x + sx); p.y = round(p.y + sy); }); return next; };
    const moved = shifted(source, dx, dy), others = input.rooms.filter((r) => r.id !== roomId), collides = others.some((r) => roomsOverlap(moved, r));
    if (!magnet) return { plan: moveRoom(input, roomId, dx, dy), docking: null };
    const candidates = [], canPlace = (room) => others.every((other) => !roomsOverlap(room, other));
    edgesOf(moved).forEach(({ a, b, index: i }) => {
      const na = inward(moved, i);
      others.forEach((other) => edgesOf(other).forEach(({ a: c, b: d, index: j }) => {
        const nb = inward(other, j);
        if (na.x * nb.x + na.y * nb.y > -.9998) return;
        const signed = (a.x - c.x) * nb.x + (a.y - c.y) * nb.y, shift = -input.wallThicknessM - signed;
        if (!collides && Math.abs(shift) > snapDistanceM) return;
        const tx = (d.x - c.x) / dist(c, d), ty = (d.y - c.y) / dist(c, d), baseX = nb.x * shift, baseY = nb.y * shift;
        const tangent = alignEnds ? [...[a, b].flatMap((p) => [c, d].map((q) => (q.x - p.x) * tx + (q.y - p.y) * ty)).filter((v) => Math.abs(v) < snapDistanceM).sort((a, b) => Math.abs(a) - Math.abs(b)), 0] : [0];
        // Prefer aligned ends when close; retain the user's offset for a partial wall.
        for (const along of tangent) {
          const sx = baseX + along * tx, sy = baseY + along * ty, proposal = shifted(moved, sx, sy), edge = edgeAt(proposal, i);
          const rel = relation(edge.a, edge.b, c, d, input.wallThicknessM);
          if (!rel || (rel.hi - rel.lo) * dist(a, b) < .3 || !canPlace(proposal)) continue;
          candidates.push({ dx: dx + sx, dy: dy + sy, score: Math.abs(shift) + Math.abs(along) * .05 - (along ? .02 : 0), otherId: other.id, index: i, otherIndex: j }); break;
        }
      }));
    });
    candidates.sort((a, b) => a.score - b.score || a.otherId.localeCompare(b.otherId) || a.index - b.index);
    if (!candidates.length) return { plan: moveRoom(input, roomId, dx, dy), docking: null };
    const best = candidates[0], movedPlan = simplifyAutomaticVertices(moveRoom(input, roomId, best.dx, best.dy)), plan = stitchSharedWalls(movedPlan, roomId);
    const pair = sharedWalls(plan).filter((w) => w.roomId === roomId && w.otherId === best.otherId || w.otherId === roomId && w.roomId === best.otherId).sort((a, b) => b.lengthM - a.lengthM)[0];
    return { plan, docking: pair ? { ...pair, targetId: best.otherId, dx: round(best.dx), dy: round(best.dy) } : null };
  }
  function mergeAutomaticCorner(room, index) {
    const count = room.vertices.length, previousIndex = (index - 1 + count) % count, before = room.vertices[previousIndex], p = room.vertices[index], after = room.vertices[(index + 1) % count], previous = room.walls[previousIndex], next = room.walls[index];
    if (previous.removed !== next.removed) return false;
    const merged = { ...previous };
    for (const key of ["doorU", "windowU"]) {
      const a = previous[key] == null ? null : mix(before, p, previous[key]), b = next[key] == null ? null : mix(p, after, next[key]);
      if (a && b && dist(a, b) > .001) return false;
      const opening = a || b; merged[key] = opening ? projection(opening, before, after).u : null;
    }
    room.walls[previousIndex] = merged; room.vertices.splice(index, 1); room.walls.splice(index, 1); return true;
  }
  function simplifyAutomaticVertices(input) {
    const plan = copy(input);
    const significant = plan.rooms.flatMap((r) => contours(r).flatMap((ring) => ring.vertices.filter((p, i) => !p.auto || Math.abs(cross(ring.vertices[(i - 1 + ring.vertices.length) % ring.vertices.length], p, ring.vertices[(i + 1) % ring.vertices.length])) > .00001).map((p) => ({ ...p, roomId: r.id }))));
    plan.rooms.forEach((source) => contours(source).forEach((room) => {
      for (let i = room.vertices.length - 1; i >= 0 && room.vertices.length > 3; i--) {
        const count = room.vertices.length, p = room.vertices[i], before = room.vertices[(i - 1 + count) % count], after = room.vertices[(i + 1) % count];
        if (!p.auto || Math.abs(cross(before, p, after)) > .00001 || significant.some((q) => q.roomId !== source.id && dist(p, q) <= plan.wallThicknessM * 1.5 + .015)) continue;
        mergeAutomaticCorner(room, i);
      }
    }));
    return normalize(plan);
  }
  function duplicateRoom(input, roomId, { copyPoints = true } = {}) {
    const source = input.rooms.find((r) => r.id === roomId); if (!source) throw new Error("Оберіть кімнату для копіювання.");
    if (input.rooms.length >= 24) throw new Error("На плані може бути не більше 24 кімнат.");
    if (copyPoints && input.points.length + input.points.filter((p) => p.roomId === roomId && p.type !== "panel").length > 500) throw new Error("На плані може бути не більше 500 електричних точок.");
    const plan = copy(input), room = copy(source), old = bounds(source.vertices), box = layout(plan); room.id = uid(); room.name = `${source.name} · копія`; room.kind = source.kind === "hall" ? "room" : source.kind; room.row = "bottom";
    const dx = box.minX + box.width + .5 - old.x;
    verticesOf(room).forEach((v) => { v.x += dx; }); edgesOf(room).forEach(({ wall }) => { wall.id = uid(); }); (room.holes || []).forEach((hole) => { delete hole.sourceRoomId; }); plan.rooms.push(room);
    if (copyPoints) {
      const points = plan.points.filter((p) => p.roomId === roomId && p.type !== "panel"), ids = new Map(points.map((p) => [p.id, uid()])), used = new Set(plan.points.map((p) => p.label));
      points.forEach((point) => {
        const next = copy(point); next.id = ids.get(point.id); next.roomId = room.id;
        const prefix = { light: "EL", socket: "X", switch: "S", equipment: "EP", junction: "Д" }[point.type]; let number = 1; while (used.has(`${prefix}${number}`)) number++; next.label = `${prefix}${number}`; used.add(next.label);
        if (point.supplyFromId) next.supplyFromId = ids.get(point.supplyFromId) || point.supplyFromId;
        if (point.type === "switch") { next.controlsId = ids.get(point.controlsId) || ""; if (!next.controlsId) next.circuitId = ""; }
        plan.points.push(next);
      });
    }
    plan.geometryConfirmed = false;
    return { plan: normalize(plan), roomId: room.id };
  }
  function placeBeside(input, roomId, anchorId) {
    const room = layout(input).rooms.find((r) => r.id === roomId), anchor = layout(input).rooms.find((r) => r.id === anchorId);
    if (!room || !anchor || roomId === anchorId) return { plan: copy(input), docking: null };
    const t = input.wallThicknessM, targets = [{ x: anchor.x + anchor.widthM + t, y: anchor.y }, { x: anchor.x - room.widthM - t, y: anchor.y }, { x: anchor.x, y: anchor.y + anchor.depthM + t }, { x: anchor.x, y: anchor.y - room.depthM - t }];
    for (const target of targets) {
      try { moveRoom(input, roomId, target.x - room.x, target.y - room.y); return dockRoom(input, roomId, target.x - room.x, target.y - room.y); } catch { /* Try the next free side of the anchor. */ }
    }
    return { plan: copy(input), docking: null };
  }
  function resizeWall(p, roomId, index, lengthM) {
    if (!Number.isFinite(lengthM) || lengthM < .15 || lengthM > 50) throw new Error("Довжина стіни має бути 0,15–50 м.");
    const room = p.rooms.find((r) => r.id === roomId), edge = edgeAt(room, index);
    if (!edge) throw new Error("Оберіть стіну для зміни довжини.");
    const { a, b, endIndex } = edge, current = dist(a, b);
    return moveVertex(p, roomId, endIndex, (b.x - a.x) * (lengthM / current - 1), (b.y - a.y) * (lengthM / current - 1));
  }
  function resizeRoom(p, roomId, width, depth) {
    if (![width, depth].every((value) => Number.isFinite(value) && value >= .4 && value <= 50)) throw new Error("Габарити кімнати мають бути 0,4–50 м.");
    const room = layout(p).rooms.find((r) => r.id === roomId);
    if (!room) throw new Error("Оберіть кімнату для зміни розмірів.");
    return moveVertices(p, roomId, verticesOf(room).map((v, index) => ({ index, dx: (v.x - room.x) * (width / room.widthM - 1), dy: (v.y - room.y) * (depth / room.depthM - 1) })), true);
  }
  function splitWall(p, roomId, index, fraction = .5) {
    let plan = copy(p);
    const source = plan.rooms.find((r) => r.id === roomId), edge = edgeAt(source, index);
    if (!edge) throw new Error("Оберіть стіну для додавання кута.");
    const wall = edge.wall, length = dist(edge.a, edge.b), changes = {};
    if (!Number.isFinite(fraction) || Math.min(fraction, 1 - fraction) * length < .15 - EPS) throw new Error("Новий кут має бути щонайменше за 0,15 м від кінців стіни.");
    // An opening cannot straddle a newly introduced bend. Keep openings away
    // from the split; remove a crossing one on both faces for explicit placement.
    for (const [key, halfWidth] of [["doorU", .4], ["windowU", .7]]) if (wall[key] != null && Math.abs(wall[key] - fraction) * length <= Math.min(halfWidth, length * .35)) changes[key] = null;
    if (Object.keys(changes).length) plan = setWall(plan, roomId, index, changes);
    const split = mix(edge.a, edge.b, fraction);
    neighbours(plan, roomId, index).forEach((other) => {
      const { a, b } = edgeAt(other.room, other.index), u = projection(split, a, b).u;
      if (Math.min(u, 1 - u) * dist(a, b) >= .15) splitAt(other.room, other.index, [u]);
    });
    splitAt(plan.rooms.find((r) => r.id === roomId), index, [fraction]); plan.geometryConfirmed = false; return normalize(plan);
  }
  function removeVertex(p, roomId, index) {
    const plan = copy(p), room = plan.rooms.find((r) => r.id === roomId);
    const selected = edgeAt(room, index);
    if (!selected) throw new Error("Оберіть кут для видалення.");
    const { ring, local } = selected;
    if (ring.vertices.length <= 3) throw new Error("У контурі має залишитися щонайменше три кути.");
    const previousPoint = ring.vertices[(local - 1 + ring.vertices.length) % ring.vertices.length], followingPoint = ring.vertices[(local + 1) % ring.vertices.length];
    const straight = projection(selected.a, previousPoint, followingPoint).distance < .00001;
    if (!straight && selected.hole && ring.sourceRoomId) {
      const child = p.rooms.find((r) => r.id === ring.sourceRoomId), corner = child && offsetContour(child.vertices, p.wallThicknessM).findIndex((v) => dist(v, selected.a) < .00001);
      if (corner >= 0) return removeVertex(p, child.id, corner);
    }
    if (straight) {
      const removals = [{ room, index }];
      sharedWalls(p).filter((s) => s.roomId === roomId || s.otherId === roomId).forEach((s) => {
        const ownIndex = s.roomId === roomId ? s.index : s.otherIndex, own = edgeAt(p.rooms.find((r) => r.id === roomId), ownIndex);
        if (own.index !== index && own.endIndex !== index) return;
        const otherId = s.roomId === roomId ? s.otherId : s.roomId, otherIndex = s.roomId === roomId ? s.otherIndex : s.index, otherRoom = plan.rooms.find((r) => r.id === otherId), other = edgeAt(otherRoom, otherIndex), q = projection(selected.a, other.a, other.b);
        for (const vi of [other.index, other.endIndex]) {
          const edge = edgeAt(otherRoom, vi), count = edge.ring.vertices.length;
          if (count <= 3 || dist(edge.a, q) > .00001) continue;
          const before = edge.ring.vertices[(edge.local - 1 + count) % count], after = edge.ring.vertices[(edge.local + 1) % count];
          if (projection(edge.a, before, after).distance < .00001 && !removals.some((r) => r.room.id === otherId && r.index === vi)) removals.push({ room: otherRoom, index: vi });
        }
      });
      removals.sort((a, b) => a.room.id.localeCompare(b.room.id) || b.index - a.index).forEach(({ room: r, index: vi }) => {
        const edge = edgeAt(r, vi);
        if (!mergeAutomaticCorner(edge.ring, edge.local)) throw new Error("Ділянки мають різні отвори або стан стіни. Збережіть проміжний кут чи спочатку узгодьте ці ділянки.");
      });
    } else {
      ring.vertices.splice(local, 1); ring.walls.splice(local, 1);
      const previous = ring.walls[(local - 1 + ring.walls.length) % ring.walls.length]; previous.doorU = null; previous.windowU = null;
    }
    preserveContourDirection(plan, p); refreshInnerBoundaries(plan, p); normalize(plan); return reproject(plan, p);
  }
  function setWall(p, roomId, index, changes) {
    const plan = copy(p), room = plan.rooms.find((r) => r.id === roomId), wall = wallAt(room, index), affected = [{ room, index }];
    if (!wall) throw new Error("Оберіть стіну для зміни її властивостей.");
    Object.assign(wall, changes);
    neighbours(plan, roomId, index).forEach((other) => {
      affected.push(other);
      const partner = wallAt(other.room, other.index);
      if (Object.hasOwn(changes, "removed")) partner.removed = wall.removed;
      for (const key of ["doorU", "windowU"]) if (Object.hasOwn(changes, key)) {
        const edge = edgeAt(room, index), otherEdge = edgeAt(other.room, other.index), opening = wall[key] == null ? null : mix(edge.a, edge.b, wall[key]);
        const length2 = dist(otherEdge.a, otherEdge.b) ** 2, u = opening && ((opening.x - otherEdge.a.x) * (otherEdge.b.x - otherEdge.a.x) + (opening.y - otherEdge.a.y) * (otherEdge.b.y - otherEdge.a.y)) / length2;
        partner[key] = opening && u >= -EPS && u <= 1 + EPS ? Math.max(0, Math.min(1, u)) : null;
      }
    });
    if (changes.removed) {
      const arrangement = layout(plan);
      affected.forEach(({ room, index }) => plan.points.filter((point) => point.roomId === room.id && point.type !== "light").forEach((point) => { const r = arrangement.rooms.find((r) => r.id === room.id), edge = edgeAt(room, index); if (projection(position(r, point), edge.a, edge.b).distance < .04) point.placementReview = true; }));
    }
    plan.geometryConfirmed = false; return normalize(plan);
  }
  function openingPosition(room, index, kind, requested = .5) {
    const edge = edgeAt(room, index);
    if (!edge || !["door", "window"].includes(kind)) throw new Error("Оберіть двері або вікно на стіні.");
    const length = dist(edge.a, edge.b), half = Math.min(kind === "door" ? .4 : .7, length * .35) / length;
    const otherKey = kind === "door" ? "windowU" : "doorU", other = edge.wall[otherKey], choices = [[half, 1 - half]];
    if (other != null) {
      const otherHalf = Math.min(kind === "door" ? .7 : .4, length * .35) / length, reach = half + otherHalf;
      choices.splice(0, 1, [half, Math.min(1 - half, other - reach)], [Math.max(half, other + reach), 1 - half]);
    }
    const available = choices.filter(([lo, hi]) => lo <= hi + EPS).map(([lo, hi]) => Math.max(lo, Math.min(hi, requested)));
    if (!available.length) throw new Error("На цій стіні замало місця для дверей і вікна без накладання. Оберіть іншу стіну.");
    return available.sort((a, b) => Math.abs(a - requested) - Math.abs(b - requested))[0];
  }
  function toggleOpening(input, roomId, index, kind) {
    const room = input.rooms.find((r) => r.id === roomId), edge = edgeAt(room, index);
    if (!edge || !["door", "window"].includes(kind)) throw new Error("Спочатку оберіть стіну для дверей або вікна.");
    const key = `${kind}U`;
    return setWall(input, roomId, index, { removed: false, [key]: edge.wall[key] != null ? null : openingPosition(room, index, kind) });
  }
  function moveOpening(input, roomId, index, kind, dx, dy, { gridStepM = 0 } = {}) {
    const room = input.rooms.find((r) => r.id === roomId), edge = edgeAt(room, index);
    if (!edge || !["door", "window"].includes(kind) || edge.wall[`${kind}U`] == null || !Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error("Оберіть наявні двері або вікно для переміщення.");
    const length = dist(edge.a, edge.b), offset = (dx * (edge.b.x - edge.a.x) + dy * (edge.b.y - edge.a.y)) / length;
    if (Math.abs(offset) < EPS) return copy(input);
    let position = edge.wall[`${kind}U`] * length + offset;
    if (gridStepM > 0) position = Math.round(position / gridStepM) * gridStepM;
    return setWall(input, roomId, index, { [`${kind}U`]: openingPosition(room, index, kind, position / length) });
  }
  function removeRoom(p, roomId) {
    const plan = copy(p), removedIds = new Set(plan.points.filter((point) => point.roomId === roomId).map((point) => point.id)), panel = plan.points.find((point) => point.roomId === roomId && point.type === "panel");
    plan.rooms = plan.rooms.filter((r) => r.id !== roomId); plan.points = plan.points.filter((point) => !removedIds.has(point.id));
    plan.points.filter((point) => removedIds.has(point.controlsId)).forEach((point) => { point.controlsId = ""; point.circuitId = ""; });
    plan.points.filter((point) => removedIds.has(point.supplyFromId)).forEach((point) => { point.supplyFromId = ""; point.placementReview = true; });
    if (panel && plan.rooms.length) { const room = layout(plan).rooms.find((r) => r.kind === "hall") || layout(plan).rooms[0]; panel.roomId = room.id; place(panel, room, room.vertices[0]); panel.placementReview = true; plan.points.unshift(panel); }
    plan.geometryConfirmed = false; return normalize(plan);
  }
  function addRoom(p) {
    if (p.rooms.length >= 24) throw new Error("На плані може бути не більше 24 кімнат.");
    const plan = copy(p), box = layout(plan), roomId = uid(), x = plan.rooms.length ? box.minX + box.width + .8 : .12, y = .12;
    plan.rooms.push({ id: roomId, kind: "room", name: "Нова кімната", row: "bottom", order: plan.rooms.length, widthM: 3, depthM: 3, routeLevelM: 0, doorU: .5, windowWall: "none", vertices: [{ x, y }, { x: x + 3, y }, { x: x + 3, y: y + 3 }, { x, y: y + 3 }], walls: Array.from({ length: 4 }, () => ({ id: uid(), removed: false, doorU: null, windowU: null })) });
    if (!plan.points.some((p) => p.type === "panel")) plan.points.push({ id: uid(), type: "panel", label: "Щ1", name: "Щиток", roomId, u: 0, v: .5, heightM: 1.5, circuitId: "" });
    plan.geometryConfirmed = false; return normalize(plan);
  }
  function connections(plan, rooms = layout(plan).rooms) {
    const links = [];
    rooms.forEach((room, ri) => edgesOf(room).forEach(({ a, b, wall, index: i }) => {
      rooms.slice(ri + 1).forEach((other) => edgesOf(other).forEach(({ a: c, b: d, wall: partner, index: j }) => {
        const rel = relation(a, b, c, d, plan.wallThicknessM);
        if (!rel || (!wall.removed && !partner.removed && wall.doorU == null && partner.doorU == null)) return;
        let u = (rel.lo + rel.hi) / 2;
        if (!wall.removed && !partner.removed) {
          u = wall.doorU != null ? wall.doorU : projection(mix(c, d, partner.doorU), a, b).u;
          if (u < rel.lo - EPS || u > rel.hi + EPS) return;
        }
        const start = mix(a, b, u), end = projection(start, c, d);
        links.push({ a: room.id, b: other.id, from: start, to: { x: end.x, y: end.y }, edgeA: i, edgeB: j, open: wall.removed || partner.removed });
      }));
    }));
    return links;
  }
  function segmentInside(room, a, b) {
    if (!contains(room, a) || !contains(room, b)) return false;
    const cuts = [0, 1], dx = b.x - a.x, dy = b.y - a.y;
    edgesOf(room).forEach(({ a: c, b: d }) => {
      const ex = d.x - c.x, ey = d.y - c.y, denominator = dx * ey - dy * ex;
      if (Math.abs(denominator) < EPS) return;
      const u = ((c.x - a.x) * ey - (c.y - a.y) * ex) / denominator, v = ((c.x - a.x) * dy - (c.y - a.y) * dx) / denominator;
      if (u > 0 && u < 1 && v >= 0 && v <= 1) cuts.push(u);
    });
    cuts.sort((a, b) => a - b);
    return cuts.slice(1).every((u, i) => contains(room, mix(a, b, (u + cuts[i]) / 2)));
  }
  function insideRoute(room, a, b) {
    if (dist(a, b) < EPS) return [a];
    for (const elbow of [{ x: a.x, y: b.y }, { x: b.x, y: a.y }]) if (segmentInside(room, a, elbow) && segmentInside(room, elbow, b)) return [a, elbow, b].filter((p, i, list) => !i || dist(p, list[i - 1]) > EPS);
    const nodes = [a, b, ...verticesOf(room)], edges = nodes.map(() => []);
    nodes.forEach((p, i) => nodes.slice(i + 1).forEach((q, k) => { const j = i + k + 1; if (segmentInside(room, p, q)) { edges[i].push({ to: j, cost: dist(p, q), path: [p, q] }); edges[j].push({ to: i, cost: dist(p, q), path: [q, p] }); } }));
    return shortest(nodes, edges, 0, 1);
  }
  function shortest(nodes, edges, start, target) {
    const costs = nodes.map(() => Infinity), previous = [], visited = new Set(); costs[start] = 0;
    while (visited.size < nodes.length) {
      let current = -1; costs.forEach((cost, i) => { if (!visited.has(i) && (current < 0 || cost < costs[current])) current = i; });
      if (current < 0 || !Number.isFinite(costs[current])) return null;
      if (current === target) break; visited.add(current);
      edges[current].forEach((edge) => { if (costs[current] + edge.cost < costs[edge.to] - EPS) { costs[edge.to] = costs[current] + edge.cost; previous[edge.to] = { from: current, path: edge.path }; } });
    }
    const chunks = []; let at = target;
    while (at !== start) { const item = previous[at]; if (!item) return null; chunks.unshift(item.path); at = item.from; }
    return chunks.flat().filter((p, i, list) => !i || dist(p, list[i - 1]) > EPS || p.z !== list[i - 1].z);
  }
  function route(plan, from, to, arrangement) {
    const rooms = arrangement.rooms, a = rooms.find((r) => r.id === from.roomId), b = rooms.find((r) => r.id === to.roomId);
    if (!a || !b) return null;
    const level = (r) => r.kind === "outdoor" ? r.routeLevelM : plan.routing === "ceiling" ? plan.ceilingHeightM : 0;
    const nodes = [{ ...position(a, from), z: level(a), roomId: a.id }, { ...position(b, to), z: level(b), roomId: b.id }], links = connections(plan, rooms);
    links.forEach((link) => { const r = rooms.find((r) => r.id === link.a), s = rooms.find((r) => r.id === link.b); nodes.push({ ...link.from, z: level(r), roomId: r.id }, { ...link.to, z: level(s), roomId: s.id }); });
    const edges = nodes.map(() => []), add = (i, j, path) => { const cost = path.slice(1).reduce((sum, p, k) => sum + dist(p, path[k]) + Math.abs(p.z - path[k].z), 0); edges[i].push({ to: j, path, cost }); edges[j].push({ to: i, path: [...path].reverse(), cost }); };
    nodes.forEach((p, i) => nodes.slice(i + 1).forEach((q, k) => { const j = i + k + 1; if (p.roomId !== q.roomId) return; const path = insideRoute(rooms.find((r) => r.id === p.roomId), p, q); if (path) add(i, j, path.map((v) => ({ x: v.x, y: v.y, z: p.z }))); }));
    links.forEach((_, i) => { const start = 2 + i * 2, end = start + 1; add(start, end, [nodes[start], { ...nodes[end], z: nodes[start].z }, nodes[end]]); });
    const path = shortest(nodes, edges, 0, 1); if (!path) return null;
    path.unshift({ ...nodes[0], z: from.heightM === null ? plan.ceilingHeightM : from.heightM }); path.push({ ...nodes[1], z: to.heightM === null ? plan.ceilingHeightM : to.heightM });
    let horizontalM = 0, verticalM = 0;
    path.slice(1).forEach((p, i) => { horizontalM += dist(p, path[i]); verticalM += Math.abs(p.z - path[i].z); });
    return { points: path.map((p) => ({ x: round(p.x), y: round(p.y), z: round(p.z) })), horizontalM: round(horizontalM), verticalM: round(verticalM), lengthM: round(horizontalM + verticalM) };
  }
  return { area, areaOf, bounds, contours, edgesOf, verticesOf, edgeAt, vertexAt, wallAt, inward, offsetContour, centroid, contains, nearest, fit, place, position, layout, normalize, materialize, moveVertex, moveWall, dragWall, moveRoom, dockRoom, sharedWalls, stitchSharedWalls, duplicateRoom, placeBeside, resizeWall, resizeRoom, splitWall, removeVertex, setWall, openingPosition, toggleOpening, moveOpening, removeRoom, addRoom, connections, insideRoute, route };
});

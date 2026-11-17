/* Subtract a newly drawn room and its partition walls from its host room. */
(function (root, factory) {
  const api = typeof module === "object" && module.exports ? factory(require("./floor-geometry.js"), require("./vendor/polygon-clipping-0.15.7.js")) : factory(root.PanelFloorGeometry, root.polygonClipping);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PanelFloorPartition = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (G, clip) {
  "use strict";
  const EPS = .000001, copy = (v) => JSON.parse(JSON.stringify(v)), id = () => globalThis.crypto?.randomUUID?.() || `partition-${Date.now()}-${Math.random()}`;
  const round = (v) => Math.round(v * 1e6) / 1e6, distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const geometry = (room) => G.contours(room).map((ring) => ring.vertices.map((p) => [p.x, p.y]));
  const measure = (multi) => multi.reduce((sum, polygon) => sum + polygon.reduce((s, ring, i) => s + (i ? -1 : 1) * G.area(ring.map(([x, y]) => ({ x, y }))), 0), 0);
  function nextName(rooms) {
    let number = rooms.length + 1;
    while (rooms.some((r) => r.name === `Кімната ${number}`)) number++;
    return `Кімната ${number}`;
  }
  function expanded(vertices, thickness) {
    return clip.union([G.offsetContour(vertices, thickness).map((p) => [p.x, p.y])]);
  }
  function project(p, a, b) {
    const u = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (distance(a, b) ** 2 || 1);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, u };
  }
  function rebuild(polygon, source, used) {
    const edges = G.edgesOf(source);
    const makeRing = (coordinates) => {
      const vertices = coordinates.map(([x, y]) => ({ x: round(x), y: round(y) }));
      if (distance(vertices[0], vertices.at(-1)) < EPS) vertices.pop();
      const walls = vertices.map((a, i) => {
        const b = vertices[(i + 1) % vertices.length];
        const edge = edges.find((edge) => {
          const p = project(a, edge.a, edge.b), q = project(b, edge.a, edge.b);
          return distance(p, a) < EPS && distance(q, b) < EPS && Math.min(p.u, q.u) >= -EPS && Math.max(p.u, q.u) <= 1 + EPS;
        });
        const wall = edge ? { ...edge.wall } : { removed: false, doorU: null, windowU: null };
        if (!wall.id || used.has(wall.id)) wall.id = id(); used.add(wall.id);
        for (const key of ["doorU", "windowU"]) {
          const opening = edge?.wall[key] == null ? null : { x: edge.a.x + (edge.b.x - edge.a.x) * edge.wall[key], y: edge.a.y + (edge.b.y - edge.a.y) * edge.wall[key] };
          const p = opening && project(opening, a, b); wall[key] = p && p.u >= 0 && p.u <= 1 ? p.u : null;
        }
        return wall;
      });
      return { vertices, walls };
    };
    const [outer, ...holes] = polygon.map(makeRing);
    return { ...outer, ...(holes.length ? { holes } : {}) };
  }
  function insert(input, drawn) {
    let plan = copy(input); const room = copy(drawn), shape = geometry(room);
    plan.geometryConfirmed = false;
    G.normalize({ ...plan, rooms: [room] });
    const host = plan.rooms.find((r) => measure(clip.difference(shape, geometry(r))) < EPS);
    if (!host) {
      plan.rooms.push(room); G.normalize(plan);
      // Drawing from an existing boundary can mean an adjacent room rather
      // than a cut inside it. Make room for the partition's real thickness.
      for (let attempt = 0; attempt < plan.rooms.length; attempt++) {
        const touching = G.sharedWalls(plan).find((p) => (p.roomId === room.id || p.otherId === room.id) && p.gap < EPS);
        if (!touching) break;
        const current = plan.rooms.find((r) => r.id === room.id), normal = G.inward(current, touching.roomId === room.id ? touching.index : touching.otherIndex), shift = plan.wallThicknessM - touching.gap;
        plan = G.moveRoom(plan, room.id, normal.x * shift, normal.y * shift);
      }
      return { plan: G.normalize(plan), roomId: room.id, partitioned: false };
    }
    const buffer = expanded(room.vertices, plan.wallThicknessM);
    const blockedHole = (host.holes || []).some((hole) => measure(clip.intersection(buffer, [hole.vertices.map((p) => [p.x, p.y])])) > EPS);
    if (blockedHole) throw new Error("Між новою кімнатою та внутрішнім контуром замало місця на перегородки.");
    if (plan.rooms.some((r) => r.id !== host.id && measure(clip.intersection(buffer, geometry(r))) > EPS)) throw new Error("Нові перегородки перетинають іншу кімнату. Залиште місце на товщину стін.");
    const remainder = clip.difference(geometry(host), buffer);
    if (!remainder.length) throw new Error("Новий контур займає всю кімнату. Залиште місце для першої кімнати.");
    remainder.sort((a, b) => measure([b]) - measure([a]));
    const before = G.layout(plan), source = copy(host), used = new Set(plan.rooms.filter((r) => r.id !== host.id).flatMap((r) => G.edgesOf(r).map((e) => e.wall.id)));
    // Existing windows/doors on an exterior portion now belong to the new room.
    Object.assign(room, rebuild(shape, source, used));
    const remaining = [];
    remainder.forEach((polygon, i) => {
      const next = copy(source); delete next.holes; Object.assign(next, rebuild(polygon, source, used));
      (next.holes || []).forEach((hole) => {
        const old = source.holes?.find((h) => h.sourceRoomId && h.vertices.every((p) => G.contains(hole, p)));
        if (old) hole.sourceRoomId = old.sourceRoomId;
        else if (room.vertices.every((p) => G.contains(hole, p))) hole.sourceRoomId = room.id;
      });
      if (i) { next.id = id(); next.name = nextName([...plan.rooms, room, ...remaining.slice(1)]); next.kind = "room"; }
      remaining.push(next);
    });
    const hostIndex = plan.rooms.findIndex((r) => r.id === host.id); plan.rooms.splice(hostIndex, 1, ...remaining); plan.rooms.push(room);
    // Reassign points by their real coordinates; points covered by a new wall
    // move to the nearest face and are explicitly marked for placement review.
    const arrangement = G.layout(plan), destinations = [...remaining, room].map((r) => arrangement.rooms.find((s) => s.id === r.id));
    plan.points.filter((p) => p.roomId === host.id).forEach((point) => {
      const world = G.position(before.rooms.find((r) => r.id === host.id), point);
      let target = destinations.find((r) => G.contains(r, world));
      if (!target) { target = [...destinations].sort((a, b) => G.nearest(a, world).distance - G.nearest(b, world).distance)[0]; point.placementReview = true; }
      point.roomId = target.id; G.place(point, target, world);
    });
    if (plan.rooms.length > 24) throw new Error("Поділ утворює більше 24 кімнат.");
    plan.geometryConfirmed = false;
    return { plan: G.stitchSharedWalls(G.normalize(plan), room.id), roomId: room.id, partitioned: true, hostId: host.id };
  }
  return { insert, nextName };
});

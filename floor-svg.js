/* Standalone floor-plan SVG, schematic locations rather than appliance footprints. */
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./floor-plan.js") : root.PanelFloorPlan);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PanelFloorSvg = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (F) {
  "use strict";
  const G = typeof module === "object" && module.exports ? require("./floor-geometry.js") : globalThis.PanelFloorGeometry;
  const SCALE = 80, LEFT = 58, TOP = 104;
  const POINT_STYLES = {
    socket: { color: "#176bc1", fill: "#dceeff", label: "X — розетка" },
    light: { color: "#ab6500", fill: "#ffecb0", label: "EL — світильник" },
    switch: { color: "#7d3fc2", fill: "#edddff", label: "S — вимикач" },
    junction: { color: "#00856a", fill: "#cff5e8", label: "Д — доза" },
    equipment: { color: "#c23459", fill: "#ffdde6", label: "EP — техніка" },
    panel: { color: "#243e4c", fill: "#dde8ef", label: "Щ — щиток" },
  };
  const xml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  const n = (v) => Number(v).toLocaleString("uk-UA", { maximumFractionDigits: 2 });
  const X = (x) => LEFT + x * SCALE, Y = (y) => TOP + y * SCALE;
  const text = (x, y, value, cls = "", anchor = "start") => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${xml(value)}</text>`;
  function icon(point) {
    if (point.type === "panel") return '<rect x="-13" y="-16" width="26" height="32" rx="3"/><path d="M3-11L-5 1H2L-2 11"/>';
    if (point.type === "socket") return '<circle r="9"/><path d="M-4-2V3M4-2V3M-6 7H6"/>';
    if (point.type === "light") return '<circle r="10"/><path d="M-7-7L7 7M7-7L-7 7M0-15V-12M0 12V15M-15 0H-12M12 0H15"/>';
    if (point.type === "switch") return '<circle r="6"/><path d="M0-6L8-16M7-17L12-13"/>';
    if (point.type === "junction") return '<rect x="-10" y="-10" width="20" height="20" rx="3"/><circle r="3"/><path d="M0-10V-3M0 3V10M-10 0H-3M3 0H10"/>';
    if (point.appliance === "washer" || point.appliance === "dishwasher") return '<rect x="-13" y="-15" width="26" height="30" rx="2"/><path d="M-13-8H13"/><circle cy="3" r="8"/>';
    if (point.appliance === "fridge") return '<rect x="-11" y="-17" width="22" height="34" rx="2"/><path d="M-11-6H11M6-13V-9M6 0V9"/>';
    if (point.appliance === "boiler") return '<rect x="-10" y="-17" width="20" height="34" rx="8"/><path d="M-3 17V23M3 17V23M-4-3C6-9-6 9 4 3"/>';
    if (point.appliance === "ac") return '<rect x="-18" y="-8" width="36" height="16" rx="3"/><path d="M-13 2H13M-9 10V15M0 10V15M9 10V15"/>';
    return '<rect x="-12" y="-12" width="24" height="24" rx="3"/><path d="M2-7L-4 2H3L-2 8"/>';
  }

  function geometryLayers(plan, arrangement, X, Y, editing, selectedRoom, selectedWall, selectedVertex, selectedOpening, docking, alignment) {
    const fills = [], walls = [], handles = [], selectedHandles = [], openingHandles = [];
    const openingHandle = (room, index, key, a, b) => {
      const kind = key === "doorU" ? "door" : "window", label = `${kind === "door" ? "Двері" : "Вікно"} · ${room.name} · стіна ${index + 1}`, active = room.id === selectedRoom && index === selectedWall && selectedOpening === kind;
      return `<g class="opening-handle ${kind} ${active ? "selected" : ""}" role="button" tabindex="0" data-floor-opening="${kind}" data-floor-wall="${index}" data-floor-geometry-room="${xml(room.id)}" aria-label="${xml(label)}"><title>${xml(label)}. Перетягніть уздовж стіни; стрілки — зсув; Delete — прибрати отвір.</title><path d="M${X(a.x)} ${Y(a.y)}L${X(b.x)} ${Y(b.y)}" class="opening-hit"/><circle cx="${X((a.x + b.x) / 2)}" cy="${Y((a.y + b.y) / 2)}" r="6"/></g>`;
    };
    const shared = G.sharedWalls(plan), faces = (roomId, index) => shared.filter((s) => s.roomId === roomId && s.index === index || s.otherId === roomId && s.otherIndex === index).map((s) => {
      if (s.roomId === roomId) return { lo: s.lo, hi: s.hi };
      const room = arrangement.rooms.find((r) => r.id === roomId), { a, b } = G.edgeAt(room, index), length2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const u = (p) => ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length2;
      return { lo: Math.min(u(s.oppositeFrom), u(s.oppositeTo)), hi: Math.max(u(s.oppositeFrom), u(s.oppositeTo)) };
    });
    arrangement.rooms.forEach((room) => {
      const chosen = room.id === selectedRoom, editHandles = chosen ? selectedHandles : handles, centre = G.centroid(room), fill = room.kind === "bath" ? "#edf5f8" : room.kind === "kitchen" ? "#f2f6ed" : "#faf9f5";
      const name = `Кімната · ${room.name}`;
      const region = room.holes?.length ? `<path class="room-region ${chosen ? "chosen" : ""}" fill-rule="evenodd" d="${G.contours(room).map((ring) => ring.vertices.map((p, i) => `${i ? "L" : "M"}${X(p.x)},${Y(p.y)}`).join(" ") + "Z").join(" ")}" fill="${fill}"/>` : `<polygon class="room-region ${chosen ? "chosen" : ""}" points="${room.vertices.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")}" fill="${fill}"/>`;
      fills.push(`<g role="button" tabindex="0" data-floor-room="${xml(room.id)}" aria-label="${xml(name)}">${region}${text(X(centre.x), Y(centre.y) - 22, room.name, "room-name", "middle")}${text(X(centre.x), Y(centre.y) - 4, `${n(room.widthM)} × ${n(room.depthM)} м · ${n(room.areaM2)} м²`, "room-area", "middle")}</g>`);
      G.edgesOf(room).forEach(({ a, b, wall, index }) => {
        const active = chosen && selectedWall === index, len = Math.hypot(b.x - a.x, b.y - a.y), path = `M${X(a.x)} ${Y(a.y)}L${X(b.x)} ${Y(b.y)}`;
        const covered = faces(room.id, index), cuts = [...new Set([0, 1, ...covered.flatMap((s) => [s.lo, s.hi])])].sort((a, b) => a - b);
        cuts.slice(1).forEach((hi, k) => {
          const lo = cuts[k], middle = (lo + hi) / 2; if (hi - lo < .00001 || covered.some((s) => middle > s.lo - .00001 && middle < s.hi + .00001)) return;
          walls.push(`<path d="M${X(a.x + (b.x - a.x) * lo)} ${Y(a.y + (b.y - a.y) * lo)}L${X(a.x + (b.x - a.x) * hi)} ${Y(a.y + (b.y - a.y) * hi)}" class="physical-wall ${wall.removed ? "removed-wall" : ""}" stroke-linecap="butt" stroke-width="${wall.removed ? 1.2 : plan.wallThicknessM * SCALE}"/>`);
        });
        for (const [key, width, color] of [["doorU", .8, "#a5b8c0"], ["windowU", 1.4, "#79a3b7"]]) if (!wall.removed && wall[key] != null) {
          if (covered.some((s) => wall[key] >= s.lo - .00001 && wall[key] <= s.hi + .00001)) continue;
          const u = Math.max(.05, Math.min(.95, wall[key])), half = Math.min(width / 2, len * .35) / len, l = Math.max(0, u - half), r = Math.min(1, u + half), p = { x: a.x + (b.x - a.x) * l, y: a.y + (b.y - a.y) * l }, q = { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
          walls.push(`<path d="M${X(p.x)} ${Y(p.y)}L${X(q.x)} ${Y(q.y)}" stroke="${key === "doorU" ? "white" : "#e2f1f8"}" stroke-width="${plan.wallThicknessM * SCALE + 2}"/>`);
          if (key === "windowU") walls.push(`<path d="M${X(p.x)} ${Y(p.y)}L${X(q.x)} ${Y(q.y)}" stroke="${color}" stroke-width="1.5"/>`);
          if (editing) openingHandles.push(openingHandle(room, index, key, p, q));
        }
        if (editing) {
          const wallName = `Стіна ${index + 1} · ${room.name}${wall.removed ? " · видалена" : ""}`;
          editHandles.push(`<path d="${path}" class="wall-hit ${active ? "selected" : ""}" role="button" tabindex="0" data-floor-wall="${index}" data-floor-geometry-room="${xml(room.id)}" aria-label="${xml(wallName)}"><title>${xml(wallName)} · ${n(len)} м. Тягніть стіну; подвійний клік додає кут. Alt вимикає прив’язки.</title></path>`);
          if (chosen) {
            const x = (X(a.x) + X(b.x)) / 2, y = (Y(a.y) + Y(b.y)) / 2;
            editHandles.push(`${text(x, y - 12, `${n(len)} м`, "wall-measure", "middle")}<circle cx="${x}" cy="${y}" r="5" class="wall-grip ${active ? "selected" : ""}" role="button" tabindex="0" data-floor-wall="${index}" data-floor-geometry-room="${xml(room.id)}" aria-label="${xml(`Пересунути стіну ${index + 1} · ${room.name}`)}"/>`);
          }
        }
      });
      if (editing && chosen) G.verticesOf(room).forEach((p, index) => selectedHandles.push(`<rect x="${X(p.x) - 6}" y="${Y(p.y) - 6}" width="12" height="12" rx="2" class="vertex-grip ${selectedVertex === index ? "selected" : ""}" role="button" tabindex="0" data-floor-vertex="${index}" data-floor-geometry-room="${xml(room.id)}" aria-label="${xml(`Кут ${index + 1} · ${room.name}`)}"/>`));
    });
    shared.forEach((pair) => {
      const room = arrangement.rooms.find((r) => r.id === pair.roomId), other = arrangement.rooms.find((r) => r.id === pair.otherId), a = { x: (pair.from.x + pair.oppositeFrom.x) / 2, y: (pair.from.y + pair.oppositeFrom.y) / 2 }, b = { x: (pair.to.x + pair.oppositeTo.x) / 2, y: (pair.to.y + pair.oppositeTo.y) / 2 };
      const thickness = Math.max(.02, pair.gap) * SCALE, path = `M${X(a.x)} ${Y(a.y)}L${X(b.x)} ${Y(b.y)}`;
      let markup = `<path d="${path}" class="physical-wall ${pair.removed ? "removed-wall" : ""}" stroke-linecap="butt" stroke-width="${pair.removed ? 1.2 : thickness}"/>`;
      if (!pair.removed) for (const key of ["doorU", "windowU"]) {
        const candidates = [[room, pair.index], [other, pair.otherIndex]].filter(([r, i]) => G.wallAt(r, i)[key] != null).sort(([r], [s]) => Number(s.id === selectedRoom) - Number(r.id === selectedRoom));
        const opening = candidates.map(([r, i]) => { const { a: p, b: q, wall } = G.edgeAt(r, i), u = wall[key], point = { x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u }; return { room: r, index: i, u: ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / pair.lengthM ** 2 }; }).find((o) => o.u >= -.00001 && o.u <= 1.00001);
        if (opening == null) continue;
        const half = Math.min(key === "doorU" ? .4 : .7, pair.lengthM * .35) / pair.lengthM, lo = Math.max(0, opening.u - half), hi = Math.min(1, opening.u + half), p = { x: a.x + (b.x - a.x) * lo, y: a.y + (b.y - a.y) * lo }, q = { x: a.x + (b.x - a.x) * hi, y: a.y + (b.y - a.y) * hi }, d = `M${X(p.x)} ${Y(p.y)}L${X(q.x)} ${Y(q.y)}`;
        markup += `<path d="${d}" stroke="${key === "doorU" ? "white" : "#e2f1f8"}" stroke-width="${thickness + 2}"/>${key === "windowU" ? `<path d="${d}" stroke="#79a3b7" stroke-width="1.5"/>` : ""}`;
        if (editing) openingHandles.push(openingHandle(opening.room, opening.index, key, p, q));
      }
      if (docking && [pair.roomId, pair.otherId].includes(docking.targetId) && [pair.roomId, pair.otherId].includes(selectedRoom)) markup += `<path class="docking-guide" d="${path}" fill="none" stroke="#79af25" stroke-width="${thickness + 5}" opacity=".65"/>`;
      walls.push(`<g data-shared-wall="${xml(G.wallAt(room, pair.index).id)}:${xml(G.wallAt(other, pair.otherIndex).id)}" data-shared-room-a="${xml(room.id)}" data-shared-room-b="${xml(other.id)}"><title>${xml(`Спільна стіна · ${room.name} / ${other.name} · ${n(pair.lengthM)} м`)}</title>${markup}</g>`);
    });
    const guide = editing && alignment ? `<path class="alignment-guide" d="M${X(alignment.from.x)} ${Y(alignment.from.y)}L${X(alignment.to.x)} ${Y(alignment.to.y)}" fill="none" stroke="#79af25" stroke-width="2" stroke-dasharray="7 4" pointer-events="none" aria-hidden="true"/>` : "";
    return { fills: fills.join(""), walls: walls.join(""), handles: handles.join("") + selectedHandles.join("") + openingHandles.join("") + guide };
  }
  function render(project, { selectedId = "", circuitId = "", interactiveRoutes = false, selectedRouteToId = "", showRoutes = true, showHeights = true, showGrid = false, gridStepM = .1, geometryEditing = false, selectedRoom = "", selectedWall = null, selectedVertex = null, selectedOpening = null, geometryOnly = false, viewport = null, docking = null, alignment = null } = {}) {
    const result = geometryOnly ? { plan: project.floorPlan, arrangement: F.layout(project.floorPlan), circuits: [] } : F.calculate(project), { plan, arrangement } = result, frame = viewport || arrangement;
    const X = (x) => LEFT + (x - frame.minX) * SCALE, Y = (y) => TOP + (y - frame.minY) * SCALE;
    const width = Math.ceil(frame.width * SCALE + 2 * LEFT);
    const legendColumns = Math.max(1, Math.min(6, Math.floor((width - 60) / 112))), legendRows = Math.ceil(6 / legendColumns);
    const height = Math.ceil(frame.height * SCALE + TOP + Math.max(105, legendRows * 20 + 65));
    const gridStep = (Number.isFinite(Number(gridStepM)) ? Math.max(.05, Math.min(1, Number(gridStepM))) : .1) * SCALE, originX = X(0), originY = Y(0);
    const grid = showGrid ? `<g class="editor-grid" pointer-events="none" aria-hidden="true"><defs><pattern id="floor-grid-minor" patternUnits="userSpaceOnUse" x="${originX}" y="${originY}" width="${gridStep}" height="${gridStep}"><path d="M${gridStep} 0H0V${gridStep}" fill="none" stroke="#9ab2bf" stroke-width=".45" opacity=".55" vector-effect="non-scaling-stroke"/></pattern><pattern id="floor-grid-major" patternUnits="userSpaceOnUse" x="${originX}" y="${originY}" width="${SCALE}" height="${SCALE}"><path d="M${SCALE} 0H0V${SCALE}" fill="none" stroke="#6f94a5" stroke-width=".8" opacity=".6" vector-effect="non-scaling-stroke"/></pattern></defs><rect x="${LEFT}" y="${TOP}" width="${frame.width * SCALE}" height="${frame.height * SCALE}" fill="url(#floor-grid-minor)"/><rect x="${LEFT}" y="${TOP}" width="${frame.width * SCALE}" height="${frame.height * SCALE}" fill="url(#floor-grid-major)"/></g>` : "";
    const css = '.floor-svg{stroke:none;background:white}.floor-svg text{stroke:none;font-family:Arial,"Segoe UI",sans-serif;fill:#3a505d;font-size:12px}.floor-svg .fp-title{font-size:22px;font-weight:700}.floor-svg .fp-sub{font-size:10px;fill:#7b8f99}.floor-svg .room-name{font-size:16px;font-weight:700;fill:#536e7b}.floor-svg .room-area{font-size:11px;fill:#8b9ca4}.floor-svg .point-icon{stroke:currentColor;stroke-width:2.1;fill:#fff;stroke-linecap:round;stroke-linejoin:round}.floor-svg .point-icon path{fill:none}.floor-svg .point-label{font-size:11px;font-weight:700;fill:currentColor}.floor-svg .point-legend-label{font-size:10px;fill:currentColor}.floor-svg .point-height{font-size:9px;fill:#6e8491}.floor-svg .dimension{stroke:#9bb0bd;stroke-width:1;fill:none}.floor-svg .dim-text{fill:#728995;font-size:10px}.floor-svg .route{fill:none;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round}.floor-svg .point[role="button"]{cursor:grab}.floor-svg .point[role="button"]:focus{outline:none}.floor-svg .point.selected .selection-ring{stroke:#73a43d;stroke-width:2;fill:#d9efc875}.floor-svg .route-label{font-size:10px;fill:currentColor;paint-order:stroke;stroke:white;stroke-width:4;stroke-linejoin:round}';
    const header = `<rect width="${width}" height="${height}" fill="white"/>${text(30, 36, "План приміщень", "fp-title")}${text(30, 57, `${plan.name} · ${n(arrangement.areaM2)} м² · ${plan.geometryConfirmed ? "обміри підтверджені користувачем" : "типовий редагований ескіз"}`, "fp-sub")}${text(width - 30, 36, plan.routing === "ceiling" ? `Траси по стелі · h = ${n(plan.ceilingHeightM)} м` : "Траси по підлозі", "fp-sub", "end")}`;
    const geometryCss = '.floor-svg .physical-wall{stroke:#52656e;fill:none;stroke-linejoin:round}.floor-svg .removed-wall{stroke:#bdc8ce;stroke-dasharray:7 5}.floor-svg .room-region.chosen{stroke:#4a9c93;stroke-width:1.5;fill:#e9f5f1}.floor-svg.geometry-editing .point{pointer-events:none;opacity:.35}.floor-svg.geometry-editing [data-floor-room]{cursor:move}.floor-svg .wall-hit{fill:none;stroke:transparent;stroke-width:18;cursor:move;pointer-events:stroke}.floor-svg .wall-hit:hover,.floor-svg .wall-hit.selected{stroke:#2c9bba66}.floor-svg .wall-grip{fill:white;stroke:#278ba8;stroke-width:2;cursor:move}.floor-svg .vertex-grip{fill:white;stroke:#278ba8;stroke-width:2;cursor:crosshair}.floor-svg .vertex-grip.selected,.floor-svg .wall-grip.selected{fill:#d2ef69;stroke:#466c16}.floor-svg .wall-measure{fill:#2c788b;font-size:11px;paint-order:stroke;stroke:white;stroke-width:4;pointer-events:none}';
    const openingCss = ".floor-svg .opening-handle{outline:none}.floor-svg .opening-hit{fill:none;stroke:transparent;stroke-width:18;vector-effect:non-scaling-stroke;pointer-events:stroke;cursor:grab}.floor-svg .opening-handle circle{fill:#fff7df;stroke:#a96c21;stroke-width:2;cursor:grab}.floor-svg .opening-handle.window circle{fill:#e5f5ff;stroke:#267ca4}.floor-svg .opening-handle.selected circle,.floor-svg .opening-handle:focus circle{fill:#d2ef69;stroke:#466c16}";
    const geometry = plan.geometryMode === "free" ? geometryLayers(plan, arrangement, X, Y, geometryEditing, selectedRoom, selectedWall, selectedVertex, selectedOpening, docking, alignment) : null;
    const outer = geometry ? "" : arrangement.rooms.filter((room) => room.kind !== "outdoor").map((room) => `<rect x="${X(room.x - plan.wallThicknessM)}" y="${Y(room.y - plan.wallThicknessM)}" width="${(room.widthM + 2 * plan.wallThicknessM) * SCALE}" height="${(room.depthM + 2 * plan.wallThicknessM) * SCALE}" fill="#52656e"/>`).join("");
    const roomFill = (room) => room.kind === "bath" ? "#edf5f8" : room.kind === "kitchen" ? "#f2f6ed" : room.kind === "hall" ? "#f0f3f4" : room.kind === "outdoor" ? "#f2f7ee" : "#faf9f5";
    const interiors = geometry ? geometry.fills : arrangement.rooms.map((room) => {
      const x = X(room.x), y = Y(room.y), w = room.widthM * SCALE, h = room.depthM * SCALE;
      return `<g role="button" tabindex="0" data-floor-room="${xml(room.id)}" aria-label="${xml(`Кімната · ${room.name}`)}"><rect class="room-region ${room.id === selectedRoom ? "chosen" : ""}" x="${x}" y="${y}" width="${w}" height="${h}" fill="${roomFill(room)}" ${room.kind === "outdoor" ? 'stroke="#a7b89c" stroke-dasharray="6 4"' : ""}/>${text(x + w * (room.kind === "hall" ? .72 : .5), y + h * (room.kind === "hall" ? .5 : .27), room.name, "room-name", "middle")}${room.kind === "hall" ? "" : text(x + w / 2, y + h * .27 + 18, `${n(room.widthM)} × ${n(room.depthM)} м · ${n(room.widthM * room.depthM)} м²`, "room-area", "middle")}</g>`;
    }).join("");
    const openings = geometry ? geometry.walls : arrangement.rooms.filter((room) => room.row !== "hall").map((room) => {
      const door = F.doorAt(room), boundary = room.row === "top" ? room.y + room.depthM : room.y, sign = room.row === "top" ? -1 : 1;
      const gapY = boundary - sign * plan.wallThicknessM / 2, left = X(door.x - door.widthM / 2), right = X(door.x + door.widthM / 2), y = Y(boundary), d = door.widthM * SCALE;
      let window = "";
      const wall = room.windowWall;
      if (wall !== "none") {
        const vertical = ["west", "east"].includes(wall), len = Math.min(1.4, (vertical ? room.depthM : room.widthM) * .5) * SCALE;
        const cx = X(wall === "west" ? room.x - plan.wallThicknessM / 2 : wall === "east" ? room.x + room.widthM + plan.wallThicknessM / 2 : room.x + room.widthM / 2);
        const cy = Y(wall === "north" ? room.y - plan.wallThicknessM / 2 : wall === "south" ? room.y + room.depthM + plan.wallThicknessM / 2 : room.y + room.depthM / 2);
        window = `<path d="${vertical ? `M${cx} ${cy - len / 2}V${cy + len / 2}` : `M${cx - len / 2} ${cy}H${cx + len / 2}`}" stroke="#e2f1f8" stroke-width="${plan.wallThicknessM * SCALE + 2}"/><path d="${vertical ? `M${cx} ${cy - len / 2}V${cy + len / 2}` : `M${cx - len / 2} ${cy}H${cx + len / 2}`}" stroke="#79a3b7" stroke-width="1.5"/>`;
      }
      return `<path d="M${left} ${Y(gapY)}H${right}" stroke="white" stroke-width="${plan.wallThicknessM * SCALE + 2}"/><path d="M${left} ${y}V${y + sign * d}M${right} ${y}A${d} ${d} 0 0 ${sign === 1 ? 1 : 0} ${left} ${y + sign * d}" fill="none" stroke="#a8b8c0" stroke-width="1"/>${window}`;
    }).join("");
    const routes = showRoutes ? result.circuits.map((circuit) => circuit.legs.map((leg, index) => {
      const path = leg.points.filter((p, i) => !i || p.x !== leg.points[i - 1].x || p.y !== leg.points[i - 1].y);
      const selected = !circuitId || circuit.deviceId === circuitId;
      const d = path.map((p, i) => `${i ? "L" : "M"}${X(p.x)} ${Y(p.y)}`).join(" ");
      const segments = path.slice(1).map((b, i) => ({ a: path[i], b, length: Math.hypot(b.x - path[i].x, b.y - path[i].y) })).sort((a, b) => b.length - a.length);
      const mid = segments.length ? { x: (segments[0].a.x + segments[0].b.x) / 2, y: (segments[0].a.y + segments[0].b.y) / 2 } : path[0];
      const active = selected && (leg.toId === selectedRouteToId || leg.fromId === selectedId || leg.toId === selectedId);
      const from = plan.points.find((p) => p.id === leg.fromId), to = plan.points.find((p) => p.id === leg.toId);
      const title = `${circuit.label}: ${from.label} → ${to.label} · ≈${n(leg.lengthM)} м`;
      const hit = interactiveRoutes && selected && leg.kind === "feed" ? `<path d="${d}" fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke" cursor="pointer" role="button" tabindex="0" data-floor-route="${xml(leg.toId)}" data-floor-route-circuit="${xml(circuit.deviceId)}" aria-label="${xml(title)}"><title>${xml(title)} · Натисніть, щоб вставити дозу</title></path>` : "";
      return `<g style="color:${circuit.color}" opacity="${active ? 1 : selected ? circuitId ? .65 : .32 : .06}"><path class="route" d="${d}" stroke="${circuit.color}" style="stroke-width:${active ? 3.5 : 1.8}" ${leg.kind === "switch" ? 'stroke-dasharray="5 3"' : ""}><title>${xml(title)}</title></path>${circuitId && selected && mid && circuit.legs.length <= 8 && leg.kind === "feed" ? text(X(mid.x) + 6, Y(mid.y) - 7 - index % 3 * 11, `${from.label} → ${to.label} · ≈${n(leg.lengthM)} м`, "route-label") : ""}${hit}</g>`;
    }).join("")).join("") : "";
    const points = plan.points.map((point) => {
      const pos = F.world(plan, point, arrangement), circuit = result.circuits.find((c) => c.deviceId === point.circuitId), { color, fill } = POINT_STYLES[point.type];
      const labelX = point.u > .82 ? -19 : 19, anchor = point.u > .82 ? "end" : "start";
      const source = F.sourceFor(plan, point);
      const mounting = point.type === "junction" ? F.junctionMounting(plan, point) === "ceiling" ? " · на стелі" : " · на стіні" : "";
      const name = `${point.label} · ${point.name}${mounting} · h=${n(pos.z)} м${circuit ? ` · ${circuit.label}` : ""}${source ? ` · траса від ${source.label}` : ""}`;
      return `<g transform="translate(${X(pos.x)} ${Y(pos.y)})" class="point ${point.id === selectedId ? "selected" : ""}" role="button" tabindex="0" data-floor-point="${xml(point.id)}" aria-label="${xml(name)}" style="color:${color}"><title>${xml(name)}</title><circle class="selection-ring" r="23" fill="transparent" stroke="none"/><g class="point-icon" style="fill:${fill}">${icon(point)}</g>${text(point.type === "panel" ? 0 : labelX, point.type === "panel" ? 31 : -3, point.type === "equipment" ? `${point.label} · ${point.name}` : point.type === "panel" ? `${point.label} · Щиток` : point.label, "point-label", point.type === "panel" ? "middle" : anchor)}${showHeights ? text(point.type === "panel" ? 0 : labelX, point.type === "panel" ? 46 : 12, `h ${n(pos.z)} м${point.type === "junction" ? F.junctionMounting(plan, point) === "ceiling" ? " · стеля" : " · стіна" : ""}`, "point-height", point.type === "panel" ? "middle" : anchor) : ""}</g>`;
    }).join("");
    const dims = `<path class="dimension" d="M${LEFT} 79H${LEFT + arrangement.width * SCALE}M${LEFT} 73V86M${LEFT + arrangement.width * SCALE} 73V86M33 ${TOP}V${TOP + arrangement.height * SCALE}M27 ${TOP}H39M27 ${TOP + arrangement.height * SCALE}H39"/>${text(LEFT + arrangement.width * SCALE / 2, 73, `${n(arrangement.width)} м`, "dim-text", "middle")}<text class="dim-text" transform="translate(24 ${TOP + arrangement.height * SCALE / 2}) rotate(-90)" text-anchor="middle">${n(arrangement.height)} м</text>`;
    const legend = Object.entries(POINT_STYLES).map(([type, style], index) => {
      const x = 30 + index % legendColumns * 112, y = height - 62 - (legendRows - 1 - Math.floor(index / legendColumns)) * 20;
      return `<g style="color:${style.color}"><g class="point-icon" style="fill:${style.fill}" transform="translate(${x + 7} ${y - 4}) scale(.45)">${icon({ type })}</g>${text(x + 21, y, style.label, "point-legend-label")}</g>`;
    }).join("");
    const footer = `<g class="point-legend" role="group" aria-label="Кольори електричних точок">${legend}</g>${text(30, height - 43, "Кольори точок — тип; кабелів — коло. h — від чистої підлоги.", "fp-sub")}${text(30, height - 24, "Техніка позначена умовно. Запас кабелю — окремо у відомості.", "fp-sub")}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" class="floor-svg ${geometryEditing ? "geometry-editing" : ""}" role="group" aria-label="План приміщень з електричними точками" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><style>${css}${geometryCss}${openingCss}</style>${header}${outer}${interiors}${grid}${openings}${routes}${points}${dims}${geometry?.handles || ""}${footer}</svg>`;
  }
  return { SCALE, LEFT, TOP, render };
});

/* Browser UI for the shared Electrical model. */
const E = Electrical;
let wiringMode = false;
let selectedWireId = null;
let selectedBusbarId = null;
let selectedCombId = null;
let pendingTerminal = null;
let pendingPoints = [];
let pendingPointer = null;
let wireFilter = "all";
let showWireLabels = false;
let wiringFrame = 0;
let routeDrag = null;
let terminalDrag = null;
let reconnectTarget = null;
let skipSurfaceClickUntil = 0;
let wireInsertionPoint = null;

function resetWiringSelection() {
  selectedWireId = selectedBusbarId = selectedCombId = null;
  pendingTerminal = null;
  pendingPoints = [];
  pendingPointer = null;
  terminalDrag = reconnectTarget = routeDrag = null;
  wireInsertionPoint = null;
}

function setWiringMode(enabled) {
  cancelRouteDrag();
  wiringMode = enabled;
  if (!enabled) cancelPendingWire(false);
  document.body.classList.toggle("wire-mode", enabled);
  $("#layoutPalette").classList.toggle("hidden", enabled);
  $("#wiringPalette").classList.toggle("hidden", !enabled);
  $$("[data-library-mode]").forEach((tab) => {
    const selected = (tab.dataset.libraryMode === "wiring") === enabled;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  $(".library-panel h1").textContent = enabled ? "Проводка" : "Компоненти";
  if (!enabled) renderLibrary();
  renderBoard();
  renderWiringInspector();
  renderWiringPalette();
}

function colorOptions(potential) {
  return Object.entries(E.COLORS).filter(([key]) => potential === "N" ? key === "blue" : ["PE", "PEN"].includes(potential) ? key === "greenYellow" : !["blue", "greenYellow"].includes(key));
}

function fillColorSelect(select, potential, selected) {
  select.innerHTML = colorOptions(potential).map(([key, color]) => `<option value="${key}">${color.label}</option>`).join("");
  select.value = colorOptions(potential).some(([key]) => key === selected) ? selected : E.DEFAULT_COLORS[potential] || "brown";
}

function chooseWiringEntity(kind, entityId, point = null) {
  selectedDeviceId = null;
  selectedWireId = kind === "wire" ? entityId : null;
  selectedBusbarId = kind === "busbar" ? entityId : null;
  selectedCombId = kind === "comb" ? entityId : null;
  wireInsertionPoint = kind === "wire" ? point : null;
  cancelPendingWire(false);
  renderInspector();
  renderWiringInspector();
  renderWiringPalette();
  renderBoard();
  if (window.innerWidth <= 900) {
    $(".library-panel").classList.remove("drawer-open");
    $(".inspector-panel").classList.add("drawer-open");
    $("#drawerBackdrop").classList.remove("hidden");
  }
}

function renderBusbars() {
  ["top", "bottom", "left", "right"].forEach((zone) => {
    const target = $(`#busbar${zone[0].toUpperCase()}${zone.slice(1)}`);
    const bars = project.busbars.filter((bar) => bar.zone === zone);
    target.innerHTML = bars.map(busbarMarkup).join("");
    target.classList.toggle("empty", bars.length === 0);
  });
  project.busbars.filter((bar) => bar.zone === "din").forEach((bar) => {
    const row = $(`.din-row[data-row="${bar.row}"]`);
    if (row) row.insertAdjacentHTML("beforeend", busbarMarkup(bar));
  });
  $$(".busbar-card").forEach((element) => {
    const select = (event) => { event.stopPropagation(); chooseWiringEntity("busbar", element.dataset.busbarId); };
    element.addEventListener("click", select);
    element.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(event); } });
  });
  scheduleWiringPaint();
}

function busbarMarkup(bar) {
  const selected = bar.id === selectedBusbarId ? "selected" : "";
  const vertical = ["left", "right"].includes(bar.zone);
  const style = bar.zone === "din" ? `left:${bar.slot * MODULE_PX}px;width:${E.busbarModules(bar, project.board) * MODULE_PX - 3}px` : "";
  const usage = new Set(project.wires.flatMap((wire) => [wire.from, wire.to]).filter((ref) => ref.kind === "busbar" && ref.ownerId === bar.id).map((ref) => ref.portId));
  return `<div class="busbar-card potential-${bar.potential.toLowerCase()} ${selected} ${vertical ? "vertical-bar" : ""} ${bar.zone === "din" ? "din-busbar" : ""} ${bar.terminals > 10 ? "long-bar" : ""}" data-busbar-id="${escapeHtml(bar.id)}" role="button" tabindex="0" aria-label="Шина ${escapeHtml(bar.label)}" style="${style}">
    <div class="busbar-caption"><strong>${escapeHtml(bar.label)}</strong><span>${usage.size}/${bar.terminals} · ${bar.ratedCurrent ? `${bar.ratedCurrent} A` : "— A"}</span></div>
    <div class="busbar-body"><i class="busbar-mount"></i><div class="busbar-brass">${Array.from({ length: bar.terminals }, (_, index) => `<span class="busbar-screw ${usage.has(String(index + 1)) ? "occupied" : ""}" data-bar-port="${index + 1}"><i></i><small>${index + 1}</small></span>`).join("")}</div><i class="busbar-mount"></i></div>
  </div>`;
}

function renderConsumers() {
  const target = $("#consumerZone"), consumers = project.consumers || [];
  $$(".row-consumers").forEach((node) => node.remove());
  const groups = new Map(), unassigned = [];
  const markup = (consumer, device = null, stack = 1) => `<div class="consumer-card" data-consumer-id="${escapeHtml(consumer.id)}" ${device ? `data-consumer-for="${escapeHtml(device.id)}" style="grid-column:${device.slot + 1} / span ${getComponent(device).modules};grid-row:${stack}"` : ""} role="group" title="${escapeHtml(consumer.name)} · ${escapeHtml(consumer.phase)} · споживач поза щитом" aria-label="${escapeHtml(consumer.label)} · ${escapeHtml(consumer.name)}"><strong>${escapeHtml(consumer.name)}</strong>${device ? "" : `<small>${escapeHtml(consumer.phase)}</small>`}</div>`;
  consumers.forEach((consumer) => {
    const circuit = project.design?.circuits?.find((item) => item.outputKind === "consumer" && item.outputId === consumer.id);
    const directWire = project.wires.find((wire) => [wire.from, wire.to].some((ref) => ref.kind === "consumer" && ref.ownerId === consumer.id && ref.portId === "L-in") && [wire.from, wire.to].some((ref) => ref.kind === "device"));
    const directDeviceId = directWire && [directWire.from, directWire.to].find((ref) => ref.kind === "device")?.ownerId;
    const device = project.devices.find((item) => item.id === consumer.deviceId) || project.devices.find((item) => item.id === circuit?.deviceId) || project.devices.find((item) => item.id === directDeviceId);
    if (!device || !$(`.din-row[data-row="${device.row}"]`)) { unassigned.push(consumer); return; }
    if (!groups.has(device.row)) groups.set(device.row, []);
    groups.get(device.row).push({ consumer, device });
  });
  groups.forEach((entries, row) => {
    const rail = $(`.din-row[data-row="${row}"]`);
    const stacks = new Map();
    const cards = entries.map(({ consumer, device }) => { const stack = (stacks.get(device.id) || 0) + 1; stacks.set(device.id, stack); return markup(consumer, device, stack); }).join("");
    rail.insertAdjacentHTML("afterend", `<div class="row-consumers" style="grid-template-columns:repeat(${project.board.modulesPerRow}, ${MODULE_PX}px)" aria-label="Споживачі апаратів DIN ${row + 1}">${cards}</div>`);
  });
  target.classList.toggle("hidden", unassigned.length === 0);
  target.style.width = `${project.board.modulesPerRow * MODULE_PX}px`;
  target.innerHTML = unassigned.length ? `<div class="consumer-zone-caption">Споживачі без прив’язаного апарата</div><div class="consumer-grid">${unassigned.map((consumer) => markup(consumer)).join("")}</div>` : "";
}

function scheduleWiringPaint() {
  cancelAnimationFrame(wiringFrame);
  wiringFrame = requestAnimationFrame(paintWiring);
}

function surfacePoint(clientX, clientY) {
  const surface = $("#wiringSurface"), rect = surface.getBoundingClientRect();
  return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
}

function terminalGeometry() {
  const surface = $("#wiringSurface");
  const sr = surface.getBoundingClientRect();
  const points = new Map();
  E.allEndpoints(project).forEach((port) => {
    let point;
    if (port.kind === "device") {
      const node = $(`.board-device[data-device-id="${CSS.escape(port.ownerId)}"]`);
      if (!node) return;
      const r = node.getBoundingClientRect();
      point = { x: (r.left - sr.left) / zoom + r.width / zoom * port.x, y: (r.top - sr.top) / zoom + (port.side === "top" ? 2 : port.side === "bottom" ? r.height / zoom - 2 : r.height / zoom * (port.y ?? .52)) };
      if (port.side === "left") point.x = (r.left - sr.left) / zoom + 2;
      if (port.side === "right") point.x = (r.right - sr.left) / zoom - 2;
    } else if (port.kind === "consumer") {
      const node = $(`.consumer-card[data-consumer-id="${CSS.escape(port.ownerId)}"]`);
      if (!node) return;
      const r = node.getBoundingClientRect();
      point = { x: (r.left - sr.left + r.width * port.x) / zoom, y: (r.top - sr.top) / zoom + 2 };
    } else {
      const node = $(`.busbar-card[data-busbar-id="${CSS.escape(port.ownerId)}"] [data-bar-port="${port.portId}"]`);
      if (!node) return;
      const r = node.getBoundingClientRect();
      point = { x: (r.left - sr.left + r.width / 2) / zoom, y: (r.top - sr.top + r.height / 2) / zoom - 3 };
    }
    points.set(E.endpointKey(port), { ...point, port });
  });
  return points;
}

function stub(point, distance = 16) {
  return { x: point.x + (point.port?.side === "left" ? -distance : point.port?.side === "right" ? distance : 0), y: point.y + (point.port?.side === "bottom" ? distance : ["left", "right"].includes(point.port?.side) ? 0 : -distance) };
}

function wirePathPoints(wire, geometry, index) {
  const a = geometry.get(E.endpointKey(wire.from)), b = geometry.get(E.endpointKey(wire.to));
  if (!a || !b) return [];
  const distance = 15 + index % 5 * 3;
  const start = stub(a, distance), end = stub(b, distance);
  const routePoints = routeDrag?.wireId === wire.id ? routeDrag.points : wire.points;
  if (routePoints.length) return orthogonalPoints([a, start, ...routePoints, end, b]);
  if ((a.port.kind === "consumer" || b.port.kind === "consumer") && a.port.side !== b.port.side && Math.abs(a.y - b.y) < 110 && Math.abs(a.x - b.x) < MODULE_PX * 3) {
    const middleY = (a.y + b.y) / 2;
    return [a, { x: a.x, y: middleY }, { x: b.x, y: middleY }, b];
  }
  const sameLevel = Math.abs(a.y - b.y) < 8 && a.port.side === b.port.side;
  if (sameLevel) return [a, start, { x: b.x, y: start.y }, b];
  const corridor = Number($("#wiringSurface").dataset.routeInsetX || 0) + 5 + index % 5 * 3;
  return [a, start, { x: corridor, y: start.y }, { x: corridor, y: end.y }, end, b];
}

function orthogonalPoints(points) {
  const result = [{ x: points[0].x, y: points[0].y }];
  points.slice(1).forEach((point) => {
    const last = result[result.length - 1];
    if (last.x !== point.x && last.y !== point.y) result.push({ x: point.x, y: last.y });
    result.push({ x: point.x, y: point.y });
  });
  return result;
}

const pathData = (points) => points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
const visiblePotential = (potential, wire) => wireFilter === "all" || wireFilter === "phases" && E.PHASES.includes(potential) || wireFilter === "N" && potential === "N" || wireFilter === "PE" && ["PE", "PEN"].includes(potential) || wireFilter === "control" && (ControlDevices.isControlPotential(potential) || wire && [wire.from, wire.to].some((ref) => E.resolveEndpoint(project, ref)?.control));

function wireMidpoint(wireId) {
  const index = project.wires.findIndex((wire) => wire.id === wireId);
  if (index < 0) throw new Error("Оберіть провід для вставлення");
  const points = wirePathPoints(project.wires[index], terminalGeometry(), index);
  if (points.length < 2) throw new Error("Відкрийте компоновку щита для вставлення апарата");
  const lengths = points.slice(1).map((point, n) => Math.hypot(point.x - points[n].x, point.y - points[n].y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let n = 0; n < lengths.length; n += 1) {
    if (remaining <= lengths[n] && lengths[n]) return { x: points[n].x + (points[n + 1].x - points[n].x) * remaining / lengths[n], y: points[n].y + (points[n + 1].y - points[n].y) * remaining / lengths[n] };
    remaining -= lengths[n];
  }
  return points[0];
}

function closestWireAtPoint(point) {
  const geometry = terminalGeometry(), tolerance = 10 / zoom;
  let closest = null, distance = tolerance;
  // Later SVG paths are drawn on top; keep the same priority at crossings.
  for (let index = project.wires.length - 1; index >= 0; index -= 1) {
    const wire = project.wires[index];
    if (!visiblePotential(wire.potential, wire)) continue;
    const points = wirePathPoints(wire, geometry, index);
    for (let n = 1; n < points.length; n += 1) {
      const a = points[n - 1], b = points[n], dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const nextDistance = Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
      if (nextDistance < distance) { distance = nextDistance; closest = wire; }
    }
  }
  return closest;
}

function markWireDropTarget(wireId = null) {
  $$(".wire-path").forEach((node) => node.classList.toggle("drop-target", node.dataset.wireId === wireId));
}

// Show the actual connections of one apparatus, without walking through other
// apparatuses or treating a geometric wire crossing as an electrical junction.
function selectedConnections() {
  const kind = selectedDeviceId ? "device" : "busbar";
  const ownerId = selectedDeviceId || selectedBusbarId;
  const owner = (kind === "device" ? project.devices : project.busbars).find((item) => item.id === ownerId);
  if (!owner) return null;
  const focus = { kind, ownerId, label: owner.label, wireIds: new Set(), combIds: new Set(), deviceIds: new Set(), busbarIds: new Set(), consumerIds: new Set(), terminalKeys: new Set() };
  const isOwner = (ref) => ref.kind === kind && ref.ownerId === ownerId;
  const include = (ref) => {
    if (!E.resolveEndpoint(project, ref)) return;
    focus.terminalKeys.add(E.endpointKey(ref));
    if (!isOwner(ref)) focus[{ device: "deviceIds", busbar: "busbarIds", consumer: "consumerIds" }[ref.kind]].add(ref.ownerId);
  };
  project.wires.forEach((wire) => {
    if (![wire.from, wire.to].some(isOwner)) return;
    focus.wireIds.add(wire.id);
    [wire.from, wire.to].forEach(include);
  });
  project.combs.forEach((comb) => {
    if (!comb.terminals.some(isOwner)) return;
    focus.combIds.add(comb.id);
    comb.terminals.forEach(include);
  });
  focus.hasConnections = Boolean(focus.wireIds.size || focus.combIds.size);
  return focus;
}

function highlightConnectionEntities(focus) {
  const active = Boolean(focus?.hasConnections);
  [[".board-device", "deviceId", "device", "deviceIds"], [".busbar-card", "busbarId", "busbar", "busbarIds"], [".consumer-card", "consumerId", "consumer", "consumerIds"]].forEach(([selector, key, kind, collection]) => {
    $$(selector).forEach((node) => {
      const chosen = focus?.kind === kind && focus.ownerId === node.dataset[key];
      const related = active && focus[collection].has(node.dataset[key]);
      node.classList.toggle("connection-related", related);
      node.classList.toggle("connection-muted", active && !chosen && !related);
      if (related) node.setAttribute("aria-description", `З’єднано з ${focus.label}`);
      else node.removeAttribute("aria-description");
    });
  });
}

function paintWiring() {
  const surface = $("#wiringSurface"), svg = $("#wiringSvg");
  if (!surface || !svg || !$("#boardView").classList.contains("active")) return;
  const geometry = terminalGeometry();
  const selectedWire = project.wires.find((wire) => wire.id === selectedWireId);
  const graph = selectedWire ? E.connectivity(project, { neutralDomains: selectedWire.potential === "N" }) : null;
  const selectedNet = selectedWire && graph.find(selectedWire.from);
  const focus = selectedConnections();
  highlightConnectionEntities(focus);
  renderAssemblyWiringStatus(focus);
  svg.setAttribute("viewBox", `0 0 ${surface.clientWidth} ${surface.clientHeight}`);
  const markup = [`<defs><pattern id="peWirePattern" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="10" height="10" fill="#21854d"/><rect width="4" height="10" fill="#f7df3c"/></pattern></defs>`];
  const routeHandles = [];
  project.combs.forEach((comb) => {
    if (!visiblePotential(comb.potential)) return;
    const points = comb.terminals.map((ref) => geometry.get(E.endpointKey(ref))).filter(Boolean).sort((a, b) => a.x - b.x);
    if (points.length < 2) return;
    const dir = points[0].port.side === "bottom" ? 1 : -1, y = points[0].y + dir * 32;
    const d = `M${points[0].x},${y} H${points[points.length - 1].x} ${points.map((point) => `M${point.x},${y} V${point.y}`).join(" ")}`;
    const related = focus?.combIds.has(comb.id);
    markup.push(`<g class="comb-path ${comb.id === selectedCombId ? "selected" : ""} ${related ? "related" : ""} ${focus?.hasConnections && !related ? "dimmed" : ""}" data-comb-id="${escapeHtml(comb.id)}" role="button" tabindex="0" aria-label="Гребінка ${escapeHtml(comb.label)}"><path d="${d}" class="wire-halo"/><path d="${d}" stroke="#c59440" stroke-width="6" fill="none"/><path d="M${points[0].x - 6},${y} H${points[points.length - 1].x + 6}" stroke="${comb.potential === "N" ? "#1976df" : "#343b40"}" stroke-width="10" stroke-linecap="round"/><text x="${points[0].x}" y="${y + dir * 12}" class="comb-label">${escapeHtml(comb.label)}</text><path class="wire-hit" d="${d}"/></g>`);
  });
  project.wires.forEach((wire, index) => {
    if (!visiblePotential(wire.potential, wire)) return;
    const points = wirePathPoints(wire, geometry, index);
    if (!points.length) return;
    const d = pathData(points), selected = wire.id === selectedWireId;
    const related = focus ? focus.wireIds.has(wire.id) : selectedWire && graph.find(wire.from) === selectedNet;
    const dimmed = (focus?.hasConnections || selectedWire) && !related;
    const color = ["PE", "PEN"].includes(wire.potential) ? "url(#peWirePattern)" : E.COLORS[wire.color]?.hex || "#e45f5f";
    const width = 2.5 + Math.min(2.5, Math.log2(Math.max(1, wire.section)) * .35);
    const mid = points[Math.floor(points.length / 2)];
    markup.push(`<g class="wire-path ${selected ? "selected" : ""} ${related ? "related" : ""} ${dimmed ? "dimmed" : ""}" data-wire-id="${escapeHtml(wire.id)}" role="button" tabindex="0" aria-label="Провід ${escapeHtml(wire.label)}: ${escapeHtml(E.endpointLabel(project, wire.from))} → ${escapeHtml(E.endpointLabel(project, wire.to))}"><title>${escapeHtml(wire.label)} · ${wire.potential} · ${wire.section} мм² · ${wire.material}</title><path class="wire-halo" d="${d}"/><path class="wire-stroke" d="${d}" fill="none" stroke="${color}" stroke-width="${width}"/><path class="wire-hit" d="${d}"/>${showWireLabels || selected ? `<text class="wire-label" x="${mid.x + 5}" y="${mid.y - 5}">${escapeHtml(wire.label)} · ${wire.section}</text>` : ""}</g>`);
    if (selected) {
      const routePoints = routeDrag?.wireId === wire.id ? routeDrag.points : wire.points;
      const handles = routePoints.length ? routePoints : [{ x: (points[2].x + points[3].x) / 2, y: (points[2].y + points[3].y) / 2 }];
      handles.forEach((point, handleIndex) => routeHandles.push(`<rect class="route-handle" data-route-wire="${escapeHtml(wire.id)}" data-route-index="${handleIndex}" x="${point.x - 5}" y="${point.y - 5}" width="10" height="10" transform="rotate(45 ${point.x} ${point.y})" aria-label="Змінити маршрут ${escapeHtml(wire.label)}"/>`));
    }
  });
  markup.push(...routeHandles);
  geometry.forEach((point, key) => {
    const related = focus?.terminalKeys.has(key);
    if (!wiringMode && point.port.ownerId !== selectedDeviceId && point.port.ownerId !== selectedBusbarId && !related) return;
    const pending = pendingTerminal && E.sameEndpoint(point.port, pendingTerminal);
    const origin = pendingTerminal && E.resolveEndpoint(project, pendingTerminal);
    const compatible = !origin || E.compatible(project, origin, point.port);
    const ownerChosen = point.port.ownerId === selectedDeviceId || point.port.ownerId === selectedBusbarId;
    markup.push(`<g class="terminal-point ${pending ? "pending" : ""} ${origin && !compatible && !pending ? "incompatible" : ""} ${ownerChosen ? "owner-selected" : related ? "connection-related" : ""}" data-terminal-key="${escapeHtml(key)}" role="button" tabindex="0" aria-label="Клема ${escapeHtml(point.port.ownerLabel)}:${escapeHtml(point.port.label)} · ${point.port.potential}" transform="translate(${point.x} ${point.y})"><title>${escapeHtml(point.port.ownerLabel)}:${escapeHtml(point.port.label)} · ${point.port.potential} · перетягніть до іншої клеми</title><circle r="9" class="terminal-hit"/><circle r="4.5" fill="${E.COLORS[E.DEFAULT_COLORS[point.port.potential]]?.hex || "#6b7885"}"/><text y="${point.port.side === "bottom" ? 17 : -10}" text-anchor="middle">${escapeHtml(point.port.label)}</text></g>`);
  });
  if (pendingTerminal && pendingPointer) {
    const origin = geometry.get(E.endpointKey(pendingTerminal));
    if (origin) markup.push(`<path class="wire-draft" d="${pathData(orthogonalPoints([origin, stub(origin), ...pendingPoints, pendingPointer]))}"/>`);
  }
  svg.innerHTML = markup.join("");
  $$("[data-terminal-key]", svg).forEach((node) => {
    const port = geometry.get(node.dataset.terminalKey).port;
    if (port.kind === "consumer") { node.classList.add("consumer-terminal"); node.querySelector(".terminal-hit").setAttribute("r", "6"); }
    if (port.currentKind) { const text = `Клема ${port.ownerLabel}:${port.label} · ${ControlDevices.label(port)}`; node.setAttribute("aria-label", text); node.querySelector("title").textContent = text; }
    node.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault(); event.stopPropagation();
      terminalDrag = { ref: E.refOf(geometry.get(node.dataset.terminalKey).port), x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false };
    });
    node.addEventListener("click", (event) => event.stopPropagation());
    node.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); terminalClicked(geometry.get(node.dataset.terminalKey).port); } });
  });
  [["[data-wire-id]", "wire", "wireId"], ["[data-comb-id]", "comb", "combId"]].forEach(([selector, kind, key]) => {
    $$(selector, svg).forEach((node) => {
      const select = (event) => {
        event.stopPropagation();
        // In layout mode an overlaid wire must not steal a click on the device.
        const owner = !wiringMode && event.detail > 0 && document.elementsFromPoint(event.clientX, event.clientY).map((element) => element.closest(".board-device, .busbar-card")).find(Boolean);
        if (owner?.dataset?.deviceId) chooseDevice(owner.dataset.deviceId);
        else if (owner?.dataset?.busbarId) chooseWiringEntity("busbar", owner.dataset.busbarId);
        else chooseWiringEntity(kind, node.dataset[key], event.detail > 0 ? surfacePoint(event.clientX, event.clientY) : null);
      };
      node.addEventListener("click", select);
      node.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(event); } });
    });
  });
  $$("[data-route-wire]", svg).forEach((node) => node.addEventListener("pointerdown", startRouteDrag));
}

function terminalClicked(port) {
  if (!port) return;
  if (reconnectTarget) {
    try {
      const changed = E.reconnectWire(project, reconnectTarget.wireId, reconnectTarget.end, port);
      snapshot();
      Object.assign(project.wires.find((wire) => wire.id === changed.id), changed);
      cancelPendingWire(false);
      selectedWireId = changed.id;
      persistProject(); renderAll();
      toast(`${changed.label}: підключення змінено`);
    } catch (error) { toast(error.message, "error"); }
    return;
  }
  selectedWireId = selectedCombId = null;
  if (!pendingTerminal) {
    if (!wiringMode) setWiringMode(true);
    pendingTerminal = E.refOf(port);
    pendingPoints = [];
    fillColorSelect($("#newWireColor"), port.potential, E.DEFAULT_COLORS[port.potential]);
    renderWiringPalette();
    scheduleWiringPaint();
    return;
  }
  if (E.sameEndpoint(pendingTerminal, port)) return cancelPendingWire();
  try {
    const origin = E.resolveEndpoint(project, pendingTerminal);
    const potential = E.preferredPotential(origin, port);
    const color = colorOptions(potential).some(([key]) => key === $("#newWireColor").value) ? $("#newWireColor").value : E.DEFAULT_COLORS[potential];
    const wire = E.makeWire(project, pendingTerminal, port, { color, section: Number($("#newWireSection").value), material: $("#newWireMaterial").value, points: pendingPoints });
    snapshot();
    project.wires.push(wire);
    pendingTerminal = null;
    pendingPoints = [];
    pendingPointer = null;
    selectedWireId = wire.id;
    selectedBusbarId = selectedDeviceId = null;
    setWireFilter("all");
    persistProject();
    renderAll();
    toast(`${wire.label}: ${E.endpointLabel(project, wire.from)} → ${E.endpointLabel(project, wire.to)}`);
  } catch (error) { toast(error.message, "error"); }
}

function cancelPendingWire(repaint = true) {
  pendingTerminal = null; pendingPoints = []; pendingPointer = null; reconnectTarget = null;
  renderWiringPalette();
  if (repaint) scheduleWiringPaint();
}

function setWireFilter(filter) {
  wireFilter = filter;
  $$("[data-wire-filter]").forEach((item) => item.classList.toggle("active", item.dataset.wireFilter === filter));
  renderAssemblyWiringStatus();
  scheduleWiringPaint();
}

function renderAssemblyWiringStatus(focus = selectedConnections()) {
  const visible = project.wires.filter((wire) => visiblePotential(wire.potential, wire)).length;
  $("#assemblyWireCount").textContent = wireFilter === "all" ? `Проводів: ${project.wires.length}` : `Видно: ${visible}/${project.wires.length}`;
  $("#assemblyShowAllWiresButton").classList.toggle("hidden", wireFilter === "all");
  const focusHint = focus && (focus.hasConnections ? `${focus.label} · проводи: ${focus.wireIds.size} · пристрої: ${focus.deviceIds.size} · шини: ${focus.busbarIds.size}${focus.consumerIds.size ? ` · споживачі: ${focus.consumerIds.size}` : ""}${focus.combIds.size ? ` · гребінки: ${focus.combIds.size}` : ""}. Esc — зняти виділення.` : `${focus.label}: з’єднань ще немає. Esc — зняти виділення.`);
  const wire = project.wires.find((item) => item.id === selectedWireId);
  $("#assemblyWiringHint").textContent = reconnectTarget ? "Оберіть нову клему для кінця проводу. Esc — скасувати." : pendingTerminal ? `Від ${E.endpointLabel(project, pendingTerminal)} — оберіть кінцеву клему або задайте вигин на вільному полі.` : focusHint || (wire ? `${wire.label}: додайте сумісний апарат із каталогу або перетягніть його на провід.` : wiringMode ? "Протягніть провід між кольоровими клемами або натисніть їх по черзі." : "Виберіть апарат, щоб підсвітити його проводи та з’єднані компоненти. Натисніть провід для редагування.");
}

function startReconnect(end) {
  const wire = project.wires.find((item) => item.id === selectedWireId);
  if (!wire) return;
  setWiringMode(true);
  reconnectTarget = { wireId: wire.id, end };
  pendingTerminal = { ...wire[end === "from" ? "to" : "from"] };
  pendingPoints = [];
  pendingPointer = null;
  renderWiringPalette(); scheduleWiringPaint(); closeDrawers();
}

function startRouteDrag(event) {
  if (event.button !== 0 || !event.isPrimary) return;
  event.preventDefault(); event.stopPropagation();
  const wire = project.wires.find((item) => item.id === event.currentTarget.dataset.routeWire);
  if (!wire) return;
  const index = Number(event.currentTarget.dataset.routeIndex);
  routeDrag = { wireId: wire.id, index, pointerId: event.pointerId, points: clone(wire.points), moved: false, x: event.clientX, y: event.clientY };
  if (!routeDrag.points.length) routeDrag.points.push(surfacePoint(event.clientX, event.clientY));
}

function cancelRouteDrag() {
  if (!routeDrag) return;
  routeDrag = null;
  scheduleWiringPaint();
}

function renderWiringPalette() {
  const insertionWire = project.wires.find((wire) => wire.id === selectedWireId);
  $("#wireInsertionHint").classList.toggle("hidden", !insertionWire);
  $("#wireInsertionLabel").textContent = insertionWire ? `Вставлення у ${insertionWire.label} · ${insertionWire.potential}` : "";
  const instruction = reconnectTarget ? "Перепідключення: натисніть нову клему. Параметри проводу збережуться." : pendingTerminal ? `Початок: ${E.endpointLabel(project, pendingTerminal)}. Оберіть кінцеву клему. Клік на порожньому полі додає вигин.` : "Протягніть провід від однієї кольорової клеми до іншої або натисніть їх по черзі.";
  renderAssemblyWiringStatus();
  $("#wiringInstruction").textContent = instruction;
  $("#cancelWireButton").classList.toggle("hidden", !pendingTerminal);
  $("#wireBadge").textContent = project.wires.length;
  if (wiringMode) $("#libraryCount").textContent = `${project.wires.length} пров.`;
  $("#wiringItems").innerHTML = `<div class="wiring-list-heading">Шини <span>${project.busbars.length}</span></div>${project.busbars.map((bar) => `<button class="wiring-list-item ${bar.id === selectedBusbarId ? "active" : ""}" data-select-bar="${escapeHtml(bar.id)}" type="button"><i class="bar-chip ${bar.potential === "N" ? "n-chip" : "pe-chip"}"></i><strong>${escapeHtml(bar.label)}</strong><span>${bar.terminals} клем</span></button>`).join("")}${project.combs.length ? `<div class="wiring-list-heading">Гребінки <span>${project.combs.length}</span></div>${project.combs.map((comb) => `<button class="wiring-list-item" data-select-comb="${escapeHtml(comb.id)}" type="button"><strong>${escapeHtml(comb.label)}</strong><span>${comb.potential} · ${comb.terminals.length} контактів</span></button>`).join("")}` : ""}<div class="wiring-list-heading">Проводи <span>${project.wires.length}</span></div>${project.wires.map((wire) => `<button class="wiring-list-item ${wire.id === selectedWireId ? "active" : ""}" data-select-wire="${escapeHtml(wire.id)}" type="button"><i class="wire-color-dot" style="background:${E.COLORS[wire.color]?.hex || "#999"}"></i><strong>${escapeHtml(wire.label)}</strong><span>${wire.potential} · ${wire.section} мм²</span></button>`).join("")}`;
  $$("[data-select-bar]").forEach((node) => node.addEventListener("click", () => chooseWiringEntity("busbar", node.dataset.selectBar)));
  $$("[data-select-wire]").forEach((node) => node.addEventListener("click", () => chooseWiringEntity("wire", node.dataset.selectWire)));
  $$("[data-select-comb]").forEach((node) => node.addEventListener("click", () => chooseWiringEntity("comb", node.dataset.selectComb)));
}

function renderWiringInspector() {
  const wire = project.wires.find((item) => item.id === selectedWireId);
  const bar = project.busbars.find((item) => item.id === selectedBusbarId);
  const comb = project.combs.find((item) => item.id === selectedCombId);
  $("#wireInspector").classList.toggle("hidden", !wire);
  $("#busbarInspector").classList.toggle("hidden", !bar);
  $("#combInspector").classList.toggle("hidden", !comb);
  if (wire) {
    $("#wireInspectorTitle").textContent = `${wire.label} · ${wire.potential}`;
    $("#wireAddress").textContent = `${E.endpointLabel(project, wire.from)} → ${E.endpointLabel(project, wire.to)}`;
    $("#wireLabelInput").value = wire.label;
    $("#wireSectionInput").value = wire.section;
    $("#wireMaterialInput").value = wire.material;
    $("#wireTypeInput").value = wire.wireType || "";
    $("#wireLengthInput").value = wire.lengthM ?? "";
    fillColorSelect($("#wireColorInput"), wire.potential, wire.color);
  }
  if (bar) {
    $("#busbarInspectorTitle").textContent = `${bar.label} · ${bar.potential}`;
    $("#busbarLabelInput").value = bar.label;
    $("#busbarCountInput").value = bar.terminals;
    $("#busbarCurrentInput").value = bar.ratedCurrent || "";
    $("#busbarMinInput").value = bar.minSection || "";
    $("#busbarMaxInput").value = bar.maxSection || "";
    $("#busbarZoneInput").value = bar.zone;
    $("#busbarRowInput").innerHTML = Array.from({ length: project.board.rows }, (_, i) => `<option value="${i}">DIN ${i + 1}</option>`).join("");
    $("#busbarRowInput").value = bar.row;
    $("#busbarSlotInput").value = bar.slot + 1;
    $("#busbarRowInput").disabled = $("#busbarSlotInput").disabled = bar.zone !== "din";
    $("#busbarRcdField").classList.toggle("hidden", bar.potential !== "N");
    $("#busbarRcdInput").innerHTML = `<option value="">Визначати за підключенням</option>${project.devices.filter(E.isRcd).map((device) => `<option value="${escapeHtml(device.id)}">${escapeHtml(device.label)} · ${escapeHtml(device.name)}</option>`).join("")}`;
    $("#busbarRcdInput").value = bar.rcdId || "";
    $("#addRcdNeutralButton").classList.add("hidden");
    const refs = project.wires.flatMap((connection) => [connection.from.ownerId === bar.id ? { ref: connection.from, other: connection.to, wire: connection } : null, connection.to.ownerId === bar.id ? { ref: connection.to, other: connection.from, wire: connection } : null]).filter(Boolean);
    $("#busbarAssignment").innerHTML = `<strong>Затискачі · ${refs.length}/${bar.terminals}</strong>${Array.from({ length: bar.terminals }, (_, index) => { const entries = refs.filter((entry) => entry.ref.portId === String(index + 1)); return `<div><b>${index + 1}</b><span>${entries.length ? entries.map((entry) => `${escapeHtml(entry.wire.label)} → ${escapeHtml(E.endpointLabel(project, entry.other))}`).join(", ") : "Вільно"}</span></div>`; }).join("")}`;
  }
  if (comb) {
    $("#combInspectorTitle").textContent = `${comb.label} · ${comb.potential}`;
    $("#combMembers").innerHTML = `<strong>${comb.terminals.length} контактів · ${comb.ratedCurrent ? `${comb.ratedCurrent} А` : "номінал не задано"}</strong>${comb.terminals.map((ref) => `<div><span>${escapeHtml(E.endpointLabel(project, ref))}</span></div>`).join("")}`;
  }
  const rcd = project.devices.find((device) => device.id === selectedDeviceId && E.isRcd(device));
  $("#addRcdNeutralButton").classList.toggle("hidden", !rcd);
  if (rcd) {
    // The action is placed with the device properties while that device is selected.
    $("#deviceInspector").append($("#addRcdNeutralButton"));
  } else if (!bar) $("#busbarInspector").append($("#addRcdNeutralButton"));
}

function createBusbar(potential, rcdId = "") {
  if (potential === "PEN" && !(project.board.earthing === "TN-C-S" && project.board.penSplit)) return toast("Спочатку задайте TN-C-S і точку поділу PEN у параметрах щита.", "error");
  if (potential === "PEN" && project.busbars.some((bar) => bar.potential === "PEN")) return toast("У цьому щиті вже є PEN-шина.", "error");
  let next = 1;
  while (project.busbars.some((bar) => bar.label === `${potential}${next}`)) next += 1;
  const bar = { id: uid(), potential, label: `${potential}${next}`, terminals: 8, zone: "bottom", row: 0, slot: 0, rcdId, ratedCurrent: null, minSection: null, maxSection: null };
  const candidate = clone(project);
  candidate.busbars.push(bar);
  if (rcdId) {
    try { candidate.wires.push(E.makeWire(candidate, { kind: "device", ownerId: rcdId, portId: "N-out" }, { kind: "busbar", ownerId: bar.id, portId: "1" }, { section: Number($("#newWireSection").value), color: "blue" })); }
    catch (error) { return toast(error.message, "error"); }
  }
  snapshot(); project = candidate;
  selectedBusbarId = bar.id;
  selectedDeviceId = selectedWireId = selectedCombId = null;
  persistProject();
  setWiringMode(true);
  renderAll();
  closeDrawers();
  setTimeout(fitBoard, 0);
  toast(`${bar.label}: шину додано, номінал задайте за паспортом`);
}

function updateBusbar() {
  const bar = project.busbars.find((item) => item.id === selectedBusbarId);
  if (!bar) return;
  const next = { ...bar, label: $("#busbarLabelInput").value.trim() || bar.label, terminals: Number($("#busbarCountInput").value), zone: $("#busbarZoneInput").value, row: Number($("#busbarRowInput").value), slot: Number($("#busbarSlotInput").value) - 1, ratedCurrent: E.positiveOrNull($("#busbarCurrentInput").value), minSection: E.positiveOrNull($("#busbarMinInput").value), maxSection: E.positiveOrNull($("#busbarMaxInput").value), rcdId: bar.potential === "N" ? $("#busbarRcdInput").value : "" };
  if (next.zone === "din" && bar.zone !== "din") {
    const available = findFirstSpace(E.busbarModules(next));
    if (available) Object.assign(next, available);
  }
  const connectedSlots = project.wires.flatMap((wire) => [wire.from, wire.to]).filter((ref) => ref.ownerId === bar.id).map((ref) => Number(ref.portId));
  let problem;
  if (!Number.isInteger(next.terminals) || next.terminals < 2 || next.terminals > 24) problem = "Потрібно від 2 до 24 клем.";
  else if (connectedSlots.some((slot) => slot > next.terminals)) problem = "Ці клеми підключені. Спершу перенесіть або видаліть відповідні проводи.";
  else if (next.minSection && next.maxSection && next.minSection > next.maxSection) problem = "Мінімальний переріз перевищує максимальний.";
  else if (next.zone === "din" && !isSpaceFree(next.row, next.slot, E.busbarModules(next), bar.id)) problem = "Для шини немає місця на вибраній DIN-рейці.";
  else {
    const candidate = { ...project, busbars: project.busbars.map((item) => item.id === bar.id ? next : item) };
    problem = E.validate(candidate).find((issue) => issue.level === "error" && ["neutral-mix", "bar-section", "bar-rcd"].includes(issue.code))?.text;
  }
  if (problem) { toast(problem, "error"); renderWiringInspector(); return; }
  snapshot(); Object.assign(bar, next); persistProject(); renderAll();
  requestAnimationFrame(updateZoomLayout);
}

function updateSelectedWire() {
  const wire = project.wires.find((item) => item.id === selectedWireId);
  if (!wire) return;
  const changed = { ...wire, label: $("#wireLabelInput").value.trim() || wire.label, section: Number($("#wireSectionInput").value), color: $("#wireColorInput").value, material: $("#wireMaterialInput").value };
  const length = $("#wireLengthInput").value.trim();
  if (length && (!Number.isFinite(Number(length)) || Number(length) <= 0 || Number(length) > 100000)) { toast("Введіть додатну довжину проводу до 100 000 м або залиште поле порожнім.", "error"); renderWiringInspector(); return; }
  changed.wireType = $("#wireTypeInput").value.trim(); changed.lengthM = length ? Number(length) : null;
  const candidate = { ...project, wires: project.wires.map((item) => item.id === wire.id ? changed : item) };
  const error = E.validate(candidate).find((issue) => issue.level === "error" && issue.entityId === wire.id);
  if (error) { toast(error.text, "error"); renderWiringInspector(); return; }
  snapshot(); D.invalidateWireEvidence(project, wire, changed); Object.assign(wire, changed); persistProject(); renderAll();
}

function deleteWiringEntity(kind, entityId) {
  if (!entityId) return;
  snapshot();
  project = E.removeEntity(project, kind, entityId);
  resetWiringSelection();
  persistProject(); renderAll();
  toast("Елемент і пов’язані з’єднання видалено. Ctrl+Z — повернути.");
}

function openCombModal() {
  $("#combLabelInput").value = E.nextLabel(project.combs, "BB");
  $("#combRowInput").innerHTML = Array.from({ length: project.board.rows }, (_, row) => `<option value="${row}">DIN ${row + 1}</option>`).join("");
  const selected = project.devices.find((device) => device.id === selectedDeviceId);
  $("#combRowInput").value = selected?.row || 0;
  $("#combEndInput").value = project.board.modulesPerRow;
  $("#combStartInput").value = 1;
  $("#combStartInput").max = $("#combEndInput").max = project.board.modulesPerRow;
  $("#combPotentialInput").value = selected && E.PHASES.includes(selected.phase) ? selected.phase : "L1";
  openModal("#combModal");
}

function applyComb() {
  const row = Number($("#combRowInput").value), start = Number($("#combStartInput").value) - 1, end = Number($("#combEndInput").value) - 1;
  const potential = $("#combPotentialInput").value, side = $("#combSideInput").value;
  const terminals = E.allEndpoints(project).filter((port) => port.kind === "device" && port.potential === potential && port.side === side).filter((port) => { const device = project.devices.find((item) => item.id === port.ownerId); return device.row === row && device.slot >= start && device.slot <= end; }).map(E.refOf);
  const comb = { id: uid(), label: $("#combLabelInput").value.trim() || E.nextLabel(project.combs, "BB"), potential, terminals, ratedCurrent: E.positiveOrNull($("#combCurrentInput").value) };
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= project.board.modulesPerRow) return toast("Перевірте діапазон модулів гребінки.", "error");
  const candidate = { ...project, combs: [...project.combs, comb] };
  const error = E.validate(candidate).find((issue) => issue.level === "error" && (issue.entityId === comb.id || issue.code === "neutral-mix"));
  if (error) return toast(error.text, "error");
  snapshot(); project.combs.push(comb); persistProject();
  $("#combModal").classList.add("hidden");
  selectedCombId = comb.id; selectedWireId = selectedBusbarId = selectedDeviceId = null;
  renderAll(); toast(`${comb.label}: об’єднано ${terminals.length} клем (${potential})`);
}

function wiringChecks() {
  const issues = E.validate(project);
  const byCode = new Map();
  const titles = { "neutral-mix": "Змішані N-групи", "bar-rating": "Паспортні дані шин", "bar-unconnected": "Непідключені шини", "device-phase": "Полюсність апаратів", "wire-color": "Кольори проводів", "missing-terminal": "Відсутні клеми", "potential-mismatch": "Несумісні провідники", "terminal-overflow": "Зайнята клема шини", "bar-section": "Переріз і затискачі", "comb-potential": "Несумісна гребінка" };
  issues.forEach((issue) => { if (!byCode.has(issue.code)) byCode.set(issue.code, { level: issue.level, title: titles[issue.code] || "Перевірка з’єднань", text: issue.text }); else byCode.get(issue.code).text += ` ${issue.text}`; });
  if (!project.wires.length && !project.combs.length) byCode.set("connections", { level: "warning", title: "Проводка ще не задана", text: "Увімкніть «Проводка» та з’єднайте клеми." });
  else if (!issues.some((issue) => issue.level === "error")) byCode.set("connections", { level: "success", title: "Топологія з’єднань", text: `${project.wires.length} проводів; несумісних клем і змішаних N-груп не знайдено.` });
  return [...byCode.values()];
}

function renderWireReport() {
  const rows = E.wireRows(project);
  $("#wireBadge").textContent = rows.length;
  $("#wireSummary").innerHTML = `<article class="bom-summary-card"><span>Проводів</span><strong>${rows.length}</strong></article><article class="bom-summary-card"><span>N / PE / PEN-шин</span><strong>${project.busbars.length}</strong></article><article class="bom-summary-card"><span>Гребінок</span><strong>${project.combs.length}</strong></article>`;
  $("#wireTableBody").innerHTML = rows.map((row) => `<tr><td><strong>${escapeHtml(row.label)}</strong></td><td>${escapeHtml(row.from)}</td><td>${escapeHtml(row.to)}</td><td>${row.potential}</td><td>${row.section}</td><td>${escapeHtml(row.color)} · ${row.material}</td><td>${escapeHtml(row.wireType || "Не задано")}</td><td>${row.lengthM == null ? "Не задано" : `${cableNumber(row.lengthM)} м`}</td><td>${row.route}</td></tr>`).join("");
  $("#wiresEmpty").classList.toggle("hidden", rows.length > 0);
  $(".wire-table").classList.toggle("hidden", rows.length === 0);
  $("#combReport").innerHTML = project.combs.length ? `<div class="report-section-title">Відомість гребінок</div><table class="bom-table"><thead><tr><th>Позначення</th><th>Провідник</th><th>Контакти</th><th>Номінал</th></tr></thead><tbody>${project.combs.map((comb) => `<tr><td>${escapeHtml(comb.label)}</td><td>${comb.potential}</td><td>${comb.terminals.map((ref) => escapeHtml(E.endpointLabel(project, ref))).join(", ")}</td><td>${comb.ratedCurrent ? `${comb.ratedCurrent} А` : "Не задано"}</td></tr>`).join("")}</tbody></table>` : "";
  $("#combReport").classList.toggle("hidden", project.combs.length === 0);
}

function exportWireCsv() {
  const rows = [["Позначення", "Від", "До", "Провідник", "Переріз, мм²", "Колір", "Матеріал", "Маршрут", "Тип / марка", "Довжина, м"]];
  E.wireRows(project).forEach((row) => rows.push([row.label, row.from, row.to, row.potential, row.section, row.color, row.material, row.route, row.wireType, row.lengthM ?? ""]));
  project.combs.forEach((comb) => rows.push([comb.label, "Гребінка", comb.terminals.map((ref) => E.endpointLabel(project, ref)).join(" / "), comb.potential, "", "", "", `${comb.terminals.length} контактів`, "", ""]));
  downloadBlob(csvContent(rows), `${slugify(project.name)}-connections.csv`, "text/csv;charset=utf-8");
  toast("Відомість з’єднань CSV збережено");
}

function csvContent(rows) {
  return E.csvContent(rows);
}

function createWiringDemo() {
  persistProject({ immediate: true });
  const now = new Date().toISOString();
  const demo = E.normalizeProject({ id: uid(), name: "Щит з проводкою · приклад", createdAt: now, updatedAt: now, board: { name: "ЩР-1 · приклад з’єднань", rows: 3, modulesPerRow: 18, ip: "IP40", reserve: 20, earthing: "TN-S" }, devices: [
    makeDevice("main-4p", 0, 0, { label: "QF0", name: "Ввід", rating: "C40", phase: "3P" }),
    makeDevice("rccb-4p", 0, 6, { label: "QD1", name: "Групове ПЗВ", phase: "3P" }),
    makeDevice("mcb-1p", 1, 0, { label: "QF1", name: "Освітлення", rating: "B10", phase: "L1", load: .8 }),
    makeDevice("mcb-1p", 1, 1, { label: "QF2", name: "Розетки", phase: "L1", load: 2.1 }),
    makeDevice("mcb-1p", 1, 2, { label: "QF3", name: "Кухня", phase: "L1", load: 2.8 }),
    makeDevice("rcbo", 1, 6, { label: "QFD1", name: "Пральна машина", phase: "L2", load: 2.2 }),
    makeDevice("relay", 2, 0, { label: "KV1", name: "Реле напруги", phase: "L1" }),
    makeDevice("spd-4p", 2, 6, { label: "SPD1", name: "Імпульсний захист", phase: "3P" }),
  ] });
  const [main, rcd, qf1, qf2, qf3, rcbo, relay, spd] = demo.devices;
  const mainN = { id: uid(), label: "N0", potential: "N", terminals: 8, zone: "bottom", row: 0, slot: 0, ratedCurrent: null, minSection: null, maxSection: null, rcdId: "" };
  const groupN = { ...mainN, id: uid(), label: "N1 · QD1", rcdId: rcd.id };
  const pe = { ...mainN, id: uid(), label: "PE1", potential: "PE" };
  demo.busbars.push(mainN, groupN, pe);
  const dev = (device, portId) => ({ kind: "device", ownerId: device.id, portId });
  const bar = (owner, n) => ({ kind: "busbar", ownerId: owner.id, portId: String(n) });
  const connect = (from, to) => demo.wires.push(E.makeWire(demo, from, to, { section: 6 }));
  E.PHASES.forEach((phase) => connect(dev(main, `${phase}-out`), dev(rcd, `${phase}-in`)));
  connect(dev(main, "N-out"), bar(mainN, 1));
  connect(bar(mainN, 2), dev(rcd, "N-in"));
  connect(dev(rcd, "N-out"), bar(groupN, 1));
  connect(dev(rcd, "L1-out"), dev(qf1, "L-in"));
  demo.combs.push({ id: uid(), label: "BB001", potential: "L1", terminals: [qf1, qf2, qf3].map((device) => dev(device, "L-in")), ratedCurrent: null });
  connect(dev(main, "L2-out"), dev(rcbo, "L-in"));
  connect(bar(mainN, 3), dev(rcbo, "N-in"));
  connect(dev(main, "L1-out"), dev(relay, "L-in"));
  connect(bar(mainN, 4), dev(relay, "N-in"));
  E.PHASES.forEach((phase) => connect(dev(main, `${phase}-out`), dev(spd, `${phase}-in`)));
  connect(bar(mainN, 5), dev(spd, "N-in"));
  connect(bar(pe, 1), dev(spd, "PE"));
  project = demo;
  projects.unshift(clone(demo));
  selectedDeviceId = null; resetWiringSelection(); undoStack = []; redoStack = [];
  persistProject({ immediate: true });
  switchView("board"); setWiringMode(true); closeDrawers(); renderAll();
  requestAnimationFrame(fitBoard);
  toast("Приклад відкрито як окремий проєкт");
}

function initWiring() {
  const dropSurface = $("#wiringSurface");
  dropSurface.addEventListener("dragover", (event) => {
    if (![...(event.dataTransfer?.types || [])].some((type) => ["text/component-type", "text/device-id"].includes(type))) return;
    const wire = closestWireAtPoint(surfacePoint(event.clientX, event.clientY));
    markWireDropTarget(wire?.id);
    if (wire) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = event.dataTransfer.types.includes("text/device-id") ? "move" : "copy"; }
  }, true);
  dropSurface.addEventListener("dragleave", (event) => { if (!dropSurface.contains(event.relatedTarget)) markWireDropTarget(); });
  dropSurface.addEventListener("drop", (event) => {
    const point = surfacePoint(event.clientX, event.clientY), wire = closestWireAtPoint(point);
    markWireDropTarget();
    if (!wire) return;
    const type = event.dataTransfer.getData("text/component-type"), deviceId = event.dataTransfer.getData("text/device-id");
    const existing = project.devices.find((device) => device.id === deviceId);
    if (!type && !existing) return;
    event.preventDefault(); event.stopPropagation();
    insertComponentAtWire(type || existing.type, wire.id, point, existing?.id);
  }, true);
  $("#cancelWireInsertionButton").addEventListener("click", () => { selectedWireId = null; wireInsertionPoint = null; renderAll(); });
  $("#insertWireComponentButton").addEventListener("click", () => {
    switchView("board"); setWiringMode(false);
    if (window.innerWidth <= 900) toggleDrawer("library");
  });
  fillColorSelect($("#newWireColor"), "L1", "brown");
  const modeTabs = $$("[data-library-mode]");
  const activateModeTab = (tab) => { switchView("board"); setWiringMode(tab.dataset.libraryMode === "wiring"); };
  modeTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateModeTab(tab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? modeTabs.length - 1 : (index + 1) % modeTabs.length;
      activateModeTab(modeTabs[next]);
      modeTabs[next].focus();
    });
  });
  $("#assemblyShowAllWiresButton").addEventListener("click", () => setWireFilter("all"));
  $$('[data-add-busbar]').forEach((button) => button.addEventListener("click", () => createBusbar(button.dataset.addBusbar)));
  $("#cancelWireButton").addEventListener("click", () => cancelPendingWire());
  $("#wireFilters").addEventListener("click", (event) => { const button = event.target.closest("[data-wire-filter]"); if (button) setWireFilter(button.dataset.wireFilter); });
  $("#showWireLabels").addEventListener("change", (event) => { showWireLabels = event.target.checked; scheduleWiringPaint(); });
  $("#showDeviceTerminalsButton").addEventListener("click", () => { setWiringMode(true); closeDrawers(); });
  $("#deleteWireButton").addEventListener("click", () => deleteWiringEntity("wire", selectedWireId));
  $("#reconnectWireFromButton").addEventListener("click", () => startReconnect("from"));
  $("#reconnectWireToButton").addEventListener("click", () => startReconnect("to"));
  $("#deleteBusbarButton").addEventListener("click", () => deleteWiringEntity("busbar", selectedBusbarId));
  $("#deleteCombButton").addEventListener("click", () => deleteWiringEntity("comb", selectedCombId));
  ["wireLabelInput", "wireColorInput", "wireSectionInput", "wireMaterialInput", "wireTypeInput", "wireLengthInput"].forEach((field) => $(`#${field}`).addEventListener("change", updateSelectedWire));
  ["busbarLabelInput", "busbarCountInput", "busbarCurrentInput", "busbarZoneInput", "busbarRowInput", "busbarSlotInput", "busbarRcdInput", "busbarMinInput", "busbarMaxInput"].forEach((field) => $(`#${field}`).addEventListener("change", updateBusbar));
  $("#addRcdNeutralButton").addEventListener("click", () => { const device = project.devices.find((item) => item.id === selectedDeviceId && E.isRcd(item)); if (device) createBusbar("N", device.id); });
  $("#resetWireRouteButton").addEventListener("click", () => { const wire = project.wires.find((item) => item.id === selectedWireId); if (!wire?.points.length) return; snapshot(); wire.points = []; persistProject(); renderAll(); });
  $("#addCombButton").addEventListener("click", openCombModal);
  $("#applyCombButton").addEventListener("click", applyComb);
  $("#wireCsvButton").addEventListener("click", exportWireCsv);
  $("#printWiresButton").addEventListener("click", () => window.print());
  $("#wiringDemoButton").addEventListener("click", createWiringDemo);
  $("#addPenBarButton").addEventListener("click", () => { if (applyBoardSettings() !== false) createBusbar("PEN"); });
  $("#boardEarthingInput").addEventListener("change", () => { if ($("#boardEarthingInput").value !== "TN-C-S") $("#boardPenSplitInput").checked = false; });
  $("#wiringSurface").addEventListener("pointermove", (event) => { if (!pendingTerminal) return; pendingPointer = surfacePoint(event.clientX, event.clientY); scheduleWiringPaint(); });
  $("#wiringSurface").addEventListener("click", (event) => {
    if (performance.now() < skipSurfaceClickUntil || !pendingTerminal || event.target.closest(".board-device,.busbar-card,.terminal-point,.wire-path,.comb-path,.route-handle")) return;
    pendingPoints.push(surfacePoint(event.clientX, event.clientY));
    scheduleWiringPaint();
  });
  $("#canvas").addEventListener("click", (event) => {
    if (event.button !== 0 || pendingTerminal || reconnectTarget || routeDrag || terminalDrag || performance.now() < skipSurfaceClickUntil) return;
    if (event.target.closest(".board-device,.busbar-card,.consumer-card,.terminal-point,.wire-path,.comb-path,.route-handle,button,input,select,textarea,a")) return;
    if (!selectedDeviceId && !selectedWireId && !selectedBusbarId && !selectedCombId) return;
    selectedDeviceId = null; resetWiringSelection(); renderBoard(); renderInspector(); scheduleWiringPaint();
  });
  document.addEventListener("pointermove", (event) => {
    if (terminalDrag && event.pointerId === terminalDrag.pointerId) {
      if (!terminalDrag.moved && Math.hypot(event.clientX - terminalDrag.x, event.clientY - terminalDrag.y) < 5) return;
      if (!terminalDrag.moved) {
        terminalDrag.moved = true;
        if (!reconnectTarget && pendingTerminal && !E.sameEndpoint(pendingTerminal, terminalDrag.ref)) cancelPendingWire(false);
        if (!pendingTerminal) terminalClicked(E.resolveEndpoint(project, terminalDrag.ref));
      }
      pendingPointer = surfacePoint(event.clientX, event.clientY);
      scheduleWiringPaint();
      return;
    }
    if (!routeDrag || event.pointerId !== routeDrag.pointerId) return;
    const wire = project.wires.find((item) => item.id === routeDrag.wireId);
    if (!wire) return;
    const point = surfacePoint(event.clientX, event.clientY);
    if (!routeDrag.moved && Math.hypot(event.clientX - routeDrag.x, event.clientY - routeDrag.y) < 3) return;
    routeDrag.moved = true;
    routeDrag.points[routeDrag.index] = { x: Math.max(0, Math.min($("#wiringSurface").clientWidth, point.x)), y: Math.max(0, Math.min($("#wiringSurface").clientHeight, point.y)) };
    scheduleWiringPaint();
  });
  document.addEventListener("pointerup", (event) => {
    if (terminalDrag && event.pointerId === terminalDrag.pointerId) {
      const drag = terminalDrag;
      terminalDrag = null;
      skipSurfaceClickUntil = performance.now() + 250;
      if (drag.moved) {
        const node = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-terminal-key]");
        const port = node && terminalGeometry().get(node.dataset.terminalKey)?.port;
        if (port && !E.sameEndpoint(pendingTerminal, port)) terminalClicked(port);
      } else {
        const port = E.resolveEndpoint(project, drag.ref);
        if (port) terminalClicked(port);
      }
    }
    if (routeDrag && event.pointerId === routeDrag.pointerId) {
      const drag = routeDrag, wire = project.wires.find((item) => item.id === drag.wireId);
      routeDrag = null;
      if (wire && drag.moved && JSON.stringify(wire.points) !== JSON.stringify(drag.points)) { snapshot(); wire.points = drag.points; persistProject(); }
      skipSurfaceClickUntil = performance.now() + 250;
      renderAll();
    }
  });
  document.addEventListener("pointercancel", () => {
    if (terminalDrag) { terminalDrag = null; cancelPendingWire(); }
    cancelRouteDrag();
  });
  document.addEventListener("keydown", (event) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable || $(".modal-backdrop:not(.hidden)")) return;
    if (event.key.toLowerCase() === "w" && !event.ctrlKey && !event.metaKey) { event.preventDefault(); switchView("board"); setWiringMode(!wiringMode); }
  });
}

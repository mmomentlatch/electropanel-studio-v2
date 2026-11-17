/* Pointer editing previews are separate from the saved project until release. */
const FG = PanelFloorGeometry;
let floorGeometryEditing = false;
let floorWallIndex = null;
let floorVertexIndex = null;
let floorOpeningKind = null;
let floorGeometryDrag = null;
let floorGeometryPreview = null;
let floorGeometryFrame = null;
let floorDockingInfo = null;
let floorWallAlignment = null;
let floorGeometryHit = null;
let floorPreviousGeometryHit = null;

function floorGeometryOptions() {
  return { geometryEditing: floorGeometryEditing, selectedRoom: floorRoomId, selectedWall: floorWallIndex, selectedVertex: floorVertexIndex, selectedOpening: floorOpeningKind, viewport: floorGeometryDrag?.viewport, geometryOnly: Boolean(floorGeometryPreview), docking: floorDockingInfo, alignment: floorWallAlignment };
}
function renderFloorGeometry() {
  $("#floorGeometryTools").classList.toggle("hidden", !floorGeometryEditing);
  $("#floorPointsMode").setAttribute("aria-pressed", String(!floorGeometryEditing));
  $("#floorGeometryMode").setAttribute("aria-pressed", String(floorGeometryEditing || floorPencilActive));
  $("#floorView").classList.toggle("editing-geometry", floorGeometryEditing);
  const plan = floorGeometryPreview || project.floorPlan;
  if (!plan || plan.geometryMode !== "free") return;
  const room = plan.rooms.find((r) => r.id === floorRoomId), edge = room && FG.edgeAt(room, floorWallIndex), wall = edge?.wall, vertex = room && FG.vertexAt(room, floorVertexIndex);
  if (!wall) floorWallIndex = null; if (!vertex) floorVertexIndex = null;
  if (!wall || !floorOpeningKind || wall[`${floorOpeningKind}U`] == null) floorOpeningKind = null;
  $("#floorGeometrySelection").textContent = room ? `${room.name}${wall ? ` · стіна ${floorWallIndex + 1} · ${floorNumber(Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y))} м` : vertex ? ` · кут ${floorVertexIndex + 1}` : " · кімната"}` : "Оберіть кімнату або додайте нову";
  if (wall) {
    const names = FG.sharedWalls(plan).filter((s) => s.roomId === room.id && s.index === floorWallIndex || s.otherId === room.id && s.otherIndex === floorWallIndex).map((s) => plan.rooms.find((r) => r.id === (s.roomId === room.id ? s.otherId : s.roomId)).name);
    if (names.length) $("#floorGeometrySelection").textContent += ` · спільна з ${[...new Set(names)].join(", ")}`;
  }
  $("#floorRestoreWall").disabled = !wall || !wall.removed;
  $("#floorSplitWall").disabled = !wall || edge.ring.vertices.length >= 48;
  $("#floorVertexProperties").classList.toggle("hidden", !vertex);
  if (vertex) { $("#floorVertexX").value = floorPrecise(vertex.x); $("#floorVertexY").value = floorPrecise(vertex.y); }
}
function setFloorGeometryMode(enabled) {
  stopFloorConnections();
  floorRouteSelection = null;
  stopFloorPencil();
  cancelFloorGeometryDrag();
  floorPanMode = false;
  if (enabled && project.floorPlan.geometryMode !== "free") {
    if (!commitFloorPlan(F.editGeometry(project.floorPlan))) return;
    toast("Стіни тепер редагуються окремо. Траси перебудовані через фактичні проходи.");
  }
  floorGeometryEditing = enabled; floorWallIndex = null; floorVertexIndex = null; floorOpeningKind = null;
  requestFloorSidebar(enabled ? "walls" : "points");
  floorGeometryHit = null; floorPreviousGeometryHit = null;
  if (!enabled && project.floorPlan.points.find((p) => p.id === floorSelectedId)?.roomId !== floorRoomId) floorSelectedId = null;
  renderFloorPlan();
}
function selectFloorGeometry(roomId, wall = null, vertex = null, opening = null) {
  floorRoomId = roomId; floorWallIndex = wall; floorVertexIndex = vertex; floorOpeningKind = opening;
  requestFloorSidebar("walls");
  $("#floorRoomSelect").value = roomId;
  renderFloorRoom(); renderFloorGeometry(); renderFloorUX(); renderFloorCanvas();
}
function applyFloorGeometry(action, message) {
  try {
    const next = action(F.editGeometry(project.floorPlan));
    if (JSON.stringify(next) === JSON.stringify(project.floorPlan)) { renderFloorPlan(); return next; }
    if (commitFloorPlan(next)) { if (!next.rooms.some((r) => r.id === floorRoomId)) floorRoomId = next.rooms[0]?.id || ""; renderFloorPlan(); if (message) toast(message); return next; }
  } catch (error) { toast(error.message, "error"); }
}
function deleteFloorGeometrySelection() {
  if (floorOpeningKind && floorWallIndex !== null) { const kind = floorOpeningKind; if (applyFloorGeometry((p) => FG.setWall(p, floorRoomId, floorWallIndex, { [`${kind}U`]: null }))) { floorOpeningKind = null; renderFloorPlan(); } }
  else if (floorVertexIndex !== null) deleteFloorVertex();
  else if (floorWallIndex !== null) applyFloorGeometry((p) => FG.setWall(p, floorRoomId, floorWallIndex, { removed: true }), "Стіну відкрито. Точки на ній потребують перевірки. «Скасувати» повертає стіну.");
  else if (project.floorPlan.rooms.some((r) => r.id === floorRoomId)) applyFloorGeometry((p) => FG.removeRoom(p, floorRoomId), "Кімнату та її точки видалено. Щиток за потреби перенесено; «Скасувати» повертає зміни.");
}
const floorOpeningCount = (plan) => plan.rooms.flatMap((r) => FG.edgesOf(r)).reduce((sum, e) => sum + (e.wall.doorU != null) + (e.wall.windowU != null), 0);
function deleteFloorVertex() {
  const before = floorOpeningCount(project.floorPlan), next = applyFloorGeometry((p) => FG.removeVertex(p, floorRoomId, floorVertexIndex));
  if (!next) return;
  floorVertexIndex = floorWallIndex = null; floorPreviousGeometryHit = null; renderFloorPlan();
  if (floorOpeningCount(next) < before) toast("Кут і прилеглі ділянки змінено; отвори на прибраних стінах видалено. Перевірте розміщення й кабельні проходи.");
}
function cancelFloorGeometryDrag() {
  floorGeometryDrag = null; floorGeometryPreview = null; floorDockingInfo = null; floorWallAlignment = null;
  floorGeometryHit = floorPreviousGeometryHit = null;
  if (floorGeometryFrame) { cancelAnimationFrame(floorGeometryFrame); floorGeometryFrame = null; }
  if (project.floorPlan) renderFloorCanvas();
}
function initFloorGeometry() {
  $("#floorGeometryMode").addEventListener("click", () => setFloorGeometryMode(true));
  $("#floorPointsMode").addEventListener("click", () => setFloorGeometryMode(false));
  $("#floorRedoButton").addEventListener("click", redoFloorChange);
  $("#floorSplitWall").addEventListener("click", () => {
    const openings = (plan) => plan.rooms.flatMap((r) => FG.edgesOf(r).map((e) => e.wall)).reduce((sum, w) => sum + (w.doorU != null) + (w.windowU != null), 0), before = openings(project.floorPlan);
    applyFloorGeometry((p) => FG.splitWall(p, floorRoomId, floorWallIndex));
    if (openings(project.floorPlan) < before) toast("Отвір на місці нового кута прибрано. Його можна додати на вибраній новій ділянці стіни.");
    floorWallIndex = null; renderFloorPlan();
  });
  $("#floorRestoreWall").addEventListener("click", () => applyFloorGeometry((p) => FG.setWall(p, floorRoomId, floorWallIndex, { removed: false })));
  $("#floorAddRoom").addEventListener("click", () => { if (!floorGeometryEditing) { stopFloorPencil(); cancelFloorGeometryDrag(); floorGeometryEditing = true; floorPanMode = false; } const next = applyFloorGeometry((p) => { const added = FG.addRoom(p); return FG.placeBeside(added, added.rooms.at(-1).id, floorRoomId).plan; }); if (!next) return; floorRoomId = next.rooms.at(-1)?.id || ""; floorWallIndex = null; floorVertexIndex = null; floorOpeningKind = null; floorScale = null; renderFloorPlan(); });
  $("#floorApplyVertex").addEventListener("click", () => applyFloorGeometry((p) => { const vertex = FG.vertexAt(p.rooms.find((r) => r.id === floorRoomId), floorVertexIndex); return FG.moveVertex(p, floorRoomId, floorVertexIndex, readFloorNumber("#floorVertexX", "координату X кута") - vertex.x, readFloorNumber("#floorVertexY", "координату Y кута") - vertex.y); }));
  const canvas = $("#floorCanvas");
  canvas.addEventListener("keydown", (event) => {
    if (!floorGeometryEditing) return;
    const target = event.target.closest("[data-floor-geometry-room], [data-floor-room]");
    if (target && ["Enter", " "].includes(event.key)) { event.preventDefault(); selectFloorGeometry(target.dataset.floorGeometryRoom || target.dataset.floorRoom, target.hasAttribute("data-floor-wall") ? Number(target.dataset.floorWall) : null, target.hasAttribute("data-floor-vertex") ? Number(target.dataset.floorVertex) : null, target.dataset.floorOpening || null); }
    if (event.key === "Escape") { event.preventDefault(); cancelFloorGeometryDrag(); renderFloorPlan(); }
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (!floorGeometryEditing || event.button !== 0 || event.isPrimary === false) return;
    const target = event.target.closest("[data-floor-geometry-room], [data-floor-room]"); if (!target) return;
    const svg = $(".floor-svg", canvas), matrix = svg.getScreenCTM(), roomId = target.dataset.floorGeometryRoom || target.dataset.floorRoom, kind = target.hasAttribute("data-floor-opening") ? "opening" : target.hasAttribute("data-floor-vertex") ? "vertex" : target.hasAttribute("data-floor-wall") ? "wall" : "room", index = kind === "vertex" ? Number(target.dataset.floorVertex) : ["wall", "opening"].includes(kind) ? Number(target.dataset.floorWall) : null;
    const arrangement = F.layout(project.floorPlan);
    floorGeometryDrag = { base: clone(project.floorPlan), roomId, kind, index, opening: target.dataset.floorOpening || null, pointerId: event.pointerId, x: event.clientX, y: event.clientY, unit: matrix.a * PanelFloorSvg.SCALE, viewport: { minX: arrangement.minX, minY: arrangement.minY, width: arrangement.width, height: arrangement.height }, changed: false, moved: false, error: null };
    floorGeometryHit = { roomId, kind, index, x: event.clientX, y: event.clientY, at: performance.now() };
    selectFloorGeometry(roomId, ["wall", "opening"].includes(kind) ? index : null, kind === "vertex" ? index : null, target.dataset.floorOpening || null);
    canvas.setPointerCapture(event.pointerId); event.preventDefault();
  });
  canvas.addEventListener("pointermove", (event) => {
    const drag = floorGeometryDrag; if (!drag) return;
    if (event.pointerId !== drag.pointerId) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3 && !drag.moved) return;
    drag.moved = true;
    let dx = (event.clientX - drag.x) / drag.unit, dy = (event.clientY - drag.y) / drag.unit;
    if (event.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
    const wallDx = dx, wallDy = dy, step = $("#floorGeometrySnap").checked && !event.altKey ? Number($("#floorGeometryGrid").value) : 0;
    if (step) { dx = Math.round(dx / step) * step; dy = Math.round(dy / step) * step; }
    try {
      drag.error = null;
      floorDockingInfo = null; floorWallAlignment = null;
      if (drag.kind === "opening") {
        floorGeometryPreview = FG.moveOpening(drag.base, drag.roomId, drag.index, drag.opening, wallDx, wallDy, { gridStepM: step });
      } else if (drag.kind === "room") {
        const result = FG.dockRoom(drag.base, drag.roomId, dx, dy, { magnet: $("#floorRoomMagnet").checked && !event.altKey }); floorGeometryPreview = result.plan; floorDockingInfo = result.docking;
      } else if (drag.kind === "wall") {
        const result = FG.dragWall(drag.base, drag.roomId, drag.index, wallDx, wallDy, { magnet: $("#floorRoomMagnet").checked && !event.altKey, gridStepM: step, snapDistanceM: Math.min(.22, 10 / drag.unit) });
        floorGeometryPreview = result.plan; floorWallAlignment = result.alignment; dx = result.dx; dy = result.dy;
      } else floorGeometryPreview = FG.moveVertex(drag.base, drag.roomId, drag.index, dx, dy);
      drag.changed = drag.kind === "opening" ? FG.wallAt(floorGeometryPreview.rooms.find((r) => r.id === drag.roomId), drag.index)[`${drag.opening}U`] !== FG.wallAt(drag.base.rooms.find((r) => r.id === drag.roomId), drag.index)[`${drag.opening}U`] : Boolean(dx || dy);
      $("#floorGeometryLive").textContent = drag.kind === "opening" ? "Переміщення отвору вздовж стіни" : floorWallAlignment ? `Вирівняно зі стіною «${floorGeometryPreview.rooms.find((r) => r.id === floorWallAlignment.targetId).name}»` : floorDockingInfo ? `Спільна стіна з «${floorGeometryPreview.rooms.find((r) => r.id === floorDockingInfo.targetId).name}» · ${floorNumber(floorDockingInfo.lengthM)} м` : `Зміщення ${floorNumber(dx)} / ${floorNumber(dy)} м`;
      if (!floorGeometryFrame) floorGeometryFrame = requestAnimationFrame(() => { floorGeometryFrame = null; renderFloorCanvas(); renderFloorGeometry(); });
    } catch (error) { drag.error = error.message; $("#floorGeometryLive").textContent = `${error.message} Відпустіть для скасування або поверніться до допустимого положення.`; }
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!floorGeometryDrag) return;
    if (event.pointerId !== floorGeometryDrag.pointerId) return;
    const next = floorGeometryPreview, { changed, moved, error } = floorGeometryDrag, docking = floorDockingInfo, alignment = floorWallAlignment;
    if (moved) floorGeometryHit = null;
    floorGeometryDrag = null; floorGeometryPreview = null; floorDockingInfo = null; floorWallAlignment = null;
    if (floorGeometryFrame) { cancelAnimationFrame(floorGeometryFrame); floorGeometryFrame = null; }
    $("#floorGeometryLive").textContent = "";
    if (error) { floorPreviousGeometryHit = null; renderFloorPlan(); toast(`${error} Переміщення скасовано.`, "error"); return; }
    if (changed && next) { floorPreviousGeometryHit = null; if (commitFloorPlan(next)) { if (alignment) toast(`Стіну вирівняно зі стіною «${next.rooms.find((r) => r.id === alignment.targetId).name}».`); else if (docking) toast(`Спільна стіна з «${next.rooms.find((r) => r.id === docking.targetId).name}» · ${floorNumber(docking.lengthM)} м. Кімнати залишилися окремими.`); } }
    else {
      renderFloorPlan(); const hit = floorGeometryHit, previous = floorPreviousGeometryHit;
      if (hit && previous && hit.roomId === previous.roomId && hit.kind === previous.kind && hit.index === previous.index && hit.at - previous.at < 500 && Math.hypot(hit.x - previous.x, hit.y - previous.y) < 12) { floorPreviousGeometryHit = null; handleFloorDoubleClick(hit); }
      else floorPreviousGeometryHit = hit;
    }
  });
  canvas.addEventListener("pointercancel", (event) => { if (floorGeometryDrag && event.pointerId === floorGeometryDrag.pointerId) { cancelFloorGeometryDrag(); renderFloorPlan(); } });
}

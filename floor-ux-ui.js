/* Context actions and navigation shared by room and electrical-point editing. */
let floorToolsOpen = false;
let floorPanMode = false;
let floorPanning = null;
let floorSidebarTab = "points";
let floorSidebarPending = false;

function floorSidebarGestureActive() {
  return typeof floorDrag !== "undefined" && floorDrag || typeof floorGeometryDrag !== "undefined" && floorGeometryDrag;
}
function requestFloorSidebar(tab) {
  floorSidebarTab = tab; floorSidebarPending = true;
  $("#floorToolsPanel").scrollTop = 0;
  // Opening the sidebar changes the canvas width. Wait until the pointer
  // gesture ends so the wall/point cannot jump underneath the cursor.
  if (!floorSidebarGestureActive()) { floorToolsOpen = true; floorSidebarPending = false; }
  $("#floorTemplateEditor").open = tab === "settings";
  if (tab === "settings") { $("#floorPointEditor").open = false; $("#floorRoomEditor").open = false; }
  if (tab === "points") $("#floorPointEditor").open = true;
  if (tab === "walls") $("#floorRoomEditor").open = floorWallIndex === null && floorVertexIndex === null;
  if (tab === "connections" || tab === "settings") $("#floorViewSettings").open = true;
}

function renderFloorUX() {
  if (floorSidebarPending && !floorSidebarGestureActive()) { floorToolsOpen = true; floorSidebarPending = false; }
  $(".floor-workspace").classList.toggle("tools-collapsed", !floorToolsOpen);
  $("#floorToolsPanel").setAttribute("data-context", floorSidebarTab);
  $("#floorToolsToggle").setAttribute("aria-expanded", String(floorToolsOpen));
  $("#floorPanMode").setAttribute("aria-pressed", String(floorPanMode));
  $("#floorCanvas").classList.toggle("pan-mode", floorPanMode);
  const plan = project.floorPlan, room = plan && F.layout(plan).rooms.find((r) => r.id === floorRoomId), point = plan?.points.find((p) => p.id === floorSelectedId);
  const route = !floorGeometryEditing && !floorPencilActive && floorRouteSelection;
  const connecting = floorConnectMode && !floorGeometryEditing && !floorPencilActive, source = plan?.points.find((p) => p.id === floorConnectSourceId);
  $("#floorView").classList.toggle("connecting-points", connecting);
  $("#floorSidebarTitle").textContent = floorSidebarTab === "settings" ? "Параметри плану" : floorPencilActive ? "Олівець" : connecting ? "З’єднання точок" : floorGeometryEditing ? "Стіни й кімнати" : point ? "Властивості точки" : "Електричні точки";
  $("#floorConnectMode").classList.toggle("hidden", floorGeometryEditing || floorPencilActive);
  $("#floorConnectMode").disabled = !plan?.points.some((p) => p.type !== "panel");
  $("#floorConnectMode").setAttribute("aria-pressed", String(connecting));
  $("#floorConnectMode").textContent = connecting ? "Готово" : "З’єднати";
  $("#floorConnectMode").title = connecting ? "Завершити з’єднання точок. Уже створені кабелі залишаться; Ctrl+Z поверне останню зміну." : "З’єднати точки мишкою: шлейфом або окремими лініями від щита.";
  $("#floorConnectionTools").classList.toggle("hidden", !connecting);
  $("#floorConnectionPattern").value = floorConnectPattern;
  $("#floorCanvas").classList.toggle("floor-connecting", connecting);
  $("#floorShowRoutes").disabled = connecting;
  const geometry = floorGeometryEditing && plan?.geometryMode === "free", wall = geometry && room && floorWallIndex !== null ? FG.wallAt(room, floorWallIndex) : null, opening = Boolean(wall && floorOpeningKind), roomSelected = geometry && room && floorWallIndex === null && floorVertexIndex === null;
  let label = geometry ? room?.name || "Додайте або виберіть кімнату" : point ? `${point.label} · ${point.name}` : room?.name || "Виберіть кімнату або електричну точку";
  let detail = geometry ? room ? `${floorNumber(room.areaM2 ?? room.widthM * room.depthM)} м²` : "Кімнати можна стикувати перетягуванням" : room ? `Нова точка додасться до «${room.name}». Коло — з фільтра або властивостей.` : "Натисніть точку для властивостей";
  if (geometry && wall) { label = $("#floorGeometrySelection").textContent; detail = "Довжину можна ввести числом; подвійний клік додає кут"; }
  if (opening) { label = `${floorOpeningKind === "door" ? "Двері" : "Вікно"} · ${room.name}`; detail = "Тягніть маркер уздовж стіни; стрілки — зсув, Delete — прибрати отвір"; }
  else if (geometry && floorVertexIndex !== null) { label += ` · кут ${floorVertexIndex + 1}`; detail = "Тягніть кут або рухайте стрілками"; }
  else if (roomSelected) { const count = FG.sharedWalls(plan).filter((s) => s.roomId === room.id || s.otherId === room.id).length; if (count) detail += ` · спільних ділянок стін: ${count}`; }
  else if (!geometry && point) { const branch = project.devices.find((d) => d.id === point.circuitId); detail = `${plan.rooms.find((r) => r.id === point.roomId).name} · ${branch?.label || (point.type === "panel" ? "Ввід" : "Коло не призначено")}`; }
  if (route) { label = `Кабель ${plan.points.find((p) => p.id === route.fromId)?.label} → ${plan.points.find((p) => p.id === route.toId)?.label}`; detail = "Натисніть «Вставити дозу»: кабель поділиться на живлення дози й відгалуження до точки. Esc — скасувати вибір."; }
  if (connecting) {
    label = floorConnectPattern === "radial" ? "Окремі лінії від щита" : source ? `Шлейф від ${source.label}` : "Шлейф: виберіть початок";
    detail = floorConnectPattern === "radial" ? "Клацайте потрібні точки: кожна матиме окремий кабель від щита. Для нових точок виберіть коло у фільтрі." : source ? `Натисніть наступну точку: ${source.label} → точка. Щоб почати іншу гілку, натисніть щит або порожнє місце.` : "Натисніть щит, дозу або першу точку, потім послідовно наступні. Esc або «Готово» завершує з’єднання.";
  }
  $("#floorSelectionLabel").textContent = label; $("#floorSelectionDetail").textContent = detail;
  $("#floorQuickRoomFields").classList.toggle("hidden", !roomSelected);
  $("#floorQuickPointTools").classList.toggle("hidden", geometry || floorPencilActive || connecting);
  $(".floor-context-actions").classList.toggle("hidden", connecting);
  $("#floorWallModeTools").classList.toggle("hidden", !geometry && !floorPencilActive);
  $("#floorQuickAddPoint").disabled = !room;
  $("#floorQuickAddPoint").textContent = route ? "Вставити дозу" : "+ Точка";
  $("#floorQuickWallField").classList.toggle("hidden", !geometry || !wall || opening);
  $("#floorQuickHeightField").classList.toggle("hidden", geometry || !point || connecting);
  $("#floorQuickApply").classList.toggle("hidden", connecting || !roomSelected && !(wall && !opening) && !(point && !geometry));
  if (roomSelected) { $("#floorQuickWidth").value = floorPrecise(room.widthM); $("#floorQuickDepth").value = floorPrecise(room.depthM); }
  if (wall) { const { a, b } = FG.edgeAt(room, floorWallIndex); $("#floorQuickLength").value = floorPrecise(Math.hypot(b.x - a.x, b.y - a.y)); }
  if (point) { $("#floorQuickHeight").value = F.pointHeight(plan, point); $("#floorQuickHeight").disabled = point.heightM === null; }
  $("#floorQuickDuplicate").classList.toggle("hidden", !roomSelected);
  $("#floorSplitWall").classList.toggle("hidden", !geometry || !wall || opening);
  $("#floorRestoreWall").classList.toggle("hidden", !geometry || !wall?.removed);
  $("#floorQuickDoor").disabled = !wall || wall.removed || floorPencilActive;
  $("#floorQuickWindow").disabled = !wall || wall.removed || floorPencilActive;
  $("#floorQuickDoor").textContent = wall?.doorU != null && !wall.removed ? "Двері" : "+ Двері";
  $("#floorQuickWindow").textContent = wall?.windowU != null && !wall.removed ? "Вікно" : "+ Вікно";
  $("#floorQuickDoor").setAttribute("aria-pressed", String(floorOpeningKind === "door"));
  $("#floorQuickWindow").setAttribute("aria-pressed", String(floorOpeningKind === "window"));
  $("#floorQuickProperties").classList.toggle("hidden", Boolean(wall));
  $("#floorQuickProperties").disabled = geometry ? !room : !point;
  $("#floorQuickDelete").disabled = geometry ? !room || !opening && (floorVertexIndex !== null ? FG.edgeAt(room, floorVertexIndex).ring.vertices.length <= 3 : wall?.removed) : !point || point.type === "panel";
  $("#floorQuickDelete").textContent = geometry ? opening ? `Прибрати ${floorOpeningKind === "door" ? "двері" : "вікно"}` : floorVertexIndex !== null ? "Видалити кут" : wall ? "Відкрити стіну" : "Видалити кімнату" : "Видалити точку";
}
function zoomFloorPlan(factor, anchor = null) {
  const canvas = $("#floorCanvas"), svg = $(".floor-svg", canvas); if (!svg || floorGeometryDrag || floorDrag) return;
  const old = svg.getBoundingClientRect(), box = canvas.getBoundingClientRect(), x = anchor?.x ?? box.left + canvas.clientWidth / 2, y = anchor?.y ?? box.top + canvas.clientHeight / 2, u = (x - old.left) / old.width, v = (y - old.top) / old.height;
  floorScale = Math.max(.01, Math.min(3, old.width / svg.viewBox.baseVal.width * factor)); renderFloorCanvas();
  const next = $(".floor-svg", canvas).getBoundingClientRect(); canvas.scrollLeft += next.left + u * next.width - x; canvas.scrollTop += next.top + v * next.height - y;
}
function duplicateFloorRoom() {
  if (!floorGeometryEditing || !project.floorPlan.rooms.some((r) => r.id === floorRoomId)) return;
  let copyId = null;
  const result = applyFloorGeometry((p) => { const copied = FG.duplicateRoom(p, floorRoomId); copyId = copied.roomId; return FG.placeBeside(copied.plan, copyId, floorRoomId).plan; });
  if (result) { floorRoomId = copyId; floorWallIndex = null; floorVertexIndex = null; floorScale = null; renderFloorPlan(); toast("Кімнату й точки скопійовано. Перевірте призначені кола та навантаження."); }
}
function openFloorProperties(rename = false) {
  requestFloorSidebar(floorGeometryEditing ? "walls" : "points"); renderFloorUX();
  if (floorGeometryEditing) { if (floorWallIndex === null && floorVertexIndex === null) $("#floorRoomEditor").open = true; if (rename) { $("#floorRoomName").focus(); $("#floorRoomName").select(); } }
  else $("#floorPointEditor").open = true;
  if (floorScale === null) renderFloorCanvas();
}
function applyFloorQuickFields() {
  try {
  if (floorGeometryEditing) {
    if (floorWallIndex !== null) applyFloorGeometry((p) => FG.resizeWall(p, floorRoomId, floorWallIndex, readFloorNumber("#floorQuickLength", "довжину стіни")));
    else if (floorVertexIndex === null) applyFloorGeometry((p) => FG.resizeRoom(p, floorRoomId, readFloorNumber("#floorQuickWidth", "ширину кімнати"), readFloorNumber("#floorQuickDepth", "глибину кімнати")));
  } else {
    const plan = clone(project.floorPlan), point = plan.points.find((p) => p.id === floorSelectedId);
    if (!point || point.heightM === null) return;
    point.heightM = readFloorNumber("#floorQuickHeight", "висоту точки"); delete point.placementReview; commitFloorPlan(plan);
  }
  } catch (error) { toast(error.message, "error"); }
}
function focusFloorSelection() {
  const selector = floorGeometryEditing ? floorOpeningKind && floorWallIndex !== null ? `[data-floor-geometry-room="${CSS.escape(floorRoomId)}"][data-floor-wall="${floorWallIndex}"][data-floor-opening="${floorOpeningKind}"]` : floorVertexIndex !== null ? `[data-floor-geometry-room="${CSS.escape(floorRoomId)}"][data-floor-vertex="${floorVertexIndex}"]` : floorWallIndex !== null ? `circle[data-floor-geometry-room="${CSS.escape(floorRoomId)}"][data-floor-wall="${floorWallIndex}"]` : `[data-floor-room="${CSS.escape(floorRoomId)}"]` : floorSelectedId ? `[data-floor-point="${CSS.escape(floorSelectedId)}"]` : null;
  (selector && $(selector, $("#floorCanvas")) || $("#floorCanvas")).focus({ preventScroll: true });
}
function handleFloorDoubleClick(hit) {
  if (!floorGeometryEditing || floorPanMode) return;
  if (hit.kind === "room") { selectFloorGeometry(hit.roomId); openFloorProperties(true); return; }
  if (hit.kind !== "wall") return;
  const canvas = $("#floorCanvas"), svg = $(".floor-svg", canvas), p = svg.createSVGPoint(); p.x = hit.x; p.y = hit.y;
  const local = p.matrixTransform(svg.getScreenCTM().inverse()), arrangement = F.layout(project.floorPlan), shape = arrangement.rooms.find((r) => r.id === hit.roomId), { a, b } = FG.edgeAt(shape, hit.index), x = (local.x - PanelFloorSvg.LEFT) / PanelFloorSvg.SCALE + arrangement.minX, y = (local.y - PanelFloorSvg.TOP) / PanelFloorSvg.SCALE + arrangement.minY, u = ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  applyFloorGeometry((p) => FG.splitWall(p, hit.roomId, hit.index, u)); floorWallIndex = null; floorVertexIndex = null; renderFloorPlan();
}
function initFloorUX() {
  $("#floorToolsToggle").addEventListener("click", () => { requestFloorSidebar("settings"); renderFloorUX(); if (floorScale === null) renderFloorCanvas(); });
  $("#floorSidebarClose").addEventListener("click", () => { floorToolsOpen = false; floorSidebarPending = false; renderFloorUX(); if (floorScale === null) renderFloorCanvas(); });
  $("#floorPanMode").addEventListener("click", () => { const connected = stopFloorConnections(); floorPanMode = !floorPanMode; renderFloorUX(); if (connected) renderFloorCanvas(); });
  $("#floorQuickAddPoint").addEventListener("click", addFloorPoint);
  $("#floorQuickDuplicate").addEventListener("click", duplicateFloorRoom);
  $("#floorQuickProperties").addEventListener("click", () => openFloorProperties());
  [["#floorQuickDoor", "door"], ["#floorQuickWindow", "window"]].forEach(([id, kind]) => $(id).addEventListener("click", () => {
    const wall = FG.wallAt(project.floorPlan.rooms.find((r) => r.id === floorRoomId), floorWallIndex);
    if (!wall || wall.removed) return;
    if (wall[`${kind}U`] != null) { selectFloorGeometry(floorRoomId, floorWallIndex, null, kind); return; }
    const next = applyFloorGeometry((p) => FG.toggleOpening(p, floorRoomId, floorWallIndex, kind));
    if (next) { floorOpeningKind = kind; renderFloorPlan(); }
  }));
  $("#floorQuickDelete").addEventListener("click", () => { if (floorGeometryEditing) deleteFloorGeometrySelection(); else deleteFloorPoint(); });
  $("#floorQuickApply").addEventListener("click", applyFloorQuickFields);
  ["#floorQuickWidth", "#floorQuickDepth", "#floorQuickLength", "#floorQuickHeight"].forEach((id) => $(id).addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); applyFloorQuickFields(); } }));
  $("#floorRoomName").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); saveFloorRoom(); } });
  const canvas = $("#floorCanvas");
  canvas.addEventListener("pointerdown", (event) => {
    if (floorGeometryEditing || floorPanMode || floorConnectMode || event.button !== 0 || event.target.closest("[data-floor-point], [data-floor-route]")) return;
    const room = event.target.closest("[data-floor-room]"); if (!room) return;
    floorRoomId = room.dataset.floorRoom; floorSelectedId = null; floorRouteSelection = null; requestFloorSidebar("points"); renderFloorPlan();
  });
  canvas.addEventListener("wheel", (event) => { if (!event.ctrlKey && !event.metaKey) return; event.preventDefault(); zoomFloorPlan(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .003), { x: event.clientX, y: event.clientY }); }, { passive: false });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 1 && !(floorPanMode && event.button === 0)) return;
    event.preventDefault(); event.stopImmediatePropagation(); floorPanning = { x: event.clientX, y: event.clientY, left: canvas.scrollLeft, top: canvas.scrollTop }; canvas.setPointerCapture(event.pointerId); canvas.classList.add("panning");
  }, true);
  canvas.addEventListener("pointermove", (event) => { if (!floorPanning) return; event.preventDefault(); event.stopImmediatePropagation(); canvas.scrollLeft = floorPanning.left - event.clientX + floorPanning.x; canvas.scrollTop = floorPanning.top - event.clientY + floorPanning.y; }, true);
  const endPan = (event) => { if (!floorPanning) return; event.stopImmediatePropagation(); floorPanning = null; canvas.classList.remove("panning"); };
  canvas.addEventListener("pointerup", endPan, true); canvas.addEventListener("pointercancel", endPan, true);
  canvas.addEventListener("keydown", (event) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) return;
    if (["Enter", " "].includes(event.key) && event.target.closest("[data-floor-room], [data-floor-wall], [data-floor-vertex], [data-floor-point]")) { if (!floorGeometryEditing && event.target.closest("[data-floor-room]")) { event.preventDefault(); floorRoomId = event.target.closest("[data-floor-room]").dataset.floorRoom; floorSelectedId = null; renderFloorPlan(); } focusFloorSelection(); return; }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]; if (!delta || event.ctrlKey || event.metaKey || floorConnectMode) return;
    event.preventDefault(); const step = event.shiftKey ? .5 : .1, [dx, dy] = delta.map((v) => v * step);
    if (floorGeometryEditing && floorOpeningKind && floorWallIndex !== null) { const edge = FG.edgeAt(project.floorPlan.rooms.find((r) => r.id === floorRoomId), floorWallIndex); if (edge && Math.abs(dx * (edge.b.x - edge.a.x) + dy * (edge.b.y - edge.a.y)) < .000001) { focusFloorSelection(); return; } }
    if (floorGeometryEditing) applyFloorGeometry((p) => floorOpeningKind && floorWallIndex !== null ? FG.moveOpening(p, floorRoomId, floorWallIndex, floorOpeningKind, dx, dy) : floorVertexIndex !== null ? FG.moveVertex(p, floorRoomId, floorVertexIndex, dx, dy) : floorWallIndex !== null ? FG.moveWall(p, floorRoomId, floorWallIndex, dx, dy) : FG.dockRoom(p, floorRoomId, dx, dy, { magnet: $("#floorRoomMagnet").checked && !event.altKey, alignEnds: false }).plan);
    else { const plan = clone(project.floorPlan), point = plan.points.find((p) => p.id === floorSelectedId); if (!point) return; const room = F.layout(plan).rooms.find((r) => r.id === point.roomId), position = F.world(plan, point); const before = JSON.stringify(point); try { F.placePoint(plan, point, { x: position.x + dx, y: position.y + dy }); } catch (error) { toast(error.message, "error"); return; } if (JSON.stringify(point) !== before) { delete point.placementReview; commitFloorPlan(plan); } }
    focusFloorSelection();
  });
  document.addEventListener("keydown", (event) => {
    if (!$("#floorView").classList.contains("active") || ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName) || $(".modal-backdrop:not(.hidden)")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && floorGeometryEditing) { event.preventDefault(); duplicateFloorRoom(); }
    if (event.key === "Escape" && floorPanMode) { floorPanMode = false; renderFloorUX(); }
  });
}

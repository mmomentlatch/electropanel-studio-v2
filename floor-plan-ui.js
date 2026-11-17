/* Editable floor sketch, circuit binding and cable quantities. */
const F = PanelFloorPlan;
let floorSelectedId = null;
let floorRoomId = "living";
let floorCircuitId = "";
let floorDrag = null;
let floorPointPreview = null;
let floorRouteSelection = null;
let floorConnectMode = false;
let floorConnectSourceId = null;
let floorConnectPattern = "chain";
let floorFrame = null;
let floorScale = null;
let floorViewportFrame = null;
let floorJunctionDraft = null;
let floorPointPropertiesFor = null;
const floorNumber = (n) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(n);
const floorPrecise = (value) => Math.round(value * 1e6) / 1e6;
function readFloorNumber(selector, label) {
  const value = String($(selector).value ?? "").trim();
  if (!value || !Number.isFinite(Number(value))) throw new Error(`Введіть ${label}.`);
  return Number(value);
}

function ensureFloorPlan() {
  if (project.floorPlan) return;
  snapshot(); project.floorPlan = F.create(project); floorSelectedId = project.floorPlan.points.find((p) => p.type === "panel").id;
  persistProject();
}
function commitFloorPlan(next, keepConfirmation = false) {
  try {
    if (!keepConfirmation) next.geometryConfirmed = false;
    let candidate = E.normalizeProject({ ...project, floorPlan: F.normalize(next) });
    if (candidate.design?.supply) candidate.design.supply.dataConfirmed = false;
    if (candidate.floorPlan.syncWithCircuits) candidate = F.syncLengths(candidate);
    snapshot(); project = candidate; floorRouteSelection = null; completeFloorFormCommit(); persistProject(); renderAll();
    return true;
  } catch (error) { toast(error.message, "error"); return false; }
}
function sizeFloorCanvas() {
  const view = $("#floorView"), canvas = $("#floorCanvas");
  if (!view.classList.contains("active") || !view.clientHeight) return;
  // Measure the unscrolled editor position so reports below it do not shrink
  // or enlarge the drawing area when the document is scrolled.
  const top = canvas.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop;
  const help = $(".floor-navigation-help").offsetHeight;
  const height = `${Math.max(180, Math.floor(view.clientHeight - top - help - 8))}px`;
  if (canvas.style.height !== height) canvas.style.height = height;
  view.style.setProperty("--floor-toolbar-height", `${$(".floor-toolbar").offsetHeight}px`);
}
function applyFloorScale() {
  const canvas = $("#floorCanvas"), svg = $(".floor-svg", canvas);
  if (!svg || !canvas.clientWidth || !canvas.clientHeight) return;
  const box = svg.viewBox.baseVal, style = getComputedStyle(canvas);
  const width = canvas.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = canvas.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  // Auto-fit must also fit very large plans. Manual zoom keeps its own scale.
  const size = floorScale === null ? PanelViewport.fit(box.width, box.height, width - 2, height - 2, 1.3) : PanelViewport.atScale(box.width, box.height, floorScale);
  if (!size) return;
  svg.style.width = `${size.width}px`; svg.style.height = `${size.height}px`;
  svg.style.aspectRatio = `${box.width} / ${box.height}`;
  $("#floorZoomValue").textContent = `${Math.round(size.scale * 100)}%`;
  if (floorScale === null) { canvas.scrollTop = 0; canvas.scrollLeft = 0; }
}
function refreshFloorViewport() {
  if (!$("#floorView").classList.contains("active")) return;
  sizeFloorCanvas(); applyFloorScale();
}
function renderFloorCanvas() {
  if (!project.floorPlan) return;
  sizeFloorCanvas();
  const preview = floorGeometryPreview || floorPointPreview;
  const displayed = preview ? { ...project, floorPlan: preview } : project;
  $("#floorCanvas").innerHTML = PanelFloorSvg.render(displayed, { selectedId: floorConnectMode ? floorConnectSourceId : floorSelectedId, circuitId: floorCircuitId, interactiveRoutes: !preview && !floorConnectMode, selectedRouteToId: floorRouteSelection?.toId || "", showRoutes: $("#floorShowRoutes").checked && !floorGeometryEditing && !floorPencilActive, showHeights: $("#floorShowHeights").checked, showGrid: $("#floorShowGrid").checked, gridStepM: Number($("#floorGeometryGrid").value), ...floorGeometryOptions(), ...floorPencilOptions() });
  applyFloorScale();
  paintFloorPencil();
}
function renderFloorPlan() {
  $("#floorTemplateInput").innerHTML = Object.entries(F.TEMPLATES).map(([id, template]) => `<option value="${id}">${escapeHtml(template.title)}</option>`).join("");
  $("#floorTemplateInput").value = project.floorPlan?.templateId || project.design?.templateId || "apartment-2";
  $("#floorUndoButton").disabled = !undoStack.length;
  $("#floorRedoButton").disabled = !redoStack.length;
  if (!project.floorPlan) return;
  const report = F.calculate(project), plan = report.plan, quantities = Cables.calculate(project, report);
  if (floorRouteSelection && !report.circuits.some((c) => c.deviceId === floorRouteSelection.deviceId && c.legs.some((leg) => leg.fromId === floorRouteSelection.fromId && leg.toId === floorRouteSelection.toId))) floorRouteSelection = null;
  const cableSettingsOpen = $("#floorCableReport").querySelector("[data-cable-settings]")?.open;
  if (!plan.rooms.some((room) => room.id === floorRoomId)) floorRoomId = plan.rooms[0]?.id || "";
  if (floorGeometryEditing && plan.geometryMode !== "free") floorGeometryEditing = false;
  if (floorCircuitId && !report.circuits.some((c) => c.deviceId === floorCircuitId)) floorCircuitId = "";
  $("#floorCeilingInput").value = plan.ceilingHeightM;
  $("#floorRoutingInput").value = plan.routing;
  $("#floorWallInput").value = plan.wallThicknessM;
  const fixedThickness = plan.geometryMode === "free" && plan.rooms.length > 0;
  $("#floorWallInput").disabled = fixedThickness;
  $("#floorWallHelp").classList.toggle("hidden", !fixedThickness);
  $("#floorReserveInput").value = plan.reservePercent;
  $("#floorAllowanceInput").value = plan.endAllowanceM;
  $("#floorConfirmedInput").checked = plan.geometryConfirmed;
  $("#floorAutoLengthsInput").checked = plan.syncWithCircuits;
  $("#floorAutoLengthsInput").disabled = !project.design;
  $("#floorRoomSelect").innerHTML = plan.rooms.map((room) => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.name)}</option>`).join("");
  $("#floorRoomSelect").value = floorRoomId;
  $("#floorCircuitFilter").innerHTML = '<option value="">Усі кола</option>' + report.circuits.map((circuit) => `<option value="${escapeHtml(circuit.deviceId)}">${escapeHtml(circuit.label)} · ${escapeHtml(circuit.name)}</option>`).join("");
  $("#floorCircuitFilter").value = floorCircuitId;
  $("#floorSummary").innerHTML = `<article><span>Площа всередині</span><strong>${floorNumber(report.arrangement.areaM2)} <small>м²</small></strong></article><article><span>Електричні точки</span><strong>${plan.points.filter((p) => p.type !== "panel").length} <small>точок</small></strong></article><article><span>Кабель із запасом ${plan.reservePercent}%</span><strong>≈ ${report.totalPurchaseM} <small>м</small></strong></article><article><span>Вихідні дані</span><strong class="floor-data-state">${plan.geometryConfirmed ? "Підтверджені обміри" : "Типовий ескіз"}</strong></article>`;
  $("#floorWarnings").innerHTML = report.warnings.map((text) => `<p>${escapeHtml(text)}</p>`).join("");
  $("#floorCableReport").innerHTML = `<div class="floor-report-heading"><h3>Кабельна відомість</h3><span>Живлення від щита або вибраної дози. Натисніть трасу, щоб вставити дозу; спільні ділянки враховані один раз.</span></div><div class="floor-table-scroll"><table class="floor-table"><thead><tr><th>Коло</th><th>Переріз</th><th>Точок</th><th>Горизонталь</th><th>Вертикаль</th><th>Припуски</th><th>Запас</th><th>Закупівля</th><th>Найдовший шлях¹</th></tr></thead><tbody>${report.circuits.map((c) => `<tr class="${c.deviceId === floorCircuitId ? "active" : ""}"><td><button type="button" data-floor-circuit="${escapeHtml(c.deviceId)}" style="--circuit-color:${c.color}"><i></i><strong>${escapeHtml(c.label)}</strong> ${escapeHtml(c.name)}</button></td><td>${c.section ? `${floorNumber(c.section)} мм²` : "уточнити"}</td><td>${c.pointCount}</td><td>${floorNumber(c.horizontalM)} м</td><td>${floorNumber(c.verticalM)} м</td><td>${floorNumber(c.allowanceM)} м</td><td>${floorNumber(c.reserveM)} м</td><td><strong>${c.purchaseM} м</strong></td><td>≈ ${floorNumber(c.longestPathM)} м</td></tr>`).join("") || '<tr><td colspan="9">Прив’яжіть точки плану до автоматів або дифавтоматів щита.</td></tr>'}</tbody></table></div><p class="floor-footnote">¹ Для розрахунків передається найдовший шлях живлення з припусками, без закупівельного запасу. Для освітлення враховано ділянку до вимикача за однакового перерізу. Номінали та придатність кабелю не визначаються лише цим метражем.</p><div class="floor-sync-row"><button type="button" class="button primary" id="floorSyncButton" ${project.design && report.circuits.length ? "" : "disabled"}>Передати довжини до розрахунків</button><span>${plan.syncWithCircuits ? "Зв’язок увімкнено: подальші зміни плану оновлюють довжини кіл." : "Метраж розраховується автоматично. Передавання до електричних розрахунків вмикається цією кнопкою."}</span></div>`;
  $("#floorPointSchedule").innerHTML = `<h3>Розміщення та висоти точок</h3><div class="floor-table-scroll"><table class="floor-table"><thead><tr><th>Позначення</th><th>Тип / назва</th><th>Приміщення</th><th>${plan.geometryMode === "free" ? "X / Y від габаритної межі" : "Від лівої / верхньої стіни"}</th><th>Висота</th><th>Коло</th><th>Монтаж</th><th>Траса від</th></tr></thead><tbody>${plan.points.map((point) => { const room = report.arrangement.rooms.find((item) => item.id === point.roomId), circuit = project.devices.find((d) => d.id === point.circuitId); return `<tr><td><button type="button" data-floor-select="${escapeHtml(point.id)}">${escapeHtml(point.label)}</button></td><td>${escapeHtml(point.name)}</td><td>${escapeHtml(room.name)}</td><td>${floorNumber(point.u * room.widthM)} / ${floorNumber(point.v * room.depthM)} м</td><td>${floorNumber(F.pointHeight(plan, point))} м</td><td>${escapeHtml(circuit?.label || (point.type === "panel" ? "Ввід" : "не призначено"))}</td><td>${point.type === "junction" ? F.junctionMounting(plan, point) === "ceiling" ? "На стелі" : "На стіні" : "—"}</td><td>${escapeHtml(F.sourceFor(plan, point)?.label || "—")}</td></tr>`; }).join("")}</tbody></table></div>`;
  const completeCircuits = report.circuits.filter((c) => !c.incomplete), sum = (key) => floorNumber(completeCircuits.reduce((total, c) => total + c[key], 0));
  $("#floorCableReport").innerHTML = $("#floorCableReport").innerHTML.replace("</tbody>", `</tbody><tfoot><tr><th colspan="2">${quantities.cableTotals.missing ? "Разом за повними колами" : "Разом"}</th><td>${sum("pointCount")}</td><td>${sum("horizontalM")} м</td><td>${sum("verticalM")} м</td><td>${sum("allowanceM")} м</td><td>${sum("reserveM")} м</td><td><strong>${sum("purchaseM")} м</strong></td><td>—</td></tr></tfoot>`);
  if (report.circuits.some((c) => c.incomplete)) {
    $("#floorSummary article:nth-child(3) strong").textContent = quantities.cableTotals.missing === quantities.cableTotals.circuits ? "Немає повного метражу" : `≥ ${quantities.cableTotals.purchaseM} м · є непобудовані траси`;
    report.circuits.filter((c) => c.incomplete).forEach((c) => { const row = $("#floorCableReport tbody").querySelector(`[data-floor-circuit="${CSS.escape(c.deviceId)}"]`).closest("tr"); row.cells[7].textContent = "Неповний метраж"; row.cells[8].textContent = "—"; });
  }
  $("#floorCableReport").innerHTML += cableSummaryMarkup(quantities, { includeWires: false, settingsOpen: cableSettingsOpen });
  restoreFloorForm("settings"); renderFloorRoom(); renderFloorPoint(); renderFloorGeometry(); renderFloorUX(); renderFloorPencil(); renderFloorCanvas();
}
function renderFloorRoom() {
  if (!project.floorPlan) return;
  const room = F.layout(project.floorPlan).rooms.find((item) => item.id === floorRoomId);
  $$("#floorRoomEditor input, #floorRoomEditor select, #floorApplyRoom").forEach((el) => { el.disabled = !room; });
  if (!room) { restoreFloorForm("room", floorRoomId); return; }
  $("#floorRoomName").value = room.name; $("#floorRoomWidth").value = floorPrecise(room.widthM); $("#floorRoomDepth").value = floorPrecise(room.depthM);
  $("#floorRoomRow").value = room.row; $("#floorRoomDoor").value = Math.round(room.doorU * 100);
  $("#floorRoomWindow").value = room.windowWall; $("#floorOutsideLevel").value = room.routeLevelM;
  const free = project.floorPlan.geometryMode === "free";
  ["#floorRoomWidth", "#floorRoomDepth"].forEach((id) => { $(id).min = free ? .4 : .8; $(id).max = free ? 50 : 30; });
  $("#floorRoomWidth").disabled = room.row === "hall" && !free; $("#floorRoomRow").disabled = room.row === "hall" || free;
  $("#floorRoomRow option[value='hall']").disabled = room.row !== "hall";
  $("#floorRoomDoor").disabled = room.row === "hall" || free; $("#floorRoomWindow").disabled = room.row === "hall" || free;
  $("#floorRoomGeometryHelp").textContent = free ? "Ширина й глибина — габаритний прямокутник форми. Двері та вікна редагуються на вибраній стіні. Площа рахується за контуром." : "Розміри — чисті всередині кімнати. Коридор і сусідні приміщення перераховуються; точки зберігають відносні місця.";
  $("#floorOutsideField").classList.toggle("hidden", room.kind !== "outdoor");
  restoreFloorForm("room", floorRoomId);
}
function renderFloorPoint() {
  const plan = floorPointPreview || project.floorPlan, point = plan?.points.find((p) => p.id === floorSelectedId);
  $("#floorPointFields").classList.toggle("hidden", !point);
  $("#floorPointEmpty").classList.toggle("hidden", Boolean(point));
  $("#floorJunctionConnections").classList.toggle("hidden", point?.type !== "junction");
  $("#floorPointFields").classList.toggle("is-junction", point?.type === "junction");
  if (!point) { floorJunctionDraft = null; floorPointPropertiesFor = null; restoreFloorForm("point", ""); return; }
  if (floorPointPropertiesFor !== point.id) $("#floorPointProperties").open = false;
  floorPointPropertiesFor = point.id;
  $("#floorApplyPoint").textContent = point.type === "junction" ? "Застосувати дозу та підключення" : "Застосувати точку";
  const room = F.layout(plan).rooms.find((item) => item.id === point.roomId);
  $("#floorPointXLabel").textContent = plan.geometryMode === "free" ? "X від габаритної межі, м" : "Від лівої стіни, м";
  $("#floorPointYLabel").textContent = plan.geometryMode === "free" ? "Y від габаритної межі, м" : "Від верхньої стіни, м";
  $("#floorPointTitle").textContent = `${point.label} · ${F.TYPES[point.type]}`;
  $("#floorPointName").value = point.name; $("#floorPointLabel").value = point.label;
  $("#floorPointRoom").innerHTML = plan.rooms.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join(""); $("#floorPointRoom").value = point.roomId;
  $("#floorPointX").value = (point.u * room.widthM).toFixed(2); $("#floorPointY").value = (point.v * room.depthM).toFixed(2);
  $("#floorPointHeight").value = F.pointHeight(plan, point); $("#floorPointAtCeiling").checked = point.heightM === null;
  $("#floorPointHeight").disabled = point.heightM === null;
  $("#floorJunctionMountField").classList.toggle("hidden", point.type !== "junction");
  $("#floorPointCeilingField").classList.toggle("hidden", point.type === "junction");
  if (point.type === "junction") $("#floorJunctionMounting").value = F.junctionMounting(plan, point);
  $("#floorPointCircuit").innerHTML = '<option value="">Не призначено</option>' + F.branches(project).map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.label)} · ${escapeHtml(d.name)}</option>`).join(""); $("#floorPointCircuit").value = point.circuitId;
  $("#floorPointCircuit").disabled = point.type === "panel" || point.type === "switch";
  $("#floorSwitchField").classList.toggle("hidden", point.type !== "switch");
  $("#floorPointControls").innerHTML = '<option value="">Оберіть світильник</option>' + plan.points.filter((p) => p.type === "light").map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label)} · ${escapeHtml(p.name)}</option>`).join(""); $("#floorPointControls").value = point.controlsId || "";
  renderFloorSources(point, point.circuitId);
  prepareFloorJunctionConnections(point);
  restoreFloorForm("point", point.id);
}
function prepareFloorJunctionConnections(point) {
  if (point.type !== "junction") { floorJunctionDraft = null; return; }
  if (!floorJunctionDraft || floorJunctionDraft.id !== point.id || floorJunctionDraft.plan !== project.floorPlan) {
    const sameJunction = floorJunctionDraft?.id === point.id, previousRoom = sameJunction ? $("#floorJunctionRoomFilter").value : "", previousSearch = sameJunction ? $("#floorJunctionSearch").value : "";
    floorJunctionDraft = { id: point.id, plan: project.floorPlan, fingerprint: JSON.stringify(project.floorPlan), changed: false, circuitId: point.circuitId, selected: new Set(project.floorPlan.points.filter((p) => p.type !== "switch" && p.supplyFromId === point.id).map((p) => p.id)) };
    $("#floorJunctionRoomFilter").innerHTML = '<option value="">Усі кімнати</option>' + project.floorPlan.rooms.map((room) => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.name)}</option>`).join("");
    $("#floorJunctionRoomFilter").value = project.floorPlan.rooms.some((room) => room.id === previousRoom) ? previousRoom : ""; $("#floorJunctionSearch").value = previousSearch;
  }
  renderFloorJunctionConnections();
}
function visibleFloorJunctionCandidates(info) {
  const roomId = $("#floorJunctionRoomFilter").value, search = $("#floorJunctionSearch").value.trim().toLocaleLowerCase("uk");
  return info.candidates.filter((point) => (!roomId || point.roomId === roomId) && (!search || `${point.label} ${point.name} ${F.TYPES[point.type]} ${point.roomName}`.toLocaleLowerCase("uk").includes(search)));
}
function updateFloorJunctionCount(info) {
  const selected = info.candidates.filter((point) => floorJunctionDraft.selected.has(point.id)), invalid = selected.filter((point) => !point.eligible).length;
  $("#floorJunctionCount").textContent = `Вибрано: ${selected.length} · доступно: ${info.candidates.filter((point) => point.eligible).length}${invalid ? ` · перевірте ${invalid} несумісних` : ""}`;
  $("#floorJunctionCount").classList.toggle("has-conflicts", invalid > 0);
  const visible = visibleFloorJunctionCandidates(info);
  $("#floorJunctionSelectVisible").disabled = !visible.some((point) => point.eligible && !floorJunctionDraft.selected.has(point.id));
  $("#floorJunctionClearVisible").disabled = !visible.some((point) => floorJunctionDraft.selected.has(point.id));
}
function renderFloorJunctionConnections() {
  if (!floorJunctionDraft) return;
  const info = F.junctionConnections(project, floorJunctionDraft.id, floorJunctionDraft.circuitId), visible = visibleFloorJunctionCandidates(info);
  $("#floorJunctionHelp").textContent = info.circuitLabel ? `${info.junction.label} · ${info.circuitLabel}. Один спільний кабель до дози й відгалуження до вибраних точок. Точки інших автоматів позначені в списку.` : "Спочатку виберіть коло щита вище. Можна вибрати точки з різних кімнат одного кола.";
  let roomId = null, unavailableStarted = false;
  const grouped = project.floorPlan.rooms.map((room) => visible.filter((point) => point.roomId === room.id)).flat();
  const ordered = [...grouped.filter((point) => point.eligible || point.connected), ...grouped.filter((point) => !point.eligible && !point.connected)];
  $("#floorJunctionPointList").innerHTML = !info.circuitLabel ? '<p class="floor-help">Оберіть автомат, від якого живитиметься доза.</p>' : visible.length ? ordered.map((point) => {
    let separator = "";
    if (!point.eligible && !point.connected && !unavailableStarted) { separator = '<h5 class="floor-junction-unavailable-heading">Інші кола та залежності</h5>'; roomId = null; unavailableStarted = true; }
    const heading = roomId !== point.roomId ? `<h5>${escapeHtml(point.roomName)}</h5>` : ""; roomId = point.roomId;
    return `${separator}${heading}<label class="floor-junction-choice ${!point.eligible ? "unavailable" : ""}"><input type="checkbox" data-floor-junction-point="${escapeHtml(point.id)}" ${floorJunctionDraft.selected.has(point.id) ? "checked" : ""} ${!point.eligible && !point.connected && !floorJunctionDraft.selected.has(point.id) ? "disabled" : ""}/><span><strong>${escapeHtml(point.label)}</strong> · ${escapeHtml(point.name)}<small>${escapeHtml(point.reason || `${F.TYPES[point.type]}${!point.circuitId ? " · буде призначено цьому колу" : ""}`)}</small></span></label>`;
  }).join("") : '<p class="floor-help">За цим фільтром точок немає.</p>';
  updateFloorJunctionCount(info);
}
function initFloorJunctionConnections() {
  $("#floorJunctionRoomFilter").addEventListener("change", renderFloorJunctionConnections);
  $("#floorJunctionSearch").addEventListener("input", renderFloorJunctionConnections);
  $("#floorJunctionPointList").addEventListener("change", (event) => {
    const id = event.target.dataset.floorJunctionPoint; if (!id || !floorJunctionDraft) return;
    floorJunctionDraft.changed = true;
    if (event.target.checked) floorJunctionDraft.selected.add(id); else floorJunctionDraft.selected.delete(id);
    updateFloorJunctionCount(F.junctionConnections(project, floorJunctionDraft.id, floorJunctionDraft.circuitId));
    recordFloorFormEdit("point");
  });
  [["#floorJunctionSelectVisible", true], ["#floorJunctionClearVisible", false]].forEach(([selector, select]) => $(selector).addEventListener("click", () => {
    if (!floorJunctionDraft) return;
    const info = F.junctionConnections(project, floorJunctionDraft.id, floorJunctionDraft.circuitId);
    floorJunctionDraft.changed = true;
    visibleFloorJunctionCandidates(info).forEach((point) => { if (!select) floorJunctionDraft.selected.delete(point.id); else if (point.eligible) floorJunctionDraft.selected.add(point.id); });
    renderFloorJunctionConnections(); recordFloorFormEdit("point");
  }));
}
function renderFloorSources(point, circuitId) {
  const select = $("#floorPointSource"), plan = project.floorPlan;
  $("#floorSourceField").classList.toggle("hidden", point.type === "panel");
  const defaultName = point.type === "switch" ? "Від світильника (ділянка керування)" : "Безпосередньо від щита";
  select.innerHTML = `<option value="">${defaultName}</option>` + F.supplyOptions(plan, point, circuitId).map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.label)} · ${escapeHtml(p.name)}</option>`).join("");
  if (point.supplyFromId && !F.supplyOptions(plan, point, circuitId).some((p) => p.id === point.supplyFromId)) select.innerHTML += `<option value="${escapeHtml(point.supplyFromId)}">Перевірте джерело: інше коло</option>`;
  select.value = point.supplyFromId || "";
  $("#floorSourceHelp").textContent = "Виберіть щит, дозу або попередню точку цього кола. Мишкою зв’язки задаються кнопкою «З’єднати»: шлейфом або окремими лініями від щита.";
}
function selectFloorPoint(id) {
  floorJunctionDraft = null;
  floorSelectedId = id; floorRouteSelection = null;
  requestFloorSidebar("points");
  const point = project.floorPlan.points.find((p) => p.id === id);
  if (point) { floorRoomId = point.roomId; floorCircuitId = point.circuitId; }
  renderFloorPlan();
  $("#floorPointEditor").open = true;
}
function saveFloorSettings() { return applyFloorForm("settings", saveFloorSettingsValues); }
function saveFloorSettingsValues() {
  const next = clone(project.floorPlan);
  if (next.geometryMode === "free" && next.rooms.length && Number($("#floorWallInput").value) !== next.wallThicknessM) { toast("Товщина стін готового контуру зафіксована. Задайте її до побудови кімнат у типовому плані або на чистому полотні.", "error"); renderFloorPlan(); return; }
  Object.assign(next, { ceilingHeightM: Number($("#floorCeilingInput").value), routing: $("#floorRoutingInput").value, wallThicknessM: Number($("#floorWallInput").value), reservePercent: Number($("#floorReserveInput").value), endAllowanceM: Number($("#floorAllowanceInput").value), geometryConfirmed: $("#floorConfirmedInput").checked, syncWithCircuits: $("#floorAutoLengthsInput").checked });
  commitFloorPlan(next, true);
}
function saveFloorRoom() { return applyFloorForm("room", saveFloorRoomValues); }
function saveFloorRoomValues() {
  let next = clone(project.floorPlan);
  if (next.geometryMode === "free") {
    try { next = FG.resizeRoom(next, floorRoomId, readFloorNumber("#floorRoomWidth", "ширину кімнати"), readFloorNumber("#floorRoomDepth", "глибину кімнати")); }
    catch (error) { toast(error.message, "error"); return; }
    const room = next.rooms.find((r) => r.id === floorRoomId); room.name = $("#floorRoomName").value.trim() || room.name; room.routeLevelM = Number($("#floorOutsideLevel").value); commitFloorPlan(next); return;
  }
  const room = next.rooms.find((r) => r.id === floorRoomId);
  if (room.row !== "hall") { room.widthM = Number($("#floorRoomWidth").value); room.row = $("#floorRoomRow").value; }
  Object.assign(room, { name: $("#floorRoomName").value.trim() || room.name, depthM: Number($("#floorRoomDepth").value), doorU: Number($("#floorRoomDoor").value) / 100, windowWall: $("#floorRoomWindow").value, routeLevelM: Number($("#floorOutsideLevel").value) });
  commitFloorPlan(next);
}
function saveFloorPoint() { return applyFloorForm("point", saveFloorPointValues); }
function saveFloorPointValues() {
  let next = clone(project.floorPlan); const point = next.points.find((p) => p.id === floorSelectedId);
  if (!point) return;
  const room = F.layout(next).rooms.find((r) => r.id === $("#floorPointRoom").value);
  Object.assign(point, { roomId: room.id, name: $("#floorPointName").value.trim() || point.name, label: $("#floorPointLabel").value.trim() || point.label, u: Number($("#floorPointX").value) / room.widthM, v: Number($("#floorPointY").value) / room.depthM, heightM: $("#floorPointAtCeiling").checked ? null : Number($("#floorPointHeight").value), circuitId: point.type === "panel" ? "" : $("#floorPointCircuit").value });
  if (point.type === "switch") { point.controlsId = $("#floorPointControls").value; point.circuitId = next.points.find((p) => p.id === point.controlsId)?.circuitId || ""; }
  if (point.type !== "panel") point.supplyFromId = $("#floorPointSource").value;
  if (point.type === "light") next.points.filter((p) => p.controlsId === point.id).forEach((p) => { p.circuitId = point.circuitId; });
  delete point.placementReview;
  if (point.type === "junction") {
    try {
      const mounting = $("#floorJunctionMounting").value;
      next = F.withJunctionMounting(next, point.id, mounting, mounting === "wall" ? readFloorNumber("#floorPointHeight", "висоту дози") : undefined);
      if (floorJunctionDraft?.id === point.id && floorJunctionDraft.changed) {
        if (floorJunctionDraft.fingerprint !== JSON.stringify(project.floorPlan)) throw new Error("План змінився після вибору точок. Виберіть дозу знову й перевірте підключення.");
        next = F.setJunctionConnections({ ...project, floorPlan: next }, point.id, [...floorJunctionDraft.selected]);
      }
    }
    catch (error) { toast(error.message, "error"); return; }
    const previousCircuit = floorCircuitId; floorCircuitId = point.circuitId;
    if (!commitFloorPlan(next)) floorCircuitId = previousCircuit;
    return;
  }
  commitFloorPlan(next);
}
function addFloorPoint() {
  let next = clone(project.floorPlan);
  const selectedType = $("#floorQuickPointType").value, type = selectedType === "junction-wall" ? "junction" : selectedType, room = next.rooms.find((r) => r.id === floorRoomId);
  if (!room) return;
  const lamp = next.points.find((p) => p.type === "light" && p.roomId === room.id), selected = next.points.find((p) => p.id === floorSelectedId);
  const prefix = { socket: "X", light: "EL", switch: "S", equipment: "EP", junction: "Д" }[type];
  let index = 1; while (next.points.some((p) => p.label === `${prefix}${index}`)) index += 1;
  const point = { id: uid(), type, roomId: room.id, u: ["light", "junction"].includes(type) ? .5 : 0, v: .5, heightM: ["light", "junction"].includes(type) ? null : type === "switch" ? .9 : .3, label: `${prefix}${index}`, name: F.TYPES[type], circuitId: type === "switch" ? lamp?.circuitId || "" : floorCircuitId || "" };
  if (type === "junction") { point.mounting = selectedType === "junction-wall" ? "wall" : "ceiling"; if (point.mounting === "wall") point.heightM = Math.max(0, next.ceilingHeightM - .2); }
  if (type === "switch" && lamp) point.controlsId = lamp.id;
  if (selected?.type === "junction" && selected.circuitId && selected.circuitId === point.circuitId) point.supplyFromId = selected.id;
  try {
    if (type === "junction" && floorRouteSelection) {
      placeFloorJunction(next, point, floorRouteSelection.at);
      next = F.insertJunction({ ...project, floorPlan: next }, floorRouteSelection, point);
    } else {
      F.placePoint(next, point, F.world(next, point), type !== "light" && $("#floorSnapWall").checked);
      next.points.push(point);
    }
    floorSelectedId = point.id; floorRoomId = point.roomId;
    if (commitFloorPlan(next)) openFloorProperties();
  } catch (error) { toast(error.message, "error"); }
}
function deleteFloorPoint() {
  const point = project.floorPlan.points.find((p) => p.id === floorSelectedId);
  if (!point || point.type === "panel") return;
  const next = F.removePoint(project.floorPlan, point.id);
  floorSelectedId = null; if (commitFloorPlan(next) && point.type === "junction") toast("Дозу видалено. Її відгалуження повернуто до попереднього джерела траси.");
}
function floorScreenPosition(event) {
  const svg = $("#floorCanvas .floor-svg"), screen = svg.createSVGPoint(); screen.x = event.clientX; screen.y = event.clientY;
  const local = screen.matrixTransform(svg.getScreenCTM().inverse()), arrangement = F.layout(project.floorPlan);
  return { x: (local.x - PanelFloorSvg.LEFT) / PanelFloorSvg.SCALE + arrangement.minX, y: (local.y - PanelFloorSvg.TOP) / PanelFloorSvg.SCALE + arrangement.minY };
}
function placeFloorJunction(plan, point, at) {
  const rooms = F.layout(plan).rooms, contains = (r) => plan.geometryMode === "free" ? FG.contains(r, at) || FG.nearest(r, at).distance < .001 : at.x >= r.x && at.x <= r.x + r.widthM && at.y >= r.y && at.y <= r.y + r.depthM;
  const room = rooms.find((r) => r.id === point.roomId && contains(r)) || rooms.find(contains);
  if (!room) throw new Error("Вставляйте дозу на ділянку кабелю всередині кімнати або коридору.");
  point.roomId = room.id; F.placePoint(plan, point, at);
  if (F.junctionMounting(plan, point) === "ceiling") { point.mounting = "ceiling"; point.heightM = null; }
}
function selectFloorRoute(node, position = null) {
  const report = F.calculate(project), circuit = report.circuits.find((c) => c.deviceId === node.dataset.floorRouteCircuit), leg = circuit?.legs.find((l) => l.toId === node.dataset.floorRoute && l.kind === "feed");
  if (!leg) return;
  const at = position || leg.points[Math.floor(leg.points.length / 2)];
  floorRouteSelection = F.hitRoute(project, at, { circuitId: circuit.deviceId, toId: leg.toId, toleranceM: .5 });
  if (!floorRouteSelection) return;
  floorSelectedId = null; floorCircuitId = circuit.deviceId; if (!$("#floorQuickPointType").value.startsWith("junction")) $("#floorQuickPointType").value = "junction";
  renderFloorPlan();
}
function stopFloorConnections() {
  const active = floorConnectMode;
  floorConnectMode = false; floorConnectSourceId = null;
  return active;
}
function setFloorConnectMode(enabled) {
  cancelFloorInteractions();
  if (!enabled) { renderFloorPlan(); return; }
  floorGeometryEditing = false; floorWallIndex = null; floorVertexIndex = null; floorOpeningKind = null; floorPanMode = false;
  floorRouteSelection = null; floorConnectMode = true;
  requestFloorSidebar("connections");
  floorConnectSourceId = floorConnectPattern === "radial" ? project.floorPlan.points.find((p) => p.type === "panel")?.id || null : null;
  $("#floorShowRoutes").checked = true;
  renderFloorPlan();
}
function chooseFloorConnectionPoint(id) {
  const plan = project.floorPlan, point = plan.points.find((p) => p.id === id);
  if (!point) return;
  if (point.type === "panel" || !floorConnectSourceId) {
    if (point.type === "switch") { toast("Почніть лінію від щита, дози або точки живлення. Вимикач можна вибрати кінцевою точкою.", "error"); return; }
    floorConnectSourceId = point.id; floorSelectedId = point.id; floorRoomId = point.roomId;
    if (point.circuitId) floorCircuitId = point.circuitId;
    renderFloorPlan(); return;
  }
  if (id === floorConnectSourceId) return;
  try {
    const next = F.connectPoints(project, floorConnectSourceId, id, floorCircuitId), nextPoint = next.points.find((p) => p.id === id);
    const changed = next.points.some((p) => p.circuitId !== plan.points.find((old) => old.id === p.id)?.circuitId) || F.sourceFor(plan, point)?.id !== F.sourceFor(next, nextPoint)?.id;
    if (changed && !commitFloorPlan(next)) return;
    floorSelectedId = point.id; floorRoomId = point.roomId; floorCircuitId = nextPoint.circuitId;
    floorConnectSourceId = floorConnectPattern === "radial" ? next.points.find((p) => p.type === "panel")?.id || null : point.type === "switch" ? null : point.id;
    renderFloorPlan();
  } catch (error) { toast(error.message, "error"); }
}
function paintFloorConnectionPreview(event) {
  const svg = $("#floorCanvas .floor-svg"), source = project.floorPlan.points.find((p) => p.id === floorConnectSourceId);
  if (!svg || !source) return;
  const pos = floorScreenPosition(event), arrangement = F.layout(project.floorPlan), start = F.world(project.floorPlan, source, arrangement);
  const x = (value) => PanelFloorSvg.LEFT + (value - arrangement.minX) * PanelFloorSvg.SCALE, y = (value) => PanelFloorSvg.TOP + (value - arrangement.minY) * PanelFloorSvg.SCALE;
  svg.querySelector("[data-floor-connection-preview]")?.remove();
  svg.insertAdjacentHTML("beforeend", `<path data-floor-connection-preview="true" d="M${x(start.x)} ${y(start.y)}L${x(pos.x)} ${y(start.y)}L${x(pos.x)} ${y(pos.y)}" class="floor-connect-preview" pointer-events="none"/>`);
}
function exportFloorCsv() {
  const r = F.calculate(project), rows = [["План приміщень", r.plan.name], ["Обміри й маршрути", r.plan.geometryConfirmed ? "підтверджені користувачем" : "типовий ескіз; довжини попередні"], ["Прокладання", r.plan.routing], ["Висота стелі, м", r.plan.ceilingHeightM], ["Запас, %", r.plan.reservePercent], ["Припуск на кінець, м", r.plan.endAllowanceM], [], ["Коло", "Назва", "S, мм²", "Точок", "Горизонталь, м", "Вертикаль, м", "Припуски, м", "Запас, м", "Закупівля, м", "Найдовший шлях, м"]];
  rows[rows.length - 1].push("Стан траси");
  r.circuits.forEach((c) => rows.push([c.label, c.name, c.section ?? "", c.pointCount, c.horizontalM, c.verticalM, c.allowanceM, c.reserveM, c.incomplete ? "" : c.purchaseM, c.incomplete ? "" : c.longestPathM, c.incomplete ? "Неповний метраж" : "Побудовано"]));
  rows.push([], ["Позначення", "Назва", "Приміщення", "X у кімнаті, м", "Y у кімнаті, м", "Висота, м", "Коло", "Монтаж", "Траса від"]);
  r.plan.points.forEach((point) => { const room = r.arrangement.rooms.find((r) => r.id === point.roomId), d = project.devices.find((d) => d.id === point.circuitId); rows.push([point.label, point.name, room.name, point.u * room.widthM, point.v * room.depthM, F.pointHeight(r.plan, point), d?.label || "", point.type === "junction" ? F.junctionMounting(r.plan, point) === "ceiling" ? "На стелі" : "На стіні" : "", F.sourceFor(r.plan, point)?.label || ""]); });
  rows.push([], ["Ділянки кабелів", "Від", "До", "Призначення", "Траса, м", "Припуски, м"]);
  r.circuits.forEach((c) => c.legs.forEach((leg) => rows.push([c.label, r.plan.points.find((p) => p.id === leg.fromId).label, r.plan.points.find((p) => p.id === leg.toId).label, leg.kind === "switch" ? "Керування" : "Живлення", leg.lengthM, leg.allowanceM])));
  r.warnings.forEach((warning) => rows.push(["Примітка", warning]));
  rows.push(...Cables.csvRows(Cables.calculate(project, r), E.COLORS, { includeWires: false }));
  downloadBlob(csvContent(rows), `${slugify(project.name)}-floor-cables.csv`, "text/csv;charset=utf-8");
}
function initFloorPlan() {
  initFloorJunctionConnections();
  const exportMenu = $(".floor-export-menu");
  exportMenu.addEventListener("click", (event) => { if (event.target.closest("button")) exportMenu.open = false; });
  document.addEventListener("pointerdown", (event) => { if (!event.target.closest(".floor-export-menu")) exportMenu.open = false; });
  try { $("#floorShowGrid").checked = localStorage.getItem("electropanel-v2-floor-grid-visible") !== "false"; } catch { /* Keep the visible default if preferences are unavailable. */ }
  $("#floorShowGrid").addEventListener("change", () => { try { localStorage.setItem("electropanel-v2-floor-grid-visible", String($("#floorShowGrid").checked)); } catch { /* Visibility still works for this session. */ } renderFloorCanvas(); });
  $("#floorGeometryGrid").addEventListener("change", renderFloorCanvas);
  $("#floorGenerateButton").addEventListener("click", () => { floorSelectedId = null; floorCircuitId = ""; commitFloorPlan(F.create(project, $("#floorTemplateInput").value)); });
  $("#floorUndoButton").addEventListener("click", undoFloorChange);
  $("#floorApplySettings").addEventListener("click", saveFloorSettings); $("#floorApplyRoom").addEventListener("click", saveFloorRoom); $("#floorApplyPoint").addEventListener("click", saveFloorPoint);
  $("#floorRoomSelect").addEventListener("change", () => { floorRoomId = $("#floorRoomSelect").value; floorWallIndex = null; floorVertexIndex = null; floorOpeningKind = null; renderFloorRoom(); renderFloorGeometry(); renderFloorUX(); renderFloorCanvas(); });
  $("#floorPointAtCeiling").addEventListener("change", () => { $("#floorPointHeight").disabled = $("#floorPointAtCeiling").checked; if ($("#floorPointAtCeiling").checked) $("#floorPointHeight").value = project.floorPlan.ceilingHeightM; });
  $("#floorJunctionMounting").addEventListener("change", () => {
    const ceiling = $("#floorJunctionMounting").value === "ceiling";
    $("#floorPointAtCeiling").checked = ceiling; $("#floorPointHeight").disabled = ceiling;
    $("#floorPointHeight").value = ceiling ? project.floorPlan.ceilingHeightM : Math.max(0, project.floorPlan.ceilingHeightM - .2);
  });
  $("#floorPointCircuit").addEventListener("change", () => {
    const point = project.floorPlan.points.find((p) => p.id === floorSelectedId), circuitId = $("#floorPointCircuit").value;
    if (point) renderFloorSources(point, circuitId);
    if (point?.type === "junction" && floorJunctionDraft) {
      floorJunctionDraft.circuitId = circuitId;
      floorJunctionDraft.changed = true;
      if (point.supplyFromId && project.floorPlan.points.find((p) => p.id === point.supplyFromId)?.circuitId !== circuitId) $("#floorPointSource").value = "";
      renderFloorJunctionConnections();
    }
  });
  $("#floorPointControls").addEventListener("change", () => { const point = project.floorPlan.points.find((p) => p.id === floorSelectedId), lamp = project.floorPlan.points.find((p) => p.id === $("#floorPointControls").value); if (point) { $("#floorPointCircuit").value = lamp?.circuitId || ""; renderFloorSources(point, lamp?.circuitId || ""); } });
  $("#floorQuickPointType").addEventListener("change", () => { floorRouteSelection = null; renderFloorUX(); renderFloorCanvas(); });
  $("#floorConnectMode").addEventListener("click", () => setFloorConnectMode(!floorConnectMode));
  $("#floorConnectionPattern").addEventListener("change", () => {
    floorConnectPattern = $("#floorConnectionPattern").value;
    floorConnectSourceId = floorConnectPattern === "radial" ? project.floorPlan.points.find((p) => p.type === "panel")?.id || null : null;
    renderFloorPlan();
  });
  $("#floorCircuitFilter").addEventListener("change", () => { floorRouteSelection = null; floorCircuitId = $("#floorCircuitFilter").value; if (floorConnectMode) floorConnectSourceId = floorConnectPattern === "radial" ? project.floorPlan.points.find((p) => p.type === "panel")?.id || null : null; renderFloorPlan(); });
  ["#floorShowRoutes", "#floorShowHeights"].forEach((id) => $(id).addEventListener("change", renderFloorCanvas));
  ["#floorCeilingInput", "#floorRoutingInput", "#floorWallInput", "#floorAllowanceInput"].forEach((id) => $(id).addEventListener("input", () => { $("#floorConfirmedInput").checked = false; }));
  $("#floorCsvButton").addEventListener("click", exportFloorCsv);
  $("#floorSvgButton").addEventListener("click", () => downloadBlob(PanelFloorSvg.render(project, { showRoutes: $("#floorShowRoutes").checked, showHeights: $("#floorShowHeights").checked, circuitId: floorCircuitId }), `${slugify(project.name)}-floor-plan.svg`, "image/svg+xml;charset=utf-8"));
  $("#floorPrintButton").addEventListener("click", () => { if (floorGeometryEditing) setFloorGeometryMode(false); window.print(); });
  [["#floorZoomOut", 1 / 1.2], ["#floorZoomIn", 1.2]].forEach(([selector, factor]) => $(selector).addEventListener("click", () => zoomFloorPlan(factor)));
  $("#floorFitButton").addEventListener("click", () => { floorScale = null; $("#floorView").scrollTop = 0; renderFloorCanvas(); });
  const queueViewport = () => {
    if (floorViewportFrame !== null) return;
    floorViewportFrame = requestAnimationFrame(() => { floorViewportFrame = null; refreshFloorViewport(); });
  };
  window.addEventListener("resize", queueViewport);
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(queueViewport);
    ["#floorView", "#floorCanvas", ".floor-toolbar", ".floor-tools", ".floor-main-tools", ".floor-selection-bar", ".floor-pencil-toolbar", ".floor-navigation-help"].forEach((selector) => observer.observe($(selector)));
  }
  $("#floorCableReport").addEventListener("click", (event) => {
    const circuit = event.target.closest("[data-floor-circuit]");
    if (circuit) { floorCircuitId = floorCircuitId === circuit.dataset.floorCircuit ? "" : circuit.dataset.floorCircuit; renderFloorPlan(); }
    if (event.target.closest("#floorSyncButton")) { snapshot(); project = F.syncLengths(project); persistProject(); renderAll(); toast("Довжини найдовших шляхів передано. Ескізні дані потребують підтвердження обмірів."); }
  });
  $("#floorPointSchedule").addEventListener("click", (event) => { const point = event.target.closest("[data-floor-select]"); if (point) selectFloorPoint(point.dataset.floorSelect); });
  const canvas = $("#floorCanvas");
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && floorConnectMode) { event.preventDefault(); setFloorConnectMode(false); return; }
    if (event.key === "Escape" && floorRouteSelection) { floorRouteSelection = null; renderFloorPlan(); return; }
    const point = event.target.closest("[data-floor-point]"), route = event.target.closest("[data-floor-route]");
    if (["Enter", " "].includes(event.key) && (point || route)) { event.preventDefault(); if (point) { if (floorConnectMode) chooseFloorConnectionPoint(point.dataset.floorPoint); else selectFloorPoint(point.dataset.floorPoint); } else selectFloorRoute(route); }
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.isPrimary === false || floorGeometryEditing || floorPencilActive) return;
    if (floorConnectMode) {
      event.preventDefault();
      const point = event.target.closest("[data-floor-point]");
      if (point) chooseFloorConnectionPoint(point.dataset.floorPoint);
      else { floorConnectSourceId = floorConnectPattern === "radial" ? project.floorPlan.points.find((p) => p.type === "panel")?.id || null : null; renderFloorPlan(); }
      return;
    }
    const route = event.target.closest("[data-floor-route]");
    if (route) { event.preventDefault(); selectFloorRoute(route, floorScreenPosition(event)); return; }
    const node = event.target.closest("[data-floor-point]");
    if (!node) return;
    floorSelectedId = node.dataset.floorPoint; floorRouteSelection = null;
    const point = project.floorPlan.points.find((p) => p.id === floorSelectedId);
    floorDrag = { id: floorSelectedId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, changed: false };
    requestFloorSidebar("points");
    floorCircuitId = point.circuitId; floorRoomId = point.roomId;
    canvas.setPointerCapture(event.pointerId); event.preventDefault(); renderFloorPoint(); $("#floorPointEditor").open = true;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (floorConnectMode) { paintFloorConnectionPreview(event); return; }
    if (!floorDrag || floorDrag.pointerId !== event.pointerId) return;
    if (!floorDrag.changed && Math.hypot(event.clientX - floorDrag.x, event.clientY - floorDrag.y) < 4) return;
    if (!floorDrag.changed) { floorPointPreview = clone(project.floorPlan); floorDrag.changed = true; }
    const svg = $(".floor-svg", canvas), screenPoint = svg.createSVGPoint(); screenPoint.x = event.clientX; screenPoint.y = event.clientY;
    const plan = floorPointPreview;
    const local = screenPoint.matrixTransform(svg.getScreenCTM().inverse()), arrangement = F.layout(plan), point = plan.points.find((p) => p.id === floorDrag.id), room = arrangement.rooms.find((r) => r.id === point.roomId);
    const pos = { x: (local.x - PanelFloorSvg.LEFT) / PanelFloorSvg.SCALE + arrangement.minX, y: (local.y - PanelFloorSvg.TOP) / PanelFloorSvg.SCALE + arrangement.minY };
    floorDrag.position = pos; floorDrag.altKey = event.altKey;
    try { F.placePoint(plan, point, pos, $("#floorSnapWall").checked && point.type !== "light"); }
    catch (error) { toast(error.message, "error"); cancelFloorPointDrag(); return; }
    delete point.placementReview; plan.geometryConfirmed = false;
    if (!floorFrame) floorFrame = requestAnimationFrame(() => { floorFrame = null; renderFloorCanvas(); renderFloorPoint(); });
  });
  const finish = (event) => {
    if (!floorDrag || floorDrag.pointerId !== event.pointerId) return;
    const gesture = floorDrag, changed = gesture.changed; let next = floorPointPreview; floorDrag = null; floorPointPreview = null;
    if (floorFrame) { cancelAnimationFrame(floorFrame); floorFrame = null; }
    if (changed && next) {
      const point = next.points.find((p) => p.id === gesture.id);
      if (point.type === "junction" && gesture.position && !gesture.altKey && $("#floorShowRoutes").checked) {
        const position = F.junctionMounting(next, point) === "wall" ? F.world(next, point) : gesture.position;
        const hit = F.hitRoute(project, position, { excludeId: point.id, circuitId: point.circuitId || floorCircuitId });
        if (hit) {
          try { placeFloorJunction(next, point, hit.at); next = F.insertJunction({ ...project, floorPlan: next }, hit, point); }
          catch (error) { toast(error.message, "error"); renderFloorPlan(); return; }
        }
      }
      commitFloorPlan(next);
    }
    else { renderFloorPlan(); $("#floorPointEditor").open = true; }
  };
  canvas.addEventListener("pointerup", finish); canvas.addEventListener("pointercancel", (event) => { if (floorDrag?.pointerId === event.pointerId) cancelFloorPointDrag(); });
  canvas.addEventListener("pointerleave", () => { $("#floorCanvas .floor-svg")?.querySelector("[data-floor-connection-preview]")?.remove(); });
}

function cancelFloorPointDrag() {
  if (!floorDrag && !floorPointPreview) return;
  floorDrag = null; floorPointPreview = null;
  if (floorFrame) { cancelAnimationFrame(floorFrame); floorFrame = null; }
  renderFloorPlan();
}
function cancelFloorInteractions() {
  const connecting = stopFloorConnections();
  stopFloorPencil();
  cancelFloorPointDrag();
  if (floorGeometryDrag) cancelFloorGeometryDrag();
  floorPanning = null; $("#floorCanvas").classList.remove("panning");
  if (connecting && project.floorPlan) renderFloorPlan();
}

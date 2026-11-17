/* Geometry inspector and scaled assembly view. Uses the same project and wires. */
const M = PanelMechanical;
const DEVICE_HEIGHT_VIEW_KEY = "electropanel.v2.device-height-view.v1";
let uniformDeviceHeight = true;
function setUniformDeviceHeight(value, redraw = true) {
  uniformDeviceHeight = Boolean(value);
  PStore.writeString(browserStorage, DEVICE_HEIGHT_VIEW_KEY, uniformDeviceHeight ? "uniform" : "actual");
  if (redraw) { renderAll(); requestAnimationFrame(fitBoard); }
}
function geometryOwner() {
  const device = project.devices.find((item) => item.id === selectedDeviceId);
  const bar = project.busbars.find((item) => item.id === selectedBusbarId);
  return device ? { entity: device, bar: false } : bar ? { entity: bar, bar: true } : null;
}
function mmText(d) { return `${number(d.widthMm)} × ${number(d.heightMm)} × ${number(d.depthMm)} мм`; }
function mmScale() { return MODULE_PX / M.boardGeometry(project.board).pitchMm; }

function prepareMechanicalBoardForm() {
  const b = M.boardGeometry(project.board);
  $("#boardCapacityInput").innerHTML = '<option value="custom">Власна кількість рядів і модулів</option>' + M.CAPACITIES.map((item) => `<option value="${item.id}">${item.capacity} модулів · ${item.rows} × ${item.modulesPerRow}</option>`).join("");
  $("#boardPresetInput").innerHTML = `<option value="modules">Корпус поки не обирати</option><option value="custom">Власний корпус · вказати розміри</option>${M.ENCLOSURES.map((model) => `<option value="${model.id}">${model.model} · ${model.rows}×${model.modulesPerRow} · ${model.widthMm}×${model.heightMm}×${model.depthMm} мм</option>`).join("")}`;
  $("#boardPresetInput").value = project.board.enclosureId || (project.board.dimensions ? "custom" : "modules");
  $("#boardWidthInput").value = b.widthMm; $("#boardHeightInput").value = b.heightMm; $("#boardDepthInput").value = b.depthMm;
  $("#boardPitchInput").value = b.pitchMm;
  $("#boardDimensionSourceInput").value = b.source;
  $("#boardDimensionConfirmedInput").checked = Boolean(project.board.dimensions?.confirmed);
  $("#boardRailLeftInput").value = b.leftMm; $("#boardRailTopInput").value = b.firstRailMm;
  $("#boardRailSpacingInput").value = b.rowPitchMm;
  $("#boardUsableDepthInput").value = b.maxDeviceDepthMm ?? "";
  $("#boardMountingSourceInput").value = project.board.mounting?.source || "";
  $("#boardMountingConfirmedInput").checked = Boolean(project.board.mounting?.confirmed);
  $("#boardPhysicalInput").checked = !uniformDeviceHeight;
  syncCapacityFields(false);
  updateEnclosureForm(false);
}
function syncCapacityFields(load = false) {
  const chosen = M.CAPACITIES.find((item) => item.id === $("#boardCapacityInput").value);
  if (load && chosen) { $("#boardRowsInput").value = chosen.rows; $("#boardModulesInput").value = chosen.modulesPerRow; }
  const rows = Number($("#boardRowsInput").value), modules = Number($("#boardModulesInput").value);
  if (!load) $("#boardCapacityInput").value = M.CAPACITIES.find((item) => item.rows === rows && item.modulesPerRow === modules)?.id || "custom";
  const model = M.enclosure($("#boardPresetInput").value);
  if (model && (model.rows !== rows || model.modulesPerRow !== modules)) { $("#boardPresetInput").value = "modules"; updateEnclosureForm(false); }
  $("#boardCapacityInfo").textContent = `${rows} DIN-рейок × ${modules} місць = ${rows * modules} модулів. Корпус можна підібрати пізніше.`;
}
function updateEnclosureForm(loadPreset = true) {
  const preset = M.enclosure($("#boardPresetInput").value);
  if (preset && loadPreset) {
    $("#boardRowsInput").value = preset.rows; $("#boardModulesInput").value = preset.modulesPerRow;
    $("#boardWidthInput").value = preset.widthMm; $("#boardHeightInput").value = preset.heightMm; $("#boardDepthInput").value = preset.depthMm;
    $("#boardPitchInput").value = preset.pitchMm; $("#boardIpInput").value = preset.ip;
    $("#boardDimensionSourceInput").value = preset.source;
    $("#boardRailLeftInput").value = (preset.widthMm - preset.modulesPerRow * preset.pitchMm) / 2;
    $("#boardRailTopInput").value = (preset.heightMm - (preset.rows - 1) * preset.rowPitchMm) / 2;
    $("#boardRailSpacingInput").value = preset.rowPitchMm;
    $("#boardUsableDepthInput").value = ""; $("#boardMountingSourceInput").value = "";
    $("#boardMountingConfirmedInput").checked = false;
    syncCapacityFields(false);
  }
  ["#boardWidthInput", "#boardHeightInput", "#boardDepthInput", "#boardPitchInput", "#boardDimensionSourceInput", "#boardIpInput"].forEach((id) => { $(id).disabled = Boolean(preset); });
  $("#boardEnclosureProperties").classList.toggle("hidden", $("#boardPresetInput").value === "modules");
  $("#boardDimensionConfirmedField").classList.toggle("hidden", Boolean(preset));
  $("#boardPresetInfo").innerHTML = preset ? `<strong>${escapeHtml(preset.model)} · ${mmText(preset)}</strong><span>${preset.mounting} · ${preset.ip} · ${preset.rows * preset.modulesPerRow} місць. <a href="${escapeHtml(preset.source)}" target="_blank" rel="noopener noreferrer">Каталог виробника ↗</a></span><small>Корпус буде додано до специфікації. На полотні відображається обладнання на рейках.</small>` : $("#boardPresetInput").value === "modules" ? "Компонування за кількістю модулів. Модель корпусу не потрібна для початку роботи." : "Вкажіть розміри корпусу за паспортом для перевірки сумісності та специфікації.";
}
function readMechanicalBoard(base) {
  const selected = $("#boardPresetInput").value;
  if (selected === "modules") return M.withCapacity({ ...base, physicalView: $("#boardPhysicalInput").checked }, base.rows, base.modulesPerRow);
  const next = { ...base, enclosureId: selected, physicalView: $("#boardPhysicalInput").checked };
  delete next.fullEnclosureView;
  if (M.enclosure(selected)) {
    const preset = M.enclosure(selected);
    Object.assign(next, { rows: preset.rows, modulesPerRow: preset.modulesPerRow, ip: preset.ip });
    delete next.dimensions;
  } else next.dimensions = { widthMm: Number($("#boardWidthInput").value), heightMm: Number($("#boardHeightInput").value), depthMm: Number($("#boardDepthInput").value), pitchMm: Number($("#boardPitchInput").value), source: $("#boardDimensionSourceInput").value.trim(), confirmed: $("#boardDimensionConfirmedInput").checked };
  next.mounting = { leftMm: Number($("#boardRailLeftInput").value), firstRailMm: Number($("#boardRailTopInput").value), rowPitchMm: Number($("#boardRailSpacingInput").value), maxDeviceDepthMm: $("#boardUsableDepthInput").value === "" ? null : Number($("#boardUsableDepthInput").value), source: $("#boardMountingSourceInput").value.trim(), confirmed: $("#boardMountingConfirmedInput").checked };
  M.boardGeometry(next);
  return next;
}

function renderMechanicalBoard() {
  const physical = true; // Both views use the same metric DIN grid and widths.
  const viewport = M.assemblyViewport(PanelDeviceVisuals.scene(project, uniformDeviceHeight)), frame = $("#boardAssemblyViewport");
  const shell = $("#boardShell"), surface = $("#wiringSurface");
  shell.classList.add("assembly-board");
  shell.classList.toggle("physical-board", physical);
  shell.classList.toggle("uniform-device-height", uniformDeviceHeight);
  $("#physicalViewButton").setAttribute("aria-pressed", String(!uniformDeviceHeight));
  $("#physicalViewButton").textContent = uniformDeviceHeight ? "Рівна висота" : "Габарити · мм";
  $("#physicalViewButton").title = uniformDeviceHeight ? "Однакова висота зображень. Натисніть, щоб показати реальні габарити апаратів." : "Реальні габарити апаратів. Натисніть, щоб вирівняти висоту зображень.";
  $("#boardGeometryCaption").classList.add("hidden");
  $("#boardGeometryCaption").textContent = "";
  frame.classList.remove("trimmed-assembly");
  frame.style.width = physical ? `${viewport.widthMm * mmScale()}px` : "";
  frame.style.height = physical ? `${viewport.heightMm * mmScale()}px` : "";
  surface.style.width = physical ? `${viewport.surfaceWidthMm * mmScale()}px` : "";
  surface.style.height = physical ? `${viewport.surfaceHeightMm * mmScale()}px` : "";
  surface.style.left = physical ? `${-viewport.leftMm * mmScale()}px` : "";
  surface.style.top = physical ? `${-viewport.topMm * mmScale()}px` : "";
  surface.style.clipPath = physical ? `inset(${viewport.topMm * mmScale()}px -10000px -10000px ${viewport.leftMm * mmScale()}px)` : "";
  surface.dataset.routeInsetX = physical ? viewport.leftMm * mmScale() : 0;
  shell.style.setProperty("--mm-scale", mmScale());
  shell.style.setProperty("--rail-mm-height", `${100 * mmScale()}px`);
  shell.style.setProperty("--rail-mm-center", `${50 * mmScale()}px`);
  shell.style.setProperty("--rail-mm-band", `${35 * mmScale()}px`);
  $("#boardIpText").classList.add("hidden");
}
function rowGeometryStyle(row) {
  if (!$("#boardShell").classList.contains("physical-board")) return "";
  const b = M.boardGeometry(project.board), scale = mmScale();
  return `left:${b.leftMm * scale}px;top:${(b.firstRailMm + row * b.rowPitchMm - 50) * scale}px`;
}
function deviceGeometryStyle(device) {
  if (!$("#boardShell").classList.contains("physical-board")) return `left:${device.slot * MODULE_PX + 1}px;width:${getComponent(device).modules * MODULE_PX - 3}px`;
  const d = PanelDeviceVisuals.dimensions(device, uniformDeviceHeight), scale = mmScale();
  return `left:${device.slot * MODULE_PX}px;top:${(50 - d.railOffsetMm) * scale}px;width:${d.widthMm * scale}px;height:${d.heightMm * scale}px`;
}
function positionPhysicalBusbars() {
  if (!$("#boardShell").classList.contains("physical-board")) return;
  const b = M.boardGeometry(project.board), scale = mmScale();
  const rects = new Map(M.barDrawingRects(project).map((item) => [item.id, item]));
  project.busbars.forEach((bar) => {
    const node = $(`.busbar-card[data-busbar-id="${CSS.escape(bar.id)}"]`);
    if (!node) return;
    const r = rects.get(bar.id);
    const x = bar.zone === "din" ? r.x - b.leftMm : r.x;
    const y = bar.zone === "din" ? r.y - (b.firstRailMm + bar.row * b.rowPitchMm - 50) : r.y;
    node.style.cssText = `left:${x * scale}px;top:${y * scale}px;width:${r.width * scale}px;height:${r.height * scale}px`;
    if (r.measured) node.classList.add("sized-busbar");
    else {
      node.classList.add("unmeasured-busbar");
      node.title = "Умовне місце. Натисніть шину й задайте її розміри та координати.";
    }
  });
}

function renderGeometryInspector() {
  const owner = geometryOwner();
  $("#geometryInspector").classList.toggle("hidden", !owner);
  if (!owner) return;
  const { entity, bar } = owner;
  $("#geometryProfileInput").innerHTML = `<option value="">Універсальний · габарити орієнтовні</option>${(bar ? [] : M.PROFILES.filter((item) => item.types.includes(entity.type))).map((item) => `<option value="${item.id}">${escapeHtml(item.model)}</option>`).join("")}<option value="custom">Власна модель · з паспорта</option>`;
  $("#geometryProfileInput").value = bar ? entity.dimensions ? "custom" : "" : entity.geometryId || (entity.dimensions ? "custom" : "");
  fillGeometryFields();
}
function fillGeometryFields() {
  const owner = geometryOwner(); if (!owner) return;
  const { entity, bar } = owner, id = $("#geometryProfileInput").value;
  const originalId = bar ? entity.dimensions ? "custom" : "" : entity.geometryId || (entity.dimensions ? "custom" : "");
  const same = id === originalId;
  const current = bar && !entity.dimensions ? { widthMm: M.barModules(entity) * 18, heightMm: 12, depthMm: 25, railOffsetMm: 6, model: "Шина · орієнтовно", source: "" } : M.dimensions(bar ? { ...entity, type: "terminal", geometryId: "custom" } : entity);
  const d = M.profile(id) ? { ...M.profile(id), railOffsetMm: M.profile(id).heightMm / 2 } : current;
  $("#geometryModelInput").value = d.model;
  $("#geometryWidthInput").value = d.widthMm; $("#geometryHeightInput").value = d.heightMm; $("#geometryDepthInput").value = d.depthMm;
  $("#geometryOffsetInput").value = same ? current.railOffsetMm : d.railOffsetMm;
  $("#geometrySourceInput").value = d.source || "";
  $("#geometryConfirmedInput").checked = same && Boolean(entity.dimensions?.confirmed || entity.mounting?.confirmed);
  ["#geometryWidthInput", "#geometryHeightInput", "#geometryDepthInput", "#geometryModelInput"].forEach((selector) => { $(selector).disabled = id !== "custom"; });
  $("#geometryOffsetInput").disabled = !id;
  $("#geometrySourceInput").disabled = !id;
  $("#geometryConfirmedInput").disabled = !id;
  $("#applyGeometryButton").disabled = !id;
  const positionedBar = bar && entity.zone !== "din";
  $("#geometryXField").classList.toggle("hidden", !positionedBar); $("#geometryYField").classList.toggle("hidden", !positionedBar);
  $("#geometryOffsetField").classList.toggle("hidden", positionedBar);
  $("#geometryXInput").value = entity.positionMm?.x ?? 16;
  $("#geometryYInput").value = entity.positionMm?.y ?? Math.max(0, M.boardGeometry(project.board).heightMm - 40);
  $("#geometryDeviceNote").textContent = M.profile(id) ? `Каталожні габарити: ${mmText(d)}. Це профіль корпусу; електричні номінали, клеми й сумісність гребінок перевіряються окремо. Вісь DIN спочатку центрована — уточніть її за кресленням.` : id === "custom" ? "Введіть повні габарити, вісь кріплення та джерело. Ширина резервує потрібну кількість місць; після зміни апарати перемістяться разом зі з’єднаннями." : "Для цієї моделі є тільки умовний габарит. Виберіть каталожний профіль або введіть паспортні розміри.";
}
function applyComponentGeometry() {
  try {
    const owner = geometryOwner(); if (!owner) return;
    const next = clone(project), target = (owner.bar ? next.busbars : next.devices).find((entity) => entity.id === owner.entity.id);
    const id = $("#geometryProfileInput").value;
    if (!id) throw new Error("Оберіть габаритний профіль або власну модель");
    const source = $("#geometrySourceInput").value.trim(), confirmed = $("#geometryConfirmedInput").checked;
    const railOffsetMm = owner.bar && target.zone !== "din" ? Number($("#geometryHeightInput").value) / 2 : Number($("#geometryOffsetInput").value);
    if (id === "custom") {
      target.dimensions = { widthMm: Number($("#geometryWidthInput").value), heightMm: Number($("#geometryHeightInput").value), depthMm: Number($("#geometryDepthInput").value), railOffsetMm, source, confirmed, model: $("#geometryModelInput").value.trim() || "Власна модель" };
      if (!owner.bar) target.geometryId = "custom";
      delete target.mounting;
    } else { target.geometryId = id; target.mounting = { railOffsetMm, source, confirmed }; delete target.dimensions; }
    if (owner.bar && target.zone !== "din") target.positionMm = { x: Number($("#geometryXInput").value), y: Number($("#geometryYInput").value) };
    M.dimensions(owner.bar ? { ...target, type: "terminal", geometryId: "custom" } : target);
    const candidate = M.repack(next);
    if (E.validate(candidate).some((issue) => issue.code === "comb-potential")) throw new Error("Зміна розмірів розділяє контакти гребінки між рейками. Спершу змініть гребінку.");
    snapshot(); project = E.normalizeProject(candidate); persistProject(); renderAll(); requestAnimationFrame(fitBoard);
    toast("Розміри збережено; компоненти та проводка оновлені");
  } catch (error) { toast(error.message, "error"); }
}

function renderMechanicalSummary() {
  const issues = M.checks(project), errors = issues.filter((issue) => issue.level === "error");
  const total = project.board.rows * project.board.modulesPerRow;
  const used = project.devices.reduce((sum, device) => sum + M.modulesFor(device, project.board), 0) + project.busbars.filter((bar) => bar.zone === "din").reduce((sum, bar) => sum + M.barModules(bar, project.board), 0);
  const count = project.devices.filter((device) => M.dimensions(device).verified).length;
  const pending = issues.filter((issue) => issue.level === "pending");
  const notes = [...new Set(pending.map((issue) => ["device-unverified", "device-offset", "bar-unverified"].includes(issue.code) ? ({ "device-unverified": "Є апарати без підтверджених габаритів.", "device-offset": "Положення осі DIN у частині апаратів потребує уточнення.", "bar-unverified": "Є шини з умовними габаритами або місцем." }[issue.code]) : issue.text))];
  $("#mechanicalSummary").innerHTML = `<strong>${project.board.rows} × ${project.board.modulesPerRow} · ${total} модулів</strong><p>Зайнято ${used} · вільно ${total - used}.<br>${count}/${project.devices.length} апаратів із паспортними габаритами.</p><span class="mechanical-status ${errors.length ? "error" : ""}">${errors.length ? `${errors.length} зауважень до компоновки` : "Модулів достатньо"}</span>${errors.map((issue) => `<p class="mechanical-error">${escapeHtml(issue.text)}</p>`).join("")}<details><summary>${pending.length ? "Що ще потрібно звірити" : "Межі перевірки"}</summary><ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}<li>Місткість за модулями не замінює перевірку монтажної глибини й теплового режиму обраного корпусу.</li></ul></details><button class="button ghost full-width" id="exportDimensionsButton" type="button">Експорт розмірів CSV</button>`;
  $("#exportDimensionsButton").addEventListener("click", exportMechanicalCsv);
}
function exportMechanicalCsv() {
  const b = M.boardGeometry(project.board);
  const rows = [["Габаритна відомість · мм · не монтажний допуск"], ["Місткість, модулів", project.board.rows * project.board.modulesPerRow, "DIN-рейок", project.board.rows, "Модулів у ряду", project.board.modulesPerRow]];
  if (project.board.enclosureId || project.board.dimensions) rows.push(["Корпус для специфікації", b.model, "Ш", b.widthMm, "В", b.heightMm, "Г", b.depthMm]);
  else rows.push(["Корпус не обрано; координати монтажної системи без прив’язки до корпуса"]);
  rows.push(["Крок місця DIN", b.pitchMm, "Між рейками", b.rowPitchMm], ["Позначення", "Профіль", "Ш, мм", "В, мм", "Г, мм", "X, мм", "Y, мм", "DIN", "Місць", "Габарити підтверджені", "Джерело"]);
  project.devices.forEach((device) => { const d = M.dimensions(device), r = M.deviceRect(device, project.board); rows.push([device.label, d.model, d.widthMm, d.heightMm, d.depthMm, r.x, r.y, device.row + 1, r.slots, d.verified ? "так" : "ні", d.source]); });
  project.busbars.forEach((bar) => { const d = bar.dimensions && M.dimensions({ ...bar, type: "terminal", geometryId: "custom" }), r = d && bar.zone === "din" ? M.deviceRect({ ...bar, type: "terminal", geometryId: "custom" }, project.board) : bar.positionMm; rows.push([bar.label, d?.model || "Умовна шина", d?.widthMm ?? "", d?.heightMm ?? "", d?.depthMm ?? "", r?.x ?? "", r?.y ?? "", bar.zone === "din" ? bar.row + 1 : "", bar.zone === "din" ? E.busbarModules(bar, project.board) : "", d?.verified ? "так" : "ні", d?.source || ""]); });
  M.checks(project).forEach((issue) => rows.push([issue.level, issue.text]));
  downloadBlob(csvContent(rows), `${slugify(project.name)}-dimensions.csv`, "text/csv;charset=utf-8");
}
function initMechanical() {
  uniformDeviceHeight = PStore.readString(browserStorage, DEVICE_HEIGHT_VIEW_KEY) !== "actual";
  $("#boardCapacityInput").addEventListener("change", () => syncCapacityFields(true));
  ["#boardRowsInput", "#boardModulesInput"].forEach((id) => $(id).addEventListener("change", () => syncCapacityFields(false)));
  $("#replaceAfddButton").addEventListener("click", () => {
    try {
      const candidate = E.replaceAfdd(project, selectedDeviceId);
      if (E.validate(candidate).some((issue) => issue.code === "comb-potential")) throw new Error("Перевірте гребінку перед заміною апарата");
      snapshot(); project = candidate; persistProject(); renderAll(); requestAnimationFrame(fitBoard);
      toast("Встановлено звичайний дифавтомат; з’єднання збережені. Нормативні вимоги перевірте в розрахунках.");
    } catch (error) { toast(error.message, "error"); }
  });
  $("#boardPresetInput").addEventListener("change", () => updateEnclosureForm(true));
  $("#geometryProfileInput").addEventListener("change", fillGeometryFields);
  $("#applyGeometryButton").addEventListener("click", applyComponentGeometry);
  $("#physicalViewButton").addEventListener("click", () => {
    setUniformDeviceHeight(!uniformDeviceHeight);
  });
}

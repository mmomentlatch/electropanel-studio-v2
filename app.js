const STORAGE_KEY = "electropanel.v2.projects.v1";
const ACTIVE_KEY = "electropanel.v2.active-project.v1";
const HINT_KEY = "electropanel.v2.hint-dismissed.v1";
const PStore = PanelProjectStore;
const browserStorage = (() => { try { return window.localStorage; } catch { return null; } })();
let projectStorageState;
const MODULE_PX = 42;

const COMPONENTS = [
  { type: "main-2p", name: "Ввідний автомат", detail: "2P · C40 · 6 kA", category: "Захист", modules: 2, rating: "C40", phase: "L1", cable: "10", load: 0, accent: "#26343d", face: "main", photo: "mcb-1p.png", photoMode: "pole", photoScale: 1.52 },
  { type: "main-3p", name: "Ввідний автомат 3P", detail: "3P · C63 · 10 kA", category: "Захист", modules: 3, rating: "C63", phase: "3P", cable: "16", load: 0, accent: "#26343d", face: "main", photo: "mcb-1p.png", photoMode: "pole", photoScale: 1.52 },
  { type: "main-4p", name: "Ввідний автомат", detail: "4P · C63 · 10 kA", category: "Захист", modules: 4, rating: "C63", phase: "3P", cable: "16", load: 0, accent: "#26343d", face: "main", photo: "mcb-1p.png", photoMode: "pole", photoScale: 1.52 },
  { type: "mcb-1p", name: "Автоматичний вимикач", detail: "1P · B/C · 6 kA", category: "Захист", modules: 1, rating: "C16", phase: "L1", cable: "2.5", load: 2.2, accent: "#5b7281", face: "mcb", photo: "mcb-1p.png", photoMode: "pole", photoScale: 1.52 },
  { type: "mcb-2p", name: "Автоматичний вимикач", detail: "2P · C25 · 6 kA", category: "Захист", modules: 2, rating: "C25", phase: "L1", cable: "4", load: 4.5, accent: "#5b7281", face: "mcb", photo: "mcb-1p.png", photoMode: "pole", photoScale: 1.52 },
  { type: "rcbo", name: "Дифавтомат", detail: "1P+N · C16 · 30 mA", category: "Дифзахист", modules: 2, rating: "C16 / 30mA", phase: "L1", cable: "2.5", load: 2.2, accent: "#c58830", face: "rcd", photo: "rcbo.svg", photoScale: 1 },
  { type: "rcbo-afdd", name: "Дифавтомат + ПВДП", detail: "1P+N · B16 · A · 30 mA · AFDD", category: "Дифзахист", modules: 4, rating: "B16 / A / 30mA", phase: "L1", cable: "2.5", load: 2, accent: "#c58830", face: "rcd", photo: "rcbo-afdd.svg", photoScale: 1 },
  { type: "outgoing-terminal", name: "Клемник кола L/N/PE", detail: "L / N / PE · 3 затискачі", category: "Монтаж", modules: 2, rating: "L/N/PE", phase: "L1", cable: "2.5", load: 0, accent: "#de9f39", face: "contactor", photo: "terminal-block.png", photoMode: "pole", photoScale: 1.25 },
  { type: "rccb-2p", name: "ПЗВ", detail: "2P · 40 A · 30 mA", category: "Дифзахист", modules: 2, rating: "40A / 30mA", phase: "L1", cable: "6", load: 0, accent: "#2b96a6", face: "rcd", photo: "rccb-2p.svg", photoScale: 1 },
  { type: "rccb-4p", name: "ПЗВ", detail: "4P · 63 A · 30 mA", category: "Дифзахист", modules: 4, rating: "63A / 30mA", phase: "3P", cable: "10", load: 0, accent: "#2b96a6", face: "rcd", photo: "rccb-4p.svg", photoScale: 1 },
  { type: "spd-2p", name: "Обмежувач перенапруги", detail: "T2 · 2P · 20 kA", category: "Захист", modules: 2, rating: "T2 20kA", phase: "L1", cable: "6", load: 0, accent: "#6cab46", face: "spd", photo: "spd-2p.png", photoMode: "pair", photoScale: 1.25 },
  { type: "spd-4p", name: "Обмежувач перенапруги", detail: "T2 · 4P · 20 kA", category: "Захист", modules: 4, rating: "T2 20kA", phase: "3P", cable: "10", load: 0, accent: "#6cab46", face: "spd", photo: "spd-2p.png", photoMode: "pair", photoScale: 1.25 },
  { type: "contactor", name: "Модульний контактор", detail: "2P · 25 A · 230 V", category: "Керування", modules: 2, rating: "25A 230V", phase: "L1", cable: "2.5", load: 0, accent: "#b48d52", face: "contactor", photo: "contactor.png", photoScale: 1.26 },
  { type: "relay", name: "Реле напруги", detail: "1P · 40 A", category: "Керування", modules: 2, rating: "40A", phase: "L1", cable: "6", load: 0, accent: "#826aae", face: "meter", photo: "voltage-relay.png", photoScale: 1.26 },
  { type: "meter", name: "Лічильник енергії", detail: "1P · 40 A · Modbus", category: "Облік", modules: 2, rating: "40A", phase: "L1", cable: "6", load: 0, accent: "#668c62", face: "meter", photo: "energy-meter.png", photoScale: 1.26 },
  { type: "terminal", name: "Клемний блок", detail: "L/N/PE · 6 мм²", category: "Монтаж", modules: 1, rating: "6 мм²", phase: "N", cable: "6", load: 0, accent: "#de9f39", face: "contactor", photo: "terminal-block.png", photoScale: 1.4 },
  { type: "blank", name: "Заглушка", detail: "1 модуль", category: "Монтаж", modules: 1, rating: "1M", phase: "N", cable: "1.5", load: 0, accent: "#aab2b5", face: "blank" },
  ...ControlDevices.COMPONENTS,
];

const CATEGORY_LABELS = ["Усі", "Захист", "Дифзахист", "Керування", "Облік", "Монтаж"];
const PHASE_COLORS = { L1: "#80502c", L2: "#24282c", L3: "#8b9299", "3P": "#55636d", N: "#1976df", PE: "#24864b" };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));
const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const formatDate = (iso) => Number.isFinite(Date.parse(iso)) ? new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "дату не задано";

let projects = loadProjects();
let project = getInitialProject();
let selectedDeviceId = null;
let activeCategory = "Усі";
let zoom = 1;
let boardAutoFit = true;
let undoStack = [];
let redoStack = [];
let saveTimer = null;
let draggedDeviceId = null;

function sampleProject() {
  const now = new Date().toISOString();
  return {
    id: uid(),
    version: 2,
    name: "Щит квартири",
    createdAt: now,
    updatedAt: now,
    board: M.withCapacity({ name: "ЩК-1 · квартира", reserve: 20 }, 3, 18),
    devices: [
      makeDevice("main-4p", 0, 0, { label: "QF0", name: "Ввід", rating: "C40", phase: "3P" }),
      makeDevice("spd-2p", 0, 4, { label: "SPD1", name: "Захист від імпульсів" }),
      makeDevice("rccb-2p", 0, 6, { label: "QFD1", name: "Група освітлення" }),
      makeDevice("mcb-1p", 0, 8, { label: "QF1", name: "Освітлення", rating: "B10", phase: "L1", cable: "1.5", load: 0.8 }),
      makeDevice("mcb-1p", 0, 9, { label: "QF2", name: "Розетки кімнат", phase: "L2", load: 2.1 }),
      makeDevice("mcb-1p", 0, 10, { label: "QF3", name: "Розетки кухні", phase: "L3", load: 2.8 }),
      makeDevice("rcbo", 1, 0, { label: "QFD2", name: "Пральна машина", phase: "L1", load: 2.2 }),
      makeDevice("rcbo", 1, 2, { label: "QFD3", name: "Бойлер", phase: "L2", load: 2.0 }),
      makeDevice("rcbo", 1, 4, { label: "QFD4", name: "Посудомийна машина", phase: "L3", load: 1.8 }),
      makeDevice("mcb-2p", 1, 6, { label: "QF4", name: "Варильна поверхня", rating: "C25", phase: "L1", cable: "4", load: 5.5 }),
      makeDevice("relay", 2, 0, { label: "KV1", name: "Контроль напруги", phase: "L1" }),
      makeDevice("contactor", 2, 2, { label: "KM1", name: "Непріоритетне навантаження", phase: "L1" }),
    ],
  };
}

function makeDevice(type, row, slot, overrides = {}) {
  const component = COMPONENTS.find((item) => item.type === type) || COMPONENTS[0];
  return {
    ...clone(component.config || {}),
    id: uid(), type, geometryId: M.defaultProfile(type), row, slot,
    label: overrides.label || nextLabel(component),
    name: overrides.name || component.name,
    rating: overrides.rating ?? (ControlDevices.configFor(type) ? ControlDevices.rating({ type, ...component.config, rating: component.rating }) : component.rating),
    phase: overrides.phase ?? component.phase,
    cable: String(overrides.cable ?? component.cable),
    load: Number(overrides.load ?? component.load),
  };
}

function nextLabel(component) {
  const prefix = ControlDevices.prefix(component.type) || (["terminal", "outgoing-terminal"].includes(component.type) ? "XT" : component.type === "blank" ? "BL" : component.face === "rcd" ? "QFD" : component.face === "spd" ? "SPD" : component.face === "contactor" ? "KM" : component.face === "meter" ? "K" : "QF");
  let index = 1;
  while (project.devices.some((device) => device.label === `${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function loadProjects() {
  projectStorageState = PStore.load(browserStorage, E.normalizeProject);
  return projectStorageState.projects;
}

function getInitialProject() {
  const activeId = PStore.readString(browserStorage, ACTIVE_KEY);
  const existing = projects.find((item) => item.id === activeId) || projects[0];
  if (existing) return E.normalizeProject(existing);
  const starter = E.normalizeProject(sampleProject());
  projects = [clone(starter)];
  PStore.save(browserStorage, projectStorageState, projects, starter.id);
  return starter;
}

function persistProject({ immediate = false } = {}) {
  (project.consumers || []).filter((c) => c.deviceId).forEach((consumer) => {
    const device = project.devices.find((d) => d.id === consumer.deviceId);
    if (device) { if (!consumer.nameIndependent) consumer.name = device.name; consumer.phase = device.phase; }
  });
  (project.design?.circuits || []).forEach((circuit) => {
    if (circuit.outputKind !== "consumer") return;
    const device = project.devices.find((item) => item.id === circuit.deviceId);
    const consumer = project.consumers?.find((item) => item.id === circuit.outputId);
    if (device && consumer) {
      if (!consumer.nameIndependent) consumer.name = device.name;
      if (E.PHASES.includes(device.phase)) consumer.phase = device.phase;
    }
  });
  project.updatedAt = new Date().toISOString();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index >= 0) projects[index] = clone(project); else projects.unshift(clone(project));
  $("#saveStateText").textContent = "Збереження…";
  $(".save-state").classList.add("saving");
  clearTimeout(saveTimer);
  const save = () => {
    const result = PStore.save(browserStorage, projectStorageState, projects, project.id);
    $("#saveStateText").textContent = result.ok ? "Збережено локально" : "Зміни в пам’яті · експортуйте JSON";
    if (!result.ok) toast(result.conflict ? result.error : "Браузер не зміг зберегти проєкти. Зміни залишилися в цій вкладці; експортуйте JSON.", "error");
    $(".save-state").classList.remove("saving");
    return result.ok;
  };
  if (immediate) return save();
  saveTimer = setTimeout(save, 280); return true;
}

function snapshot() {
  undoStack.push(clone(project));
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

function undo() {
  cancelFloorInteractions(); cancelRouteDrag();
  const previous = undoStack.pop();
  if (!previous) return;
  redoStack.push(clone(project));
  project = previous;
  if (!project.floorPlan && $("#floorView").classList.contains("active")) switchView("board");
  selectedDeviceId = null;
  resetWiringSelection();
  persistProject({ immediate: true });
  renderAll();
}

function redo() {
  cancelFloorInteractions(); cancelRouteDrag();
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(clone(project));
  project = next;
  if (!project.floorPlan && $("#floorView").classList.contains("active")) switchView("board");
  selectedDeviceId = null;
  resetWiringSelection();
  persistProject({ immediate: true });
  renderAll();
}

function updateHistoryButtons() {
  $("#undoButton").disabled = undoStack.length === 0;
  $("#redoButton").disabled = redoStack.length === 0;
}

function renderAll() {
  renderProjectChrome();
  renderLibrary();
  renderBoard();
  renderInspector();
  renderDiagram();
  renderFloorPlan();
  renderBom();
  renderWireReport();
  renderWiringPalette();
  updateHistoryButtons();
}

function renderProjectChrome() {
  $("#projectTitle").textContent = project.name;
  $("#boardTitle").textContent = project.board.name || "ЩР-1";
  $("#boardSizeText").textContent = `${project.board.rows} × ${project.board.modulesPerRow} · ${project.board.rows * project.board.modulesPerRow} мод.`;
  const ip = $(".board-meta span:last-child");
  if (ip) ip.textContent = project.board.ip;
  $("#bomBadge").textContent = project.devices.length + project.busbars.length + project.combs.length + (project.board.enclosureId || project.board.dimensions ? 1 : 0);
  document.title = `${project.name} · ElectroPanel Studio 2`;
}

function renderLibrary() {
  const query = $("#librarySearch").value.trim().toLocaleLowerCase("uk");
  const filtered = COMPONENTS.filter((component) => {
    const categoryMatch = activeCategory === "Усі" || component.category === activeCategory;
    const searchMatch = !query || `${component.name} ${component.detail} ${component.category}`.toLocaleLowerCase("uk").includes(query);
    return categoryMatch && searchMatch;
  });
  $("#libraryCount").textContent = filtered.length;
  $("#categoryTabs").innerHTML = CATEGORY_LABELS.map((category) => `<button class="category-tab ${category === activeCategory ? "active" : ""}" type="button" data-category="${category}">${category}</button>`).join("");
  $("#componentList").innerHTML = filtered.length ? filtered.map((component) => `
    <article class="component-card" draggable="true" data-component-type="${component.type}" title="Перетягніть на DIN-рейку">
      <div class="component-preview type-${component.face} ${component.photo ? "has-photo" : ""}" style="--component-accent:${component.accent};--photo-scale:${component.photoScale || 1}">${component.photo ? `<img src="assets/devices/${component.photo}" alt="" loading="lazy" draggable="false" />` : ""}</div>
      <div class="component-copy"><strong>${component.name}</strong><span>${component.detail} · ${getComponent(component.type).modules} місць</span><small class="component-dimensions">${mmText(M.dimensions({ type: component.type, geometryId: M.defaultProfile(component.type) }))}${M.defaultProfile(component.type) ? " · каталог" : " · орієнтовно"}</small></div>
      <button class="add-component" type="button" data-add-component="${component.type}" aria-label="Додати ${component.name}">+</button>
    </article>`).join("") : `<div class="component-list-empty">Нічого не знайдено.<br>Спробуйте іншу назву або категорію.</div>`;

  $$("[data-category]").forEach((button) => button.addEventListener("click", () => { activeCategory = button.dataset.category; renderLibrary(); }));
  $$("[data-add-component]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); addComponent(button.dataset.addComponent); }));
  $$(".component-card").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/component-type", card.dataset.componentType);
      event.dataTransfer.effectAllowed = "copy";
      if (window.innerWidth <= 900) closeDrawers();
    });
    card.addEventListener("dragend", () => markWireDropTarget());
    card.addEventListener("dblclick", () => addComponent(card.dataset.componentType));
  });
}

function getComponent(deviceOrType, board = project.board) {
  const type = typeof deviceOrType === "string" ? deviceOrType : deviceOrType.type;
  const component = COMPONENTS.find((item) => item.type === type) || COMPONENTS[0];
  const device = typeof deviceOrType === "string" ? { type, geometryId: M.defaultProfile(type) } : deviceOrType;
  return { ...component, bodyModules: component.modules, modules: M.modulesFor(device, board) };
}

function renderBoard() {
  renderMechanicalBoard();
  document.documentElement.style.setProperty("--module", `${MODULE_PX}px`);
  const rows = [];
  for (let row = 0; row < project.board.rows; row += 1) {
    const used = project.devices.filter((device) => device.row === row).reduce((sum, device) => sum + getComponent(device).modules, 0) + project.busbars.filter((bar) => bar.zone === "din" && bar.row === row).reduce((sum, bar) => sum + E.busbarModules(bar, project.board), 0);
    const devices = project.devices.filter((device) => device.row === row).sort((a, b) => a.slot - b.slot);
    rows.push(`
      <div class="din-row-wrap" style="${rowGeometryStyle(row)}">
        <div class="rail-label"><span>DIN ${row + 1}</span><span>${used} / ${project.board.modulesPerRow} мод.</span></div>
        <div class="din-row" data-row="${row}" style="width:${project.board.modulesPerRow * MODULE_PX}px">
          ${Array.from({ length: project.board.modulesPerRow }, (_, slot) => `<span class="module-number" style="left:${slot * MODULE_PX}px">${slot + 1}</span>`).join("")}
          ${devices.map(deviceMarkup).join("")}
        </div>
      </div>`);
  }
  $("#dinRows").innerHTML = rows.join("");
  renderBusbars();
  renderConsumers();
  positionPhysicalBusbars();
  if (boardAutoFit) fitBoard(); else updateZoomLayout();

  $$(".din-row").forEach((rail) => {
    rail.addEventListener("dragover", (event) => { event.preventDefault(); rail.classList.add("drag-over"); event.dataTransfer.dropEffect = draggedDeviceId ? "move" : "copy"; });
    rail.addEventListener("dragleave", () => rail.classList.remove("drag-over"));
    rail.addEventListener("drop", handleRailDrop);
  });
  $$(".board-device").forEach((node) => {
    node.addEventListener("click", (event) => { event.stopPropagation(); chooseDevice(node.dataset.deviceId); });
    node.addEventListener("dragstart", (event) => {
      draggedDeviceId = node.dataset.deviceId;
      node.classList.add("dragging");
      event.dataTransfer.setData("text/device-id", draggedDeviceId);
      event.dataTransfer.effectAllowed = "move";
    });
    node.addEventListener("dragend", () => { draggedDeviceId = null; node.classList.remove("dragging"); $$(".din-row").forEach((rail) => rail.classList.remove("drag-over")); });
  });
}

function chooseDevice(deviceId) {
  selectedDeviceId = deviceId;
  selectedWireId = selectedBusbarId = selectedCombId = null;
  renderBoard();
  renderInspector();
  renderWiringPalette();
}

function deviceMarkup(device) {
  const component = getComponent(device);
  const selected = selectedDeviceId === device.id ? "selected" : "";
  const photoClass = component.photo ? "photo-device" : "";
  return `<button class="board-device type-${component.face} ${photoClass} ${selected}" draggable="true" type="button" aria-pressed="${selectedDeviceId === device.id}" data-device-id="${escapeHtml(device.id)}" style="${deviceGeometryStyle(device)};--device-accent:${component.accent};--phase-color:${PHASE_COLORS[device.phase] || PHASE_COLORS.N};--photo-scale:${component.photoScale || 1.25}" title="${escapeHtml(device.label)} · ${escapeHtml(device.name)} · ${mmText(M.dimensions(device))}">
    ${component.photo ? devicePhotoMarkup(device, component) : `
    <div class="device-stripe"></div>
    <div class="device-face">
      <div class="device-top">${escapeHtml(device.label)}<small>${escapeHtml(device.rating)}</small></div>
      <div class="device-control"><span class="toggle-lever"></span></div>
      <div class="device-bottom"><span>${escapeHtml(shortName(device.name, component.modules))}</span><em></em></div>
      ${component.modules > 1 ? `<span class="device-width-badge">${component.modules}M</span>` : ""}
    </div>`}
  </button>`;
}

function devicePhotoMarkup(device, component) {
  const bodyModules = component.bodyModules || component.modules;
  const copies = component.photoMode === "pole" ? bodyModules : component.photoMode === "pair" ? Math.max(1, Math.ceil(bodyModules / 2)) : 1;
  const images = Array.from({ length: copies }, () => `<img src="assets/devices/${component.photo}" alt="" draggable="false" />`).join("");
  return `<div class="device-photo-layer">${images}</div>
    ${device.type === "main-3p" ? '<span class="three-pole-link" aria-hidden="true"></span>' : ""}
    <div class="device-photo-overlay">
      <span class="device-ident"><strong>${escapeHtml(device.label)}</strong><small>${escapeHtml(device.rating)}</small></span>
      <span class="device-circuit-label">${escapeHtml(shortName(device.name, component.modules))}</span>
      <i class="device-phase-indicator"></i>
    </div>`;
}

function shortName(name, modules) {
  const limit = modules === 1 ? 6 : modules === 2 ? 14 : 24;
  return name.length > limit ? `${name.slice(0, limit - 1)}…` : name;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function handleRailDrop(event) {
  event.preventDefault();
  const rail = event.currentTarget;
  rail.classList.remove("drag-over");
  const row = Number(rail.dataset.row);
  const rect = rail.getBoundingClientRect();
  const unscaledX = (event.clientX - rect.left) / zoom;
  const slot = Math.max(0, Math.min(project.board.modulesPerRow - 1, Math.floor(unscaledX / MODULE_PX)));
  const deviceId = event.dataTransfer.getData("text/device-id");
  const componentType = event.dataTransfer.getData("text/component-type");
  if (deviceId) moveDevice(deviceId, row, slot);
  else if (componentType && selectedWireId) insertComponentAtWire(componentType, selectedWireId, surfacePoint(event.clientX, event.clientY));
  else if (componentType) addComponent(componentType, row, slot);
}

function isSpaceFree(row, slot, modules, ignoredId = null) {
  if (row < 0 || row >= project.board.rows || slot < 0 || slot + modules > project.board.modulesPerRow) return false;
  const deviceConflict = project.devices.some((device) => {
    if (device.id === ignoredId || device.row !== row) return false;
    const width = getComponent(device).modules;
    return slot < device.slot + width && slot + modules > device.slot;
  });
  return !deviceConflict && !project.busbars.some((bar) => bar.id !== ignoredId && bar.zone === "din" && bar.row === row && slot < bar.slot + E.busbarModules(bar, project.board) && slot + modules > bar.slot);
}

function findFirstSpace(modules) {
  for (let row = 0; row < project.board.rows; row += 1) {
    for (let slot = 0; slot <= project.board.modulesPerRow - modules; slot += 1) {
      if (isSpaceFree(row, slot, modules)) return { row, slot };
    }
  }
  return null;
}

function nearestFreeSpace(row, preferredSlot, modules, ignoredId = null) {
  const candidates = [];
  for (let distance = 0; distance < project.board.modulesPerRow; distance += 1) {
    candidates.push(preferredSlot + distance, preferredSlot - distance);
  }
  for (const slot of [...new Set(candidates)]) if (isSpaceFree(row, slot, modules, ignoredId)) return { row, slot };
  for (let otherRow = 0; otherRow < project.board.rows; otherRow += 1) {
    for (let slot = 0; slot <= project.board.modulesPerRow - modules; slot += 1) if (isSpaceFree(otherRow, slot, modules, ignoredId)) return { row: otherRow, slot };
  }
  return null;
}

function addComponent(type, row = null, slot = null) {
  if (selectedWireId) return insertComponentAtWire(type, selectedWireId);
  const component = getComponent(type);
  let target = row === null ? findFirstSpace(component.modules) : nearestFreeSpace(row, Math.min(slot, project.board.modulesPerRow - component.modules), component.modules);
  if (!target) return toast("У щиті немає вільного місця для цього пристрою", "error");
  const device = makeDevice(type, target.row, target.slot);
  const error = M.checks({ ...project, devices: [...project.devices, device] }).find((issue) => issue.level === "error");
  if (error) return toast(error.text, "error");
  snapshot();
  project.devices.push(device);
  resetWiringSelection();
  selectedDeviceId = device.id;
  persistProject();
  renderAll();
  toast(`${component.name} додано на DIN ${target.row + 1}`);
}

function nearestSpaceAtPoint(modules, point, ignoredId = null) {
  const surface = $("#wiringSurface").getBoundingClientRect();
  const candidates = [];
  $$(".din-row").forEach((rail) => {
    const row = Number(rail.dataset.row), rect = rail.getBoundingClientRect();
    for (let slot = 0; slot <= project.board.modulesPerRow - modules; slot += 1) {
      if (!isSpaceFree(row, slot, modules, ignoredId)) continue;
      const x = (rect.left - surface.left) / zoom + (slot + modules / 2) * MODULE_PX;
      const y = (rect.top - surface.top + rect.height / 2) / zoom;
      candidates.push({ row, slot, distance: (x - point.x) ** 2 + (y - point.y) ** 2 });
    }
  });
  return candidates.sort((a, b) => a.distance - b.distance || a.row - b.row || a.slot - b.slot)[0] || null;
}

function insertComponentAtWire(type, wireId, point = null, existingId = null) {
  try {
    if (!$("#boardView").classList.contains("active")) switchView("board");
    const existing = project.devices.find((device) => device.id === existingId);
    const component = getComponent(existing || type);
    const anchor = point || wireInsertionPoint || wireMidpoint(wireId);
    const target = nearestSpaceAtPoint(component.modules, anchor, existingId);
    if (!target) throw new Error("У щиті немає вільного місця для цього пристрою");
    const device = existing ? { ...clone(existing), row: target.row, slot: target.slot } : makeDevice(type, target.row, target.slot, { load: 0 });
    const originalWire = project.wires.find((wire) => wire.id === wireId), originalLabel = originalWire?.label;
    const result = E.insertDeviceInWire(project, wireId, device);
    const error = M.checks(result.project).find((issue) => issue.level === "error");
    if (error) throw new Error(error.text);
    snapshot(); project = result.project;
    resetWiringSelection(); selectedDeviceId = device.id;
    persistProject(); renderAll();
    const pairLabels = result.pair.map((portId) => E.deviceTerminals(result.device).find((port) => port.portId === portId)?.label || portId);
    toast(`${device.label} вставлено в ${originalLabel} через ${pairLabels.join(" → ")}, DIN ${target.row + 1}. Інші полюси й живлення підключаються окремо.${originalWire?.lengthM ? " Уточніть довжини двох нових відрізків проводу." : ""}`);
  } catch (error) { toast(error.message, "error"); }
}

function moveDevice(id, row, slot) {
  const device = project.devices.find((item) => item.id === id);
  if (!device) return;
  const component = getComponent(device);
  if (row !== device.row && project.combs.some((comb) => comb.terminals.some((ref) => ref.ownerId === id))) return toast("Апарат входить до гребінки. Переміщуйте його по цій рейці або спершу приберіть гребінку.", "error");
  const target = nearestFreeSpace(row, Math.min(slot, project.board.modulesPerRow - component.modules), component.modules, id);
  if (!target) return toast("Немає вільного місця для переміщення", "error");
  if (target.row === device.row && target.slot === device.slot) return;
  const candidate = clone(project);
  Object.assign(candidate.devices.find((item) => item.id === id), target);
  const error = M.checks(candidate).find((issue) => issue.level === "error");
  if (error) return toast(error.text, "error");
  snapshot();
  device.row = target.row;
  device.slot = target.slot;
  persistProject();
  renderAll();
}

function deleteSelectedDevice() {
  if (!selectedDeviceId) return;
  snapshot();
  project = E.removeEntity(project, "device", selectedDeviceId);
  selectedDeviceId = null;
  resetWiringSelection();
  persistProject();
  renderAll();
  toast("Компонент видалено");
}

function projectPhaseCount() {
  const configured = Number(project.design?.supply?.phases ?? project.board.phases);
  if ([1, 3].includes(configured)) return configured;
  const incoming = project.devices.find((device) => device.type.startsWith("main-"));
  if (incoming) return /-[34]p$/.test(incoming.type) ? 3 : 1;
  return project.devices.some((device) => ["3P", "L2", "L3"].includes(device.phase)) ? 3 : 1;
}

function renderInspector() {
  const totalModules = project.board.rows * project.board.modulesPerRow;
  const usedModules = project.devices.reduce((sum, device) => sum + getComponent(device).modules, 0) + project.busbars.filter((bar) => bar.zone === "din").reduce((sum, bar) => sum + E.busbarModules(bar, project.board), 0);
  const totalLoad = project.devices.reduce((sum, device) => sum + Number(device.load || 0), 0);
  $("#usedModulesMetric").innerHTML = `${usedModules}<small>/${totalModules}</small>`;
  $("#modulesProgress").style.width = `${Math.min(100, (usedModules / totalModules) * 100)}%`;
  $("#loadMetric").innerHTML = `${number(totalLoad)}<small>кВт</small>`;

  const phases = { L1: 0, L2: 0, L3: 0 };
  project.devices.forEach((device) => {
    const load = Number(device.load || 0);
    if (device.phase === "3P") { phases.L1 += load / 3; phases.L2 += load / 3; phases.L3 += load / 3; }
    else if (phases[device.phase] !== undefined) phases[device.phase] += load;
  });
  const maxPhase = Math.max(...Object.values(phases), 1);
  Object.entries(phases).forEach(([phase, value]) => {
    $(`#phase${phase}Bar`).style.width = `${(value / maxPhase) * 100}%`;
    $(`#phase${phase}Value`).textContent = `${number(value)} кВт`;
  });
  const values = Object.values(phases);
  const imbalance = Math.max(...values) - Math.min(...values);
  const phaseCount = projectPhaseCount();
  $(".phase-balance").classList.toggle("hidden", phaseCount === 1);
  $("#balanceText").textContent = phaseCount === 1 ? "однофазний ввід" : imbalance <= 1 ? "добрий баланс" : `перекіс ${number(imbalance)} кВт`;

  const checks = [...validateProject(usedModules, totalModules, phases, phaseCount), ...wiringChecks(), ...M.checks(project).filter((issue) => issue.level === "error").map((issue) => ({ level: "error", title: "Габарити й місце", text: issue.text }))];
  const warnings = checks.filter((check) => check.level !== "success").length;
  $("#projectStatus").className = `status-pill ${warnings ? "warning" : "success"}`;
  $("#projectStatus").setAttribute("aria-controls", "projectCheckSection");
  $("#projectStatus").innerHTML = `<i></i> ${warnings ? `${warnings} зауваж.` : "Базові перевірки"}`;
  $("#checkCount").textContent = checks.length;
  $("#checkList").innerHTML = checks.map((check) => `<article class="check-item ${check.level}"><span class="check-icon">${check.level === "success" ? "✓" : "!"}</span><div class="check-copy"><strong>${escapeHtml(check.title)}</strong><span>${escapeHtml(check.text)}</span></div></article>`).join("");

  const device = project.devices.find((item) => item.id === selectedDeviceId);
  $("#deviceInspector").classList.toggle("hidden", !device);
  $("#replaceAfddButton").classList.toggle("hidden", device?.type !== "rcbo-afdd");
  const consumer = device && E.consumerForDevice(project, device.id), consumerButton = $("#addConsumerButton");
  consumerButton.classList.toggle("hidden", !E.canAddConsumer(device));
  consumerButton.disabled = Boolean(consumer);
  consumerButton.textContent = consumer ? "Споживача додано" : "Додати споживача";
  $("#consumerNameField").classList.toggle("hidden", !consumer);
  $("#consumerNameInput").value = consumer?.name || "";
  $("#addConsumerHelp").classList.toggle("hidden", !E.canAddConsumer(device));
  if (device) {
    const component = getComponent(device);
    $("#inspectorDeviceName").textContent = component.name;
    $("#deviceLabelInput").value = device.label;
    $("#deviceNameInput").value = device.name;
    $("#deviceRatingInput").value = device.rating;
    $("#devicePhaseInput").innerHTML = (/-[34]p$/.test(device.type) ? ["3P"] : device.type === "terminal" ? ["L1", "L2", "L3", "N", "PE"] : ["L1", "L2", "L3"]).map((phase) => `<option>${phase}</option>`).join("") + (device.phase === "3P" && !/-[34]p$/.test(device.type) ? '<option value="3P" disabled>3P · перевірте модель</option>' : "");
    $("#devicePhaseInput").value = device.phase;
    $("#deviceLoadInput").value = device.load;
    $("#deviceCableInput").value = device.cable;
    $("#deviceLocation").textContent = `DIN ${device.row + 1} · модулі ${device.slot + 1}–${device.slot + component.modules}`;
  }
  renderWiringInspector();
  renderControlInspector();
  renderDesignReport();
  renderGeometryInspector();
  renderMechanicalSummary();
}

function validateProject(used, total, phases, phaseCount = projectPhaseCount()) {
  const checks = [];
  const hasMain = project.devices.some((device) => getComponent(device).face === "main");
  checks.push(hasMain ? { level: "success", title: "Ввідний захист", text: "У проєкті присутній ввідний автомат." } : { level: "error", title: "Немає ввідного автомата", text: "Додайте ввідний захисний апарат." });
  const reserve = ((total - used) / total) * 100;
  checks.push(reserve >= project.board.reserve ? { level: "success", title: "Резерв модулів", text: `Вільно ${total - used} мод. (${Math.round(reserve)}%).` } : { level: "warning", title: "Малий резерв", text: `Залишилось ${total - used} мод.; задано резерв ${project.board.reserve}%.` });
  const diffCount = project.devices.filter((device) => ["rcd", "rcbo"].includes(getComponent(device).face) || device.type.startsWith("rccb")).length;
  checks.push(diffCount ? { level: "success", title: "Диференційний захист", text: `Встановлено пристроїв: ${diffCount}.` } : { level: "warning", title: "Немає дифзахисту", text: "Перевірте необхідність ПЗВ або дифавтоматів." });
  const phaseValues = Object.values(phases);
  const imbalance = Math.max(...phaseValues) - Math.min(...phaseValues);
  if (phaseCount === 3) checks.push(imbalance <= 1 ? { level: "success", title: "Баланс фаз", text: "Навантаження розподілене рівномірно." } : { level: "warning", title: "Перекіс фаз", text: `Різниця між фазами ≈ ${number(imbalance)} кВт.` });
  return checks;
}

function bindInspectorInputs() {
  $("#consumerNameInput").addEventListener("change", (event) => {
    const consumer = E.consumerForDevice(project, selectedDeviceId); if (!consumer) return;
    try { const next = E.renameConsumer(project, consumer.id, event.target.value); snapshot(); project = next; persistProject(); renderAll(); }
    catch (error) { toast(error.message, "error"); renderInspector(); }
  });
  $("#addConsumerButton").addEventListener("click", () => {
    try {
      const result = E.addConsumer(project, selectedDeviceId); if (!result.created) return;
      snapshot(); project = result.project; resetWiringSelection(); persistProject(); renderAll(); setWiringMode(true); closeDrawers();
      toast("Споживача додано під апаратом. Натисніть вихідну клему апарата, потім клему споживача, щоб провести провід.");
    } catch (error) { toast(error.message, "error"); }
  });
  const bindings = [
    ["#deviceLabelInput", "label", (value) => value],
    ["#deviceNameInput", "name", (value) => value],
    ["#deviceRatingInput", "rating", (value) => value],
    ["#devicePhaseInput", "phase", (value) => value],
    ["#deviceLoadInput", "load", (value) => value.trim() === "" ? null : Number(value)],
    ["#deviceCableInput", "cable", (value) => value],
  ];
  bindings.forEach(([selector, key, normalize]) => {
    $(selector).addEventListener("change", (event) => {
      const device = project.devices.find((item) => item.id === selectedDeviceId);
      if (!device) return;
      snapshot();
      device[key] = normalize(event.target.value);
      if (project.design?.supply) project.design.supply.dataConfirmed = false;
      persistProject();
      renderBoard();
      renderInspector();
      renderDiagram();
      renderBom();
      renderWireReport();
    });
  });
}

function renderDiagram() {
  renderConnectedDiagram();
}

function getBomRows() {
  const grouped = new Map();
  project.devices.forEach((device) => {
    const component = getComponent(device);
    const d = M.dimensions(device);
    const key = `${device.type}|${device.rating}|${device.geometryId || ""}|${JSON.stringify(device.dimensions || {})}`;
    if (!grouped.has(key)) grouped.set(key, { component: { ...component, name: `${component.name} · ${d.model} · ${mmText(d)}${d.verified ? "" : " (орієнтовно)"}` }, rating: device.rating, count: 0 });
    grouped.get(key).count += 1;
  });
  project.busbars.forEach((bar) => {
    const key = `bar|${bar.potential}|${bar.terminals}|${bar.ratedCurrent || ""}|${JSON.stringify(bar.dimensions || {})}`;
    const dimensions = bar.dimensions ? ` · ${bar.dimensions.model || "Власна модель"} · ${mmText(bar.dimensions)}` : " · габарити не задано";
    if (!grouped.has(key)) grouped.set(key, { component: { name: `Шина ${bar.potential}, ${bar.terminals} клем${dimensions}`, category: "Монтаж", modules: bar.zone === "din" ? E.busbarModules(bar, project.board) : 0 }, rating: bar.ratedCurrent ? `${bar.ratedCurrent} А` : "Номінал не задано", count: 0 });
    grouped.get(key).count += 1;
  });
  project.combs.forEach((comb) => {
    const key = `comb|${comb.potential}|${comb.terminals.length}|${comb.ratedCurrent || ""}`;
    if (!grouped.has(key)) grouped.set(key, { component: { name: `Гребінка ${comb.potential}, ${comb.terminals.length} контактів`, category: "Монтаж", modules: 0 }, rating: comb.ratedCurrent ? `${comb.ratedCurrent} А` : "Номінал не задано", count: 0 });
    grouped.get(key).count += 1;
  });
  project.wires.forEach((wire) => {
    const key = `wire|${wire.material}|${wire.section}|${wire.color}`;
    if (!grouped.has(key)) grouped.set(key, { component: { name: `Провід ${wire.material} ${wire.section} мм²`, category: "Проводи · відрізки", modules: 0 }, rating: E.COLORS[wire.color]?.label || wire.color, count: 0 });
    grouped.get(key).count += 1;
  });
  if (project.board.enclosureId || project.board.dimensions) {
    const b = M.boardGeometry(project.board);
    grouped.set("enclosure", { component: { name: `${b.model} · ${mmText(b)}`, category: "Корпус", modules: 0 }, rating: `${project.board.rows}×${project.board.modulesPerRow} · ${project.board.ip}`, count: 1 });
  }
  return [...grouped.values()].sort((a, b) => a.component.category.localeCompare(b.component.category, "uk") || a.component.name.localeCompare(b.component.name, "uk"));
}

function renderBom() {
  const rows = getBomRows();
  const totalModules = project.devices.reduce((sum, device) => sum + getComponent(device).modules, 0);
  const categories = new Set(project.devices.map((device) => getComponent(device).category)).size;
  $("#bomSummary").innerHTML = `
    <article class="bom-summary-card"><span>Апаратів / шин / корпусів</span><strong>${project.devices.length + project.busbars.length + project.combs.length + (project.board.enclosureId || project.board.dimensions ? 1 : 0)}</strong></article>
    <article class="bom-summary-card"><span>Унікальних типів</span><strong>${rows.length}</strong></article>
    <article class="bom-summary-card"><span>Зайнято місця</span><strong>${totalModules}<small>мод.</small></strong></article>`;
  $("#bomTableBody").innerHTML = rows.map((row, index) => `<tr><td>${String(index + 1).padStart(2, "0")}</td><td><strong>${escapeHtml(row.component.name)}</strong><br><small>${escapeHtml(row.component.category)}</small></td><td>${escapeHtml(row.rating)}</td><td>${row.component.modules || "—"}</td><td>${row.count}</td></tr>`).join("");
  $("#bomEmpty").classList.toggle("hidden", rows.length > 0);
  $(".bom-table").classList.toggle("hidden", rows.length === 0);
  renderBomCables();
  void categories;
}

function number(value) {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 }).format(value);
}

function switchView(view) {
  if (view !== "floor") cancelFloorInteractions();
  if (view !== "board") { cancelRouteDrag(); cancelPendingWire(false); }
  document.body.classList.toggle("floor-mode", view === "floor");
  document.body.classList.toggle("report-mode", ["bom", "wires", "design"].includes(view));
  document.body.classList.toggle("diagram-mode", view === "diagram");
  document.body.classList.toggle("diagram-expanded", view === "diagram" && schematicExpanded);
  $$(".view-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  $$('[data-view-panel]').forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === view));
  $("#canvasToolbar").classList.toggle("hidden", view !== "board");
  $(".editor-area").classList.toggle("document-mode", view !== "board");
  if (view === "floor") { ensureFloorPlan(); renderFloorPlan(); }
  if (view === "diagram") renderDiagram();
  if (view === "bom") renderBom();
  if (view === "wires") renderWireReport();
  if (view === "design") renderDesignReport();
  if (view === "board") requestAnimationFrame(() => { updateZoomLayout(); scheduleWiringPaint(); });
}

function openProjectIssues() {
  if (D.calculate(project)) {
    closeDrawers(); switchView("design");
    const section = $("#designIssues");
    section.scrollIntoView({ block: "start" }); section.focus({ preventScroll: true });
  } else {
    switchView("board");
    if (window.innerWidth <= 900 && !$(".inspector-panel").classList.contains("drawer-open")) toggleDrawer("inspector");
    const section = $("#projectCheckSection");
    section.scrollIntoView({ block: "start" }); section.focus({ preventScroll: true });
  }
}

function setZoom(next, autoFit = false) {
  if (!Number.isFinite(next) || autoFit && next <= 0) return;
  boardAutoFit = autoFit;
  zoom = autoFit ? next : Math.max(.01, Math.min(1.65, next));
  updateZoomLayout();
  scheduleWiringPaint();
}

function updateZoomLayout() {
  const board = $("#boardShell");
  const native = boardSceneSize(), size = PanelViewport.atScale(native.width, native.height, zoom);
  if (!size) return;
  $("#boardScaleFrame").style.width = `${size.width}px`;
  $("#boardScaleFrame").style.height = `${size.height}px`;
  board.style.transform = `scale(${zoom})`;
  $("#zoomValue").textContent = `${Math.round(zoom * 100)}%`;
}

function boardSceneSize() {
  const board = $("#boardShell"), style = getComputedStyle(board);
  return { width: parseFloat(style.width) || board.offsetWidth, height: parseFloat(style.height) || board.offsetHeight };
}

function fitBoard() {
  const canvas = $("#canvas");
  if (!$("#boardView").classList.contains("active")) return;
  const native = boardSceneSize(), padding = getComputedStyle($("#canvasStage"));
  const availableWidth = canvas.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight) - 2;
  const availableHeight = canvas.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom) - 2;
  const size = PanelViewport.fit(native.width, native.height, availableWidth, availableHeight);
  if (!size) return;
  setZoom(size.scale, true);
  canvas.scrollLeft = 0; canvas.scrollTop = 0;
}

function openModal(id) { cancelFloorInteractions(); cancelRouteDrag(); $(id).classList.remove("hidden"); }
function closeModal(node) { node.closest(".modal-backdrop")?.classList.add("hidden"); }

function renderProjectList() {
  $("#projectList").innerHTML = projects.map((item) => {
    const moduleCount = item.devices.reduce((sum, device) => sum + getComponent(device, item.board).modules, 0);
    return `<article class="project-row">
      <div class="project-thumb"><svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h8"/></svg></div>
      <div class="project-copy"><strong>${escapeHtml(item.name)}</strong><span>${moduleCount} мод. · ${formatDate(item.updatedAt)}</span></div>
      <div class="project-row-actions">
        <button type="button" data-open-project="${escapeHtml(item.id)}">${item.id === project.id ? "Відкрито" : "Відкрити"}</button>
        <button type="button" data-duplicate-project="${escapeHtml(item.id)}">Копія</button>
        ${projects.length > 1 ? `<button class="danger-text" type="button" data-delete-project="${escapeHtml(item.id)}">У кошик</button>` : ""}
      </div>
    </article>`;
  }).join("");
  $$("[data-open-project]").forEach((button) => button.addEventListener("click", () => openProject(button.dataset.openProject)));
  $$("[data-duplicate-project]").forEach((button) => button.addEventListener("click", () => duplicateProject(button.dataset.duplicateProject)));
  $$("[data-delete-project]").forEach((button) => button.addEventListener("click", () => deleteProject(button.dataset.deleteProject)));
  $("#projectTrashCount").textContent = projectStorageState.trash.length;
  $("#projectTrashList").innerHTML = projectStorageState.trash.map((item) => `<article class="project-row"><div class="project-copy"><strong>${escapeHtml(item.name)}</strong><span>У кошику · ${formatDate(item.deletedAt)}</span></div><button type="button" class="button ghost" data-restore-project="${escapeHtml(item.id)}">Відновити</button></article>`).join("") || '<p class="project-storage-note">Кошик порожній.</p>';
  $$("[data-restore-project]").forEach((button) => button.addEventListener("click", () => restoreProject(button.dataset.restoreProject)));
  const recovery = projectStorageState.rejected.length || projectStorageState.malformedRaw !== null || PStore.readString(browserStorage, PStore.RECOVERY_KEY);
  $("#projectRecovery").classList.toggle("hidden", !recovery);
  $("#projectRecoveryText").textContent = projectStorageState.rejected.length ? `${projectStorageState.rejected.length} записів не вдалося відкрити. Оригінали збережено; здорові проєкти доступні.` : "Оригінал пошкодженого сховища збережено для відновлення.";
}

function restoreProject(id) {
  try { const result = PStore.restore(projects, projectStorageState.trash, id); projects = result.projects; projectStorageState.trash = result.trash; persistProject({ immediate: true }); renderProjectList(); toast("Проєкт відновлено з кошика"); }
  catch (error) { toast(error.message, "error"); }
}
function exportProjectRecovery() {
  const backupKey = PStore.readString(browserStorage, PStore.RECOVERY_KEY);
  downloadBlob(JSON.stringify({ format: "electropanel-recovery", rejected: projectStorageState.rejected, original: projectStorageState.malformedRaw ?? (backupKey ? PStore.readString(browserStorage, backupKey) : null) }, null, 2), "electropanel-recovery.json", "application/json");
}

function newProject() {
  openTemplateChooser();
}

function newEmptyProject() {
  const now = new Date().toISOString();
  persistProject({ immediate: true });
  const created = E.normalizeProject({ id: uid(), version: 2, name: `Новий проєкт ${projects.length + 1}`, createdAt: now, updatedAt: now, board: M.withCapacity({ name: "ЩР-1", reserve: 20 }, 3, 18), devices: [] });
  projects.unshift(clone(created));
  project = created;
  selectedDeviceId = null;
  resetWiringSelection();
  setWiringMode(false);
  undoStack = [];
  redoStack = [];
  persistProject({ immediate: true });
  $$(".modal-backdrop").forEach((modal) => modal.classList.add("hidden"));
  switchView("board");
  renderAll();
  toast("Створено новий локальний проєкт");
}

function openProject(id) {
  cancelFloorInteractions();
  persistProject({ immediate: true });
  const found = projects.find((item) => item.id === id);
  if (!found) return;
  project = E.normalizeProject(found);
  selectedDeviceId = null;
  resetWiringSelection();
  undoStack = [];
  redoStack = [];
  PStore.writeString(browserStorage, ACTIVE_KEY, project.id);
  $("#projectModal").classList.add("hidden");
  if ($("#floorView").classList.contains("active")) ensureFloorPlan();
  renderAll();
}

function duplicateProject(id) {
  const source = projects.find((item) => item.id === id);
  if (!source) return;
  persistProject({ immediate: true });
  const copy = E.cloneProject(source);
  copy.name = `${copy.name} · копія`;
  copy.createdAt = copy.updatedAt = new Date().toISOString();
  projects.unshift(copy);
  persistProject({ immediate: true });
  renderProjectList();
  toast("Копію проєкту створено");
}

function deleteProject(id) {
  persistProject({ immediate: true });
  let archived;
  try { archived = PStore.archive(projects, projectStorageState.trash, id); } catch (error) { return toast(error.message, "error"); }
  if (id === project.id) {
    const fallback = projects.find((item) => item.id !== id);
    if (!fallback) return;
    project = E.normalizeProject(fallback);
    selectedDeviceId = null;
    resetWiringSelection();
    undoStack = [];
    redoStack = [];
  }
  projects = archived.projects; projectStorageState.trash = archived.trash;
  if ($("#floorView").classList.contains("active")) ensureFloorPlan();
  persistProject({ immediate: true });
  renderProjectList();
  renderAll();
  toast("Проєкт перенесено в кошик. Його можна відновити у «Мої проєкти».");
}

function exportProject() {
  const payload = JSON.stringify({ format: "electropanel-project", exportedAt: new Date().toISOString(), project }, null, 2);
  downloadBlob(payload, `${slugify(project.name)}.electropanel.json`, "application/json");
  toast("Файл проєкту експортовано");
}

function importProject(file) {
  if (file.size > 10 * 1024 * 1024) return toast("Файл проєкту перевищує 10 МБ. Перевірте, чи обрано JSON проєкту.", "error");
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const imported = E.cloneProject(parsed.project || parsed);
      imported.name = `${imported.name || "Імпортований проєкт"} · імпорт`;
      imported.createdAt = imported.updatedAt = new Date().toISOString();
      projects.unshift(imported);
      project = clone(imported);
      selectedDeviceId = null;
      resetWiringSelection();
      undoStack = [];
      redoStack = [];
      persistProject({ immediate: true });
      $("#projectModal").classList.add("hidden");
      if ($("#floorView").classList.contains("active")) ensureFloorPlan();
      renderAll();
      toast("Проєкт успішно імпортовано");
    } catch (error) {
      toast(`Не вдалося прочитати файл: ${error.message}`, "error");
    }
  };
  reader.onerror = () => toast("Не вдалося прочитати файл. Спробуйте відкрити його повторно.", "error");
  reader.readAsText(file);
}

function exportCsv() {
  const rows = [["Поз.", "Найменування", "Категорія", "Параметри", "Модулі", "Кількість"]];
  getBomRows().forEach((row, index) => rows.push([index + 1, row.component.name, row.component.category, row.rating, row.component.modules, row.count]));
  rows.push(...Cables.csvRows(Cables.calculate(project), E.COLORS));
  const csv = csvContent(rows);
  downloadBlob(csv, `${slugify(project.name)}-bom.csv`, "text/csv;charset=utf-8");
  toast("Специфікацію CSV сформовано");
}

function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(value) {
  return value.toLocaleLowerCase("uk").replace(/[^a-zа-яіїєґ0-9]+/giu, "-").replace(/(^-|-$)/g, "") || "electropanel-project";
}

function applyBoardSettings() {
  try {
  const nextBoard = {
    ...clone(project.board),
    name: $("#boardNameInput").value.trim() || "ЩР-1",
    rows: Number($("#boardRowsInput").value),
    modulesPerRow: Number($("#boardModulesInput").value),
    ip: $("#boardIpInput").value,
    reserve: Math.max(0, Math.min(50, Number($("#boardReserveInput").value) || 0)),
    earthing: $("#boardEarthingInput").value,
    penSplit: $("#boardEarthingInput").value === "TN-C-S" && $("#boardPenSplitInput").checked,
  };
  if (project.busbars.some((bar) => bar.potential === "PEN") && !nextBoard.penSplit) {
    toast("Спершу приберіть PEN-шину або залиште точку поділу PEN у TN-C-S.", "error"); return false;
  }
  const draft = clone(project);
  draft.board = readMechanicalBoard(nextBoard);
  const candidate = E.normalizeProject(M.repack(draft));
  if (E.validate(candidate).some((issue) => issue.code === "comb-potential")) {
    toast("Цей розмір розділить апарати однієї гребінки між рейками. Спершу змініть гребінку.", "error"); return false;
  }
  snapshot();
  project = candidate;
  selectedDeviceId = project.devices.some((device) => device.id === selectedDeviceId) ? selectedDeviceId : null;
  persistProject();
  $("#settingsModal").classList.add("hidden");
  renderAll();
  setTimeout(fitBoard, 0);
  toast("Параметри щита оновлено");
  return true;
  } catch (error) { toast(error.message, "error"); return false; }
}

function openBoardSettings() {
  $("#boardNameInput").value = project.board.name || "ЩР-1";
  $("#boardRowsInput").value = project.board.rows;
  $("#boardModulesInput").value = project.board.modulesPerRow;
  $("#boardIpInput").value = project.board.ip;
  $("#boardReserveInput").value = project.board.reserve;
  $("#boardEarthingInput").value = project.board.earthing;
  $("#boardPenSplitInput").checked = project.board.penSplit;
  prepareMechanicalBoardForm();
  openModal("#settingsModal");
}

function toast(message, type = "success") {
  const node = document.createElement("div");
  node.className = `toast ${type}`;
  node.textContent = message;
  $("#toastRegion").append(node);
  setTimeout(() => node.remove(), 3200);
}

function bindEvents() {
  $("#librarySearch").addEventListener("input", renderLibrary);
  $("#newProjectButton").addEventListener("click", newProject);
  $("#newProjectModalButton").addEventListener("click", newProject);
  $("#projectsButton").addEventListener("click", () => { renderProjectList(); openModal("#projectModal"); });
  $("#exportRecoveryButton").addEventListener("click", exportProjectRecovery);
  $("#exportButton").addEventListener("click", exportProject);
  $("#importInput").addEventListener("change", (event) => { const [file] = event.target.files; if (file) importProject(file); event.target.value = ""; });
  $("#undoButton").addEventListener("click", undo);
  $("#redoButton").addEventListener("click", redo);
  $("#zoomOutButton").addEventListener("click", () => setZoom(zoom - .1));
  $("#zoomInButton").addEventListener("click", () => setZoom(zoom + .1));
  $("#fitButton").addEventListener("click", fitBoard);
  $("#boardSettingsButton").addEventListener("click", openBoardSettings);
  $("#mobileLibraryButton").addEventListener("click", () => toggleDrawer("library"));
  $("#mobileInspectorButton").addEventListener("click", () => toggleDrawer("inspector"));
  $("#projectStatus").addEventListener("click", openProjectIssues);
  $("#drawerBackdrop").addEventListener("click", closeDrawers);
  $("#applySettingsButton").addEventListener("click", applyBoardSettings);
  $("#deleteDeviceButton").addEventListener("click", deleteSelectedDevice);
  $$(".view-tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
  $$(".modal-close").forEach((button) => button.addEventListener("click", () => closeModal(button)));
  $$(".modal-backdrop").forEach((modal) => modal.addEventListener("mousedown", (event) => { if (event.target === modal) modal.classList.add("hidden"); }));
  $("#projectTitleButton").addEventListener("click", () => { $("#renameProjectInput").value = project.name; openModal("#renameModal"); setTimeout(() => $("#renameProjectInput").select(), 0); });
  $("#renameProjectSaveButton").addEventListener("click", () => {
    const name = $("#renameProjectInput").value.trim();
    if (!name) return;
    snapshot(); project.name = name; persistProject(); $("#renameModal").classList.add("hidden"); renderProjectChrome(); toast("Проєкт перейменовано");
  });
  $("#renameProjectInput").addEventListener("keydown", (event) => { if (event.key === "Enter") $("#renameProjectSaveButton").click(); });
  $("#csvButton").addEventListener("click", exportCsv);
  $("#printDiagramButton").addEventListener("click", () => window.print());
  $("#printBomButton").addEventListener("click", () => window.print());
  $("#documentationButton").addEventListener("click", () => { switchView(project.design ? "design" : project.wires.length ? "wires" : "bom"); toast("Відкрито відомість. Перевірте дані й використайте «Друк / PDF»."); });
  $("#canvasHint button").addEventListener("click", () => { $("#canvasHint").classList.add("hidden"); PStore.writeString(browserStorage, HINT_KEY, "1"); });
  if (PStore.readString(browserStorage, HINT_KEY)) $("#canvasHint").classList.add("hidden");
  bindInspectorInputs();

  document.addEventListener("keydown", (event) => {
    const editing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    const modal = $(".modal-backdrop:not(.hidden)");
    if (modal) { if (event.key === "Escape") { event.preventDefault(); $$(".modal-backdrop").forEach((node) => node.classList.add("hidden")); } return; }
    if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); cancelFloorInteractions(); event.shiftKey ? redo() : undo(); }
    if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); cancelFloorInteractions(); redo(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (persistProject({ immediate: true })) toast("Проєкт збережено локально"); }
    if (!editing && (event.key === "Delete" || event.key === "Backspace")) {
      if ($("#floorView").classList.contains("active")) { event.preventDefault(); cancelFloorInteractions(); if (floorGeometryEditing) deleteFloorGeometrySelection(); else if (floorSelectedId) deleteFloorPoint(); return; }
      if (!$("#boardView").classList.contains("active")) return;
      event.preventDefault();
      if (selectedWireId) deleteWiringEntity("wire", selectedWireId);
      else if (selectedBusbarId) deleteWiringEntity("busbar", selectedBusbarId);
      else if (selectedCombId) deleteWiringEntity("comb", selectedCombId);
      else deleteSelectedDevice();
    }
    if (!editing && event.key === "/" && $("#boardView").classList.contains("active")) {
      event.preventDefault();
      if (wiringMode) setWiringMode(false);
      if (window.innerWidth <= 900 && !$(".library-panel").classList.contains("drawer-open")) toggleDrawer("library");
      $("#librarySearch").focus();
    }
    if (event.key === "Escape") { cancelFloorInteractions(); cancelRouteDrag(); $$(".modal-backdrop").forEach((modal) => modal.classList.add("hidden")); closeDrawers(); selectedDeviceId = null; resetWiringSelection(); renderBoard(); renderInspector(); renderWiringPalette(); }
  });

  let boardViewportFrame = null;
  const resizeBoard = () => {
    if (boardViewportFrame !== null) return;
    boardViewportFrame = requestAnimationFrame(() => {
      boardViewportFrame = null;
      if (!$("#boardView").classList.contains("active")) return;
      if (boardAutoFit) fitBoard(); else updateZoomLayout();
      scheduleWiringPaint();
    });
  };
  window.addEventListener("resize", resizeBoard);
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(resizeBoard);
    observer.observe($("#canvas")); observer.observe($("#boardShell"));
  }
  window.addEventListener("pagehide", () => persistProject({ immediate: true }));
}

function toggleDrawer(name) {
  const panel = name === "library" ? $(".library-panel") : $(".inspector-panel");
  const other = name === "library" ? $(".inspector-panel") : $(".library-panel");
  const opening = !panel.classList.contains("drawer-open");
  other.classList.remove("drawer-open");
  panel.classList.toggle("drawer-open", opening);
  $("#drawerBackdrop").classList.toggle("hidden", !opening);
}

function closeDrawers() {
  $(".library-panel").classList.remove("drawer-open");
  $(".inspector-panel").classList.remove("drawer-open");
  $("#drawerBackdrop").classList.add("hidden");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

bindEvents();
initWiring();
initControls();
initMechanical();
initSchematic();
initFloorPlan();
initFloorGeometry();
initFloorUX();
initFloorPencil();
initCableReports();
PanelUIHelp.install(document);
renderAll();
initTemplates();
registerServiceWorker();
if (projectStorageState.error) { $("#saveStateText").textContent = "Зміни в пам’яті · експортуйте JSON"; toast("Локальне сховище недоступне. Можна працювати й експортувати JSON.", "error"); }
else if (projectStorageState.rejected.length || PStore.readString(browserStorage, PStore.RECOVERY_KEY)) toast("Є збережені дані для відновлення. Відкрийте «Мої проєкти».", "error");
setTimeout(fitBoard, 60);

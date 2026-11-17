/* Millimetre envelopes and DIN allocation. Electrical ratings are independent. */
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./control-devices.js") : root.ControlDevices);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PanelMechanical = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";
  const VERIFIED_DATE = "2026-11-14";
  const CAPACITIES = [[1, 12], [1, 18], [2, 12], [2, 18], [2, 24], [3, 18], [3, 24], [4, 24]].map(([rows, modulesPerRow]) => Object.freeze({ id: `${rows}x${modulesPerRow}`, rows, modulesPerRow, capacity: rows * modulesPerRow }));
  const VOLTA = "https://assets.hager.com/step-content/P/HA_45090289/Document/std.lang.all/24DE0047-bes-volta.pdf";
  const RAILS = "https://assets.hager.com/step-content/P/HA_22838868/Document/std.lang.all/22DE0001-TECHNIK-KLEINVERTEILER.pdf";
  const GOLF = "https://assets1.sc.hager.com/australia/files/02_Residential_Enclosures_and_Load_Centres_NZ.pdf";
  const ENClosures = [
    ...[245, 370, 515, 640, 765].map((heightMm, index) => ({ id: `hager-va${(index + 1) * 12}cn`, model: `Hager Volta VA${(index + 1) * 12}CN`, rows: index + 1, modulesPerRow: 12, widthMm: 305, heightMm, depthMm: 96.5, ip: "IP30", source: VOLTA, railSource: RAILS })),
    ...[
      ["VS112TD", 1, 12, 282, 252], ["VS212TD", 2, 12, 282, 377],
      ["VS118TD", 1, 18, 390, 252], ["VS218TD", 2, 18, 390, 377],
      ["VS318TD", 3, 18, 390, 500], ["VS418TD", 4, 18, 390, 647],
    ].map(([model, rows, modulesPerRow, widthMm, heightMm]) => ({ id: `hager-${model.toLowerCase()}`, model: `Hager Golf ${model}`, rows, modulesPerRow, widthMm, heightMm, depthMm: 99, ip: "IP40", source: `https://hager.com/ie/catalogue/catalog/product/download/id/${model}`, railSource: GOLF })),
  ].map((item) => Object.freeze({ ...item, pitchMm: 18, rowPitchMm: 125, mounting: "Накладний", verified: true }));
  const s200Source = "https://library.e.abb.com/public/cb2705b4429446beace83c3a75a2905e/2CDC400610B0101_Rev_C_Anwendungshandbuch_06-2021_72dpi.pdf";
  const dsSource = "https://library.e.abb.com/public/b7eab409b968427bbc8743fb035574b1/9AKK107492A9205_Tech%20Datasheet_DS201_FULL_rev3.pdf";
  const fSource = "https://library.e.abb.com/public/941c84e0d332402aa508fdeef1ff224b/Interruttori%20differenziali%20di%20tipo%20F.pdf";
  const PROFILES = [
    { id: "abb-s201", model: "ABB S201 · корпус S200", types: ["mcb-1p"], widthMm: 17.5, heightMm: 88, depthMm: 69, source: s200Source },
    { id: "abb-s202", model: "ABB S202 · корпус S200", types: ["main-2p", "mcb-2p"], widthMm: 35, heightMm: 88, depthMm: 69, source: s200Source },
    { id: "abb-s203", model: "ABB S203 · корпус S200", types: ["main-3p"], widthMm: 52.5, heightMm: 88, depthMm: 69, source: s200Source },
    { id: "abb-s204", model: "ABB S204 · корпус S200", types: ["main-4p"], widthMm: 70, heightMm: 88, depthMm: 69, source: s200Source },
    { id: "abb-ds201", model: "ABB DS201 · корпус 1P+N", types: ["rcbo"], widthMm: 35, heightMm: 85, depthMm: 69, source: dsSource },
    { id: "abb-f202", model: "ABB F202 · корпус F200", types: ["rccb-2p"], widthMm: 35, heightMm: 85, depthMm: 69, source: fSource },
    { id: "abb-f204", model: "ABB F204 · корпус F200", types: ["rccb-4p"], widthMm: 70, heightMm: 85, depthMm: 69, source: fSource },
  ].map((item) => Object.freeze({ ...item, verified: true }));
  const BASE_MODULES = { "main-2p": 2, "main-3p": 3, "main-4p": 4, "mcb-1p": 1, "mcb-2p": 2, rcbo: 2, "rcbo-afdd": 4, "outgoing-terminal": 2, "rccb-2p": 2, "rccb-4p": 4, "spd-2p": 2, "spd-4p": 4, contactor: 2, relay: 2, meter: 2, terminal: 1, blank: 1 };
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const positive = (value) => value !== "" && value != null && Number.isFinite(Number(value)) && Number(value) > 0;
  const enclosure = (id) => ENClosures.find((item) => item.id === id);
  const profile = (id) => PROFILES.find((item) => item.id === id);
  const defaultProfile = (type) => PROFILES.find((item) => item.types.includes(type))?.id || "";
  function baseModules(type) { return BASE_MODULES[type] || C.COMPONENTS.find((item) => item.type === type)?.modules || 1; }

  function dimensions(device) {
    const selected = profile(device.geometryId);
    if (selected && !selected.types.includes(device.type)) throw new Error("Габаритний профіль не відповідає типу апарата");
    if (device.geometryId && !selected && device.geometryId !== "custom") throw new Error("Невідомий габаритний профіль");
    if (selected) {
      const railOffsetMm = Number(device.mounting?.railOffsetMm ?? selected.heightMm / 2);
      if (!Number.isFinite(railOffsetMm) || railOffsetMm < 0 || railOffsetMm > selected.heightMm) throw new Error("Вісь рейки повинна бути в межах висоти апарата");
      const current = String(device.rating || "").match(/(?:^|\W)[BCD]\s*(\d+(?:[.,]\d+)?)/i);
      const rangeUnverified = selected.id.startsWith("abb-s20") && current && Number(current[1].replace(",", ".")) > 63;
      return { ...selected, verified: !rangeUnverified, rangeUnverified: Boolean(rangeUnverified), railOffsetMm, offsetVerified: Boolean(device.mounting?.confirmed === true && String(device.mounting.source || "").trim()) };
    }
    if (device.dimensions) {
      const d = device.dimensions;
      for (const key of ["widthMm", "heightMm", "depthMm"]) if (!positive(d[key]) || Number(d[key]) > 1000) throw new Error("Габарити апарата мають бути від 0 до 1000 мм");
      const railOffsetMm = d.railOffsetMm == null ? Number(d.heightMm) / 2 : Number(d.railOffsetMm);
      if (!Number.isFinite(railOffsetMm) || railOffsetMm < 0 || railOffsetMm > Number(d.heightMm)) throw new Error("Вісь рейки повинна бути в межах висоти апарата");
      return { widthMm: Number(d.widthMm), heightMm: Number(d.heightMm), depthMm: Number(d.depthMm), railOffsetMm, offsetVerified: d.confirmed === true, verified: Boolean(d.confirmed === true && String(d.source || "").trim()), source: String(d.source || ""), model: String(d.model || "Власна модель") };
    }
    return { widthMm: baseModules(device.type) * 18, heightMm: 90, depthMm: 70, railOffsetMm: 45, offsetVerified: false, verified: false, model: "Універсальний корпус · орієнтовно", source: "" };
  }

  function boardGeometry(board) {
    if (!Number.isInteger(Number(board.rows)) || Number(board.rows) < 1 || Number(board.rows) > 8 || !Number.isInteger(Number(board.modulesPerRow)) || Number(board.modulesPerRow) < 1 || Number(board.modulesPerRow) > 72) throw new Error("Щит підтримує 1–8 рейок і 1–72 місця в ряду");
    const preset = enclosure(board.enclosureId);
    if (board.enclosureId && board.enclosureId !== "custom" && !preset) throw new Error("Невідома модель щита");
    if (preset && (Number(board.rows) !== preset.rows || Number(board.modulesPerRow) !== preset.modulesPerRow)) throw new Error("Кількість рейок або модулів не відповідає обраному корпусу");
    const custom = board.dimensions || {};
    const pitchMm = preset?.pitchMm || Number(custom.pitchMm ?? 18);
    const rowPitchMm = Number(board.mounting?.rowPitchMm ?? preset?.rowPitchMm ?? custom.rowPitchMm ?? 125);
    const widthMm = preset?.widthMm || Number(custom.widthMm ?? Number(board.modulesPerRow) * pitchMm + 90);
    const heightMm = preset?.heightMm || Number(custom.heightMm ?? (Number(board.rows) - 1) * rowPitchMm + 250);
    const depthMm = preset?.depthMm || Number(custom.depthMm ?? 120);
    for (const value of [widthMm, heightMm, depthMm, pitchMm, rowPitchMm]) if (!positive(value)) throw new Error("Габарити щита та кроки мають бути додатними числами");
    if (widthMm > 3000 || heightMm > 3000 || depthMm > 1000 || pitchMm < 9 || pitchMm > 36 || rowPitchMm < 50 || rowPitchMm > 500) throw new Error("Габарити щита або кроки поза підтримуваними межами");
    // Centre rails for preview until exact mounting offsets are supplied.
    const leftMm = Number(board.mounting?.leftMm ?? (widthMm - Number(board.modulesPerRow) * pitchMm) / 2);
    const firstRailMm = Number(board.mounting?.firstRailMm ?? (heightMm - (Number(board.rows) - 1) * rowPitchMm) / 2);
    if (![leftMm, firstRailMm].every((value) => Number.isFinite(value) && value >= 0)) throw new Error("Відступи рейок повинні бути невід’ємними");
    const maxDeviceDepthMm = board.mounting?.maxDeviceDepthMm == null || board.mounting?.maxDeviceDepthMm === "" ? null : Number(board.mounting.maxDeviceDepthMm);
    if (maxDeviceDepthMm !== null && (!positive(maxDeviceDepthMm) || maxDeviceDepthMm > depthMm)) throw new Error("Доступна глибина апарата повинна бути в межах глибини корпусу");
    const verified = Boolean(preset || (custom.confirmed === true && String(custom.source || "").trim()));
    return { widthMm, heightMm, depthMm, pitchMm, rowPitchMm, leftMm, firstRailMm, maxDeviceDepthMm, verified, model: preset?.model || String(custom.model || "Власний корпус"), source: preset?.source || String(custom.source || ""), mountingVerified: Boolean(board.mounting?.confirmed === true && String(board.mounting.source || "").trim()), capacity: Number(board.rows) * Number(board.modulesPerRow) };
  }

  function modulesFor(device, board) {
    return Math.max(1, Math.ceil((dimensions(device).widthMm - 1e-7) / boardGeometry(board).pitchMm));
  }
  const barModules = (bar, board) => Math.max(1, Math.ceil(((bar.dimensions ? dimensions({ ...bar, type: "terminal", geometryId: "custom" }).widthMm : Math.ceil((bar.terminals * 20 + 38) / 42) * 18) - 1e-7) / (board ? boardGeometry(board).pitchMm : 18)));

  function deviceRect(device, board) {
    const b = boardGeometry(board), d = dimensions(device);
    const slots = modulesFor(device, board);
    return { id: device.id, x: b.leftMm + Number(device.slot) * b.pitchMm, y: b.firstRailMm + Number(device.row) * b.rowPitchMm - d.railOffsetMm, width: d.widthMm, height: d.heightMm, depth: d.depthMm, slots, verified: d.verified, offsetVerified: d.offsetVerified };
  }

  function barDrawingRects(project) {
    const b = boardGeometry(project.board), counts = {}, sideHeights = {}, width = project.board.modulesPerRow * b.pitchMm;
    const barWidth = (zone) => Math.max((width - 12) / 2, ...project.busbars.filter((bar) => bar.zone === zone).map((bar) => (bar.terminals * 12 + 44) * b.pitchMm / 42));
    const lastRail = b.firstRailMm + (project.board.rows - 1) * b.rowPitchMm;
    return (project.busbars || []).map((bar) => {
      if (bar.dimensions && (bar.positionMm || bar.zone === "din")) {
        const d = dimensions({ ...bar, type: "terminal", geometryId: "custom" });
        const r = bar.zone === "din" ? deviceRect({ ...bar, type: "terminal", geometryId: "custom" }, project.board) : { x: Number(bar.positionMm.x), y: Number(bar.positionMm.y), width: d.widthMm, height: d.heightMm };
        return { id: bar.id, ...r, measured: true };
      }
      if (bar.zone === "din") return { id: bar.id, x: b.leftMm + bar.slot * b.pitchMm, y: b.firstRailMm + bar.row * b.rowPitchMm - 14, width: barModules(bar, project.board) * b.pitchMm, height: 28, measured: false };
      const index = counts[bar.zone] || 0; counts[bar.zone] = index + 1;
      if (["left", "right"].includes(bar.zone)) {
        const height = Math.max(42, bar.terminals * 10.5 + 26), offset = sideHeights[bar.zone] || 0;
        sideHeights[bar.zone] = offset + height + 12;
        return { id: bar.id, x: bar.zone === "left" ? Math.max(2, b.leftMm - 44) : b.leftMm + width + 12, y: b.firstRailMm - 50 + offset, width: 30, height, measured: false };
      }
      const col = index % 2, line = Math.floor(index / 2), barSpan = barWidth(bar.zone);
      return { id: bar.id, x: b.leftMm + col * (barSpan + 12), y: bar.zone === "top" ? 12 + line * 35 : lastRail + 84 + line * 35, width: barSpan, height: 28, measured: false };
    });
  }

  function assemblyViewport(project) {
    const b = boardGeometry(project.board), scale = 42 / b.pitchMm;
    // A drawing of the equipment, independent of any enclosure outline. Keep
    // the existing world origin so saved wire routes and terminal refs survive.
    let left = b.leftMm, right = left + project.board.modulesPerRow * b.pitchMm;
    let top = b.firstRailMm - 50 - 10;
    let bottom = b.firstRailMm + (project.board.rows - 1) * b.rowPitchMm + 60;
    const include = (r, margin = 0) => { left = Math.min(left, r.x - margin); right = Math.max(right, r.x + r.width + margin); top = Math.min(top, r.y - margin); bottom = Math.max(bottom, r.y + r.height + margin); };
    project.devices.forEach((device) => include(deviceRect(device, project.board)));
    if (project.consumers?.length) bottom += 30;
    barDrawingRects(project).forEach((bar) => include(bar, 8));
    (project.wires || []).forEach((wire) => (wire.points || []).forEach((point) => { if (Number.isFinite(point.x) && Number.isFinite(point.y)) include({ x: point.x / scale, y: point.y / scale, width: 0, height: 0 }, 6); }));
    const leftMm = Math.max(0, left - 12), topMm = Math.max(0, top - 6);
    right += 6; bottom += 6;
    return { leftMm, topMm, widthMm: right - leftMm, heightMm: bottom - topMm, surfaceWidthMm: Math.max(b.widthMm, right), surfaceHeightMm: Math.max(b.heightMm, bottom) };
  }
  const intersects = (a, b) => a.x < b.x + b.width - 1e-6 && a.x + a.width > b.x + 1e-6 && a.y < b.y + b.height - 1e-6 && a.y + a.height > b.y + 1e-6;

  function checks(project) {
    const issues = [], b = boardGeometry(project.board);
    const hasEnclosure = Boolean(project.board.enclosureId || project.board.dimensions);
    const add = (level, code, text, entityId = "board") => issues.push({ level, code, text, entityId });
    if (hasEnclosure) {
      if (!b.verified) add("pending", "enclosure-unverified", "Габарити власного корпусу потрібно звірити з паспортом.");
      if (!b.mountingVerified) add("pending", "mounting-unverified", "Уточніть відступи DIN-рейок і доступну глибину за кресленням обраного корпусу.");
      if (b.maxDeviceDepthMm === null) add("pending", "depth-unknown", "Не задана доступна глибина для апарата. Зовнішня глибина щита не є монтажною.");
      if (b.leftMm + Number(project.board.modulesPerRow) * b.pitchMm > b.widthMm + 1e-6) add("error", "rail-width", "Модульне поле виходить за ширину корпусу.");
      if (b.firstRailMm + (Number(project.board.rows) - 1) * b.rowPitchMm >= b.heightMm) add("error", "rail-height", "Вісь DIN-рейки виходить за висоту корпусу.");
    }
    const rects = [];
    project.devices.forEach((device) => {
      const d = dimensions(device), r = deviceRect(device, project.board), label = device.label || device.type;
      rects.push(r);
      if (!d.verified) add("pending", "device-unverified", `${label}: потрібні габарити конкретної моделі з паспорта.`, device.id);
      if (d.rangeUnverified) add("error", "geometry-rating", `${label}: для S200 понад 63 A потрібні габарити саме цього виконання. Виберіть власну модель за паспортом.`, device.id);
      if (!d.offsetVerified) add("pending", "device-offset", `${label}: положення осі DIN у корпусі апарата прийнято посередині; звірте креслення.`, device.id);
      if (Number(device.slot) + r.slots > Number(project.board.modulesPerRow) || Number(device.row) >= Number(project.board.rows) || Number(device.slot) < 0 || Number(device.row) < 0) add("error", "device-slots", `${label}: апарат виходить за доступні місця на DIN-рейці.`, device.id);
      if (hasEnclosure && (r.x < 0 || r.y < 0 || r.x + r.width > b.widthMm + 1e-6 || r.y + r.height > b.heightMm + 1e-6)) add("error", "device-boundary", `${label}: корпус апарата виходить за габарити щита.`, device.id);
      if (hasEnclosure && (r.depth > b.depthMm || b.maxDeviceDepthMm !== null && r.depth > b.maxDeviceDepthMm)) add("error", "device-depth", `${label}: глибина ${r.depth} мм перевищує доступну; потрібен глибший щит.`, device.id);
    });
    project.busbars?.forEach((bar) => {
      if (bar.zone === "din" && (!Number.isInteger(Number(bar.row)) || Number(bar.row) < 0 || Number(bar.row) >= Number(project.board.rows) || !Number.isInteger(Number(bar.slot)) || Number(bar.slot) < 0 || Number(bar.slot) + barModules(bar, project.board) > Number(project.board.modulesPerRow))) add("error", "bar-slots", `${bar.label}: шина виходить за доступні місця на DIN-рейці.`, bar.id);
      if (!bar.dimensions || bar.zone !== "din" && !bar.positionMm) { add("pending", "bar-unverified", `${bar.label}: розміщення шини умовне; задайте її габарити й координати.`, bar.id); return; }
      const d = dimensions({ ...bar, type: "terminal", geometryId: "custom" });
      const r = bar.zone === "din" ? deviceRect({ ...bar, type: "terminal", geometryId: "custom" }, project.board) : { id: bar.id, x: Number(bar.positionMm.x), y: Number(bar.positionMm.y), width: d.widthMm, height: d.heightMm, depth: d.depthMm };
      if (![r.x, r.y].every(Number.isFinite)) { add("error", "bar-position", `${bar.label}: некоректні координати шини.`, bar.id); return; }
      if (!d.verified) add("pending", "bar-unverified", `${bar.label}: габарити шини не підтверджені паспортом.`, bar.id);
      if (hasEnclosure && (r.x < 0 || r.y < 0 || r.x + r.width > b.widthMm || r.y + r.height > b.heightMm || r.depth > b.depthMm)) add("error", "bar-boundary", `${bar.label}: шина виходить за габарити щита.`, bar.id);
      rects.push(r);
    });
    for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) if (intersects(rects[i], rects[j])) add("error", "mechanical-overlap", "Габарити компонентів перетинаються; перевірте місця на рейках і положення шин.", rects[j].id);
    if (project.combs?.length || project.wires?.length) add("pending", "wiring-clearance", "Траси проводів умовні: радіуси вигину, кабельні канали, сумісність гребінок і нагрівання потребують окремої перевірки.");
    return issues;
  }

  function withEnclosure(board, id) {
    const p = enclosure(id);
    if (!p) throw new Error("Невідома модель щита");
    const next = { ...copy(board), enclosureId: p.id, rows: p.rows, modulesPerRow: p.modulesPerRow, ip: p.ip, physicalView: true };
    delete next.dimensions; delete next.mounting;
    return next;
  }
  function withCapacity(board, rows, modulesPerRow) {
    const next = { ...copy(board), rows: Number(rows), modulesPerRow: Number(modulesPerRow), physicalView: board.physicalView !== false };
    ["enclosureId", "dimensions", "mounting", "ip", "fullEnclosureView"].forEach((key) => delete next[key]);
    boardGeometry(next);
    return next;
  }
  function repack(project) {
    const p = copy(project), board = p.board;
    const entities = [...p.devices.map((entity) => ({ entity, modules: modulesFor(entity, board) })), ...(p.busbars || []).filter((bar) => bar.zone === "din").map((entity) => ({ entity, modules: barModules(entity, board) }))].sort((a, b) => a.entity.row - b.entity.row || a.entity.slot - b.entity.slot);
    const arrange = (ordered, preserve) => {
      const placed = [];
      for (const item of ordered) {
        const spots = [];
        for (let row = 0; row < board.rows; row += 1) for (let slot = 0; slot <= board.modulesPerRow - item.modules; slot += 1) spots.push({ row, slot });
        if (preserve) spots.sort((a, b) => Math.abs(a.row - item.entity.row) * 1000 + Math.abs(a.slot - item.entity.slot) - Math.abs(b.row - item.entity.row) * 1000 - Math.abs(b.slot - item.entity.slot));
        const spot = spots.find((s) => !placed.some((other) => s.row === other.row && s.slot < other.slot + other.modules && s.slot + item.modules > other.slot));
        if (!spot) return null;
        placed.push({ ...spot, modules: item.modules, entity: item.entity });
      }
      return placed;
    };
    const placed = arrange(entities, true) || arrange([...entities].sort((a, b) => b.modules - a.modules), false);
    if (!placed) throw new Error("Не вміщаються всі апарати й DIN-шини. Збільште кількість рейок або модулів у ряду.");
    placed.forEach(({ entity, row, slot }) => Object.assign(entity, { row, slot }));
    const errors = checks(p).filter((issue) => issue.level === "error");
    if (errors.length) throw new Error(errors[0].text);
    // Routes are screen annotations, not cable lengths. Recompute after geometry changes.
    (p.wires || []).forEach((wire) => { wire.points = []; });
    return p;
  }
  return { VERIFIED_DATE, CAPACITIES, ENCLOSURES: ENClosures, PROFILES, enclosure, profile, defaultProfile, baseModules, dimensions, boardGeometry, modulesFor, barModules, deviceRect, barDrawingRects, assemblyViewport, intersects, checks, withEnclosure, withCapacity, repack };
});

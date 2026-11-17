/* Parametric example plans and explicit 3D cable take-off. No DOM or electrical rewiring. */
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./floor-geometry.js") : root.PanelFloorGeometry);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PanelFloorPlan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (G) {
  "use strict";
  const VERSION = 1;
  const TYPES = { panel: "Щиток", socket: "Розетка", light: "Світильник", switch: "Вимикач", equipment: "Техніка", junction: "Доза (розподільна коробка)" };
  const COLORS = ["#276d93", "#a56c32", "#6f65a1", "#41866c", "#a55169", "#647f35", "#bd6c36", "#438c99", "#746b61", "#8b67a1"];
  const TEMPLATES = {
    "apartment-1": { title: "1-кімнатна квартира", top: [["living", "Житлова кімната", 5.1, 3.6]], bottom: [["kitchen", "Кухня", 3, 3], ["bath", "Ванна", 2.1, 2.3]] },
    "apartment-2": { title: "2-кімнатна квартира", top: [["living", "Вітальня", 4.6, 3.6], ["bedroom", "Спальня", 3.6, 3.6]], bottom: [["kitchen", "Кухня", 3.4, 3], ["bath", "Ванна", 2.2, 2.5], ["storage", "Гардероб", 2.6, 2.2]] },
    "apartment-3": { title: "3-кімнатна квартира", top: [["living", "Вітальня", 4.8, 3.8], ["bedroom", "Спальня", 3.6, 3.6], ["bedroom2", "Друга спальня", 3.4, 3.6]], bottom: [["kitchen", "Кухня", 5, 3], ["bath", "Ванна", 2.4, 2.6], ["storage", "Гардероб", 4.4, 2]] },
    house: { title: "Приватний будинок", top: [["living", "Вітальня", 5.4, 4], ["bedroom", "Спальня", 3.8, 3.6], ["bedroom2", "Друга спальня", 3.6, 3.6]], bottom: [["kitchen", "Кухня", 4.4, 3.6], ["bath", "Ванна", 2.6, 2.8], ["utility", "Господарське", 3.4, 3], ["outdoor", "Ґанок / зовнішня зона", 2.4, 3]] },
  };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const id = () => globalThis.crypto?.randomUUID?.() || `fp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const round = (n) => Math.round(n * 1000) / 1000;
  const branches = (project) => project.devices.filter((device) => /^(mcb-|rcbo)/.test(device.type));
  const circuitFor = (project, key) => project.design?.circuits?.find((circuit) => circuit.key === key)?.deviceId || "";
  const isFiniteNumber = (n) => n !== "" && n !== null && Number.isFinite(Number(n));

  function create(project, templateId = project.design?.templateId || "apartment-2") {
    const template = TEMPLATES[templateId];
    if (!template) throw new Error("Невідомий типовий план");
    const plan = { version: VERSION, templateId, name: template.title, ceilingHeightM: 2.7, routing: "ceiling", wallThicknessM: .12, reservePercent: 10, endAllowanceM: .3, geometryConfirmed: false, syncWithCircuits: false, rooms: [], points: [] };
    [["top", template.top], ["bottom", template.bottom]].forEach(([row, rooms]) => rooms.forEach(([key, name, widthM, depthM], order) => plan.rooms.push({ id: key, name, kind: key, row, order, widthM, depthM, routeLevelM: 0, doorU: .5, windowWall: row === "top" ? "north" : key === "kitchen" ? "south" : "none" })));
    plan.rooms.push({ id: "hall", name: "Коридор", kind: "hall", row: "hall", order: 0, widthM: 1, depthM: templateId === "house" ? 1.6 : 1.4, routeLevelM: 0 });
    const add = (type, roomId, u, v, heightM, name, key, extra = {}) => {
      const point = { id: id(), type, roomId, u, v, heightM, label: `${({ panel: "Щ", socket: "X", light: "EL", switch: "S", equipment: "EP" })[type]}${plan.points.filter((p) => p.type === type).length + 1}`, name, circuitId: circuitFor(project, key), ...extra };
      plan.points.push(point); return point;
    };
    add("panel", "hall", .07, 0, 1.5, project.board.name, "");
    plan.rooms.filter((room) => room.kind !== "outdoor").forEach((room) => {
      const lamp = add("light", room.id, .5, .5, null, `Освітлення · ${room.name}`, "light");
      add("switch", room.id, room.row === "hall" ? .12 : Math.min(.9, .5 + .55 / room.widthM), room.row === "top" ? 1 : 0, .9, `Вимикач · ${room.name}`, "light", { controlsId: lamp.id });
      const key = ["living", "bedroom", "bedroom2", "kitchen", "bath", "utility"].includes(room.kind) ? room.kind : "living";
      if (["living", "bedroom", "bedroom2"].includes(room.kind)) {
        add("socket", room.id, 0, .35, .3, `Розетка · ${room.name}`, key);
        add("socket", room.id, .22, 0, .3, `Розетка · ${room.name}`, key);
        add("socket", room.id, 1, .65, .3, `Розетка · ${room.name}`, key);
      } else if (room.kind === "kitchen") {
        add("socket", room.id, .22, 1, 1.1, "Розетка робочої зони", key);
        add("socket", room.id, .65, 1, 1.1, "Розетка робочої зони", key);
        add("socket", room.id, 1, .35, .3, "Розетка кухні", key);
      } else if (room.kind === "bath") add("socket", room.id, .12, 0, 1.1, "Розетка ванної · перевірити зони", key);
      else if (room.kind !== "storage") add("socket", room.id, 0, .65, .3, `Розетка · ${room.name}`, key);
    });
    const appliances = [
      ["fridge", "Холодильник", "kitchen", 0, .2, .3], ["washer", "Пральна машина", "bath", 1, .72, .6], ["boiler", "Бойлер", "bath", 0, .35, 1.5],
      ["dishwasher", "Посудомийна машина", "kitchen", 1, .75, .3], ["ac", "Кондиціонер", "living", .7, 0, 2.2], ["pump", "Насос", "utility", .7, 1, .6],
    ];
    appliances.forEach(([key, name, roomId, u, v, height]) => { if (circuitFor(project, key) && plan.rooms.some((room) => room.id === roomId)) add("equipment", roomId, u, v, height, name, key, { appliance: key }); });
    if (plan.rooms.some((room) => room.id === "outdoor")) {
      const lamp = add("light", "outdoor", .6, .75, 2.5, "Зовнішній світильник", "outdoor");
      add("switch", "hall", .93, 1, .9, "Вимикач двору", "outdoor", { controlsId: lamp.id });
    }
    return normalize(plan);
  }

  function normalize(input) {
    const plan = clone(input);
    const fail = (text) => { throw new Error(`План приміщень: ${text}`); };
    if (!plan || plan.version !== VERSION || !Array.isArray(plan.rooms) || !Array.isArray(plan.points) || (plan.rooms.length < 1 && plan.geometryMode !== "free") || plan.rooms.length > 24 || plan.points.length > 500) fail("невідомий формат або забагато елементів");
    for (const [key, min, max] of [["ceilingHeightM", 1.8, 8], ["wallThicknessM", .05, .8], ["reservePercent", 0, 50], ["endAllowanceM", 0, 2]]) {
      if (!isFiniteNumber(plan[key]) || Number(plan[key]) < min || Number(plan[key]) > max) fail("перевірте висоту, товщину стін, запас і припуски");
      plan[key] = Number(plan[key]);
    }
    if (!["ceiling", "floor"].includes(plan.routing)) fail("невідомий спосіб прокладання");
    if (plan.geometryMode != null && plan.geometryMode !== "free") fail("невідомий режим геометрії");
    if (plan.geometryMode === "free") G.normalize(plan);
    const roomIds = new Set(), pointIds = new Set();
    plan.rooms.forEach((room) => {
      if (!room.id || roomIds.has(room.id) || !["top", "bottom", "hall"].includes(room.row)) fail("некоректні приміщення");
      roomIds.add(room.id);
      for (const key of ["widthM", "depthM"]) { if (!isFiniteNumber(room[key]) || Number(room[key]) < (plan.geometryMode === "free" ? .4 : .8) || Number(room[key]) > (plan.geometryMode === "free" ? 50 : 30)) fail("перевірте розміри кімнати"); room[key] = Number(room[key]); }
      room.order = Number(room.order) || 0; room.routeLevelM = Number(room.routeLevelM || 0);
      room.doorU = Number(room.doorU ?? .5); room.windowWall ||= "none";
      if (!Number.isFinite(room.doorU) || room.doorU < 0 || room.doorU > 1 || !["none", "north", "south", "west", "east"].includes(room.windowWall)) fail("перевірте двері та вікно");
      if (!Number.isFinite(room.routeLevelM) || room.routeLevelM < -2 || room.routeLevelM > 8) fail("рівень зовнішньої траси має бути −2…8 м");
      room.name = String(room.name || "Приміщення");
    });
    if (plan.geometryMode !== "free" && plan.rooms.filter((room) => room.row === "hall").length !== 1) fail("потрібен один коридор");
    plan.points.forEach((point) => {
      if (!point.id || pointIds.has(point.id) || !roomIds.has(point.roomId) || !TYPES[point.type]) fail("некоректна точка");
      pointIds.add(point.id);
      for (const key of ["u", "v"]) { if (!isFiniteNumber(point[key]) || Number(point[key]) < 0 || Number(point[key]) > 1) fail("точка виходить за приміщення"); point[key] = Number(point[key]); }
      const room = plan.rooms.find((item) => item.id === point.roomId);
      if (point.type === "junction") {
        point.mounting ??= junctionMounting(plan, point);
        if (!["wall", "ceiling"].includes(point.mounting)) fail("для дози оберіть монтаж на стіні або стелі");
        if (point.mounting === "ceiling") point.heightM = null;
        else if (point.heightM === null) point.heightM = plan.ceilingHeightM;
      }
      if (point.heightM !== null && (!isFiniteNumber(point.heightM) || Number(point.heightM) < 0 || Number(point.heightM) > (room.kind === "outdoor" ? 10 : plan.ceilingHeightM))) fail("висота точки виходить за висоту приміщення");
      if (point.heightM !== null) point.heightM = Number(point.heightM);
      point.circuitId = String(point.circuitId || ""); point.name = String(point.name || TYPES[point.type]); point.label = String(point.label || TYPES[point.type]);
      if (point.supplyFromId != null && typeof point.supplyFromId !== "string") fail("некоректне джерело траси");
    });
    if (plan.points.filter((point) => point.type === "panel").length !== (plan.rooms.length ? 1 : 0)) fail("потрібен один щиток для непорожнього плану");
    if (plan.geometryMode === "free") {
      const arrangement = G.layout(plan);
      plan.points.forEach((point) => { const room = arrangement.rooms.find((r) => r.id === point.roomId); if (!G.contains(room, G.position(room, point)) && G.nearest(room, G.position(room, point)).distance > .0001) fail(`${point.label}: точка виходить за форму кімнати`); });
    }
    plan.points.filter((point) => point.controlsId).forEach((point) => { if (point.type !== "switch" || !plan.points.some((other) => other.id === point.controlsId && other.type === "light")) fail("вимикач не прив’язаний до світильника"); });
    const byId = new Map(plan.points.map((point) => [point.id, point])), panel = plan.points.find((p) => p.type === "panel"), done = new Set();
    plan.points.filter((point) => point.supplyFromId).forEach((point) => {
      const source = byId.get(point.supplyFromId);
      if (point.type === "panel" || !source || source.type === "switch") fail(`${point.label}: некоректне джерело траси; виберіть щит, дозу або точку живлення цього плану`);
      if (source.type === "panel" && point.type !== "switch") point.supplyFromId = "";
    });
    plan.points.forEach((point) => {
      const visited = new Set(); let source = point;
      while (source && !done.has(source.id)) {
        if (visited.has(source.id)) fail(`${point.label}: циклічне з’єднання точок`);
        visited.add(source.id);
        source = source.type === "panel" ? null : source.supplyFromId ? byId.get(source.supplyFromId) : source.type === "switch" ? byId.get(source.controlsId) : panel;
      }
      visited.forEach((id) => done.add(id));
    });
    plan.geometryConfirmed = plan.geometryConfirmed === true; plan.syncWithCircuits = plan.syncWithCircuits === true;
    return plan;
  }

  function layout(plan) {
    if (plan.geometryMode === "free") return G.layout(plan);
    const t = plan.wallThicknessM, byRow = (row) => plan.rooms.filter((room) => room.row === row).sort((a, b) => a.order - b.order);
    const width = Math.max(2, ...["top", "bottom"].map((row) => byRow(row).reduce((sum, room) => sum + room.widthM + t, t)));
    const topHeight = Math.max(0, ...byRow("top").map((room) => room.depthM));
    const sourceHall = byRow("hall")[0], hall = { ...sourceHall, x: t, y: topHeight + 2 * t, widthM: width - 2 * t };
    const rooms = [hall];
    ["top", "bottom"].forEach((row) => {
      let x = t;
      byRow(row).forEach((room) => { rooms.push({ ...room, x, y: row === "top" ? hall.y - t - room.depthM : hall.y + hall.depthM + t }); x += room.widthM + t; });
    });
    const height = Math.max(hall.y + hall.depthM, ...rooms.map((room) => room.y + room.depthM)) + t;
    return { width, height, minX: 0, minY: 0, rooms, hall, areaM2: rooms.filter((room) => room.kind !== "outdoor").reduce((sum, room) => sum + room.widthM * room.depthM, 0) };
  }
  const pointHeight = (plan, point) => point.heightM === null ? plan.ceilingHeightM : point.heightM;
  const doorAt = (room) => ({ x: room.x + Math.max(.35, Math.min(room.widthM - .35, room.widthM * room.doorU)), widthM: Math.min(.8, room.widthM * .6) });
  function world(plan, point, arrangement = layout(plan)) {
    const room = arrangement.rooms.find((item) => item.id === point.roomId);
    return { x: room.x + point.u * room.widthM, y: room.y + point.v * room.depthM, z: pointHeight(plan, point), room };
  }
  function junctionMounting(plan, point) {
    return point.mounting ?? (point.heightM === null || Math.abs(Number(point.heightM) - plan.ceilingHeightM) < .0001 ? "ceiling" : "wall");
  }
  // Placement mutates a point, like G.place; callers work on their draft plan.
  function placePoint(plan, point, pos, snapWall = false) {
    const room = layout(plan).rooms.find((r) => r.id === point.roomId);
    if (!room || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) throw new Error("Оберіть кімнату й коректне місце точки.");
    const wall = point.type === "junction" ? junctionMounting(plan, point) === "wall" : snapWall;
    if (plan.geometryMode === "free") {
      const edge = wall && G.nearest(room, pos, true);
      if (wall && !edge) throw new Error("Для настінної дози потрібна хоча б одна закрита стіна кімнати.");
      G.place(point, room, wall ? edge : G.fit(room, pos));
    } else {
      let u = Math.max(0, Math.min(1, (pos.x - room.x) / room.widthM)), v = Math.max(0, Math.min(1, (pos.y - room.y) / room.depthM));
      if (wall) {
        const sides = [[u * room.widthM, "u", 0], [(1 - u) * room.widthM, "u", 1], [v * room.depthM, "v", 0], [(1 - v) * room.depthM, "v", 1]].sort((a, b) => a[0] - b[0]);
        if (sides[0][1] === "u") u = sides[0][2]; else v = sides[0][2];
      }
      point.u = Math.round(u * 1e6) / 1e6; point.v = Math.round(v * 1e6) / 1e6;
    }
  }
  function withJunctionMounting(input, pointId, mounting, heightM) {
    const plan = clone(input), point = plan.points.find((p) => p.id === pointId);
    if (point?.type !== "junction" || !["wall", "ceiling"].includes(mounting)) throw new Error("Оберіть дозу та монтаж на стіні або стелі.");
    if (mounting === "wall" && heightM != null && !Number.isFinite(heightM)) throw new Error("Некоректна висота настінної дози.");
    point.mounting = mounting;
    point.heightM = mounting === "ceiling" ? null : heightM ?? (point.heightM === null ? Math.max(0, plan.ceilingHeightM - .2) : point.heightM);
    if (mounting === "wall") placePoint(plan, point, world(plan, point));
    return normalize(plan);
  }
  function route(plan, from, to, arrangement = layout(plan)) {
    if (plan.geometryMode === "free") return G.route(plan, from, to, arrangement);
    const a = world(plan, from, arrangement), b = world(plan, to, arrangement), hall = arrangement.hall;
    const indoorLevel = plan.routing === "ceiling" ? plan.ceilingHeightM : 0;
    const level = (room) => room.kind === "outdoor" ? room.routeLevelM : indoorLevel;
    const P = (x, y, z) => ({ x: round(x), y: round(y), z: round(z) });
    const access = (p) => {
      const height = level(p.room), spineY = hall.y + hall.depthM / 2;
      if (p.room.row === "hall") return [P(p.x, p.y, p.z), P(p.x, p.y, height), P(p.x, spineY, height)];
      const doorX = doorAt(p.room).x, doorY = p.room.row === "top" ? p.room.y + p.room.depthM : p.room.y;
      const hallY = p.room.row === "top" ? hall.y : hall.y + hall.depthM;
      return [P(p.x, p.y, p.z), P(p.x, p.y, height), P(doorX, p.y, height), P(doorX, doorY, height), P(doorX, hallY, height), P(doorX, hallY, indoorLevel), P(doorX, spineY, indoorLevel)];
    };
    let path;
    if (a.room.id === b.room.id) { const h = level(a.room); path = [P(a.x, a.y, a.z), P(a.x, a.y, h), P(b.x, a.y, h), P(b.x, b.y, h), P(b.x, b.y, b.z)]; }
    else { const start = access(a), end = access(b).reverse(); path = [...start, P(end[0].x, start[start.length - 1].y, indoorLevel), ...end]; }
    path = path.filter((p, index) => !index || p.x !== path[index - 1].x || p.y !== path[index - 1].y || p.z !== path[index - 1].z);
    let horizontalM = 0, verticalM = 0;
    path.slice(1).forEach((p, index) => { horizontalM += Math.abs(p.x - path[index].x) + Math.abs(p.y - path[index].y); verticalM += Math.abs(p.z - path[index].z); });
    return { points: path, horizontalM: round(horizontalM), verticalM: round(verticalM), lengthM: round(horizontalM + verticalM) };
  }

  function calculate(project) {
    const plan = normalize(project.floorPlan), arrangement = layout(plan), panel = plan.points.find((point) => point.type === "panel"), available = branches(project);
    const validIds = new Set(available.map((device) => device.id)), unassigned = plan.points.filter((point) => point.type !== "panel" && !validIds.has(point.circuitId));
    const circuits = [], warnings = [], errors = [];
    if (!panel) errors.push("Додайте кімнату й розмістіть щиток, щоб розрахувати траси.");
    plan.points.filter((point) => point.placementReview).forEach((point) => errors.push(`${point.label}: перевірте розміщення після видалення стіни або кімнати; перемістіть чи підтвердьте точку у властивостях.`));
    const switches = plan.points.filter((point) => point.type === "switch"), invalid = new Set(plan.points.filter((point) => point.placementReview).map((point) => point.id));
    plan.points.filter((point) => point.type === "junction" && junctionMounting(plan, point) === "wall").forEach((point) => {
      const pos = world(plan, point, arrangement), room = pos.room;
      const distance = plan.geometryMode === "free" ? G.nearest(room, pos, true)?.distance ?? Infinity : Math.min(pos.x - room.x, room.x + room.widthM - pos.x, pos.y - room.y, room.y + room.depthM - pos.y);
      if (distance > .001) { invalid.add(point.id); errors.push(`${point.label}: настінна доза поза стіною. Перемістіть її на стіну або виберіть монтаж на стелі.`); }
    });
    switches.forEach((point) => {
      const lamp = plan.points.find((p) => p.id === point.controlsId && p.type === "light");
      if (!lamp || !validIds.has(point.circuitId) || lamp.circuitId !== point.circuitId) { invalid.add(point.id); errors.push(`${point.label}: перевірте прив’язку вимикача до світильника цього кола.`); }
    });
    plan.points.filter((point) => point.type === "light").forEach((lamp) => {
      const controls = switches.filter((point) => point.controlsId === lamp.id);
      if (controls.length > 1) { controls.forEach((point) => invalid.add(point.id)); errors.push(`${lamp.label}: прохідне або багатомісне керування потребує окремої схеми й трас; типовий розрахунок охоплює один вимикач.`); }
    });
    available.forEach((device) => {
      const points = plan.points.filter((point) => point.circuitId === device.id && !["panel", "switch"].includes(point.type));
      if (!points.length) return;
      let longestPathM = 0, incomplete = false;
      const legs = [], distances = new Map(panel && !invalid.has(panel.id) ? [[panel.id, 0]] : []), failed = new Set();
      const connect = (point) => {
        if (!point || failed.has(point.id)) return false;
        if (distances.has(point.id)) return true;
        const source = sourceFor(plan, point);
        if (invalid.has(point.id) || !source || (source.type !== "panel" && source.circuitId !== point.circuitId)) {
          failed.add(point.id); incomplete = true;
          if (!invalid.has(point.id)) errors.push(`${point.label}: джерело траси не підключене до цього кола щита. Перевірте попередню точку та призначений автомат.`);
          return false;
        }
        if (!connect(source)) { failed.add(point.id); incomplete = true; errors.push(`${point.label}: немає живлення від щита через ${source.label}.`); return false; }
        const path = route(plan, source, point, arrangement), allowanceM = 2 * plan.endAllowanceM;
        if (!path) { failed.add(point.id); incomplete = true; errors.push(`${device.label} · ${point.label}: немає прохідної траси від ${source.label}. Додайте двері між суміжними кімнатами або відкрийте стіну.`); return false; }
        const distance = distances.get(source.id) + path.lengthM + allowanceM;
        distances.set(point.id, distance); longestPathM = Math.max(longestPathM, distance);
        legs.push({ ...path, id: `${device.id}:${point.id}`, fromId: source.id, toId: point.id, kind: point.type === "switch" ? "switch" : "feed", allowanceM });
        return true;
      };
      points.forEach(connect);
      switches.filter((point) => point.circuitId === device.id).forEach(connect);
      const horizontalM = round(legs.reduce((sum, leg) => sum + leg.horizontalM, 0)), verticalM = round(legs.reduce((sum, leg) => sum + leg.verticalM, 0)), allowanceM = round(legs.reduce((sum, leg) => sum + leg.allowanceM, 0));
      const installedM = round(horizontalM + verticalM + allowanceM), reserveM = round(installedM * plan.reservePercent / 100);
      circuits.push({ deviceId: device.id, label: device.label, name: device.name, section: Number(device.cable) || null, color: COLORS[circuits.length % COLORS.length], pointCount: points.length + legs.filter((leg) => leg.kind === "switch").length, legs, horizontalM, verticalM, allowanceM, installedM, reserveM, purchaseM: Math.ceil(installedM + reserveM), longestPathM: round(longestPathM), incomplete, estimated: !plan.geometryConfirmed });
    });
    if (!plan.geometryConfirmed) warnings.push("Типовий ескіз: обміри, висоти та траси ще не підтверджені. Довжини попередні.");
    if (unassigned.length) warnings.push(`${unassigned.length} точок не прив’язані до захисного кола щита.`);
    if (plan.rooms.some((room) => room.kind === "bath")) warnings.push("Зони ванної/душової та допустимість розміщення точок потребують окремої перевірки.");
    if (plan.rooms.some((room) => room.kind === "outdoor")) warnings.push("Зовнішня зона має власний рівень траси; спосіб захисту та прокладання зовні потрібно уточнити.");
    const complete = circuits.filter((circuit) => !circuit.incomplete);
    return { plan, arrangement, circuits, unassigned, errors, warnings: [...new Set([...errors, ...warnings])], totalPurchaseM: complete.reduce((sum, circuit) => sum + circuit.purchaseM, 0), totalInstalledM: round(complete.reduce((sum, circuit) => sum + circuit.installedM, 0)) };
  }

  // Explicit supply tree: home runs, daisy chains and distribution boxes.
  // A simple switch has a control cable from its lamp unless a box is selected.
  function sourceFor(plan, point) {
    if (point.type === "panel") return null;
    return plan.points.find((p) => p.id === point.supplyFromId) || (point.supplyFromId ? null : point.type === "switch" ? plan.points.find((p) => p.id === point.controlsId && p.type === "light") : plan.points.find((p) => p.type === "panel"));
  }
  function supplyOptions(plan, point, circuitId = point.circuitId) {
    return plan.points.filter((p) => {
      if (p.id === point.id || p.type === "switch" || (p.type === "panel" ? point.type !== "switch" : !circuitId || p.circuitId !== circuitId)) return false;
      const visited = new Set(); let current = p;
      while (current) { if (current.id === point.id || visited.has(current.id)) return false; visited.add(current.id); current = sourceFor(plan, current); }
      return true;
    });
  }
  function connectPoints(project, fromId, toId, circuitId = "") {
    const plan = normalize(project.floorPlan), source = plan.points.find((p) => p.id === fromId), point = plan.points.find((p) => p.id === toId);
    if (!source || !point) throw new Error("Виберіть на плані початкову й кінцеву точки.");
    if (source.id === point.id || point.type === "panel") throw new Error("Кабель має йти від джерела до іншої точки; щит не може бути споживачем.");
    if (source.type === "switch") throw new Error("Вимикач — точка керування. Почніть лінію від щита, дози або точки живлення.");
    const available = new Set(branches(project).map((d) => d.id)), oldCircuit = point.circuitId;
    const assigned = point.circuitId || (source.type !== "panel" ? source.circuitId : circuitId);
    if (!available.has(assigned)) throw new Error("Оберіть коло щита у фільтрі трас або властивостях точки.");
    if (source.type !== "panel" && source.circuitId !== assigned) throw new Error("Точки належать різним колам. Виберіть точки одного кола або змініть їхнє призначення у властивостях.");
    if (point.type === "switch") {
      const lamp = plan.points.find((p) => p.id === point.controlsId && p.type === "light");
      if (!lamp || lamp.circuitId !== assigned) throw new Error("Спочатку виберіть для вимикача світильник того самого кола у властивостях.");
    }
    point.circuitId = assigned;
    point.supplyFromId = source.type === "panel" && point.type !== "switch" ? "" : source.id;
    if (point.type === "light") plan.points.filter((p) => p.controlsId === point.id && (!p.circuitId || p.circuitId === oldCircuit)).forEach((p) => { p.circuitId = assigned; });
    return normalize(plan);
  }
  function hitRoute(project, position, { toleranceM = .16, excludeId = "", circuitId = "", toId = "" } = {}) {
    const result = calculate(project), candidates = [];
    const downstream = (sourceId) => {
      let source = result.plan.points.find((p) => p.id === sourceId);
      while (source) { if (source.id === excludeId) return true; source = source.supplyFromId ? result.plan.points.find((p) => p.id === source.supplyFromId) : null; }
      return false;
    };
    result.circuits.filter((c) => !circuitId || c.deviceId === circuitId).forEach((c) => c.legs.filter((leg) => leg.kind === "feed" && (!toId || leg.toId === toId) && !downstream(leg.fromId) && leg.toId !== excludeId).forEach((leg) => {
      leg.points.slice(1).forEach((b, i) => {
        const a = leg.points[i], dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
        if (length2 < 1e-10) return; // Vertical drops share one location in the plan.
        const u = Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.y - a.y) * dy) / length2));
        const at = { x: a.x + u * dx, y: a.y + u * dy, z: a.z + u * (b.z - a.z) }, distance = Math.hypot(position.x - at.x, position.y - at.y);
        if (distance <= toleranceM) candidates.push({ deviceId: c.deviceId, toId: leg.toId, fromId: leg.fromId, at, distance });
      });
    }));
    return candidates.sort((a, b) => a.distance - b.distance)[0] || null;
  }
  function insertJunction(project, reference, junction) {
    const plan = normalize(project.floorPlan), result = calculate({ ...project, floorPlan: plan });
    const circuit = result.circuits.find((c) => c.deviceId === reference.deviceId), leg = circuit?.legs.find((l) => l.toId === reference.toId && l.fromId === reference.fromId && l.kind === "feed");
    if (!leg) throw new Error("Виберіть ділянку живлення від щита або дози.");
    const box = clone(junction), previous = plan.points.find((p) => p.id === box.id), child = plan.points.find((p) => p.id === leg.toId), source = plan.points.find((p) => p.id === leg.fromId);
    if (box.type !== "junction" || child.id === box.id || source.id === box.id || (previous && (previous.type !== "junction" || previous.circuitId && previous.circuitId !== circuit.deviceId))) throw new Error("Дозу можна вставити лише в іншу ділянку її кола.");
    let ancestor = source;
    while (ancestor) { if (ancestor.id === box.id) throw new Error("З’єднання утворює цикл доз."); ancestor = ancestor.supplyFromId ? plan.points.find((p) => p.id === ancestor.supplyFromId) : null; }
    if (previous) Object.assign(previous, box); else plan.points.push(box);
    const placed = previous || box;
    placed.circuitId = circuit.deviceId; placed.supplyFromId = source.type === "panel" ? "" : source.id;
    child.supplyFromId = placed.id;
    return normalize(plan);
  }
  function removePoint(input, pointId) {
    const plan = clone(input), point = plan.points.find((p) => p.id === pointId);
    if (!point || point.type === "panel") return plan;
    plan.points = plan.points.filter((p) => p.id !== pointId);
    plan.points.forEach((p) => {
      if (p.supplyFromId === pointId) p.supplyFromId = point.supplyFromId || "";
      if (p.controlsId === pointId) { p.controlsId = ""; p.circuitId = ""; p.supplyFromId = ""; }
    });
    return normalize(plan);
  }

  function syncLengths(project) {
    const next = clone(project), result = calculate(next);
    (next.design?.circuits || []).forEach((record) => {
      const circuit = result.circuits.find((c) => c.deviceId === record.deviceId);
      if (!circuit && record.lengthOrigin !== "floor-plan") return;
      record.lengthM = circuit && !circuit.incomplete ? Math.ceil(circuit.longestPathM * 10) / 10 : null;
      record.lengthOrigin = "floor-plan";
    });
    next.floorPlan.syncWithCircuits = true;
    if (next.design?.supply) next.design.supply.dataConfirmed = false;
    return next;
  }
  const editGeometry = (plan) => G.materialize(plan, layout(plan));
  return { VERSION, TYPES, COLORS, TEMPLATES, create, normalize, layout, world, route, pointHeight, doorAt, calculate, syncLengths, branches, editGeometry, sourceFor, supplyOptions, connectPoints, hitRoute, insertJunction, removePoint, junctionMounting, placePoint, withJunctionMounting };
});

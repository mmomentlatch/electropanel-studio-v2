/* Two-way generation operates on copies. Applying and backing up belongs to the UI. */
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./electrical.js") : root.Electrical, typeof module === "object" && module.exports ? require("./design.js") : root.PanelDesign, typeof module === "object" && module.exports ? require("./floor-plan.js") : root.PanelFloorPlan);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PanelProjectGeneration = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (E, D, F) {
  "use strict";
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const loadPoint = (point) => ["socket", "light", "equipment"].includes(point.type);
  const knownPower = (value) => ["number", "string"].includes(typeof value) && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
  const templateId = (project, fallback) => F.TEMPLATES[fallback] ? fallback : F.TEMPLATES[project.floorPlan?.templateId] ? project.floorPlan.templateId : F.TEMPLATES[project.design?.templateId] ? project.design.templateId : "apartment-2";

  function inspectPlan(project) {
    if (!project.floorPlan?.rooms?.length) throw new Error("Спочатку побудуйте приміщення та додайте електричні точки.");
    const plan = F.normalize(project.floorPlan), points = plan.points.filter((point) => point.type !== "panel");
    if (!points.some(loadPoint)) throw new Error("Додайте хоча б одну розетку, світильник або прилад на плані.");
    const parent = new Map(points.map((point) => [point.id, point.id]));
    const find = (id) => { if (parent.get(id) !== id) parent.set(id, find(parent.get(id))); return parent.get(id); };
    const join = (a, b) => { if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b)); };
    const buckets = new Map();
    points.forEach((point) => {
      const key = point.circuitId ? `circuit:${point.circuitId}` : point.type === "light" ? "lighting" : point.type === "socket" ? `sockets:${point.roomId}` : null;
      if (key) { if (buckets.has(key)) join(point.id, buckets.get(key)); else buckets.set(key, point.id); }
      if (point.supplyFromId) join(point.id, point.supplyFromId);
      if (point.controlsId) join(point.id, point.controlsId);
    });
    const groups = new Map();
    points.forEach((point) => { const key = find(point.id); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(point); });
    const circuits = [...groups.values()].filter((members) => members.some(loadPoint)).map((members, index) => {
      const loads = members.filter(loadPoint), ids = new Set(members.map((point) => point.circuitId).filter(Boolean));
      const devices = project.devices.filter((device) => ids.has(device.id) && D.isBranch(device));
      const specs = (project.design?.circuits || []).filter((record) => ids.has(record.deviceId));
      const rooms = plan.rooms.filter((room) => members.some((point) => point.roomId === room.id));
      const lighting = loads.every((point) => point.type === "light"), dedicated = loads.some((point) => point.type === "equipment");
      const previous = devices.length === 1 ? devices[0] : null, spec = specs.length === 1 ? specs[0] : null;
      const name = previous?.name || (loads.length === 1 && dedicated ? loads[0].name : lighting ? "Освітлення" : loads.every((point) => point.type === "socket") ? `Розетки · ${rooms.map((room) => room.name).join(", ")}` : `Змішане коло ${index + 1}`);
      const kw = devices.length && devices.every((device) => knownPower(device.load)) ? devices.reduce((sum, device) => sum + Number(device.load), 0) : null;
      return { key: `plan-${index + 1}`, name, pointIds: members.map((point) => point.id), pointCount: members.length, lighting, dedicated, wet: rooms.some((room) => room.kind === "bath") || specs.some((record) => record.wet), kw, phase: previous?.phase, section: Number(previous?.cable) >= 1.5 ? Number(previous.cable) : lighting ? 1.5 : 2.5, rating: D.breaker(previous || {}) ? `${D.breaker(previous).curve}${D.breaker(previous).amps} / A / 30mA` : undefined, powerFactor: spec?.powerFactor || 1, diversity: spec?.diversity ?? 1, merged: devices.length > 1, lengthM: null };
    });
    return { plan, circuits, omitted: points.filter((point) => !circuits.some((circuit) => circuit.pointIds.includes(point.id))).length };
  }

  function rebuildPanel(project, options = {}) {
    const analysis = inspectPlan(project), notes = [];
    const circuits = analysis.circuits.map((circuit) => {
      const value = Object.hasOwn(options.loads || {}, circuit.key) ? options.loads[circuit.key] : circuit.kw;
      if (value !== null && value !== "" && !knownPower(value)) throw new Error(`${circuit.name}: задайте потужність ≥0 або залиште поле порожнім.`);
      return { ...circuit, kw: value === null || value === "" ? null : Number(value) };
    });
    const phases = Number(options.phases ?? project.design?.supply?.phases ?? (project.devices.some((device) => /^main-[34]p$/.test(device.type)) ? 3 : 1));
    const incoming = project.devices.find((device) => /^main-/.test(device.type));
    const incomingAmps = D.breaker(incoming || {})?.amps;
    const inputA = Number(options.inputA ?? ([16, 20, 25, 32, 40, 50, 63].includes(incomingAmps) ? incomingAmps : 40));
    let next = D.createTemplate(templateId(project), { phases, inputA, earthing: options.earthing ?? project.design?.supply?.earthing ?? "", protectionScheme: options.protectionScheme || project.design?.protectionScheme || "balanced", voltageRelay: options.voltageRelay ?? Boolean(project.design?.voltageRelayId), surgeProtection: options.surgeProtection ?? project.devices.some((device) => device.type.startsWith("spd-")), circuits: circuits.map((circuit) => ({ ...circuit, kw: circuit.kw ?? 0 })) });
    next.id = project.id; next.name = project.name; next.createdAt = project.createdAt; next.board.name = project.board.name;
    next.design.templateId = "from-floor-plan";
    next.design.generatedFrom = "floor-plan";
    next.design.supply.contractKw = project.design?.supply?.contractKw ?? null;
    next.floorPlan = analysis.plan;
    const assignments = new Map();
    circuits.forEach((circuit) => {
      const record = next.design.circuits.find((item) => item.key === circuit.key), device = next.devices.find((item) => item.id === record.deviceId);
      device.load = circuit.kw; // Unknown power stays unknown; 0 is an explicitly entered value.
      circuit.pointIds.forEach((id) => assignments.set(id, device.id));
    });
    next.floorPlan.points.forEach((point) => { point.circuitId = assignments.get(point.id) || ""; });
    next = F.syncLengths(next);
    next = E.normalizeProject(next);
    if (circuits.some((circuit) => circuit.kw === null)) notes.push("Для кіл без заданої потужності навантаження залишиться невідомим. Уточніть його в «Розрахунках».");
    if (circuits.some((circuit) => circuit.merged)) notes.push("Кола, з’єднані спільною дозою або послідовним кабелем, об’єднано під одним захистом.");
    if (analysis.omitted) notes.push(`${analysis.omitted} точок без споживача залишаться без прив’язки до автомата.`);
    notes.push("Номінали й перерізи — початковий підбір. Потрібно перевірити вихідні дані, навантаження та зауваження в «Розрахунках».");
    const routing = F.calculate(next);
    if (routing.errors.length) notes.push(`Не для всіх точок знайдено прохідну трасу (${routing.errors.length} зауважень). Геометрію збережено; перевірте двері та відкриті стіни.`);
    return { project: next, circuits, notes, routing };
  }

  const applianceRules = [
    ["washer", /прал|стір|washer/i, "bath", .6], ["boiler", /бойл|водонагр|boiler/i, "bath", 1.5],
    ["fridge", /холод|fridge/i, "kitchen", .3], ["dishwasher", /посуд|dishwasher/i, "kitchen", .3],
    ["ac", /кондиц|\bac\b/i, "living", 2.2], ["pump", /насос|pump/i, "utility", .6],
  ];
  function buildPlan(project, options = {}) {
    const branches = F.branches(project);
    if (!branches.length) throw new Error("Додайте до щита хоча б один кінцевий автомат або дифавтомат.");
    const existing = Boolean(project.floorPlan?.rooms?.length), keep = existing && options.keepPoints !== false;
    const next = copy(project), notes = [], created = [], rows = [];
    const plan = existing ? F.normalize(project.floorPlan) : F.create(project, templateId(project, options.templateId));
    const panel = plan.points.find((point) => point.type === "panel");
    plan.points = keep ? plan.points : [panel];
    const validIds = new Set(branches.map((device) => device.id));
    plan.points.forEach((point) => { if (point.circuitId && !validIds.has(point.circuitId)) point.circuitId = ""; });
    const arrangement = F.layout(plan), rooms = plan.rooms;
    const chooseRoom = (kind, name) => rooms.find((room) => room.kind === kind || room.id === kind) || rooms.find((room) => name.toLocaleLowerCase("uk").includes(room.name.toLocaleLowerCase("uk"))) || rooms.find((room) => room.kind === "living") || rooms.find((room) => !["outdoor", "hall"].includes(room.kind)) || rooms[0];
    function add(type, room, device, name, u, v, heightM, extra = {}) {
      const prefix = { socket: "X", light: "EL", switch: "S", equipment: "EP" }[type];
      let number = 1; while (plan.points.some((point) => point.label === `${prefix}${number}`)) number++;
      const point = { id: E.id(), type, roomId: room.id, label: `${prefix}${number}`, name, u, v, heightM: heightM === null ? null : Math.min(heightM, plan.ceilingHeightM), circuitId: device.id, ...extra };
      const box = arrangement.rooms.find((item) => item.id === room.id);
      let onWall = type !== "light";
      const preferred = { x: box.x + u * box.widthM, y: box.y + v * box.depthM };
      try { F.placePoint(plan, point, preferred, onWall); }
      catch { onWall = false; F.placePoint(plan, point, preferred); notes.push(`${room.name}: немає закритої стіни для настінної точки. Уточніть місце монтажу.`); }
      const occupied = plan.points.filter((p) => p.roomId === room.id);
      const position = (p) => ({ x: box.x + p.u * box.widthM, y: box.y + p.v * box.depthM });
      const clearance = (p) => Math.min(Infinity, ...occupied.map((other) => Math.hypot(position(p).x - position(other).x, position(p).y - position(other).y)));
      if (clearance(point) < .25) {
        // Several unnamed breakers may share a room. Keep their symbols separate.
        const candidates = [copy(point)];
        for (let step = 1; step < 10; step++) {
          const f = step / 10;
          const locations = onWall ? [[f, 0], [f, 1], [0, f], [1, f]] : [[f, .3], [f, .5], [f, .7]];
          locations.forEach(([a, b]) => { const candidate = copy(point); F.placePoint(plan, candidate, { x: box.x + a * box.widthM, y: box.y + b * box.depthM }, onWall); candidates.push(candidate); });
        }
        const score = (p) => Math.max(0, .25 - clearance(p)) * 100 + Math.hypot(position(p).x - preferred.x, position(p).y - preferred.y);
        candidates.sort((a, b) => score(a) - score(b)); point.u = candidates[0].u; point.v = candidates[0].v;
        if (clearance(point) < .25) notes.push(`${room.name}: точки розташовані щільно. Уточніть їх розміщення вручну.`);
      }
      plan.points.push(point); created.push(point.id); return point;
    }
    const lightingBranches = branches.filter((device) => {
      const spec = project.design?.circuits?.find((record) => record.deviceId === device.id);
      return spec?.lighting || /освіт|світл|light/i.test(`${spec?.key || ""} ${device.name}`);
    });
    branches.forEach((device) => {
      const retained = plan.points.filter((point) => point.circuitId === device.id && loadPoint(point));
      const before = created.length, spec = project.design?.circuits?.find((record) => record.deviceId === device.id);
      const consumer = E.consumerForDevice(project, device.id);
      const name = consumer?.name || device.name, key = spec?.key || "";
      if (!retained.length) {
        const appliance = applianceRules.find(([code, regex]) => key === code || regex.test(name));
        if (lightingBranches.includes(device)) {
          const matched = rooms.filter((room) => key === room.id || name.toLocaleLowerCase("uk").includes(room.name.toLocaleLowerCase("uk")));
          let targetRooms = matched.length ? matched : rooms.filter((room) => room.kind !== "outdoor" && (lightingBranches.length === 1 || rooms.filter((r) => r.kind !== "outdoor").indexOf(room) % lightingBranches.length === lightingBranches.indexOf(device)));
          if (!targetRooms.length) targetRooms = [chooseRoom(key, name)];
          targetRooms.forEach((room) => {
            const lamp = add("light", room, device, `${name} · ${room.name}`, .5, .5, null);
            add("switch", room, device, `Вимикач · ${room.name}`, .65, room.row === "top" ? 1 : 0, .9, { controlsId: lamp.id });
          });
        } else if (appliance) {
          const [code, , kind, height] = appliance;
          add("equipment", chooseRoom(kind, name), device, name, .25 + (branches.indexOf(device) % 4) * .17, 0, height, { appliance: code });
        } else if (spec?.dedicated) {
          add("equipment", chooseRoom(spec.wet ? "bath" : key, name), device, name, .5, 0, .3);
        } else {
          const room = chooseRoom(key, name);
          for (const [u, v] of [[0, .3], [.3, 0], [1, .7]]) add("socket", room, device, `${name} · розетка`, u, v, room.kind === "kitchen" ? 1.1 : .3);
        }
      }
      rows.push({ deviceId: device.id, label: device.label, name, added: created.length - before, retained: plan.points.filter((point) => point.circuitId === device.id && !created.includes(point.id)).length });
    });
    next.floorPlan = F.normalize(plan);
    if (next.design) { next.design.approval = null; next.design.supply.dataConfirmed = false; }
    const result = F.calculate(next);
    if (result.unassigned.length) notes.push(`${result.unassigned.length} збережених точок не мають чинного автомата. Призначте коло у властивостях точки.`);
    if (result.errors.length) notes.push(`Для частини точок немає прохідної траси або правильного джерела (${result.errors.length} зауважень). Перевірте зв’язки та двері на плані.`);
    notes.push("Розташування та кількість нових точок — редагований ескіз. Уточніть їх, висоти й фактичні маршрути на об’єкті.");
    return { project: next, rows, added: created.length, kept: plan.points.length - created.length, notes: [...new Set(notes)], routing: result, existingGeometry: existing };
  }
  return { inspectPlan, rebuildPanel, buildPlan, loadPoint };
});

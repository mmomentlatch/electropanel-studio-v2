/* Shared project and connectivity model. No DOM or rendering dependencies. */
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./control-devices.js") : root.ControlDevices, typeof module === "object" && module.exports ? require("./mechanical.js") : root.PanelMechanical, typeof module === "object" && module.exports ? require("./floor-plan.js") : root.PanelFloorPlan);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Electrical = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (C, M, F) {
  "use strict";
  const PHASES = ["L1", "L2", "L3"];
  const POTENTIALS = [...PHASES, "N", "PE", "PEN", ...C.CONTROL_POTENTIALS];
  const COLORS = {
    brown: { label: "Коричневий", hex: "#80502c" },
    black: { label: "Чорний", hex: "#24282c" },
    gray: { label: "Сірий", hex: "#8b9299" },
    blue: { label: "Синій", hex: "#1976df" },
    greenYellow: { label: "Жовто-зелений", hex: "#24864b" },
    red: { label: "Червоний", hex: "#c8463e" },
    white: { label: "Білий", hex: "#d8dce0" },
    violet: { label: "Фіолетовий", hex: "#8960b0" },
  };
  const DEFAULT_COLORS = { L1: "brown", L2: "black", L3: "gray", N: "blue", PE: "greenYellow", PEN: "greenYellow", "DC+": "red", DC0: "black", "AC+": "violet", AC0: "white" };
  const DEVICE_TYPES = new Set(["main-2p", "main-3p", "main-4p", "mcb-1p", "mcb-2p", "rcbo", "rcbo-afdd", "outgoing-terminal", "rccb-2p", "rccb-4p", "spd-2p", "spd-4p", "contactor", "relay", "meter", "terminal", "blank", ...C.COMPONENTS.map((item) => item.type)]);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const id = () => globalThis.crypto?.randomUUID?.() || `e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const isRcd = (device) => ["rcbo", "rcbo-afdd"].includes(device?.type) || device?.type?.startsWith("rccb-");
  const phasesOf = (device) => /-[34]p$/.test(device.type) ? PHASES : [PHASES.includes(device.phase) ? device.phase : "L1"];
  const endpointKey = (ref) => `${ref.kind}:${ref.ownerId}:${ref.portId}`;
  const sameEndpoint = (a, b) => endpointKey(a) === endpointKey(b);

  function normalizeProject(input) {
    const project = clone(input);
    if (!project || !project.board || !Array.isArray(project.devices)) throw new Error("Невідомий формат проєкту");
    project.id = typeof project.id === "string" && project.id.trim() ? project.id : id();
    project.name = String(project.name || "Без назви");
    const now = new Date().toISOString();
    for (const key of ["createdAt", "updatedAt"]) if (typeof project[key] !== "string" || !Number.isFinite(Date.parse(project[key]))) project[key] = now;
    if (project.design != null) {
      if (typeof project.design !== "object" || Array.isArray(project.design)) throw new Error("Некоректна розрахункова відомість");
      project.design.supply ??= {}; project.design.circuits ??= []; project.design.rcdGroups ??= [];
      if (!project.design.supply || typeof project.design.supply !== "object" || Array.isArray(project.design.supply) || !Array.isArray(project.design.circuits) || !Array.isArray(project.design.rcdGroups)) throw new Error("Некоректні дані вводу або кіл");
      if ([...project.design.circuits, ...project.design.rcdGroups].some((record) => !record || typeof record !== "object" || typeof record.deviceId !== "string")) throw new Error("Некоректний запис розрахункового кола");
      project.design.supply.dataConfirmed = project.design.supply.dataConfirmed === true;
    }
    const board = project.board;
    if (board.name != null) board.name = String(board.name);
    if (!Number.isInteger(Number(board.rows)) || Number(board.rows) < 1 || Number(board.rows) > 8 || !Number.isInteger(Number(board.modulesPerRow)) || Number(board.modulesPerRow) < 1 || Number(board.modulesPerRow) > 72) throw new Error("Щит підтримує 1–8 рейок і 1–72 місця в ряду");
    board.rows = Number(board.rows);
    board.modulesPerRow = Number(board.modulesPerRow);
    if (board.enclosureId || board.dimensions) M.boardGeometry(board);
    board.earthing = ["TN-S", "TT", "TN-C-S"].includes(board.earthing) ? board.earthing : "TN-S";
    board.penSplit = board.earthing === "TN-C-S" && board.penSplit === true;
    project.version = 2;
    for (const key of ["busbars", "wires", "combs", "consumers"]) if (project[key] != null && !Array.isArray(project[key])) throw new Error(`Некоректна колекція проєкту: ${key}`);
    project.busbars = Array.isArray(project.busbars) ? project.busbars : [];
    project.wires = Array.isArray(project.wires) ? project.wires : [];
    project.combs = Array.isArray(project.combs) ? project.combs : [];
    project.consumers = Array.isArray(project.consumers) ? project.consumers : [];
    [...project.devices, ...project.busbars, ...project.wires, ...project.combs, ...project.consumers].forEach((entity) => {
      if (!entity || typeof entity !== "object" || Array.isArray(entity) || entity.id != null && typeof entity.id !== "string") throw new Error("Некоректний елемент або його ідентифікатор");
    });
    project.consumers.forEach((consumer) => {
      consumer.id ||= id();
      consumer.label = String(consumer.label || "Споживач");
      consumer.name = String(consumer.name || consumer.label);
      consumer.phase = [...PHASES, "3P"].includes(consumer.phase) ? consumer.phase : "L1";
      if (consumer.deviceId != null && typeof consumer.deviceId !== "string") throw new Error("Некоректна прив’язка споживача до апарата");
      if (consumer.nameIndependent != null && typeof consumer.nameIndependent !== "boolean") throw new Error("Некоректний режим назви споживача");
    });
    project.devices.forEach((device) => {
      if (!device || !DEVICE_TYPES.has(device.type)) throw new Error(`Непідтримуваний тип апарата: ${device?.type || "не вказано"}`);
      device.id ||= id();
      device.label = String(device.label || "Q");
      device.name = String(device.name || device.type || "Пристрій");
      device.rating = String(device.rating || "");
      device.phase ||= "L1";
      if (![...PHASES, "3P", "N", "PE"].includes(device.phase)) throw new Error("Невідома фаза апарата");
      device.row = Number(device.row);
      device.slot = Number(device.slot);
      if (device.geometryId || device.dimensions) M.dimensions(device);
      if (!Number.isInteger(device.row) || !Number.isInteger(device.slot) || device.row < 0 || device.row >= board.rows || device.slot < 0 || device.slot >= board.modulesPerRow) throw new Error("Невірне місце апарата");
    });
    project.busbars.forEach((bar) => {
      bar.id ||= id();
      if (!["N", "PE", "PEN"].includes(bar.potential)) throw new Error("Невідомий тип шини");
      bar.label = String(bar.label || bar.potential);
      bar.terminals = Number(bar.terminals ?? 8);
      if (!Number.isInteger(bar.terminals) || bar.terminals < 2 || bar.terminals > 24) throw new Error("Кількість клем шини має бути від 2 до 24");
      bar.zone = ["top", "bottom", "left", "right", "din"].includes(bar.zone) ? bar.zone : "bottom";
      bar.row = Number(bar.row || 0);
      bar.slot = Number(bar.slot || 0);
      bar.rcdId ||= "";
      bar.ratedCurrent = positiveOrNull(bar.ratedCurrent);
      if (bar.dimensions) M.dimensions({ ...bar, type: "terminal", geometryId: "custom" });
      if (bar.positionMm && ![bar.positionMm.x, bar.positionMm.y].every((value) => value !== "" && value != null && Number.isFinite(Number(value)) && Number(value) >= 0)) throw new Error("Некоректні координати шини");
      bar.minSection = positiveOrNull(bar.minSection);
      bar.maxSection = positiveOrNull(bar.maxSection);
    });
    project.wires.forEach((wire) => {
      if (!validRef(wire.from) || !validRef(wire.to)) throw new Error("У проводу немає коректних клем");
      wire.id ||= id();
      wire.label = String(wire.label || "W");
      wire.potential ||= resolveEndpoint(project, wire.from)?.potential || "L1";
      if (!POTENTIALS.includes(wire.potential)) throw new Error("Невідоме призначення проводу");
      wire.color ||= DEFAULT_COLORS[wire.potential] || "brown";
      wire.section = Number(wire.section ?? 2.5);
      wire.material = wire.material === "Al" ? "Al" : "Cu";
      if (wire.wireType != null) wire.wireType = String(wire.wireType).trim().slice(0, 100);
      if (wire.lengthM != null && wire.lengthM !== "") {
        const length = Number(wire.lengthM);
        if (!["number", "string"].includes(typeof wire.lengthM) || !Number.isFinite(length) || length <= 0 || length > 100000) throw new Error(`${wire.label}: некоректна довжина проводу.`);
        wire.lengthM = length;
      } else if (wire.lengthM === "") wire.lengthM = null;
      wire.points = Array.isArray(wire.points) ? wire.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)).map((point) => ({ x: point.x, y: point.y })) : [];
    });
    project.combs.forEach((comb) => {
      comb.id ||= id(); comb.label = String(comb.label || "Гребінка"); comb.terminals ||= [];
      if (!Array.isArray(comb.terminals) || comb.terminals.some((ref) => !validRef(ref)) || ![...PHASES, "N"].includes(comb.potential)) throw new Error("Некоректні контакти гребінки");
      comb.ratedCurrent = positiveOrNull(comb.ratedCurrent);
    });
    const entityIds = [...project.devices, ...project.busbars, ...project.wires, ...project.combs, ...project.consumers].map((entity) => entity.id);
    if (new Set(entityIds).size !== entityIds.length) throw new Error("Повторені ідентифікатори у проєкті");
    if (project.floorPlan) {
      project.floorPlan = F.normalize(project.floorPlan);
      if (project.floorPlan.circuits.some((circuit) => project.devices.some((device) => device.id === circuit.id))) throw new Error("Ідентифікатор кола плану збігається з апаратом щита.");
    }
    return project;
  }

  function positiveOrNull(value) {
    return value !== "" && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
  }

  function replaceAfdd(project, deviceId) {
    const next = clone(project), device = next.devices.find((item) => item.id === deviceId);
    if (!device || device.type !== "rcbo-afdd") throw new Error("Оберіть дифавтомат із ПВДП");
    device.type = "rcbo"; device.geometryId = M.defaultProfile("rcbo");
    delete device.dimensions; delete device.mounting;
    return normalizeProject(M.repack(next));
  }

  function validRef(ref) {
    return ref && ["device", "busbar", "consumer"].includes(ref.kind) && typeof ref.ownerId === "string" && typeof ref.portId === "string";
  }

  function deviceTerminals(device) {
    if (!device || device.type === "blank") return [];
    const custom = C.terminals(device);
    if (custom) return custom;
    const phase = phasesOf(device)[0];
    const port = (portId, label, potential, side, x, extras = {}) => ({ portId, label, potential, side, x, ...extras });
    if (device.type === "terminal") return [port("in", "1", device.phase === "PE" ? "PE" : device.phase === "N" ? "N" : phase, "top", .5), port("out", "2", device.phase === "PE" ? "PE" : device.phase === "N" ? "N" : phase, "bottom", .5)];
    if (device.type === "outgoing-terminal") return [phase, "N", "PE"].flatMap((potential, index) => [port(`${index ? potential : "L"}-in`, index ? potential : "L", potential, "top", (index + .5) / 3), port(`${index ? potential : "L"}-out`, index ? potential : "L", potential, "bottom", (index + .5) / 3)]);
    if (device.type.startsWith("spd-")) {
      const potentials = [...phasesOf(device), "N"];
      return [...potentials.map((potential, index) => port(`${potential}-in`, potential, potential, "top", (index + .5) / potentials.length)), port("PE", "PE", "PE", "bottom", .5)];
    }
    if (device.type === "mcb-1p") return [port("L-in", "1", phase, "top", .5), port("L-out", "2", phase, "bottom", .5)];
    const potentials = device.type === "main-3p" ? PHASES : [...phasesOf(device), "N"];
    const ports = potentials.flatMap((potential, index) => {
      const prefix = PHASES.includes(potential) && potentials.length === 2 ? "L" : potential;
      return [port(`${prefix}-in`, potential === "N" ? "N↑" : `${index * 2 + 1}`, potential, "top", (index + .5) / potentials.length), port(`${prefix}-out`, potential === "N" ? "N↓" : `${index * 2 + 2}`, potential, "bottom", (index + .5) / potentials.length)];
    });
    if (device.type === "contactor") ports.push(port("A1", "A1", phase, "left", .5), port("A2", "A2", "N", "right", .5));
    return ports;
  }

  function allEndpoints(project) {
    return [
      ...project.devices.flatMap((device) => deviceTerminals(device).map((port) => ({ ...port, kind: "device", ownerId: device.id, ownerLabel: device.label }))),
      ...project.busbars.flatMap((bar) => Array.from({ length: bar.terminals }, (_, index) => ({ kind: "busbar", ownerId: bar.id, ownerLabel: bar.label, portId: String(index + 1), label: String(index + 1), potential: bar.potential, side: "top" }))),
      ...(project.consumers || []).flatMap((consumer) => consumerTerminals(consumer).map((port) => ({ ...port, kind: "consumer", ownerId: consumer.id, ownerLabel: consumer.label }))),
    ];
  }

  function consumerTerminals(consumer) {
    const potentials = [...(consumer.phase === "3P" ? PHASES : [consumer.phase]), "N", "PE"];
    return potentials.map((potential, index) => ({ portId: `${consumer.phase !== "3P" && index === 0 ? "L" : potential}-in`, label: consumer.phase !== "3P" && index === 0 ? "L" : potential, potential, side: "top", x: (index + .5) / potentials.length }));
  }
  function consumerForDevice(project, deviceId) {
    const circuit = project.design?.circuits?.find((c) => c.deviceId === deviceId && c.outputKind === "consumer");
    return (project.consumers || []).find((c) => c.deviceId === deviceId || c.id === circuit?.outputId) || null;
  }
  function canAddConsumer(device) {
    return Boolean(device && deviceTerminals(device).some((p) => p.side === "bottom" && PHASES.includes(p.potential)));
  }
  function addConsumer(project, deviceId) {
    const next = normalizeProject(project), device = next.devices.find((d) => d.id === deviceId);
    if (!canAddConsumer(device)) throw new Error("Оберіть апарат із вихідними силовими клемами.");
    const existing = consumerForDevice(next, deviceId);
    if (existing) return { project: next, consumerId: existing.id, created: false };
    let circuit = next.design?.circuits?.find((c) => c.deviceId === deviceId);
    if (circuit?.outputId) throw new Error("Коло вже має вихідний клемник або споживача.");
    const consumer = { id: id(), label: nextLabel(next.consumers, "Споживач "), name: device.name, phase: device.phase, deviceId };
    next.consumers.push(consumer);
    if (next.design && ["mcb-1p", "mcb-2p", "rcbo", "rcbo-afdd"].includes(device.type)) {
      if (!circuit) { circuit = { deviceId, lengthM: null, powerFactor: 1, diversity: 1, izA: null, i2A: null, icnA: null, minFaultA: null, cableSource: "" }; next.design.circuits.push(circuit); }
      circuit.outputId = consumer.id; circuit.outputKind = "consumer"; next.design.supply.dataConfirmed = false;
    }
    return { project: normalizeProject(next), consumerId: consumer.id, created: true };
  }
  function renameConsumer(project, consumerId, name) {
    const next = normalizeProject(project), consumer = next.consumers.find((c) => c.id === consumerId), value = String(name || "").trim();
    if (!consumer) throw new Error("Споживача не знайдено.");
    if (!value || value.length > 160) throw new Error("Введіть назву споживача від 1 до 160 символів.");
    consumer.name = value; consumer.nameIndependent = true; return next;
  }

  function resolveEndpoint(project, ref) {
    if (!ref) return null;
    if (ref.kind === "consumer") {
      const owner = (project.consumers || []).find((consumer) => consumer.id === ref.ownerId);
      const port = owner && consumerTerminals(owner).find((item) => item.portId === ref.portId);
      return port ? { ...port, ...ref, ownerLabel: owner.label } : null;
    }
    if (ref.kind === "device") {
      const owner = project.devices.find((device) => device.id === ref.ownerId);
      const port = deviceTerminals(owner).find((item) => item.portId === ref.portId);
      return owner && port ? { ...port, ...ref, ownerLabel: owner.label } : null;
    }
    const owner = project.busbars.find((bar) => bar.id === ref.ownerId);
    const index = Number(ref.portId);
    return ref.kind === "busbar" && owner && Number.isInteger(index) && index >= 1 && index <= owner.terminals ? { ...ref, potential: owner.potential, ownerLabel: owner.label, label: ref.portId, side: "top" } : null;
  }

  const refOf = (port) => ({ kind: port.kind, ownerId: port.ownerId, portId: port.portId });
  const endpointLabel = (project, ref) => { const port = resolveEndpoint(project, ref); return port ? `${port.ownerLabel}:${port.label}` : "Відсутня клема"; };
  const busbarModules = (bar, board) => M.barModules(bar, board);

  function compatible(project, a, b, potential) {
    if (!a || !b || sameEndpoint(a, b)) return false;
    const supplyA = C.supply(a), supplyB = C.supply(b);
    if (supplyA.kind !== supplyB.kind || supplyA.voltage !== supplyB.voltage) return false;
    if (a.potential === b.potential) return !potential || potential === a.potential;
    const pen = a.potential === "PEN" ? a : b.potential === "PEN" ? b : null;
    const other = pen === a ? b : a;
    return Boolean(pen && project.board.earthing === "TN-C-S" && project.board.penSplit && project.busbars.find((bar) => bar.id === pen.ownerId)?.potential === "PEN" && ["N", "PE"].includes(other.potential) && (!potential || potential === other.potential));
  }

  function preferredPotential(a, b) { return a.potential === "PEN" && b ? b.potential : a.potential; }

  function makeWire(project, from, to, options = {}) {
    const a = resolveEndpoint(project, from), b = resolveEndpoint(project, to);
    const potential = options.potential || (a && b ? preferredPotential(a, b) : "L1");
    if (!compatible(project, a, b, potential)) throw new Error("Несумісні клеми: перевірте потенціал, напругу та AC/DC");
    const wire = { id: id(), label: nextLabel(project.wires, "W"), from: refOf(a), to: refOf(b), potential, section: Number(options.section || 2.5), color: options.color || DEFAULT_COLORS[potential], material: options.material || "Cu", points: clone(options.points || []) };
    if (options.wireType != null) wire.wireType = String(options.wireType).trim().slice(0, 100);
    if (options.lengthM != null) {
      if (!["number", "string"].includes(typeof options.lengthM) || !Number.isFinite(Number(options.lengthM)) || Number(options.lengthM) <= 0 || Number(options.lengthM) > 100000) throw new Error("Некоректна довжина проводу.");
      wire.lengthM = Number(options.lengthM);
    }
    const candidate = { ...project, wires: [...project.wires, wire] };
    const problem = validate(candidate).find((issue) => issue.level === "error" && (issue.entityId === wire.id || ["neutral-mix", "terminal-overflow", "pen-count"].includes(issue.code)));
    if (problem) throw new Error(problem.text);
    return wire;
  }

  function nextLabel(items, prefix) {
    let index = 1;
    while (items.some((item) => item.label === `${prefix}${String(index).padStart(3, "0")}`)) index += 1;
    return `${prefix}${String(index).padStart(3, "0")}`;
  }

  function reconnectWire(project, wireId, end, endpoint) {
    const wire = project.wires.find((item) => item.id === wireId);
    if (!wire || !["from", "to"].includes(end)) throw new Error("Не знайдено провід або його кінець");
    const remaining = { ...project, wires: project.wires.filter((item) => item.id !== wireId) };
    const changed = makeWire(remaining, end === "from" ? endpoint : wire.from, end === "to" ? endpoint : wire.to, wire);
    return { ...changed, id: wire.id, label: wire.label, points: [] };
  }

  function deviceForWire(project, wireId, device) {
    const wire = project.wires.find((item) => item.id === wireId);
    if (!wire) throw new Error("Оберіть провід для вставлення апарата");
    const next = clone(device);
    if (PHASES.includes(wire.potential) && !/-[34]p$/.test(next.type)) next.phase = wire.potential;
    if (next.type === "terminal" && ["N", "PE"].includes(wire.potential)) next.phase = wire.potential;
    const defaults = C.configFor(next.type);
    if (defaults && "contactPotential" in defaults && [...PHASES, "DC+", "AC+"].includes(wire.potential)) {
      next.contactPotential = wire.potential;
      next.contactVoltage = C.supply(resolveEndpoint(project, wire.from)).voltage;
    }
    return next;
  }

  function insertionPairs(project, wireId, device) {
    const wire = project.wires.find((item) => item.id === wireId);
    if (!wire) return [];
    const a = resolveEndpoint(project, wire.from), b = resolveEndpoint(project, wire.to);
    const ports = deviceTerminals(device);
    let pairs;
    if (C.has(device)) {
      const contacts = { "control-relay": [["11", "14"], ["11", "12"]], "time-relay": [["11", "14"], ["11", "12"]], "star-delta-relay": [["C", "Y"], ["C", "Δ"]], "phase-monitor": [["11", "14"], ["11", "12"]], "pushbutton-no": [["13", "14"]], "pushbutton-nc": [["21", "22"]] };
      pairs = contacts[device.type] || C.internalLinks(device);
    } else {
      pairs = ports.filter((port) => port.side === "top").flatMap((input) => ports.filter((output) => output.side === "bottom" && output.potential === input.potential).map((output) => [input.portId, output.portId]));
    }
    return pairs.filter(([inputId, outputId]) => {
      const input = ports.find((port) => port.portId === inputId), output = ports.find((port) => port.portId === outputId);
      return input && output && compatible(project, { ...input, kind: "device", ownerId: device.id }, a, wire.potential) && compatible(project, { ...output, kind: "device", ownerId: device.id }, b, wire.potential);
    });
  }

  function insertDeviceInWire(project, wireId, device, chosenPair) {
    const wire = project.wires.find((item) => item.id === wireId);
    if (!wire) throw new Error("Обраний провід більше не існує");
    const nextDevice = deviceForWire(project, wireId, device);
    const pairs = insertionPairs(project, wireId, nextDevice);
    const pair = chosenPair ? pairs.find(([a, b]) => a === chosenPair[0] && b === chosenPair[1]) : pairs[0];
    if (!pair) throw new Error(`Апарат не має прохідної пари клем для проводу ${wire.potential}. Додайте його окремо або виберіть інший провід.`);
    if (project.wires.some((item) => [item.from, item.to].some((end) => end.kind === "device" && end.ownerId === device.id)) || project.combs.some((comb) => comb.terminals.some((end) => end.ownerId === device.id))) throw new Error("Апарат уже підключений. Для вставлення виберіть новий або непідключений апарат.");
    const next = clone(project);
    next.devices = next.devices.filter((item) => item.id !== device.id);
    next.devices.push(nextDevice);
    next.wires = next.wires.filter((item) => item.id !== wireId);
    const a = resolveEndpoint(project, wire.from), b = resolveEndpoint(project, wire.to);
    const reverse = a?.kind === "consumer" || a?.side === "top" && b?.side === "bottom";
    const portRef = (portId) => ({ kind: "device", ownerId: nextDevice.id, portId });
    // Inserting an apparatus changes the two physical pieces. Their original
    // combined length cannot be assigned to each piece or inferred from pixels.
    const options = { potential: wire.potential, color: wire.color, section: wire.section, material: wire.material, wireType: wire.wireType, points: [] };
    const first = { ...makeWire(next, wire.from, portRef(pair[reverse ? 1 : 0]), options), id: wire.id, label: wire.label };
    next.wires.push(first);
    const second = makeWire(next, portRef(pair[reverse ? 0 : 1]), wire.to, options);
    next.wires.push(second);
    return { project: normalizeProject(next), device: nextDevice, wireIds: [first.id, second.id], pair };
  }

  function unionFind(endpoints) {
    const parents = new Map(endpoints.map((port) => [endpointKey(port), endpointKey(port)]));
    const find = (key) => {
      if (!parents.has(key)) return key;
      let current = key;
      while (parents.get(current) !== current) current = parents.get(current);
      let cursor = key;
      while (parents.get(cursor) !== cursor) { const next = parents.get(cursor); parents.set(cursor, current); cursor = next; }
      return current;
    };
    const join = (a, b) => { a = endpointKey(a); b = endpointKey(b); if (parents.has(a) && parents.has(b)) parents.set(find(a), find(b)); };
    return { find: (ref) => find(typeof ref === "string" ? ref : endpointKey(ref)), join };
  }

  function connectivity(project, { neutralDomains = false, isolateProtection = false } = {}) {
    const ports = allEndpoints(project);
    const nets = unionFind(ports);
    project.wires.forEach((wire) => { if (resolveEndpoint(project, wire.from) && resolveEndpoint(project, wire.to)) nets.join(wire.from, wire.to); });
    project.combs.forEach((comb) => comb.terminals.slice(1).forEach((port) => nets.join(comb.terminals[0], port)));
    project.busbars.forEach((bar) => {
      for (let n = 2; n <= bar.terminals; n += 1) nets.join({ kind: "busbar", ownerId: bar.id, portId: "1" }, { kind: "busbar", ownerId: bar.id, portId: String(n) });
    });
    project.devices.forEach((device) => {
      if (isolateProtection && /^(main-|mcb-|rccb-|rcbo)/.test(device.type)) return;
      if (C.has(device)) {
        C.internalLinks(device).forEach(([from, to]) => nets.join({ kind: "device", ownerId: device.id, portId: from }, { kind: "device", ownerId: device.id, portId: to }));
        return;
      }
      if (device.type.startsWith("spd-") || device.type === "blank") return;
      const terminals = deviceTerminals(device);
      terminals.filter((port) => port.side === "top").forEach((input) => {
        if (neutralDomains && isRcd(device) && input.potential === "N") return;
        const output = terminals.find((port) => port.side === "bottom" && port.potential === input.potential);
        if (output) nets.join({ kind: "device", ownerId: device.id, portId: input.portId }, { kind: "device", ownerId: device.id, portId: output.portId });
      });
    });
    return { ports, ...nets };
  }

  function neutralGroups(project) {
    const graph = connectivity(project, { neutralDomains: true });
    const groups = new Map();
    const seed = (ref, group) => { const key = graph.find(ref); if (!groups.has(key)) groups.set(key, new Set()); groups.get(key).add(group); };
    project.devices.forEach((device) => {
      if (isRcd(device)) seed({ kind: "device", ownerId: device.id, portId: "N-out" }, device.id);
      else if (device.type.startsWith("main-") && deviceTerminals(device).some((port) => port.portId === "N-in")) seed({ kind: "device", ownerId: device.id, portId: "N-in" }, "supply");
    });
    project.busbars.forEach((bar) => {
      if (bar.potential === "PEN") seed({ kind: "busbar", ownerId: bar.id, portId: "1" }, "supply");
      if (bar.potential === "N" && bar.rcdId) seed({ kind: "busbar", ownerId: bar.id, portId: "1" }, bar.rcdId);
      if (bar.potential === "N" && bar.role === "supply") seed({ kind: "busbar", ownerId: bar.id, portId: "1" }, "supply");
    });
    return { graph, groups, groupsFor: (ref) => groups.get(graph.find(ref)) || new Set() };
  }

  function validate(project) {
    const issues = [];
    const add = (code, text, entityId, level = "error") => issues.push({ code, text, entityId, level });
    const occupied = new Map();
    const pairs = new Set();
    project.devices.forEach((device) => {
      C.validate(device).forEach((problem) => add("control-parameters", `${device.label}: ${problem}.`, device.id));
      if (device.phase === "3P" && !/-[34]p$/.test(device.type)) add("device-phase", `${device.label}: для цієї моделі оберіть одну фазу; 3P потребує відповідного апарата.`, device.id);
    });
    project.wires.forEach((wire) => {
      const a = resolveEndpoint(project, wire.from), b = resolveEndpoint(project, wire.to);
      if (!a || !b) { add("missing-terminal", `${wire.label}: клема була видалена або не існує.`, wire.id); return; }
      if (!compatible(project, a, b, wire.potential)) add("potential-mismatch", `${wire.label}: з'єднання ${C.label(a)} ↔ ${C.label(b)} несумісне за потенціалом або напругою.`, wire.id);
      const pair = [endpointKey(a), endpointKey(b)].sort().join("|");
      if (pairs.has(pair)) add("duplicate-wire", "Ці клеми вже з'єднані проводом.", wire.id);
      pairs.add(pair);
      [a, b].forEach((port) => { const key = endpointKey(port); occupied.set(key, (occupied.get(key) || 0) + 1); });
      if (!Number.isFinite(wire.section) || wire.section <= 0 || wire.section > 240) add("section", `${wire.label}: вкажіть коректний переріз проводу.`, wire.id);
      if (!COLORS[wire.color] || (wire.potential === "N" && wire.color !== "blue") || (["PE", "PEN"].includes(wire.potential) && wire.color !== "greenYellow") || (PHASES.includes(wire.potential) && ["blue", "greenYellow"].includes(wire.color))) add("wire-color", `${wire.label}: колір не відповідає призначенню ${wire.potential}.`, wire.id);
      [a, b].filter((port) => port.kind === "busbar").forEach((port) => {
        const bar = project.busbars.find((item) => item.id === port.ownerId);
        if ((bar.minSection && wire.section < bar.minSection) || (bar.maxSection && wire.section > bar.maxSection)) add("bar-section", `${wire.label}: переріз поза заданим діапазоном клем шини ${bar.label}.`, wire.id);
      });
    });
    const combPorts = new Set();
    project.combs.forEach((comb) => {
      const members = comb.terminals.map((ref) => resolveEndpoint(project, ref));
      if (members.length < 2 || members.some((port) => !port || port.kind !== "device")) { add("comb-members", `${comb.label}: потрібно щонайменше дві існуючі клеми апаратів.`, comb.id); return; }
      const firstDevice = project.devices.find((device) => device.id === members[0].ownerId);
      if (new Set(members.map(endpointKey)).size !== members.length || members.some((port) => port.potential !== comb.potential || port.side !== members[0].side || project.devices.find((device) => device.id === port.ownerId).row !== firstDevice.row)) add("comb-potential", `${comb.label}: гребінка має з'єднувати однойменні клеми на одній стороні однієї рейки.`, comb.id);
      members.forEach((port) => { const key = endpointKey(port); if (combPorts.has(key)) add("comb-overlap", `${comb.label}: клема вже зайнята іншою гребінкою.`, comb.id); combPorts.add(key); });
    });
    project.busbars.forEach((bar) => {
      const connected = project.wires.filter((wire) => [wire.from, wire.to].some((port) => port.kind === "busbar" && port.ownerId === bar.id));
      if (!connected.length) add("bar-unconnected", `${bar.label}: немає підключених проводів.`, bar.id, "warning");
      if (!bar.ratedCurrent) add("bar-rating", `${bar.label}: номінальний струм не вказано.`, bar.id, "warning");
      if (bar.rcdId && !project.devices.some((device) => device.id === bar.rcdId && isRcd(device))) add("bar-rcd", `${bar.label}: група ПЗВ не існує.`, bar.id);
      for (let n = 1; n <= bar.terminals; n += 1) if ((occupied.get(endpointKey({ kind: "busbar", ownerId: bar.id, portId: String(n) })) || 0) > 1) add("terminal-overflow", `${bar.label}:${n}: клема вже зайнята. Оберіть інший затискач.`, bar.id);
      if (bar.potential === "PEN" && !(project.board.earthing === "TN-C-S" && project.board.penSplit)) add("pen-profile", `${bar.label}: PEN допускається лише у явно заданій точці поділу TN-C-S.`, bar.id);
    });
    if (project.busbars.filter((bar) => bar.potential === "PEN").length > 1) add("pen-count", "Для цього щита задайте одну точку поділу PEN.", "board");
    const neutral = neutralGroups(project);
    neutral.groups.forEach((groups, root) => { if (groups.size > 1) add("neutral-mix", "Змішані нейтралі різних груп ПЗВ або нейтраль до та після ПЗВ.", root); });
    return issues;
  }

  function cloneProject(project, makeId = id) {
    const copy = normalizeProject(project);
    delete copy.deletedAt;
    const ids = new Map();
    copy.id = makeId();
    [...copy.devices, ...copy.busbars, ...copy.wires, ...copy.combs, ...copy.consumers].forEach((entity) => { const previous = entity.id; entity.id = makeId(); ids.set(previous, entity.id); });
    const remap = (ref) => ({ ...ref, ownerId: ids.get(ref.ownerId) || ref.ownerId });
    copy.wires.forEach((wire) => { wire.from = remap(wire.from); wire.to = remap(wire.to); });
    copy.busbars.forEach((bar) => { if (bar.rcdId) bar.rcdId = ids.get(bar.rcdId) || bar.rcdId; });
    copy.combs.forEach((comb) => { comb.terminals = comb.terminals.map(remap); });
    copy.consumers.forEach((consumer) => { if (consumer.deviceId) consumer.deviceId = ids.get(consumer.deviceId) || consumer.deviceId; });
    if (copy.floorPlan) {
      copy.floorPlan.circuits.forEach((circuit) => { const previous = circuit.id; circuit.id = makeId(); ids.set(previous, circuit.id); });
      copy.floorPlan.excludedCircuitIds = copy.floorPlan.excludedCircuitIds.map((value) => ids.get(value) || value);
      copy.floorPlan.points.forEach((point) => { if (point.circuitId) point.circuitId = ids.get(point.circuitId) || point.circuitId; });
    }
    if (copy.design) {
      if (Array.isArray(copy.design.circuits)) copy.design.circuits.forEach((circuit) => {
        circuit.deviceId = ids.get(circuit.deviceId) || circuit.deviceId;
        circuit.outputId = ids.get(circuit.outputId) || circuit.outputId;
        if (circuit.rcdId) circuit.rcdId = ids.get(circuit.rcdId) || circuit.rcdId;
        if (circuit.rcdBarId) circuit.rcdBarId = ids.get(circuit.rcdBarId) || circuit.rcdBarId;
      });
      if (Array.isArray(copy.design.rcdGroups)) copy.design.rcdGroups.forEach((group) => { group.deviceId = ids.get(group.deviceId) || group.deviceId; group.barId = ids.get(group.barId) || group.barId; });
      if (copy.design.voltageRelayId) copy.design.voltageRelayId = ids.get(copy.design.voltageRelayId) || copy.design.voltageRelayId;
      copy.design.approval = null;
    }
    return copy;
  }

  function removeEntity(project, kind, entityId) {
    const copy = clone(project);
    if (kind === "wire") copy.wires = copy.wires.filter((wire) => wire.id !== entityId);
    if (kind === "comb") copy.combs = copy.combs.filter((comb) => comb.id !== entityId);
    if (["device", "busbar", "consumer"].includes(kind)) {
      const collection = { device: "devices", busbar: "busbars", consumer: "consumers" }[kind];
      copy[collection] = (copy[collection] || []).filter((entity) => entity.id !== entityId);
      copy.wires = copy.wires.filter((wire) => wire.from.ownerId !== entityId && wire.to.ownerId !== entityId);
      copy.combs = copy.combs.map((comb) => ({ ...comb, terminals: comb.terminals.filter((ref) => ref.ownerId !== entityId) })).filter((comb) => comb.terminals.length >= 2);
      if (kind === "device") copy.busbars.forEach((bar) => { if (bar.rcdId === entityId) bar.rcdId = ""; });
      if (kind === "device") copy.consumers.forEach((consumer) => { if (consumer.deviceId === entityId) delete consumer.deviceId; });
      if (kind === "device" && copy.floorPlan) copy.floorPlan.points.forEach((point) => { if (point.circuitId === entityId) { point.circuitId = ""; copy.floorPlan.geometryConfirmed = false; } });
    }
    return copy;
  }

  function wireRows(project) {
    return project.wires.map((wire) => ({ id: wire.id, label: wire.label, potential: wire.potential, from: endpointLabel(project, wire.from), to: endpointLabel(project, wire.to), section: wire.section, color: COLORS[wire.color]?.label || wire.color, material: wire.material, wireType: wire.wireType || "", lengthM: wire.lengthM ?? null, route: wire.points.length ? "Ручний" : "Автоматичний" }));
  }

  function csvContent(rows) {
    const safeCell = (value) => { const text = String(value ?? ""); return /^\s*[=+@\-]/u.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text; };
    return `\ufeff${rows.map((row) => row.map((cell) => `"${safeCell(cell).replaceAll('"', '""')}"`).join(";")).join("\r\n")}`;
  }

  return { control: C, COLORS, DEFAULT_COLORS, PHASES, id, isRcd, normalizeProject, replaceAfdd, consumerTerminals, consumerForDevice, canAddConsumer, addConsumer, renameConsumer, deviceTerminals, allEndpoints, resolveEndpoint, refOf, endpointKey, endpointLabel, sameEndpoint, compatible, preferredPotential, makeWire, reconnectWire, deviceForWire, insertionPairs, insertDeviceInWire, nextLabel, busbarModules, validate, connectivity, neutralGroups, cloneProject, removeEntity, wireRows, csvContent, positiveOrNull };
});

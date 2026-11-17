/* Typical residential projects and explicitly scoped engineering calculations. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./electrical.js"));
  else root.PanelDesign = factory(root.Electrical);
})(typeof globalThis !== "undefined" ? globalThis : this, function (E) {
  "use strict";
  const M = typeof module === "object" && module.exports ? require("./mechanical.js") : globalThis.PanelMechanical;
  const F = typeof module === "object" && module.exports ? require("./floor-plan.js") : globalThis.PanelFloorPlan;
  const REVISION = "residential-ua-2026.4";
  const VERIFIED_DATE = "2026-11-14";
  const SOURCES = [
    { id: "dbn", title: "ДБН В.2.5-23:2025", url: "https://e-construction.gov.ua/laws_detail/3874238847093048425", scope: "Пункти 5.11, 7.24–7.26, 8.2–8.7: падіння напруги, дифзахист, ПВДП, КЗ і кабелі.", status: "Чинна картка ЄДЕССБ; вимоги звірено з доступним офіційним текстом." },
    { id: "pue", title: "ПУЕ:2026 · наказ №283 від 05.06.2026", url: "https://sies.gov.ua/zakonodavstvo/nakazi-minenergovugillya", scope: "Заземлення, захист, улаштування та перевірка електроустановок.", status: "Повний текст потребує звірення інженером; автоматична перевірка всіх пунктів не заявляється." },
    { id: "hd", title: "ДСТУ HD / HD 60364", url: "https://www.evs.ee/en/evs-hd-60364-4-41-2017-a12-2019-consolidated", scope: "Захист від ураження, вибір проводок, заземлення, перевірка: частини 4-41, 5-52, 5-54, 6, 7-701.", status: "Посилання на сімейство стандартів; застосовні національні редакції та зміни звіряє інженер." },
    { id: "lighting", title: "HD 60364-4-41:2017 · 411.3.4", url: "https://preview.sist.si/sist-preview/60900/a918c00f3a904c6c97fee89ce52498e7/SIST-HD-60364-4-41-2017.pdf", scope: "Дифзахист ≤30 мА кінцевих кіл освітлення житла в TN/TT. У шаблонах освітлення не залишається без дифзахисту.", status: "Звірено офіційний огляд HD від SIST. Це не окремий профіль Словенії; національні редакції ДСТУ та зміни звіряються для об’єкта." },
    { id: "assembly", title: "IEC 61439-3:2024", url: "https://webstore.iec.ch/en/publication/68496", scope: "Вимоги до побутових розподільних щитів як комплектного виробу.", status: "Перевірено сферу дії. Теплові перевірки й випробування виробу не замінюються компоновкою." },
    { id: "overload", title: "Schneider Electric · захист провідників", url: "https://www.electrical-installation.org/enwiki/Practical_values_for_a_protective_scheme", scope: "Методика перевірки Ib ≤ In ≤ Iz, I2 ≤ 1,45 Iz та вимикальної здатності.", status: "Довідкова методика виробника; не замінює національні норми." },
    { id: "drop", title: "Schneider Electric · падіння напруги", url: "https://www.electrical-installation.org/enwiki/Calculation_of_voltage_drop_in_steady_load_conditions", scope: "Однофазні лінії: ΔU = 2 Ib (R cosφ + X sinφ) L; R у Ω/км, L у км.", status: "Оцінка при R = 23,7/S для Cu, X = 0,08 Ω/км; уточнюється за паспортом кабелю." },
    { id: "curves", title: "Gewiss · характеристики B/C/D", url: "https://www.gewiss.com/ww/en/gwmag/innovation/thermal-magnetic-circuit-breaker-curves", scope: "Для попередньої перевірки прийняті верхні межі миттєвої зони 5/10/20 In.", status: "Характеристику та час вимкнення конкретного виробу необхідно звіряти з його документацією." },
  ];
  const line = (key, name, kw, options = {}) => ({ key, name, kw, lighting: false, wet: false, lengthM: 20, ...options });
  const common = {
    light: line("light", "Освітлення", .45, { lighting: true, lengthM: 25 }),
    living: line("living", "Розетки вітальні", 1.2),
    bedroom: line("bedroom", "Розетки спальні", 1),
    kitchen: line("kitchen", "Розетки кухні", 1.8),
    bath: line("bath", "Розетки ванної", .8, { wet: true, lengthM: 15 }),
    washer: line("washer", "Пральна машина", 2, { wet: true, lengthM: 15 }),
    fridge: line("fridge", "Холодильник", .3, { lengthM: 15 }),
    boiler: line("boiler", "Бойлер", 1.5, { wet: true, lengthM: 15 }),
  };
  const TEMPLATES = [
    { id: "apartment-1", title: "1-кімнатна квартира", icon: "1", description: "Освітлення, розетки кімнати й кухні, ванна, пральна машина та холодильник.", rows: 2, modules: 24, phases: 1, inputA: 32, circuits: [common.light, common.living, common.kitchen, common.bath, common.washer, common.fridge] },
    { id: "apartment-2", title: "2-кімнатна квартира", icon: "2", description: "Окремі кімнатні групи, кухня, ванна, пральна машина, холодильник і бойлер.", rows: 3, modules: 18, phases: 1, inputA: 40, circuits: [common.light, common.living, common.bedroom, common.kitchen, common.bath, common.washer, common.fridge, common.boiler] },
    { id: "apartment-3", title: "3-кімнатна квартира", icon: "3", description: "Три кімнатні групи, побутові прилади та кондиціонер. Балансування трьох фаз.", rows: 4, modules: 18, phases: 3, inputA: 25, circuits: [common.light, common.living, common.bedroom, line("bedroom2", "Розетки другої спальні", 1), common.kitchen, common.bath, common.washer, common.fridge, common.boiler, line("ac", "Кондиціонер", 1.2)] },
    { id: "house", title: "Приватний будинок", icon: "⌂", description: "Освітлення будинку й двору, житлові групи, кухня, ванна, побутові прилади, насос і господарська лінія.", rows: 4, modules: 24, phases: 3, inputA: 32, circuits: [common.light, line("outdoor", "Освітлення двору", .25, { lighting: true, lengthM: 35 }), common.living, common.bedroom, line("bedroom2", "Розетки інших кімнат", 1), common.kitchen, common.bath, common.washer, common.fridge, common.boiler, line("dishwasher", "Посудомийна машина", 1.8), line("pump", "Насос", .75, { lengthM: 30, powerFactor: .8 }), line("utility", "Господарська лінія", 1.5, { lengthM: 35 })] },
  ];
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const ref = (ownerId, portId, kind = "device") => ({ kind, ownerId, portId });
  const present = (value) => value !== "" && value !== null && value !== undefined && typeof value !== "boolean" && Number.isFinite(Number(value));
  const positive = (value) => present(value) && Number(value) > 0;
  const breaker = (device) => {
    const match = String(device?.rating || "").match(/^\s*([BCD])\s*(\d+(?:[.,]\d+)?)/i);
    const amps = match && Number(match[2].replace(",", "."));
    return match && Number.isFinite(amps) && amps > 0 ? { curve: match[1].toUpperCase(), amps } : null;
  };
  const isBranch = (device) => /^(?:mcb-|rcbo)/.test(device.type);
  const dedicatedKeys = new Set(["fridge", "ac", "outdoor", "dishwasher", "pump", "utility"]);
  function protectionPlan(p) {
    return (p.design?.circuits || []).map((circuit) => {
      const device = p.devices.find((item) => item.id === circuit.deviceId);
      const group = p.devices.find((item) => item.id === circuit.rcdId);
      const grouped = device?.type === "mcb-1p" && ["rccb-2p", "rccb-4p"].includes(group?.type);
      const kind = grouped ? "group" : device?.type.startsWith("rcbo") ? "rcbo" : "unprotected";
      const title = grouped ? `Автомат 1P + ${group.label} (ПЗВ)` : device?.type === "rcbo-afdd" ? "Дифавтомат + ПВДП" : kind === "rcbo" ? "Окремий дифавтомат" : "Дифзахист не призначений";
      let reason;
      if (circuit.wet) reason = "Ванна / душова: потрібен дифзахист; окремий апарат відокремлює це коло від інших. Вимога ПВДП перевіряється окремо.";
      else if (circuit.lighting) reason = "Освітлення потребує дифзахисту. Доцільний окремий дифавтомат, щоб витік у розетковій групі не вимикав світло.";
      else if (circuit.key === "fridge") reason = "Доцільний окремий дифавтомат, щоб витік у розетках інших кімнат не вимикав холодильник. Це вибір для незалежності живлення.";
      else if (["pump", "outdoor", "utility"].includes(circuit.key)) reason = "Доцільний окремий дифавтомат для зовнішньої або господарської лінії. Умови встановлення слід уточнити; її витік не повинен вимикати внутрішні кола.";
      else if (["ac", "dishwasher"].includes(circuit.key)) reason = "Доцільний окремий дифавтомат для приладу. Тип дифзахисту для електроніки чи інвертора слід звірити з паспортом.";
      else reason = "Для загальних розеток можна використати звичайний автомат 1P під груповим ПЗВ. Спрацювання ПЗВ вимкне всю його групу.";
      if (grouped && (circuit.wet || circuit.lighting || dedicatedKeys.has(circuit.key))) reason = `Зараз коло під спільним ПЗВ. ${reason}`;
      return { deviceId: circuit.deviceId, name: device?.name || "Коло без апарата", kind, title, reason, grouped };
    });
  }
  const current = (kw, voltage = 230, powerFactor = 1, diversity = 1) => Number(kw) * 1000 * Number(diversity) / (Number(voltage) * Number(powerFactor));
  function voltageDrop(amps, lengthM, section, powerFactor = 1) {
    const sin = Math.sqrt(Math.max(0, 1 - powerFactor * powerFactor));
    return 2 * amps * (23.7 / section * powerFactor + .08 * sin) * lengthM / 1000;
  }

  function createTemplate(templateId, settings = {}) {
    if (settings.profile && settings.profile !== "UA") throw new Error("Наразі доступний лише нормативний профіль України");
    const template = TEMPLATES.find((item) => item.id === templateId);
    if (!template) throw new Error("Невідомий шаблон щита");
    const phases = Number(settings.phases ?? template.phases);
    const inputA = Number(settings.inputA ?? template.inputA);
    if (![1, 3].includes(phases) || ![16, 20, 25, 32, 40, 50, 63].includes(inputA)) throw new Error("Перевірте кількість фаз та ввідний номінал");
    const earth = ["TN-S", "TN-C-S", "TT"].includes(settings.earthing) ? settings.earthing : "";
    const now = new Date().toISOString();
    const p = { id: E.id(), version: 2, name: template.title, createdAt: now, updatedAt: now, board: { name: `ЩР · ${template.title}`, rows: template.rows, modulesPerRow: template.modules, ip: "IP40", reserve: 20, earthing: earth || "TN-S", penSplit: false }, devices: [], wires: [], busbars: [], combs: [], design: { version: 1, revision: REVISION, templateId, profile: settings.profile === "EU" ? "EU" : "UA", country: String(settings.country || ""), circuits: [], approval: null, supply: { phases, voltage: 230, contractKw: present(settings.contractKw) ? Number(settings.contractKw) : null, earthing: earth, dataConfirmed: false, installationMethod: "", feederIzA: null, i2A: null, upstreamDropPct: null, maxIccA: null, feederSection: inputA > 40 ? 16 : 10, icnA: 6000 }, scope: "Побутові однофазні кола без електроплити, електроопалення, EV, СЕС та резервного живлення. Такі навантаження потребують окремого проєктування." } };
    let row = 0, slot = 0;
    p.consumers = [];
    const add = (type, modules, values) => {
      if (slot + modules > p.board.modulesPerRow) { row += 1; slot = 0; }
      if (row >= p.board.rows) throw new Error("У шаблоні недостатньо місця");
      const device = { id: E.id(), type, geometryId: M.defaultProfile(type), row, slot, name: values.name, label: values.label, rating: values.rating || "", phase: values.phase || "L1", cable: String(values.cable ?? p.design.supply.feederSection), load: values.load ?? 0 };
      p.devices.push(device); slot += modules; return device;
    };
    const incoming = add(phases === 3 ? "main-3p" : "main-2p", phases === 3 ? 3 : 2, { name: "Ввід", label: "QF0", rating: `C${inputA}`, phase: phases === 3 ? "3P" : "L1" });
    const spd = settings.surgeProtection ? add(phases === 3 ? "spd-4p" : "spd-2p", phases === 3 ? 4 : 2, { name: "ПЗІП T2 · уточнити серію", label: "SPD1", rating: "T2", phase: phases === 3 ? "3P" : "L1", cable: 6 }) : null;
    const nBar = { id: E.id(), label: "N0 · ввід", potential: "N", role: "supply", terminals: template.circuits.length + 3, zone: "bottom", row: 0, slot: 0, ratedCurrent: inputA, rcdId: "", minSection: null, maxSection: null };
    const peBar = { ...nBar, id: E.id(), label: "PE0", potential: "PE" };
    p.busbars.push(nBar, peBar);
    const phaseLoads = { L1: 0, L2: 0, L3: 0 };
    template.circuits.forEach((spec, index) => {
      const phase = phases === 1 ? "L1" : [...E.PHASES].sort((a, b) => phaseLoads[a] - phaseLoads[b])[0];
      phaseLoads[phase] += current(spec.kw, 230, spec.powerFactor || 1);
      const section = spec.lighting ? 1.5 : 2.5;
      const protectedDevice = add("rcbo", 2, { name: spec.name, label: `QFD${index + 1}`, rating: `${spec.lighting ? "B10" : "B16"} / A / 30mA`, phase, cable: section, load: spec.kw });
      const output = { id: E.id(), label: `Споживач ${index + 1}`, name: spec.name, phase };
      p.consumers.push(output);
      p.design.circuits.push({ deviceId: protectedDevice.id, outputId: output.id, outputKind: "consumer", key: spec.key, lighting: spec.lighting, wet: spec.wet, lengthM: spec.lengthM, powerFactor: spec.powerFactor || 1, diversity: 1, izA: null, i2A: null, icnA: 6000, minFaultA: null, cableSource: "", rcdType: "A", rcdMa: 30 });
    });
    const connect = (from, to, section) => p.wires.push(E.makeWire(p, from, to, { section }));
    const sourceL = (phase) => ref(incoming.id, phases === 1 ? "L-out" : `${phase}-out`);
    if (phases === 1) connect(ref(incoming.id, "N-out"), ref(nBar.id, "1", "busbar"), p.design.supply.feederSection);
    p.design.circuits.forEach((circuit, index) => {
      const d = p.devices.find((item) => item.id === circuit.deviceId);
      connect(sourceL(d.phase), ref(d.id, "L-in"), p.design.supply.feederSection);
      connect(ref(nBar.id, String(index + 2), "busbar"), ref(d.id, "N-in"), p.design.supply.feederSection);
      connect(ref(d.id, "L-out"), ref(circuit.outputId, "L-in", "consumer"), Number(d.cable));
      connect(ref(d.id, "N-out"), ref(circuit.outputId, "N-in", "consumer"), Number(d.cable));
      connect(ref(peBar.id, String(index + 1), "busbar"), ref(circuit.outputId, "PE-in", "consumer"), Number(d.cable));
    });
    if (spd) {
      (phases === 3 ? E.PHASES : ["L1"]).forEach((phase) => connect(sourceL(phase), ref(spd.id, `${phase}-in`), 6));
      connect(ref(nBar.id, String(template.circuits.length + 2), "busbar"), ref(spd.id, "N-in"), 6);
      connect(ref(peBar.id, String(template.circuits.length + 1), "busbar"), ref(spd.id, "PE"), 6);
    }
    p.design.profile = "UA"; p.design.country = "UA";
    return E.normalizeProject(applyTemplateOptions(p, settings, template));
  }

  function applyTemplateOptions(p, settings, template) {
    const incoming = p.devices.find((d) => d.type.startsWith("main-")), phases = p.design.supply.phases;
    const nBar = p.busbars.find((bar) => bar.potential === "N" && !bar.rcdId);
    const inputA = breaker(incoming).amps, section = p.design.supply.feederSection;
    const sourceL = (phase) => ref(incoming.id, phases === 1 ? "L-out" : `${phase}-out`);
    const connect = (a, b, size = section) => p.wires.push(E.makeWire(p, a, b, { section: size }));
    const scheme = settings.protectionScheme || "balanced";
    if (!["balanced", "group-rcd", "rcbo"].includes(scheme)) throw new Error("Невідомий варіант захисту кіл");
    p.design.protectionScheme = scheme;
    p.design.rcdGroups = [];
    const jobs = [];
    if (scheme === "group-rcd") {
      const dry = p.design.circuits.filter((circuit) => !circuit.wet);
      for (let start = 0; start < dry.length; start += 4) jobs.push({ members: dry.slice(start, start + 4), phase: phases === 1 ? "L1" : "3P", type: phases === 1 ? "rccb-2p" : "rccb-4p" });
    } else if (scheme === "balanced") {
      E.PHASES.forEach((phase) => {
        const sockets = p.design.circuits.filter((circuit) => !circuit.wet && !circuit.lighting && !dedicatedKeys.has(circuit.key) && p.devices.find((item) => item.id === circuit.deviceId)?.phase === phase);
        for (let start = 0; start < sockets.length; start += 4) {
          const members = sockets.slice(start, start + 4);
          // A lone circuit already has an RCBO; a separate RCCB adds no benefit.
          if (members.length > 1) jobs.push({ members, phase, type: "rccb-2p" });
        }
      });
    }
    if (jobs.length) {
      const groupedIds = new Set(jobs.flatMap((job) => job.members.map((circuit) => circuit.deviceId)));
      p.wires = p.wires.filter((wire) => ![wire.from, wire.to].some((end) => groupedIds.has(end.ownerId) && ["N-in", "N-out", "L-in"].includes(end.portId)));
      p.design.circuits.filter((circuit) => groupedIds.has(circuit.deviceId)).forEach((circuit) => { const d = p.devices.find((item) => item.id === circuit.deviceId); d.type = "mcb-1p"; d.geometryId = M.defaultProfile(d.type); d.label = d.label.replace("QFD", "QF"); d.rating = `${breaker(d).curve}${breaker(d).amps}`; });
      jobs.forEach(({ members, phase, type }) => {
        const index = p.design.rcdGroups.length + 1;
        const rcd = { id: E.id(), type, row: 0, slot: 0, label: `QD${index}`, name: scheme === "balanced" ? `ПЗВ розеток · ${phase}` : `Групове ПЗВ ${index}`, rating: "63A / A / 30mA", phase, cable: String(section), load: 0 };
        rcd.geometryId = M.defaultProfile(rcd.type); p.devices.push(rcd);
        const bar = { ...nBar, id: E.id(), label: `N${index} · ${rcd.label}`, role: "rcd", terminals: members.length + 2, rcdId: rcd.id, ratedCurrent: 63 };
        p.busbars.push(bar);
        p.design.rcdGroups.push({ deviceId: rcd.id, barId: bar.id, conditionalIccA: null, coordinationSource: "" });
        const used = new Set(p.wires.flatMap((wire) => [wire.from, wire.to]).filter((end) => end.ownerId === nBar.id).map((end) => end.portId));
        const free = Array.from({ length: nBar.terminals - 1 }, (_, n) => String(n + 2)).find((port) => !used.has(port));
        if (!free) throw new Error("На ввідній N-шині бракує затискачів");
        (type === "rccb-4p" ? E.PHASES : [phase]).forEach((sourcePhase) => connect(sourceL(sourcePhase), ref(rcd.id, type === "rccb-4p" ? `${sourcePhase}-in` : "L-in")));
        connect(ref(nBar.id, free, "busbar"), ref(rcd.id, "N-in"));
        connect(ref(rcd.id, "N-out"), ref(bar.id, "1", "busbar"));
        members.forEach((circuit, memberIndex) => {
          const d = p.devices.find((item) => item.id === circuit.deviceId);
          circuit.rcdId = rcd.id; circuit.rcdBarId = bar.id;
          connect(ref(rcd.id, type === "rccb-4p" ? `${d.phase}-out` : "L-out"), ref(d.id, "L-in"));
          connect(ref(bar.id, String(memberIndex + 2), "busbar"), ref(circuit.outputId, "N-in", circuit.outputKind || "device"), Number(d.cable));
        });
      });
    }
    if (settings.voltageRelay) {
      if (phases !== 1) throw new Error("Для трифазного контролю потрібна окрема схема реле та силового контактора");
      const relay = { id: E.id(), type: "relay", row: 0, slot: 0, label: "KV1", name: "Контроль напруги", rating: `${inputA}A`, phase: "L1", cable: String(section), load: 0, powerCurrent: inputA, lowerVoltage: 180, upperVoltage: 250, delaySeconds: 5 };
      p.devices.splice(2, 0, relay); p.design.voltageRelayId = relay.id;
      p.wires.forEach((wire) => {
        if (wire.from.ownerId !== incoming.id) return;
        const target = p.devices.find((device) => device.id === wire.to.ownerId);
        if (wire.from.portId === "L-out" && !target?.type.startsWith("spd-")) wire.from = ref(relay.id, "L-out");
        if (wire.from.ownerId === incoming.id && wire.from.portId === "N-out") wire.from = ref(relay.id, "N-out");
      });
      connect(ref(incoming.id, "L-out"), ref(relay.id, "L-in"));
      connect(ref(incoming.id, "N-out"), ref(relay.id, "N-in"));
    }
    const ordered = p.devices.filter((device) => device.type.startsWith("main-") || device.type.startsWith("spd-") || device.id === p.design.voltageRelayId);
    p.design.rcdGroups.forEach((group) => {
      ordered.push(p.devices.find((device) => device.id === group.deviceId));
      p.design.circuits.filter((circuit) => circuit.rcdId === group.deviceId).forEach((circuit) => ordered.push(...[circuit.deviceId, circuit.outputId].map((id) => p.devices.find((device) => device.id === id)).filter(Boolean)));
    });
    p.design.circuits.filter((circuit) => !circuit.rcdId).forEach((circuit) => ordered.push(...[circuit.deviceId, circuit.outputId].map((id) => p.devices.find((device) => device.id === id)).filter(Boolean)));
    p.devices = ordered;
    const widths = { "main-2p": 2, "main-3p": 3, "spd-2p": 2, "spd-4p": 4, rcbo: 2, "rcbo-afdd": 4, "outgoing-terminal": 2, "mcb-1p": 1, "rccb-2p": 2, "rccb-4p": 4, relay: 2 };
    const used = p.devices.reduce((sum, device) => sum + widths[device.type], 0);
    const candidates = M.CAPACITIES.map((item) => ({ rows: item.rows, modules: item.modulesPerRow, capacity: item.capacity })).filter((board) => used <= board.capacity * .8).sort((a, b) => a.capacity - b.capacity || a.rows - b.rows);
    for (const board of candidates) {
      let row = 0, slot = 0;
      const places = p.devices.map((device) => { if (slot + widths[device.type] > board.modules) { row += 1; slot = 0; } const place = { row, slot }; slot += widths[device.type]; return place; });
      if (row >= board.rows) continue;
      p.board = M.withCapacity(p.board, board.rows, board.modules);
      p.devices.forEach((device, index) => Object.assign(device, places[index]));
      return p;
    }
    throw new Error("Для вибраної комплектації потрібен більший корпус");
  }

  function fingerprint(p) {
    // Keep the full canonical snapshot: no hash collisions or reliance on updatedAt.
    const design = copy(p.design || {}); delete design.approval;
    const board = copy(p.board); delete board.fullEnclosureView; delete board.physicalView;
    return JSON.stringify({ board, devices: p.devices, busbars: p.busbars, wires: p.wires, combs: p.combs, ...(p.consumers?.length ? { consumers: p.consumers } : {}), ...(p.floorPlan ? { floorPlan: p.floorPlan } : {}), design });
  }
  function approvalCurrent(p) { return Boolean(p.design?.approval && p.design.approval.fingerprint === fingerprint(p)); }
  function approveLayout(p, name) {
    if (!p.design || !String(name || "").trim()) throw new Error("Вкажіть, хто погоджує компоновку");
    if (calculate(p).errors.length) throw new Error("Спершу виправте виявлені помилки проєкту");
    const next = copy(p);
    next.design.approval = { name: String(name).trim(), at: new Date().toISOString(), scope: "layout-only", fingerprint: fingerprint(next) };
    return next;
  }

  function calculate(p) {
    if (!p.design) return null;
    const design = p.design, supply = design.supply || {}, issues = [];
    const floor = p.floorPlan && (design.circuits || []).some((record) => record.lengthOrigin === "floor-plan") ? F.calculate(p) : null;
    const add = (level, code, text, entityId = "board") => issues.push({ level, code, text, entityId });
    const pending = (condition, code, text, entityId) => { if (!condition) add("pending", code, text, entityId); };
    const check = (condition, code, text, entityId) => { if (!condition) add("error", code, text, entityId); };
    const incoming = p.devices.find((d) => d.type.startsWith("main-"));
    check(p.devices.filter((d) => d.type.startsWith("main-")).length === 1, "incoming-count", "Цей розрахунковий профіль підтримує один ввідний апарат.");
    p.devices.filter((d) => !isBranch(d) && Number(d.load) > 0).forEach((d) => add("error", "unmodelled-load", `${d.label}: навантаження не включене до розрахункових кіл.`, d.id));
    const main = breaker(incoming);
    p.devices.filter((device) => E.control.has(device)).forEach((device) => pending(false, "control-review", `${device.label}: коло керування/живлення потребує окремої перевірки струмів, захисту, котушок і режимів комутації.`, device.id));
    const voltageRelay = p.devices.find((device) => device.id === design.voltageRelayId);
    if (voltageRelay && main) check(Number(voltageRelay.powerCurrent ?? parseFloat(voltageRelay.rating)) >= main.amps, "voltage-relay-current", "Реле напруги не розраховане на номінальний струм вводу; потрібен відповідний апарат або контактор.", voltageRelay.id);
    const voltage = positive(supply.voltage) ? Number(supply.voltage) : 230;
    pending(positive(supply.voltage), "supply-voltage", "Потрібна номінальна фазна напруга вводу.");
    if (positive(supply.voltage)) check(Number(supply.voltage) === 230, "unsupported-voltage", "Цей житловий профіль розрахований на фазну напругу 230 В (230/400 В). Інші системи потребують окремої моделі.");
    const phases = Number(supply.phases);
    const phaseCurrents = { L1: 0, L2: 0, L3: 0 };
    pending(design.revision === REVISION, "revision", "Версію шаблону або розрахункових правил потрібно актуалізувати.");
    pending(design.profile === "UA", "national-profile", "Наразі підтримується тільки нормативний профіль України.");
    pending(supply.dataConfirmed === true, "source-data", "Звірте вихідні дані з ТУ, договором, паспортами та обстеженням об’єкта.");
    pending(["TN-S", "TN-C-S", "TT"].includes(supply.earthing), "earthing", "Потрібна фактична система заземлення; TN-C не підтримується цими шаблонами.");
    if (supply.earthing) check(p.board.earthing === supply.earthing && !p.board.penSplit, "earthing-changed", "Шаблон передбачає розділені N і PE на вводі. Зміна заземлення чи поділ PEN у щиті потребує окремої перевірки.");
    pending(supply.earthing !== "TT", "tt-review", "TT потребує окремого розрахунку заземлювача, часу захисного вимкнення та схеми ПЗІП.");
    pending(Boolean(String(supply.installationMethod || "").trim()), "installation", "Вкажіть спосіб прокладання, температуру та групування кабелів.");
    pending(positive(supply.feederIzA), "feeder-iz", "Потрібен допустимий струм ввідного кабелю Iz після поправок.");
    pending(positive(supply.i2A), "incoming-i2", "Потрібен умовний струм вимкнення I2 ввідного апарата з його документації.");
    pending(positive(supply.maxIccA), "fault-max", "Потрібен максимальний очікуваний струм КЗ на шинах щита.");
    pending(present(supply.upstreamDropPct) && Number(supply.upstreamDropPct) >= 0, "upstream-drop", "Потрібне падіння напруги від ВРУ/ГРЩ до цього щита, включно з ввідним кабелем.");
    pending(positive(supply.contractKw), "contract-power", "Потрібна дозволена потужність за договором або ТУ.");
    if (design.revision === REVISION) pending(Boolean(String(supply.surgeAssessment || "").trim()), "surge-review", "Уточніть потребу в ПЗІП, захист на вводі будівлі та координацію ступенів. Відсутність ПЗІП у базовому шаблоні не підтверджує, що він не потрібен.");
    check(Boolean(main) && [1, 3].includes(phases), "incoming", "Перевірте ввідний автомат, його характеристику та кількість фаз.");
    if (incoming && [1, 3].includes(phases)) check(phases === 3 ? incoming.type === "main-3p" || incoming.type === "main-4p" : incoming.type === "main-2p", "incoming-phases", "Ввідний апарат не відповідає кількості фаз вихідних даних.");
    if (main && positive(supply.feederIzA)) check(main.amps <= Number(supply.feederIzA), "feeder-overload", "Номінал ввідного автомата перевищує Iz ввідного кабелю.");
    if (positive(supply.i2A) && positive(supply.feederIzA)) check(Number(supply.i2A) <= 1.45 * Number(supply.feederIzA), "feeder-conventional", "I2 ввідного апарата перевищує 1,45 Iz ввідного кабелю.");
    if (positive(supply.maxIccA)) check(positive(supply.icnA) && Number(supply.icnA) >= Number(supply.maxIccA), "incoming-icn", "Вимикальна здатність ввідного апарата недостатня або не задана.");
    E.validate(p).filter((issue) => issue.level === "error").forEach((issue) => add("error", issue.code, issue.text, issue.entityId));
    const physical = E.connectivity(p, { isolateProtection: true });
    const nBar = p.busbars.find((bar) => bar.potential === "N" && !bar.rcdId);
    const peBar = p.busbars.find((bar) => bar.potential === "PE");
    const connected = (a, b) => Boolean(a && b && E.resolveEndpoint(p, a) && E.resolveEndpoint(p, b) && physical.find(a) === physical.find(b));
    const records = Array.isArray(design.circuits) ? design.circuits : [];
    const seenCircuits = new Set();
    records.forEach((record) => { check(!seenCircuits.has(record.deviceId), "duplicate-circuit", "Один апарат повторений у розрахункових колах.", record.deviceId); seenCircuits.add(record.deviceId); });
    (design.rcdGroups || []).forEach((group) => {
      const device = p.devices.find((d) => d.id === group.deviceId);
      check(Boolean(device && E.isRcd(device)), "group-rcd-missing", "Групове ПЗВ відсутнє або змінено його тип.", group.deviceId);
      if (device && main) check(parseFloat(device.rating) >= main.amps, "group-rcd-current", `${device.label}: номінал ПЗВ менший за номінал його ввідного захисту.`, device.id);
      pending(positive(group.conditionalIccA) && Boolean(String(group.coordinationSource || "").trim()), "group-rcd-coordination", `${device?.label || "ПЗВ"}: потрібні умовна стійкість до КЗ та підтверджена виробником координація із захистом.`, group.deviceId);
      if (positive(group.conditionalIccA) && positive(supply.maxIccA)) check(Number(group.conditionalIccA) >= Number(supply.maxIccA), "group-rcd-fault", `${device?.label || "ПЗВ"}: умовна стійкість до КЗ недостатня.`, group.deviceId);
    });
    p.devices.filter((d) => d.type === "outgoing-terminal").forEach((d) => check(records.filter((record) => record.outputId === d.id).length <= 1, "shared-terminal", `${d.label}: вихідний клемник не може належати різним розрахунковим колам.`, d.id));
    (p.consumers || []).forEach((consumer) => check(records.filter((record) => record.outputKind === "consumer" && record.outputId === consumer.id).length === 1, "unregistered-consumer", `${consumer.label}: споживач повинен належати одному розрахунковому колу.`, consumer.id));
    records.filter((record) => !p.devices.some((d) => d.id === record.deviceId)).forEach((record) => add("error", "deleted-circuit", "Видалений апарат залишився у розрахунковій відомості. Видаліть коло з відомості або поверніть апарат.", record.deviceId));
    const rows = p.devices.filter(isBranch).map((device) => {
      const spec = records.find((record) => record.deviceId === device.id) || {};
      pending(typeof spec.lighting === "boolean" && typeof spec.wet === "boolean", "circuit-purpose", `${device.label}: визначте призначення кола (освітлення, загальне чи ванна).`, device.id);
      const rating = breaker(device);
      const cos = Number(spec.powerFactor), diversity = Number(spec.diversity), power = Number(device.load), section = Number(device.cable);
      const validLoad = present(device.load) && present(spec.powerFactor) && present(spec.diversity) && typeof device.load !== "boolean" && typeof spec.diversity !== "boolean" && Number.isFinite(power) && power >= 0 && cos >= .7 && cos <= 1 && diversity >= 0 && diversity <= 1;
      check(validLoad, "load-input", `${device.label}: задайте потужність ≥0, cosφ 0,7–1 та коефіцієнт одночасності 0–1.`, device.id);
      const ib = validLoad ? current(power, voltage, cos, diversity) : null;
      check(E.PHASES.includes(device.phase), "branch-phase", `${device.label}: коло повинно бути однофазним L1/L2/L3.`, device.id);
      if (ib !== null && E.PHASES.includes(device.phase)) phaseCurrents[device.phase] += ib;
      check(phases === 3 || device.phase === "L1", "phase-unavailable", `${device.label}: фази ${device.phase} немає на однофазному вводі.`, device.id);
      check(Boolean(rating), "breaker-rating", `${device.label}: номінал повинен починатися з B, C або D та струму, наприклад B16.`, device.id);
      check(positive(section) && section >= 1.5, "minimum-section", `${device.label}: для мідної групової лінії потрібен переріз не менше 1,5 мм²; одного мінімуму недостатньо для вибору кабелю.`, device.id);
      if (ib !== null && rating) check(ib <= rating.amps + 1e-9, "branch-overload", `${device.label}: Ib ${ib.toFixed(2)} A перевищує In ${rating.amps} A.`, device.id);
      pending(positive(spec.izA), "branch-iz", `${device.label}: вкажіть Iz кабелю після поправок.`, device.id);
      pending(Boolean(String(spec.cableSource || "").trim()), "cable-source", `${device.label}: зазначте джерело Iz і умови прокладання.`, device.id);
      if (rating && positive(spec.izA)) check(rating.amps <= Number(spec.izA), "cable-overload", `${device.label}: In перевищує Iz кабелю.`, device.id);
      pending(positive(spec.i2A), "conventional-trip", `${device.label}: потрібен умовний струм вимкнення I2 з документації апарата.`, device.id);
      if (positive(spec.i2A) && positive(spec.izA)) check(Number(spec.i2A) <= 1.45 * Number(spec.izA), "conventional-overload", `${device.label}: I2 перевищує 1,45 Iz кабелю.`, device.id);
      if (positive(supply.maxIccA)) check(positive(spec.icnA) && Number(spec.icnA) >= Number(supply.maxIccA), "branch-icn", `${device.label}: вимикальна здатність менша за очікуваний струм КЗ.`, device.id);
      pending(positive(spec.minFaultA), "fault-min", `${device.label}: потрібен мінімальний струм КЗ у кінці кола.`, device.id);
      if (rating && positive(spec.minFaultA)) check(Number(spec.minFaultA) >= ({ B: 5, C: 10, D: 20 }[rating.curve] * rating.amps), "magnetic-trip", `${device.label}: не підтверджено верхню межу миттєвого розчеплення; перевірте часову характеристику.`, device.id);
      pending(positive(spec.lengthM), "cable-length", `${device.label}: потрібна довжина кабельної траси.`, device.id);
      if (spec.lengthOrigin === "floor-plan") {
        pending(Boolean(p.floorPlan?.geometryConfirmed && floor && !floor.unassigned.length && !floor.errors.length), "floor-length-review", `${device.label}: довжина взята з плану. Підтвердьте обміри, висоти, прив’язки точок і фактичні маршрути.`, device.id);
        const route = floor?.circuits.find((circuit) => circuit.deviceId === device.id);
        pending(Boolean(route && !route.incomplete && Math.abs(Number(spec.lengthM) - Math.ceil(route.longestPathM * 10) / 10) < 1e-7), "floor-length-stale", `${device.label}: план змінився після передавання довжини. Оновіть довжини з плану або задайте довжину вручну.`, device.id);
      }
      const localDrop = ib !== null && positive(spec.lengthM) && positive(section) ? voltageDrop(ib, Number(spec.lengthM), section, cos) / voltage * 100 : null;
      const totalDrop = localDrop !== null && present(supply.upstreamDropPct) ? localDrop + Number(supply.upstreamDropPct) : null;
      const limit = spec.lighting ? 3 : 5;
      if (totalDrop !== null) check(totalDrop <= limit + 1e-9, "voltage-drop", `${device.label}: сумарне падіння ${totalDrop.toFixed(2)}% перевищує ${limit}% (ДБН 5.11).`, device.id);
      const groupRcd = spec.rcdId && p.devices.find((d) => d.id === spec.rcdId);
      const differential = groupRcd || device;
      const residual = String(differential?.rating || "").match(/(?:^|\W)(\d+(?:[.,]\d+)?)\s*mA\b/i), residualMa = residual ? Number(residual[1].replace(",", ".")) : null;
      check(E.isRcd(differential) && spec.rcdType === "A" && /(?:^|\W)A(?:\W|$)/i.test(differential.rating) && positive(spec.rcdMa) && Number(spec.rcdMa) <= 30 && residualMa > 0 && residualMa <= 30, "rcd", `${device.label}: потрібен власний або груповий дифзахист типу A / ≤30 мА; звірте апарат і його параметри.`, device.id);
      if (spec.wet) check(device.type === "rcbo-afdd", "bath-afdd", `${device.label}: коло позначене «Ванна / душова»; ДБН 7.25 передбачає ПВДП. Базовий шаблон його не додає. Уточніть місце споживача або додайте ПВДП з бібліотеки.`, device.id);
      const outputKind = spec.outputKind === "consumer" ? "consumer" : "device";
      const out = outputKind === "consumer" ? (p.consumers || []).find((item) => item.id === spec.outputId) : p.devices.find((d) => d.id === spec.outputId && d.type === "outgoing-terminal");
      const outputRef = (portId) => out && ref(out.id, portId, outputKind);
      const sourceL = incoming && ref(incoming.id, phases === 1 ? "L-out" : `${device.phase}-out`);
      const sourceN = incoming?.type === "main-3p" ? nBar && ref(nBar.id, "1", "busbar") : incoming && ref(incoming.id, "N-out");
      const groupPhaseIn = groupRcd && ref(groupRcd.id, groupRcd.type.endsWith("-4p") ? `${device.phase}-in` : "L-in");
      const groupPhaseOut = groupRcd && ref(groupRcd.id, groupRcd.type.endsWith("-4p") ? `${device.phase}-out` : "L-out");
      const phaseFed = groupRcd ? connected(sourceL, groupPhaseIn) && connected(groupPhaseOut, ref(device.id, "L-in")) && !connected(sourceL, ref(device.id, "L-in")) : connected(sourceL, ref(device.id, "L-in"));
      const neutralFed = groupRcd ? connected(sourceN, ref(groupRcd.id, "N-in")) && out && connected(ref(groupRcd.id, "N-out"), outputRef("N-in")) && !connected(sourceN, outputRef("N-in")) : connected(sourceN, ref(device.id, "N-in")) && out && connected(ref(device.id, "N-out"), outputRef("N-in")) && !connected(sourceN, ref(device.id, "N-out"));
      const topology = out && phaseFed && neutralFed && connected(ref(device.id, "L-out"), outputRef("L-in")) && peBar && connected(ref(peBar.id, "1", "busbar"), outputRef("PE-in")) && !connected(groupPhaseOut || sourceL, ref(device.id, "L-out"));
      check(Boolean(topology), "circuit-wiring", `${device.label}: перевірте L/N до і після захисту, PE та відсутність обходу апарата.`, device.id);
      const parallel = p.devices.filter(isBranch).some((other) => other.id !== device.id && connected(ref(device.id, "L-out"), ref(other.id, "L-out")));
      check(!parallel, "parallel-outputs", `${device.label}: виходи різних захисних апаратів об’єднані.`, device.id);
      return { device, spec, rating, ib, localDrop, totalDrop, limit, section, topology: Boolean(topology) };
    });
    const powerKw = rows.reduce((sum, row) => sum + (Number.isFinite(Number(row.device.load)) && present(row.spec.diversity) ? Number(row.device.load) * Number(row.spec.diversity) : 0), 0);
    if (positive(supply.contractKw)) check(powerKw <= Number(supply.contractKw) + 1e-9, "contract-overload", "Розрахункова потужність перевищує дозволену за договором/ТУ.");
    if (main) E.PHASES.forEach((phase) => check(phaseCurrents[phase] <= main.amps + 1e-9, "phase-overload", `${phase}: ${phaseCurrents[phase].toFixed(2)} A перевищує ввідний номінал ${main.amps} A.`));
    const errors = issues.filter((issue) => issue.level === "error");
    const missing = issues.filter((issue) => issue.level === "pending");
    return { rows, issues, errors, missing, powerKw, phaseCurrents, calculationPassed: !errors.length && !missing.length, installationReady: false, approvalCurrent: approvalCurrent(p), status: errors.length ? "Потрібні виправлення" : missing.length ? "Потрібні вихідні дані" : "Розрахункові перевірки пройдені", engineeringReview: "Потрібні перевірка повного нормативного профілю, паспортів, селективності, I²t, нагрівання щита, ПЗІП, заземлення й протоколи перевірок. Автоматичний дозвіл до монтажу не видається." };
  }
  return { REVISION, VERIFIED_DATE, SOURCES, TEMPLATES, createTemplate, protectionPlan, calculate, current, voltageDrop, breaker, isBranch, fingerprint, approvalCurrent, approveLayout };
});

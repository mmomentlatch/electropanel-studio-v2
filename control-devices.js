/* Generic control equipment. Functional ports are not manufacturer terminal maps. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ControlDevices = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const CONTROL_POTENTIALS = ["DC+", "DC0", "AC+", "AC0"];
  const coil = { coilVoltage: 230, coilCurrent: "AC", coilPhase: "L1" };
  const contacts = { contactPotential: "L1", contactVoltage: 24 };
  const item = (type, name, detail, modules, photo, config = {}, category = "Керування") => ({ type, name, detail, category, modules, rating: detail.split(" · ")[0], phase: /-3p$/.test(type) ? "3P" : "L1", cable: "1.5", load: 0, accent: "#3d6d88", face: "control", photo, photoScale: 1, config });
  const COMPONENTS = [
    item("power-supply", "Блок живлення AC/DC", "230 В → 24/12 В DC · налаштовується", 3, "power-supply.svg", { outputVoltage: 24, outputPower: 60 }),
    item("control-transformer", "Трансформатор керування", "230 В → 24/12 В AC", 3, "power-supply.svg", { outputVoltage: 24, outputPower: 63 }),
    item("control-relay", "Проміжне реле", "230 В AC / 24/12 В DC · 1CO", 2, "control-relay.svg", { ...coil, ...contacts, contactCurrent: 10 }),
    item("time-relay", "Реле часу", "Затримка / імпульс / цикл", 2, "timer-relay.svg", { ...coil, ...contacts, delaySeconds: 5, timerMode: "on-delay", contactCurrent: 8 }),
    item("star-delta-relay", "Реле зірка–трикутник", "Y–Δ · час пуску й пауза", 2, "timer-relay.svg", { ...coil, ...contacts, delaySeconds: 5, transitionSeconds: .1, contactCurrent: 8 }),
    item("contactor-2p", "Магнітний контактор 2P", "2 полюси · котушка AC/DC", 3, "contactor-2p.svg", { ...coil, powerCurrent: 25, powerConnection: "L-N", secondPhase: "L2" }),
    item("contactor-3p", "Магнітний контактор 3P", "3 полюси · котушка AC/DC", 3, "contactor-3p.svg", { ...coil, powerCurrent: 25 }),
    item("phase-monitor", "Трифазне реле контролю напруги", "L1/L2/L3/N · вихід на контактор", 3, "timer-relay.svg", { ...contacts, lowerVoltage: 180, upperVoltage: 250, delaySeconds: 5, contactCurrent: 8 }),
    item("motor-protection-3p", "Автомат захисту двигуна 3P", "Регульований струм двигуна", 3, "motor-protection.svg", { powerCurrent: 6.3 }, "Захист"),
    item("thermal-overload-3p", "Теплове реле двигуна", "3 полюси · NC 95–96 / NO 97–98", 3, "motor-protection.svg", { powerCurrent: 6.3, ...contacts }, "Захист"),
    item("fuse-holder", "Тримач запобіжника", "1P · плавка вставка", 1, "mcb-1p.png", { powerCurrent: 6 }, "Захист"),
    item("pushbutton-no", "Кнопка пуск NO", "Нормально відкритий контакт", 1, "control-relay.svg", { ...contacts }),
    item("pushbutton-nc", "Кнопка стоп NC", "Нормально закритий контакт", 1, "control-relay.svg", { ...contacts }),
    item("indicator", "Сигнальна лампа", "230 В AC / 24/12 В DC", 1, "indicator.svg", { ...coil }),
    item("din-socket", "Розетка на DIN-рейку", "230 В · L/N/PE", 2, "outlet.svg", {}, "Монтаж"),
  ];
  const configFor = (type) => COMPONENTS.find((component) => component.type === type)?.config || (type === "relay" ? { powerCurrent: 40, lowerVoltage: 180, upperVoltage: 250, delaySeconds: 5 } : null);
  const get = (device, field) => device[field] ?? configFor(device.type)?.[field];
  const rating = (device) => {
    const config = configFor(device.type);
    if (!config) return device.rating;
    if ("outputVoltage" in config) return `${get(device, "outputVoltage")}V ${device.type === "power-supply" ? "DC" : "AC"} · ${get(device, "outputPower")}${device.type === "power-supply" ? "W" : "VA"}`;
    if ("coilVoltage" in config) return `${"powerCurrent" in config ? `${get(device, "powerCurrent")}A · ` : ""}${get(device, "coilVoltage")}V ${get(device, "coilCurrent")}`;
    if ("powerCurrent" in config) return `${get(device, "powerCurrent")}A`;
    return device.rating;
  };
  const has = (device) => COMPONENTS.some((component) => component.type === device?.type);
  const prefix = (type) => ({ "power-supply": "PS", "control-transformer": "T", "control-relay": "K", "time-relay": "KT", "star-delta-relay": "KT", "contactor-2p": "KM", "contactor-3p": "KM", "phase-monitor": "KV", "motor-protection-3p": "QF", "thermal-overload-3p": "FR", "fuse-holder": "FU", "pushbutton-no": "SB", "pushbutton-nc": "SB", indicator: "HL", "din-socket": "XS", relay: "KV" }[type]);
  const isControlPotential = (potential) => CONTROL_POTENTIALS.includes(potential);
  function supply(port) {
    if (port?.currentKind) return { kind: port.currentKind, voltage: Number(port.voltageV) };
    return { kind: "AC", voltage: 230 };
  }
  function label(port) {
    return `${port.potential}${port.currentKind ? ` · ${port.voltageV} В ${port.currentKind}` : ""}`;
  }
  function terminals(device) {
    if (!has(device)) return null;
    const phase = ["L1", "L2", "L3"].includes(device.phase) ? device.phase : "L1";
    const p = (portId, name, potential, side, x, data = {}) => ({ portId, label: name, potential, side, x, ...data });
    const type = device.type;
    const coilPorts = () => {
      const voltageV = Number(get(device, "coilVoltage")), currentKind = get(device, "coilCurrent");
      const potentials = currentKind === "DC" ? ["DC+", "DC0"] : voltageV === 230 ? [get(device, "coilPhase") || phase, "N"] : ["AC+", "AC0"];
      return [p("A1", "A1", potentials[0], "left", .5, { voltageV, currentKind, control: true }), p("A2", "A2", potentials[1], "right", .5, { voltageV, currentKind, control: true })];
    };
    const contactPorts = (ids = ["11", "12", "14"]) => {
      const potential = get(device, "contactPotential") || phase;
      const data = isControlPotential(potential) ? { currentKind: potential.startsWith("DC") ? "DC" : "AC", voltageV: Number(get(device, "contactVoltage")) } : {};
      return ids.map((id, index) => p(id, id, potential, "top", (index + .5) / ids.length, { ...data, control: true }));
    };
    const powerPoles = (count) => {
      const potentials = count === 3 ? ["L1", "L2", "L3"] : [phase, get(device, "powerConnection") === "L-L" ? get(device, "secondPhase") : "N"];
      return potentials.flatMap((potential, index) => [p(`P${index + 1}-in`, `${index * 2 + 1}`, potential, "top", (index + .5) / count), p(`P${index + 1}-out`, `${index * 2 + 2}`, potential, "bottom", (index + .5) / count)]);
    };
    if (["power-supply", "control-transformer"].includes(type)) {
      const voltageV = Number(get(device, "outputVoltage")), dc = type === "power-supply", currentKind = dc ? "DC" : "AC";
      return [p("L-in", "L", phase, "top", 1 / 6), p("N-in", "N", "N", "top", .5), p("PE", "PE", "PE", "top", 5 / 6), p("out+", dc ? `+${voltageV}V` : `${voltageV}V~`, dc ? "DC+" : "AC+", "bottom", .25, { voltageV, currentKind }), p("out0", dc ? "0V" : "0V~", dc ? "DC0" : "AC0", "bottom", .75, { voltageV, currentKind })];
    }
    if (["control-relay", "time-relay"].includes(type)) return [...contactPorts(), ...coilPorts()];
    if (type === "star-delta-relay") return [...contactPorts(["C", "Y", "Δ"]), ...coilPorts()];
    if (type === "contactor-2p" || type === "contactor-3p") return [...powerPoles(type === "contactor-2p" ? 2 : 3), ...coilPorts()];
    if (type === "phase-monitor") return [...["L1", "L2", "L3", "N"].map((potential, index) => p(`${potential}-in`, potential, potential, "bottom", (index + .5) / 4)), ...contactPorts()];
    if (type === "motor-protection-3p") return powerPoles(3);
    if (type === "thermal-overload-3p") return [...powerPoles(3), ...contactPorts(["95", "96", "97", "98"]).map((port, index) => ({ ...port, side: index < 2 ? "left" : "right", y: index % 2 ? .75 : .3 }))];
    if (type === "fuse-holder") return [p("in", "1", phase, "top", .5), p("out", "2", phase, "bottom", .5)];
    if (type === "pushbutton-no") return contactPorts(["13", "14"]);
    if (type === "pushbutton-nc") return contactPorts(["21", "22"]);
    if (type === "indicator") return coilPorts();
    if (type === "din-socket") return [p("L-in", "L", phase, "top", 1 / 6), p("N-in", "N", "N", "top", .5), p("PE", "PE", "PE", "top", 5 / 6)];
    return [];
  }
  function validate(device) {
    const errors = [];
    const defaults = configFor(device.type);
    if (!defaults) return errors;
    for (const field of ["outputVoltage", "outputPower", "coilVoltage", "powerCurrent", "contactCurrent", "contactVoltage", "delaySeconds", "transitionSeconds"]) {
      if (field in defaults && !(Number(get(device, field)) > 0 && Number(get(device, field)) <= (field.includes("Seconds") ? 86400 : field.includes("Voltage") ? 500 : 10000))) errors.push(`Перевірте параметр «${FIELDS[field]?.label || field}»`);
    }
    if ("coilCurrent" in defaults && !["AC", "DC"].includes(get(device, "coilCurrent"))) errors.push("Живлення котушки повинно бути AC або DC");
    if ("outputVoltage" in defaults && Number(get(device, "outputVoltage")) > 60) errors.push("Для цієї моделі вихід повинен бути не більше 60 В");
    if ("lowerVoltage" in defaults && !(Number(get(device, "lowerVoltage")) > 0 && Number(get(device, "lowerVoltage")) < Number(get(device, "upperVoltage")))) errors.push("Нижня межа напруги повинна бути меншою за верхню");
    if (device.type === "contactor-2p" && get(device, "powerConnection") === "L-L" && (device.phase || "L1") === get(device, "secondPhase")) errors.push("Для двох фаз оберіть різні фазні провідники");
    Object.keys(defaults).forEach((field) => { if (FIELDS[field]?.options && !FIELDS[field].options.some(([key]) => key === get(device, field))) errors.push(`Перевірте ${FIELDS[field].label}`); });
    return errors;
  }
  function internalLinks(device) {
    if (["contactor-2p", "contactor-3p", "motor-protection-3p", "thermal-overload-3p"].includes(device.type)) return Array.from({ length: device.type === "contactor-2p" ? 2 : 3 }, (_, index) => [`P${index + 1}-in`, `P${index + 1}-out`]);
    if (device.type === "fuse-holder") return [["in", "out"]];
    return [];
  }
  const FIELDS = {
    outputVoltage: { label: "Вихідна напруга, В", min: 1, max: 60, step: .1 }, outputPower: { label: "Номінальна потужність, Вт / ВА", min: 1, max: 10000, step: 1 },
    coilVoltage: { label: "Напруга котушки / живлення, В", min: 1, max: 500, step: 1 }, coilCurrent: { label: "Живлення котушки", options: [["AC", "Змінне (AC)"], ["DC", "Постійне (DC)"]] }, coilPhase: { label: "Фаза котушки 230 В AC", options: ["L1", "L2", "L3"].map((value) => [value, value]) },
    contactPotential: { label: "Коло комутованих контактів", options: ["L1", "L2", "L3", "DC+", "AC+"].map((value) => [value, value]) }, contactVoltage: { label: "Напруга контактного кола DC/AC, В", min: 1, max: 500, step: 1 },
    contactCurrent: { label: "Номінал допоміжних контактів, A", min: .1, max: 1000, step: .1 }, powerCurrent: { label: "Номінальний / заданий струм, A", min: .1, max: 1000, step: .1 }, powerConnection: { label: "Потужні полюси 2P", options: [["L-N", "Фаза + нейтраль"], ["L-L", "Дві фази"]] },
    secondPhase: { label: "Другий фазний полюс для L–L", options: ["L1", "L2", "L3"].map((value) => [value, value]) },
    delaySeconds: { label: "Час / затримка, с", min: .01, max: 86400, step: .1 }, transitionSeconds: { label: "Пауза переходу Y → Δ, с", min: .01, max: 86400, step: .01 },
    timerMode: { label: "Режим реле часу", options: [["on-delay", "Затримка увімкнення"], ["off-delay", "Затримка вимкнення"], ["pulse", "Імпульс"], ["cycle", "Цикл"]] },
    lowerVoltage: { label: "Нижня межа напруги, В", min: 1, max: 500, step: 1 }, upperVoltage: { label: "Верхня межа напруги, В", min: 1, max: 500, step: 1 },
  };
  return { COMPONENTS, CONTROL_POTENTIALS, FIELDS, configFor, get, rating, prefix, has, supply, label, terminals, internalLinks, validate, isControlPotential };
});

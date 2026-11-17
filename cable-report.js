/* Quantities of complete floor routes and explicitly measured panel wires. */
(function (root, factory) {
  const F = typeof module === "object" && module.exports ? require("./floor-plan.js") : root.PanelFloorPlan;
  const api = factory(F);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PanelCableReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (F) {
  "use strict";
  const round = (n) => Math.round(n * 1000) / 1000;
  const positive = (value) => ["number", "string"].includes(typeof value) && value !== "" && Number.isFinite(Number(value)) && Number(value) > 0;
  const text = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 100) : "";
  const keyText = (value) => text(value).normalize("NFKC").toLocaleLowerCase("uk-UA");
  function profile(device) {
    const cores = Number(device.cableCores);
    return { type: text(device.cableType), color: text(device.cableColor), cores: Number.isInteger(cores) && cores >= 1 && cores <= 24 ? cores : device.phase === "3P" ? 5 : 3, section: positive(device.cable) ? Number(device.cable) : null, material: "Cu" };
  }
  function group(items) {
    const groups = new Map();
    for (const item of items) {
      const key = JSON.stringify([item.kind, keyText(item.type), item.color, item.cores, item.section, item.material]);
      if (!groups.has(key)) groups.set(key, { ...item, labels: [], circuits: 0, segments: 0, installedM: 0, reserveM: 0, purchaseM: 0, missing: 0 });
      const row = groups.get(key); row.labels.push(item.label); row.circuits++;
      if (!item.complete) { row.missing++; continue; }
      row.segments += item.segments; row.installedM = round(row.installedM + item.installedM); row.reserveM = round(row.reserveM + item.reserveM); row.purchaseM = round(row.purchaseM + item.purchaseM);
    }
    return [...groups.values()].sort((a, b) => a.type.localeCompare(b.type, "uk") || a.color.localeCompare(b.color, "uk") || a.cores - b.cores || (a.section || 0) - (b.section || 0) || a.material.localeCompare(b.material));
  }
  function totals(rows) {
    return rows.reduce((sum, row) => ({ circuits: sum.circuits + row.circuits, segments: sum.segments + row.segments, installedM: round(sum.installedM + row.installedM), reserveM: round(sum.reserveM + row.reserveM), purchaseM: round(sum.purchaseM + row.purchaseM), missing: sum.missing + row.missing }), { circuits: 0, segments: 0, installedM: 0, reserveM: 0, purchaseM: 0, missing: 0 });
  }
  function calculate(project, floorReport) {
    const floor = floorReport === undefined ? project.floorPlan ? F.calculate(project) : null : floorReport;
    const devices = new Map(project.devices.map((d) => [d.id, d]));
    const cables = group((floor?.circuits || []).map((c) => ({ kind: "cable", ...profile(devices.get(c.deviceId) || {}), label: c.label, segments: c.legs.length, installedM: c.installedM, reserveM: c.reserveM, purchaseM: c.purchaseM, complete: !c.incomplete })));
    const wires = group((project.wires || []).map((w) => ({ kind: "wire", type: text(w.wireType), color: text(w.color), cores: 1, section: positive(w.section) ? Number(w.section) : null, material: w.material === "Al" ? "Al" : "Cu", label: w.label, segments: 1, installedM: positive(w.lengthM) ? Number(w.lengthM) : 0, reserveM: 0, purchaseM: positive(w.lengthM) ? Number(w.lengthM) : 0, complete: positive(w.lengthM) })));
    return { hasPlan: Boolean(floor), cables, cableTotals: totals(cables), wires, wireTotals: totals(wires), profiles: F.branches(project).map((d) => ({ id: d.id, label: d.label, name: d.name, ...profile(d) })) };
  }
  function csvRows(report, colors = {}, { includeWires = true } = {}) {
    const rows = [], color = (key) => colors[key]?.label || key || "Не задано";
    const add = (title, groups, sum) => {
      rows.push([], [title], ["Тип", "Колір", "Жил", "Переріз, мм²", "Матеріал", "Кола / проводи", "Відомих ділянок", "Без запасу, м", "Запас, м", "Закупівля, м", "Неповних позицій"]);
      groups.forEach((g) => { const unknown = g.missing > 0 && g.missing === g.circuits; rows.push([g.type || "Тип не задано", color(g.color), g.cores, g.section ?? "", g.material, g.labels.join(", "), g.segments, unknown ? "" : g.installedM, unknown ? "" : g.reserveM, unknown ? "" : g.purchaseM, g.missing]); });
      const unknown = sum.missing > 0 && sum.missing === sum.circuits;
      rows.push([unknown ? "Довжини не визначені" : sum.missing ? "Підсумок відомих довжин" : "Разом", "", "", "", "", sum.circuits, sum.segments, unknown ? "" : sum.installedM, unknown ? "" : sum.reserveM, unknown ? "" : sum.purchaseM, sum.missing]);
    };
    if (report.hasPlan) add("Кабелі приміщень за типом, кольором, жилами та перерізом", report.cables, report.cableTotals);
    else rows.push([], ["Кабелі приміщень", "Побудуйте план для розрахунку метражу"]);
    if (includeWires) add("Монтажні проводи за введеними довжинами", report.wires, report.wireTotals);
    return rows;
  }
  return { profile, calculate, csvRows };
});

/* Grouping and destinations use issue IDs, never translated message parsing. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PanelProjectIssues = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const supplyFields = { "supply-voltage": "voltage", "unsupported-voltage": "voltage", "source-data": "dataConfirmed", earthing: "earthing", "earthing-changed": "earthing", "tt-review": "earthing", installation: "installationMethod", "feeder-iz": "feederIzA", "incoming-i2": "i2A", "fault-max": "maxIccA", "upstream-drop": "upstreamDropPct", "contract-power": "contractKw", "contract-overload": "contractKw", "surge-review": "surgeAssessment", "incoming-icn": "icnA", "feeder-overload": "feederIzA", "feeder-conventional": "i2A" };
  const circuitFields = { "circuit-purpose": "purpose", "load-input": "load", "breaker-rating": "rating", "minimum-section": "cable", "branch-overload": "rating", "branch-iz": "izA", "cable-source": "cableSource", "cable-overload": "izA", "conventional-trip": "i2A", "conventional-overload": "i2A", "branch-icn": "icnA", "fault-min": "minFaultA", "magnetic-trip": "minFaultA", "cable-length": "lengthM", "voltage-drop": "lengthM", rcd: "rcdId", "bath-afdd": "purpose", "group-rcd-missing": "rcdId", "parallel-outputs": "outputId", "unregistered-consumer": "outputId" };
  function target(project, issue) {
    const id = issue.entityId, device = project.devices.find((d) => d.id === id);
    if (issue.code === "floor-length-review" || issue.code === "floor-length-stale") return { view: "floor", field: issue.code === "floor-length-review" ? "floorConfirmedInput" : "floorSyncButton", circuitId: id, label: "Перевірити план" };
    if (id === "board" && supplyFields[issue.code]) return { view: "design", supply: supplyFields[issue.code], label: "Заповнити дані" };
    if (device && circuitFields[issue.code] && project.design?.circuits.some((c) => c.deviceId === id)) return { view: "design", entityId: id, field: circuitFields[issue.code], label: "Перевірити параметр" };
    for (const [kind, list] of [["device", project.devices], ["wire", project.wires], ["busbar", project.busbars], ["comb", project.combs], ["consumer", project.consumers]]) if (list?.some((item) => item.id === id)) return { view: "board", kind, entityId: id, label: "Показати на компоновці" };
    return { view: "design", entityId: id !== "board" ? id : "", label: id === "board" ? "Перевірити вихідні дані" : "Перевірити коло" };
  }
  function groups(project, issues) {
    const map = new Map();
    issues.forEach((issue, index) => {
      const key = issue.entityId || "board", entity = [...project.devices, ...(project.consumers || []), ...(project.busbars || []), ...(project.wires || []), ...(project.combs || [])].find((item) => item.id === key);
      if (!map.has(key)) map.set(key, { key, title: key === "board" ? "Ввід і вихідні дані" : entity ? `${entity.name || "З’єднання"}${entity.label ? ` · ${entity.label}` : ""}` : "Видалене або непризначене коло", errors: 0, pending: 0, items: [] });
      const group = map.get(key); group[issue.level === "error" ? "errors" : "pending"]++;
      group.items.push({ ...issue, index, target: target(project, issue) });
    });
    return [...map.values()].sort((a, b) => Number(b.errors > 0) - Number(a.errors > 0));
  }
  return { groups, target };
});

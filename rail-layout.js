/* Ordered insertion into DIN rows; no input mutation or electrical rewiring. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./mechanical.js"));
  else root.PanelRailLayout = factory(root.PanelMechanical);
})(typeof globalThis !== "undefined" ? globalThis : this, function (M) {
  const copy = (value) => JSON.parse(JSON.stringify(value));
  function items(project, ignoredId) {
    return [...project.devices.filter((d) => d.id !== ignoredId).map((entity) => ({ entity, modules: M.modulesFor(entity, project.board) })), ...(project.busbars || []).filter((bar) => bar.zone === "din").map((entity) => ({ entity, modules: M.barModules(entity, project.board) }))].sort((a, b) => a.entity.row - b.entity.row || a.entity.slot - b.entity.slot);
  }
  function boundary(project, row, position, movingId = null) {
    const capacity = Number(project.board.modulesPerRow), x = Math.max(0, Math.min(capacity, position));
    const own = project.devices.find((d) => d.id === movingId);
    if (own?.row === row && x >= own.slot && x < own.slot + M.modulesFor(own, project.board)) return own.slot;
    const hit = items(project, movingId).find(({ entity, modules }) => entity.row === row && x >= entity.slot && x < entity.slot + modules);
    return hit ? x < hit.entity.slot + hit.modules / 2 ? hit.entity.slot : hit.entity.slot + hit.modules : Math.floor(x);
  }
  function place(project, device, row, slot) {
    M.boardGeometry(project.board);
    const board = { rows: Number(project.board.rows), modulesPerRow: Number(project.board.modulesPerRow) }, width = M.modulesFor(device, project.board), old = project.devices.find((d) => d.id === device.id);
    if (!Number.isInteger(row) || row < 0 || row >= board.rows || !Number.isInteger(slot) || slot < 0 || slot > board.modulesPerRow) throw new Error("Виберіть місце на наявній DIN-рейці.");
    if (width > board.modulesPerRow) throw new Error("Апарат ширший за DIN-рейку. Збільште кількість модулів у ряду.");
    const p = copy(project), incoming = copy(device), ordered = items(p, device.id);
    const original = new Map([...project.devices, ...(project.busbars || [])].map((entity) => [entity.id, { row: entity.row, slot: entity.slot }]));
    if (old && row === old.row && slot >= old.slot && slot <= old.slot + width) return { project: p, device: p.devices.find((d) => d.id === old.id), shifted: [], movedIds: [], target: { row: old.row, slot: old.slot } };
    // Moving forward within a contiguous run closes the vacated place.
    // Deliberate gaps elsewhere and the positions before insertion stay intact.
    if (old?.row === row && slot > old.slot + width) {
      const between = ordered.filter(({ entity }) => entity.row === row && entity.slot >= old.slot + width && entity.slot < slot);
      let end = old.slot + width;
      const contiguous = between.every(({ entity, modules }) => { const adjacent = entity.slot === end; end = entity.slot + modules; return adjacent; });
      if (contiguous && end === slot) { between.forEach(({ entity }) => { entity.slot -= width; }); slot -= width; }
    }
    const intersected = ordered.find(({ entity, modules }) => entity.row === row && entity.slot < slot && entity.slot + modules > slot);
    if (intersected) slot = intersected.entity.slot;
    function fit(atRow, atSlot, modules) {
      if (atSlot + modules > board.modulesPerRow) { atRow++; atSlot = 0; }
      if (atRow >= board.rows) throw new Error("Для вставлення бракує місця на наступних рейках. Збільште кількість рейок або модулів у ряду.");
      return { row: atRow, slot: atSlot };
    }
    const tail = ordered.filter(({ entity }) => entity.row > row || entity.row === row && entity.slot >= slot);
    const target = fit(row, slot, width); Object.assign(incoming, target);
    let cursor = { row: target.row, slot: target.slot + width };
    for (const item of tail) {
      const beforeCursor = item.entity.row < cursor.row || item.entity.row === cursor.row && item.entity.slot < cursor.slot;
      const next = fit(beforeCursor ? cursor.row : item.entity.row, beforeCursor ? cursor.slot : item.entity.slot, item.modules);
      Object.assign(item.entity, next); cursor = { row: next.row, slot: next.slot + item.modules };
    }
    p.devices = p.devices.filter((d) => d.id !== device.id); p.devices.push(incoming);
    for (const comb of project.combs || []) {
      const rows = (model) => new Set(comb.terminals.map((ref) => model.devices.find((d) => d.id === ref.ownerId)?.row));
      if (rows(project).size === 1 && rows(p).size > 1) throw new Error(`${comb.label || "Гребінка"}: зсув розділить її апарати між рейками. Звільніть місце на цій рейці або спочатку приберіть гребінку.`);
    }
    const moved = [...p.devices, ...(p.busbars || [])].filter((entity) => { const before = original.get(entity.id); return before && (entity.row !== before.row || entity.slot !== before.slot); });
    const movedIds = new Set(moved.map((entity) => entity.id)), endpointsMoved = new Set([...movedIds, ...(p.consumers || []).filter((c) => movedIds.has(c.deviceId)).map((c) => c.id)]);
    // Endpoints follow their IDs; manual bend points belong to the old placement.
    (p.wires || []).forEach((wire) => { if ([wire.from, wire.to].some((ref) => endpointsMoved.has(ref.ownerId))) wire.points = []; });
    return { project: p, device: incoming, target, shifted: moved.filter((entity) => entity.id !== incoming.id).map((entity) => entity.id), movedIds: [...movedIds] };
  }
  return { boundary, place };
});

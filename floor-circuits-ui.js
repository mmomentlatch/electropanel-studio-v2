/* Plan circuits are independent of the panel until the user rebuilds it. */
let floorCircuitFormTarget = null;
let floorCircuitSuggestedName = "";

function suggestFloorCircuitName() {
  const kind = $("#floorCircuitKind").value, room = project.floorPlan.rooms.find((r) => r.id === $("#floorCircuitRoom").value);
  const name = `${F.CIRCUIT_KINDS[kind]}${room ? ` · ${room.name}` : ""}`, input = $("#floorCircuitName");
  if (!input.value.trim() || input.value === floorCircuitSuggestedName) input.value = name;
  floorCircuitSuggestedName = name;
}
function openFloorCircuits(fromPoint = false) {
  if (floorPencilActive && floorPencilVertices.length) { toast("Завершіть або скасуйте контур кімнати перед створенням кола.", "error"); return; }
  stopFloorPencil(); stopFloorConnections(); floorGeometryEditing = false;
  const point = project.floorPlan.points.find((p) => p.id === floorSelectedId && p.type !== "panel");
  floorCircuitFormTarget = fromPoint ? point?.id || null : null;
  requestFloorSidebar("circuits"); renderFloorPlan();
  $("#floorCircuitRoom").value = point?.roomId || floorRoomId || "";
  $("#floorCircuitKind").value = point && ["light", "switch"].includes(point.type) ? "lighting" : point?.type === "equipment" ? "equipment" : "sockets";
  $("#floorCircuitSection").value = $("#floorCircuitKind").value === "lighting" ? "1.5" : "2.5";
  $("#floorCircuitPower").value = ""; $("#floorCircuitName").value = "";
  $("#floorCircuitAssignPoint").checked = Boolean(floorCircuitFormTarget);
  $("#floorCircuitAssignRoom").checked = true;
  suggestFloorCircuitName(); renderFloorCircuits();
}
function renderFloorCircuits(report = null) {
  const plan = project.floorPlan; if (!plan) return;
  const select = $("#floorCircuitRoom"), previous = select.value;
  select.innerHTML = '<option value="">Без прив’язки до кімнати</option>' + plan.rooms.map((room) => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.name)}</option>`).join("");
  select.value = plan.rooms.some((room) => room.id === previous) ? previous : "";
  const point = plan.points.find((p) => p.id === floorCircuitFormTarget && p.type !== "panel");
  $("#floorCircuitPointChoice").classList.toggle("hidden", !point);
  $("#floorCircuitPointLabel").textContent = point ? `Призначити точці ${point.label} · ${point.name}` : "Призначити вибраній точці";
  $("#floorCircuitsList").innerHTML = F.branches(project).map((circuit) => {
    const count = plan.points.filter((p) => p.circuitId === circuit.id).length;
    return `<div class="floor-circuit-row"><button type="button" class="floor-circuit-select" data-floor-use-circuit="${escapeHtml(circuit.id)}"><strong>${escapeHtml(circuit.label)} · ${escapeHtml(circuit.name)}</strong><small>${circuit.planned ? "Лише на плані" : "Із поточного щита"} · точок: ${count}</small></button><button type="button" class="icon-button danger" data-floor-remove-circuit="${escapeHtml(circuit.id)}" aria-label="Видалити коло ${escapeHtml(circuit.label)}" title="Прибрати коло з плану. Точки залишаться без кола; поточний щит зберігається. «Назад» повертає зміну."><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/></svg></button></div>`;
  }).join("") || '<p class="floor-help">Кіл ще немає. Створіть освітлення, розетки або окрему лінію для приладу.</p>';
  $("#floorCircuitsMode").setAttribute("aria-pressed", String(floorSidebarTab === "circuits"));
  renderFloorCircuitStatus(report);
}
function renderFloorCircuitStatus(report = null) {
  const point = project.floorPlan?.points.find((p) => p.id === floorSelectedId), notice = $("#floorPointConnectionStatus");
  $("#floorNewCircuitForPoint").classList.toggle("hidden", !point || point.type === "panel");
  notice.classList.toggle("hidden", !point || point.type === "panel");
  if (!point || point.type === "panel") return;
  const currentId = $("#floorPointCircuit").value, circuit = F.branches(project).find((c) => c.id === currentId);
  let text = "Коло не призначено. Виберіть наявне або створіть нове. Потім натисніть «Застосувати» — без кола траса не будується.", warning = true;
  if (circuit) {
    const changed = currentId !== point.circuitId || $("#floorPointSource").value !== (point.supplyFromId || "");
    if (changed) text = "Підключення ще не застосоване. Натисніть «Застосувати», щоб оновити трасу.";
    else if (report) {
      const route = report.circuits.find((c) => c.deviceId === point.circuitId)?.legs.find((leg) => leg.toId === point.id);
      if (route) { warning = false; text = `Траса побудована: ${F.sourceFor(project.floorPlan, point)?.label} → ${point.label}.${circuit.planned ? " Коло поки лише на плані; щит оновлюється окремо." : ""}`; }
      else text = report.errors.find((message) => message.includes(`${point.label}:`)) || "Траса не побудована. Перевірте джерело живлення та спільні стіни між кімнатами.";
    } else { warning = false; text = "Коло вибране. Зміни підключення збережуться кнопкою «Застосувати»."; }
  }
  notice.textContent = text; notice.classList.toggle("warning", warning);
}
function commitFloorCircuitChange(next) {
  const before = project.floorPlan;
  const drafts = typeof pendingFloorForms === "function" ? pendingFloorForms().filter((d) => d.kind === "point") : [];
  if (!commitFloorPlan(next)) return false;
  for (const saved of drafts) {
    const old = before.points.find((p) => p.id === saved.entityId), point = project.floorPlan.points.find((p) => p.id === saved.entityId);
    if (!old || !point || old.circuitId === point.circuitId && old.supplyFromId === point.supplyFromId) continue;
    const model = floorFormModel("point", point.id);
    const draft = floorFormDrafts.open(saved, model.values, model.revision);
    floorFormDrafts.edit(draft.key, { ...draft.values, floorPointCircuit: point.circuitId, floorPointSource: point.supplyFromId || "" });
    if (!saved.stale) floorFormDrafts.rebase(draft.key);
  }
  if (drafts.length) renderFloorPlan();
  return true;
}
function createFloorCircuit() {
  try {
    const result = F.createCircuit(project, { kind: $("#floorCircuitKind").value, roomId: $("#floorCircuitRoom").value, name: $("#floorCircuitName").value.trim(), sectionMm2: $("#floorCircuitSection").value === "" ? null : Number($("#floorCircuitSection").value), powerKw: $("#floorCircuitPower").value === "" ? null : Number($("#floorCircuitPower").value), assignRoom: $("#floorCircuitAssignRoom").checked, pointIds: floorCircuitFormTarget && $("#floorCircuitAssignPoint").checked ? [floorCircuitFormTarget] : [] });
    const previous = floorCircuitId; floorCircuitId = result.circuit.id;
    if (!commitFloorCircuitChange(result.plan)) { floorCircuitId = previous; return; }
    const selected = project.floorPlan.points.find((p) => p.id === floorCircuitFormTarget);
    if (selected?.circuitId === result.circuit.id) { floorSelectedId = selected.id; requestFloorSidebar("points"); }
    $("#floorShowRoutes").checked = true; renderFloorPlan();
    toast(`Створено ${result.circuit.label} · ${result.circuit.name}. Щит оновлюється окремою кнопкою.`);
  } catch (error) { toast(error.message, "error"); }
}
function initFloorCircuits() {
  $("#floorCircuitsMode").addEventListener("click", () => openFloorCircuits());
  $("#floorNewCircuitForPoint").addEventListener("click", () => openFloorCircuits(true));
  $("#floorCreateCircuit").addEventListener("click", createFloorCircuit);
  $("#floorCircuitRoom").addEventListener("change", suggestFloorCircuitName);
  $("#floorCircuitKind").addEventListener("change", () => { $("#floorCircuitSection").value = $("#floorCircuitKind").value === "lighting" ? "1.5" : "2.5"; suggestFloorCircuitName(); });
  ["#floorPointCircuit", "#floorPointSource"].forEach((selector) => $(selector).addEventListener("change", () => renderFloorCircuitStatus()));
  $("#floorCircuitsList").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-floor-remove-circuit]"), use = event.target.closest("[data-floor-use-circuit]");
    if (remove) {
      try { const id = remove.dataset.floorRemoveCircuit, next = F.removeCircuit(project, id); if (floorCircuitId === id) floorCircuitId = ""; if (commitFloorCircuitChange(next)) toast("Коло прибрано з плану. Точки збережено без кола. «Назад» повертає зміну."); }
      catch (error) { toast(error.message, "error"); }
    } else if (use) {
      floorCircuitId = use.dataset.floorUseCircuit;
      const point = project.floorPlan.points.find((p) => p.circuitId === floorCircuitId), circuit = F.branches(project).find((c) => c.id === floorCircuitId);
      floorSelectedId = point?.id || null; floorRoomId = point?.roomId || circuit?.roomId || floorRoomId;
      requestFloorSidebar("points"); $("#floorShowRoutes").checked = true; renderFloorPlan();
    }
  });
}

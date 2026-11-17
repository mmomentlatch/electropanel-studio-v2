/* Form drafts never mutate the project until the user applies them. */
let floorDraftStorage = null;
try { floorDraftStorage = sessionStorage; } catch { /* Keep this tab's drafts in memory. */ }
const floorFormDrafts = PanelFormDrafts.create(floorDraftStorage);
const floorFormFields = {
  point: ["floorPointName", "floorPointLabel", "floorPointRoom", "floorPointX", "floorPointY", "floorPointHeight", "floorPointAtCeiling", "floorJunctionMounting", "floorPointCircuit", "floorPointSource", "floorPointControls"],
  room: ["floorRoomName", "floorRoomWidth", "floorRoomDepth", "floorRoomRow", "floorRoomDoor", "floorRoomWindow", "floorOutsideLevel"],
  settings: ["floorCeilingInput", "floorRoutingInput", "floorWallInput", "floorReserveInput", "floorAllowanceInput", "floorConfirmedInput", "floorAutoLengthsInput"]
};
const floorFormChecks = new Set(["floorPointAtCeiling", "floorConfirmedInput", "floorAutoLengthsInput"]);
const floorFormContexts = { point: null, room: null, settings: null };
let floorFormApplyingKey = null;

function floorFormModel(kind, id) {
  const plan = project.floorPlan;
  if (!plan) return null;
  if (kind === "settings") {
    const values = { floorCeilingInput: String(plan.ceilingHeightM), floorRoutingInput: plan.routing, floorWallInput: String(plan.wallThicknessM), floorReserveInput: String(plan.reservePercent), floorAllowanceInput: String(plan.endAllowanceM), floorConfirmedInput: Boolean(plan.geometryConfirmed), floorAutoLengthsInput: Boolean(plan.syncWithCircuits) };
    return { values, label: "Параметри плану", revision: JSON.stringify([values, plan.geometryMode, Boolean(plan.rooms.length)]) };
  }
  const room = F.layout(plan).rooms.find((r) => r.id === (kind === "room" ? id : plan.points.find((p) => p.id === id)?.roomId));
  if (!room) return null;
  if (kind === "room") {
    return { label: room.name, revision: JSON.stringify([plan.rooms, plan.wallThicknessM, plan.geometryMode]), values: { floorRoomName: room.name, floorRoomWidth: String(floorPrecise(room.widthM)), floorRoomDepth: String(floorPrecise(room.depthM)), floorRoomRow: room.row || "", floorRoomDoor: String(Math.round(room.doorU * 100)), floorRoomWindow: room.windowWall || "none", floorOutsideLevel: String(room.routeLevelM ?? 0) } };
  }
  const point = plan.points.find((p) => p.id === id);
  const values = { floorPointName: point.name, floorPointLabel: point.label, floorPointRoom: point.roomId, floorPointX: (point.u * room.widthM).toFixed(2), floorPointY: (point.v * room.depthM).toFixed(2), floorPointHeight: String(F.pointHeight(plan, point)), floorPointAtCeiling: point.heightM === null, floorJunctionMounting: point.type === "junction" ? F.junctionMounting(plan, point) : "wall", floorPointCircuit: point.circuitId || "", floorPointSource: point.supplyFromId || "", floorPointControls: point.controlsId || "" };
  if (point.type === "junction") values.junctionIds = plan.points.filter((p) => p.type !== "switch" && p.supplyFromId === id).map((p) => p.id).sort();
  return { label: `${point.label} · ${point.name}`, values, revision: JSON.stringify(point.type === "junction" ? plan : [point, plan.rooms, plan.ceilingHeightM, plan.points.map((p) => [p.id, p.circuitId, p.supplyFromId, p.controlsId])]) };
}

function restoreFloorForm(kind, entityId = "") {
  const model = floorFormModel(kind, entityId);
  if (!model) { floorFormContexts[kind] = null; renderFloorDraftIndicators(); return; }
  const draft = floorFormDrafts.open({ projectId: project.id, kind, entityId, label: model.label }, model.values, model.revision);
  floorFormContexts[kind] = draft.key;
  // Use the just-rendered values for clean forms; preserve precise model coordinates.
  floorFormFields[kind].forEach((id) => {
    const input = $(`#${id}`), value = draft.values[id];
    if (floorFormChecks.has(id)) input.checked = value;
    else {
      if (input.tagName === "SELECT" && value && ![...input.options].some((option) => option.value === value)) input.add(new Option("Потрібно вибрати знову", value));
      input.value = value;
    }
  });
  if (kind === "point") {
    const point = project.floorPlan.points.find((p) => p.id === entityId);
    if (draft.dirty) {
      const source = draft.values.floorPointSource;
      renderFloorSources(point, draft.values.floorPointCircuit);
      const select = $("#floorPointSource");
      if (select.tagName === "SELECT" && source && ![...select.options].some((o) => o.value === source)) select.add(new Option("Перевірте джерело", source));
      select.value = source;
    }
    $("#floorPointHeight").disabled = point.type === "junction" ? $("#floorJunctionMounting").value === "ceiling" : $("#floorPointAtCeiling").checked;
    if (point.type === "junction" && floorJunctionDraft) {
      floorJunctionDraft.selected = new Set(draft.values.junctionIds);
      floorJunctionDraft.circuitId = draft.values.floorPointCircuit;
      floorJunctionDraft.changed = Boolean(draft.changes.junctionIds || draft.changes.floorPointCircuit);
      floorJunctionDraft.fingerprint = draft.revision;
      renderFloorJunctionConnections();
    }
  }
  renderFloorDraftIndicators();
}

function recordFloorFormEdit(kind) {
  const key = floorFormContexts[kind]; if (!key) return;
  const values = Object.fromEntries(floorFormFields[kind].map((id) => [id, floorFormChecks.has(id) ? $(`#${id}`).checked : String($(`#${id}`).value)]));
  if (kind === "point" && floorJunctionDraft) values.junctionIds = [...floorJunctionDraft.selected].sort();
  floorFormDrafts.edit(key, values); renderFloorDraftIndicators();
}

function renderFloorDraftIndicators() {
  Object.entries(floorFormContexts).forEach(([kind, key]) => {
    const draft = key && floorFormDrafts.get(key), notice = $(`#floor${kind[0].toUpperCase() + kind.slice(1)}Draft`);
    notice.classList.toggle("hidden", !draft?.dirty);
    if (!draft?.dirty) return;
    notice.innerHTML = `<p>${draft.stale ? "Об’єкт змінився. Звірте чернетку з поточним планом перед застосуванням." : "Є незастосовані зміни. План і метраж ще не оновлені."}</p><div>${draft.stale ? `<button type="button" data-floor-draft-action="rebase" data-draft-kind="${kind}">Звірити з планом</button>` : ""}<button type="button" data-floor-draft-action="discard" data-draft-kind="${kind}">Скасувати зміни форми</button></div>`;
    notice.classList.toggle("stale", draft.stale);
  });
  if (typeof renderProjectSaveStatus === "function") renderProjectSaveStatus();
}

function applyFloorForm(kind, apply) {
  const key = floorFormContexts[kind];
  if (!key) return;
  recordFloorFormEdit(kind);
  const draft = floorFormDrafts.get(key), model = floorFormModel(kind, draft.entityId);
  if (!model) { toast("Об’єкт видалено. «Назад» поверне його разом із чернеткою.", "error"); return; }
  floorFormDrafts.open(draft, model.values, model.revision);
  if (floorFormDrafts.get(key).stale) { renderFloorDraftIndicators(); toast("Спочатку звірте чернетку з поточним планом.", "error"); return; }
  try {
    for (const id of floorFormFields[kind]) {
      const input = $(`#${id}`);
      if (input.disabled || input.type !== "number") continue;
      const number = Number(input.value);
      if (!String(input.value).trim() || !Number.isFinite(number) || input.min !== "" && input.min !== undefined && number < Number(input.min) || input.max !== "" && input.max !== undefined && number > Number(input.max)) {
        input.closest("details.floor-advanced")?.setAttribute("open", ""); input.focus(); throw new Error("Заповніть числові поля у вказаних межах.");
      }
    }
    floorFormApplyingKey = key; apply();
  } catch (error) { toast(error.message, "error"); }
  finally { floorFormApplyingKey = null; renderFloorDraftIndicators(); }
}

function completeFloorFormCommit() {
  if (floorFormApplyingKey) floorFormDrafts.remove(floorFormApplyingKey);
}
function pendingFloorForms() { return floorFormDrafts.pending(project.id); }
function revealFloorDraft(key) {
  const draft = floorFormDrafts.get(key); if (!draft || draft.projectId !== project.id) return;
  if (!floorFormModel(draft.kind, draft.entityId)) { toast("Об’єкт видалено. Поверніть його кнопкою «Назад» або скасуйте цю чернетку.", "error"); return; }
  $("#formDraftsModal").classList.add("hidden"); closeDrawers(); switchView("floor");
  if (draft.kind === "point") { setFloorGeometryMode(false); selectFloorPoint(draft.entityId); }
  else { if (draft.kind === "room") { floorRoomId = draft.entityId; floorSelectedId = null; floorGeometryEditing = project.floorPlan.geometryMode === "free"; floorWallIndex = null; floorVertexIndex = null; } requestFloorSidebar(draft.kind === "room" ? "walls" : "settings"); renderFloorPlan(); }
  const section = $(`#floor${draft.kind === "settings" ? "Template" : draft.kind[0].toUpperCase() + draft.kind.slice(1)}Editor`);
  section.open = true; section.scrollIntoView({ block: "nearest" });
}
function reviewFloorDrafts() {
  const pending = pendingFloorForms(); if (!pending.length) return;
  $("#formDraftsList").innerHTML = pending.map((draft, index) => `<li><strong>${escapeHtml(draft.label)}</strong><span>${draft.kind === "point" ? "Точка" : draft.kind === "room" ? "Кімната" : "Налаштування"}${floorFormModel(draft.kind, draft.entityId) ? "" : " · об’єкт видалено"}</span><div><button type="button" data-draft-review="${index}">Перейти</button><button type="button" data-draft-discard="${index}">Скасувати чернетку</button></div></li>`).join("");
  $("#formDraftsStorage").textContent = floorFormDrafts.storageAvailable ? "Чернетки зберігаються в цій вкладці, зокрема після її перезавантаження. До JSON входять лише застосовані зміни." : "Чернетки доступні в пам’яті цієї вкладки. Застосуйте їх перед перезавантаженням. До JSON входять лише застосовані зміни.";
  openModal("#formDraftsModal");
}
function initFloorForms() {
  Object.entries(floorFormFields).forEach(([kind, ids]) => ids.forEach((id) => ["input", "change"].forEach((event) => $(`#${id}`).addEventListener(event, () => recordFloorFormEdit(kind)))));
  $("#reviewFormDraftsButton").addEventListener("click", reviewFloorDrafts);
  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-floor-draft-action]");
    if (action) {
      const kind = action.dataset.draftKind, key = floorFormContexts[kind], draft = floorFormDrafts.get(key); if (!draft) return;
      if (action.dataset.floorDraftAction === "discard") floorFormDrafts.remove(key);
      else {
        const model = floorFormModel(kind, draft.entityId); if (!model) return;
        floorFormDrafts.open(draft, model.values, model.revision);
        let rebased = floorFormDrafts.rebase(key);
        if (rebased.values.junctionIds) {
          const live = rebased.values.junctionIds.filter((id) => project.floorPlan.points.some((p) => p.id === id && p.type !== "switch"));
          if (live.length !== rebased.values.junctionIds.length) { floorFormDrafts.edit(key, { ...rebased.values, junctionIds: live }); toast("Видалені точки прибрано з чернетки підключень. Решту вибору збережено."); }
        }
        toast("Чернетку звірено: ваші змінені поля збережено, решта взяті з плану. Перевірте їх і натисніть «Застосувати».");
      }
      renderFloorPlan();
    }
    const review = event.target.closest("[data-draft-review]"), discard = event.target.closest("[data-draft-discard]");
    if (review) { const draft = pendingFloorForms()[Number(review.dataset.draftReview)]; if (draft) revealFloorDraft(draft.key); }
    if (discard) { const draft = pendingFloorForms()[Number(discard.dataset.draftDiscard)]; if (draft) floorFormDrafts.remove(draft.key); renderFloorPlan(); if (pendingFloorForms().length) reviewFloorDrafts(); else $("#formDraftsModal").classList.add("hidden"); }
  });
}

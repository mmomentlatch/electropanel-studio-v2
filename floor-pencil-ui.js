/* Click or drag wall segments; commit only a valid closed room. */
const FPencil = PanelFloorPencil;
let floorPencilActive = false;
let floorPencilVertices = [], floorPencilRedo = [], floorPencilPointer = null;
let floorPencilGesture = null, floorPencilFrame = null, floorPencilBase = null, floorPencilSource = null, floorPencilAnimation = null;

function prepareFloorPencil() {
  if (floorPencilSource === project.floorPlan) return;
  if (floorPencilSource) clearFloorPencilDraft();
  floorPencilSource = project.floorPlan;
  floorPencilBase = F.editGeometry(project.floorPlan);
  const box = F.layout(floorPencilBase);
  floorPencilFrame = { minX: box.minX - 2.5, minY: box.minY - 2.5, width: Math.max(12, box.width + 5), height: Math.max(10, box.height + 5) };
}
function floorPencilOptions() { return floorPencilActive ? { viewport: floorPencilFrame, geometryOnly: true } : {}; }
function clearFloorPencilDraft() {
  floorPencilVertices = []; floorPencilRedo = []; floorPencilPointer = null; floorPencilGesture = null;
  if (floorPencilAnimation) { cancelAnimationFrame(floorPencilAnimation); floorPencilAnimation = null; }
}
function stopFloorPencil() {
  const wasActive = floorPencilActive;
  floorPencilActive = false; clearFloorPencilDraft(); floorPencilSource = null;
  if (wasActive && project.floorPlan?.geometryMode === "free") floorGeometryEditing = true;
  if (wasActive && project.floorPlan) renderFloorPlan();
}
function setFloorPencilMode(enabled) {
  cancelFloorInteractions();
  floorPencilActive = enabled; floorPanMode = false; floorGeometryEditing = !enabled && project.floorPlan?.geometryMode === "free";
  floorWallIndex = floorVertexIndex = null; floorScale = null;
  if (enabled) { requestFloorSidebar("pencil"); $("#floorPencilStep").value = $("#floorGeometryGrid").value; prepareFloorPencil(); }
  renderFloorPlan();
  if (enabled) $("#floorCanvas").focus({ preventScroll: true });
}
function renderFloorPencil() {
  $("#floorPencilMode").setAttribute("aria-pressed", String(floorPencilActive));
  $("#floorPencilToolbar").classList.toggle("hidden", !floorPencilActive);
  $("#floorView").classList.toggle("drawing-walls", floorPencilActive);
  $("#floorCanvas").classList.toggle("pencil-mode", floorPencilActive);
  if (floorPencilActive) $("#floorPointsMode").setAttribute("aria-pressed", "false");
  ["#floorCsvButton", "#floorSvgButton", "#floorPrintButton"].forEach((id) => { $(id).disabled = floorPencilActive && floorPencilVertices.length > 0; });
  if (floorPencilActive) { prepareFloorPencil(); updateFloorPencilControls(); }
}
function updateFloorPencilControls(message = "") {
  ["#floorCsvButton", "#floorSvgButton", "#floorPrintButton"].forEach((id) => { $(id).disabled = floorPencilActive && floorPencilVertices.length > 0; });
  $("#floorPencilFinish").disabled = floorPencilVertices.length < 3;
  const drafting = floorPencilVertices.length > 0 || floorPencilRedo.length > 0;
  $("#floorUndoButton").disabled = drafting ? !floorPencilVertices.length : !undoStack.length;
  $("#floorRedoButton").disabled = drafting ? !floorPencilRedo.length : !redoStack.length;
  $("#floorPencilCancel").disabled = !floorPencilVertices.length;
  const last = floorPencilVertices.at(-1), pointer = floorPencilPointer;
  $("#floorPencilStatus").textContent = message || (last && pointer ? `${floorNumber(Math.hypot(pointer.point.x - last.x, pointer.point.y - last.y))} м · ${pointer.hint || "Довільний кут"}` : floorPencilVertices.length ? `Кутів: ${floorPencilVertices.length} · наступний кут або Enter для замикання` : "Почніть на вільному місці або всередині кімнати, щоб виділити нову кімнату.");
}
function paintFloorPencil() {
  const svg = $("#floorCanvas .floor-svg");
  svg?.querySelector(".pencil-draft")?.remove();
  if (!floorPencilActive || !svg || !floorPencilFrame) return;
  const X = (x) => PanelFloorSvg.LEFT + (x - floorPencilFrame.minX) * PanelFloorSvg.SCALE;
  const Y = (y) => PanelFloorSvg.TOP + (y - floorPencilFrame.minY) * PanelFloorSvg.SCALE;
  const unit = 1 / svg.getScreenCTM().a;
  const path = (points) => points.map((p, i) => `${i ? "L" : "M"}${X(p.x)},${Y(p.y)}`).join(" ");
  const pointer = floorPencilPointer, last = floorPencilVertices.at(-1);
  let preview = last && pointer ? [last, pointer.point] : [];
  if (pointer?.close) { const closed = FPencil.closures(floorPencilVertices, pointer.orthogonal)[0]; preview = [...closed.slice(floorPencilVertices.length - 1), closed[0]]; }
  const marks = floorPencilVertices.map((p, i) => `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${(i ? 4 : 7) * unit}" class="${i ? "pencil-corner" : "pencil-start"}"/>`).join("");
  const label = preview.length > 1 ? `<text x="${X((preview[0].x + preview[1].x) / 2) + 7 * unit}" y="${Y((preview[0].y + preview[1].y) / 2) - 9 * unit}" style="font-size:${11 * unit}px" class="pencil-length">${floorNumber(Math.hypot(preview[1].x - preview[0].x, preview[1].y - preview[0].y))} м</text>` : "";
  svg.insertAdjacentHTML("beforeend", `<g class="pencil-draft" pointer-events="none" aria-hidden="true"><path class="pencil-drawn" d="${path(floorPencilVertices)}"/><path class="pencil-preview ${pointer?.close ? "closing" : ""}" d="${path(preview)}"/>${marks}${pointer ? `<circle class="pencil-cursor" cx="${X(pointer.point.x)}" cy="${Y(pointer.point.y)}" r="${5 * unit}"/>` : ""}${label}</g>`);
  updateFloorPencilControls();
}
function scheduleFloorPencil() {
  if (!floorPencilAnimation) floorPencilAnimation = requestAnimationFrame(() => { floorPencilAnimation = null; paintFloorPencil(); });
}
function floorPencilPoint(event) {
  const svg = $("#floorCanvas .floor-svg"), screen = svg.createSVGPoint();
  screen.x = event.clientX; screen.y = event.clientY;
  const local = screen.matrixTransform(svg.getScreenCTM().inverse()), frame = floorPencilFrame;
  const raw = { x: Math.max(frame.minX, Math.min(frame.minX + frame.width, (local.x - PanelFloorSvg.LEFT) / PanelFloorSvg.SCALE + frame.minX)), y: Math.max(frame.minY, Math.min(frame.minY + frame.height, (local.y - PanelFloorSvg.TOP) / PanelFloorSvg.SCALE + frame.minY)) };
  return FPencil.resolve(floorPencilBase, floorPencilVertices, raw, { orthogonal: !event.altKey && ($("#floorPencilOrthogonal").checked || event.shiftKey), snap: !event.altKey && $("#floorPencilSnap").checked, gridM: Number($("#floorPencilStep").value), toleranceM: 10 / (svg.getScreenCTM().a * PanelFloorSvg.SCALE) });
}
function finishFloorPencil(options = {}) {
  try {
    const orthogonal = typeof options.orthogonal === "boolean" ? options.orthogonal : $("#floorPencilOrthogonal").checked && !options.altKey;
    const result = FPencil.complete(floorPencilBase, floorPencilVertices, { orthogonal });
    if (!commitFloorPlan(result.plan)) return;
    clearFloorPencilDraft(); floorRoomId = result.roomId; floorSelectedId = null; floorScale = null;
    renderFloorPlan();
    toast(result.partitioned ? `Створено «${result.plan.rooms.find((r) => r.id === result.roomId).name}» усередині кімнати. Площі й точки оновлено. Для проходу виберіть перегородку та додайте двері.` : "Кімнату намальовано. Можна малювати наступну або перейти до стін і точок.");
  } catch (error) { updateFloorPencilControls(error.message); toast(error.message, "error"); }
}
function backFloorPencil() {
  if (floorPencilVertices.length) floorPencilRedo.push(floorPencilVertices.pop());
  floorPencilPointer = null; floorPencilGesture = null; paintFloorPencil();
}
function undoFloorChange() {
  if (floorPencilActive && (floorPencilVertices.length || floorPencilRedo.length)) { if (floorPencilVertices.length) backFloorPencil(); return; }
  cancelFloorInteractions(); undo();
}
function redoFloorChange() {
  if (floorPencilActive && (floorPencilVertices.length || floorPencilRedo.length)) {
    if (floorPencilRedo.length) { floorPencilVertices.push(floorPencilRedo.pop()); floorPencilPointer = null; paintFloorPencil(); }
    return;
  }
  cancelFloorInteractions(); redo();
}
function initFloorPencil() {
  $("#floorPencilMode").addEventListener("click", () => setFloorPencilMode(!floorPencilActive));
  $("#floorPencilFinish").addEventListener("click", finishFloorPencil);
  $("#floorPencilCancel").addEventListener("click", () => { clearFloorPencilDraft(); paintFloorPencil(); });
  $("#floorPencilBlank").addEventListener("click", () => {
    const plan = { ...clone(project.floorPlan), geometryMode: "free", name: "Власний план", rooms: [], points: [] };
    if (commitFloorPlan(plan)) { clearFloorPencilDraft(); floorSelectedId = null; floorRoomId = ""; floorScale = null; renderFloorPlan(); toast("Чисте полотно для вашого плану. Ctrl+Z повертає попередні кімнати й точки."); }
  });
  $("#floorPencilExpand").addEventListener("click", () => {
    const f = floorPencilFrame, minX = Math.max(-99, f.minX - 3), minY = Math.max(-99, f.minY - 3);
    floorPencilFrame = { minX, minY, width: Math.min(99, f.minX + f.width + 3) - minX, height: Math.min(99, f.minY + f.height + 3) - minY };
    floorScale = null; renderFloorCanvas();
  });
  $("#floorPencilStep").addEventListener("change", () => { $("#floorGeometryGrid").value = $("#floorPencilStep").value; renderFloorCanvas(); });
  ["#floorPencilOrthogonal", "#floorPencilSnap"].forEach((id) => $(id).addEventListener("change", () => { floorPencilPointer = null; paintFloorPencil(); }));
  const canvas = $("#floorCanvas");
  canvas.addEventListener("pointerdown", (event) => {
    if (!floorPencilActive || floorPanMode || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); event.stopImmediatePropagation(); canvas.focus({ preventScroll: true });
    try {
      const before = clone(floorPencilVertices), first = !before.length;
      floorPencilPointer = floorPencilPoint(event);
      if (first) { floorPencilVertices = FPencil.append([], floorPencilPointer.point); floorPencilRedo = []; }
      floorPencilGesture = { pointerId: event.pointerId, before, first, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId); paintFloorPencil();
    } catch (error) { updateFloorPencilControls(error.message); }
  }, true);
  canvas.addEventListener("pointermove", (event) => {
    if (!floorPencilActive || floorPanning || floorPanMode) return;
    event.stopImmediatePropagation();
    try { floorPencilPointer = floorPencilPoint(event); scheduleFloorPencil(); } catch (error) { updateFloorPencilControls(error.message); }
  }, true);
  canvas.addEventListener("pointerup", (event) => {
    const gesture = floorPencilGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation(); floorPencilGesture = null;
    try {
      floorPencilPointer = floorPencilPoint(event);
      if (!gesture.first || Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= 6) {
        if (floorPencilPointer.close) return finishFloorPencil({ orthogonal: floorPencilPointer.orthogonal });
        floorPencilVertices = FPencil.append(floorPencilVertices, floorPencilPointer.point); floorPencilRedo = [];
      }
      floorPencilPointer = null; paintFloorPencil();
    } catch (error) { floorPencilPointer = null; paintFloorPencil(); updateFloorPencilControls(error.message); }
  }, true);
  canvas.addEventListener("pointercancel", (event) => {
    if (!floorPencilGesture || floorPencilGesture.pointerId !== event.pointerId) return;
    event.stopImmediatePropagation(); floorPencilVertices = floorPencilGesture.before; floorPencilGesture = null; floorPencilPointer = null; paintFloorPencil();
  }, true);
  canvas.addEventListener("contextmenu", (event) => { if (floorPencilActive) { event.preventDefault(); backFloorPencil(); } });
  document.addEventListener("keydown", (event) => {
    if (!$("#floorView").classList.contains("active") || ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName) || event.target.isContentEditable || $(".modal-backdrop:not(.hidden)")) return;
    const key = event.key.toLowerCase(), modifier = event.ctrlKey || event.metaKey;
    if (key === "p" && !modifier && !event.altKey) { event.preventDefault(); event.stopImmediatePropagation(); return setFloorPencilMode(!floorPencilActive); }
    if (!floorPencilActive) return;
    const redo = modifier && (key === "y" || key === "z" && event.shiftKey);
    if (redo && floorPencilRedo.length) { event.preventDefault(); event.stopImmediatePropagation(); floorPencilVertices.push(floorPencilRedo.pop()); floorPencilPointer = null; return paintFloorPencil(); }
    if (redo && floorPencilVertices.length) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (["backspace", "delete"].includes(key) || modifier && key === "z" && !event.shiftKey && (floorPencilVertices.length || floorPencilRedo.length)) { event.preventDefault(); event.stopImmediatePropagation(); return backFloorPencil(); }
    if (key === "escape") { event.preventDefault(); event.stopImmediatePropagation(); if (floorPencilVertices.length) { clearFloorPencilDraft(); paintFloorPencil(); } else setFloorPencilMode(false); }
    else if (key === "enter" && event.target.closest("#floorCanvas")) { event.preventDefault(); event.stopImmediatePropagation(); finishFloorPencil({ orthogonal: !event.altKey && ($("#floorPencilOrthogonal").checked || event.shiftKey) }); }
    else if (key.startsWith("arrow") && event.target.closest("#floorCanvas")) event.stopImmediatePropagation();
  }, true);
}

/* Preview first; apply as one undoable transaction with a durable project copy. */
let generationDraft = null;

function renderProjectGeneration() {
  $("#generatePanelFromPlan").title = "Зібрати щит за групами точок цього плану. Спочатку відкриється попередній перегляд; поточний проєкт буде збережено окремою копією.";
  $("#generatePlanFromPanel").title = "Створити точки й кабельні траси за кінцевими автоматами щита. Наявні стіни зберігаються; зміни можна скасувати.";
}

function openProjectGeneration(direction) {
  if (floorPencilActive && floorPencilVertices.length) { toast("Спочатку завершіть або скасуйте контур кімнати, який малюєте.", "error"); return; }
  if (typeof pendingFloorForms === "function" && pendingFloorForms().length) { reviewFloorDrafts(); toast("Перед побудовою застосуйте або скасуйте чернетки форм."); return; }
  try {
    const source = clone(project);
    if (direction === "panel") PanelProjectGeneration.inspectPlan(source);
    else if (!F.branches(source, { includePlanned: false, includeExcluded: true }).length) throw new Error("Додайте до щита хоча б один кінцевий автомат або дифавтомат.");
    const input = source.devices.find((device) => /^main-/.test(device.type));
    const phases = Number(source.design?.supply?.phases || (/^main-[34]p$/.test(input?.type) ? 3 : 1));
    const amps = D.breaker(input || {})?.amps || 40;
    generationDraft = { direction, source, fingerprint: JSON.stringify(project), options: { phases, inputA: [16, 20, 25, 32, 40, 50, 63].includes(amps) ? amps : 40, earthing: source.design?.supply?.earthing || "", protectionScheme: source.design?.protectionScheme || "balanced", voltageRelay: Boolean(source.design?.voltageRelayId), surgeProtection: source.devices.some((device) => device.type.startsWith("spd-")), keepPoints: true, socketRouting: source.floorPlan?.socketRouting === "radial" ? "radial" : "junction", socketCounts: {}, templateId: F.TEMPLATES[source.design?.templateId] ? source.design.templateId : "apartment-2", loads: {} }, result: null };
    $("#generationTitle").textContent = direction === "panel" ? "Перезібрати щит за планом" : "Побудувати розводку за щитом";
    $("#generationDescription").textContent = direction === "panel" ? "Буде замінено компоненти, шини та внутрішні проводи щита. Кімнати, точки й послідовність кабельних з’єднань залишаться на своїх місцях." : "Компоненти щита залишаться на місці. Сервіс запропонує точки й кабельні траси для його кінцевих кіл.";
    $("#generationTable").innerHTML = "";
    renderGenerationOptions(); updateGenerationPreview(); openModal("#generationModal");
  } catch (error) { toast(error.message, "error"); }
}

function renderGenerationOptions() {
  const { direction, source, options } = generationDraft;
  const select = (id, label, values, value) => `<label class="field"><span>${label}</span><select id="${id}">${values.map(([v, text]) => `<option value="${v}" ${String(value) === String(v) ? "selected" : ""}>${text}</option>`).join("")}</select></label>`;
  $("#generationOptions").innerHTML = direction === "panel" ? `${select("generationPhases", "Ввід", [[1, "1 фаза · 230 В"], [3, "3 фази · 230/400 В"]], options.phases)}${select("generationInput", "Ввідний автомат", [16, 20, 25, 32, 40, 50, 63].map((a) => [a, `${a} А`]), options.inputA)}${select("generationEarth", "Заземлення", [["", "Ще не визначено"], ["TN-S", "TN-S"], ["TN-C-S", "TN-C-S · N/PE розділені до щита"], ["TT", "TT · потрібна окрема перевірка"]], options.earthing)}${select("generationProtection", "Захист груп", [["balanced", "Автомати + ПЗВ / окремі дифавтомати"], ["group-rcd", "Групові ПЗВ та автомати"], ["rcbo", "Дифавтомат на кожне коло"]], options.protectionScheme)}<label class="generation-check"><input type="checkbox" id="generationRelay" ${options.voltageRelay ? "checked" : ""} ${Number(options.phases) !== 1 ? "disabled" : ""}> Додати реле напруги (однофазний ввід)</label><label class="generation-check"><input type="checkbox" id="generationSurge" ${options.surgeProtection ? "checked" : ""}> Додати ПЗІП T2 після оцінки вводу</label>` : source.floorPlan?.rooms?.length ? `<label class="generation-check"><input type="checkbox" id="generationKeepPoints" ${options.keepPoints ? "checked" : ""}> Зберегти наявні точки й налаштовану проводку</label><p>Типові прямі підключення перебудуються за вибраною схемою. Існуючі дози та шлейфи збережуться. Для повної перебудови точок зніміть прапорець. Стіни зберігаються.</p>` : select("generationTemplate", "Початкова геометрія", Object.entries(F.TEMPLATES).map(([key, value]) => [key, value.title]), options.templateId);
  if (direction === "plan") $("#generationOptions").innerHTML = select("generationSocketRouting", "Схема розеткових груп", [["junction", "Через дозу · спільний підвід"], ["radial", "Окремі кабелі від щита"]], options.socketRouting) + $("#generationOptions").innerHTML;
}

function updateGenerationPreview() {
  const draft = generationDraft;
  if (!draft) return;
  try {
    draft.result = draft.direction === "panel" ? PanelProjectGeneration.rebuildPanel(draft.source, draft.options) : PanelProjectGeneration.buildPlan(draft.source, draft.options);
    const result = draft.result, next = result.project;
    $("#generationError").textContent = "";
    $("#generationApply").disabled = false;
    $("#generationSummary").textContent = draft.direction === "panel" ? `${result.circuits.length} кіл · ${next.devices.length} компонентів · ${next.wires.length} внутрішніх проводів · щит ${next.board.rows} × ${next.board.modulesPerRow} модулів` : `Нових точок: ${result.added} · нових доз: ${result.newJunctions} · збережено: ${result.kept} · кіл щита: ${result.rows.length}`;
    $("#generationTable").innerHTML = draft.direction === "panel" ? `<thead><tr><th>Коло з плану</th><th>Точок</th><th>Потужність, кВт</th><th>Захист</th></tr></thead><tbody>${result.circuits.map((circuit) => { const record = next.design.circuits.find((r) => r.key === circuit.key), device = next.devices.find((d) => d.id === record.deviceId); return `<tr><td>${escapeHtml(circuit.name)}${circuit.wet ? '<small>Вологе приміщення</small>' : ""}</td><td>${circuit.pointCount}</td><td><input type="number" min="0" max="1000" step="0.1" data-generation-load="${circuit.key}" aria-label="Потужність: ${escapeHtml(circuit.name)}" value="${circuit.kw ?? ""}" placeholder="Не задано"></td><td>${escapeHtml(device.label)} · ${escapeHtml(device.rating)}${record.rcdId ? " + ПЗВ" : ""}</td></tr>`; }).join("")}</tbody>` : `<thead><tr><th>Коло щита / схема</th><th>Розеток</th><th>Додано точок</th><th>Збережено</th></tr></thead><tbody>${result.rows.map((row) => `<tr><td>${escapeHtml(row.label)} · ${escapeHtml(row.name)}${row.socketRoute ? `<small class="generation-socket-route">${escapeHtml(row.socketRoute)}</small>` : ""}</td><td>${row.socketCount !== null ? `<input type="number" min="1" max="498" step="1" data-generation-socket-count="${escapeHtml(row.deviceId)}" aria-label="Розеток: ${escapeHtml(row.name)}" value="${row.socketCount}" ${row.socketEditable ? "" : 'disabled title="Кількість наявних точок збережено. Для повної перебудови зніміть прапорець збереження точок."'}>` : "—"}</td><td>${row.added}</td><td>${row.retained}</td></tr>`).join("")}</tbody>`;
    $("#generationNotes").innerHTML = result.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("");
  } catch (error) {
    draft.result = null; $("#generationApply").disabled = true;
    $("#generationError").textContent = error.message;
    $("#generationSummary").textContent = "Перевірте параметри автопобудови";
    $("#generationNotes").innerHTML = "";
  }
}

function applyProjectGeneration() {
  const draft = generationDraft;
  if (!draft?.result) return;
  if (JSON.stringify(project) !== draft.fingerprint) { $("#generationError").textContent = "Проєкт змінився після відкриття перегляду. Закрийте вікно й відкрийте його знову."; $("#generationApply").disabled = true; return; }
  // If local storage is unavailable, keep the current design intact.
  if (!persistProject({ immediate: true })) return;
  const previous = { project: clone(project), projects: clone(projects), undo: [...undoStack], redo: [...redoStack] };
  let committed = false;
  try {
    const backup = E.cloneProject(project);
    backup.name = `${project.name} · до автопобудови · ${new Date().toLocaleString("uk-UA")}`;
    snapshot(); projects.unshift(backup); project = clone(draft.result.project);
    if (!persistProject({ immediate: true })) {
      project = previous.project; projects = previous.projects; undoStack = previous.undo; redoStack = previous.redo;
      renderAll(); return;
    }
    committed = true;
    generationDraft = null; $("#generationApply").disabled = true; closeModal($("#generationModal"));
    selectedDeviceId = null; resetWiringSelection(); floorSelectedId = null; floorScale = null; floorViewportFrame = null; floorRouteSelection = null; floorGeometryEditing = false; boardAutoFit = true;
    floorRoomId = project.floorPlan?.rooms[0]?.id || ""; floorCircuitId = "";
    renderAll(); switchView(draft.direction === "panel" ? "board" : "floor");
    if (draft.direction === "panel") fitBoard(); else { requestFloorSidebar("points"); renderFloorPlan(); }
    toast("Готово. Попередню версію збережено в «Мої проєкти»; зміни також можна скасувати кнопкою «Назад».");
  } catch (error) {
    if (!committed) { project = previous.project; projects = previous.projects; undoStack = previous.undo; redoStack = previous.redo; }
    renderAll(); toast(error.message, "error");
  }
}

function initProjectGeneration() {
  $("#generatePanelFromPlan").addEventListener("click", () => openProjectGeneration("panel"));
  $("#generatePlanFromPanel").addEventListener("click", () => openProjectGeneration("plan"));
  $("#generationApply").addEventListener("click", applyProjectGeneration);
  $("#generationOptions").addEventListener("change", (event) => {
    if (!generationDraft) return;
    const target = event.target, fields = { generationPhases: "phases", generationInput: "inputA", generationEarth: "earthing", generationProtection: "protectionScheme", generationRelay: "voltageRelay", generationSurge: "surgeProtection", generationKeepPoints: "keepPoints", generationTemplate: "templateId", generationSocketRouting: "socketRouting" };
    const key = fields[target.id]; if (!key) return;
    generationDraft.options[key] = target.type === "checkbox" ? target.checked : target.value;
    if (key === "phases") { if (Number(target.value) !== 1) generationDraft.options.voltageRelay = false; renderGenerationOptions(); }
    updateGenerationPreview();
  });
  $("#generationTable").addEventListener("change", (event) => {
    if (!generationDraft) return;
    const socketId = event.target.dataset.generationSocketCount;
    if (socketId) { generationDraft.options.socketCounts[socketId] = Number(event.target.value); updateGenerationPreview(); return; }
    const key = event.target.dataset.generationLoad;
    if (!key) return;
    generationDraft.options.loads[key] = event.target.value === "" ? null : Number(event.target.value); updateGenerationPreview();
  });
}

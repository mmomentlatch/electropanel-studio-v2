/* Template chooser, calculation schedule, and customer layout approval. */
const D = PanelDesign;
const TEMPLATE_SEEN_KEY = "electropanel.v2.templates-seen.v1";
let chosenTemplateId = D.TEMPLATES[0].id;
let preserveDesignEditor = false;
let designInputTransaction = null;

function openTemplateChooser() {
  closeDrawers();
  $$(".modal-backdrop").forEach((modal) => modal.classList.add("hidden"));
  $("#templateCurrentProject").textContent = project.name;
  selectTemplate(chosenTemplateId);
  openModal("#templateModal");
}

function selectTemplate(id) {
  chosenTemplateId = id;
  const template = D.TEMPLATES.find((item) => item.id === id);
  $("#templatePhases").value = template.phases;
  $("#templateInputA").value = template.inputA;
  $("#templateVoltageRelay").disabled = template.phases !== 1;
  $("#templateVoltageRelay").checked = false;
  $("#templateSurgeProtection").checked = false;
  $("#templateCards").innerHTML = D.TEMPLATES.map((item) => `<button class="template-card ${item.id === id ? "selected" : ""}" type="button" data-template="${item.id}" aria-pressed="${item.id === id}"><span class="template-card-top"><i>${item.icon}</i><small>${item.circuits.length} кіл</small></span><strong>${item.title}</strong><span>${item.description}</span><b>${item.phases === 3 ? "Трифазний" : "Однофазний"} базовий варіант <em>↗</em></b></button>`).join("");
  updateTemplatePreview();
}

function templateSettings() {
  return { phases: $("#templatePhases").value, inputA: $("#templateInputA").value, earthing: $("#templateEarthing").value, contractKw: $("#templateContractKw").value, profile: "UA", country: "UA", protectionScheme: $("#templateProtectionScheme").value, voltageRelay: $("#templateVoltageRelay").checked && $("#templatePhases").value === "1", surgeProtection: $("#templateSurgeProtection").checked };
}

function protectionPlanMarkup(p) {
  const rows = D.protectionPlan(p);
  const counts = [[rows.filter((row) => row.kind === "group").length, "Автомати 1P"], [(p.design.rcdGroups || []).length, "ПЗВ"], [rows.filter((row) => row.kind === "rcbo").length, "Дифавтомати"]].filter(([count]) => count).map(([count, title]) => `${title}: ${count}`).join(" · ");
  return `<details class="protection-plan" data-design-details="protection-plan"><summary>Підбір захисту кіл · ${counts}</summary><p>Автомат захищає від перевантаження й КЗ; ПЗВ — від диференційного струму. Для розеток звичайний автомат працює разом із ПЗВ. Дифавтомат поєднує обидві функції.</p><div class="protection-plan-scroll"><table><thead><tr><th>Коло</th><th>Встановлено</th><th>Вибір та умови</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td class="${row.kind === "unprotected" ? "text-error" : ""}">${escapeHtml(row.title)}</td><td>${escapeHtml(row.reason)}</td></tr>`).join("")}</tbody></table></div><p>Групування й окремі дифавтомати — проєктний вибір. Номінали, витоки та тип дифзахисту для інверторних приладів потрібно звірити за даними об’єкта й паспортами. ПЗВ має бути захищене від надструму; після нього потрібна окрема N-шина.</p></details>`;
}

function updateTemplatePreview() {
  $("#templateVoltageRelay").disabled = $("#templatePhases").value !== "1";
  try {
    const preview = D.createTemplate(chosenTemplateId, templateSettings());
    const calc = D.calculate(preview);
    $("#templatePreview").innerHTML = `<div><span>${preview.board.rows * preview.board.modulesPerRow} модулів · ${preview.board.rows} DIN-рейок × ${preview.board.modulesPerRow}</span><strong>${preview.design.circuits.length} захищених кіл</strong><p>Ввід, ${preview.devices.some((device) => device.type.startsWith("spd-")) ? "ПЗІП T2, " : ""}${preview.design.protectionScheme === "rcbo" ? "дифавтомати типу A / 30 мА на кожне коло" : preview.design.protectionScheme === "balanced" ? "автомати 1P під груповими ПЗВ типу A / 30 мА для частини загальних розеток; освітлення й окремі прилади — на дифавтоматах" : "групові ПЗВ типу A / 30 мА й автомати 1P; окремі дифавтомати для вологих приміщень"}, ${preview.design.voltageRelayId ? "реле напруги, " : ""}окремі N/PE та ${preview.wires.length} з’єднань. ПВДП додається вручну з бібліотеки.</p></div><div><span>Задані прикладні навантаження</span><strong>${number(calc.powerKw)} кВт</strong><p>${Object.entries(calc.phaseCurrents).filter(([phase]) => preview.design.supply.phases === 3 || phase === "L1").map(([phase, amps]) => `${phase}: ${number(amps)} A`).join(" · ")}</p></div>${protectionPlanMarkup(preview)}<p class="template-scope">${escapeHtml(preview.design.scope)} Навантаження, довжини й номінали — початкові припущення для редагування, не дані вашого об’єкта. Потребу в ПЗІП та ПВДП слід звірити для конкретної установки.</p>${calc.errors.length ? `<p class="template-error">${escapeHtml(calc.errors[0].text)} Після створення можна змінити параметри.</p>` : ""}`;
    $("#createTemplateButton").disabled = false;
  } catch (error) {
    $("#templatePreview").textContent = error.message;
    $("#createTemplateButton").disabled = true;
  }
}

function createChosenTemplate() {
  try {
    const created = D.createTemplate(chosenTemplateId, templateSettings());
    persistProject({ immediate: true });
    project = created;
    projects.unshift(clone(created));
    selectedDeviceId = null;
    resetWiringSelection(); undoStack = []; redoStack = [];
    persistProject({ immediate: true });
    PStore.writeString(browserStorage, TEMPLATE_SEEN_KEY, "1");
    $("#templateModal").classList.add("hidden");
    setWireFilter("all"); setWiringMode(false); switchView("board");
    renderAll(); requestAnimationFrame(fitBoard);
    toast("Типовий щит створено з проводкою. Вихідні дані та перевірки — у «Розрахунки».");
  } catch (error) { toast(error.message, "error"); }
}

function reportField(label, field, value, type = "number", extras = "", circuitId = "", isDevice = false) {
  const binding = isDevice ? `data-design-device="${field}"` : circuitId ? `data-design-circuit="${field}"` : `data-design-supply="${field}"`;
  return `<label class="field"><span>${escapeHtml(label)}</span><input type="${type}" ${binding} ${circuitId ? `data-circuit-id="${escapeHtml(circuitId)}"` : ""} value="${escapeHtml(value ?? "")}" ${extras}/></label>`;
}

function renderDesignReport() {
  const target = $("#designReport");
  if (!target) return;
  const expanded = [...target.querySelectorAll("details[open][data-design-details]")].map((node) => node.dataset.designDetails);
  const calc = D.calculate(project);
  ["#designCsvButton", "#printDesignButton"].forEach((id) => { $(id).disabled = !calc; });
  $("#designProjectNotice").classList.toggle("hidden", !calc);
  if (!calc) {
    target.innerHTML = `<div class="design-empty"><span>⌂</span><h2>Почніть із типового житлового щита</h2><p>Готові компоновки містять проводку до споживачів та відомість вихідних даних для розрахунку. Клемники за потреби додаються з каталогу.</p><button class="button primary" type="button" data-open-template>Вибрати готовий щит</button></div>`;
    return;
  }
  const supply = project.design.supply;
  const shown = (value) => escapeHtml(value ?? "—");
  $("#designNoticeText").textContent = `${calc.status} · ${calc.approvalCurrent ? "компоновку погоджено" : "типовий проєкт"}`;
  const badge = $("#projectStatus");
  badge.className = `status-pill ${calc.errors.length || calc.missing.length ? "warning" : "success"}`;
  badge.setAttribute("aria-controls", "designIssues");
  badge.textContent = calc.errors.length ? "Є помилки" : calc.missing.length ? "Неповні дані" : "Перевірки розрахунку";
  const approval = project.design.approval;
  const issueGroups = projectIssueGroupsMarkup(calc);
  const issueOpen = new Map([...target.querySelectorAll("[data-issue-group]")].map((node) => [node.dataset.issueGroup, node.open]));
  const markup = `<div class="design-summary">
    <div class="design-state ${calc.errors.length ? "error-state" : ""}"><span class="eyebrow">${escapeHtml(project.name)}</span><h2>${calc.status}</h2><p>${calc.errors.length} помилок · ${calc.missing.length} пунктів вихідних даних · нормативний профіль ${project.design.profile === "UA" ? "Україна" : `Європа · ${escapeHtml(project.design.country || "країна не задана")}`}</p><small>Ревізія ${escapeHtml(project.design.revision)} · джерела перевірено ${D.VERIFIED_DATE}</small></div>
    <div class="design-metric"><span>Розрахункова потужність</span><strong>${number(calc.powerKw)} <small>кВт</small></strong><p>${Object.entries(calc.phaseCurrents).map(([phase, amps]) => `${phase}: ${number(amps)} A`).join(" · ")}</p></div>
  </div>
  <p class="design-assumptions">Вихідні дані: ${shown(supply.phases)} фаз(и), ${shown(supply.voltage)} В фаза–N; ${escapeHtml(supply.earthing || "заземлення не визначено")}; договір ${shown(supply.contractKw)} кВт; ввід Iz ${shown(supply.feederIzA)} A, I2 ${shown(supply.i2A)} A, Icn ${shown(supply.icnA)} A; Iкз max ${shown(supply.maxIccA)} A; ΔU до щита ${shown(supply.upstreamDropPct)}%. Умови: ${escapeHtml(supply.installationMethod || "не вказані")}.</p>
  <div class="design-section design-inputs"><h3>1. Вихідні дані об’єкта</h3><p class="design-description">Номінали та перерізи у шаблоні попередні. Iz береться з перевіреного джерела після врахування способу прокладання, температури й групування.</p><div class="design-input-grid">
    ${reportField("Дозволена потужність, кВт", "contractKw", supply.contractKw, "number", 'min="0.1" step="0.1"')}
    ${reportField("Напруга фаза–N, В (профіль 230/400 В)", "voltage", supply.voltage, "number", 'min="1" step="1"')}
    ${reportField("Iz ввідного кабелю, A", "feederIzA", supply.feederIzA, "number", 'min="1" step="0.1"')}
    ${reportField("I2 ввідного апарата, A", "i2A", supply.i2A, "number", 'min="1" step="0.1"')}
    ${reportField("Макс. очікуваний струм КЗ, A", "maxIccA", supply.maxIccA, "number", 'min="1" step="1"')}
    ${reportField("Вимикальна здатність вводу, A", "icnA", supply.icnA, "number", 'min="1" step="1"')}
    ${reportField("Падіння напруги до щита, %", "upstreamDropPct", supply.upstreamDropPct, "number", 'min="0" step="0.1"')}
    <label class="field"><span>Заземлення на вводі</span><select data-design-supply="earthing"><option value="">Потрібно визначити</option>${["TN-S", "TN-C-S", "TT"].map((value) => `<option ${supply.earthing === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
    ${reportField("Прокладання, температура, групування", "installationMethod", supply.installationMethod, "text", 'maxlength="240"')}
    ${reportField("ПЗІП: оцінка потреби / захист будівлі", "surgeAssessment", supply.surgeAssessment, "text", 'maxlength="500"')}
  </div><label class="check-label design-confirm"><input type="checkbox" data-design-supply="dataConfirmed" ${supply.dataConfirmed ? "checked" : ""}/> Вихідні дані звірено з ТУ/договором, паспортами та обстеженням. У TN-C-S поділ PEN виконано до цього щита.</label></div>
  ${(project.design.rcdGroups || []).length ? `<div class="design-section"><h3>Групові ПЗВ та координація захисту</h3><p class="design-description">Автомат 1P захищає від надструму, групове ПЗВ — від диференційного струму. За кожним ПЗВ потрібна окрема N-шина. Ванна має окремий дифавтомат. Потреба в ПВДП перевіряється окремо; у базовому складі його немає.</p>${project.design.rcdGroups.map((group) => `<div class="design-input-grid"><strong>${escapeHtml(project.devices.find((device) => device.id === group.deviceId)?.label || "ПЗВ")}</strong><label class="field"><span>Умовна стійкість до КЗ, A</span><input type="number" min="1" data-design-group="conditionalIccA" data-group-id="${escapeHtml(group.deviceId)}" value="${escapeHtml(group.conditionalIccA ?? "")}"/></label><label class="field"><span>Паспорт / узгоджений захист</span><input data-design-group="coordinationSource" data-group-id="${escapeHtml(group.deviceId)}" value="${escapeHtml(group.coordinationSource || "")}" maxlength="240"/></label></div>`).join("")}</div>` : ""}
  <div class="design-section"><h3>2. Розрахункова відомість кіл</h3><p class="design-description">Ib = P × k / (U × cosφ). Коефіцієнт одночасності k задає проєктувальник; початково k = 1. Падіння напруги включає ділянку до щита. Метод оцінки кабелю: Cu, R = 23,7/S Ω/км, X = 0,08 Ω/км.</p>
    <div class="design-table-scroll"><table class="design-table"><thead><tr><th>Коло</th><th>Призначення</th><th>Фаза</th><th>P, кВт</th><th>k / cosφ</th><th>L, м</th><th>In, A</th><th>S, мм²</th><th>Iz / I2, A</th><th>Ib, A</th><th>ΔU, %</th><th>Стан</th></tr></thead><tbody>${calc.rows.map((row) => {
      const errors = calc.errors.filter((issue) => issue.entityId === row.device.id).length;
      const missing = calc.missing.filter((issue) => issue.entityId === row.device.id).length;
      return `<tr><td><strong>${escapeHtml(row.device.label)}</strong></td><td>${escapeHtml(row.device.name)}</td><td>${shown(row.device.phase)}</td><td>${number(row.device.load)}</td><td>${shown(row.spec.diversity)} / ${shown(row.spec.powerFactor)}</td><td>${shown(row.spec.lengthM)}</td><td>${row.rating?.amps ?? "—"}</td><td>${number(row.section)}</td><td>${shown(row.spec.izA)} / ${shown(row.spec.i2A)}</td><td>${row.ib === null ? "—" : number(row.ib)}</td><td>${row.totalDrop === null ? "—" : `${number(row.totalDrop)} / ${row.limit}`}</td><td class="${errors ? "text-error" : missing ? "text-pending" : "text-pass"}">${errors ? `${errors} пом.` : missing ? "Дані" : "Розрах. ✓"}</td></tr>`;
    }).join("")}</tbody></table></div>
    ${protectionPlanMarkup(project)}
    <details class="design-editor" data-design-details="editor"><summary>Редагувати кола й технічні дані</summary>${calc.rows.map((row) => `<details class="design-circuit" data-design-details="${escapeHtml(row.device.id)}"><summary>${escapeHtml(row.device.label)} · ${escapeHtml(row.device.name)}</summary><div class="design-input-grid">
      ${reportField("Призначення", "name", row.device.name, "text", 'maxlength="100"', row.device.id, true)}
      <label class="field"><span>Групове ПЗВ для автомата 1P</span><select data-design-circuit="rcdId" data-circuit-id="${escapeHtml(row.device.id)}"><option value="">Власний дифзахист апарата</option>${project.devices.filter((device) => device.type.startsWith("rccb-")).map((device) => `<option value="${escapeHtml(device.id)}" ${row.spec.rcdId === device.id ? "selected" : ""}>${escapeHtml(device.label)} · ${escapeHtml(device.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Тип кола</span><select data-design-circuit="purpose" data-circuit-id="${escapeHtml(row.device.id)}"><option value="">Визначте тип</option>${[["lighting", "Освітлення"], ["general", "Загальне / розетки"], ["bath", "Ванна / душова"]].map(([key, label]) => `<option value="${key}" ${typeof row.spec.lighting === "boolean" && typeof row.spec.wet === "boolean" && (row.spec.wet ? "bath" : row.spec.lighting ? "lighting" : "general") === key ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label class="field"><span>Споживач / вихід кола</span><select data-design-circuit="outputId" data-circuit-id="${escapeHtml(row.device.id)}"><option value="">Оберіть споживача або власний клемник</option>${[...(project.consumers || []), ...project.devices.filter((device) => device.type === "outgoing-terminal")].map((device) => `<option value="${escapeHtml(device.id)}" ${row.spec.outputId === device.id ? "selected" : ""}>${escapeHtml(device.label)} · ${escapeHtml(device.name)}</option>`).join("")}</select></label>
      ${reportField("Потужність, кВт", "load", row.device.load, "number", 'min="0" step="0.1"', row.device.id, true)}
      ${reportField("Номінал, напр. B16 / A / 30mA", "rating", row.device.rating, "text", 'maxlength="40"', row.device.id, true)}
      ${reportField("Переріз Cu, мм²", "cable", row.device.cable, "number", 'min="1.5" step="0.5"', row.device.id, true)}
      ${reportField("cosφ", "powerFactor", row.spec.powerFactor, "number", 'min="0.7" max="1" step="0.01"', row.device.id)}
      ${reportField("Коефіцієнт одночасності k", "diversity", row.spec.diversity, "number", 'min="0" max="1" step="0.05"', row.device.id)}
      ${reportField("Довжина, м", "lengthM", row.spec.lengthM, "number", 'min="1" step="1"', row.device.id)}
      ${reportField("Iz після поправок, A", "izA", row.spec.izA, "number", 'min="1" step="0.1"', row.device.id)}
      ${reportField("Умовний струм вимкнення I2, A", "i2A", row.spec.i2A, "number", 'min="1" step="0.1"', row.device.id)}
      ${reportField("Вимикальна здатність, A", "icnA", row.spec.icnA, "number", 'min="1" step="1"', row.device.id)}
      ${reportField("Мін. струм КЗ у кінці, A", "minFaultA", row.spec.minFaultA, "number", 'min="1" step="1"', row.device.id)}
      ${reportField("Джерело Iz / умови прокладання", "cableSource", row.spec.cableSource, "text", 'maxlength="240"', row.device.id)}
    </div><button class="button ghost" type="button" data-remove-design-circuit="${escapeHtml(row.device.id)}">Видалити коло</button></details>`).join("")}${project.design.circuits.filter((record) => !project.devices.some((device) => device.id === record.deviceId)).map((record) => `<p class="design-description">Апарат кола видалений. <button type="button" class="button ghost" data-remove-design-circuit="${escapeHtml(record.deviceId)}">Прибрати коло з відомості</button></p>`).join("")}</details>
  </div>
  <div class="design-section" id="designIssues" tabindex="-1"><h3>3. Перевірки й межі розрахунку</h3><div class="design-issue-groups">${issueGroups}</div><div class="engineering-review"><strong>Інженерна перевірка очікується</strong><p>${calc.engineeringReview}</p><p>Перевірка мінімального КЗ оцінює верхню межу миттєвої зони B/C/D і не замінює часову характеристику конкретного виробу. Робота виконується для України; застосовні редакції ДСТУ й паспортні дані потребують звірення.</p></div></div>
  <div class="design-section design-approval"><h3>4. Погодження компоновки замовником</h3><p class="design-description">Погоджується склад і розташування обладнання. Це не дозвіл до монтажу й не підтвердження нормативної відповідності. Зміна проєкту скасовує актуальність погодження.</p>${approval ? `<div class="approval-state ${calc.approvalCurrent ? "current" : "stale"}">${calc.approvalCurrent ? "Компоновку погоджено" : "Погодження застаріло після змін"} · ${escapeHtml(approval.name)} · ${formatDate(approval.at)}</div>` : ""}<div class="approval-form"><label class="field"><span>Хто погоджує</span><input id="layoutApprovalName" maxlength="100" placeholder="Ім’я або організація"/></label><button class="button primary" type="button" id="approveLayoutButton" ${calc.errors.length ? "disabled" : ""}>Погодити компоновку</button></div></div>
  <div class="design-section design-sources"><h3>Нормативна база та методики</h3><p class="design-description">Чинні редакції ДСТУ/EN/HD та їхні національні зміни потрібно звіряти для конкретного об’єкта. ГОСТ не застосовується автоматично за назвою.</p>${D.SOURCES.map((source) => `<article><a href="${source.url}" target="_blank" rel="noopener">${escapeHtml(source.title)} ↗</a><p>${escapeHtml(source.scope)}</p><small>${escapeHtml(source.status)}</small></article>`).join("")}</div>`;
  if (preserveDesignEditor && target.querySelector(".design-summary")) {
    const preview = document.createElement("div");
    preview.innerHTML = markup;
    [".design-summary", ".design-assumptions", ".design-table-scroll", ".protection-plan", ".design-issue-groups", ".engineering-review", ".approval-state"].forEach((selector) => {
      const existing = target.querySelector(selector), replacement = preview.querySelector(selector);
      if (existing && replacement) { const opened = existing.open; existing.replaceWith(replacement); if (opened) replacement.open = true; }
    });
    $("#approveLayoutButton").disabled = calc.errors.length > 0;
    $("[data-design-supply='dataConfirmed']", target).checked = Boolean(supply.dataConfirmed);
    calc.rows.forEach((row) => { const summary = target.querySelector(`[data-design-details="${CSS.escape(row.device.id)}"] > summary`); if (summary) summary.textContent = `${row.device.label} · ${row.device.name}`; });
  } else {
    target.innerHTML = markup;
    expanded.forEach((key) => { const detail = target.querySelector(`[data-design-details="${CSS.escape(key)}"]`); if (detail) detail.open = true; });
  }
  target.querySelectorAll("[data-issue-group]").forEach((node) => { if (issueOpen.has(node.dataset.issueGroup)) node.open = issueOpen.get(node.dataset.issueGroup); });
  const tableRows = target.querySelectorAll(".design-table tbody tr");
  calc.rows.forEach((row, index) => {
    const cell = tableRows[index]?.cells[1];
    if (!cell) return;
    const protection = document.createElement("small");
    protection.className = "design-circuit-protection";
    protection.textContent = row.spec.rcdId ? `${project.devices.find((device) => device.id === row.spec.rcdId)?.label || "ПЗВ відсутнє"} + автомат 1P` : E.isRcd(row.device) ? row.device.type === "rcbo-afdd" ? "Дифавтомат + ПВДП" : "Окремий дифавтомат" : "Дифзахист не призначений";
    cell.append(protection);
  });
}

function updateDesignInput(event) {
  const input = event.target;
  const supplyField = input.dataset.designSupply, circuitField = input.dataset.designCircuit, deviceField = input.dataset.designDevice, groupField = input.dataset.designGroup;
  if (!project.design || !(supplyField || circuitField || deviceField || groupField)) return;
  const discrete = input.tagName === "SELECT" || input.type === "checkbox";
  if (event.type === "input" && discrete || event.type === "change" && !discrete) return;
  const value = input.type === "checkbox" ? input.checked : input.type === "number" ? input.value === "" ? null : Number(input.value) : input.value;
  if (discrete || designInputTransaction !== input) snapshot();
  designInputTransaction = input;
  if (supplyField) {
    project.design.supply[supplyField] = value;
    if (supplyField === "earthing" && ["TN-S", "TN-C-S", "TT"].includes(value)) project.board.earthing = value;
  } else if (groupField) {
    const group = project.design.rcdGroups?.find((item) => item.deviceId === input.dataset.groupId);
    if (group) group[groupField] = value;
  } else if (deviceField) {
    const device = project.devices.find((item) => item.id === input.dataset.circuitId);
    if (device) device[deviceField] = deviceField === "cable" ? String(value ?? "") : value;
  } else {
    let circuit = project.design.circuits.find((item) => item.deviceId === input.dataset.circuitId);
    if (!circuit) { circuit = { deviceId: input.dataset.circuitId, rcdType: "A", rcdMa: 30, icnA: 6000 }; project.design.circuits.push(circuit); }
    if (circuitField === "rcdId") {
      circuit.rcdId = value;
      circuit.rcdBarId = project.busbars.find((bar) => bar.rcdId === value)?.id || "";
      project.design.rcdGroups ||= [];
      if (value && !project.design.rcdGroups.some((group) => group.deviceId === value)) project.design.rcdGroups.push({ deviceId: value, barId: circuit.rcdBarId, conditionalIccA: null, coordinationSource: "" });
      project.design.rcdGroups = project.design.rcdGroups.filter((group) => project.devices.some((device) => device.id === group.deviceId) || project.design.circuits.some((record) => record.rcdId === group.deviceId));
    } else if (circuitField === "purpose") { if (!value) { delete circuit.lighting; delete circuit.wet; } else { circuit.lighting = value === "lighting"; circuit.wet = value === "bath"; } }
    else if (circuitField === "outputId") { circuit.outputId = value; circuit.outputKind = (project.consumers || []).some((consumer) => consumer.id === value) ? "consumer" : "device"; }
    else {
      circuit[circuitField] = value;
      if (circuitField === "lengthM") { delete circuit.lengthOrigin; if (project.floorPlan) project.floorPlan.syncWithCircuits = false; }
    }
  }
  if (supplyField !== "dataConfirmed") project.design.supply.dataConfirmed = false;
  persistProject();
  preserveDesignEditor = circuitField !== "rcdId";
  try { renderAll(); } finally { preserveDesignEditor = false; }
}

function exportDesignCsv() {
  const calc = D.calculate(project);
  if (!calc) return;
  const rows = [["Статус", calc.status], ["Технічний допуск", "Не видається автоматично"], ["Ревізія", project.design.revision], ["Погодження компоновки", calc.approvalCurrent ? "Актуальне" : "Немає актуального"], ["Вихідні дані вводу", JSON.stringify(project.design.supply)], [], ["Коло", "Призначення", "Фаза", "P кВт", "k", "cosφ", "L м", "In A", "S мм2", "Iz A", "I2 A", "Icn A", "Iкз min A", "Ib A", "ΔU сумарне %", "Ліміт %", "Джерело Iz"]];
  calc.rows.forEach((row) => rows.push([row.device.label, row.device.name, row.device.phase, row.device.load, row.spec.diversity ?? "", row.spec.powerFactor ?? "", row.spec.lengthM ?? "", row.rating?.amps ?? "", row.section, row.spec.izA ?? "", row.spec.i2A ?? "", row.spec.icnA ?? "", row.spec.minFaultA ?? "", row.ib ?? "", row.totalDrop ?? "", row.limit, row.spec.cableSource ?? ""]));
  rows.push([], ["Підбір захисту кіл"], ["Коло", "Встановлений захист", "Вибір та умови"]);
  D.protectionPlan(project).forEach((entry) => rows.push([entry.name, entry.title, entry.reason]));
  rows.push([], ["Рівень", "Пункт перевірки"]);
  calc.issues.forEach((issue) => rows.push([issue.level, issue.text]));
  downloadBlob(csvContent(rows), `${slugify(project.name)}-calculations.csv`, "text/csv;charset=utf-8");
}

function initTemplates() {
  $("#templateCards").addEventListener("click", (event) => { const card = event.target.closest("[data-template]"); if (card) selectTemplate(card.dataset.template); });
  $("#openTemplatesButton").addEventListener("click", openTemplateChooser);
  $("#templateInputForm").addEventListener("change", updateTemplatePreview);
  $("#createTemplateButton").addEventListener("click", createChosenTemplate);
  const seen = () => PStore.writeString(browserStorage, TEMPLATE_SEEN_KEY, "1");
  $("#templateContinueButton").addEventListener("click", () => { seen(); $("#templateModal").classList.add("hidden"); });
  $("#closeTemplateChooserButton").addEventListener("click", seen);
  $("#templateBlankButton").addEventListener("click", () => { seen(); newEmptyProject(); });
  $("#templateModal").addEventListener("keydown", (event) => { if (event.key === "Escape") seen(); });
  $("#templateModal").addEventListener("mousedown", (event) => { if (event.target === event.currentTarget) seen(); });
  $("#designReport").addEventListener("change", updateDesignInput);
  $("#designReport").addEventListener("input", updateDesignInput);
  $("#designReport").addEventListener("focusout", () => { designInputTransaction = null; });
  $("#designReport").addEventListener("click", (event) => {
    if (event.target.closest("[data-open-template]")) return openTemplateChooser();
    const remove = event.target.closest("[data-remove-design-circuit]");
    if (remove) {
      const circuitId = remove.dataset.removeDesignCircuit;
      const record = project.design?.circuits.find((circuit) => circuit.deviceId === circuitId);
      snapshot();
      project = E.removeEntity(project, "device", circuitId);
      if (record?.outputId) project = E.removeEntity(project, record.outputKind || "device", record.outputId);
      project.design.circuits = project.design.circuits.filter((circuit) => circuit.deviceId !== circuitId);
      resetWiringSelection(); selectedDeviceId = null;
      persistProject(); renderAll(); toast("Коло видалено. Ctrl+Z — повернути.");
      return;
    }
    if (event.target.closest("#approveLayoutButton")) {
      try { const approved = D.approveLayout(project, $("#layoutApprovalName").value); snapshot(); project = approved; persistProject(); renderAll(); toast("Компоновку погоджено замовником"); }
      catch (error) { toast(error.message, "error"); }
    }
  });
  $("#designNoticeButton").addEventListener("click", () => switchView("design"));
  $("#designNoticeText").addEventListener("click", openProjectIssues);
  $("#designCsvButton").addEventListener("click", exportDesignCsv);
  $("#printDesignButton").addEventListener("click", () => window.print());
  if (!PStore.readString(browserStorage, TEMPLATE_SEEN_KEY)) openTemplateChooser();
}

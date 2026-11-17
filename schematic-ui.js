/* Document navigation and SVG export; no changes to the electrical project. */
const S = PanelSchematic;
let schematicModel = null;
let schematicPage = 0;
let schematicScale = 1;
let schematicAutoFit = "page";
let schematicMonochrome = false;
let schematicExpanded = true;
let schematicProjectId = null;

function renderConnectedDiagram() {
  if (schematicProjectId !== project.id) { schematicProjectId = project.id; schematicPage = 0; schematicAutoFit = "page"; }
  schematicModel = S.build(project);
  schematicPage = Math.max(0, Math.min(schematicPage, schematicModel.pages.length - 1));
  const disabled = !schematicModel.pages.length;
  ["#diagramSvgButton", "#diagramMonoButton", "#diagramZoomOut", "#diagramZoomIn", "#diagramFitButton", "#diagramWidthButton", "#printDiagramButton"].forEach((id) => { $(id).disabled = disabled; });
  $("#diagramPageInput").innerHTML = schematicModel.pages.map((page, index) => `<option value="${index}">Аркуш ${index + 1} з ${schematicModel.pages.length}</option>`).join("");
  $("#diagramPageInput").value = schematicPage;
  $("#diagramPageInput").disabled = disabled;
  $("#diagramPrevPage").disabled = schematicPage === 0;
  $("#diagramNextPage").disabled = disabled || schematicPage >= schematicModel.pages.length - 1;
  $("#diagramMonoButton").setAttribute("aria-pressed", String(schematicMonochrome));
  $("#diagramWideButton").setAttribute("aria-pressed", String(schematicExpanded));
  const problems = E.validate(project).filter((issue) => issue.level === "error");
  const warnings = [...schematicModel.warnings, ...problems.map((issue) => issue.text)];
  $("#diagramOverview").innerHTML = `<div><span class="sld-status-dot"></span><strong>За фактичними з’єднаннями</strong><span>${schematicModel.circuits.size} відгалужень · ${schematicModel.pages.length} арк. · ${project.wires.length} проводів</span></div><div class="sld-key"><span><i class="key-mcb"></i>Автомат</span><span><i class="key-rcd"></i>ПЗВ</span><span><i class="key-rcbo"></i>Дифавтомат</span></div>`;
  if (disabled) $("#diagramPaper").innerHTML = '<div class="diagram-empty"><div><strong>Додайте силові з’єднання</strong><span>Після з’єднання клем з’являться ввід, групи захисту й відхідні кола.</span></div></div>';
  else $("#diagramPaper").innerHTML = schematicModel.pages.map((page, index) => `<section class="sld-page ${index === schematicPage ? "active" : ""}" aria-label="Аркуш ${index + 1}">${S.renderSvg(schematicModel, index, { monochrome: schematicMonochrome, date: new Date().toLocaleDateString("uk-UA") })}</section>`).join("");
  $("#diagramDetails").innerHTML = `${warnings.length ? `<div class="sld-warning"><strong>Потрібна увага</strong><ul>${[...new Set(warnings)].map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul></div>` : ""}<p class="sld-reading-note">Читайте згори вниз: ввід → груповий захист → відхідний автомат → споживач. N/PE вказані окремо для кожного кола. ${schematicModel.pages.length > 1 ? "Ввідні апарати повторено на аркушах для зручності читання. " : ""}Натисніть позначення апарата, щоб відкрити його на компоновці.</p>${schematicModel.omitted.length ? `<details class="sld-extra"><summary>Поза силовою схемою · ${schematicModel.omitted.length}</summary><p>Апарати без фазних силових з’єднань або з колами керування. Їхні фактичні підключення наведено нижче.</p><div class="sld-omitted">${schematicModel.omitted.map((device) => `<button type="button" data-diagram-device="${escapeHtml(device.id)}">${escapeHtml(device.label)} · ${escapeHtml(device.name)}</button>`).join("")}</div></details>` : ""}<details class="sld-extra"><summary>Клеми й усі з’єднання · ${project.wires.length}</summary><p>Однолінійний вигляд узагальнює фазне живлення; кола керування, N і PE залишаються в адресній відомості. Умовні позначення схематичні та не є заводськими клемними картами.</p><div class="sld-connection-scroll"><table><thead><tr><th>Провід</th><th>Від</th><th>До</th><th>Потенціал</th><th>Провідник</th></tr></thead><tbody>${project.wires.map((wire) => `<tr><td>${escapeHtml(wire.label)}</td><td>${escapeHtml(E.endpointLabel(project, wire.from))}</td><td>${escapeHtml(E.endpointLabel(project, wire.to))}</td><td>${escapeHtml(wire.potential)}</td><td>${escapeHtml(wire.material)} ${number(wire.section)} мм²</td></tr>`).join("")}</tbody></table></div></details>`;
  updateSchematicScale();
  if (schematicAutoFit && $("#diagramView").classList.contains("active")) requestAnimationFrame(fitSchematic);
}

function updateSchematicScale() {
  $$(".sld-svg").forEach((svg) => { svg.style.width = `${S.WIDTH * schematicScale}px`; svg.style.height = "auto"; });
  $("#diagramZoomValue").textContent = `${Math.round(schematicScale * 100)}%`;
}
function fitSchematic() {
  if (!$("#diagramView").classList.contains("active")) return;
  const view = $("#diagramView"), svg = $(".sld-page.active .sld-svg");
  const height = svg?.viewBox.baseVal.height || 840;
  const reserved = $("#diagramView .document-toolbar").offsetHeight + $(".sld-controls").offsetHeight + $("#diagramOverview").offsetHeight + 60;
  const vertical = schematicAutoFit === "width" ? 1 : (view.clientHeight - reserved) / height;
  schematicScale = Math.max(.25, Math.min(1, (view.clientWidth - 48) / S.WIDTH, vertical));
  updateSchematicScale();
}
function changeSchematicPage(index) {
  if (!schematicModel?.pages.length) return;
  schematicPage = Math.max(0, Math.min(index, schematicModel.pages.length - 1));
  renderConnectedDiagram();
  $("#diagramView").scrollTop = 0;
}
function exportSchematicSvg() {
  if (!schematicModel?.pages.length) return;
  const svg = S.renderSvg(schematicModel, schematicPage, { monochrome: schematicMonochrome, date: new Date().toLocaleDateString("uk-UA") });
  downloadBlob(`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, `${slugify(project.name)}-single-line-${schematicPage + 1}.svg`, "image/svg+xml;charset=utf-8");
}
function initSchematic() {
  $("#diagramSvgButton").addEventListener("click", exportSchematicSvg);
  $("#diagramMonoButton").addEventListener("click", () => { schematicMonochrome = !schematicMonochrome; renderConnectedDiagram(); });
  $("#diagramWideButton").addEventListener("click", () => {
    schematicExpanded = !schematicExpanded;
    document.body.classList.toggle("diagram-expanded", schematicExpanded);
    $("#diagramWideButton").setAttribute("aria-pressed", String(schematicExpanded));
    if (schematicAutoFit) requestAnimationFrame(fitSchematic);
  });
  [["#diagramZoomOut", -.15], ["#diagramZoomIn", .15]].forEach(([selector, step]) => $(selector).addEventListener("click", () => { schematicAutoFit = false; schematicScale = Math.max(.25, Math.min(1.8, schematicScale + step)); updateSchematicScale(); }));
  $("#diagramFitButton").addEventListener("click", () => { schematicAutoFit = "page"; fitSchematic(); });
  $("#diagramWidthButton").addEventListener("click", () => { schematicAutoFit = "width"; fitSchematic(); });
  $("#diagramPageInput").addEventListener("change", () => changeSchematicPage(Number($("#diagramPageInput").value)));
  $("#diagramPrevPage").addEventListener("click", () => changeSchematicPage(schematicPage - 1));
  $("#diagramNextPage").addEventListener("click", () => changeSchematicPage(schematicPage + 1));
  const open = (event) => {
    const target = event.target.closest("[data-diagram-device]");
    if (!target || event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
    if (event.type === "keydown") event.preventDefault();
    switchView("board"); chooseDevice(target.dataset.diagramDevice);
    if (window.innerWidth <= 1120) toggleDrawer("inspector");
  };
  $("#diagramPaper").addEventListener("click", open); $("#diagramPaper").addEventListener("keydown", open);
  $("#diagramDetails").addEventListener("click", open);
  window.addEventListener("resize", () => { if (schematicAutoFit) requestAnimationFrame(fitSchematic); });
}

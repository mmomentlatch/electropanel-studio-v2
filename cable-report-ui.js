const Cables = PanelCableReport;
const cableNumber = (value) => new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 3 }).format(value);
const cableColorLabel = (value) => E.COLORS[value]?.label || value || "Не задано";
function cableGroupTable(rows, sum, kind) {
  const title = kind === "wire" ? "Монтажні проводи" : "Кабелі приміщень";
  const amount = (row, key) => row.missing === row.circuits ? "—" : `${cableNumber(row[key])} м`;
  const unknown = sum.missing > 0 && sum.missing === sum.circuits;
  const total = (key) => unknown ? "—" : `${cableNumber(sum[key])} м`;
  return `<h3>${title}</h3><div class="floor-table-scroll"><table class="floor-table cable-totals-table"><thead><tr><th>Тип / марка</th><th>Колір</th><th>Жили × мм²</th><th>Матеріал</th><th>Ділянок</th><th>Без запасу</th><th>Запас</th><th>Закупівля</th></tr></thead><tbody>${rows.map((g) => `<tr><td><strong>${escapeHtml(g.type || "Тип не задано")}</strong><small>${escapeHtml(g.labels.join(", "))}${g.missing ? ` · ${g.missing} без повної довжини` : ""}</small></td><td>${escapeHtml(cableColorLabel(g.color))}</td><td>${g.cores} × ${g.section ?? "?"}</td><td>${g.material}</td><td>${g.segments || "—"}</td><td>${amount(g, "installedM")}</td><td>${kind === "wire" ? "—" : amount(g, "reserveM")}</td><td><strong>${amount(g, "purchaseM")}</strong></td></tr>`).join("") || '<tr><td colspan="8">Немає позицій для підсумовування.</td></tr>'}</tbody><tfoot><tr><th colspan="4">${unknown ? "Довжини не визначені" : sum.missing ? "Підсумок відомих довжин" : "Разом"}</th><td>${sum.segments}</td><td>${total("installedM")}</td><td>${kind === "wire" ? "—" : total("reserveM")}</td><td><strong>${total("purchaseM")}</strong></td></tr></tfoot></table></div>${sum.missing ? `<p class="cable-quantity-note">${sum.missing} ${kind === "wire" ? "проводів без введеної довжини" : "кіл із неповною трасою"}. Їхній невідомий метраж не включено в підсумок.</p>` : ""}`;
}
function cableSummaryMarkup(report, { includeWires = true, settingsOpen = false } = {}) {
  return `<div class="cable-quantity-summary"><div class="floor-report-heading"><h3>Підсумок кабельних довжин</h3><span>Однакові тип, колір, жили, переріз і матеріал підсумовуються.</span></div>${report.hasPlan ? cableGroupTable(report.cables, report.cableTotals, "cable") : '<p>Побудуйте план приміщень для розрахунку довжин зовнішніх кабелів. <button class="button ghost" type="button" data-cable-open-floor>Відкрити план</button></p>'}<p class="floor-footnote">Без запасу — траса зі спусками та припусками. Закупівля — сума довжин кіл із запасом та округленням вгору до метра. Кольори трас на плані служать для розрізнення кіл; колір кабелю задається окремо.</p>${includeWires && report.wires.length ? cableGroupTable(report.wires, report.wireTotals, "wire") + '<p class="floor-footnote">Довжину монтажного проводу введіть у його властивостях. Розмір намальованої лінії не використовується як метраж.</p>' : ""}${report.profiles.length ? `<details data-cable-settings ${settingsOpen ? "open" : ""}><summary>Параметри кабелів для підсумовування</summary><p>Уточніть марку, зовнішній колір і кількість жил. Переріз задається у властивостях апарата; у розрахунках кіл використовується Cu.</p><div class="floor-table-scroll"><table class="floor-table cable-settings-table"><thead><tr><th>Коло</th><th>Тип / марка кабелю</th><th>Колір оболонки</th><th>Жил</th></tr></thead><tbody>${report.profiles.map((p) => `<tr><td><strong>${escapeHtml(p.label)}</strong> ${escapeHtml(p.name)}</td><td><input aria-label="Тип кабелю ${escapeHtml(p.label)}" data-cable-device="${escapeHtml(p.id)}" data-cable-field="cableType" maxlength="100" value="${escapeHtml(p.type)}" placeholder="Наприклад ВВГнг-LS"/></td><td><select aria-label="Колір кабелю ${escapeHtml(p.label)}" data-cable-device="${escapeHtml(p.id)}" data-cable-field="cableColor"><option value="">Не задано</option>${Object.entries(E.COLORS).map(([key, v]) => `<option value="${key}" ${key === p.color ? "selected" : ""}>${escapeHtml(v.label)}</option>`).join("")}</select></td><td><input type="number" min="1" max="24" step="1" aria-label="Кількість жил ${escapeHtml(p.label)}" data-cable-device="${escapeHtml(p.id)}" data-cable-field="cableCores" value="${p.cores}"/></td></tr>`).join("")}</tbody></table></div></details>` : ""}</div>`;
}
function renderBomCables() {
  const target = $("#bomCableReport"), settingsOpen = target.querySelector("[data-cable-settings]")?.open;
  target.innerHTML = cableSummaryMarkup(Cables.calculate(project), { settingsOpen });
}
function updateCableProfile(event) {
  const input = event.target, field = input.dataset.cableField, device = project.devices.find((d) => d.id === input.dataset.cableDevice);
  if (!device || !["cableType", "cableColor", "cableCores"].includes(field)) return;
  const value = field === "cableCores" ? Number(input.value) : input.value.trim();
  if (field === "cableCores" && (!Number.isInteger(value) || value < 1 || value > 24)) { input.value = Cables.profile(device).cores; toast("Кількість жил має бути цілим числом від 1 до 24.", "error"); return; }
  snapshot(); device[field] = value; persistProject(); renderAll();
}
function initCableReports() {
  ["#floorCableReport", "#bomCableReport"].forEach((selector) => {
    $(selector).addEventListener("change", updateCableProfile);
    $(selector).addEventListener("click", (event) => { if (event.target.closest("[data-cable-open-floor]")) switchView("floor"); });
  });
}

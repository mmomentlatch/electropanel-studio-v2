function projectIssueGroupsMarkup(calc) {
  const groups = PanelProjectIssues.groups(project, calc.issues);
  if (!groups.length) return '<ul class="design-issues"><li class="pass"><b>✓</b><span>Перевірки заданої розрахункової моделі пройдені.</span></li></ul>';
  return `<p class="design-description">${groups.length} груп зауважень. Розгорніть потрібне коло й перейдіть до його параметра або компонента.</p>${groups.map((group) => `<details class="design-issue-group" data-issue-group="${escapeHtml(group.key)}" ${group.errors ? "open" : ""}><summary><strong>${escapeHtml(group.title)}</strong><span>${group.errors ? `Помилки: ${group.errors}` : ""}${group.errors && group.pending ? " · " : ""}${group.pending ? `Уточнення: ${group.pending}` : ""}</span></summary>${project.devices.some((d) => d.id === group.key) ? `<div class="design-issue-actions"><button type="button" class="issue-location" data-issue-object="${escapeHtml(group.key)}">Показати апарат на компоновці →</button></div>` : ""}<ul class="design-issues">${group.items.map((issue) => `<li class="${issue.level}"><b>${issue.level === "error" ? "!" : "…"}</b><div><span>${escapeHtml(issue.text)}</span><button type="button" class="issue-location" data-issue-index="${issue.index}">${issue.target.label} →</button></div></li>`).join("")}</ul></details>`).join("")}`;
}
function revealIssueField(input) {
  if (!input) return false;
  let parent = input.parentElement;
  while (parent) { if (parent.tagName === "DETAILS") parent.open = true; parent = parent.parentElement; }
  input.scrollIntoView({ block: "center" }); input.focus({ preventScroll: true });
  input.classList.add("issue-target"); setTimeout(() => input.classList.remove("issue-target"), 2400);
  return true;
}
function navigateProjectIssue(issue) {
  const target = PanelProjectIssues.target(project, issue); closeDrawers();
  if (target.view === "floor" && project.floorPlan) {
    switchView("floor"); floorCircuitId = target.circuitId || ""; requestFloorSidebar("settings"); renderFloorPlan();
    revealIssueField($(`#${target.field}`)); return;
  }
  if (target.view === "board") {
    switchView("board");
    if (target.kind === "device") chooseDevice(target.entityId);
    else if (target.kind === "consumer") { const consumer = project.consumers.find((c) => c.id === target.entityId); if (consumer?.deviceId) chooseDevice(consumer.deviceId); else { resetWiringSelection(); selectedDeviceId = null; renderInspector(); } }
    else chooseWiringEntity(target.kind, target.entityId);
    if (window.innerWidth <= 900) toggleDrawer("inspector");
    const node = $(target.kind === "device" ? `[data-device-id="${CSS.escape(target.entityId)}"]` : target.kind === "consumer" ? `[data-consumer-id="${CSS.escape(target.entityId)}"]` : target.kind === "wire" ? `[data-wire-id="${CSS.escape(target.entityId)}"]` : `#${target.kind}Inspector`);
    revealIssueField(node || $(".inspector-panel")); return;
  }
  switchView("design");
  const report = $("#designReport");
  let input = target.supply ? report.querySelector(`[data-design-supply="${CSS.escape(target.supply)}"]`) : target.field ? report.querySelector(`[data-circuit-id="${CSS.escape(target.entityId)}"][data-design-circuit="${target.field}"], [data-circuit-id="${CSS.escape(target.entityId)}"][data-design-device="${target.field}"]`) : target.entityId ? report.querySelector(`[data-design-details="${CSS.escape(target.entityId)}"] > summary, [data-remove-design-circuit="${CSS.escape(target.entityId)}"]`) : null;
  if (!input) input = report.querySelector(".design-inputs");
  if (input && !input.hasAttribute("tabindex") && !["INPUT", "SELECT", "BUTTON", "SUMMARY"].includes(input.tagName)) input.tabIndex = -1;
  revealIssueField(input);
}
function initProjectIssues() {
  $("#designReport").addEventListener("click", (event) => {
    const object = event.target.closest("[data-issue-object]"); if (object) { navigateProjectIssue({ entityId: object.dataset.issueObject, code: "object-location" }); return; }
    const button = event.target.closest("[data-issue-index]"); if (!button) return;
    const issue = D.calculate(project)?.issues[Number(button.dataset.issueIndex)]; if (issue) navigateProjectIssue(issue);
  });
}

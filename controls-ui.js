/* Apply voltage and AC/DC settings together while keeping terminal references stable. */
function renderControlInspector() {
  const device = project.devices.find((item) => item.id === selectedDeviceId);
  const rawConfig = device && ControlDevices.configFor(device.type);
  const config = rawConfig && Object.keys(rawConfig).length ? rawConfig : null;
  $("#controlInspector").classList.toggle("hidden", !config);
  if (!config) return;
  $("#controlFields").innerHTML = Object.keys(config).map((field) => {
    const schema = ControlDevices.FIELDS[field];
    if (!schema) return "";
    const value = ControlDevices.get(device, field);
    return `<label class="field"><span>${escapeHtml(schema.label)}</span>${schema.options ? `<select data-control-field="${field}">${schema.options.map(([key, label]) => `<option value="${key}" ${String(value) === key ? "selected" : ""}>${label}</option>`).join("")}</select>` : `<input type="number" data-control-field="${field}" min="${schema.min}" max="${schema.max}" step="${schema.step}" value="${escapeHtml(value)}"/>`}</label>`;
  }).join("");
  const notes = [];
  if (["power-supply", "control-transformer"].includes(device.type)) notes.push(`Вихід ${ControlDevices.get(device, "outputVoltage")} В ${device.type === "power-supply" ? "DC" : "AC"}; розрахунковий струм P/U ≈ ${number(ControlDevices.get(device, "outputPower") / ControlDevices.get(device, "outputVoltage"))} A. 12 і 24 В можуть бути різними моделями — звірте паспорт.`);
  if (device.type === "star-delta-relay") notes.push("C / Y / Δ — функціональні позначення. Для пуску потрібні три контактори, захист двигуна, електричне й механічне блокування та узгоджена пауза перемикання. Паспортну нумерацію клем звіряють з виробником.");
  if (["control-relay", "time-relay", "star-delta-relay"].includes(device.type)) notes.push("Живлення A1/A2 відокремлене від комутованих контактів. Час і режим зберігаються як дані проєкту; симуляція спрацювання не виконується.");
  if (device.type === "phase-monitor") notes.push("Трифазне реле контролю керує котушкою силового контактора, а не комутує всі силові фази своїм допоміжним контактом.");
  if (device.type === "relay") notes.push("Однофазне реле напруги ставиться після ввідного захисту; його допустимий струм має відповідати навантаженню. Воно не замінює автомат, дифзахист або ПЗІП.");
  notes.push("Універсальна функціональна модель. Клеми, категорію комутації, струм і межі напруги конкретного виробу уточнюють за паспортом.");
  $("#controlDeviceNote").textContent = notes.join(" ");
}

function initControls() {
  $("#applyControlSettingsButton").addEventListener("click", () => {
    const device = project.devices.find((item) => item.id === selectedDeviceId);
    const config = device && ControlDevices.configFor(device.type);
    if (!config) return;
    const next = { ...device };
    $$("[data-control-field]", $("#controlFields")).forEach((input) => {
      if (Object.hasOwn(config, input.dataset.controlField)) next[input.dataset.controlField] = input.type === "number" ? Number(input.value) : input.value;
    });
    const errors = ControlDevices.validate(next);
    if (errors.length) return toast(errors[0], "error");
    next.rating = ControlDevices.rating(next);
    snapshot(); Object.assign(device, next); persistProject(); renderAll();
    toast("Параметри збережено. Перевірте напругу вже підключених кіл.");
  });
}

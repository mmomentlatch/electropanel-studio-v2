/* Read-only single-line projection. Only external phase nets define the tree. */
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./electrical.js") : root.Electrical);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PanelSchematic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (E) {
  "use strict";
  const WIDTH = 1188, NODE_HEIGHT = 60, STEP = 115;
  const xml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  const fmt = (value) => Number.isFinite(Number(value)) && value !== null && value !== "" ? Number(value).toLocaleString("uk-UA", { maximumFractionDigits: 2 }) : "—";
  const input = (port) => port.portId === "in" || /-in$/.test(port.portId);
  const output = (port) => port.portId === "out" || /-out$/.test(port.portId);
  const power = (port) => E.PHASES.includes(port.potential) && !port.control && (input(port) || output(port));
  const shortType = (node) => {
    const type = node.entity.type;
    if (node.kind === "consumer") return "Споживач";
    if (type.startsWith("main-")) return `${type.match(/(\d)p$/)?.[1] || ""}P · Ввідний автомат`;
    if (type.startsWith("mcb-")) return `${type.match(/(\d)p$/)?.[1] || ""}P · Автомат`;
    if (type.startsWith("rccb-")) return `${type.match(/(\d)p$/)?.[1] || ""}P · ПЗВ`;
    return ({ rcbo: "1P+N · Дифавтомат", "rcbo-afdd": "1P+N · Дифавтомат + ПВДП", relay: "Реле напруги", meter: "Лічильник", "power-supply": "Блок живлення", "control-transformer": "Трансформатор", "fuse-holder": "Запобіжник", terminal: "Клема", "outgoing-terminal": "Клемник", "motor-protection-3p": "Захист двигуна" })[type] || (type.startsWith("spd-") ? "ПЗІП" : type.includes("contactor") ? "Контактор" : node.entity.name);
  };

  function build(project, { maxColumns = 6 } = {}) {
    const ports = E.allEndpoints(project).filter(power), parent = new Map(ports.map((port) => [E.endpointKey(port), E.endpointKey(port)]));
    const find = (ref) => { let key = E.endpointKey(ref); while (parent.has(key) && parent.get(key) !== key) key = parent.get(key); return key; };
    const join = (a, b) => { if (parent.has(E.endpointKey(a)) && parent.has(E.endpointKey(b))) parent.set(find(a), find(b)); };
    const used = new Set(), phaseWires = new Set();
    project.wires.forEach((wire) => {
      const a = E.resolveEndpoint(project, wire.from), b = E.resolveEndpoint(project, wire.to);
      if (!a || !b || !power(a) || !power(b) || !E.compatible(project, a, b, wire.potential)) return;
      join(a, b); used.add(a.ownerId); used.add(b.ownerId); phaseWires.add(wire.id);
    });
    project.combs.forEach((comb) => {
      const members = comb.terminals.map((ref) => E.resolveEndpoint(project, ref)).filter((port) => port && power(port) && port.potential === comb.potential);
      members.slice(1).forEach((port) => join(members[0], port));
      members.forEach((port) => used.add(port.ownerId));
    });
    const nodes = new Map();
    [...project.devices.map((entity) => ({ entity, kind: "device" })), ...(project.consumers || []).map((entity) => ({ entity, kind: "consumer" }))].forEach(({ entity, kind }, order) => {
      if (used.has(entity.id)) nodes.set(entity.id, { id: entity.id, kind, entity, order, children: [], parents: [] });
    });
    const nets = new Map(), edgeMap = new Map(), warnings = [];
    ports.forEach((port) => { const key = find(port); if (!nets.has(key)) nets.set(key, []); nets.get(key).push(port); });
    nets.forEach((members) => {
      const sources = members.filter((port) => output(port) && nodes.has(port.ownerId));
      const targets = members.filter((port) => input(port) && nodes.has(port.ownerId));
      if (new Set(sources.map((port) => port.ownerId)).size > 1) warnings.push("На одній фазній мережі з’єднано кілька виходів. Перевірте відомість з’єднань.");
      sources.forEach((a) => targets.forEach((b) => {
        if (a.ownerId === b.ownerId) return;
        const key = JSON.stringify([a.ownerId, b.ownerId]);
        if (!edgeMap.has(key)) edgeMap.set(key, { from: a.ownerId, to: b.ownerId, potentials: [] });
        const edge = edgeMap.get(key);
        if (!edge.potentials.includes(a.potential)) edge.potentials.push(a.potential);
      }));
    });
    const edges = [...edgeMap.values()];
    edges.forEach((edge) => { nodes.get(edge.from).children.push(edge.to); nodes.get(edge.to).parents.push(edge.from); });
    const order = (a, b) => nodes.get(a).order - nodes.get(b).order;
    nodes.forEach((node) => { node.children.sort(order); node.parents.sort(order); });
    const roots = [...nodes.values()].filter((node) => !node.parents.length).sort((a, b) => Number(b.entity.type?.startsWith("main-")) - Number(a.entity.type?.startsWith("main-")) || a.order - b.order);
    const remaining = new Map([...nodes].map(([id, node]) => [id, node.parents.length]));
    const queue = roots.map((node) => node.id), ranks = new Map(queue.map((id) => [id, 0]));
    for (let index = 0; index < queue.length; index += 1) {
      const id = queue[index];
      nodes.get(id).children.forEach((child) => {
        ranks.set(child, Math.max(ranks.get(child) || 0, ranks.get(id) + 1));
        remaining.set(child, remaining.get(child) - 1);
        if (!remaining.get(child)) queue.push(child);
      });
    }
    const cycle = queue.length !== nodes.size;
    const network = cycle || [...nodes.values()].some((node) => node.parents.length > 1);
    if (network) warnings.push("Складна топологія: показано всі фактичні силові зв’язки без перетворення на одну групу живлення.");
    const pages = [];
    if (network) {
      let last = Math.max(0, ...ranks.values());
      [...nodes.keys()].filter((id) => remaining.get(id)).forEach((id) => ranks.set(id, ++last));
      pages.push({ ids: [...nodes.keys()], leaves: [...nodes.values()].filter((node) => !node.children.length).map((node) => node.id), ranks: Object.fromEntries(ranks), network: true });
    } else if (nodes.size) {
      const leavesFor = (id) => nodes.get(id).children.length ? nodes.get(id).children.flatMap(leavesFor) : [id];
      const allLeaves = roots.flatMap((node) => leavesFor(node.id));
      const limit = Math.max(2, Math.min(8, Math.floor(Number(maxColumns)) || 6));
      const columns = Math.ceil(allLeaves.length / Math.ceil(allLeaves.length / limit));
      const units = [];
      const collect = (id) => {
        const node = nodes.get(id), leaves = leavesFor(id);
        if (node.entity.type?.startsWith("rccb-") && leaves.length <= columns || !node.children.length) units.push(leaves);
        else node.children.forEach(collect);
      };
      roots.forEach((node) => collect(node.id));
      let leafPage = [];
      const save = () => {
        if (!leafPage.length) return;
        const ids = new Set();
        leafPage.forEach((leaf) => { let id = leaf; while (id && !ids.has(id)) { ids.add(id); id = nodes.get(id).parents[0]; } });
        const pageRanks = new Map([...ids].map((id) => [id, ranks.get(id)]));
        const bottom = Math.max(1, ...allLeaves.map((id) => ranks.get(id)));
        leafPage.forEach((id) => { pageRanks.set(id, bottom); const parentId = nodes.get(id).parents[0]; if (nodes.get(id).kind === "consumer" && parentId && !nodes.get(parentId).entity.type?.startsWith("main-") && nodes.get(parentId).children.every((child) => nodes.get(child).kind === "consumer")) pageRanks.set(parentId, bottom - 1); });
        pages.push({ ids: [...ids], leaves: leafPage, ranks: Object.fromEntries(pageRanks), network: false }); leafPage = [];
      };
      units.forEach((unit) => { if (leafPage.length && leafPage.length + unit.length > columns) save(); leafPage.push(...unit); if (leafPage.length >= columns) save(); });
      save();
    }
    const neutral = E.connectivity(project, { neutralDomains: true });
    const returnName = (node, potential) => {
      const end = E.allEndpoints(project).find((port) => port.ownerId === node.id && port.potential === potential && (input(port) || potential === "PE"));
      if (!end) return "—";
      const net = neutral.find(end), labels = [];
      project.busbars.filter((bar) => [potential, "PEN"].includes(bar.potential) && neutral.find({ kind: "busbar", ownerId: bar.id, portId: "1" }) === net).forEach((bar) => labels.push(bar.label));
      if (!labels.length && potential === "N") project.devices.filter(E.isRcd).forEach((device) => { const port = E.deviceTerminals(device).find((p) => p.potential === "N" && output(p)); if (port && neutral.find({ kind: "device", ownerId: device.id, portId: port.portId }) === net) labels.push(device.label); });
      return labels.join(", ") || "не простежено";
    };
    const circuits = new Map();
    [...new Set(pages.flatMap((page) => page.leaves))].forEach((id, index) => {
      const leaf = nodes.get(id), protection = leaf.kind === "consumer" ? nodes.get(leaf.parents[0]) : leaf;
      const spec = project.design?.circuits?.find((item) => item.outputId === id || item.deviceId === id) || {};
      const wires = project.wires.filter((wire) => [wire.from, wire.to].some((end) => end.ownerId === id));
      const conductors = [...new Set(wires.map((wire) => `${wire.material} ${fmt(wire.section)} мм²`))];
      circuits.set(id, { id, index: index + 1, label: protection?.entity.label || leaf.entity.label, name: leaf.entity.name, phase: leaf.entity.phase || "—", powerKw: protection?.entity.load ?? null, conductors: conductors.join(" / ") || "—", lengthM: spec.lengthM ?? null, lengthEstimated: spec.lengthOrigin === "floor-plan" && !project.floorPlan?.geometryConfirmed, neutral: returnName(leaf, "N"), earth: returnName(leaf, "PE"), lighting: Boolean(spec.lighting) });
    });
    const omitted = project.devices.filter((device) => device.type !== "blank" && !nodes.has(device.id));
    const auxiliaryWires = project.wires.filter((wire) => !phaseWires.has(wire.id) && !["N", "PE", "PEN"].includes(wire.potential));
    return { project, nodes, edges, pages, circuits, roots: roots.map((node) => node.id), warnings: [...new Set(warnings)], omitted, auxiliaryWires };
  }

  function scopeCss(css) {
    return css.replace(/(^|})([^{}]+)\{/g, (_, end, selectors) => end + selectors.split(",").map((selector) => selector.trim() === ".sld-svg" ? ".sld-svg" : `.sld-svg ${selector.trim()}`).join(",") + "{");
  }

  function wrap(value, chars = 22) {
    const words = String(value ?? "").split(/\s+/), lines = [];
    let line = "";
    words.forEach((word) => {
      while (word.length > chars) { if (line) { lines.push(line); line = ""; } lines.push(word.slice(0, chars)); word = word.slice(chars); }
      if (line && `${line} ${word}`.length > chars) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
    });
    if (line) lines.push(line);
    return lines.length ? lines : ["—"];
  }
  function text(x, y, value, cls = "", anchor = "start", chars = 100, lineHeight = 15) {
    return `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${wrap(value, chars).map((line, i) => `<tspan x="${x}" dy="${i ? lineHeight : 0}">${xml(line)}</tspan>`).join("")}</text>`;
  }
  function glyph(node, circuit) {
    const t = node.entity.type || "", switchPath = '<path d="M0 0V17M0 43V60M0 43L15 20"/><circle cx="0" cy="17" r="2"/><circle cx="0" cy="43" r="2"/>';
    if (node.kind === "consumer") return circuit?.lighting ? '<path d="M0 0V18"/><circle cx="0" cy="29" r="11"/><path d="M-8 21L8 37M8 21L-8 37"/>' : '<path d="M0 0V25"/><path d="M-8 25H8L0 39Z" fill="currentColor"/>';
    if (/^(main-|mcb-|rcbo|rccb-)/.test(t)) return `${switchPath}${/^rccb-|^rcbo/.test(t) ? '<circle cx="0" cy="7" r="8"/><text x="-20" y="11" class="glyph-tag" text-anchor="middle">Δ</text>' : ""}${!t.startsWith("rccb-") ? '<path d="M-12 27H-7V36H-12"/>' : ""}${t === "rcbo-afdd" ? '<path d="M-21 45L-15 37L-18 44L-12 42"/>' : ""}`;
    if (t.startsWith("spd-")) return '<path d="M0 0V15M0 45V55"/><rect x="-10" y="15" width="20" height="30"/><path d="M3 19L-4 32H3L-3 41"/>' + (circuit && !["—", "не простежено"].includes(circuit.earth) ? '<path d="M-10 55H10M-6 59H6M-2 63H2"/>' : '<circle cx="0" cy="58" r="3"/><text x="15" y="61" class="glyph-tag">PE?</text>');
    if (["terminal", "outgoing-terminal"].includes(t)) return '<path d="M0 0V25M0 35V60"/><circle cx="0" cy="30" r="5"/>';
    if (t === "fuse-holder") return '<path d="M0 0V60"/><rect x="-6" y="17" width="12" height="26"/>';
    if (t.includes("contactor")) return switchPath + '<path d="M-19 25H-10M-19 36H-10" stroke-dasharray="2 2"/>';
    if (t === "meter") return '<path d="M0 0V12M0 48V60"/><circle cx="0" cy="30" r="18"/><text x="0" y="34" class="glyph-tag" text-anchor="middle">Wh</text>';
    const tag = t === "relay" ? "U" : t === "power-supply" ? "~/=" : t === "control-transformer" ? "~/~" : "";
    return `<path d="M0 0V13M0 47V60"/><rect x="-15" y="13" width="30" height="34"/>${text(0, 35, tag, "glyph-tag", "middle")}`;
  }

  function layout(model, pageIndex) {
    const page = model.pages[pageIndex], positions = new Map(), ids = new Set(page.ids);
    const gap = (WIDTH - 250) / Math.max(1, page.leaves.length);
    if (page.network) {
      const rows = new Map();
      page.ids.forEach((id) => { const rank = page.ranks[id]; if (!rows.has(rank)) rows.set(rank, []); rows.get(rank).push(id); });
      rows.forEach((row, rank) => row.forEach((id, i) => positions.set(id, { x: 110 + (i + .5) * (WIDTH - 220) / row.length, y: 140 + rank * STEP })));
    } else {
      page.leaves.forEach((id, i) => positions.set(id, { x: 180 + (i + .5) * gap, left: 180 + (i + .5) * gap, right: 180 + (i + .5) * gap, y: 140 + page.ranks[id] * STEP }));
      const place = (id) => {
        if (positions.has(id)) return positions.get(id);
        const children = model.nodes.get(id).children.filter((child) => ids.has(child)).map(place);
        const left = Math.min(...children.map((child) => child.left)), right = Math.max(...children.map((child) => child.right));
        const x = (left + right) / 2;
        const point = { x, left, right, y: 140 + page.ranks[id] * STEP }; positions.set(id, point); return point;
      };
      model.roots.filter((id) => ids.has(id)).forEach(place);
    }
    const tableY = Math.max(250, ...[...positions.values()].map((point) => point.y + NODE_HEIGHT + 14));
    return { page, positions, ids, gap, tableY };
  }

  function renderSvg(model, pageIndex = 0, { monochrome = false, date = "" } = {}) {
    if (!model.pages[pageIndex]) return "";
    const { page, positions, ids, gap, tableY } = layout(model, pageIndex), project = model.project;
    const labelWidth = 110, tableWidth = WIDTH - 140, colWidth = (tableWidth - labelWidth) / Math.max(1, page.leaves.length);
    const maxNameLines = Math.max(1, ...page.leaves.map((id) => wrap(model.circuits.get(id).name, Math.floor((colWidth - 14) / 6)).length));
    const rows = [
      { title: "Коло", height: 26, value: (c) => c.label, cls: "table-strong" },
      { title: "Призначення", height: Math.max(43, maxNameLines * 15 + 17), value: (c) => c.name },
      { title: "Фаза / P", height: 26, value: (c) => `${c.phase} · ${fmt(c.powerKw)} кВт` },
      { title: "Провід", height: 34, value: (c) => c.conductors },
      { title: "Довжина", height: 25, value: (c) => c.lengthM == null ? "—" : `${c.lengthEstimated ? "≈ " : ""}${fmt(c.lengthM)} м` },
      { title: "N / PE", height: 42, value: (c) => `N: ${c.neutral} | PE: ${c.earth}` },
    ];
    const tableHeight = page.network ? 0 : rows.reduce((sum, row) => sum + row.height, 0);
    const footerExtra = (wrap(project.name, 90).length - 1) * 15;
    const height = Math.max(840, tableY + tableHeight + 105 + footerExtra);
    const css = `.sld-svg{stroke:none}text{stroke:none;font-family:Arial,"Segoe UI",sans-serif;fill:#263d4b;font-size:12px}path,circle,rect,line{vector-effect:non-scaling-stroke}.wire{fill:none;stroke:#334f5d;stroke-width:1.55;stroke-linecap:square;stroke-linejoin:round}.junction{fill:#334f5d}.symbol{color:#283f4c;fill:none;stroke:currentColor;stroke-width:1.55}.symbol rect,.symbol circle{fill:white}.symbol text{stroke:none}.node-label,.table-strong{font-weight:700;font-size:13px}.node-kind{font-size:10px;fill:#667b87}.rating{font-size:12px}.glyph-tag{font-size:10px;fill:currentColor}.muted{fill:#7c8c96;font-size:10px}.page-title{font-size:23px;font-weight:700}.eyebrow{font-size:9px;letter-spacing:1.5px;fill:#6e838d}.page-code{font-size:13px;font-weight:700}.node-main{color:#243a48}.node-rcd{color:#17808d}.node-rcbo{color:#a66a20}.node-rcd .symbol{color:#17808d}.node-rcd .node-label{fill:#17808d}.node-rcbo .symbol{color:#a66a20}.node-rcbo .node-label{fill:#a66a20}.group-hint{fill:#17808d;font-size:9px}.table-text{font-size:12px}.stamp{font-size:10px}.status{font-size:10px;fill:#8b713a}.cross-link{stroke:#b46443;stroke-dasharray:5 4}${monochrome ? "text,.muted,.group-hint,.node-kind,.eyebrow,.status{fill:#18232b}.symbol,.node-rcd,.node-rcbo{color:#18232b}.wire{stroke:#18232b}.junction{fill:#18232b}.node-rcd .symbol,.node-rcbo .symbol{color:#18232b}.node-rcd .node-label,.node-rcbo .node-label{fill:#18232b}" : ""}`;
    const style = `<style>${scopeCss(css)}</style>`;
    const header = `<rect width="${WIDTH}" height="${height}" fill="white"/><rect x="25" y="25" width="${WIDTH - 50}" height="${height - 50}" fill="none" stroke="#b6c4cb" stroke-width="1"/>${text(52, 50, "ELECTROPANEL / ЕЛЕКТРОТЕХНІЧНИЙ ПРОЄКТ", "eyebrow")}${text(52, 81, "Однолінійна схема", "page-title")}${text(52, 103, project.board.name, "muted", "start", 100)}${text(WIDTH - 52, 57, `ЕП · ${String(pageIndex + 1).padStart(2, "0")}`, "page-code", "end")}${text(WIDTH - 52, 80, `${project.design?.supply?.phases || (project.devices.some((d) => d.type === "main-3p" || d.type === "main-4p") ? 3 : 1)} ф. · ${project.design?.supply?.phases === 3 || project.devices.some((d) => d.type === "main-3p" || d.type === "main-4p") ? "230/400" : "230"} В · ${project.board.earthing}`, "muted", "end")}<path d="M52 116H${WIDTH - 52}" stroke="#d7e0e4" fill="none"/>`;
    const links = [];
    if (page.network) model.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)).forEach((edge, i) => {
      const a = positions.get(edge.from), b = positions.get(edge.to), mid = a.y + NODE_HEIGHT + 18 + i % 4 * 7;
      links.push(`<path class="wire cross-link" d="M${a.x} ${a.y + NODE_HEIGHT}V${mid}H${b.x}V${b.y}"/>`);
    });
    else page.ids.forEach((id) => {
      const node = model.nodes.get(id), children = node.children.filter((child) => ids.has(child));
      if (!children.length) return;
      const a = positions.get(id), end = children.map((child) => positions.get(child)), busY = a.y + NODE_HEIGHT + 23;
      const min = Math.min(a.x, ...end.map((p) => p.x)), max = Math.max(a.x, ...end.map((p) => p.x));
      links.push(`<path class="wire" d="M${a.x} ${a.y + NODE_HEIGHT}V${busY}M${min} ${busY}H${max}"/>`);
      end.forEach((b) => links.push(`<path class="wire" d="M${b.x} ${busY}V${b.y}"/>${end.length > 1 ? `<circle class="junction" cx="${b.x}" cy="${busY}" r="2.7"/>` : ""}`));
      if (node.entity.type?.startsWith("rccb-")) {
        const bars = project.busbars.filter((bar) => bar.rcdId === id).map((bar) => bar.label).join(", ");
        links.push(text(min, busY + 14, bars ? `N: ${bars}` : `Група ${node.entity.label}`, "group-hint", "start", 55, 11));
      }
    });
    const symbols = page.ids.map((id) => {
      const node = model.nodes.get(id), p = positions.get(id), type = node.entity.type || "", c = model.circuits.get(id);
      const cls = type.startsWith("rccb-") ? "node-rcd" : type.startsWith("rcbo") ? "node-rcbo" : "node-main";
      const labelChars = Math.max(13, Math.floor(Math.min(gap * .66, 190) / 6));
      const control = node.kind === "device" ? ` role="button" tabindex="0" data-diagram-device="${xml(id)}" aria-label="Відкрити ${xml(node.entity.label)} · ${xml(node.entity.name)}"` : "";
      const label = node.kind === "consumer" ? "" : `${text(p.x + 22, p.y + 17, node.entity.label, "node-label")}${text(p.x + 22, p.y + 33, node.entity.rating, "rating", "start", labelChars, 12)}${text(p.x + 22, p.y + 62, shortType(node), "node-kind", "start", labelChars, 12)}`;
      const source = !node.parents.length ? type.startsWith("main-") ? `<path class="wire" d="M${p.x} ${p.y - 14}V${p.y}"/>${text(p.x - 10, p.y - 19, "Ввід", "muted", "end")}` : text(p.x, p.y - 12, "Живлення не простежено", "status", "middle", 29) : "";
      return `<g class="sld-node ${cls}" data-node-id="${xml(id)}"${control}><title>${xml(`${node.entity.label} · ${node.entity.name} · ${node.entity.rating || ""}`)}</title><rect x="${p.x - 27}" y="${p.y - 5}" width="${Math.min(gap * .9, 220)}" height="78" fill="transparent" stroke="none"/>${source}<g transform="translate(${p.x} ${p.y})" class="symbol">${glyph(node, c)}</g>${label}</g>`;
    }).join("");
    let table = "";
    if (!page.network) {
      let y = tableY;
      table += `<rect x="70" y="${tableY}" width="${tableWidth}" height="${tableHeight}" fill="none" stroke="#c5d2d9"/>`;
      rows.forEach((row, index) => {
        table += `<rect x="70" y="${y}" width="${labelWidth}" height="${row.height}" fill="#f2f6f8"/>${index ? `<path d="M70 ${y}H${WIDTH - 70}" fill="none" stroke="#d4dfe4"/>` : ""}${text(81, y + 17, row.title, "muted")}`;
        page.leaves.forEach((id, col) => {
          const x = 70 + labelWidth + col * colWidth;
          table += `${text(x + colWidth / 2, y + 17, row.value(model.circuits.get(id)), row.cls || "table-text", "middle", Math.max(12, Math.floor((colWidth - 14) / 6)), 15)}${index === 0 ? `<path d="M${x} ${y}V${tableY + tableHeight}" stroke="#d4dfe4"/>` : ""}`;
        });
        y += row.height;
      });
    }
    const bars = project.busbars.map((bar) => `${bar.label} (${bar.potential})`).join(" · ");
    const footerY = height - 76 - footerExtra;
    const footer = `${text(52, footerY - 17, bars || "N/PE-шини не задані", "muted", "start", 155, 12)}<path d="M52 ${footerY}H${WIDTH - 52}" stroke="#b6c4cb"/>${text(52, footerY + 19, project.name, "stamp", "start", 90)}${text(52, footerY + 37 + footerExtra, "За проводами й гребінками · N/PE наведено у відомості · чернетка", "muted")}${text(WIDTH - 52, footerY + 19, `Аркуш ${pageIndex + 1} / ${model.pages.length}`, "page-code", "end")}${text(WIDTH - 52, footerY + 37 + footerExtra, date, "muted", "end")}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="${(height / WIDTH * 297).toFixed(2)}mm" viewBox="0 0 ${WIDTH} ${height}" class="sld-svg" role="group" aria-label="Однолінійна схема, аркуш ${pageIndex + 1} з ${model.pages.length}">${style}${header}${links.join("")}${symbols}${table}${footer}</svg>`;
  }
  return { WIDTH, build, layout, renderSvg, wrap, shortType };
});

/* Portrait device faces drawn in millimetres, with one scale on both axes. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PanelProtectionFace = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TYPES = {
    "rccb-2p": { width: 35, poles: 2, kind: "rccb", title: "ПЗВ", footer: "RCCB · 2P" },
    "rccb-4p": { width: 70, poles: 4, kind: "rccb", title: "ПЗВ 4P", footer: "RCCB · 4P" },
    rcbo: { width: 35, poles: 2, kind: "rcbo", title: "ДИФ", footer: "RCBO · 1P+N" },
    "rcbo-afdd": { width: 72, poles: 2, kind: "afdd", title: "ДИФ + ПВДП", footer: "1P+N · AFDD" }
  };
  let serial = 0;
  const supports = (type) => Object.hasOwn(TYPES, type);
  const n = (value) => String(Math.round(value * 1e6) / 1e6);
  function layout(type, dimensions = {}) {
    if (!supports(type)) throw new Error("Unknown protection face");
    const spec = TYPES[type];
    const width = Number(dimensions.widthMm ?? spec.width), height = Number(dimensions.heightMm ?? 90);
    if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error("Invalid face dimensions");
    const shellScale = Math.min(1, width / 20, height / 60);
    const scale = Math.max(.000001, Math.min(1, width / spec.width, (height - 32 * shellScale) / 34));
    const cy = height / 2 + shellScale;
    const buttonX = spec.kind === "afdd" ? 28 : spec.width - 7.4;
    return { ...spec, type, width, height, shellScale, scale, cy, originX: (width - spec.width * scale) / 2,
      button: { x: buttonX, y: -6, radius: 2.7, size: 5.4, shape: spec.kind === "rccb" ? "circle" : "square" },
      lever: { x: 6.6, y: -7.8, width: spec.poles === 4 ? 39.5 : 8.6, height: 17.5 } };
  }
  function render(type, dimensions) {
    const m = layout(type, dimensions), { width: w, height: h, shellScale: s, button: b, lever: lever } = m;
    const id = `protection-face-${++serial}`, rcd = m.kind === "rccb", accent = rcd ? "#3a9aa6" : "#ce963b";
    const termSpan = m.kind === "afdd" ? w / 2 : w;
    const screws = [6.1 * s, h - 8.2 * s].flatMap((y) => Array.from({ length: m.poles }, (_, i) => {
      const x = termSpan * (i + .5) / m.poles;
      return `<g data-face-screw="true"><circle cx="${n(x)}" cy="${n(y)}" r="${n(2.65 * s)}" fill="url(#${id}-metal)" stroke="#8c9891" stroke-width="${n(.28 * s)}"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(1.9 * s)}" fill="#64716b" stroke="#c4cec6" stroke-width="${n(.2 * s)}"/><path d="M${n(x - 1.35 * s)} ${n(y)}h${n(2.7 * s)}m${n(-1.35 * s)} ${n(-1.35 * s)}v${n(2.7 * s)}" stroke="#e5eae3" stroke-width="${n(.45 * s)}"/></g>`;
    })).join("");
    const test = b.shape === "circle"
      ? `<circle data-face-test="true" cx="${n(b.x)}" cy="${n(b.y)}" r="${n(b.radius)}" fill="#4297af" stroke="#246a80" stroke-width=".32"/>`
      : `<rect data-face-test="true" x="${n(b.x - b.size / 2)}" y="${n(b.y - b.size / 2)}" width="${n(b.size)}" height="${n(b.size)}" rx=".8" fill="#328da4" stroke="#1b647d" stroke-width=".32"/>`;
    const ridges = [lever.y + 3.2, lever.y + 4.6, lever.y + 6].map((y) => `<path d="M${n(lever.x + 1)} ${n(y)}h${n(lever.width - 2)}" stroke="${rcd ? "#8da7b4" : "#8c9a8d"}" stroke-width=".42" opacity=".72"/>`).join("");
    const residual = rcd
      ? `<text x="${n(b.x)}" y="3.5" text-anchor="middle" font-size="1.9" fill="#526e76">IΔn</text><path d="M${n(b.x - 3)} 10h6m-4.6-2v4m3.2-4v4" stroke="#627b7d" stroke-width=".4"/>`
      : `<rect x="${n(b.x - 1.7)}" y="2.3" width="3.4" height="1.8" rx=".3" fill="#d5803f"/><path d="M${n(b.x - 3)} 11h6m-5-1 1.6-3 1.3 4.2 1.6-3" stroke="#94713b" stroke-width=".4" fill="none"/>`;
    const afdd = m.kind === "afdd" ? `<g data-face-afdd="true"><rect x="39" y="-13" width="29" height="30" rx="1.8" fill="#e2e6dc" stroke="#b4beb0" stroke-width=".4"/><circle cx="43.5" cy="-7" r=".85" fill="#64a75a"/><circle cx="62" cy="-7" r="1.7" fill="#d89738" stroke="#a16f24" stroke-width=".3"/><text x="53.5" y="3.5" text-anchor="middle" font-size="3" fill="#7c6c43">AFDD</text><path d="m43.5 11 3-2 2.5 3 2.5-2.5 2.5 2.5 3-3 4 2" fill="none" stroke="#a78336" stroke-width=".45"/></g>` : "";
    return `<svg class="device-photo-tile protection-face" data-protection-type="${type}" viewBox="0 0 ${n(w)} ${n(h)}" preserveAspectRatio="xMidYMid meet" style="fill:none;stroke:none;stroke-width:.3" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}-body" x2="1" y2=".7"><stop stop-color="#fafbf8"/><stop offset=".6" stop-color="#e8ece5"/><stop offset="1" stop-color="#ccd4ca"/></linearGradient><linearGradient id="${id}-metal" x2=".8" y2="1"><stop stop-color="#e0e6de"/><stop offset=".5" stop-color="#aab6ab"/><stop offset="1" stop-color="#718078"/></linearGradient><linearGradient id="${id}-lever" x2="0" y2="1"><stop stop-color="${rcd ? "#627e8e" : "#5b6b5c"}"/><stop offset=".5" stop-color="${rcd ? "#345468" : "#334738"}"/><stop offset="1" stop-color="${rcd ? "#17384e" : "#192b20"}"/></linearGradient></defs><rect x="${n(.3 * s)}" y="${n(.3 * s)}" width="${n(w - .6 * s)}" height="${n(h - .6 * s)}" rx="${n(1.1 * s)}" fill="url(#${id}-body)" stroke="#9da99f" stroke-width="${n(.3 * s)}"/><path d="M${n(.8 * s)} ${n(13 * s)}H${n(w - .8 * s)}M${n(.8 * s)} ${n(h - 13 * s)}H${n(w - .8 * s)}" stroke="#b9c3b7" stroke-width="${n(.35 * s)}"/><rect x="${n(.8 * s)}" y="${n(25 * s)}" width="${n(w - 1.6 * s)}" height="${n(h - 40 * s)}" rx="${n(.9 * s)}" fill="#f1f3ed" stroke="#c2cabe" stroke-width="${n(.22 * s)}"/>${screws}<rect x="${n(2 * s)}" y="${n(22.5 * s)}" width="${n(w - 4 * s)}" height="${n(1.65 * s)}" fill="${accent}"/><text x="${n(w - 2 * s)}" y="${n(18.6 * s)}" text-anchor="end" font-family="Arial,sans-serif" font-size="${n(2.5 * s)}" fill="${rcd ? "#2a7280" : "#99702b"}">${m.title}</text><g data-face-controls="true" transform="translate(${n(m.originX)} ${n(m.cy)}) scale(${n(m.scale)})" font-family="Arial,sans-serif"><rect x="5.1" y="-11.7" width="${n(lever.width + 3)}" height="25.3" rx="1.15" fill="${rcd ? "#a2b1ab" : "#a7b1a2"}" stroke="#83978a" stroke-width=".38"/><rect data-face-lever="true" x="${n(lever.x)}" y="${n(lever.y)}" width="${n(lever.width)}" height="${n(lever.height)}" rx=".85" fill="url(#${id}-lever)" stroke="${rcd ? "#29495c" : "#2a3d2e"}" stroke-width=".35"/>${ridges}${test}<text data-face-test-label="true" x="${n(b.x)}" y="${n(b.y + .85)}" text-anchor="middle" font-size="2.5" fill="#fff">T</text>${residual}${afdd}</g><text x="${n(2.2 * s)}" y="${n(h - 18 * s)}" font-family="Arial,sans-serif" font-size="${n(1.7 * s)}" fill="#6c7d71">${m.footer}</text></svg>`;
  }
  return { TYPES, supports, layout, render };
});

/* Display geometry and photo framing are independent of engineering dimensions. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./mechanical.js"));
  else root.PanelDeviceVisuals = factory(root.PanelMechanical);
})(typeof globalThis !== "undefined" ? globalThis : this, function (M) {
  const HEIGHT = 90;
  // Bounds of the opaque housing in the original 320×480 photos. The middle
  // band contains blank plastic; terminals, levers, buttons and displays keep
  // their proportions while that band accommodates the chosen housing height.
  const PHOTOS = {
    "mcb-1p.png": { box: [108, 10, 104, 459], band: [329, 363] },
    "voltage-relay.png": { box: [63, 23, 195, 438], band: [303, 342] },
    "spd-2p.png": { box: [53, 20, 215, 442], band: [257, 345] },
    "contactor.png": { box: [55, 18, 210, 445], band: [311, 342] },
    "energy-meter.png": { box: [59, 35, 202, 410], band: [287, 324] },
    "terminal-block.png": { box: [109, 13, 103, 455], band: [269, 284] }
  };
  const vector = (width, bands, inset = 1.5) => ({ box: [inset, .5, width - inset * 2, 103], bands, sourceWidth: width, sourceHeight: 104 });
  const FACES = { ...PHOTOS,
    "rcbo.svg": { ...vector(84, [], .5), wholeFace: true },
    "rcbo-afdd.svg": { ...vector(168, [], .5), wholeFace: true },
    "rccb-2p.svg": { ...vector(84, [], .5), wholeFace: true },
    "rccb-4p.svg": { ...vector(168, [], .5), wholeFace: true },
    "power-supply.svg": vector(120, [[15.5, 16.5], [86.5, 88.5]], .5),
    "control-relay.svg": vector(80, [[16, 21], [85, 88]]),
    "timer-relay.svg": vector(80, [[15, 19], [86, 90]]),
    "contactor-2p.svg": vector(120, [[19, 23], [83, 87]]),
    "contactor-3p.svg": vector(120, [[19, 23], [83, 87]]),
    "motor-protection.svg": vector(120, [[19, 23], [81, 87]]),
    "indicator.svg": vector(40, [[22, 33], [68, 83]]),
    "outlet.svg": vector(80, [[20, 27], [87, 90]])
  };
  function dimensions(device, uniform = true) {
    const actual = M.dimensions(device);
    return uniform ? { ...actual, heightMm: HEIGHT, railOffsetMm: HEIGHT / 2 } : actual;
  }
  function scene(project, uniform = true) {
    if (!uniform) return project;
    return { ...project, devices: project.devices.map((device) => {
      const d = dimensions(device, true);
      return { ...device, geometryId: "custom", dimensions: { ...d, confirmed: false } };
    }) };
  }
  function slices(photo, height) {
    const profile = FACES[photo]; if (!profile || !Number.isFinite(height) || height <= 0) return null;
    const [x, y, width, h] = profile.box, bands = profile.bands || [profile.band];
    if (profile.wholeFace) return { width, height, pieces: [{ source: [x, y, width, h], y: 0, height, wholeFace: true }] };
    const scale = Math.min(1, height / h), extra = Math.max(0, height - h) / bands.length, pieces = [];
    let sourceY = y, targetY = 0;
    function add(end, housing) {
      const sourceHeight = end - sourceY, targetHeight = sourceHeight * scale + (housing ? extra : 0);
      if (sourceHeight > 0) pieces.push({ source: [x, sourceY, width, sourceHeight], y: targetY, height: targetHeight, housing });
      sourceY = end; targetY += targetHeight;
    }
    for (const [start, end] of bands) { add(start, false); add(end, true); }
    add(y + h, false);
    return { width, height, pieces };
  }
  const number = (value) => String(Math.round(value * 1e6) / 1e6);
  function artwork(component, copies = 1, display = null) {
    const profile = FACES[component.photo], preview = !display;
    if (!profile) return Array.from({ length: copies }, () => `<img src="assets/devices/${component.photo}" alt="" draggable="false" />`).join("");
    const widthMm = display?.widthMm || (component.bodyModules || component.modules) * 18, heightMm = display?.heightMm || HEIGHT;
    const face = slices(component.photo, preview && profile.wholeFace ? profile.box[3] : profile.box[2] * heightMm / (widthMm / copies));
    return Array.from({ length: copies }, () => `<svg class="device-photo-tile" viewBox="0 0 ${face.width} ${number(face.height)}" preserveAspectRatio="${preview ? "xMidYMid meet" : "none"}" aria-hidden="true" focusable="false">${face.pieces.map((piece) => `<svg style="width:${face.width}px;height:${number(piece.height)}px" x="0" y="${number(piece.y)}" width="${face.width}" height="${number(piece.height)}" viewBox="${piece.source.join(" ")}" preserveAspectRatio="none" overflow="hidden"><image href="assets/devices/${component.photo}" width="${profile.sourceWidth || 320}" height="${profile.sourceHeight || 480}"/></svg>`).join("")}</svg>`).join("");
  }
  return { HEIGHT, PHOTOS, FACES, dimensions, scene, slices, artwork };
});

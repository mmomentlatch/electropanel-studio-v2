/* One scale for both axes. Model dimensions never depend on the screen. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PanelViewport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const positive = (value) => Number.isFinite(value) && value > 0;
  function atScale(width, height, scale) {
    if (![width, height, scale].every(positive)) return null;
    return { width: width * scale, height: height * scale, scale };
  }
  function fit(width, height, availableWidth, availableHeight, maxScale = 1) {
    if (![width, height, availableWidth, availableHeight, maxScale].every(positive)) return null;
    return atScale(width, height, Math.min(maxScale, availableWidth / width, availableHeight / height));
  }
  return { fit, atScale };
});

/* Unapplied form edits are separate from the project and scoped to this tab. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PanelFormDrafts = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const KEY = "electropanel.v2.form-drafts.v1", copy = (value) => JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const validValues = (value) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length <= 40 && Object.values(value).every((v) => typeof v === "string" || typeof v === "boolean" || Array.isArray(v) && v.length <= 500 && v.every((id) => typeof id === "string"));
  function create(storage = null) {
    const entries = new Map(); let storageAvailable = Boolean(storage);
    const keyFor = ({ projectId, kind, entityId = "" }) => JSON.stringify([projectId, kind, entityId]);
    try {
      const saved = JSON.parse(storage?.getItem(KEY) || "[]");
      if (Array.isArray(saved) && saved.length <= 1000) saved.forEach((item) => {
        if (item && typeof item.projectId === "string" && ["point", "room", "settings"].includes(item.kind) && typeof item.entityId === "string" && typeof item.revision === "string" && validValues(item.baseline) && validValues(item.changes) && Object.keys(item.changes).length) entries.set(keyFor(item), item);
      });
    } catch { storageAvailable = false; }
    function save() {
      if (!storage) return;
      try { storage.setItem(KEY, JSON.stringify([...entries.values()].filter((item) => Object.keys(item.changes).length))); storageAvailable = true; }
      catch { storageAvailable = false; } // In-memory edits remain available.
    }
    function view(item) {
      return { ...copy(item), key: keyFor(item), values: { ...copy(item.latestBaseline || item.baseline), ...copy(item.changes) }, dirty: Boolean(Object.keys(item.changes).length), stale: item.revision !== (item.latestRevision ?? item.revision) };
    }
    function open(meta, baseline, revision) {
      if (!validValues(baseline)) throw new Error("Некоректні значення форми.");
      const key = keyFor(meta); let item = entries.get(key);
      if (!item || !Object.keys(item.changes).length) item = { ...meta, entityId: meta.entityId || "", baseline: copy(baseline), revision, changes: {} };
      item.latestBaseline = copy(baseline); item.latestRevision = revision; item.label = meta.label;
      entries.set(key, item); return view(item);
    }
    function edit(key, values) {
      const item = entries.get(key); if (!item || !validValues(values)) throw new Error("Спочатку відкрийте коректну форму.");
      const baseline = item.latestBaseline || item.baseline;
      const changes = Object.fromEntries(Object.entries(values).filter(([name, value]) => !equal(value, baseline[name])).map(([name, value]) => [name, copy(value)]));
      if (!Object.keys(item.changes).length) { item.baseline = copy(baseline); item.revision = item.latestRevision; }
      item.changes = changes;
      if (!Object.keys(changes).length) { item.baseline = copy(baseline); item.revision = item.latestRevision; }
      save(); return view(item);
    }
    function rebase(key) {
      const item = entries.get(key); if (!item) return null;
      item.baseline = copy(item.latestBaseline || item.baseline); item.revision = item.latestRevision || item.revision;
      item.changes = Object.fromEntries(Object.entries(item.changes).filter(([name, value]) => !equal(value, item.baseline[name])));
      save(); return view(item);
    }
    function remove(key) { entries.delete(key); save(); }
    function get(key) { const item = entries.get(key); return item ? view(item) : null; }
    function pending(projectId) { return [...entries.values()].filter((item) => item.projectId === projectId && Object.keys(item.changes).length).map(view); }
    return { open, edit, rebase, remove, get, pending, keyFor, get storageAvailable() { return storageAvailable; } };
  }
  return { KEY, create };
});

/* Recoverable browser persistence; loading never discards unreadable records. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PanelProjectStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const KEY = "electropanel.v2.projects.v1", ACTIVE_KEY = "electropanel.v2.active-project.v1", RECOVERY_KEY = "electropanel.v2.recovery-last-key.v1";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function readString(storage, key, fallback = null) { try { return storage?.getItem(key) ?? fallback; } catch { return fallback; } }
  function writeString(storage, key, value) { try { if (!storage) return false; storage.setItem(key, String(value)); return true; } catch { return false; } }
  function load(storage, normalize) {
    const state = { projects: [], trash: [], rejected: [], malformedRaw: null, sourceRaw: null, recoveryKey: `${KEY}.recovery.${Date.now()}`, error: null };
    let raw;
    try { if (!storage) throw new Error("Локальне сховище недоступне"); raw = storage.getItem(KEY); }
    catch (error) { state.error = error.message; return state; }
    state.sourceRaw = raw;
    if (!raw) return state;
    let records;
    try { records = JSON.parse(raw); if (!Array.isArray(records)) throw new Error("Очікувався список проєктів"); }
    catch (error) { state.malformedRaw = raw; state.error = error.message; return state; }
    const ids = new Set();
    records.forEach((record, index) => {
      try {
        const item = normalize(record);
        if (ids.has(item.id)) throw new Error("Повторений ідентифікатор проєкту");
        ids.add(item.id); (item.deletedAt ? state.trash : state.projects).push(item);
      } catch (error) { state.rejected.push({ index, value: record, error: error.message }); }
    });
    return state;
  }
  function save(storage, state, projects, activeId) {
    try {
      if (!storage) throw new Error("Локальне сховище недоступне");
      if (storage.getItem(KEY) !== state.sourceRaw) {
        state.error = "Сховище змінено в іншій вкладці. Експортуйте поточний проєкт у JSON і оновіть сторінку, щоб не перезаписати чужі зміни.";
        return { ok: false, conflict: true, error: state.error };
      }
      const payload = JSON.stringify([...projects, ...state.trash, ...state.rejected.map((record) => record.value)]);
      // Keep the original bytes before replacing malformed JSON. A failed backup
      // aborts the write so quota failures cannot destroy the recovery source.
      if (state.malformedRaw !== null) { storage.setItem(state.recoveryKey, state.malformedRaw); storage.setItem(RECOVERY_KEY, state.recoveryKey); }
      storage.setItem(KEY, payload);
      state.sourceRaw = payload;
      state.malformedRaw = null; state.error = null;
      writeString(storage, ACTIVE_KEY, activeId);
      return { ok: true };
    } catch (error) { state.error = error.message; return { ok: false, error: error.message }; }
  }
  function archive(projects, trash, id, at = new Date().toISOString()) {
    const selected = projects.find((project) => project.id === id);
    if (!selected || projects.length < 2) throw new Error("Залиште хоча б один відкритий проєкт");
    return { projects: projects.filter((project) => project.id !== id).map(clone), trash: [{ ...clone(selected), deletedAt: at }, ...trash.filter((project) => project.id !== id).map(clone)] };
  }
  function restore(projects, trash, id) {
    const selected = trash.find((project) => project.id === id);
    if (!selected) throw new Error("Проєкт відсутній у кошику");
    if (projects.some((project) => project.id === id)) throw new Error("Проєкт із цим ідентифікатором уже відкритий");
    const restored = clone(selected); delete restored.deletedAt;
    return { projects: [restored, ...projects.map(clone)], trash: trash.filter((project) => project.id !== id).map(clone) };
  }
  return { KEY, ACTIVE_KEY, RECOVERY_KEY, readString, writeString, load, save, archive, restore };
});

// ============================================================
// LAVI CRM V2 — Connecteur Google Apps Script
// Deux modes détectés automatiquement :
//   1. HÉBERGÉ SUR APPS SCRIPT : l'app est servie par doGet() →
//      google.script.run est disponible, appels directs sans CORS,
//      identité garantie par la session Google (rien à configurer).
//   2. HÉBERGÉ AILLEURS (local, Drive, GitHub Pages) : appels fetch
//      vers APPS_SCRIPT_URL comme avant.
// ============================================================
const GoogleAPI = (() => {

  function isHostedOnAppsScript() {
    return typeof google !== 'undefined' && google.script && google.script.run;
  }

  // ── Mode 1 : google.script.run ──────────────────────────────
  function _callHosted(payload) {
    return new Promise(resolve => {
      google.script.run
        .withSuccessHandler(res => {
          try { resolve(JSON.parse(res)); }
          catch (e) { resolve({ success: false, error: 'Réponse serveur invalide.' }); }
        })
        .withFailureHandler(err => resolve({ success: false, error: 'Erreur serveur: ' + (err && err.message ? err.message : err) }))
        .api(JSON.stringify(payload));
    });
  }

  // ── Mode 2 : fetch vers la Web App ──────────────────────────
  async function _callRemote(payload) {
    const url = LAVI_CONFIG.APPS_SCRIPT_URL;
    if (!url) {
      console.warn('[GoogleAPI] APPS_SCRIPT_URL non configuré.');
      return { success: false, error: 'Apps Script URL non configurée.' };
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // évite le preflight CORS
        body: JSON.stringify(payload)
      });
      return await response.json();
    } catch (err) {
      console.error('[GoogleAPI] Erreur réseau:', err);
      return { success: false, error: 'Erreur réseau: ' + err.message };
    }
  }

  async function _call(payload) {
    const user = Auth.getUser();
    if (!user) return { success: false, error: 'Non authentifié.' };
    const fullPayload = { ...payload, email: user.email };
    return isHostedOnAppsScript() ? _callHosted(fullPayload) : _callRemote(fullPayload);
  }

  // ── Opérations CRUD ─────────────────────────────────────────
  const read   = (sheet, filters = {}) => _call({ action: 'READ',   sheet, filters });
  const create = (sheet, data)         => _call({ action: 'CREATE', sheet, data });
  const update = (sheet, id, data)     => _call({ action: 'UPDATE', sheet, id, data });
  const remove = (sheet, id)           => _call({ action: 'DELETE', sheet, id });

  // ── Initialisation des feuilles ─────────────────────────────
  const initSheets = () => _call({ action: 'INIT_SHEETS' });

  // ── Statistiques dashboard ───────────────────────────────────
  const getStats = () => _call({ action: 'GET_STATS' });

  // ── Migration schéma (ajout Etape_Pipeline sur Clients) ──────
  const migratePipeline = () => _call({ action: 'MIGRATE_PIPELINE' });

  // ── Plan PDF d'un bien (recherche dans Drive par Code) ───────
  const getPlanUrl = (code) => _call({ action: 'GET_PLAN', code });

  return { read, create, update, remove, initSheets, getStats, migratePipeline, getPlanUrl, isHostedOnAppsScript };
})();

/**
 * ============================================================
 * LAVI — Collecte des contacts du site vitrine → Google Sheet
 * ============================================================
 *
 * OBJECTIF : chaque formulaire envoyé depuis le site (landing/index.html)
 * ajoute une ligne dans un onglet "Leads_Site" de votre Google Sheet.
 *
 * ── INSTALLATION (une seule fois) ───────────────────────────
 * 1. Ouvrez le Google Sheet où vous voulez recevoir les contacts
 *    (vous pouvez réutiliser le classeur du CRM ou en créer un nouveau).
 * 2. Menu  Extensions → Apps Script.
 * 3. Collez CE fichier dans un nouveau script (ou un nouveau fichier .gs).
 * 4. Renseignez SHEET_ID ci-dessous  (= la longue chaîne dans l'URL du Sheet :
 *    https://docs.google.com/spreadsheets/d/‹SHEET_ID›/edit ).
 *    Laissez '' si le script est lié directement au bon classeur.
 * 5. Déployer → Nouveau déploiement → Type : « Application Web »
 *      • Description        : LAVI leads
 *      • Exécuter en tant que : Moi
 *      • Accès               : Tout le monde
 *    → Copiez l'URL qui se termine par /exec
 * 6. Collez cette URL dans landing/index.html →  const LEADS_URL = '…';
 *
 * ► À chaque modification du code : Déployer → Gérer les déploiements →
 *   ✏️ (crayon) → Nouvelle version → Déployer.
 */

const SHEET_ID = '';            // ← ID du Google Sheet (ou '' si script lié au classeur)
const TAB      = 'Leads_Site';  // ← nom de l'onglet créé automatiquement

function doPost(e) {
  try {
    const p  = (e && e.parameter) ? e.parameter : {};
    const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID)
                        : SpreadsheetApp.getActiveSpreadsheet();

    let sh = ss.getSheetByName(TAB);
    if (!sh) {
      sh = ss.insertSheet(TAB);
      sh.appendRow(['Date', 'Nom', 'Prénom', 'Téléphone', 'Email', 'Typologie', 'Message', 'Source']);
      sh.getRange(1, 1, 1, 8).setFontWeight('bold');
      sh.setFrozenRows(1);
    }

    sh.appendRow([
      new Date(),
      p.nom    || '',
      p.prenom || '',
      p.tel    || '',
      p.email  || '',
      p.type   || '',
      p.msg    || '',
      p.source || 'Site LAVI'
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('LAVI — endpoint contacts opérationnel.');
}

// ============================================================
// LAVI CRM V2 — Google Apps Script Backend
// AfriCapital Real Estate SA — Projet LAVI, Casablanca
// ============================================================

const CONFIG = {
  SPREADSHEET_ID: '1Lk8cRsuWWWPORwaJRZGRP--CiKRfRpOpfBR0PEEKf4o',  // À renseigner après création du Google Sheet
  // Client OAuth (doit être identique à GOOGLE_CLIENT_ID dans js/config.js).
  // Sert à vérifier que les jetons reçus ont bien été émis pour CETTE application.
  GOOGLE_CLIENT_ID: '486355888770-7g6gqscc5et7gi9a41qk0ijopc9n7m9t.apps.googleusercontent.com',
  // TEMPORAIRE : affiche la raison exacte d'un rejet de jeton dans le message
  // d'erreur (aud, expiration, HTTP…). À repasser à false une fois le problème
  // identifié — pour ne pas divulguer de détails internes en production.
  AUTH_DEBUG: false,
  SHEETS: {
    BIENS:      'Biens',
    CLIENTS:    'Clients',
    CONTRATS:   'Contrats',
    PAIEMENTS:  'Paiements',
    BROKERS:    'Brokers',
    HISTORIQUE: 'Historique'
  },
  AUTHORIZED_EMAILS: [
	'hichamjawad2013@gmail.com',
    	'h.azir@africapital.ma',
    	'azir.hicham.10@gmail.com',
  ],
  // ── Rôles et affectation ────────────────────────────────────
  // role : 'admin' (tous les droits) ou 'commercial' (droits restreints).
  // name : DOIT correspondre EXACTEMENT au contenu de la colonne "Commercial"
  //        des fiches (Clients, Contrats, Biens). C'est ce nom qui détermine
  //        quelles fiches un commercial voit/modifie ("ses fiches").
  //        ⚠️ Vérifiez l'orthographe telle qu'elle est saisie dans le Sheet.
  USERS: [
    { email: 'hichamjawad2013@gmail.com', role: 'admin',      name: 'Hicham Jawad' },
    { email: 'h.azir@africapital.ma',     role: 'admin',      name: 'H. Azir' },
    { email: 'azir.hicham.10@gmail.com',  role: 'commercial', name: 'commercial01' },
  ],
  // Dossier Google Drive contenant les plans PDF, nommés exactement comme le Code du bien (ex: GH01IMM02A05.pdf)
  PLANS_FOLDER_ID: '1vpb3uJV-F4N2W3JNxnGHgRcGYD-Nro4O',
  // Plans architecte (même convention de nommage "<Code>.pdf").
  // Priorité à ARCHI_FOLDER_ID (ID du dossier Google Drive, comme PLANS_FOLDER_ID) ;
  // si vide, repli sur la recherche du sous-dossier ARCHI_SUBFOLDER_NAME dans PLANS_FOLDER_ID.
  ARCHI_FOLDER_ID: '1ImLIod8cYQ2RQYnFpVHZqIwpkvtKJK9d',
  ARCHI_SUBFOLDER_NAME: 'Plan Archi des appartements',
  // Sous-dossier (dans PLANS_FOLDER_ID) où sont stockées les fiches PDF générées, partagées par lien.
  FICHES_SUBFOLDER_NAME: 'Fiches_Biens'
};

// ============================================================
// POINT D'ENTRÉE HTTP
// ============================================================

// Mode hébergé : si le projet Apps Script contient un fichier Index.html,
// doGet sert l'application complète (frontend + backend sur la même URL).
// Sinon, comportement historique : simple réponse API.
function doGet(e) {
  try {
    const tpl = HtmlService.createTemplateFromFile('Index');
    return tpl.evaluate()
      .setTitle('LAVI CRM V2 — AfriCapital Real Estate')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput('LAVI CRM V2 API — OK');
  }
}

// Inclusion de fichiers HTML (Styles.html, JavaScript.html) dans Index.html
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ── API pour le mode hébergé (google.script.run) ─────────────
// L'email provient EXCLUSIVEMENT de la session Google : impossible à falsifier.
// On ne fait jamais confiance à un email transmis par le client dans ce mode.
function api(payloadJson) {
  try {
    const payload = JSON.parse(payloadJson);
    const email = _sessionEmail();
    if (!email) {
      return JSON.stringify({ success: false, error: 'Session Google introuvable. Reconnectez-vous.' });
    }
    if (!isAuthorized(email)) {
      return JSON.stringify({ success: false, error: 'Accès non autorisé pour : ' + email });
    }
    return JSON.stringify(route(payload, email));
  } catch (err) {
    return JSON.stringify({ success: false, error: err.toString() });
  }
}

// Identité de l'utilisateur connecté (mode hébergé)
function getCurrentUserInfo() {
  const email = _sessionEmail();
  const authorized = isAuthorized(email);
  const namePart = email ? email.split('@')[0].replace(/[._]/g, ' ') : '';
  const name = namePart ? namePart.replace(/\b\w/g, c => c.toUpperCase()) : '';
  const initials = namePart ? namePart.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'U';
  return JSON.stringify({ success: true, email, name, initials, authorized });
}

function _sessionEmail() {
  try {
    return (Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '').trim();
  } catch (e) { return ''; }
}

// ── API pour frontend hébergé ailleurs (GitHub Pages, via fetch) ──
// SÉCURITÉ : l'identité n'est PAS déduite d'un email transmis en clair
// (falsifiable), mais du jeton Google signé (JWT) émis à la connexion, qui
// est vérifié ici (destinataire = notre application, non expiré, email vérifié).
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const check = verifyGoogleToken(payload.token);
    if (!check.email) {
      // La raison précise (aud, expiration, http…) aide à diagnostiquer un
      // rejet côté serveur. Masquée si CONFIG.AUTH_DEBUG est désactivé.
      const msg = CONFIG.AUTH_DEBUG
        ? 'Authentification refusée [' + check.reason + ']. Reconnectez-vous.'
        : 'Authentification invalide ou expirée. Reconnectez-vous.';
      return jsonResponse({ success: false, error: msg, authExpired: true });
    }
    if (!isAuthorized(check.email)) {
      return jsonResponse({ success: false, error: 'Accès non autorisé pour : ' + check.email });
    }
    // On route avec l'email VÉRIFIÉ par Google, jamais celui fourni par le client.
    return jsonResponse(route(payload, check.email));
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// À EXÉCUTER UNE FOIS dans l'éditeur Apps Script (sélectionner cette fonction
// puis ▶ Exécuter) après avoir ajouté verifyGoogleToken. Elle appelle
// UrlFetchApp, ce qui déclenche la fenêtre d'autorisation « accès à un service
// externe » (scope script.external_request) sans laquelle la vérification des
// jetons échoue. Cliquez « Autoriser » : le CRM refonctionne ensuite.
function autoriserAccesReseau() {
  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x',
    { muteHttpExceptions: true });
  Logger.log('Autorisation réseau OK — HTTP ' + resp.getResponseCode());
}

// Vérifie un jeton d'identité Google (JWT) auprès de Google.
// Retourne { email, reason } : email non vide si valide, sinon reason décrit
// laquelle des vérifications a échoué (utile pour diagnostiquer un rejet).
function verifyGoogleToken(idToken) {
  if (!idToken) return { email: null, reason: 'jeton absent' };
  try {
    // Cache : évite de revérifier le même jeton à chaque requête (moins de latence).
    const cache = CacheService.getScriptCache();
    const key = 'tok_' + Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
    const cached = cache.get(key);
    if (cached) return { email: cached, reason: 'ok (cache)' };

    const resp = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) {
      return { email: null, reason: 'tokeninfo HTTP ' + resp.getResponseCode() };
    }
    const info = JSON.parse(resp.getContentText());
    // 1. Le jeton a bien été émis pour NOTRE application (anti-réutilisation).
    if (String(info.aud) !== String(CONFIG.GOOGLE_CLIENT_ID)) {
      return { email: null, reason: 'aud du jeton (' + info.aud + ') ≠ Client ID backend (' + CONFIG.GOOGLE_CLIENT_ID + ')' };
    }
    // 2. Émis par Google.
    if (info.iss && !/(^|\.)accounts\.google\.com$/.test(String(info.iss).replace(/^https?:\/\//, ''))) {
      return { email: null, reason: 'émetteur inattendu : ' + info.iss };
    }
    // 3. Non expiré.
    if (info.exp && (Number(info.exp) * 1000) < Date.now()) {
      return { email: null, reason: 'jeton expiré' };
    }
    // 4. Email présent et vérifié.
    if (!info.email) return { email: null, reason: 'email absent du jeton' };
    if (info.email_verified === false || info.email_verified === 'false') {
      return { email: null, reason: 'email non vérifié par Google' };
    }

    const email = String(info.email).trim();
    // Mémorise jusqu'à l'expiration du jeton (plafonné à 5 min pour rester frais).
    const ttl = Math.max(0, Math.min(300, Math.floor(Number(info.exp) - Date.now() / 1000)));
    if (ttl > 0) cache.put(key, email, ttl);
    return { email: email, reason: 'ok' };
  } catch (err) {
    return { email: null, reason: 'exception : ' + err };
  }
}

// ── Routeur commun (avec application des droits par rôle) ─────
// L'admin n'est jamais restreint. Le commercial est limité côté SERVEUR
// (barrière réelle : le front ne fait que masquer les boutons).
function route(payload, email) {
  const { action, sheet, data, filters, id } = payload;
  const admin = isAdmin(email);
  const me = userName(email); // nom servant au périmètre "ses fiches"

  // Garde-fou global pour les commerciaux sur les actions CRUD.
  if (!admin && ['READ', 'CREATE', 'UPDATE', 'DELETE'].indexOf(action) !== -1) {
    const gate = commercialGate(action, sheet);
    if (!gate.allow) return { success: false, error: gate.error };
  }

  switch (action) {
    case 'READ': {
      const res = readSheet(sheet, filters);
      return (!admin && res.success) ? scopeRecords(res, sheet, me) : res;
    }
    case 'CREATE':
      if (!admin) enforceCommercialWrite(sheet, data, me, true);
      return createRecord(sheet, data, email);
    case 'UPDATE':
      if (!admin) {
        // Clients/Prospects : uniquement SES fiches.
        if (sheet === CONFIG.SHEETS.CLIENTS && !ownsRecord(sheet, id, me)) {
          return { success: false, error: "Cette fiche ne vous est pas affectée — modification refusée." };
        }
        enforceCommercialWrite(sheet, data, me, false);
      }
      return updateRecord(sheet, id, data, email);
    case 'DELETE':
      if (!admin) return { success: false, error: "Suppression réservée à l'administrateur." };
      return deleteRecord(sheet, id, email);
    case 'INIT_SHEETS':      return admin ? initSheets() : { success: false, error: "Action réservée à l'administrateur." };
    case 'GET_STATS':        return getStats(admin ? null : me);
    case 'MIGRATE_PIPELINE': return admin ? migrateAddEtapePipeline() : { success: false, error: "Action réservée à l'administrateur." };
    case 'GET_PLAN':         return getPlanUrl(payload.code);
    case 'GET_ARCHI_PLAN':   return getArchiPlanUrl(payload.code);
    case 'LIST_PLANS':       return listPlans();
    case 'GENERATE_FICHE':   return generateFichePdf(payload.bien);
    default:                 return { success: false, error: 'Action inconnue: ' + action };
  }
}

// ============================================================
// SÉCURITÉ & DROITS PAR RÔLE
// ============================================================

function isAuthorized(email) {
  if (!email) return false;
  const normalized = String(email).trim().toLowerCase();
  return CONFIG.AUTHORIZED_EMAILS.some(e => e.trim().toLowerCase() === normalized);
}

// Retourne la fiche USERS correspondant à l'email (ou null).
function getUserRecord(email) {
  if (!email) return null;
  const n = String(email).trim().toLowerCase();
  return (CONFIG.USERS || []).find(u => String(u.email).trim().toLowerCase() === n) || null;
}
function isAdmin(email)  { const u = getUserRecord(email); return !!u && u.role === 'admin'; }
function userName(email) { const u = getUserRecord(email); return u ? (u.name || '') : ''; }

// Comparaison de noms de commercial tolérante (casse/espaces).
function sameName(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

// Champs financiers qu'un commercial ne peut JAMAIS écrire, par feuille.
const FINANCIAL_FIELDS = {
  Biens:     ['Prix', 'Commission_Pct'],
  Contrats:  ['Prix_Vente', 'Commission_Pct'],
  Paiements: ['Montant', 'Pourcentage'],
};

// Autorise/refuse une action CRUD pour un commercial (avant exécution).
function commercialGate(action, sheet) {
  const S = CONFIG.SHEETS;
  switch (action) {
    case 'READ':
      // Tout est lisible sauf le journal ; les résultats sont ensuite filtrés
      // sur "ses fiches" par scopeRecords().
      if (sheet === S.HISTORIQUE) return { allow: false, error: "Journal réservé à l'administrateur." };
      return { allow: true };
    case 'CREATE':
      // Création : uniquement Clients/Prospects (auto-affectés au créateur).
      if (sheet === S.CLIENTS) return { allow: true };
      return { allow: false, error: "Création réservée à l'administrateur pour ce module." };
    case 'UPDATE':
      // Modification : Clients (ses fiches) et Biens (statut/option, sans le prix).
      if (sheet === S.CLIENTS || sheet === S.BIENS) return { allow: true };
      return { allow: false, error: "Modification réservée à l'administrateur pour ce module." };
    case 'DELETE':
      return { allow: false, error: "Suppression réservée à l'administrateur." };
    default:
      return { allow: false, error: "Action non autorisée." };
  }
}

// Applique les contraintes d'écriture d'un commercial (mutation de `data`) :
// affectation verrouillée + champs financiers retirés.
function enforceCommercialWrite(sheet, data, me, isCreate) {
  if (!data) return;
  const S = CONFIG.SHEETS;
  if (sheet === S.CLIENTS) {
    if (isCreate) data.Commercial = me;   // auto-affectation au créateur
    else delete data.Commercial;          // réaffectation = admin uniquement
  }
  (FINANCIAL_FIELDS[sheet] || []).forEach(f => { delete data[f]; });
}

// Vrai si la fiche `id` de `sheetName` est affectée au commercial `me`.
function ownsRecord(sheetName, id, me) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('ID');
  const comCol = headers.indexOf('Commercial');
  if (idCol === -1 || comCol === -1) return false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) return sameName(data[i][comCol], me);
  }
  return false;
}

// Restreint un résultat READ au périmètre du commercial ("ses fiches").
function scopeRecords(res, sheet, me) {
  const S = CONFIG.SHEETS;
  if (sheet === S.CLIENTS || sheet === S.CONTRATS) {
    res.records = res.records.filter(r => sameName(r.Commercial, me));
  } else if (sheet === S.PAIEMENTS) {
    const refs = myContractRefs(me); // paiements liés à ses contrats
    res.records = res.records.filter(r => refs[String(r.Reference_Contrat)]);
  }
  // Biens (catalogue) et Brokers (annuaire) restent visibles en entier.
  res.count = res.records.length;
  return res;
}

// Ensemble des références de contrats appartenant au commercial `me`.
function myContractRefs(me) {
  const map = {};
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.CONTRATS);
  if (!sheet || sheet.getLastRow() < 2) return map;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const refCol = headers.indexOf('Reference');
  const comCol = headers.indexOf('Commercial');
  if (refCol === -1 || comCol === -1) return map;
  for (let i = 1; i < data.length; i++) {
    if (sameName(data[i][comCol], me)) map[String(data[i][refCol])] = true;
  }
  return map;
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ============================================================
// INITIALISATION DES FEUILLES
// ============================================================

function initSheets() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  const schemas = {
    Biens: [
      'ID', 'Code', 'Immeuble', 'Num_Appt', 'Niveau', 'Type', 'Surface', 'Surface Totale', 'Terrasse', 'Jardin',
      'Vue', 'Prix', 'Statut', 'Commercial', 'Client_CIN', 'Client_Nom',
      'Date_Reservation', 'Date_Expiration', 'Broker', 'Commission_Pct',
      'Description', 'Photos_URLs', 'Plan_PDF_URL', 'Observations', 'Date_Modif'
    ],
    Clients: [
      'ID', 'CIN', 'Nom', 'Prenom', 'Telephone', 'Email', 'Adresse', 'Ville',
      'Nationalite', 'Origine', 'Commercial', 'Statut', 'Etape_Pipeline', 'Budget_Min', 'Budget_Max',
      'Type_Recherche', 'Dernier_Contact', 'Prochaine_Relance', 'Notes', 'Date_Creation'
    ],
    Contrats: [
      'ID', 'Reference', 'Code_Bien', 'Client_CIN', 'Client_Nom', 'Commercial',
      'Broker', 'Commission_Pct', 'Prix_Vente', 'Date_Contrat', 'TF', 'Etat',
      'PDF_URL', 'Notes', 'Date_Creation', 'Date_Modif'
    ],
    Paiements: [
      'ID', 'Reference_Contrat', 'Code_Bien', 'Client_Nom', 'Numero_Echeance',
      'Libelle', 'Montant', 'Pourcentage', 'Date_Prevue', 'Date_Paiement',
      'Mode', 'Reference_Bancaire', 'Etat', 'Notes'
    ],
    Brokers: [
      'ID', 'Nom', 'Prenom', 'Telephone', 'Email', 'Societe',
      'Commission_Defaut_Pct', 'Nb_Ventes', 'CA_Total', 'Commission_Due',
      'Commission_Payee', 'Commission_Restante', 'Notes', 'Date_Creation'
    ],
    Historique: [
      'ID', 'Date', 'Heure', 'Utilisateur', 'Action', 'Module',
      'Objet_ID', 'Description'
    ]
  };

  const results = {};

  for (const [sheetName, headers] of Object.entries(schemas)) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#1B2A38')
        .setFontColor('#C8A96E')
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    results[sheetName] = 'OK';
  }

  return { success: true, sheets: results };
}

// ============================================================
// MIGRATION — Ajout du champ Etape_Pipeline (module Prospects)
// ============================================================
// Idempotent : à exécuter une seule fois après mise à jour du schéma.
// - Ajoute la colonne 'Etape_Pipeline' si elle n'existe pas déjà sur Clients.
// - Initialise une valeur par défaut cohérente avec le champ Statut existant
//   pour ne pas laisser les fiches déjà créées "orphelines" dans le Kanban.
function migrateAddEtapePipeline() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.CLIENTS);
  if (!sheet) return { success: false, error: 'Feuille Clients introuvable.' };

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let etapeCol = headers.indexOf('Etape_Pipeline') + 1; // 1-indexed, 0 si absent

  if (etapeCol === 0) {
    etapeCol = lastCol + 1;
    sheet.getRange(1, etapeCol).setValue('Etape_Pipeline')
      .setBackground('#1B2A38').setFontColor('#C8A96E').setFontWeight('bold');
  }

  const defaultByStatut = {
    'Prospect': 'Nouveau contact',
    'Actif':    'Qualifié',
    'Client':   'Gagné',
    'Inactif':  'Perdu'
  };

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, migrated: 0, columnAdded: etapeCol === lastCol + 1 };

  const statutCol = headers.indexOf('Statut') + 1;
  const range = sheet.getRange(2, etapeCol, lastRow - 1, 1);
  const currentValues = range.getValues();
  const statutValues = statutCol > 0
    ? sheet.getRange(2, statutCol, lastRow - 1, 1).getValues()
    : [];

  let migrated = 0;
  const newValues = currentValues.map((row, i) => {
    if (row[0]) return row; // déjà renseigné, on ne touche pas
    const statut = statutValues[i] ? statutValues[i][0] : '';
    migrated++;
    return [defaultByStatut[statut] || 'Nouveau contact'];
  });

  range.setValues(newValues);
  return { success: true, migrated, columnAdded: etapeCol === lastCol + 1 };
}

// ============================================================
// PLANS — Recherche du PDF correspondant à un bien dans Drive
// ============================================================
// Le dossier Plans_des_appartements est le dossier Drive dont
// H:\Mon Drive\CRM2\Plans_des_appartements est le miroir local (Google Drive
// pour bureau). Apps Script ne peut pas lire le disque local : on passe donc
// par DriveApp avec l'ID du dossier Drive.
// Convention : le fichier s'appelle exactement "<Code du bien>.pdf".
function getPlanUrl(code) {
  if (!code) return { success: false, error: 'Code bien manquant.' };
  if (!CONFIG.PLANS_FOLDER_ID) return { success: false, error: 'Dossier des plans non configuré.' };

  try {
    const folder = DriveApp.getFolderById(CONFIG.PLANS_FOLDER_ID);
    const f = _findPlanFile(folder, code);
    if (f) return _planResult(f);
    return { success: false, error: `Aucun plan trouvé pour "${code}.pdf" (même en ignorant casse et zéros).` };
  } catch (err) {
    return { success: false, error: 'Erreur Drive: ' + err.toString() };
  }
}

// Plan architecte : même convention de nommage, mais dans le sous-dossier
// CONFIG.ARCHI_SUBFOLDER_NAME (recherché par nom dans le dossier des plans, donc
// aucun ID supplémentaire à configurer).
function getArchiPlanUrl(code) {
  if (!code) return { success: false, error: 'Code bien manquant.' };
  try {
    const folder = _archiFolder();
    if (!folder) {
      return { success: false, error: `Dossier des plans architecte introuvable (ni ARCHI_FOLDER_ID, ni sous-dossier "${CONFIG.ARCHI_SUBFOLDER_NAME}").` };
    }
    const f = _findPlanFile(folder, code);
    if (f) return _planResult(f);
    return { success: false, error: `Aucun plan architecte trouvé pour "${code}.pdf".` };
  } catch (err) {
    return { success: false, error: 'Erreur Drive: ' + err.toString() };
  }
}

// Résout le dossier Drive des plans architecte :
//   1. par ID explicite (CONFIG.ARCHI_FOLDER_ID) si renseigné ;
//   2. sinon, sous-dossier ARCHI_SUBFOLDER_NAME du dossier des plans.
// Retourne un Folder ou null.
function _archiFolder() {
  if (CONFIG.ARCHI_FOLDER_ID) {
    try { return DriveApp.getFolderById(CONFIG.ARCHI_FOLDER_ID); }
    catch (e) { /* ID invalide → on tente le repli par nom */ }
  }
  if (!CONFIG.PLANS_FOLDER_ID) return null;
  const root = DriveApp.getFolderById(CONFIG.PLANS_FOLDER_ID);
  const subs = root.getFoldersByName(CONFIG.ARCHI_SUBFOLDER_NAME);
  return subs.hasNext() ? subs.next() : null;
}

// Recherche le PDF "<code>.pdf" dans `folder` : correspondance exacte puis
// tolérante (casse et zéros de remplissage ignorés). Retourne le fichier ou null.
function _findPlanFile(folder, code) {
  const exact = folder.getFilesByName(code + '.pdf');
  if (exact.hasNext()) return exact.next();

  const target = _normalizeCode(code);
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const name = f.getName();
    if (!/\.pdf$/i.test(name)) continue;
    if (_normalizeCode(name.replace(/\.pdf$/i, '')) === target) return f;
  }
  return null;
}

// Liste tous les plans PDF du dossier Drive (module Documents)
function listPlans() {
  if (!CONFIG.PLANS_FOLDER_ID) return { success: false, error: 'Dossier des plans non configuré.' };
  try {
    const folder = DriveApp.getFolderById(CONFIG.PLANS_FOLDER_ID);
    const it = folder.getFiles();
    const files = [];
    while (it.hasNext()) {
      const f = it.next();
      const name = f.getName();
      if (!/\.pdf$/i.test(name)) continue;
      files.push({
        name: name,
        code: name.replace(/\.pdf$/i, ''),
        id: f.getId(),
        url: f.getUrl(),
        previewUrl: 'https://drive.google.com/file/d/' + f.getId() + '/preview'
      });
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    return { success: true, files: files, count: files.length, folderUrl: folder.getUrl() };
  } catch (err) {
    return { success: false, error: 'Erreur Drive: ' + err.toString() };
  }
}

function _planResult(file) {
  return {
    success: true,
    fileId: file.getId(),
    url: file.getUrl(),
    previewUrl: `https://drive.google.com/file/d/${file.getId()}/preview`
  };
}

// Normalise un code : majuscules, caractères spéciaux supprimés,
// zéros de remplissage ignorés (GH01 → GH1, IMM01 → IMM1, A01 → A1)
function _normalizeCode(s) {
  return String(s).toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/([A-Z])0+(\d)/g, '$1$2');
}

// DIAGNOSTIC — À exécuter manuellement dans l'éditeur Apps Script
// (sélectionner "testPlans" puis ▶ Exécuter, résultat dans le journal)
function testPlans() {
  const folder = DriveApp.getFolderById(CONFIG.PLANS_FOLDER_ID);
  Logger.log('Dossier : ' + folder.getName());
  const it = folder.getFiles();
  let n = 0;
  while (it.hasNext() && n < 10) {
    const f = it.next();
    Logger.log('Fichier : [' + f.getName() + ']');
    n++;
  }
  Logger.log('Test GH1IMM01A01 → ' + JSON.stringify(getPlanUrl('GH1IMM01A01')));
  Logger.log('Test ARCHI GH02IMM05A04 → ' + JSON.stringify(getArchiPlanUrl('GH02IMM05A04')));
}

// ============================================================
// FICHE PDF — Génération d'une fiche bien partageable (WhatsApp)
// ============================================================
// Génère un PDF de présentation du bien, l'enregistre dans un sous-dossier Drive
// partagé « toute personne disposant du lien », et renvoie l'URL. Le front ouvre
// ensuite WhatsApp avec un message contenant ce lien.
function generateFichePdf(bien) {
  if (!bien || !bien.ID) return { success: false, error: 'Bien invalide (ID manquant).' };
  try {
    // On relit la fiche depuis le Sheet (données de référence, prix fiable).
    const rec = _getBienById(bien.ID) || bien;
    const code = rec.Code || rec.ID;

    // Liens des plans (commercial + architecte) — inclus dans la fiche.
    const planCom   = getPlanUrl(code);
    const planArchi = getArchiPlanUrl(code);
    const planUrl   = (rec.Plan_PDF_URL || (planCom.success ? planCom.url : '')) || '';
    const archiUrl  = planArchi.success ? planArchi.url : '';

    const html = _ficheHtml(rec, planUrl, archiUrl);
    const blob = Utilities.newBlob(html, 'text/html', 'fiche.html').getAs('application/pdf');
    const fileName = 'Fiche_' + code + '.pdf';
    blob.setName(fileName);

    const folder = _fichesFolder();
    // Remplace une éventuelle fiche précédente (toujours à jour).
    const olds = folder.getFilesByName(fileName);
    while (olds.hasNext()) olds.next().setTrashed(true);

    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      success: true,
      url: file.getUrl(),
      fileId: file.getId(),
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
      planUrl: planUrl,
      archiUrl: archiUrl
    };
  } catch (err) {
    return { success: false, error: 'Erreur génération fiche: ' + err.toString() };
  }
}

// Sous-dossier des fiches (créé au besoin dans le dossier des plans).
function _fichesFolder() {
  const root = DriveApp.getFolderById(CONFIG.PLANS_FOLDER_ID);
  const it = root.getFoldersByName(CONFIG.FICHES_SUBFOLDER_NAME);
  return it.hasNext() ? it.next() : root.createFolder(CONFIG.FICHES_SUBFOLDER_NAME);
}

// Relit un bien par ID depuis la feuille Biens.
function _getBienById(id) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEETS.BIENS);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('ID');
  if (idCol === -1) return null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      const o = {};
      headers.forEach((h, j) => o[h] = data[i][j]);
      return o;
    }
  }
  return null;
}

// Surface totale tolérante aux variantes d'en-tête.
function _surfaceTotaleServer(b) {
  const cands = ['Surface Totale','Surface totale','Surface_Totale','Surface_totale','SurfaceTotale','Surface Total','Surface_Total'];
  for (const c of cands) {
    if (b[c] !== undefined && b[c] !== null && b[c] !== '') return b[c];
  }
  return '';
}

// Formatage prix : "1 850 000 DH".
function _fmtPrice(v) {
  const n = Number(v);
  if (!n && n !== 0) return '—';
  if (!n) return '—';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' DH';
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Gabarit HTML de la fiche (converti en PDF). Charte LAVI : navy #1B2A38 / or #C8A96E.
function _ficheHtml(b, planUrl, archiUrl) {
  const surfTot = _surfaceTotaleServer(b);
  const row = (label, val) => val ? `<tr><td class="l">${_esc(label)}</td><td class="v">${_esc(val)}</td></tr>` : '';
  const dateStr = Utilities.formatDate(new Date(), 'Africa/Casablanca', 'dd/MM/yyyy');

  const links = [];
  if (planUrl)  links.push(`<div class="lk"><span>Plan commercial :</span> <a href="${_esc(planUrl)}">${_esc(planUrl)}</a></div>`);
  if (archiUrl) links.push(`<div class="lk"><span>Plan architecte :</span> <a href="${_esc(archiUrl)}">${_esc(archiUrl)}</a></div>`);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { font-family: Helvetica, Arial, sans-serif; color: #2A2A2A; margin: 0; padding: 32px 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #C8A96E; padding-bottom: 14px; margin-bottom: 22px; }
    .brand { font-size: 22px; font-weight: 800; color: #1B2A38; letter-spacing: .5px; }
    .brand small { display:block; font-size: 11px; font-weight: 600; color: #C8A96E; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 3px; }
    .meta { text-align: right; font-size: 11px; color: #7A7A7A; }
    .banner { background: #1B2A38; border-radius: 8px; padding: 18px 22px; color: #fff; display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; }
    .banner .appt-lbl { font-size: 10px; color: rgba(200,169,110,.7); letter-spacing: 1px; text-transform: uppercase; }
    .banner .appt { font-size: 30px; font-weight: 900; color: #C8A96E; }
    .banner .sub { font-size: 12px; color: rgba(255,255,255,.75); margin-top: 4px; }
    .banner .code { font-size: 13px; font-weight: 700; }
    .banner .statut { display:inline-block; margin-top:6px; font-size:11px; font-weight:700; background:#C8A96E; color:#1B2A38; padding:3px 10px; border-radius:20px; }
    h2 { font-size: 13px; color: #1B2A38; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #E5DFD3; padding-bottom: 6px; margin: 22px 0 10px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 6px 0; font-size: 13px; vertical-align: top; }
    td.l { color: #7A7A7A; width: 45%; }
    td.v { color: #1B2A38; font-weight: 600; }
    .price { font-size: 22px; font-weight: 900; color: #1B2A38; }
    .lk { font-size: 11px; margin: 5px 0; word-break: break-all; }
    .lk span { color: #7A7A7A; }
    .lk a { color: #1B2A38; }
    .footer { margin-top: 34px; border-top: 1px solid #E5DFD3; padding-top: 12px; font-size: 10.5px; color: #9A9A9A; text-align: center; }
  </style></head><body>
    <div class="header">
      <div class="brand">LAVI<small>Domaine d'Anfa · Casablanca</small></div>
      <div class="meta">Réf. ${_esc(b.Code || b.ID)}<br>Édité le ${dateStr}</div>
    </div>

    <div class="banner">
      <div>
        <div class="appt-lbl">Appartement</div>
        <div class="appt">${_esc(b.Num_Appt || '—')}</div>
        <div class="sub">${_esc(b.Immeuble || '')} · ${_esc(b.Niveau || '')} · ${_esc(b.Type || '')}</div>
      </div>
      <div style="text-align:right;">
        <div class="appt-lbl">Code</div>
        <div class="code">${_esc(b.Code || '—')}</div>
        ${b.Statut ? `<div class="statut">${_esc(b.Statut)}</div>` : ''}
      </div>
    </div>

    <h2>Caractéristiques</h2>
    <table>
      ${row('Immeuble', b.Immeuble)}
      ${row('N° Appartement', b.Num_Appt)}
      ${row('Niveau', b.Niveau)}
      ${row('Type', b.Type)}
      ${row('Surface', b.Surface ? b.Surface + ' m²' : '')}
      ${row('Surface totale', surfTot ? surfTot + ' m²' : '')}
      ${row('Terrasse', b.Terrasse ? b.Terrasse + ' m²' : '')}
      ${row('Jardin', b.Jardin ? b.Jardin + ' m²' : '')}
      ${row('Vue', b.Vue)}
    </table>

    <h2>Prix</h2>
    <div class="price">${_fmtPrice(b.Prix)}</div>

    ${links.length ? `<h2>Plans</h2>${links.join('')}` : ''}

    ${b.Observations ? `<h2>Observations</h2><div style="font-size:12.5px; line-height:1.6;">${_esc(b.Observations)}</div>` : ''}

    <div class="footer">AfriCapital Real Estate SA — Programme LAVI, Domaine d'Anfa, Casablanca<br>Document non contractuel · Généré automatiquement par LAVI CRM</div>
  </body></html>`;
}

// ============================================================
// CRUD GÉNÉRIQUE
// ============================================================

function readSheet(sheetName, filters) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, error: 'Feuille introuvable: ' + sheetName };

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { success: true, records: [] };

  const headers = data[0];
  let records = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  }).filter(r => r.ID !== '');

  // Filtrage optionnel
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        records = records.filter(r => String(r[key]).toLowerCase().includes(String(value).toLowerCase()));
      }
    }
  }

  return { success: true, records, count: records.length };
}

// Garantit qu'une colonne existe pour chaque champ de `keys`. Ajoute à la fin
// (en-tête stylée) les colonnes manquantes et renvoie la liste d'en-têtes à jour.
// Évite qu'une écriture sur un champ récent (ex. Etape_Pipeline) soit ignorée
// en silence parce que la colonne n'existe pas encore dans la feuille.
function ensureColumns(sheet, keys) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const missing = keys.filter(k => k && headers.indexOf(k) === -1);
  if (missing.length) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing])
      .setBackground('#1B2A38').setFontColor('#C8A96E').setFontWeight('bold');
  }
  return headers.concat(missing);
}

function createRecord(sheetName, data, email) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, error: 'Feuille introuvable.' };

  const id = generateId(sheetName);
  data.ID = id;
  data.Date_Creation = data.Date_Creation || formatDate(new Date());
  data.Date_Modif = formatDate(new Date());

  const headers = ensureColumns(sheet, Object.keys(data));
  const row = headers.map(h => data[h] !== undefined ? data[h] : '');
  sheet.appendRow(row);

  logAction(email, 'CRÉATION', sheetName, id, `Nouvel enregistrement: ${JSON.stringify(data).substring(0, 100)}`);
  return { success: true, id };
}

function updateRecord(sheetName, id, data, email) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, error: 'Feuille introuvable.' };

  ensureColumns(sheet, Object.keys(data)); // crée les colonnes manquantes avant écriture
  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idCol = headers.indexOf('ID');

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][idCol] === id) {
      data.Date_Modif = formatDate(new Date());
      headers.forEach((h, colIdx) => {
        if (data[h] !== undefined) {
          sheet.getRange(i + 1, colIdx + 1).setValue(data[h]);
        }
      });
      logAction(email, 'MODIFICATION', sheetName, id, `Champs modifiés: ${Object.keys(data).join(', ')}`);
      return { success: true };
    }
  }
  return { success: false, error: 'Enregistrement introuvable.' };
}

function deleteRecord(sheetName, id, email) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, error: 'Feuille introuvable.' };

  const allData = sheet.getDataRange().getValues();
  const headers = allData[0];
  const idCol = headers.indexOf('ID');

  for (let i = 1; i < allData.length; i++) {
    if (allData[i][idCol] === id) {
      sheet.deleteRow(i + 1);
      logAction(email, 'SUPPRESSION', sheetName, id, `Enregistrement supprimé`);
      return { success: true };
    }
  }
  return { success: false, error: 'Enregistrement introuvable.' };
}

// ============================================================
// STATISTIQUES DASHBOARD
// ============================================================

// scopeName : si fourni (commercial), les chiffres sont limités à ses fiches ;
// null/absent pour l'admin (vue globale).
function getStats(scopeName) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  function sheetToRecords(name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return [];
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    return data.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    }).filter(r => r.ID !== '');
  }

  let biens      = sheetToRecords('Biens');
  let clients    = sheetToRecords('Clients');
  let contrats   = sheetToRecords('Contrats');
  let paiements  = sheetToRecords('Paiements');
  let historique = sheetToRecords('Historique');

  // Périmètre commercial : ne garder que ses fiches (biens gérés, ses clients,
  // ses contrats, et les paiements liés à ses contrats).
  if (scopeName) {
    biens    = biens.filter(b => sameName(b.Commercial, scopeName));
    clients  = clients.filter(c => sameName(c.Commercial, scopeName));
    contrats = contrats.filter(c => sameName(c.Commercial, scopeName));
    const refs = {};
    contrats.forEach(c => { refs[String(c.Reference)] = true; });
    paiements = paiements.filter(p => refs[String(p.Reference_Contrat)]);
    historique = [];
  }

  const now  = new Date();
  const in30 = new Date(); in30.setDate(now.getDate() + 30);

  // ── Biens : répartition par statut et par immeuble ──────────
  const parImmeuble = {};
  biens.forEach(b => {
    const im = b.Immeuble || '—';
    if (!parImmeuble[im]) parImmeuble[im] = { total: 0, disponible: 0, option: 0, reserve: 0, vendu: 0 };
    parImmeuble[im].total++;
    if (b.Statut === 'Disponible') parImmeuble[im].disponible++;
    else if (b.Statut === 'Option')  parImmeuble[im].option++;
    else if (b.Statut === 'Réservé') parImmeuble[im].reserve++;
    else if (b.Statut === 'Vendu')   parImmeuble[im].vendu++;
  });

  // ── Pipeline prospects ───────────────────────────────────────
  const pipeline = {};
  clients.forEach(c => {
    const etape = c.Etape_Pipeline || 'Nouveau contact';
    pipeline[etape] = (pipeline[etape] || 0) + 1;
  });

  // ── Ventes par mois (12 derniers mois, contrats signés) ─────
  const MOIS_FR = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  const ventesMois = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    ventesMois.push({
      key: d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2),
      label: MOIS_FR[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2),
      montant: 0, count: 0
    });
  }
  contrats.filter(c => c.Etat === 'Signé').forEach(c => {
    const d = parseAnyDate(c.Date_Contrat) || parseAnyDate(c.Date_Creation);
    if (!d) return;
    const key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
    const slot = ventesMois.find(m => m.key === key);
    if (slot) { slot.montant += Number(c.Prix_Vente) || 0; slot.count++; }
  });

  // ── Paiements ────────────────────────────────────────────────
  const retards = paiements.filter(p => p.Etat === 'En retard');
  const aVenir = paiements.filter(p => {
    if (p.Etat !== 'En attente') return false;
    const d = parseAnyDate(p.Date_Prevue);
    return d && d >= now && d <= in30;
  });
  const fmtEcheance = p => ({
    contrat: p.Reference_Contrat || '—',
    bien: p.Code_Bien || '—',
    client: p.Client_Nom || '—',
    libelle: p.Libelle || ('Échéance ' + (p.Numero_Echeance || '')),
    montant: Number(p.Montant) || 0,
    date: (() => { const d = parseAnyDate(p.Date_Prevue); return d ? Utilities.formatDate(d, 'Africa/Casablanca', 'dd/MM/yyyy') : '—'; })()
  });
  const byDate = (a, b) => {
    const da = parseAnyDate(a.Date_Prevue), db = parseAnyDate(b.Date_Prevue);
    return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
  };

  // ── Dernières activités ──────────────────────────────────────
  const activites = historique.slice(-8).reverse().map(h => ({
    date: h.Date || '', heure: h.Heure || '',
    utilisateur: h.Utilisateur || '', action: h.Action || '',
    module: h.Module || '', description: h.Description || ''
  }));

  const contratsSignes = contrats.filter(c => c.Etat === 'Signé');

  const stats = {
    biens: {
      total:      biens.length,
      disponible: biens.filter(b => b.Statut === 'Disponible').length,
      reserve:    biens.filter(b => b.Statut === 'Réservé').length,
      vendu:      biens.filter(b => b.Statut === 'Vendu').length,
      option:     biens.filter(b => b.Statut === 'Option').length,
      valeur_disponible: biens.filter(b => b.Statut === 'Disponible').reduce((s, b) => s + (Number(b.Prix) || 0), 0),
      par_immeuble: parImmeuble,
    },
    clients: {
      total: clients.length,
      pipeline: pipeline,
    },
    ca: {
      total: contratsSignes.reduce((s, c) => s + (Number(c.Prix_Vente) || 0), 0),
      contrats_signes: contratsSignes.length,
      contrats_en_cours: contrats.filter(c => c.Etat === 'En cours').length,
    },
    paiements: {
      encaisse: paiements.filter(p => p.Etat === 'Payé').reduce((s, p) => s + (Number(p.Montant) || 0), 0),
      attendu:  paiements.filter(p => p.Etat === 'En attente').reduce((s, p) => s + (Number(p.Montant) || 0), 0),
      en_retard: retards.length,
      retard_montant: retards.reduce((s, p) => s + (Number(p.Montant) || 0), 0),
      a_venir_30j: aVenir.length,
      liste_retards: retards.sort(byDate).slice(0, 5).map(fmtEcheance),
      liste_a_venir: aVenir.sort(byDate).slice(0, 5).map(fmtEcheance),
    },
    ventes_mois: ventesMois,
    activites: activites,
  };

  return { success: true, stats };
}

// Parse robuste : objets Date, "dd/MM/yyyy [HH:mm]" ou ISO
function parseAnyDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// ============================================================
// UTILITAIRES
// ============================================================

function generateId(prefix) {
  return prefix.substring(0, 3).toUpperCase() + '_' + Date.now();
}

function formatDate(d) {
  return Utilities.formatDate(d, 'Africa/Casablanca', 'dd/MM/yyyy HH:mm');
}

function logAction(user, action, module, objetId, description) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Historique');
    if (!sheet) return;
    const now = new Date();
    sheet.appendRow([
      generateId('HIS'),
      Utilities.formatDate(now, 'Africa/Casablanca', 'dd/MM/yyyy'),
      Utilities.formatDate(now, 'Africa/Casablanca', 'HH:mm'),
      user, action, module, objetId, description
    ]);
  } catch(e) {}
}

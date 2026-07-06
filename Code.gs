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
  AUTH_DEBUG: true,
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
  // Dossier Google Drive contenant les plans PDF, nommés exactement comme le Code du bien (ex: GH01IMM02A05.pdf)
  PLANS_FOLDER_ID: '1vpb3uJV-F4N2W3JNxnGHgRcGYD-Nro4O'
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

// ── Routeur commun ────────────────────────────────────────────
function route(payload, email) {
  const { action, sheet, data, filters, id } = payload;
  switch (action) {
    case 'READ':             return readSheet(sheet, filters);
    case 'CREATE':           return createRecord(sheet, data, email);
    case 'UPDATE':           return updateRecord(sheet, id, data, email);
    case 'DELETE':           return deleteRecord(sheet, id, email);
    case 'INIT_SHEETS':      return initSheets();
    case 'GET_STATS':        return getStats();
    case 'MIGRATE_PIPELINE': return migrateAddEtapePipeline();
    case 'GET_PLAN':         return getPlanUrl(payload.code);
    case 'LIST_PLANS':       return listPlans();
    default:                 return { success: false, error: 'Action inconnue: ' + action };
  }
}

// ============================================================
// SÉCURITÉ
// ============================================================

function isAuthorized(email) {
  if (!email) return false;
  const normalized = String(email).trim().toLowerCase();
  return CONFIG.AUTHORIZED_EMAILS.some(e => e.trim().toLowerCase() === normalized);
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

    // 1. Correspondance exacte
    const files = folder.getFilesByName(code + '.pdf');
    if (files.hasNext()) return _planResult(files.next());

    // 2. Correspondance tolérante : casse et zéros ignorés
    //    (GH1IMM01A01 ≈ gh01imm1a1.pdf ≈ GH01IMM01A01.PDF)
    const target = _normalizeCode(code);
    const it = folder.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      const name = f.getName();
      if (!/\.pdf$/i.test(name)) continue;
      if (_normalizeCode(name.replace(/\.pdf$/i, '')) === target) return _planResult(f);
    }

    return { success: false, error: `Aucun plan trouvé pour "${code}.pdf" (même en ignorant casse et zéros).` };
  } catch (err) {
    return { success: false, error: 'Erreur Drive: ' + err.toString() };
  }
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

function getStats() {
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

  const biens      = sheetToRecords('Biens');
  const clients    = sheetToRecords('Clients');
  const contrats   = sheetToRecords('Contrats');
  const paiements  = sheetToRecords('Paiements');
  const historique = sheetToRecords('Historique');

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

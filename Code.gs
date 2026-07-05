// ============================================================
// LAVI CRM V2 — Google Apps Script Backend
// AfriCapital Real Estate SA — Projet LAVI, Casablanca
// ============================================================

const CONFIG = {
  SPREADSHEET_ID: '1Lk8cRsuWWWPORwaJRZGRP--CiKRfRpOpfBR0PEEKf4o',  // À renseigner après création du Google Sheet
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
// L'email est fourni par la session Google : impossible à falsifier.
function api(payloadJson) {
  try {
    const payload = JSON.parse(payloadJson);
    const email = _sessionEmail() || payload.email || '';
    if (!isAuthorized(email)) {
      return JSON.stringify({ success: false, error: 'Accès non autorisé pour : ' + (email || '(email inconnu)') });
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

// ── API historique (frontend hébergé ailleurs, via fetch) ────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (!isAuthorized(payload.email)) {
      return jsonResponse({ success: false, error: 'Accès non autorisé.' });
    }
    return jsonResponse(route(payload, payload.email));
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
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
      'ID', 'Code', 'Immeuble', 'Num_Appt', 'Niveau', 'Type', 'Surface', 'Terrasse', 'Jardin',
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
// Le dossier LAVI_Plans est le dossier Drive dont H:\Mon Drive\CRM\LAVI_Plans
// est le miroir local (Google Drive pour bureau). Apps Script ne peut pas lire
// le disque local : on passe donc par DriveApp avec l'ID du dossier Drive.
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

function createRecord(sheetName, data, email) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, error: 'Feuille introuvable.' };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const id = generateId(sheetName);
  data.ID = id;
  data.Date_Creation = data.Date_Creation || formatDate(new Date());
  data.Date_Modif = formatDate(new Date());

  const row = headers.map(h => data[h] !== undefined ? data[h] : '');
  sheet.appendRow(row);

  logAction(email, 'CRÉATION', sheetName, id, `Nouvel enregistrement: ${JSON.stringify(data).substring(0, 100)}`);
  return { success: true, id };
}

function updateRecord(sheetName, id, data, email) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, error: 'Feuille introuvable.' };

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

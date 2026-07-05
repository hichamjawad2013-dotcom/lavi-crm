// ============================================================
// LAVI CRM V2 — Configuration centrale
// ============================================================

const LAVI_CONFIG = {
  // ── À renseigner après déploiement Apps Script ──────────────
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxh0P94-YKVIxSMbme1IUq7i5E5ZlfXFV4nIOdDlqjtmAEM2ER-XogRx3GOZfbSDGywww/exec',   // Ex: https://script.google.com/macros/s/XXXXX/exec

  // ── Google OAuth ────────────────────────────────────────────
  GOOGLE_CLIENT_ID: '486355888770-7g6gqscc5et7gi9a41qk0ijopc9n7m9t.apps.googleusercontent.com',  // À renseigner depuis Google Cloud Console

  // ── Emails autorisés ────────────────────────────────────────
  AUTHORIZED_EMAILS: [
    // Ajouter les emails ici — ils doivent correspondre à Code.gs
	'hichamjawad2013@gmail.com',
    	'h.azir@africapital.ma',
    	'azir.hicham.10@gmail.com',
  ],

  // ── Structure Google Sheets (feuilles attendues) ─────────────
  SHEETS: {
    BIENS:      'Biens',
    CLIENTS:    'Clients',
    CONTRATS:   'Contrats',
    PAIEMENTS:  'Paiements',
    BROKERS:    'Brokers',
    HISTORIQUE: 'Historique'
  },

  // ── Valeurs métier ────────────────────────────────────────────
  IMMEUBLES: ['IMM01','IMM02','IMM03','IMM04','IMM05','IMM06','IMM07'],
  TYPES_BIENS: ['Studio','T2','T3','T4','T5','Duplex','Penthouse','Local Commercial'],
  STATUTS_BIENS: ['Disponible','Option','Réservé','Vendu'],
  STATUTS_CONTRATS: ['Brouillon','En cours','Signé','Annulé'],
  STATUTS_PAIEMENTS: ['En attente','Payé','En retard','Annulé'],
  MODES_PAIEMENT: ['Virement','Chèque','Espèces','Traite'],
  ORIGINES_CLIENTS: ['Site web','Recommandation','Réseau','Foire','Appel entrant','Broker','Autre'],
  STATUTS_CLIENTS: ['Prospect','Actif','Client','Inactif'],

  // ── Pipeline commercial (module Prospects — vue Kanban) ─────
  // Champ dédié Etape_Pipeline sur la feuille Clients, indépendant de Statut.
  ETAPES_PIPELINE: ['Nouveau contact','Qualifié','Visite programmée','Offre / Négociation','Gagné','Perdu'],
};

// Exporter pour les modules JS
if (typeof module !== 'undefined') module.exports = LAVI_CONFIG;

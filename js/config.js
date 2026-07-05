// ============================================================
// LAVI CRM V2 — Configuration centrale
// ============================================================

const LAVI_CONFIG = {
  // ── À renseigner après déploiement Apps Script ──────────────
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxfmel2CA4LT8Ub3mV7C4FXX8I7KdKwAX--MOqtnR602EkXx9ZF_rEejDLt0fEEFMPT7A/exec',   // Déploiement v2.1

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

  // ── Contrat de réservation (données légales du promoteur) ────
  // Servent à pré-remplir le contrat de réservation généré depuis le module Contrats.
  // Tous ces champs restent modifiables dans le formulaire avant génération.
  RESERVATION: {
    RESERVANT_SOCIETE:     'AFRICASHORELINE SARL',
    RESERVANT_GERANT:      'Monsieur BOUABID YOUSSEF',
    RESERVANT_QUALITE:     'Gérant',
    RESERVANT_STATUTS_DATE:'02/12/2024',
    RESERVANT_ADRESSE:     'Capital Tower, angle Main Street et Bd Moulay Abdellah Bencherif, Étage n°17 (CFC), Casablanca',
    PROJET_NOM:            'LAVI - P17 - DOMAINE D\'ANFA',
    PROPRIETE_DITE:        'Domaine d\'Anfa I Lot P-17',
    TERRAIN_SUPERFICIE:    '11494',
    TF_MERE:               '123149/01',
    AUTORISATION:          'GUCAS-0900/2025',
    AUTORISATION_DATE:     '10/09/2025',
    ACHEVEMENT_DATE:       '30/12/2027',
    PRIX_M2_REAJUST:       '30.000',
    INDEMNITE_PCT:         10,
    NB_PARKING_DEFAUT:     2,
    RC:  '656449',
    TP:  '36008411',
    IF:  '66185752',
    ICE: '003632856000064',
    // Échéancier de réservation par défaut — les 3 taux sont modifiables
    ECHEANCIER_DEFAUT: {
      acompte_pct:    15,
      echeance1_pct:  10, echeance1_mois: 6,
      echeance2_pct:  15, echeance2_mois: 12,
    },
  },
};

// Exporter pour les modules JS
if (typeof module !== 'undefined') module.exports = LAVI_CONFIG;

# LAVI CRM V2 — Guide de déploiement
*AfriCapital Real Estate SA — Projet LAVI, Casablanca*

---

## Structure des fichiers

```
LAVI_CRM_V2/
├── index.html              ← Point d'entrée (mode hébergement externe)
├── Code.gs                 ← Google Apps Script (backend + hébergement)
├── Build_AppsScript.bat    ← Génère le paquet de déploiement Apps Script
│
├── css/
│   └── style.css           ← Styles complets (LAVI brand system)
│
├── js/
│   ├── config.js           ← Configuration centrale (URLs, emails, listes)
│   ├── auth.js             ← Authentification (Google natif ou OAuth)
│   ├── ui.js               ← Utilitaires UI (toasts, modales, badges…)
│   ├── google.js           ← Connecteur Apps Script (double mode)
│   ├── biens.js            ← Module Biens
│   ├── clients.js          ← Module Clients
│   ├── prospects.js        ← Module Prospects (Kanban)
│   ├── contrats.js         ← Module Contrats (CRUD, PDF, échéancier)
│   ├── dashboard.js        ← Module Dashboard (KPIs & graphiques)
│   └── app.js              ← Orchestrateur principal
│
├── tools/
│   └── build_apps_script.ps1  ← Script de build (PowerShell)
│
└── apps_script/            ← Généré par Build_AppsScript.bat
    ├── Code.gs             ← À coller dans l'éditeur Apps Script
    ├── Index.html          ← idem
    ├── Styles.html         ← idem
    └── JavaScript.html     ← idem
```

---

# 🚀 Déploiement retenu : GitHub Pages

**Le frontend est hébergé sur GitHub Pages (URL web unique), le backend reste le Google Apps Script existant.** Chaque commercial ouvre l'URL depuis son PC et se connecte avec son compte Google.

## Étape 1 — Créer le dépôt GitHub (une seule fois)

1. Créer un compte sur https://github.com (si besoin)
2. Créer un nouveau dépôt **public** nommé `lavi-crm`
   *(GitHub Pages sur dépôt privé nécessite un compte payant)*
3. Dans le dossier du projet, ouvrir une invite de commandes et exécuter :
   ```
   git remote add origin https://github.com/VOTRE_COMPTE/lavi-crm.git
   git add -A
   git commit -m "LAVI CRM V2"
   git branch -M main
   git push -u origin main
   ```
4. Sur GitHub : **Settings → Pages → Branch : `main` / dossier `/ (root)` → Save**
5. Après ~1 minute, le CRM est en ligne :
   **`https://VOTRE_COMPTE.github.io/lavi-crm/`**

> **Mises à jour suivantes** : double-cliquer sur **`Publier_GitHub.bat`** — le site se met à jour tout seul.

## Étape 2 — Configurer la connexion Google (OAuth, une seule fois)

1. https://console.cloud.google.com → **APIs & Services → Identifiants**
2. Ouvrir le **Client OAuth 2.0** existant (celui de `js/config.js`) ou en créer un (type : Application Web)
3. Dans **Origines JavaScript autorisées**, ajouter :
   - `https://VOTRE_COMPTE.github.io`
4. Enregistrer (prise en effet en ~5 minutes)
5. Vérifier que le Client ID est bien dans `js/config.js` → `GOOGLE_CLIENT_ID`

## Étape 3 — Vérifier le déploiement Apps Script (backend)

1. Google Sheet → **Extensions → Apps Script** : le contenu de `Code.gs` doit être à jour
   (recopier le `Code.gs` du projet après chaque modification, puis **Déployer → Gérer les déploiements → ✏️ → Nouvelle version**)
2. Paramètres du déploiement Web App :
   - Exécuter en tant que : **Moi**
   - Accès : **Tout le monde**
3. L'URL `/exec` doit correspondre à `APPS_SCRIPT_URL` dans `js/config.js`

## Étape 4 — Donner accès aux commerciaux

Pour chaque commercial (compte Google requis) :

1. Ajouter son email dans **`AUTHORIZED_EMAILS`** à **deux endroits** :
   - `js/config.js` (contrôle côté interface) → puis `Publier_GitHub.bat`
   - `Code.gs` dans Apps Script (contrôle côté serveur) → puis nouvelle version du déploiement
2. Lui envoyer l'URL : `https://VOTRE_COMPTE.github.io/lavi-crm/`
3. Il clique sur **Se connecter avec Google** → le Dashboard s'ouvre

> Le Google Sheet n'a **pas** besoin d'être partagé avec les commerciaux : le script s'exécute avec votre compte. Seul un email présent dans `AUTHORIZED_EMAILS` peut lire ou modifier les données.

---

## Alternative — Hébergement 100% Apps Script

Le CRM peut aussi être servi entièrement par Apps Script (une seule URL Google, sans GitHub ni OAuth) : générer le paquet avec **`Build_AppsScript.bat`**, coller les 4 fichiers de `apps_script/` dans l'éditeur Apps Script, et déployer en « Exécuter en tant que : Utilisateur accédant / Accès : Tout utilisateur Google ». Dans ce mode, le Sheet doit être partagé avec chaque commercial.

---

## Modules disponibles

| Module     | Statut       | Description                                  |
|------------|--------------|----------------------------------------------|
| Dashboard  | ✅ Complet    | KPIs, répartition des biens, stock par immeuble, pipeline, ventes par mois, retards |
| Biens      | ✅ Complet    | Liste, grille, fiche, CRUD complet            |
| Clients    | ✅ Complet    | CRM clients complet                           |
| Prospects  | ✅ Complet    | Pipeline Kanban                               |
| Contrats   | ✅ Complet    | CRUD, impression/PDF, échéancier auto, WhatsApp |
| Paiements  | 🔜 V2.2      | Échéancier dynamique (lignes générées depuis Contrats) |
| Brokers    | 🔜 V2.3      | Commissions                                   |
| Agenda     | 🔜 V2.3      | Intégration Google Calendar                   |
| Documents  | 🔜 V2.3      | Google Drive intégré                          |

---

## Structure Google Sheets (initialisée automatiquement)

Les 6 feuilles suivantes sont créées par le bouton **Init. Sheets** (module Biens) :

| Feuille    | Colonnes clés                                                 |
|------------|--------------------------------------------------------------|
| Biens      | ID, Code, Immeuble, Niveau, Type, Surface, Prix, Statut…    |
| Clients    | ID, CIN, Nom, Prénom, Téléphone, Email, Statut, Budget…     |
| Contrats   | ID, Référence, Code_Bien, Client_CIN, Prix_Vente, Etat…     |
| Paiements  | ID, Référence_Contrat, Montant, Date_Prevue, Etat…          |
| Brokers    | ID, Nom, Commission_Defaut_Pct, CA_Total, Commission_Due…   |
| Historique | ID, Date, Utilisateur, Action, Module, Description          |

---

*LAVI CRM V2 — AfriCapital Real Estate SA*

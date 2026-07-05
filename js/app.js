// ============================================================
// LAVI CRM V2 — Orchestrateur principal
// ============================================================

const App = (() => {

  const MODULES = {
    biens:      { label: 'Biens',       icon: 'bldg', render: (arg) => ModuleBiens.render(arg) },
    dashboard:  { label: 'Dashboard',   icon: 'dash', render: () => ModuleDashboard.render() },
    // Modules à venir
    clients:    { label: 'Clients',     icon: 'user', render: (arg) => ModuleClients.render(arg) },
    prospects:  { label: 'Prospects',   icon: 'pipe', render: (arg) => ModuleProspects.render(arg) },
    contrats:   { label: 'Contrats',    icon: 'doc',  render: () => ModuleContrats.render() },
    paiements:  { label: 'Paiements',   icon: 'cash', render: () => _placeholder('Paiements', 'Échéancier dynamique — Version 2.2') },
    brokers:    { label: 'Brokers',     icon: 'brok', render: () => _placeholder('Brokers', 'Gestion des commissions — Version 2.3') },
    agenda:     { label: 'Agenda',      icon: 'cal',  render: () => _placeholder('Agenda', 'Agenda intégré — Version 2.3') },
    documents:  { label: 'Documents',   icon: 'fold', render: () => _placeholder('Documents', 'Documents Google Drive — Version 2.3') },
    parametres: { label: 'Paramètres',  icon: 'gear', render: () => _placeholder('Paramètres', 'Administration et paramètres') },
  };

  const NAV_ICONS = {
    dash: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
    bldg: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    user: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    pipe: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
    doc:  `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    cash: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
    brok: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    cal:  `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    fold: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
    gear: `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  };

  let _current = 'biens';

  // ── Bootstrap ────────────────────────────────────────────────
  function init() {
    _renderLoginScreen();
    Auth.init(_onLogin, _onLogout);
  }

  function _onLogin(user) {
    document.getElementById('login-screen')?.remove();
    _renderShell(user);
    navigate('dashboard');
  }

  function _onLogout() {
    location.reload();
  }

  // ── Écran de connexion ───────────────────────────────────────
  function _renderLoginScreen() {
    const div = document.createElement('div');
    div.id = 'login-screen';
    div.innerHTML = `
      <div class="login-card">
        <div class="login-logo">
          <div class="login-diamond"><span>L</span></div>
          <div class="login-title">LAVI CRM</div>
          <div class="login-sub">AfriCapital Real Estate</div>
        </div>
        <p style="font-size:13px; color:rgba(255,255,255,0.55); line-height:1.6; margin-bottom:4px;">
          Espace de gestion du Programme LAVI<br>Domaine d'Anfa, Casablanca
        </p>
        <div id="google-signin-btn" style="display:flex; justify-content:center; margin-top:8px;"></div>
        <p id="login-error" class="login-error"></p>
      </div>`;
    document.body.appendChild(div);
  }

  // ── Shell principal ──────────────────────────────────────────
  function _renderShell(user) {
    const app = document.getElementById('app');
    app.innerHTML = `
      <aside id="sidebar">
        <div class="sidebar-logo">
          <div class="logo-mark">
            <div class="logo-diamond"><span>L</span></div>
            <div class="logo-text">
              <div class="logo-title">LAVI CRM</div>
              <div class="logo-sub">AfriCapital Real Estate</div>
            </div>
          </div>
        </div>

        <nav class="sidebar-nav">
          <div class="nav-section">Vue d'ensemble</div>
          <div class="nav-item" data-module="dashboard">${NAV_ICONS.dash} Dashboard</div>

          <div class="nav-section">Gestion</div>
          <div class="nav-item" data-module="biens">${NAV_ICONS.bldg} Biens</div>
          <div class="nav-item" data-module="clients">${NAV_ICONS.user} Clients</div>
          <div class="nav-item" data-module="prospects">${NAV_ICONS.pipe} Prospects</div>

          <div class="nav-section">Commercial</div>
          <div class="nav-item" data-module="contrats">${NAV_ICONS.doc} Contrats</div>
          <div class="nav-item" data-module="paiements">${NAV_ICONS.cash} Paiements</div>
          <div class="nav-item" data-module="brokers">${NAV_ICONS.brok} Brokers</div>

          <div class="nav-section">Outils</div>
          <div class="nav-item" data-module="agenda">${NAV_ICONS.cal} Agenda</div>
          <div class="nav-item" data-module="documents">${NAV_ICONS.fold} Documents</div>
          <div class="nav-item" data-module="parametres">${NAV_ICONS.gear} Paramètres</div>
        </nav>

        <div class="sidebar-user">
          <div class="user-avatar">${user.initials || 'U'}</div>
          <div class="user-info">
            <div class="user-name">${user.name || user.email}</div>
            <div class="user-role">
              <span style="cursor:pointer; text-decoration:underline;" id="btn-logout">Déconnexion</span>
            </div>
          </div>
        </div>
      </aside>

      <div id="main">
        <header id="topbar">
          <div class="topbar-title" id="topbar-title">LAVI CRM V2</div>
          <div class="topbar-actions">
            <span style="font-size:12px; color:var(--muted);">Projet LAVI · Casablanca</span>
          </div>
        </header>
        <main id="content"></main>
      </div>

      <div id="toast-container"></div>
    `;

    // Navigation
    document.querySelectorAll('[data-module]').forEach(el => {
      el.addEventListener('click', () => navigate(el.dataset.module));
    });

    document.getElementById('btn-logout')?.addEventListener('click', () => Auth.logout());
  }

  // ── Navigation ───────────────────────────────────────────────
  function navigate(module, arg) {
    if (!MODULES[module]) return;
    _current = module;

    // Mettre à jour nav active
    document.querySelectorAll('[data-module]').forEach(el => {
      el.classList.toggle('active', el.dataset.module === module);
    });

    // Mettre à jour topbar
    const topbarTitle = document.getElementById('topbar-title');
    if (topbarTitle) topbarTitle.textContent = MODULES[module].label;

    // Rendre le module (arg optionnel, ex: ID à ouvrir après chargement)
    UI.closeAllModals();
    MODULES[module].render(arg);
  }

  // ── Placeholder pour modules à venir ────────────────────────
  function _placeholder(title, description) {
    document.getElementById('content').innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; min-height:60vh;">
        <div style="text-align:center; max-width:400px;">
          <div style="width:64px; height:64px; background:var(--gold); transform:rotate(45deg); margin:0 auto 24px; display:flex; align-items:center; justify-content:center;">
            <span style="transform:rotate(-45deg); font-size:24px;">🔨</span>
          </div>
          <h2 style="font-size:20px; font-weight:800; color:var(--navy); margin-bottom:8px;">${title}</h2>
          <p style="font-size:13.5px; color:var(--muted); line-height:1.6;">${description}</p>
          <button class="btn btn-primary" style="margin-top:24px;" onclick="App.navigate('biens')">
            Retour aux Biens
          </button>
        </div>
      </div>`;
  }

  return { init, navigate };
})();

// ── Démarrage ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());


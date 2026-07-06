// ============================================================
// LAVI CRM V2 — Module Clients
// ============================================================

const ModuleClients = (() => {

  const SHEET = LAVI_CONFIG.SHEETS.CLIENTS;
  const PER_PAGE = 15;

  let _state = {
    records: [],
    filtered: [],
    page: 1,
    view: 'table',        // 'table' | 'grid'
    filterStatut: '',
    filterVille: '',
    filterCommercial: '',
    search: '',
    selectedId: null,
  };

  let _pendingOpenId = null;

  // ── Rendu principal ─────────────────────────────────────────
  // openIdAfterLoad : ID client à ouvrir automatiquement une fois les données chargées
  // (utilisé par le Kanban Prospects pour renvoyer vers la fiche complète)
  function render(openIdAfterLoad) {
    _pendingOpenId = openIdAfterLoad || null;
    const content = document.getElementById('content');
    content.innerHTML = `
      <div id="clients-module">

        <div class="module-header" style="margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <h1 style="font-size:22px; font-weight:800; color:var(--navy);">Gestion des Clients</h1>
            <p style="font-size:13px; color:var(--muted); margin-top:2px;">Clients & Prospects — Programme LAVI</p>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" id="btn-export-clients">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exporter
            </button>
            <button class="btn btn-gold" id="btn-add-client">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nouveau client
            </button>
          </div>
        </div>

        <!-- KPIs -->
        <div class="kpi-grid" id="clients-kpis">
          ${_kpiSkeleton()}
        </div>

        <!-- Filtres -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-body" style="padding:14px 20px;">
            <div class="filter-bar">
              <div class="search-input">
                <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="client-search" placeholder="Nom, CIN, téléphone, email…" value="${_state.search}">
              </div>
              <select id="filter-client-statut" class="form-control" style="width:auto; min-width:130px;">
                <option value="">Tous les statuts</option>
                ${LAVI_CONFIG.STATUTS_CLIENTS.map(s => `<option value="${s}" ${_state.filterStatut===s?'selected':''}>${s}</option>`).join('')}
              </select>
              <select id="filter-client-ville" class="form-control" style="width:auto; min-width:120px;">
                <option value="">Toutes les villes</option>
              </select>
              <select id="filter-client-commercial" class="form-control" style="width:auto; min-width:140px;">
                <option value="">Tous les commerciaux</option>
              </select>
              <div style="margin-left:auto; display:flex; gap:6px;">
                <button class="btn-icon ${_state.view==='table'?'active':''}" id="btn-view-table-c" title="Vue liste">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                </button>
                <button class="btn-icon ${_state.view==='grid'?'active':''}" id="btn-view-grid-c" title="Vue cartes">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Liste -->
        <div id="clients-list-wrap"></div>

      </div>

      <!-- Modale Formulaire -->
      ${_modalFormHTML()}

      <!-- Modale Détail -->
      ${_modalDetailHTML()}
    `;

    _bindEvents();
    _loadData();
  }

  // ── Chargement ───────────────────────────────────────────────
  async function _loadData() {
    UI.setLoading('clients-list-wrap', true);
    const result = await GoogleAPI.read(SHEET);
    UI.setLoading('clients-list-wrap', false);

    if (!result.success) {
      document.getElementById('clients-list-wrap').innerHTML =
        UI.emptyState('⚠️', 'Erreur de chargement', result.error);
      UI.toast('Erreur: ' + result.error, 'error');
      return;
    }

    _state.records = result.records || [];
    _populateDynamicFilters();
    _applyFilters();
    _renderKPIs();

    if (_pendingOpenId) {
      openEdit(_pendingOpenId);
      _pendingOpenId = null;
    }
  }

  // ── Filtres dynamiques (villes & commerciaux depuis les données) ──
  function _populateDynamicFilters() {
    const villes = [...new Set(_state.records.map(r => r.Ville).filter(Boolean))].sort();
    const commerciaux = [...new Set(_state.records.map(r => r.Commercial).filter(Boolean))].sort();

    const villeEl = document.getElementById('filter-client-ville');
    if (villeEl) {
      villes.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v;
        if (_state.filterVille === v) opt.selected = true;
        villeEl.appendChild(opt);
      });
    }

    const commEl = document.getElementById('filter-client-commercial');
    if (commEl) {
      commerciaux.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        if (_state.filterCommercial === c) opt.selected = true;
        commEl.appendChild(opt);
      });
    }
  }

  // ── Filtrage ─────────────────────────────────────────────────
  function _applyFilters() {
    let data = [..._state.records];

    if (_state.search) {
      const q = _state.search.toLowerCase();
      data = data.filter(r =>
        (r.Nom||'').toLowerCase().includes(q) ||
        (r.Prenom||'').toLowerCase().includes(q) ||
        (r.CIN||'').toLowerCase().includes(q) ||
        (r.Telephone||'').toLowerCase().includes(q) ||
        (r.Email||'').toLowerCase().includes(q) ||
        (r.Ville||'').toLowerCase().includes(q)
      );
    }
    if (_state.filterStatut)     data = data.filter(r => r.Statut     === _state.filterStatut);
    if (_state.filterVille)      data = data.filter(r => r.Ville      === _state.filterVille);
    if (_state.filterCommercial) data = data.filter(r => r.Commercial === _state.filterCommercial);

    // Tri : relances urgentes en premier, puis date création desc
    data.sort((a, b) => {
      const aRelance = a.Prochaine_Relance ? new Date(a.Prochaine_Relance) : null;
      const bRelance = b.Prochaine_Relance ? new Date(b.Prochaine_Relance) : null;
      const now = new Date();
      const aUrgent = aRelance && aRelance <= now;
      const bUrgent = bRelance && bRelance <= now;
      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;
      return 0;
    });

    _state.filtered = data;
    _state.page = 1;
    _renderList();
  }

  // ── KPIs ─────────────────────────────────────────────────────
  function _kpiSkeleton() {
    return ['Total','Prospects','Actifs','Clients','À relancer'].map(l =>
      `<div class="kpi-card"><div class="kpi-label">${l}</div><div class="kpi-value">—</div></div>`
    ).join('');
  }

  function _renderKPIs() {
    const r = _state.records;
    const now = new Date();
    const aRelancer = r.filter(c => {
      if (!c.Prochaine_Relance) return false;
      return new Date(c.Prochaine_Relance) <= now;
    }).length;

    document.getElementById('clients-kpis').innerHTML = [
      { label: 'Total clients',  value: r.length },
      { label: 'Prospects',      value: r.filter(c=>c.Statut==='Prospect').length,  color: '#1565C0' },
      { label: 'Actifs',         value: r.filter(c=>c.Statut==='Actif').length,     color: '#2E7D52' },
      { label: 'Clients',        value: r.filter(c=>c.Statut==='Client').length,    color: '#1B2A38' },
      { label: 'À relancer',     value: aRelancer,                                  color: aRelancer > 0 ? '#B8860B' : undefined },
    ].map(k => `
      <div class="kpi-card">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value" style="${k.color?`color:${k.color}`:''}">
          ${k.value}
        </div>
      </div>`).join('');
  }

  // ── Rendu liste ──────────────────────────────────────────────
  function _renderList() {
    const wrap = document.getElementById('clients-list-wrap');
    if (!wrap) return;

    const data   = _state.filtered;
    const total  = data.length;
    const pages  = Math.ceil(total / PER_PAGE);
    const page   = _state.page;
    const slice  = data.slice((page-1)*PER_PAGE, page*PER_PAGE);

    if (total === 0) {
      wrap.innerHTML = `<div class="card">${UI.emptyState('👤', 'Aucun client trouvé', 'Modifiez les filtres ou ajoutez un nouveau client.')}</div>`;
      return;
    }

    const content = _state.view === 'grid' ? _renderGrid(slice) : _renderTable(slice);
    const pagination = UI.paginationHTML(page, pages, PER_PAGE, total);

    wrap.innerHTML = `<div class="card">${content}${pagination}</div>`;

    wrap.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => { _state.page = parseInt(btn.dataset.page); _renderList(); });
    });
    wrap.querySelectorAll('[data-client-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (!e.target.closest('.btn') && !e.target.closest('[data-action]')) {
          _openDetail(el.dataset.clientId);
        }
      });
    });
    wrap.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (btn.dataset.action === 'edit')   openEdit(btn.dataset.id);
        if (btn.dataset.action === 'delete') _delete(btn.dataset.id);
      });
    });
  }

  // ── Vue table ────────────────────────────────────────────────
  function _renderTable(data) {
    const now = new Date();
    return `<div class="table-wrap">
      <table class="lavi-table">
        <thead>
          <tr>
            <th>CIN</th>
            <th>Nom complet</th>
            <th>Téléphone</th>
            <th>Ville</th>
            <th>Budget</th>
            <th>Statut</th>
            <th>Commercial</th>
            <th>Relance</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(c => {
            const relance = c.Prochaine_Relance ? new Date(c.Prochaine_Relance) : null;
            const relanceUrgent = relance && relance <= now;
            return `
            <tr data-client-id="${c.ID}" style="cursor:pointer;">
              <td><span style="font-family:var(--font-num); font-size:12px; color:var(--muted);">${c.CIN||'—'}</span></td>
              <td>
                <div style="display:flex; align-items:center; gap:10px;">
                  <div style="width:32px; height:32px; border-radius:50%; background:var(--navy); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; color:var(--gold); flex-shrink:0;">
                    ${_initials(c.Prenom, c.Nom)}
                  </div>
                  <div>
                    <div style="font-weight:700; color:var(--navy);">${c.Prenom||''} ${c.Nom||''}</div>
                    ${c.Email ? `<div style="font-size:11px; color:var(--muted);">${c.Email}</div>` : ''}
                  </div>
                </div>
              </td>
              <td>${c.Telephone||'—'}</td>
              <td>${c.Ville||'—'}</td>
              <td style="font-family:var(--font-num); font-size:12px;">
                ${c.Budget_Min || c.Budget_Max
                  ? `${c.Budget_Min ? _formatBudget(c.Budget_Min) : '?'} – ${c.Budget_Max ? _formatBudget(c.Budget_Max) : '?'}`
                  : '—'}
              </td>
              <td>${UI.badge(c.Statut)}</td>
              <td>${c.Commercial||'—'}</td>
              <td>
                ${relance
                  ? `<span style="font-size:12px; font-weight:600; color:${relanceUrgent?'var(--danger)':'var(--body-text)'};">
                      ${relanceUrgent ? '⚠ ' : ''}${_formatRelance(relance)}
                    </span>`
                  : '<span style="color:var(--muted);">—</span>'}
              </td>
              <td>
                <div class="td-actions">
                  <button class="btn-icon btn-sm" title="Modifier" data-action="edit" data-id="${c.ID}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  ${Auth.isAdmin() ? `<button class="btn-icon btn-sm" title="Supprimer" data-action="delete" data-id="${c.ID}" style="color:var(--danger);">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>` : ''}
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── Vue grille (cartes clients) ───────────────────────────────
  function _renderGrid(data) {
    return `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); gap:16px; padding:20px;">
      ${data.map(c => `
        <div class="bien-card" data-client-id="${c.ID}">
          <div class="bien-card-header" style="gap:10px;">
            <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
              <div style="width:38px; height:38px; border-radius:50%; background:var(--gold); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:14px; color:var(--navy); flex-shrink:0;">
                ${_initials(c.Prenom, c.Nom)}
              </div>
              <div style="overflow:hidden;">
                <div style="font-weight:700; color:var(--white); font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.Prenom||''} ${c.Nom||''}</div>
                <div style="font-size:11px; color:rgba(200,169,110,0.7);">${c.CIN||'—'}</div>
              </div>
            </div>
            ${UI.badge(c.Statut)}
          </div>
          <div class="bien-card-body">
            ${c.Telephone ? `<div class="bien-card-row"><span>Téléphone</span><span>${c.Telephone}</span></div>` : ''}
            ${c.Ville     ? `<div class="bien-card-row"><span>Ville</span><span>${c.Ville}</span></div>` : ''}
            ${c.Origine   ? `<div class="bien-card-row"><span>Origine</span><span>${c.Origine}</span></div>` : ''}
            ${c.Type_Recherche ? `<div class="bien-card-row"><span>Recherche</span><span>${c.Type_Recherche}</span></div>` : ''}
            ${(c.Budget_Min||c.Budget_Max) ? `<div class="bien-card-row"><span>Budget</span><span style="font-family:var(--font-num); font-size:12px;">${_formatBudget(c.Budget_Min)} – ${_formatBudget(c.Budget_Max)}</span></div>` : ''}
            ${c.Commercial ? `<div class="bien-card-row"><span>Commercial</span><span>${c.Commercial}</span></div>` : ''}
          </div>
          <div class="bien-card-footer">
            <span style="font-size:11px; color:rgba(200,169,110,0.7);">
              ${c.Dernier_Contact ? 'Dernier contact : ' + UI.formatDate(c.Dernier_Contact) : 'Pas de contact enregistré'}
            </span>
            <button class="btn-icon" style="border-color:rgba(200,169,110,0.3);" data-action="edit" data-id="${c.ID}" title="Modifier">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
          </div>
        </div>`).join('')}
    </div>`;
  }

  // ── Fiche détail client ──────────────────────────────────────
  function _openDetail(id) {
    const c = _state.records.find(r => r.ID === id);
    if (!c) return;
    _state.selectedId = id;

    document.getElementById('detail-client-title').textContent = `${c.Prenom||''} ${c.Nom||''}`.trim() || id;

    document.getElementById('detail-client-body').innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 300px; gap:24px;">

        <!-- Colonne principale -->
        <div>
          <!-- En-tête identité -->
          <div style="display:flex; align-items:center; gap:16px; padding:20px; background:var(--navy); border-radius:var(--radius-lg); margin-bottom:20px;">
            <div style="width:56px; height:56px; border-radius:50%; background:var(--gold); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:20px; color:var(--navy); flex-shrink:0;">
              ${_initials(c.Prenom, c.Nom)}
            </div>
            <div>
              <div style="font-size:20px; font-weight:800; color:var(--white);">${c.Prenom||''} ${c.Nom||''}</div>
              <div style="font-size:13px; color:var(--gold); margin-top:2px;">${c.CIN||''} ${c.Nationalite ? '· '+c.Nationalite : ''}</div>
              <div style="margin-top:6px;">${UI.badge(c.Statut)}</div>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">Coordonnées</div>
            <div class="detail-row"><span class="dl">Téléphone</span><span class="dv">${c.Telephone ? `<a href="tel:${c.Telephone}" style="color:var(--navy);">${c.Telephone}</a>` : '—'}</span></div>
            <div class="detail-row"><span class="dl">Email</span><span class="dv">${c.Email ? `<a href="mailto:${c.Email}" style="color:var(--navy);">${c.Email}</a>` : '—'}</span></div>
            <div class="detail-row"><span class="dl">Adresse</span><span class="dv">${c.Adresse||'—'}</span></div>
            <div class="detail-row"><span class="dl">Ville</span><span class="dv">${c.Ville||'—'}</span></div>
            <div class="detail-row"><span class="dl">Nationalité</span><span class="dv">${c.Nationalite||'—'}</span></div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">Projet d'achat</div>
            <div class="detail-row"><span class="dl">Type recherché</span><span class="dv">${c.Type_Recherche||'—'}</span></div>
            <div class="detail-row"><span class="dl">Budget min</span><span class="dv" style="font-family:var(--font-num);">${c.Budget_Min ? UI.formatPrice(c.Budget_Min) : '—'}</span></div>
            <div class="detail-row"><span class="dl">Budget max</span><span class="dv" style="font-family:var(--font-num); font-weight:700; color:var(--navy);">${c.Budget_Max ? UI.formatPrice(c.Budget_Max) : '—'}</span></div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">Suivi commercial</div>
            <div class="detail-row"><span class="dl">Commercial</span><span class="dv">${c.Commercial||'—'}</span></div>
            <div class="detail-row"><span class="dl">Origine</span><span class="dv">${c.Origine||'—'}</span></div>
            <div class="detail-row"><span class="dl">Dernier contact</span><span class="dv">${UI.formatDate(c.Dernier_Contact)}</span></div>
            <div class="detail-row">
              <span class="dl">Prochaine relance</span>
              <span class="dv" style="${c.Prochaine_Relance && new Date(c.Prochaine_Relance) <= new Date() ? 'color:var(--danger); font-weight:700;' : ''}">
                ${UI.formatDate(c.Prochaine_Relance)}
                ${c.Prochaine_Relance && new Date(c.Prochaine_Relance) <= new Date() ? ' ⚠ À relancer' : ''}
              </span>
            </div>
          </div>

          ${c.Notes ? `
          <div class="detail-section">
            <div class="detail-section-title">Notes</div>
            <p style="font-size:13px; color:var(--body-text); line-height:1.7; white-space:pre-wrap;">${c.Notes}</p>
          </div>` : ''}
        </div>

        <!-- Colonne latérale -->
        <div>
          <div class="card" style="margin-bottom:16px;">
            <div class="card-header" style="background:var(--navy);">
              <span class="card-title" style="color:var(--gold);">Actions rapides</span>
            </div>
            <div class="card-body" style="display:flex; flex-direction:column; gap:8px; padding:14px;">
              <button class="btn btn-outline" style="justify-content:flex-start; font-size:13px;"
                onclick="ModuleClients.openEdit('${c.ID}'); UI.closeModal('modal-client-detail');">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Modifier le dossier
              </button>
              ${c.Telephone ? `
              <a href="tel:${c.Telephone}" class="btn btn-outline" style="justify-content:flex-start; font-size:13px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.35 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                Appeler
              </a>` : ''}
              ${c.Email ? `
              <a href="mailto:${c.Email}" class="btn btn-outline" style="justify-content:flex-start; font-size:13px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Envoyer un email
              </a>` : ''}
            </div>
          </div>

          <div class="card">
            <div class="card-header" style="background:var(--navy);">
              <span class="card-title" style="color:var(--gold);">Informations système</span>
            </div>
            <div class="card-body" style="padding:14px;">
              <div class="detail-row" style="padding:5px 0; border-bottom:1px solid var(--sand);">
                <span class="dl" style="font-size:10.5px;">ID</span>
                <span class="dv" style="font-size:11px; color:var(--muted);">${c.ID}</span>
              </div>
              <div class="detail-row" style="padding:5px 0;">
                <span class="dl" style="font-size:10.5px;">Créé le</span>
                <span class="dv" style="font-size:11px; color:var(--muted);">${c.Date_Creation||'—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-edit-from-client-detail').onclick = () => {
      UI.closeModal('modal-client-detail');
      openEdit(id);
    };

    UI.openModal('modal-client-detail');
  }

  // ── Formulaire HTML ──────────────────────────────────────────
  function _modalFormHTML() {
    return `
    <div class="modal-overlay" id="modal-client-form">
      <div class="modal" style="max-width:780px;">
        <div class="modal-header">
          <h3 id="modal-client-title">Nouveau client</h3>
          <span class="modal-close" data-close="modal-client-form">✕</span>
        </div>
        <div class="modal-body">
          <input type="hidden" id="client-form-id">

          <div class="detail-section-title">Identité</div>
          <div class="form-row form-row-3">
            <div class="form-group">
              <label class="form-label">CIN *</label>
              <input class="form-control" id="client-cin" placeholder="Ex: AB123456" required>
            </div>
            <div class="form-group">
              <label class="form-label">Nom *</label>
              <input class="form-control" id="client-nom" placeholder="Nom de famille" required>
            </div>
            <div class="form-group">
              <label class="form-label">Prénom *</label>
              <input class="form-control" id="client-prenom" placeholder="Prénom" required>
            </div>
          </div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Nationalité</label>
              <input class="form-control" id="client-nationalite" placeholder="Ex: Marocaine">
            </div>
            <div class="form-group">
              <label class="form-label">Statut *</label>
              <select class="form-control" id="client-statut">
                ${LAVI_CONFIG.STATUTS_CLIENTS.map(s=>`<option value="${s}">${s}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="detail-section-title" style="margin-top:8px;">Coordonnées</div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Téléphone *</label>
              <input class="form-control" id="client-telephone" placeholder="06 xx xx xx xx" type="tel">
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-control" id="client-email" placeholder="email@exemple.com" type="email">
            </div>
          </div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Adresse</label>
              <input class="form-control" id="client-adresse" placeholder="Rue, quartier…">
            </div>
            <div class="form-group">
              <label class="form-label">Ville</label>
              <input class="form-control" id="client-ville" placeholder="Ex: Casablanca">
            </div>
          </div>

          <div class="detail-section-title" style="margin-top:8px;">Projet d'achat</div>
          <div class="form-row form-row-3">
            <div class="form-group">
              <label class="form-label">Type recherché</label>
              <select class="form-control" id="client-type-recherche">
                <option value="">— Non précisé —</option>
                ${LAVI_CONFIG.TYPES_BIENS.map(t=>`<option value="${t}">${t}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Budget min (DH)</label>
              <input class="form-control" id="client-budget-min" type="number" min="0" placeholder="Ex: 1500000">
            </div>
            <div class="form-group">
              <label class="form-label">Budget max (DH)</label>
              <input class="form-control" id="client-budget-max" type="number" min="0" placeholder="Ex: 2500000">
            </div>
          </div>

          <div class="detail-section-title" style="margin-top:8px;">Suivi commercial</div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Commercial responsable</label>
              <input class="form-control" id="client-commercial" placeholder="Nom du commercial">
            </div>
            <div class="form-group">
              <label class="form-label">Origine</label>
              <select class="form-control" id="client-origine">
                <option value="">— Sélectionner —</option>
                ${LAVI_CONFIG.ORIGINES_CLIENTS.map(o=>`<option value="${o}">${o}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Dernier contact</label>
              <input class="form-control" id="client-dernier-contact" type="date">
            </div>
            <div class="form-group">
              <label class="form-label">Prochaine relance</label>
              <input class="form-control" id="client-relance" type="date">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea class="form-control" id="client-notes" rows="3" placeholder="Observations, historique, préférences particulières…"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-close="modal-client-form">Annuler</button>
          <button class="btn btn-gold" id="btn-save-client">Enregistrer</button>
        </div>
      </div>
    </div>`;
  }

  // ── Modale détail HTML ───────────────────────────────────────
  function _modalDetailHTML() {
    return `
    <div class="modal-overlay" id="modal-client-detail">
      <div class="modal" style="max-width:860px;">
        <div class="modal-header">
          <h3 id="detail-client-title">Fiche client</h3>
          <span class="modal-close" data-close="modal-client-detail">✕</span>
        </div>
        <div class="modal-body" id="detail-client-body"></div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-close="modal-client-detail">Fermer</button>
          <button class="btn btn-primary" id="btn-edit-from-client-detail">Modifier</button>
        </div>
      </div>
    </div>`;
  }

  // ── Ouverture formulaire ─────────────────────────────────────
  function openEdit(id) {
    const c = id ? _state.records.find(r => r.ID === id) : null;
    document.getElementById('modal-client-title').textContent = c ? `Modifier — ${c.Prenom||''} ${c.Nom||''}` : 'Nouveau client';
    document.getElementById('client-form-id').value = id || '';

    const map = {
      'cin':'CIN','nom':'Nom','prenom':'Prenom','nationalite':'Nationalite',
      'statut':'Statut','telephone':'Telephone','email':'Email',
      'adresse':'Adresse','ville':'Ville','type-recherche':'Type_Recherche',
      'budget-min':'Budget_Min','budget-max':'Budget_Max',
      'commercial':'Commercial','origine':'Origine','notes':'Notes'
    };
    Object.entries(map).forEach(([field, key]) => {
      const el = document.getElementById(`client-${field}`);
      if (el) el.value = c ? (c[key]||'') : (key==='Statut' ? 'Prospect' : '');
    });

    // Dates (format YYYY-MM-DD pour input[type=date])
    ['dernier-contact','relance'].forEach(f => {
      const el = document.getElementById(`client-${f}`);
      const key = f === 'dernier-contact' ? 'Dernier_Contact' : 'Prochaine_Relance';
      if (el && c && c[key]) {
        // Convertir dd/MM/yyyy → yyyy-MM-dd si nécessaire
        const v = c[key];
        if (v && v.includes('/')) {
          const [d,m,y] = v.split('/');
          el.value = `${y}-${m}-${d}`;
        } else {
          el.value = v || '';
        }
      } else if (el) {
        el.value = '';
      }
    });

    // Affectation : seul l'admin choisit le commercial (le serveur l'impose).
    if (!Auth.isAdmin()) {
      const el = document.getElementById('client-commercial');
      if (el) { el.disabled = true; el.title = "Affectation réservée à l'administrateur"; el.style.background = '#F2EFE9'; }
    }

    UI.openModal('modal-client-form');
  }

  // ── Sauvegarde ───────────────────────────────────────────────
  async function _save() {
    const id = document.getElementById('client-form-id').value;

    // Formatage dates
    const formatDateInput = (val) => {
      if (!val) return '';
      if (val.includes('-')) {
        const [y,m,d] = val.split('-');
        return `${d}/${m}/${y}`;
      }
      return val;
    };

    const data = {
      CIN:              document.getElementById('client-cin').value.trim().toUpperCase(),
      Nom:              document.getElementById('client-nom').value.trim().toUpperCase(),
      Prenom:           document.getElementById('client-prenom').value.trim(),
      Nationalite:      document.getElementById('client-nationalite').value.trim(),
      Statut:           document.getElementById('client-statut').value,
      Telephone:        document.getElementById('client-telephone').value.trim(),
      Email:            document.getElementById('client-email').value.trim(),
      Adresse:          document.getElementById('client-adresse').value.trim(),
      Ville:            document.getElementById('client-ville').value.trim(),
      Type_Recherche:   document.getElementById('client-type-recherche').value,
      Budget_Min:       document.getElementById('client-budget-min').value,
      Budget_Max:       document.getElementById('client-budget-max').value,
      Commercial:       document.getElementById('client-commercial').value.trim(),
      Origine:          document.getElementById('client-origine').value,
      Dernier_Contact:  formatDateInput(document.getElementById('client-dernier-contact').value),
      Prochaine_Relance:formatDateInput(document.getElementById('client-relance').value),
      Notes:            document.getElementById('client-notes').value.trim(),
    };

    if (!data.CIN || !data.Nom || !data.Prenom || !data.Telephone) {
      UI.toast('Veuillez remplir les champs obligatoires (CIN, Nom, Prénom, Téléphone).', 'error');
      return;
    }

    const btn = document.getElementById('btn-save-client');
    btn.textContent = 'Enregistrement…';
    btn.disabled = true;

    const result = id
      ? await GoogleAPI.update(SHEET, id, data)
      : await GoogleAPI.create(SHEET, data);

    btn.textContent = 'Enregistrer';
    btn.disabled = false;

    if (result.success) {
      UI.closeModal('modal-client-form');
      UI.toast(id ? 'Client modifié avec succès.' : 'Client créé avec succès.', 'success');
      _loadData();
    } else {
      UI.toast('Erreur: ' + result.error, 'error');
    }
  }

  // ── Suppression ──────────────────────────────────────────────
  async function _delete(id) {
    const c = _state.records.find(r => r.ID === id);
    const name = c ? `${c.Prenom} ${c.Nom}` : id;
    if (!UI.confirm(`Supprimer le client ${name} ? Cette action est irréversible.`)) return;
    const result = await GoogleAPI.remove(SHEET, id);
    if (result.success) {
      UI.toast('Client supprimé.', 'success');
      _loadData();
    } else {
      UI.toast('Erreur: ' + result.error, 'error');
    }
  }

  // ── Export CSV simple ─────────────────────────────────────────
  function _exportCSV() {
    const data = _state.filtered;
    if (!data.length) { UI.toast('Aucune donnée à exporter.', 'warning'); return; }

    const headers = ['CIN','Nom','Prenom','Telephone','Email','Ville','Statut','Budget_Min','Budget_Max','Commercial','Origine','Dernier_Contact','Prochaine_Relance'];
    const rows = data.map(c => headers.map(h => `"${(c[h]||'').toString().replace(/"/g,'""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `LAVI_Clients_${new Date().toLocaleDateString('fr-MA').replace(/\//g,'-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('Export CSV téléchargé.', 'success');
  }

  // ── Bind événements ──────────────────────────────────────────
  function _bindEvents() {
    const searchEl = document.getElementById('client-search');
    if (searchEl) {
      let timer;
      searchEl.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => { _state.search = e.target.value; _applyFilters(); }, 300);
      });
    }

    [
      ['filter-client-statut',     () => { _state.filterStatut     = document.getElementById('filter-client-statut').value; }],
      ['filter-client-ville',      () => { _state.filterVille      = document.getElementById('filter-client-ville').value; }],
      ['filter-client-commercial', () => { _state.filterCommercial = document.getElementById('filter-client-commercial').value; }],
    ].forEach(([id, fn]) => {
      document.getElementById(id)?.addEventListener('change', () => { fn(); _applyFilters(); });
    });

    document.getElementById('btn-view-table-c')?.addEventListener('click', () => { _state.view='table'; _renderList(); });
    document.getElementById('btn-view-grid-c')?.addEventListener('click',  () => { _state.view='grid';  _renderList(); });
    document.getElementById('btn-add-client')?.addEventListener('click',   () => openEdit(null));
    document.getElementById('btn-export-clients')?.addEventListener('click', _exportCSV);
    document.getElementById('btn-save-client')?.addEventListener('click',  _save);

    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => UI.closeModal(el.dataset.close));
    });
  }

  // ── Utilitaires ──────────────────────────────────────────────
  function _initials(prenom, nom) {
    return [(prenom||'')[0], (nom||'')[0]].filter(Boolean).join('').toUpperCase() || '?';
  }

  function _formatBudget(val) {
    if (!val) return '—';
    const n = Number(val);
    if (n >= 1000000) return (n/1000000).toFixed(1).replace('.0','') + ' M';
    if (n >= 1000)    return (n/1000).toFixed(0) + ' K';
    return n.toLocaleString('fr-MA');
  }

  function _formatRelance(date) {
    const now = new Date();
    const diff = Math.round((date - now) / (1000*60*60*24));
    if (diff < 0)  return `Il y a ${Math.abs(diff)}j`;
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return 'Demain';
    return `Dans ${diff}j`;
  }

  return { render, openEdit };
})();

// ============================================================
// LAVI CRM V2 — Module Biens
// ============================================================

const ModuleBiens = (() => {

  const SHEET = LAVI_CONFIG.SHEETS.BIENS;
  const PER_PAGE = 12;

  let _state = {
    records: [],
    filtered: [],
    page: 1,
    view: 'grid',         // 'grid' | 'table'
    filterStatut: '',
    filterImmeuble: '',
    filterType: '',
    search: '',
    selectedId: null,
  };

  // ── Rendu principal ─────────────────────────────────────────
  function render() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div id="biens-module">
        <!-- Topbar override -->
        <div class="module-header" style="margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <h1 style="font-size:22px; font-weight:800; color:var(--navy);">Gestion des Biens</h1>
            <p style="font-size:13px; color:var(--muted); margin-top:2px;">Programme LAVI — Domaine d'Anfa, Casablanca</p>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" id="btn-init-sheets">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              Init. Sheets
            </button>
            <button class="btn btn-gold" id="btn-add-bien">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nouveau bien
            </button>
          </div>
        </div>

        <!-- KPIs -->
        <div class="kpi-grid" id="biens-kpis">
          ${_kpiSkeleton()}
        </div>

        <!-- Filtres -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-body" style="padding:14px 20px;">
            <div class="filter-bar">
              <div class="search-input">
                <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="bien-search" placeholder="Rechercher un bien (code, immeuble…)" value="${_state.search}">
              </div>
              <select id="filter-statut" class="form-control" style="width:auto; min-width:130px;">
                <option value="">Tous les statuts</option>
                ${LAVI_CONFIG.STATUTS_BIENS.map(s => `<option value="${s}" ${_state.filterStatut===s?'selected':''}>${s}</option>`).join('')}
              </select>
              <select id="filter-immeuble" class="form-control" style="width:auto; min-width:120px;">
                <option value="">Tous les immeubles</option>
                ${LAVI_CONFIG.IMMEUBLES.map(i => `<option value="${i}" ${_state.filterImmeuble===i?'selected':''}>${i}</option>`).join('')}
              </select>
              <select id="filter-type" class="form-control" style="width:auto; min-width:130px;">
                <option value="">Tous les types</option>
                ${LAVI_CONFIG.TYPES_BIENS.map(t => `<option value="${t}" ${_state.filterType===t?'selected':''}>${t}</option>`).join('')}
              </select>
              <div style="margin-left:auto; display:flex; gap:6px;">
                <button class="btn-icon ${_state.view==='grid'?'active':''}" id="btn-view-grid" title="Vue grille">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                </button>
                <button class="btn-icon ${_state.view==='table'?'active':''}" id="btn-view-table" title="Vue liste">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Liste -->
        <div id="biens-list-wrap"></div>
      </div>

      <!-- Modale Ajout/Édition -->
      ${_modalFormHTML()}

      <!-- Modale Détail bien -->
      ${_modalDetailHTML()}
    `;

    _bindEvents();
    _loadData();
  }

  // ── Chargement des données ───────────────────────────────────
  async function _loadData() {
    UI.setLoading('biens-list-wrap', true);
    const result = await GoogleAPI.read(SHEET);
    UI.setLoading('biens-list-wrap', false);

    if (!result.success) {
      document.getElementById('biens-list-wrap').innerHTML =
        UI.emptyState('⚠️', 'Erreur de chargement', result.error);
      UI.toast('Erreur: ' + result.error, 'error');
      return;
    }

    _state.records = result.records || [];
    _applyFilters();
    _renderKPIs();
  }

  // ── Filtrage ─────────────────────────────────────────────────
  function _applyFilters() {
    let data = [..._state.records];

    if (_state.search) {
      const q = _state.search.toLowerCase();
      data = data.filter(r =>
        (r.Code||'').toLowerCase().includes(q) ||
        (r.Immeuble||'').toLowerCase().includes(q) ||
        (r.Type||'').toLowerCase().includes(q) ||
        (r.Client_Nom||'').toLowerCase().includes(q)
      );
    }
    if (_state.filterStatut)   data = data.filter(r => r.Statut    === _state.filterStatut);
    if (_state.filterImmeuble) data = data.filter(r => r.Immeuble  === _state.filterImmeuble);
    if (_state.filterType)     data = data.filter(r => r.Type      === _state.filterType);

    _state.filtered = data;
    _state.page = 1;
    _renderList();
  }

  // ── KPIs ─────────────────────────────────────────────────────
  function _kpiSkeleton() {
    return ['Total','Disponible','Réservé','Vendu','Option'].map(l => `
      <div class="kpi-card">
        <div class="kpi-label">${l}</div>
        <div class="kpi-value">—</div>
      </div>`).join('');
  }

  function _renderKPIs() {
    const r = _state.records;
    const kpis = [
      { label: 'Total biens',    value: r.length },
      { label: 'Disponibles',    value: r.filter(b=>b.Statut==='Disponible').length },
      { label: 'Réservés',       value: r.filter(b=>b.Statut==='Réservé').length,   color: '#B8860B' },
      { label: 'Vendus',         value: r.filter(b=>b.Statut==='Vendu').length,      color: '#C62828' },
      { label: 'En option',      value: r.filter(b=>b.Statut==='Option').length,     color: '#1565C0' },
    ];
    document.getElementById('biens-kpis').innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value" style="${k.color?`color:${k.color}`:''}">
          ${k.value}
        </div>
      </div>`).join('');
  }

  // ── Rendu liste ──────────────────────────────────────────────
  function _renderList() {
    const wrap = document.getElementById('biens-list-wrap');
    if (!wrap) return;

    const data     = _state.filtered;
    const total    = data.length;
    const pages    = Math.ceil(total / PER_PAGE);
    const page     = _state.page;
    const slice    = data.slice((page-1)*PER_PAGE, page*PER_PAGE);

    if (total === 0) {
      wrap.innerHTML = `<div class="card">${UI.emptyState('🏢', 'Aucun bien trouvé', 'Modifiez les filtres ou ajoutez un nouveau bien.')}</div>`;
      return;
    }

    const content = _state.view === 'grid' ? _renderGrid(slice) : _renderTable(slice);
    const pagination = UI.paginationHTML(page, pages, PER_PAGE, total);

    wrap.innerHTML = `
      <div class="card">
        ${content}
        ${pagination}
      </div>`;

    // Bind pagination
    wrap.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        _state.page = parseInt(btn.dataset.page);
        _renderList();
      });
    });

    // Bind ouverture fiche
    wrap.querySelectorAll('[data-bien-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (!e.target.closest('.btn')) {
          _openDetail(el.dataset.bienId);
        }
      });
    });
  }

  // ── Grille ───────────────────────────────────────────────────
  function _renderGrid(data) {
    return `<div class="bien-grid" style="padding:20px;">
      ${data.map(b => `
        <div class="bien-card" data-bien-id="${b.ID}">
          <div class="bien-card-header">
            <span class="bien-card-code">${b.Code || b.ID}</span>
            ${UI.badge(b.Statut)}
          </div>
          <div class="bien-card-body">
            <div class="bien-card-row"><span>Immeuble</span><span>${b.Immeuble||'—'}</span></div>
            <div class="bien-card-row"><span>N° Appt</span><span>${b.Num_Appt||'—'}</span></div>
            <div class="bien-card-row"><span>Niveau</span><span>${b.Niveau||'—'}</span></div>
            <div class="bien-card-row"><span>Type</span><span>${b.Type||'—'}</span></div>
            <div class="bien-card-row"><span>Surface</span><span>${b.Surface ? b.Surface+' m²' : '—'}</span></div>
            ${b.Terrasse ? `<div class="bien-card-row"><span>Terrasse</span><span>${b.Terrasse} m²</span></div>` : ''}
            ${b.Vue ? `<div class="bien-card-row"><span>Vue</span><span>${b.Vue}</span></div>` : ''}
            ${b.Client_Nom && b.Statut!=='Disponible' ? `<div class="bien-card-row"><span>Client</span><span style="color:var(--navy); font-weight:700;">${b.Client_Nom}</span></div>` : ''}
          </div>
          <div class="bien-card-footer">
            <div>
              <div class="bien-card-price">${UI.formatPrice(b.Prix)}</div>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="btn-icon" title="Modifier" data-action="edit" data-id="${b.ID}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
          </div>
        </div>`).join('')}
    </div>`;
  }

  // ── Table ────────────────────────────────────────────────────
  function _renderTable(data) {
    return `<div class="table-wrap">
      <table class="lavi-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Immeuble</th>
            <th>N° Appt</th>
            <th>Niveau</th>
            <th>Type</th>
            <th>Surface</th>
            <th>Vue</th>
            <th>Prix</th>
            <th>Statut</th>
            <th>Client</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(b => `
            <tr data-bien-id="${b.ID}" style="cursor:pointer;">
              <td><strong style="color:var(--navy);">${b.Code||b.ID}</strong></td>
              <td>${b.Immeuble||'—'}</td>
              <td><strong>${b.Num_Appt||'—'}</strong></td>
              <td>${b.Niveau||'—'}</td>
              <td>${b.Type||'—'}</td>
              <td>${b.Surface ? b.Surface+' m²' : '—'}</td>
              <td>${b.Vue||'—'}</td>
              <td style="font-family:var(--font-num); font-weight:600;">${UI.formatPrice(b.Prix)}</td>
              <td>${UI.badge(b.Statut)}</td>
              <td>${b.Client_Nom||'—'}</td>
              <td>
                <div class="td-actions">
                  <button class="btn-icon btn-sm" title="Modifier" data-action="edit" data-id="${b.ID}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="btn-icon btn-sm" title="Supprimer" data-action="delete" data-id="${b.ID}" style="color:var(--danger);">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // ── Modale formulaire HTML ───────────────────────────────────
  function _modalFormHTML() {
    return `
    <div class="modal-overlay" id="modal-bien-form">
      <div class="modal" style="max-width:760px;">
        <div class="modal-header">
          <h3 id="modal-bien-title">Nouveau bien</h3>
          <span class="modal-close" data-close="modal-bien-form">✕</span>
        </div>
        <div class="modal-body">
          <input type="hidden" id="bien-form-id">

          <div class="detail-section-title">Identification</div>
          <div class="form-row form-row-3">
            <div class="form-group">
              <label class="form-label">Code bien *</label>
              <input class="form-control" id="bien-code" placeholder="Ex: IMM02A03" required>
            </div>
            <div class="form-group">
              <label class="form-label">Immeuble *</label>
              <select class="form-control" id="bien-immeuble">
                <option value="">— Sélectionner —</option>
                ${LAVI_CONFIG.IMMEUBLES.map(i=>`<option value="${i}">${i}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">N° Appartement *</label>
              <input class="form-control" id="bien-num-appt" placeholder="Ex: A03, 12, B07…">
            </div>
          </div>

          <div class="form-row form-row-3">
            <div class="form-group">
              <label class="form-label">Niveau *</label>
              <input class="form-control" id="bien-niveau" placeholder="RDC, 1er, 2ème…">
            </div>
            <div class="form-group">
              <label class="form-label">Type *</label>
              <select class="form-control" id="bien-type">
                <option value="">— Sélectionner —</option>
                ${LAVI_CONFIG.TYPES_BIENS.map(t=>`<option value="${t}">${t}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Surface (m²) *</label>
              <input class="form-control" id="bien-surface" type="number" min="0" placeholder="Ex: 87">
            </div>
            <div class="form-group">
              <label class="form-label">Statut *</label>
              <select class="form-control" id="bien-statut">
                ${LAVI_CONFIG.STATUTS_BIENS.map(s=>`<option value="${s}">${s}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="detail-section-title" style="margin-top:8px;">Caractéristiques</div>
          <div class="form-row form-row-3">
            <div class="form-group">
              <label class="form-label">Terrasse (m²)</label>
              <input class="form-control" id="bien-terrasse" type="number" min="0" placeholder="0">
            </div>
            <div class="form-group">
              <label class="form-label">Jardin (m²)</label>
              <input class="form-control" id="bien-jardin" type="number" min="0" placeholder="0">
            </div>
            <div class="form-group">
              <label class="form-label">Vue</label>
              <input class="form-control" id="bien-vue" placeholder="Mer, Piscine, Jardin, Ville…">
            </div>
          </div>

          <div class="detail-section-title" style="margin-top:8px;">Commercial</div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Prix (DH TTC) *</label>
              <input class="form-control" id="bien-prix" type="number" min="0" placeholder="Ex: 1850000">
            </div>
            <div class="form-group">
              <label class="form-label">Commercial responsable</label>
              <input class="form-control" id="bien-commercial" placeholder="Nom du commercial">
            </div>
          </div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Broker</label>
              <input class="form-control" id="bien-broker" placeholder="Nom du broker">
            </div>
            <div class="form-group">
              <label class="form-label">Commission broker (%)</label>
              <input class="form-control" id="bien-commission" type="number" min="0" max="100" step="0.5" placeholder="Ex: 2.5">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Observations</label>
            <textarea class="form-control" id="bien-observations" placeholder="Notes internes, caractéristiques particulières…"></textarea>
          </div>

          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">URL Plan PDF (Drive)</label>
              <input class="form-control" id="bien-plan-url" placeholder="https://drive.google.com/…">
            </div>
            <div class="form-group">
              <label class="form-label">URLs Photos (séparées par virgule)</label>
              <input class="form-control" id="bien-photos-urls" placeholder="https://…, https://…">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-close="modal-bien-form">Annuler</button>
          <button class="btn btn-gold" id="btn-save-bien">Enregistrer</button>
        </div>
      </div>
    </div>`;
  }

  // ── Modale détail HTML ───────────────────────────────────────
  function _modalDetailHTML() {
    return `
    <div class="modal-overlay" id="modal-bien-detail">
      <div class="modal" style="max-width:860px;">
        <div class="modal-header">
          <h3 id="detail-bien-title">Fiche bien</h3>
          <span class="modal-close" data-close="modal-bien-detail">✕</span>
        </div>
        <div class="modal-body" id="detail-bien-body">
          <!-- Contenu injecté dynamiquement -->
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-close="modal-bien-detail">Fermer</button>
          <button class="btn btn-primary" id="btn-edit-from-detail">Modifier</button>
        </div>
      </div>
    </div>`;
  }

  // ── Ouverture détail bien ────────────────────────────────────
  function _openDetail(id) {
    const bien = _state.records.find(r => r.ID === id);
    if (!bien) return;
    _state.selectedId = id;

    document.getElementById('detail-bien-title').textContent = `${bien.Immeuble||''} · Appt ${bien.Num_Appt||bien.Code||id}`;

    const photos = (bien.Photos_URLs||'').split(',').filter(Boolean);

    document.getElementById('detail-bien-body').innerHTML = `
      <div class="bien-detail-layout">
        <!-- Colonne principale -->
        <div>
          ${photos.length ? `
            <div style="margin-bottom:20px; border-radius:var(--radius); overflow:hidden; height:200px; background:var(--sand); display:flex; align-items:center; justify-content:center;">
              <img src="${photos[0]}" style="width:100%; height:100%; object-fit:cover;" onerror="this.parentElement.innerHTML='<span style=color:var(--muted)>Aucune photo disponible</span>'">
            </div>` : ''}

          <!-- Bannière identité bien -->
          <div style="background:var(--navy); border-radius:var(--radius-lg); padding:16px 20px; margin-bottom:20px; display:flex; align-items:center; justify-content:space-between;">
            <div>
              <div style="font-size:11px; color:rgba(200,169,110,0.6); letter-spacing:0.08em; text-transform:uppercase; margin-bottom:4px;">Appartement</div>
              <div style="font-size:26px; font-weight:900; color:var(--gold); letter-spacing:0.04em;">${bien.Num_Appt || '—'}</div>
              <div style="font-size:13px; color:rgba(255,255,255,0.7); margin-top:4px;">${bien.Immeuble||''} · ${bien.Niveau||''} · ${bien.Type||''}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px; color:rgba(200,169,110,0.6); letter-spacing:0.08em; text-transform:uppercase; margin-bottom:4px;">Code</div>
              <div style="font-size:15px; font-weight:700; color:var(--white);">${bien.Code||'—'}</div>
              <div style="margin-top:8px;">${UI.badge(bien.Statut)}</div>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">Identification</div>
            <div class="detail-row"><span class="dl">Code</span><span class="dv">${bien.Code||'—'}</span></div>
            <div class="detail-row"><span class="dl">Immeuble</span><span class="dv">${bien.Immeuble||'—'}</span></div>
            <div class="detail-row"><span class="dl">N° Appartement</span><span class="dv" style="font-weight:800; color:var(--navy); font-size:15px;">${bien.Num_Appt||'—'}</span></div>
            <div class="detail-row"><span class="dl">Niveau</span><span class="dv">${bien.Niveau||'—'}</span></div>
            <div class="detail-row"><span class="dl">Type</span><span class="dv">${bien.Type||'—'}</span></div>
            <div class="detail-row"><span class="dl">Surface</span><span class="dv">${bien.Surface ? bien.Surface+' m²' : '—'}</span></div>
            ${bien.Terrasse ? `<div class="detail-row"><span class="dl">Terrasse</span><span class="dv">${bien.Terrasse} m²</span></div>` : ''}
            ${bien.Jardin   ? `<div class="detail-row"><span class="dl">Jardin</span><span class="dv">${bien.Jardin} m²</span></div>` : ''}
            ${bien.Vue      ? `<div class="detail-row"><span class="dl">Vue</span><span class="dv">${bien.Vue}</span></div>` : ''}
          </div>

          <div class="detail-section">
            <div class="detail-section-title">Plan de l'appartement</div>
            <div id="detail-plan-box">
              <div style="padding:16px 0; color:var(--muted); font-size:13px;">Recherche du plan…</div>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">Informations commerciales</div>
            <div class="detail-row"><span class="dl">Prix</span><span class="dv" style="font-size:16px; font-weight:800; color:var(--navy);">${UI.formatPrice(bien.Prix)}</span></div>
            <div class="detail-row"><span class="dl">Statut</span><span class="dv">${UI.badge(bien.Statut)}</span></div>
            <div class="detail-row"><span class="dl">Commercial</span><span class="dv">${bien.Commercial||'—'}</span></div>
            ${bien.Broker ? `<div class="detail-row"><span class="dl">Broker</span><span class="dv">${bien.Broker} ${bien.Commission_Pct ? '('+bien.Commission_Pct+'%)' : ''}</span></div>` : ''}
          </div>

          ${(bien.Statut === 'Réservé' || bien.Statut === 'Vendu') ? `
          <div class="detail-section">
            <div class="detail-section-title">Client</div>
            <div class="detail-row"><span class="dl">Nom</span><span class="dv">${bien.Client_Nom||'—'}</span></div>
            <div class="detail-row"><span class="dl">CIN</span><span class="dv">${bien.Client_CIN||'—'}</span></div>
            <div class="detail-row"><span class="dl">Réservé le</span><span class="dv">${UI.formatDate(bien.Date_Reservation)}</span></div>
            ${bien.Date_Expiration ? `<div class="detail-row"><span class="dl">Expire le</span><span class="dv" style="color:var(--danger);">${UI.formatDate(bien.Date_Expiration)}</span></div>` : ''}
          </div>` : ''}

          ${bien.Observations ? `
          <div class="detail-section">
            <div class="detail-section-title">Observations</div>
            <p style="font-size:13px; color:var(--body-text); line-height:1.6;">${bien.Observations}</p>
          </div>` : ''}
        </div>

        <!-- Colonne latérale -->
        <div>
          <div class="card" style="margin-bottom:16px;">
            <div class="card-header" style="background:var(--navy);">
              <span class="card-title" style="color:var(--gold);">Actions rapides</span>
            </div>
            <div class="card-body" style="display:flex; flex-direction:column; gap:8px; padding:14px;">
              <button class="btn btn-outline" style="justify-content:flex-start; font-size:13px;" onclick="ModuleBiens.openEdit('${bien.ID}'); UI.closeModal('modal-bien-detail');">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Modifier ce bien
              </button>
            </div>
          </div>

          <div class="card">
            <div class="card-header" style="background:var(--navy);">
              <span class="card-title" style="color:var(--gold);">Informations système</span>
            </div>
            <div class="card-body" style="padding:14px;">
              <div class="detail-row" style="padding:5px 0; border-bottom:1px solid var(--sand);">
                <span class="dl" style="font-size:10.5px;">ID</span>
                <span class="dv" style="font-size:11px; color:var(--muted);">${bien.ID}</span>
              </div>
              <div class="detail-row" style="padding:5px 0;">
                <span class="dl" style="font-size:10.5px;">Modifié le</span>
                <span class="dv" style="font-size:11px; color:var(--muted);">${bien.Date_Modif ? new Date(bien.Date_Modif).toLocaleString('fr-MA') : '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-edit-from-detail').onclick = () => {
      UI.closeModal('modal-bien-detail');
      openEdit(id);
    };

    _loadPlanSection(bien);
    UI.openModal('modal-bien-detail');
  }

  // ── Section Plan (override manuel Plan_PDF_URL, sinon recherche Drive) ──
  async function _loadPlanSection(bien) {
    const box = document.getElementById('detail-plan-box');
    if (!box) return;

    const renderEmbed = (previewUrl, openUrl) => {
      if (_state.selectedId !== bien.ID) return; // la fiche a changé entre-temps
      box.innerHTML = `
        <div style="border:1px solid var(--sand); border-radius:var(--radius); overflow:hidden;">
          <iframe src="${previewUrl}" style="width:100%; height:420px; border:none; display:block;" allow="autoplay"></iframe>
        </div>
        <a href="${openUrl}" target="_blank" style="display:inline-flex; align-items:center; gap:6px; margin-top:8px; font-size:12.5px; color:var(--navy); font-weight:600; text-decoration:underline;">
          Ouvrir le plan dans un nouvel onglet
        </a>`;
    };

    const renderEmpty = (message) => {
      if (_state.selectedId !== bien.ID) return;
      box.innerHTML = `<div style="padding:14px 0; color:var(--muted); font-size:13px;">${message}</div>`;
    };

    // Override manuel prioritaire (champ URL Plan PDF renseigné à la main)
    if (bien.Plan_PDF_URL) {
      const url = bien.Plan_PDF_URL;
      const previewUrl = url.includes('/preview') ? url : url.replace(/\/view.*$/, '/preview');
      renderEmbed(previewUrl, url);
      return;
    }

    if (!bien.Code) {
      renderEmpty('Aucun code bien défini — impossible de rechercher le plan automatiquement.');
      return;
    }

    const result = await GoogleAPI.getPlanUrl(bien.Code);
    if (result.success) {
      renderEmbed(result.previewUrl, result.url);
    } else {
      renderEmpty(result.error || `Aucun plan trouvé dans Plans_des_appartements pour "${bien.Code}.pdf".`);
    }
  }

  // ── Ouverture formulaire (ajout/édition) ─────────────────────
  function openEdit(id) {
    const bien = id ? _state.records.find(r => r.ID === id) : null;
    const title = bien ? `Modifier — ${bien.Code||id}` : 'Nouveau bien';

    document.getElementById('modal-bien-title').textContent = title;
    document.getElementById('bien-form-id').value = id || '';

    const fields = ['code','immeuble','num-appt','niveau','type','surface','terrasse','jardin','vue',
                    'prix','statut','commercial','broker','commission','observations','plan-url','photos-urls'];

    const map = {
      'code':'Code','immeuble':'Immeuble','num-appt':'Num_Appt','niveau':'Niveau','type':'Type','surface':'Surface',
      'terrasse':'Terrasse','jardin':'Jardin','vue':'Vue','prix':'Prix','statut':'Statut',
      'commercial':'Commercial','broker':'Broker','commission':'Commission_Pct',
      'observations':'Observations','plan-url':'Plan_PDF_URL','photos-urls':'Photos_URLs'
    };

    fields.forEach(f => {
      const el = document.getElementById(`bien-${f}`);
      if (el) el.value = bien ? (bien[map[f]] || '') : (f === 'statut' ? 'Disponible' : '');
    });

    UI.openModal('modal-bien-form');
  }

  // ── Sauvegarde ───────────────────────────────────────────────
  async function _save() {
    const id = document.getElementById('bien-form-id').value;

    const data = {
      Code:           document.getElementById('bien-code').value.trim(),
      Immeuble:       document.getElementById('bien-immeuble').value,
      Num_Appt:       document.getElementById('bien-num-appt').value.trim().toUpperCase(),
      Niveau:         document.getElementById('bien-niveau').value.trim(),
      Type:           document.getElementById('bien-type').value,
      Surface:        document.getElementById('bien-surface').value,
      Terrasse:       document.getElementById('bien-terrasse').value,
      Jardin:         document.getElementById('bien-jardin').value,
      Vue:            document.getElementById('bien-vue').value.trim(),
      Prix:           document.getElementById('bien-prix').value,
      Statut:         document.getElementById('bien-statut').value,
      Commercial:     document.getElementById('bien-commercial').value.trim(),
      Broker:         document.getElementById('bien-broker').value.trim(),
      Commission_Pct: document.getElementById('bien-commission').value,
      Observations:   document.getElementById('bien-observations').value.trim(),
      Plan_PDF_URL:   document.getElementById('bien-plan-url').value.trim(),
      Photos_URLs:    document.getElementById('bien-photos-urls').value.trim(),
    };

    if (!data.Code || !data.Immeuble || !data.Type || !data.Surface || !data.Prix) {
      UI.toast('Veuillez remplir tous les champs obligatoires (*).', 'error');
      return;
    }

    const btn = document.getElementById('btn-save-bien');
    btn.textContent = 'Enregistrement…';
    btn.disabled = true;

    const result = id
      ? await GoogleAPI.update(SHEET, id, data)
      : await GoogleAPI.create(SHEET, data);

    btn.textContent = 'Enregistrer';
    btn.disabled = false;

    if (result.success) {
      UI.closeModal('modal-bien-form');
      UI.toast(id ? 'Bien modifié avec succès.' : 'Bien créé avec succès.', 'success');
      _loadData();
    } else {
      UI.toast('Erreur: ' + result.error, 'error');
    }
  }

  // ── Suppression ──────────────────────────────────────────────
  async function _delete(id) {
    if (!UI.confirm('Supprimer ce bien ? Cette action est irréversible.')) return;
    const result = await GoogleAPI.remove(SHEET, id);
    if (result.success) {
      UI.toast('Bien supprimé.', 'success');
      _loadData();
    } else {
      UI.toast('Erreur: ' + result.error, 'error');
    }
  }

  // ── Bind événements ──────────────────────────────────────────
  function _bindEvents() {
    // Recherche
    const searchEl = document.getElementById('bien-search');
    if (searchEl) {
      let timer;
      searchEl.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => { _state.search = e.target.value; _applyFilters(); }, 300);
      });
    }

    // Filtres select
    ['filter-statut','filter-immeuble','filter-type'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        if (id === 'filter-statut')   _state.filterStatut   = el.value;
        if (id === 'filter-immeuble') _state.filterImmeuble = el.value;
        if (id === 'filter-type')     _state.filterType     = el.value;
        _applyFilters();
      });
    });

    // Vues
    document.getElementById('btn-view-grid')?.addEventListener('click', () => { _state.view='grid';  _renderList(); });
    document.getElementById('btn-view-table')?.addEventListener('click', () => { _state.view='table'; _renderList(); });

    // Ajout nouveau
    document.getElementById('btn-add-bien')?.addEventListener('click', () => openEdit(null));

    // Init sheets
    document.getElementById('btn-init-sheets')?.addEventListener('click', async () => {
      const res = await GoogleAPI.initSheets();
      UI.toast(res.success ? 'Feuilles initialisées.' : 'Erreur: '+res.error, res.success?'success':'error');
    });

    // Sauvegarde formulaire
    document.getElementById('btn-save-bien')?.addEventListener('click', _save);

    // Fermeture modales
    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => UI.closeModal(el.dataset.close));
    });

    // Délégation: actions edit/delete dans la liste
    document.getElementById('biens-list-wrap')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.stopPropagation();
      if (btn.dataset.action === 'edit')   openEdit(btn.dataset.id);
      if (btn.dataset.action === 'delete') _delete(btn.dataset.id);
    });
  }

  return { render, openEdit };
})();

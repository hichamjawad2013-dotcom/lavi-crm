// ============================================================
// LAVI CRM V2 — Module Prospects (Pipeline Kanban)
// ============================================================
// S'appuie sur la feuille "Clients" (même source que le module Clients),
// organisée ici par colonne Etape_Pipeline plutôt que par Statut.
// L'édition complète d'une fiche (CIN, adresse, etc.) reste dans le
// module Clients — ce module se concentre sur le suivi du pipeline.

const ModuleProspects = (() => {

  const SHEET  = LAVI_CONFIG.SHEETS.CLIENTS;
  const ETAPES = LAVI_CONFIG.ETAPES_PIPELINE;

  const STAGE_COLORS = {
    'Nouveau contact':     '#8A7D6B',
    'Qualifié':            '#1565C0',
    'Visite programmée':   '#6A4FB6',
    'Offre / Négociation': '#B8860B',
    'Gagné':               '#2E7D32',
    'Perdu':               '#C62828',
  };

  let _state = {
    records: [],
    filterCommercial: '',
    search: '',
    dragId: null,
  };

  // ── Rendu principal ─────────────────────────────────────────
  function render() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div id="prospects-module">
        <div class="module-header" style="margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <h1 style="font-size:22px; font-weight:800; color:var(--navy);">Pipeline Prospects</h1>
            <p style="font-size:13px; color:var(--muted); margin-top:2px;">Suivi commercial — Programme LAVI</p>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" id="btn-migrate-pipeline" title="À exécuter une seule fois si la colonne Etape_Pipeline n'existe pas encore">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              Init. pipeline
            </button>
            <button class="btn btn-gold" id="btn-add-prospect">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nouveau prospect
            </button>
          </div>
        </div>

        <div class="kpi-grid" id="prospects-kpis">
          ${_kpiSkeleton()}
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div class="card-body" style="padding:14px 20px;">
            <div class="filter-bar">
              <div class="search-input">
                <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="prospect-search" placeholder="Nom, téléphone, commercial…" value="${_state.search}">
              </div>
              <select id="filter-prospect-commercial" class="form-control" style="width:auto; min-width:150px;">
                <option value="">Tous les commerciaux</option>
              </select>
            </div>
          </div>
        </div>

        <div id="kanban-wrap" style="overflow-x:auto; padding-bottom:8px; position:relative; min-height:200px;">
          <div id="kanban-board" style="display:flex; gap:14px; min-width:${ETAPES.length * 250}px;"></div>
        </div>
      </div>

      ${_modalFormHTML()}
    `;

    _bindEvents();
    _loadData();
  }

  // ── Chargement ───────────────────────────────────────────────
  async function _loadData() {
    UI.setLoading('kanban-wrap', true);
    const result = await GoogleAPI.read(SHEET);
    UI.setLoading('kanban-wrap', false);

    if (!result.success) {
      document.getElementById('kanban-board').innerHTML = UI.emptyState('⚠️', 'Erreur de chargement', result.error);
      UI.toast('Erreur: ' + result.error, 'error');
      return;
    }

    _state.records = result.records || [];
    _populateCommerciaux();
    _renderKPIs();
    _renderBoard();
  }

  function _populateCommerciaux() {
    const sel = document.getElementById('filter-prospect-commercial');
    if (!sel) return;
    const existing = new Set(Array.from(sel.options).map(o => o.value));
    const commerciaux = [...new Set(_state.records.map(r => r.Commercial).filter(Boolean))].sort();
    commerciaux.forEach(c => {
      if (existing.has(c)) return;
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      if (_state.filterCommercial === c) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // ── Filtrage (recherche + commercial) ─────────────────────────
  function _filteredRecords() {
    let data = [..._state.records];
    if (_state.search) {
      const q = _state.search.toLowerCase();
      data = data.filter(r =>
        (r.Nom || '').toLowerCase().includes(q) ||
        (r.Prenom || '').toLowerCase().includes(q) ||
        (r.Telephone || '').toLowerCase().includes(q) ||
        (r.Commercial || '').toLowerCase().includes(q)
      );
    }
    if (_state.filterCommercial) data = data.filter(r => r.Commercial === _state.filterCommercial);
    return data;
  }

  function _stageOf(record) {
    return ETAPES.includes(record.Etape_Pipeline) ? record.Etape_Pipeline : ETAPES[0];
  }

  // ── KPIs ─────────────────────────────────────────────────────
  function _kpiSkeleton() {
    return ETAPES.map(e => `
      <div class="kpi-card">
        <div class="kpi-label">${e}</div>
        <div class="kpi-value">—</div>
      </div>`).join('');
  }

  function _renderKPIs() {
    const data = _filteredRecords();
    document.getElementById('prospects-kpis').innerHTML = ETAPES.map(e => {
      const count = data.filter(r => _stageOf(r) === e).length;
      return `<div class="kpi-card">
        <div class="kpi-label">${e}</div>
        <div class="kpi-value" style="color:${STAGE_COLORS[e]}">${count}</div>
      </div>`;
    }).join('');
  }

  // ── Colonnes Kanban ────────────────────────────────────────────
  function _renderBoard() {
    const board = document.getElementById('kanban-board');
    if (!board) return;
    const data = _filteredRecords();

    board.innerHTML = ETAPES.map(etape => {
      const cards = data.filter(r => _stageOf(r) === etape);
      return `
        <div class="kanban-column" style="flex:1; min-width:230px; background:#FAF7F2; border-radius:8px; border:1px solid #D9C9A8; display:flex; flex-direction:column;">
          <div style="padding:10px 12px; border-bottom:2px solid ${STAGE_COLORS[etape]}; display:flex; align-items:center; justify-content:space-between;">
            <span style="font-size:12px; font-weight:700; color:var(--navy); line-height:1.3;">${etape}</span>
            <span style="font-size:11px; font-weight:700; color:${STAGE_COLORS[etape]}; background:#fff; border-radius:10px; padding:1px 8px; flex-shrink:0; margin-left:6px;">${cards.length}</span>
          </div>
          <div class="kanban-dropzone" data-stage="${etape}" style="flex:1; padding:10px; display:flex; flex-direction:column; gap:8px; min-height:140px; transition:background 0.15s;">
            ${cards.length ? cards.map(_cardHTML).join('') : `<div style="font-size:11px; color:var(--muted); text-align:center; padding:20px 4px;">Aucun prospect</div>`}
          </div>
        </div>`;
    }).join('');

    _bindDragAndDrop();
    _bindCardClicks();
  }

  function _cardHTML(c) {
    const relance = c.Prochaine_Relance ? _relanceInfo(c.Prochaine_Relance) : null;
    return `
      <div class="kanban-card" draggable="true" data-id="${c.ID}"
        style="background:#fff; border:1px solid #D9C9A8; border-left:3px solid ${STAGE_COLORS[_stageOf(c)]}; border-radius:6px; padding:10px; cursor:grab; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
        <div style="font-size:13px; font-weight:700; color:var(--navy);">${c.Prenom || ''} ${c.Nom || ''}</div>
        <div style="font-size:11px; color:var(--muted); margin-top:3px;">${c.Telephone || '—'}</div>
        ${c.Type_Recherche ? `<div style="font-size:11px; color:var(--muted); margin-top:2px;">${c.Type_Recherche}${c.Budget_Max ? ' · ' + _formatBudget(c.Budget_Max) + ' DH' : ''}</div>` : ''}
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:8px; gap:6px;">
          <span style="font-size:10.5px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c.Commercial || '—'}</span>
          ${relance ? `<span style="font-size:10px; font-weight:700; padding:1px 6px; border-radius:3px; white-space:nowrap; background:${relance.urgent ? '#FDECEA' : '#EEF2F6'}; color:${relance.urgent ? '#C62828' : '#455A64'};">${relance.label}</span>` : ''}
        </div>
      </div>`;
  }

  function _relanceInfo(dateStr) {
    let d;
    if (typeof dateStr === 'string' && dateStr.includes('/')) {
      const [day, m, y] = dateStr.split('/');
      d = new Date(`${y}-${m}-${day}`);
    } else {
      d = new Date(dateStr);
    }
    if (isNaN(d)) return null;
    const now = new Date();
    const diff = Math.round((d - now) / (1000 * 60 * 60 * 24));
    const urgent = diff <= 0;
    let label;
    if (diff < 0) label = `Retard ${Math.abs(diff)}j`;
    else if (diff === 0) label = "Aujourd'hui";
    else if (diff === 1) label = 'Demain';
    else label = `Dans ${diff}j`;
    return { label, urgent };
  }

  function _formatBudget(val) {
    const n = Number(val);
    if (!n) return '—';
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
    return n.toLocaleString('fr-MA');
  }

  // ── Glisser-déposer entre colonnes ─────────────────────────────
  function _bindDragAndDrop() {
    document.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        _state.dragId = card.dataset.id;
        card.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => { card.style.opacity = '1'; });
    });

    document.querySelectorAll('.kanban-dropzone').forEach(zone => {
      zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.style.background = 'rgba(200,169,110,0.15)';
      });
      zone.addEventListener('dragleave', () => { zone.style.background = ''; });
      zone.addEventListener('drop', async e => {
        e.preventDefault();
        zone.style.background = '';
        const newStage = zone.dataset.stage;
        const id = _state.dragId;
        _state.dragId = null;
        if (!id) return;

        const record = _state.records.find(r => r.ID === id);
        if (!record || _stageOf(record) === newStage) return;

        const previousStage = _stageOf(record);
        record.Etape_Pipeline = newStage; // mise à jour optimiste
        _renderKPIs();
        _renderBoard();

        const result = await GoogleAPI.update(SHEET, id, { Etape_Pipeline: newStage });
        if (result.success) {
          UI.toast(`${record.Prenom || ''} ${record.Nom || ''} → ${newStage}`, 'success');
        } else {
          record.Etape_Pipeline = previousStage; // rollback
          UI.toast('Erreur: ' + result.error, 'error');
          _renderKPIs();
          _renderBoard();
        }
      });
    });
  }

  function _bindCardClicks() {
    document.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('click', () => _openForm(card.dataset.id));
    });
  }

  // ── Modale rapide (créer / éditer un prospect) ─────────────────
  function _modalFormHTML() {
    return `
      <div class="modal-overlay" id="modal-prospect-form">
        <div class="modal" style="max-width:480px;">
          <div class="modal-header" style="background:var(--navy);">
            <span class="modal-title" id="modal-prospect-title" style="color:var(--gold);">Nouveau prospect</span>
            <span class="modal-close" data-close="modal-prospect-form" style="color:#fff; cursor:pointer;">&times;</span>
          </div>
          <div class="modal-body">
            <input type="hidden" id="prospect-form-id">
            <div class="form-row" style="display:flex; gap:10px;">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Prénom *</label>
                <input type="text" id="prospect-prenom" class="form-control">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Nom *</label>
                <input type="text" id="prospect-nom" class="form-control">
              </div>
            </div>
            <div class="form-row" style="display:flex; gap:10px;">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Téléphone *</label>
                <input type="text" id="prospect-telephone" class="form-control">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Email</label>
                <input type="email" id="prospect-email" class="form-control">
              </div>
            </div>
            <div class="form-row" style="display:flex; gap:10px;">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Commercial</label>
                <input type="text" id="prospect-commercial" class="form-control">
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Origine</label>
                <select id="prospect-origine" class="form-control">
                  <option value="">—</option>
                  ${LAVI_CONFIG.ORIGINES_CLIENTS.map(o => `<option value="${o}">${o}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-row" style="display:flex; gap:10px;">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Type recherché</label>
                <select id="prospect-type-recherche" class="form-control">
                  <option value="">—</option>
                  ${LAVI_CONFIG.TYPES_BIENS.map(t => `<option value="${t}">${t}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Budget max (DH)</label>
                <input type="number" id="prospect-budget-max" class="form-control">
              </div>
            </div>
            <div class="form-row" style="display:flex; gap:10px;">
              <div class="form-group" style="flex:1;">
                <label class="form-label">Étape du pipeline</label>
                <select id="prospect-etape" class="form-control">
                  ${ETAPES.map(e => `<option value="${e}">${e}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="flex:1;">
                <label class="form-label">Prochaine relance</label>
                <input type="date" id="prospect-relance" class="form-control">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Notes</label>
              <textarea id="prospect-notes" class="form-control" rows="3"></textarea>
            </div>
          </div>
          <div class="modal-footer" style="display:flex; justify-content:space-between; align-items:center;">
            <button class="btn btn-outline btn-sm" id="btn-open-full-fiche" style="display:none;">Voir la fiche complète (module Clients)</button>
            <div style="display:flex; gap:8px; margin-left:auto;">
              <button class="btn btn-outline" data-close="modal-prospect-form">Annuler</button>
              <button class="btn btn-gold" id="btn-save-prospect">Enregistrer</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function _openForm(id) {
    const c = id ? _state.records.find(r => r.ID === id) : null;
    document.getElementById('modal-prospect-title').textContent = c ? `${c.Prenom || ''} ${c.Nom || ''}` : 'Nouveau prospect';
    document.getElementById('prospect-form-id').value = id || '';

    const map = {
      'prenom': 'Prenom', 'nom': 'Nom', 'telephone': 'Telephone', 'email': 'Email',
      'commercial': 'Commercial', 'origine': 'Origine', 'type-recherche': 'Type_Recherche',
      'budget-max': 'Budget_Max', 'notes': 'Notes'
    };
    Object.entries(map).forEach(([field, key]) => {
      const el = document.getElementById(`prospect-${field}`);
      if (el) el.value = c ? (c[key] || '') : '';
    });

    document.getElementById('prospect-etape').value = c ? _stageOf(c) : ETAPES[0];

    const relanceEl = document.getElementById('prospect-relance');
    if (c && c.Prochaine_Relance) {
      const v = c.Prochaine_Relance;
      relanceEl.value = (typeof v === 'string' && v.includes('/'))
        ? v.split('/').reverse().join('-')
        : v;
    } else {
      relanceEl.value = '';
    }

    const btnFiche = document.getElementById('btn-open-full-fiche');
    if (c) {
      btnFiche.style.display = '';
      btnFiche.onclick = () => { UI.closeModal('modal-prospect-form'); UI.navigate('clients', id); };
    } else {
      btnFiche.style.display = 'none';
    }

    // Affectation réservée à l'admin (le serveur l'impose de toute façon).
    const commEl = document.getElementById('prospect-commercial');
    if (commEl && !Auth.isAdmin()) {
      commEl.disabled = true;
      commEl.title = "Affectation réservée à l'administrateur";
      commEl.style.background = '#F2EFE9';
    }

    UI.openModal('modal-prospect-form');
  }

  async function _save() {
    const id = document.getElementById('prospect-form-id').value;
    const relanceRaw = document.getElementById('prospect-relance').value;

    const data = {
      Prenom:            document.getElementById('prospect-prenom').value.trim(),
      Nom:               document.getElementById('prospect-nom').value.trim().toUpperCase(),
      Telephone:         document.getElementById('prospect-telephone').value.trim(),
      Email:             document.getElementById('prospect-email').value.trim(),
      Commercial:        document.getElementById('prospect-commercial').value.trim(),
      Origine:           document.getElementById('prospect-origine').value,
      Type_Recherche:    document.getElementById('prospect-type-recherche').value,
      Budget_Max:        document.getElementById('prospect-budget-max').value,
      Etape_Pipeline:    document.getElementById('prospect-etape').value,
      Prochaine_Relance: relanceRaw ? relanceRaw.split('-').reverse().join('/') : '',
      Notes:             document.getElementById('prospect-notes').value.trim(),
    };

    if (!data.Prenom || !data.Nom || !data.Telephone) {
      UI.toast('Veuillez remplir les champs obligatoires (Prénom, Nom, Téléphone).', 'error');
      return;
    }

    if (!id) data.Statut = 'Prospect'; // valeur par défaut à la création uniquement

    const btn = document.getElementById('btn-save-prospect');
    btn.textContent = 'Enregistrement…';
    btn.disabled = true;

    const result = id
      ? await GoogleAPI.update(SHEET, id, data)
      : await GoogleAPI.create(SHEET, data);

    btn.textContent = 'Enregistrer';
    btn.disabled = false;

    if (result.success) {
      UI.closeModal('modal-prospect-form');
      UI.toast(id ? 'Prospect mis à jour.' : 'Prospect créé.', 'success');
      _loadData();
    } else {
      UI.toast('Erreur: ' + result.error, 'error');
    }
  }

  // ── Bind événements ──────────────────────────────────────────
  function _bindEvents() {
    const searchEl = document.getElementById('prospect-search');
    if (searchEl) {
      let timer;
      searchEl.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => { _state.search = e.target.value; _renderKPIs(); _renderBoard(); }, 300);
      });
    }

    document.getElementById('filter-prospect-commercial')?.addEventListener('change', e => {
      _state.filterCommercial = e.target.value;
      _renderKPIs();
      _renderBoard();
    });

    document.getElementById('btn-add-prospect')?.addEventListener('click', () => _openForm(null));
    document.getElementById('btn-save-prospect')?.addEventListener('click', _save);

    document.getElementById('btn-migrate-pipeline')?.addEventListener('click', async () => {
      const res = await GoogleAPI.migratePipeline();
      if (res.success) {
        UI.toast(`Pipeline initialisé (${res.migrated || 0} fiche(s) mise(s) à jour).`, 'success');
        _loadData();
      } else {
        UI.toast('Erreur: ' + res.error, 'error');
      }
    });

    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => UI.closeModal(el.dataset.close));
    });
  }

  return { render };
})();

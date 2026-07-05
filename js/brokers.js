// ============================================================
// LAVI CRM V2 — Module Brokers
// ============================================================
// CRUD des apporteurs d'affaires + calcul automatique des commissions
// à partir des contrats signés (champ Broker sur la feuille Contrats).

const ModuleBrokers = (() => {

  const SHEET = LAVI_CONFIG.SHEETS.BROKERS;
  const SHEET_CONTRATS = LAVI_CONFIG.SHEETS.CONTRATS;
  const PER_PAGE = 12;

  let _state = {
    records: [],
    contrats: [],
    filtered: [],
    page: 1,
    search: '',
  };

  function render() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div id="brokers-module">
        <div class="module-header" style="margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <h1 style="font-size:22px; font-weight:800; color:var(--navy);">Brokers &amp; commissions</h1>
            <p style="font-size:13px; color:var(--muted); margin-top:2px;">Apporteurs d'affaires — Programme LAVI</p>
          </div>
          <button class="btn btn-gold" id="btn-add-broker">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nouveau broker
          </button>
        </div>

        <div class="kpi-grid" id="brokers-kpis">${_kpiSkeleton()}</div>

        <div class="card" style="margin-bottom:16px;">
          <div class="card-body" style="padding:14px 20px;">
            <div class="filter-bar">
              <div class="search-input">
                <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="broker-search" placeholder="Rechercher un broker (nom, société…)" value="${_state.search}">
              </div>
            </div>
          </div>
        </div>

        <div id="brokers-list-wrap"></div>
      </div>

      ${_modalFormHTML()}
    `;
    _bindEvents();
    _loadData();
  }

  async function _loadData() {
    UI.setLoading('brokers-list-wrap', true);
    const [resB, resC] = await Promise.all([
      GoogleAPI.read(SHEET),
      GoogleAPI.read(SHEET_CONTRATS),
    ]);
    UI.setLoading('brokers-list-wrap', false);
    if (!resB.success) {
      document.getElementById('brokers-list-wrap').innerHTML = UI.emptyState('⚠️', 'Erreur de chargement', resB.error);
      UI.toast('Erreur: ' + resB.error, 'error');
      return;
    }
    _state.records = resB.records || [];
    _state.contrats = resC.success ? (resC.records || []) : [];
    _applyFilters();
    _renderKPIs();
  }

  // ── Stats live d'un broker à partir des contrats signés ──────
  function _brokerStats(b) {
    const fullName = `${b.Nom||''} ${b.Prenom||''}`.trim().toLowerCase();
    const nom = (b.Nom||'').trim().toLowerCase();
    const signes = _state.contrats.filter(c => {
      if (c.Etat !== 'Signé') return false;
      const brk = (c.Broker||'').trim().toLowerCase();
      return brk && (brk === fullName || brk === nom || (nom && brk.includes(nom)));
    });
    const ca = signes.reduce((s,c) => s + (Number(c.Prix_Vente)||0), 0);
    // Commission : % du contrat s'il est renseigné, sinon % par défaut du broker
    const commission = signes.reduce((s,c) => {
      const pct = Number(c.Commission_Pct) || Number(b.Commission_Defaut_Pct) || 0;
      return s + (Number(c.Prix_Vente)||0) * pct / 100;
    }, 0);
    return { nbVentes: signes.length, ca, commission };
  }

  function _applyFilters() {
    let data = [..._state.records];
    if (_state.search) {
      const q = _state.search.toLowerCase();
      data = data.filter(r =>
        (r.Nom||'').toLowerCase().includes(q) ||
        (r.Prenom||'').toLowerCase().includes(q) ||
        (r.Societe||'').toLowerCase().includes(q) ||
        (r.Telephone||'').toLowerCase().includes(q)
      );
    }
    _state.filtered = data;
    _state.page = 1;
    _renderList();
  }

  function _kpiSkeleton() {
    return ['Brokers','Ventes apportées','CA généré','Commissions dues'].map(l => `
      <div class="kpi-card"><div class="kpi-label">${l}</div><div class="kpi-value">—</div></div>`).join('');
  }

  function _renderKPIs() {
    let nbVentes = 0, ca = 0, comDue = 0, comPayee = 0;
    _state.records.forEach(b => {
      const st = _brokerStats(b);
      nbVentes += st.nbVentes; ca += st.ca; comDue += st.commission;
      comPayee += Number(b.Commission_Payee) || 0;
    });
    const restante = Math.max(0, comDue - comPayee);
    const kpis = [
      { label: 'Brokers',          value: _state.records.length },
      { label: 'Ventes apportées', value: nbVentes, color: '#1565C0' },
      { label: 'CA généré',        value: UI.formatPrice(ca), small: true },
      { label: 'Commissions dues', value: UI.formatPrice(restante), color: '#B8860B', small: true },
    ];
    document.getElementById('brokers-kpis').innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value" style="${k.color?`color:${k.color};`:''}${k.small?'font-size:17px;':''}">${k.value}</div>
      </div>`).join('');
  }

  function _renderList() {
    const wrap = document.getElementById('brokers-list-wrap');
    if (!wrap) return;
    const data  = _state.filtered;
    const total = data.length;
    const pages = Math.ceil(total / PER_PAGE);
    const page  = _state.page;
    const slice = data.slice((page-1)*PER_PAGE, page*PER_PAGE);

    if (total === 0) {
      wrap.innerHTML = `<div class="card">${UI.emptyState('🤝', 'Aucun broker', 'Ajoutez un apporteur d\'affaires pour suivre ses commissions.')}</div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="card">
        <div class="table-wrap">
          <table class="lavi-table">
            <thead>
              <tr>
                <th>Broker</th>
                <th>Société</th>
                <th>Contact</th>
                <th>% défaut</th>
                <th>Ventes</th>
                <th>CA généré</th>
                <th>Commission due</th>
                <th>Payée</th>
                <th>Reste</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${slice.map(b => {
                const st = _brokerStats(b);
                const payee = Number(b.Commission_Payee) || 0;
                const reste = Math.max(0, st.commission - payee);
                return `
                <tr data-broker-id="${b.ID}">
                  <td><strong style="color:var(--navy);">${b.Nom||''} ${b.Prenom||''}</strong></td>
                  <td>${b.Societe||'—'}</td>
                  <td>${b.Telephone||'—'}${b.Email?`<br><span style="font-size:11px; color:var(--muted);">${b.Email}</span>`:''}</td>
                  <td>${b.Commission_Defaut_Pct?b.Commission_Defaut_Pct+'%':'—'}</td>
                  <td style="text-align:center; font-weight:700;">${st.nbVentes}</td>
                  <td style="font-family:var(--font-num);">${UI.formatPrice(st.ca)}</td>
                  <td style="font-family:var(--font-num); font-weight:600;">${UI.formatPrice(st.commission)}</td>
                  <td style="font-family:var(--font-num); color:#2E7D52;">${UI.formatPrice(payee)}</td>
                  <td style="font-family:var(--font-num); font-weight:700; color:${reste>0?'#B8860B':'var(--muted)'};">${UI.formatPrice(reste)}</td>
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
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${UI.paginationHTML(page, pages, PER_PAGE, total)}
      </div>`;

    wrap.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => { _state.page = parseInt(btn.dataset.page); _renderList(); });
    });
  }

  function _modalFormHTML() {
    return `
    <div class="modal-overlay" id="modal-broker-form">
      <div class="modal" style="max-width:640px;">
        <div class="modal-header">
          <h3 id="modal-broker-title">Nouveau broker</h3>
          <span class="modal-close" data-close="modal-broker-form">✕</span>
        </div>
        <div class="modal-body">
          <input type="hidden" id="broker-form-id">
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Nom *</label>
              <input class="form-control" id="broker-nom" placeholder="Nom">
            </div>
            <div class="form-group">
              <label class="form-label">Prénom</label>
              <input class="form-control" id="broker-prenom" placeholder="Prénom">
            </div>
          </div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Téléphone</label>
              <input class="form-control" id="broker-telephone" placeholder="06 …">
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-control" id="broker-email" type="email" placeholder="email@…">
            </div>
          </div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Société</label>
              <input class="form-control" id="broker-societe" placeholder="Société / agence">
            </div>
            <div class="form-group">
              <label class="form-label">Commission par défaut (%)</label>
              <input class="form-control" id="broker-commission-defaut" type="number" min="0" max="100" step="0.5" placeholder="Ex: 2.5">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Commission déjà payée (DH)</label>
            <input class="form-control" id="broker-commission-payee" type="number" min="0" placeholder="0">
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea class="form-control" id="broker-notes" placeholder="Remarques…"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-close="modal-broker-form">Annuler</button>
          <button class="btn btn-gold" id="btn-save-broker">Enregistrer</button>
        </div>
      </div>
    </div>`;
  }

  function openEdit(id) {
    const b = id ? _state.records.find(r => String(r.ID) === String(id)) : null;
    document.getElementById('modal-broker-title').textContent = b ? `Modifier — ${b.Nom||''} ${b.Prenom||''}` : 'Nouveau broker';
    document.getElementById('broker-form-id').value = id || '';
    const g = f => document.getElementById('broker-'+f);
    g('nom').value                = b ? (b.Nom||'') : '';
    g('prenom').value             = b ? (b.Prenom||'') : '';
    g('telephone').value          = b ? (b.Telephone||'') : '';
    g('email').value              = b ? (b.Email||'') : '';
    g('societe').value            = b ? (b.Societe||'') : '';
    g('commission-defaut').value  = b ? (b.Commission_Defaut_Pct||'') : '';
    g('commission-payee').value   = b ? (b.Commission_Payee||'') : '';
    g('notes').value              = b ? (b.Notes||'') : '';
    UI.openModal('modal-broker-form');
  }

  async function _save() {
    const id = document.getElementById('broker-form-id').value;
    const g = f => document.getElementById('broker-'+f);
    const data = {
      Nom:                   g('nom').value.trim(),
      Prenom:                g('prenom').value.trim(),
      Telephone:             g('telephone').value.trim(),
      Email:                 g('email').value.trim(),
      Societe:               g('societe').value.trim(),
      Commission_Defaut_Pct: g('commission-defaut').value,
      Commission_Payee:      g('commission-payee').value,
      Notes:                 g('notes').value.trim(),
    };
    if (!data.Nom) { UI.toast('Le nom du broker est obligatoire.', 'error'); return; }
    const btn = document.getElementById('btn-save-broker');
    btn.textContent = 'Enregistrement…'; btn.disabled = true;
    const res = id ? await GoogleAPI.update(SHEET, id, data) : await GoogleAPI.create(SHEET, data);
    btn.textContent = 'Enregistrer'; btn.disabled = false;
    if (res.success) {
      UI.closeModal('modal-broker-form');
      UI.toast(id ? 'Broker modifié.' : 'Broker créé.', 'success');
      _loadData();
    } else {
      UI.toast('Erreur: ' + res.error, 'error');
    }
  }

  async function _delete(id) {
    const b = _state.records.find(r => String(r.ID) === String(id));
    if (!UI.confirm(`Supprimer le broker ${b?.Nom||id} ? Action irréversible.`)) return;
    const res = await GoogleAPI.remove(SHEET, id);
    UI.toast(res.success ? 'Broker supprimé.' : 'Erreur: ' + res.error, res.success?'success':'error');
    if (res.success) _loadData();
  }

  function _bindEvents() {
    const searchEl = document.getElementById('broker-search');
    if (searchEl) {
      let timer;
      searchEl.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => { _state.search = e.target.value; _applyFilters(); }, 300);
      });
    }
    document.getElementById('btn-add-broker')?.addEventListener('click', () => openEdit(null));
    document.getElementById('btn-save-broker')?.addEventListener('click', _save);
    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => UI.closeModal(el.dataset.close));
    });
    document.getElementById('brokers-list-wrap')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'edit')   openEdit(btn.dataset.id);
      if (btn.dataset.action === 'delete') _delete(btn.dataset.id);
    });
  }

  return { render, openEdit };
})();

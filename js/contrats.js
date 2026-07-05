// ============================================================
// LAVI CRM V2 — Module Contrats
// ============================================================

const ModuleContrats = (() => {

  const SHEET      = LAVI_CONFIG.SHEETS.CONTRATS;
  const SHEET_PAIE = LAVI_CONFIG.SHEETS.PAIEMENTS;
  const SHEET_BIENS   = LAVI_CONFIG.SHEETS.BIENS;
  const SHEET_CLIENTS = LAVI_CONFIG.SHEETS.CLIENTS;
  const PER_PAGE = 12;

  let _state = {
    records: [],
    filtered: [],
    biens: [],       // référentiel biens (pour l'autofill)
    clients: [],     // référentiel clients (pour le select)
    page: 1,
    filterEtat: '',
    search: '',
    selectedId: null,
  };

  // ── Rendu principal ─────────────────────────────────────────
  function render() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div id="contrats-module">
        <div class="module-header" style="margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <h1 style="font-size:22px; font-weight:800; color:var(--navy);">Contrats de vente</h1>
            <p style="font-size:13px; color:var(--muted); margin-top:2px;">Programme LAVI — Domaine d'Anfa, Casablanca</p>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-gold" id="btn-add-contrat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nouveau contrat
            </button>
          </div>
        </div>

        <!-- KPIs -->
        <div class="kpi-grid" id="contrats-kpis">${_kpiSkeleton()}</div>

        <!-- Filtres -->
        <div class="card" style="margin-bottom:16px;">
          <div class="card-body" style="padding:14px 20px;">
            <div class="filter-bar">
              <div class="search-input">
                <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="contrat-search" placeholder="Rechercher (réf, bien, client…)" value="${_state.search}">
              </div>
              <select id="filter-etat" class="form-control" style="width:auto; min-width:150px;">
                <option value="">Tous les états</option>
                ${LAVI_CONFIG.STATUTS_CONTRATS.map(s => `<option value="${s}" ${_state.filterEtat===s?'selected':''}>${s}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <!-- Liste -->
        <div id="contrats-list-wrap"></div>
      </div>

      ${_modalFormHTML()}
      ${_modalDetailHTML()}
      ${_modalEcheancierHTML()}
    `;

    _bindEvents();
    _loadData();
  }

  // ── Chargement des données ───────────────────────────────────
  async function _loadData() {
    UI.setLoading('contrats-list-wrap', true);
    const [resC, resB, resCl] = await Promise.all([
      GoogleAPI.read(SHEET),
      GoogleAPI.read(SHEET_BIENS),
      GoogleAPI.read(SHEET_CLIENTS),
    ]);
    UI.setLoading('contrats-list-wrap', false);

    if (!resC.success) {
      document.getElementById('contrats-list-wrap').innerHTML =
        UI.emptyState('⚠️', 'Erreur de chargement', resC.error);
      UI.toast('Erreur: ' + resC.error, 'error');
      return;
    }

    _state.records = resC.records || [];
    _state.biens   = resB.success ? (resB.records || []) : [];
    _state.clients = resCl.success ? (resCl.records || []) : [];
    _applyFilters();
    _renderKPIs();
  }

  // ── Filtrage ─────────────────────────────────────────────────
  function _applyFilters() {
    let data = [..._state.records];
    if (_state.search) {
      const q = _state.search.toLowerCase();
      data = data.filter(r =>
        (r.Reference||'').toLowerCase().includes(q) ||
        (r.Code_Bien||'').toLowerCase().includes(q) ||
        (r.Client_Nom||'').toLowerCase().includes(q) ||
        (r.Client_CIN||'').toLowerCase().includes(q)
      );
    }
    if (_state.filterEtat) data = data.filter(r => r.Etat === _state.filterEtat);

    // Tri : plus récents d'abord (par date de contrat, fallback création)
    data.sort((a, b) => (_parseDate(b.Date_Contrat) || _parseDate(b.Date_Creation) || 0) -
                        (_parseDate(a.Date_Contrat) || _parseDate(a.Date_Creation) || 0));

    _state.filtered = data;
    _state.page = 1;
    _renderList();
  }

  // ── KPIs ─────────────────────────────────────────────────────
  function _kpiSkeleton() {
    return ['Total','En cours','Signés','CA signé'].map(l => `
      <div class="kpi-card"><div class="kpi-label">${l}</div><div class="kpi-value">—</div></div>`).join('');
  }

  function _renderKPIs() {
    const r = _state.records;
    const signes = r.filter(c => c.Etat === 'Signé');
    const caSigne = signes.reduce((s, c) => s + (Number(c.Prix_Vente) || 0), 0);
    const kpis = [
      { label: 'Total contrats', value: r.length },
      { label: 'En cours',       value: r.filter(c=>c.Etat==='En cours').length, color: '#1565C0' },
      { label: 'Signés',         value: signes.length,                            color: '#2E7D52' },
      { label: 'CA signé',       value: UI.formatPrice(caSigne),                  small: true },
    ];
    document.getElementById('contrats-kpis').innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value" style="${k.color?`color:${k.color};`:''}${k.small?'font-size:18px;':''}">${k.value}</div>
      </div>`).join('');
  }

  // ── Rendu liste ──────────────────────────────────────────────
  function _renderList() {
    const wrap = document.getElementById('contrats-list-wrap');
    if (!wrap) return;

    const data  = _state.filtered;
    const total = data.length;
    const pages = Math.ceil(total / PER_PAGE);
    const page  = _state.page;
    const slice = data.slice((page-1)*PER_PAGE, page*PER_PAGE);

    if (total === 0) {
      wrap.innerHTML = `<div class="card">${UI.emptyState('📄', 'Aucun contrat', 'Créez un nouveau contrat pour démarrer une vente.')}</div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="card">
        <div class="table-wrap">
          <table class="lavi-table">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Bien</th>
                <th>Client</th>
                <th>Prix de vente</th>
                <th>Date contrat</th>
                <th>État</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${slice.map(c => `
                <tr data-contrat-id="${c.ID}" style="cursor:pointer;">
                  <td><strong style="color:var(--navy);">${c.Reference||c.ID}</strong></td>
                  <td>${c.Code_Bien||'—'}</td>
                  <td>${c.Client_Nom||'—'}</td>
                  <td style="font-family:var(--font-num); font-weight:600;">${UI.formatPrice(c.Prix_Vente)}</td>
                  <td>${UI.formatDate(c.Date_Contrat)}</td>
                  <td>${UI.badge(c.Etat)}</td>
                  <td>
                    <div class="td-actions">
                      <button class="btn-icon btn-sm" title="Modifier" data-action="edit" data-id="${c.ID}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="btn-icon btn-sm" title="Supprimer" data-action="delete" data-id="${c.ID}" style="color:var(--danger);">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${UI.paginationHTML(page, pages, PER_PAGE, total)}
      </div>`;

    wrap.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => { _state.page = parseInt(btn.dataset.page); _renderList(); });
    });
    wrap.querySelectorAll('[data-contrat-id]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (!e.target.closest('.btn') && !e.target.closest('[data-action]')) _openDetail(el.dataset.contratId);
      });
    });
  }

  // ── Modale formulaire HTML ───────────────────────────────────
  function _modalFormHTML() {
    return `
    <div class="modal-overlay" id="modal-contrat-form">
      <div class="modal" style="max-width:760px;">
        <div class="modal-header">
          <h3 id="modal-contrat-title">Nouveau contrat</h3>
          <span class="modal-close" data-close="modal-contrat-form">✕</span>
        </div>
        <div class="modal-body">
          <input type="hidden" id="contrat-form-id">

          <div class="detail-section-title">Bien &amp; client</div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Bien concerné *</label>
              <select class="form-control" id="contrat-bien"><option value="">— Sélectionner un bien —</option></select>
            </div>
            <div class="form-group">
              <label class="form-label">Client *</label>
              <select class="form-control" id="contrat-client"><option value="">— Sélectionner un client —</option></select>
            </div>
          </div>

          <div class="detail-section-title" style="margin-top:8px;">Contrat</div>
          <div class="form-row form-row-3">
            <div class="form-group">
              <label class="form-label">Référence *</label>
              <input class="form-control" id="contrat-reference" placeholder="Ex: LAVI-2026-001">
            </div>
            <div class="form-group">
              <label class="form-label">Prix de vente (DH) *</label>
              <input class="form-control" id="contrat-prix" type="number" min="0" placeholder="Ex: 1850000">
            </div>
            <div class="form-group">
              <label class="form-label">Date du contrat *</label>
              <input class="form-control" id="contrat-date" type="date">
            </div>
          </div>

          <div class="form-row form-row-3">
            <div class="form-group">
              <label class="form-label">Titre foncier (TF)</label>
              <input class="form-control" id="contrat-tf" placeholder="Ex: 12345/C">
            </div>
            <div class="form-group">
              <label class="form-label">Commercial</label>
              <input class="form-control" id="contrat-commercial" placeholder="Nom du commercial">
            </div>
            <div class="form-group">
              <label class="form-label">État *</label>
              <select class="form-control" id="contrat-etat">
                ${LAVI_CONFIG.STATUTS_CONTRATS.map(s=>`<option value="${s}">${s}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="detail-section-title" style="margin-top:8px;">Broker (optionnel)</div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Broker</label>
              <input class="form-control" id="contrat-broker" placeholder="Nom du broker">
            </div>
            <div class="form-group">
              <label class="form-label">Commission broker (%)</label>
              <input class="form-control" id="contrat-commission" type="number" min="0" max="100" step="0.5" placeholder="Ex: 2.5">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea class="form-control" id="contrat-notes" placeholder="Conditions particulières, remarques…"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">URL du contrat PDF (Drive, optionnel)</label>
            <input class="form-control" id="contrat-pdf-url" placeholder="https://drive.google.com/…">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-close="modal-contrat-form">Annuler</button>
          <button class="btn btn-gold" id="btn-save-contrat">Enregistrer</button>
        </div>
      </div>
    </div>`;
  }

  // ── Modale détail HTML ───────────────────────────────────────
  function _modalDetailHTML() {
    return `
    <div class="modal-overlay" id="modal-contrat-detail">
      <div class="modal" style="max-width:820px;">
        <div class="modal-header">
          <h3 id="detail-contrat-title">Fiche contrat</h3>
          <span class="modal-close" data-close="modal-contrat-detail">✕</span>
        </div>
        <div class="modal-body" id="detail-contrat-body"></div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-close="modal-contrat-detail">Fermer</button>
          <button class="btn btn-primary" id="btn-edit-from-detail-contrat">Modifier</button>
        </div>
      </div>
    </div>`;
  }

  // ── Modale échéancier HTML ───────────────────────────────────
  function _modalEcheancierHTML() {
    return `
    <div class="modal-overlay" id="modal-echeancier">
      <div class="modal" style="max-width:640px;">
        <div class="modal-header">
          <h3>Générer l'échéancier de paiement</h3>
          <span class="modal-close" data-close="modal-echeancier">✕</span>
        </div>
        <div class="modal-body">
          <input type="hidden" id="echeancier-contrat-id">
          <p style="font-size:13px; color:var(--muted); margin-bottom:16px;">
            Répartition des paiements pour le contrat <strong id="echeancier-ref">—</strong>
            (prix total : <strong id="echeancier-prix">—</strong>). Les lignes seront créées dans le module Paiements.
          </p>

          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Modèle d'échéancier</label>
              <select class="form-control" id="echeancier-modele">
                <option value="standard">Standard (30% · 30% · 40%)</option>
                <option value="reservation">Réservation (10%) puis 3 tranches (30%·30%·30%)</option>
                <option value="mensuel">Personnalisé — mensualités égales</option>
              </select>
            </div>
            <div class="form-group" id="echeancier-nb-wrap" style="display:none;">
              <label class="form-label">Nombre de mensualités</label>
              <input class="form-control" id="echeancier-nb" type="number" min="2" max="60" value="12">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Date de la 1ère échéance</label>
            <input class="form-control" id="echeancier-date" type="date">
          </div>

          <div class="detail-section-title" style="margin-top:8px;">Aperçu</div>
          <div id="echeancier-preview" class="table-wrap" style="max-height:280px; overflow:auto;"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-close="modal-echeancier">Annuler</button>
          <button class="btn btn-gold" id="btn-save-echeancier">Créer les échéances</button>
        </div>
      </div>
    </div>`;
  }

  // ── Ouverture détail ─────────────────────────────────────────
  function _openDetail(id) {
    const c = _state.records.find(r => r.ID === id);
    if (!c) return;
    _state.selectedId = id;

    document.getElementById('detail-contrat-title').textContent = `Contrat ${c.Reference || id}`;
    const bien = _state.biens.find(b => b.Code === c.Code_Bien);

    document.getElementById('detail-contrat-body').innerHTML = `
      <div style="background:var(--navy); border-radius:var(--radius-lg); padding:16px 20px; margin-bottom:20px; display:flex; align-items:center; justify-content:space-between;">
        <div>
          <div style="font-size:11px; color:rgba(200,169,110,0.6); letter-spacing:0.08em; text-transform:uppercase; margin-bottom:4px;">Référence</div>
          <div style="font-size:22px; font-weight:900; color:var(--gold); letter-spacing:0.04em;">${c.Reference || '—'}</div>
          <div style="font-size:13px; color:rgba(255,255,255,0.7); margin-top:4px;">${c.Client_Nom || '—'} · ${c.Code_Bien || '—'}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px; color:rgba(200,169,110,0.6); letter-spacing:0.08em; text-transform:uppercase; margin-bottom:4px;">Prix de vente</div>
          <div style="font-size:18px; font-weight:800; color:var(--white);">${UI.formatPrice(c.Prix_Vente)}</div>
          <div style="margin-top:8px;">${UI.badge(c.Etat)}</div>
        </div>
      </div>

      <div class="bien-detail-layout">
        <div>
          <div class="detail-section">
            <div class="detail-section-title">Bien</div>
            <div class="detail-row"><span class="dl">Code bien</span><span class="dv">${c.Code_Bien||'—'}</span></div>
            ${bien ? `
              <div class="detail-row"><span class="dl">Immeuble / Appt</span><span class="dv">${bien.Immeuble||'—'} · ${bien.Num_Appt||'—'}</span></div>
              <div class="detail-row"><span class="dl">Type / Surface</span><span class="dv">${bien.Type||'—'} · ${bien.Surface?bien.Surface+' m²':'—'}</span></div>` : ''}
            <div class="detail-row"><span class="dl">Titre foncier</span><span class="dv">${c.TF||'—'}</span></div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">Client</div>
            <div class="detail-row"><span class="dl">Nom</span><span class="dv">${c.Client_Nom||'—'}</span></div>
            <div class="detail-row"><span class="dl">CIN</span><span class="dv">${c.Client_CIN||'—'}</span></div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">Contrat</div>
            <div class="detail-row"><span class="dl">Date du contrat</span><span class="dv">${UI.formatDate(c.Date_Contrat)}</span></div>
            <div class="detail-row"><span class="dl">Commercial</span><span class="dv">${c.Commercial||'—'}</span></div>
            ${c.Broker ? `<div class="detail-row"><span class="dl">Broker</span><span class="dv">${c.Broker} ${c.Commission_Pct?'('+c.Commission_Pct+'%)':''}</span></div>` : ''}
            <div class="detail-row"><span class="dl">État</span><span class="dv">${UI.badge(c.Etat)}</span></div>
          </div>

          ${c.Notes ? `<div class="detail-section"><div class="detail-section-title">Notes</div>
            <p style="font-size:13px; color:var(--body-text); line-height:1.6;">${c.Notes}</p></div>` : ''}
        </div>

        <div>
          <div class="card" style="margin-bottom:16px;">
            <div class="card-header" style="background:var(--navy);"><span class="card-title" style="color:var(--gold);">Actions rapides</span></div>
            <div class="card-body" style="display:flex; flex-direction:column; gap:8px; padding:14px;">
              <button class="btn btn-outline" style="justify-content:flex-start; font-size:13px;" onclick="ModuleContrats.openEdit('${c.ID}'); UI.closeModal('modal-contrat-detail');">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Modifier
              </button>
              <button class="btn btn-outline" style="justify-content:flex-start; font-size:13px;" onclick="ModuleContrats.printContrat('${c.ID}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Imprimer / PDF
              </button>
              <button class="btn btn-outline" style="justify-content:flex-start; font-size:13px; color:var(--navy);" onclick="ModuleContrats.openEcheancier('${c.ID}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                Générer l'échéancier
              </button>
              <button class="btn btn-outline" style="justify-content:flex-start; font-size:13px; color:#1EBE5D; border-color:#1EBE5D;" onclick="ModuleContrats.shareWhatsApp('${c.ID}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Partager par WhatsApp
              </button>
            </div>
          </div>

          <div class="card">
            <div class="card-header" style="background:var(--navy);"><span class="card-title" style="color:var(--gold);">Informations système</span></div>
            <div class="card-body" style="padding:14px;">
              <div class="detail-row" style="padding:5px 0; border-bottom:1px solid var(--sand);">
                <span class="dl" style="font-size:10.5px;">ID</span><span class="dv" style="font-size:11px; color:var(--muted);">${c.ID}</span>
              </div>
              <div class="detail-row" style="padding:5px 0;">
                <span class="dl" style="font-size:10.5px;">Modifié le</span>
                <span class="dv" style="font-size:11px; color:var(--muted);">${c.Date_Modif ? new Date(c.Date_Modif).toLocaleString('fr-MA') : '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById('btn-edit-from-detail-contrat').onclick = () => {
      UI.closeModal('modal-contrat-detail');
      openEdit(id);
    };
    UI.openModal('modal-contrat-detail');
  }

  // ── Remplissage des selects (biens + clients) ────────────────
  function _fillSelects(selectedBienCode, selectedClientCin) {
    const bienSel = document.getElementById('contrat-bien');
    const cliSel  = document.getElementById('contrat-client');
    if (bienSel) {
      bienSel.innerHTML = '<option value="">— Sélectionner un bien —</option>' +
        _state.biens
          .slice()
          .sort((a,b) => (a.Code||'').localeCompare(b.Code||''))
          .map(b => `<option value="${b.Code}" ${b.Code===selectedBienCode?'selected':''}>${b.Code} — ${b.Immeuble||''} ${b.Num_Appt||''} (${b.Statut||'—'})</option>`).join('');
    }
    if (cliSel) {
      cliSel.innerHTML = '<option value="">— Sélectionner un client —</option>' +
        _state.clients
          .slice()
          .sort((a,b) => (a.Nom||'').localeCompare(b.Nom||''))
          .map(c => `<option value="${c.CIN}" ${c.CIN===selectedClientCin?'selected':''}>${c.Nom||''} ${c.Prenom||''}${c.CIN?' — '+c.CIN:''}</option>`).join('');
    }
  }

  // ── Ouverture formulaire (ajout/édition) ─────────────────────
  function openEdit(id) {
    const c = id ? _state.records.find(r => r.ID === id) : null;
    document.getElementById('modal-contrat-title').textContent = c ? `Modifier — ${c.Reference||id}` : 'Nouveau contrat';
    document.getElementById('contrat-form-id').value = id || '';

    _fillSelects(c ? c.Code_Bien : '', c ? c.Client_CIN : '');

    document.getElementById('contrat-reference').value  = c ? (c.Reference||'') : _suggestReference();
    document.getElementById('contrat-prix').value       = c ? (c.Prix_Vente||'') : '';
    document.getElementById('contrat-date').value       = c ? _toInputDate(c.Date_Contrat) : _today();
    document.getElementById('contrat-tf').value         = c ? (c.TF||'') : '';
    document.getElementById('contrat-commercial').value = c ? (c.Commercial||'') : '';
    document.getElementById('contrat-etat').value       = c ? (c.Etat||'Brouillon') : 'Brouillon';
    document.getElementById('contrat-broker').value     = c ? (c.Broker||'') : '';
    document.getElementById('contrat-commission').value = c ? (c.Commission_Pct||'') : '';
    document.getElementById('contrat-notes').value      = c ? (c.Notes||'') : '';
    document.getElementById('contrat-pdf-url').value    = c ? (c.PDF_URL||'') : '';

    UI.openModal('modal-contrat-form');
  }

  // ── Autofill depuis le bien sélectionné ──────────────────────
  function _onBienChange() {
    const code = document.getElementById('contrat-bien').value;
    const bien = _state.biens.find(b => b.Code === code);
    if (!bien) return;
    const prixEl = document.getElementById('contrat-prix');
    if (prixEl && !prixEl.value && bien.Prix) prixEl.value = bien.Prix;
    const comEl = document.getElementById('contrat-commercial');
    if (comEl && !comEl.value && bien.Commercial) comEl.value = bien.Commercial;
    // Broker / commission depuis le bien s'ils sont vides
    const brkEl = document.getElementById('contrat-broker');
    if (brkEl && !brkEl.value && bien.Broker) brkEl.value = bien.Broker;
    const cmpEl = document.getElementById('contrat-commission');
    if (cmpEl && !cmpEl.value && bien.Commission_Pct) cmpEl.value = bien.Commission_Pct;
    // Client rattaché au bien
    const cliSel = document.getElementById('contrat-client');
    if (cliSel && !cliSel.value && bien.Client_CIN) {
      if ([...cliSel.options].some(o => o.value === bien.Client_CIN)) cliSel.value = bien.Client_CIN;
    }
  }

  // ── Sauvegarde ───────────────────────────────────────────────
  async function _save() {
    const id = document.getElementById('contrat-form-id').value;
    const bienCode = document.getElementById('contrat-bien').value;
    const clientCin = document.getElementById('contrat-client').value;
    const client = _state.clients.find(c => c.CIN === clientCin);

    const data = {
      Reference:      document.getElementById('contrat-reference').value.trim(),
      Code_Bien:      bienCode,
      Client_CIN:     clientCin,
      Client_Nom:     client ? `${client.Nom||''} ${client.Prenom||''}`.trim() : '',
      Commercial:     document.getElementById('contrat-commercial').value.trim(),
      Broker:         document.getElementById('contrat-broker').value.trim(),
      Commission_Pct: document.getElementById('contrat-commission').value,
      Prix_Vente:     document.getElementById('contrat-prix').value,
      Date_Contrat:   _fromInputDate(document.getElementById('contrat-date').value),
      TF:             document.getElementById('contrat-tf').value.trim(),
      Etat:           document.getElementById('contrat-etat').value,
      PDF_URL:        document.getElementById('contrat-pdf-url').value.trim(),
      Notes:          document.getElementById('contrat-notes').value.trim(),
    };

    if (!data.Reference || !data.Code_Bien || !clientCin || !data.Prix_Vente) {
      UI.toast('Champs obligatoires : référence, bien, client et prix de vente.', 'error');
      return;
    }

    const btn = document.getElementById('btn-save-contrat');
    btn.textContent = 'Enregistrement…';
    btn.disabled = true;

    const result = id
      ? await GoogleAPI.update(SHEET, id, data)
      : await GoogleAPI.create(SHEET, data);

    btn.textContent = 'Enregistrer';
    btn.disabled = false;

    if (!result.success) { UI.toast('Erreur: ' + result.error, 'error'); return; }

    UI.closeModal('modal-contrat-form');
    UI.toast(id ? 'Contrat modifié.' : 'Contrat créé.', 'success');

    // Proposer de marquer le bien comme Vendu si contrat signé
    if (data.Etat === 'Signé') await _maybeMarkBienVendu(data.Code_Bien, data.Client_CIN, data.Client_Nom);

    _loadData();
  }

  // ── Marquer le bien "Vendu" après signature ──────────────────
  async function _maybeMarkBienVendu(code, cin, nom) {
    const bien = _state.biens.find(b => b.Code === code);
    if (!bien || bien.Statut === 'Vendu') return;
    if (!UI.confirm(`Le contrat est signé. Marquer le bien ${code} comme « Vendu » ?`)) return;
    const res = await GoogleAPI.update(SHEET_BIENS, bien.ID, {
      Statut: 'Vendu', Client_CIN: cin || bien.Client_CIN, Client_Nom: nom || bien.Client_Nom
    });
    UI.toast(res.success ? `Bien ${code} marqué comme vendu.` : 'Erreur bien: ' + res.error, res.success?'success':'error');
  }

  // ── Suppression ──────────────────────────────────────────────
  async function _delete(id) {
    const c = _state.records.find(r => r.ID === id);
    if (!UI.confirm(`Supprimer le contrat ${c?.Reference||id} ? Action irréversible.`)) return;
    const result = await GoogleAPI.remove(SHEET, id);
    UI.toast(result.success ? 'Contrat supprimé.' : 'Erreur: ' + result.error, result.success?'success':'error');
    if (result.success) _loadData();
  }

  // ============================================================
  // ÉCHÉANCIER — génération des lignes de paiement
  // ============================================================
  function openEcheancier(id) {
    const c = _state.records.find(r => r.ID === id);
    if (!c) return;
    UI.closeModal('modal-contrat-detail');
    document.getElementById('echeancier-contrat-id').value = id;
    document.getElementById('echeancier-ref').textContent  = c.Reference || id;
    document.getElementById('echeancier-prix').textContent = UI.formatPrice(c.Prix_Vente);
    document.getElementById('echeancier-date').value = _today();
    document.getElementById('echeancier-modele').value = 'standard';
    document.getElementById('echeancier-nb-wrap').style.display = 'none';
    _renderEcheancierPreview();
    UI.openModal('modal-echeancier');
  }

  function _buildEcheancier(contrat) {
    const prix = Number(contrat.Prix_Vente) || 0;
    const modele = document.getElementById('echeancier-modele').value;
    const startStr = document.getElementById('echeancier-date').value;
    const start = startStr ? new Date(startStr) : new Date();

    let plan = []; // { libelle, pct }
    if (modele === 'standard') {
      plan = [
        { libelle: 'Signature du contrat', pct: 30 },
        { libelle: 'Gros œuvre',           pct: 30 },
        { libelle: 'Livraison',            pct: 40 },
      ];
    } else if (modele === 'reservation') {
      plan = [
        { libelle: 'Réservation', pct: 10 },
        { libelle: '1ère tranche', pct: 30 },
        { libelle: '2ème tranche', pct: 30 },
        { libelle: 'Solde à la livraison', pct: 30 },
      ];
    } else {
      const nb = Math.max(2, Math.min(60, parseInt(document.getElementById('echeancier-nb').value) || 12));
      const pct = +(100 / nb).toFixed(4);
      plan = Array.from({ length: nb }, (_, i) => ({ libelle: `Mensualité ${i+1}/${nb}`, pct }));
    }

    // Montants — le dernier absorbe l'arrondi pour tomber juste sur le total
    let cumul = 0;
    return plan.map((p, i) => {
      const d = new Date(start.getFullYear(), start.getMonth() + i, start.getDate());
      let montant = Math.round(prix * p.pct / 100);
      if (i === plan.length - 1) montant = prix - cumul;
      cumul += montant;
      return {
        Numero_Echeance: String(i + 1),
        Libelle: p.libelle,
        Pourcentage: p.pct,
        Montant: montant,
        Date_Prevue: _fromDate(d),
      };
    });
  }

  function _renderEcheancierPreview() {
    const id = document.getElementById('echeancier-contrat-id').value;
    const c = _state.records.find(r => r.ID === id);
    if (!c) return;
    const rows = _buildEcheancier(c);
    const total = rows.reduce((s, r) => s + r.Montant, 0);
    document.getElementById('echeancier-preview').innerHTML = `
      <table class="lavi-table">
        <thead><tr><th>#</th><th>Libellé</th><th>%</th><th>Montant</th><th>Échéance</th></tr></thead>
        <tbody>
          ${rows.map(r => `<tr>
            <td>${r.Numero_Echeance}</td>
            <td>${r.Libelle}</td>
            <td>${r.Pourcentage}%</td>
            <td style="font-family:var(--font-num); font-weight:600;">${UI.formatPrice(r.Montant)}</td>
            <td>${UI.formatDate(_parseDate(r.Date_Prevue))}</td>
          </tr>`).join('')}
          <tr style="background:var(--gold-pale); font-weight:800;">
            <td colspan="3">Total</td>
            <td style="font-family:var(--font-num);">${UI.formatPrice(total)}</td><td></td>
          </tr>
        </tbody>
      </table>`;
  }

  async function _saveEcheancier() {
    const id = document.getElementById('echeancier-contrat-id').value;
    const c = _state.records.find(r => r.ID === id);
    if (!c) return;
    const rows = _buildEcheancier(c);

    const btn = document.getElementById('btn-save-echeancier');
    btn.textContent = 'Création…'; btn.disabled = true;

    let ok = 0;
    for (const r of rows) {
      const res = await GoogleAPI.create(SHEET_PAIE, {
        Reference_Contrat: c.Reference,
        Code_Bien: c.Code_Bien,
        Client_Nom: c.Client_Nom,
        Numero_Echeance: r.Numero_Echeance,
        Libelle: r.Libelle,
        Montant: r.Montant,
        Pourcentage: r.Pourcentage,
        Date_Prevue: r.Date_Prevue,
        Etat: 'En attente',
      });
      if (res.success) ok++;
    }

    btn.textContent = 'Créer les échéances'; btn.disabled = false;
    UI.closeModal('modal-echeancier');
    UI.toast(`${ok}/${rows.length} échéance(s) créée(s) dans Paiements.`, ok === rows.length ? 'success' : 'error');
  }

  // ============================================================
  // IMPRESSION / PDF du contrat
  // ============================================================
  function printContrat(id) {
    const c = _state.records.find(r => r.ID === id);
    if (!c) return;
    const bien = _state.biens.find(b => b.Code === c.Code_Bien) || {};
    const client = _state.clients.find(cl => cl.CIN === c.Client_CIN) || {};

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
      <title>Contrat ${c.Reference||''}</title>
      <style>
        @page { margin: 22mm 18mm; }
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color:#1B2A38; font-size:13px; line-height:1.6; }
        .hdr { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #C8A96E; padding-bottom:14px; margin-bottom:24px; }
        .brand { font-size:22px; font-weight:800; color:#1B2A38; letter-spacing:.04em; }
        .brand small { display:block; font-size:11px; color:#8a8a8a; font-weight:600; letter-spacing:.12em; text-transform:uppercase; }
        .ref { text-align:right; }
        .ref .tag { font-size:10px; text-transform:uppercase; letter-spacing:.1em; color:#8a8a8a; }
        .ref .val { font-size:18px; font-weight:800; color:#C8A96E; }
        h1 { font-size:16px; text-align:center; text-transform:uppercase; letter-spacing:.08em; margin:24px 0; color:#1B2A38; }
        .grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 28px; margin:14px 0 22px; }
        .row { display:flex; justify-content:space-between; border-bottom:1px dotted #ccc; padding:5px 0; }
        .row .l { color:#6b7280; }
        .row .v { font-weight:700; }
        .sec { font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#C8A96E; border-bottom:1px solid #eee; padding-bottom:4px; margin:20px 0 8px; }
        .price { background:#1B2A38; color:#fff; padding:14px 20px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin:16px 0; }
        .price .v { font-size:22px; font-weight:800; color:#C8A96E; }
        .sign { display:flex; justify-content:space-between; margin-top:60px; }
        .sign div { width:42%; text-align:center; border-top:1px solid #1B2A38; padding-top:8px; font-size:12px; color:#6b7280; }
        .foot { margin-top:40px; text-align:center; font-size:10px; color:#9a9a9a; border-top:1px solid #eee; padding-top:10px; }
      </style></head><body>
      <div class="hdr">
        <div class="brand">LAVI CRM<small>AfriCapital Real Estate SA</small></div>
        <div class="ref"><div class="tag">Référence contrat</div><div class="val">${c.Reference||'—'}</div>
          <div style="font-size:11px; color:#6b7280; margin-top:4px;">Casablanca, le ${UI.formatDate(c.Date_Contrat) || _todayFr()}</div></div>
      </div>

      <h1>Contrat de vente — Programme LAVI</h1>

      <div class="sec">Le vendeur</div>
      <div class="grid">
        <div class="row"><span class="l">Société</span><span class="v">AfriCapital Real Estate SA</span></div>
        <div class="row"><span class="l">Programme</span><span class="v">LAVI — Domaine d'Anfa, Casablanca</span></div>
      </div>

      <div class="sec">L'acquéreur</div>
      <div class="grid">
        <div class="row"><span class="l">Nom &amp; prénom</span><span class="v">${c.Client_Nom||'—'}</span></div>
        <div class="row"><span class="l">CIN</span><span class="v">${c.Client_CIN||'—'}</span></div>
        <div class="row"><span class="l">Téléphone</span><span class="v">${client.Telephone||'—'}</span></div>
        <div class="row"><span class="l">Adresse</span><span class="v">${client.Adresse||'—'} ${client.Ville||''}</span></div>
      </div>

      <div class="sec">Désignation du bien</div>
      <div class="grid">
        <div class="row"><span class="l">Code</span><span class="v">${c.Code_Bien||'—'}</span></div>
        <div class="row"><span class="l">Immeuble / Appt</span><span class="v">${bien.Immeuble||'—'} · ${bien.Num_Appt||'—'}</span></div>
        <div class="row"><span class="l">Type</span><span class="v">${bien.Type||'—'}</span></div>
        <div class="row"><span class="l">Surface</span><span class="v">${bien.Surface?bien.Surface+' m²':'—'}</span></div>
        <div class="row"><span class="l">Niveau</span><span class="v">${bien.Niveau||'—'}</span></div>
        <div class="row"><span class="l">Titre foncier</span><span class="v">${c.TF||'—'}</span></div>
      </div>

      <div class="price"><span>Prix de vente convenu (TTC)</span><span class="v">${UI.formatPrice(c.Prix_Vente)}</span></div>

      ${c.Notes ? `<div class="sec">Conditions particulières</div><p>${c.Notes}</p>` : ''}

      <div class="sign">
        <div>Le vendeur<br><br><br>AfriCapital Real Estate SA</div>
        <div>L'acquéreur<br><br><br>${c.Client_Nom||''}</div>
      </div>

      <div class="foot">Document généré par LAVI CRM V2 — ${new Date().toLocaleString('fr-MA')} · Ce document ne vaut pas acte authentique.</div>
      <script>window.onload = function(){ window.print(); }<\/script>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { UI.toast('Autorisez les fenêtres pop-up pour imprimer.', 'error'); return; }
    w.document.write(html);
    w.document.close();
  }

  // ── Partage WhatsApp ─────────────────────────────────────────
  function shareWhatsApp(id) {
    const c = _state.records.find(r => r.ID === id);
    if (!c) return;
    const lines = [
      '📄 *Contrat — Programme LAVI*',
      '━━━━━━━━━━━━━━━',
      `📌 Réf : *${c.Reference||'—'}*`,
      `🏢 Bien : ${c.Code_Bien||'—'}`,
      `👤 Client : ${c.Client_Nom||'—'}`,
      `💰 Prix : *${UI.formatPrice(c.Prix_Vente)}*`,
      `📅 Date : ${UI.formatDate(c.Date_Contrat)}`,
      `🏷️ État : ${c.Etat||'—'}`,
      '',
      '_AfriCapital Real Estate SA_',
    ];
    window.open('https://wa.me/?text=' + encodeURIComponent(lines.join('\n')), '_blank');
  }

  // ── Bind événements ──────────────────────────────────────────
  function _bindEvents() {
    const searchEl = document.getElementById('contrat-search');
    if (searchEl) {
      let timer;
      searchEl.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => { _state.search = e.target.value; _applyFilters(); }, 300);
      });
    }
    document.getElementById('filter-etat')?.addEventListener('change', e => {
      _state.filterEtat = e.target.value; _applyFilters();
    });

    document.getElementById('btn-add-contrat')?.addEventListener('click', () => openEdit(null));
    document.getElementById('btn-save-contrat')?.addEventListener('click', _save);
    document.getElementById('contrat-bien')?.addEventListener('change', _onBienChange);

    // Échéancier
    document.getElementById('echeancier-modele')?.addEventListener('change', (e) => {
      document.getElementById('echeancier-nb-wrap').style.display = e.target.value === 'mensuel' ? '' : 'none';
      _renderEcheancierPreview();
    });
    document.getElementById('echeancier-nb')?.addEventListener('input', _renderEcheancierPreview);
    document.getElementById('echeancier-date')?.addEventListener('change', _renderEcheancierPreview);
    document.getElementById('btn-save-echeancier')?.addEventListener('click', _saveEcheancier);

    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => UI.closeModal(el.dataset.close));
    });

    document.getElementById('contrats-list-wrap')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.stopPropagation();
      if (btn.dataset.action === 'edit')   openEdit(btn.dataset.id);
      if (btn.dataset.action === 'delete') _delete(btn.dataset.id);
    });
  }

  // ── Helpers dates ────────────────────────────────────────────
  function _parseDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const s = String(v).trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[2]-1, +m[1]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  function _pad(n) { return ('0'+n).slice(-2); }
  function _today() { const d = new Date(); return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`; }
  function _todayFr() { const d = new Date(); return `${_pad(d.getDate())}/${_pad(d.getMonth()+1)}/${d.getFullYear()}`; }
  function _fromDate(d) { return `${_pad(d.getDate())}/${_pad(d.getMonth()+1)}/${d.getFullYear()}`; }
  function _toInputDate(v) { const d = _parseDate(v); return d ? `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}` : ''; }
  function _fromInputDate(v) { if (!v) return ''; const [y,m,d] = v.split('-'); return `${d}/${m}/${y}`; }

  // Suggère une référence type LAVI-AAAA-NNN
  function _suggestReference() {
    const year = new Date().getFullYear();
    const prefix = `LAVI-${year}-`;
    const nums = _state.records
      .map(r => (r.Reference||'').match(new RegExp('^'+prefix+'(\\d+)$')))
      .filter(Boolean).map(m => parseInt(m[1]));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return prefix + ('00'+next).slice(-3);
  }

  return { render, openEdit, openEcheancier, printContrat, shareWhatsApp };
})();

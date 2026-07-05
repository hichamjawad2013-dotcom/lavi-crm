// ============================================================
// LAVI CRM V2 — Module Paiements
// ============================================================
// Consomme les échéances générées depuis les contrats (module Contrats),
// et permet de suivre les encaissements (payé / en attente / en retard).

const ModulePaiements = (() => {

  const SHEET = LAVI_CONFIG.SHEETS.PAIEMENTS;
  const PER_PAGE = 15;

  let _state = {
    records: [],
    filtered: [],
    page: 1,
    filterEtat: '',
    filterMode: '',
    search: '',
    selectedId: null,
  };

  // ── Rendu principal ─────────────────────────────────────────
  function render() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div id="paiements-module">
        <div class="module-header" style="margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <h1 style="font-size:22px; font-weight:800; color:var(--navy);">Paiements &amp; encaissements</h1>
            <p style="font-size:13px; color:var(--muted); margin-top:2px;">Suivi des échéances — Programme LAVI</p>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-gold" id="btn-add-paiement">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nouvelle échéance
            </button>
          </div>
        </div>

        <div class="kpi-grid" id="paiements-kpis">${_kpiSkeleton()}</div>

        <div class="card" style="margin-bottom:16px;">
          <div class="card-body" style="padding:14px 20px;">
            <div class="filter-bar">
              <div class="search-input">
                <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="paiement-search" placeholder="Rechercher (contrat, bien, client…)" value="${_state.search}">
              </div>
              <select id="filter-p-etat" class="form-control" style="width:auto; min-width:140px;">
                <option value="">Tous les états</option>
                ${LAVI_CONFIG.STATUTS_PAIEMENTS.map(s => `<option value="${s}" ${_state.filterEtat===s?'selected':''}>${s}</option>`).join('')}
              </select>
              <select id="filter-p-mode" class="form-control" style="width:auto; min-width:130px;">
                <option value="">Tous les modes</option>
                ${LAVI_CONFIG.MODES_PAIEMENT.map(m => `<option value="${m}" ${_state.filterMode===m?'selected':''}>${m}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <div id="paiements-list-wrap"></div>
      </div>

      ${_modalFormHTML()}
      ${_modalPayerHTML()}
    `;

    _bindEvents();
    _loadData();
  }

  async function _loadData() {
    UI.setLoading('paiements-list-wrap', true);
    const result = await GoogleAPI.read(SHEET);
    UI.setLoading('paiements-list-wrap', false);

    if (!result.success) {
      document.getElementById('paiements-list-wrap').innerHTML =
        UI.emptyState('⚠️', 'Erreur de chargement', result.error);
      UI.toast('Erreur: ' + result.error, 'error');
      return;
    }
    _state.records = result.records || [];
    _applyFilters();
    _renderKPIs();
  }

  // ── État effectif (calcule "En retard" si échéance dépassée) ─
  function _effectiveEtat(p) {
    if (p.Etat === 'Payé' || p.Etat === 'Annulé' || p.Etat === 'En retard') return p.Etat;
    const d = _parseDate(p.Date_Prevue);
    if (p.Etat === 'En attente' && d && d < _startOfToday()) return 'En retard';
    return p.Etat || 'En attente';
  }

  function _applyFilters() {
    let data = [..._state.records];
    if (_state.search) {
      const q = _state.search.toLowerCase();
      data = data.filter(r =>
        (r.Reference_Contrat||'').toLowerCase().includes(q) ||
        (r.Code_Bien||'').toLowerCase().includes(q) ||
        (r.Client_Nom||'').toLowerCase().includes(q) ||
        (r.Libelle||'').toLowerCase().includes(q)
      );
    }
    if (_state.filterEtat) data = data.filter(r => _effectiveEtat(r) === _state.filterEtat);
    if (_state.filterMode) data = data.filter(r => r.Mode === _state.filterMode);

    // Tri : par date prévue croissante (les plus urgentes en premier)
    data.sort((a, b) => (_parseDate(a.Date_Prevue)||0) - (_parseDate(b.Date_Prevue)||0));

    _state.filtered = data;
    _state.page = 1;
    _renderList();
  }

  function _kpiSkeleton() {
    return ['Encaissé','En attente','En retard','À venir (30j)'].map(l => `
      <div class="kpi-card"><div class="kpi-label">${l}</div><div class="kpi-value">—</div></div>`).join('');
  }

  function _renderKPIs() {
    const r = _state.records;
    const num = v => Number(v) || 0;
    const encaisse = r.filter(p => p.Etat === 'Payé').reduce((s,p) => s + num(p.Montant), 0);
    const attente  = r.filter(p => _effectiveEtat(p) === 'En attente');
    const retard   = r.filter(p => _effectiveEtat(p) === 'En retard');
    const in30 = new Date(_startOfToday()); in30.setDate(in30.getDate() + 30);
    const aVenir = attente.filter(p => { const d = _parseDate(p.Date_Prevue); return d && d >= _startOfToday() && d <= in30; });

    const kpis = [
      { label: 'Encaissé',        value: UI.formatPrice(encaisse), color: '#2E7D52', small: true },
      { label: 'En attente',      value: UI.formatPrice(attente.reduce((s,p)=>s+num(p.Montant),0)), small: true },
      { label: 'En retard',       value: retard.length + (retard.length ? ` · ${UI.formatPrice(retard.reduce((s,p)=>s+num(p.Montant),0))}` : ''), color: '#C62828', small: true },
      { label: 'À venir (30j)',   value: aVenir.length, color: '#1565C0' },
    ];
    document.getElementById('paiements-kpis').innerHTML = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value" style="${k.color?`color:${k.color};`:''}${k.small?'font-size:17px;':''}">${k.value}</div>
      </div>`).join('');
  }

  function _renderList() {
    const wrap = document.getElementById('paiements-list-wrap');
    if (!wrap) return;

    const data  = _state.filtered;
    const total = data.length;
    const pages = Math.ceil(total / PER_PAGE);
    const page  = _state.page;
    const slice = data.slice((page-1)*PER_PAGE, page*PER_PAGE);

    if (total === 0) {
      wrap.innerHTML = `<div class="card">${UI.emptyState('💳', 'Aucune échéance', 'Générez un échéancier depuis un contrat, ou ajoutez une échéance manuellement.')}</div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="card">
        <div class="table-wrap">
          <table class="lavi-table">
            <thead>
              <tr>
                <th>Contrat</th>
                <th>Bien</th>
                <th>Client</th>
                <th>Libellé</th>
                <th>Montant</th>
                <th>Échéance</th>
                <th>Payé le</th>
                <th>Mode</th>
                <th>État</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${slice.map(p => {
                const et = _effectiveEtat(p);
                return `
                <tr data-paiement-id="${p.ID}">
                  <td><strong style="color:var(--navy);">${p.Reference_Contrat||'—'}</strong></td>
                  <td>${p.Code_Bien||'—'}</td>
                  <td>${p.Client_Nom||'—'}</td>
                  <td>${p.Libelle || ('Échéance '+(p.Numero_Echeance||''))}${p.Pourcentage?` <span style="color:var(--muted);">(${p.Pourcentage}%)</span>`:''}</td>
                  <td style="font-family:var(--font-num); font-weight:600;">${UI.formatPrice(p.Montant)}</td>
                  <td>${UI.formatDate(p.Date_Prevue)}</td>
                  <td>${p.Date_Paiement ? UI.formatDate(p.Date_Paiement) : '—'}</td>
                  <td>${p.Mode||'—'}</td>
                  <td>${UI.badge(et)}</td>
                  <td>
                    <div class="td-actions">
                      ${et !== 'Payé' ? `<button class="btn-icon btn-sm" title="Marquer payé" data-action="pay" data-id="${p.ID}" style="color:#2E7D52;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="20 6 9 17 4 12"/></svg>
                      </button>` : ''}
                      <button class="btn-icon btn-sm" title="Modifier" data-action="edit" data-id="${p.ID}">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="btn-icon btn-sm" title="Supprimer" data-action="delete" data-id="${p.ID}" style="color:var(--danger);">
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

  // ── Modale formulaire HTML ───────────────────────────────────
  function _modalFormHTML() {
    return `
    <div class="modal-overlay" id="modal-paiement-form">
      <div class="modal" style="max-width:680px;">
        <div class="modal-header">
          <h3 id="modal-paiement-title">Nouvelle échéance</h3>
          <span class="modal-close" data-close="modal-paiement-form">✕</span>
        </div>
        <div class="modal-body">
          <input type="hidden" id="paiement-form-id">
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Référence contrat</label>
              <input class="form-control" id="paiement-contrat" placeholder="Ex: LAVI-2026-001">
            </div>
            <div class="form-group">
              <label class="form-label">Code bien</label>
              <input class="form-control" id="paiement-bien" placeholder="Ex: GH02IMM03A01">
            </div>
          </div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Client</label>
              <input class="form-control" id="paiement-client" placeholder="Nom du client">
            </div>
            <div class="form-group">
              <label class="form-label">N° échéance</label>
              <input class="form-control" id="paiement-numero" placeholder="Ex: 1">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Libellé *</label>
            <input class="form-control" id="paiement-libelle" placeholder="Ex: Acompte, Gros œuvre, Livraison…">
          </div>
          <div class="form-row form-row-3">
            <div class="form-group">
              <label class="form-label">Montant (DH) *</label>
              <input class="form-control" id="paiement-montant" type="number" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">Pourcentage (%)</label>
              <input class="form-control" id="paiement-pourcentage" type="number" min="0" max="100" step="0.5">
            </div>
            <div class="form-group">
              <label class="form-label">Date prévue *</label>
              <input class="form-control" id="paiement-date-prevue" type="date">
            </div>
          </div>
          <div class="form-row form-row-3">
            <div class="form-group">
              <label class="form-label">État *</label>
              <select class="form-control" id="paiement-etat">
                ${LAVI_CONFIG.STATUTS_PAIEMENTS.map(s=>`<option value="${s}">${s}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Mode</label>
              <select class="form-control" id="paiement-mode">
                <option value="">—</option>
                ${LAVI_CONFIG.MODES_PAIEMENT.map(m=>`<option value="${m}">${m}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Date paiement</label>
              <input class="form-control" id="paiement-date-paiement" type="date">
            </div>
          </div>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Référence bancaire</label>
              <input class="form-control" id="paiement-ref-bancaire" placeholder="N° chèque, virement…">
            </div>
            <div class="form-group">
              <label class="form-label">Notes</label>
              <input class="form-control" id="paiement-notes" placeholder="Remarque…">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-close="modal-paiement-form">Annuler</button>
          <button class="btn btn-gold" id="btn-save-paiement">Enregistrer</button>
        </div>
      </div>
    </div>`;
  }

  // ── Modale "Marquer payé" HTML ───────────────────────────────
  function _modalPayerHTML() {
    return `
    <div class="modal-overlay" id="modal-payer">
      <div class="modal" style="max-width:520px;">
        <div class="modal-header">
          <h3>Encaisser l'échéance</h3>
          <span class="modal-close" data-close="modal-payer">✕</span>
        </div>
        <div class="modal-body">
          <input type="hidden" id="payer-id">
          <p style="font-size:13px; color:var(--muted); margin-bottom:16px;" id="payer-info">—</p>
          <div class="form-row form-row-2">
            <div class="form-group">
              <label class="form-label">Date de paiement *</label>
              <input class="form-control" id="payer-date" type="date">
            </div>
            <div class="form-group">
              <label class="form-label">Mode *</label>
              <select class="form-control" id="payer-mode">
                ${LAVI_CONFIG.MODES_PAIEMENT.map(m=>`<option value="${m}">${m}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Référence bancaire</label>
            <input class="form-control" id="payer-ref" placeholder="N° chèque, virement, reçu…">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" data-close="modal-payer">Annuler</button>
          <button class="btn btn-gold" id="btn-confirm-payer">Confirmer l'encaissement</button>
        </div>
      </div>
    </div>`;
  }

  // ── Ouverture "Marquer payé" ─────────────────────────────────
  function _openPayer(id) {
    const p = _state.records.find(r => String(r.ID) === String(id));
    if (!p) return;
    document.getElementById('payer-id').value = id;
    document.getElementById('payer-info').innerHTML =
      `${p.Libelle || 'Échéance'} — <strong>${UI.formatPrice(p.Montant)}</strong> · ${p.Reference_Contrat||''} ${p.Client_Nom?'· '+p.Client_Nom:''}`;
    document.getElementById('payer-date').value = _today();
    document.getElementById('payer-mode').value = p.Mode || 'Virement';
    document.getElementById('payer-ref').value = p.Reference_Bancaire || '';
    UI.openModal('modal-payer');
  }

  async function _confirmPayer() {
    const id = document.getElementById('payer-id').value;
    const data = {
      Etat: 'Payé',
      Date_Paiement: _fromInputDate(document.getElementById('payer-date').value),
      Mode: document.getElementById('payer-mode').value,
      Reference_Bancaire: document.getElementById('payer-ref').value.trim(),
    };
    const btn = document.getElementById('btn-confirm-payer');
    btn.textContent = 'Enregistrement…'; btn.disabled = true;
    const res = await GoogleAPI.update(SHEET, id, data);
    btn.textContent = 'Confirmer l\'encaissement'; btn.disabled = false;
    if (res.success) {
      UI.closeModal('modal-payer');
      UI.toast('Échéance encaissée.', 'success');
      _loadData();
    } else {
      UI.toast('Erreur: ' + res.error, 'error');
    }
  }

  // ── Ouverture formulaire ─────────────────────────────────────
  function openEdit(id) {
    const p = id ? _state.records.find(r => String(r.ID) === String(id)) : null;
    document.getElementById('modal-paiement-title').textContent = p ? 'Modifier l\'échéance' : 'Nouvelle échéance';
    document.getElementById('paiement-form-id').value = id || '';
    const g = (f) => document.getElementById('paiement-'+f);
    g('contrat').value       = p ? (p.Reference_Contrat||'') : '';
    g('bien').value          = p ? (p.Code_Bien||'') : '';
    g('client').value        = p ? (p.Client_Nom||'') : '';
    g('numero').value        = p ? (p.Numero_Echeance||'') : '';
    g('libelle').value       = p ? (p.Libelle||'') : '';
    g('montant').value       = p ? (p.Montant||'') : '';
    g('pourcentage').value   = p ? (p.Pourcentage||'') : '';
    g('date-prevue').value   = p ? _toInputDate(p.Date_Prevue) : _today();
    g('etat').value          = p ? (p.Etat||'En attente') : 'En attente';
    g('mode').value          = p ? (p.Mode||'') : '';
    g('date-paiement').value = p ? _toInputDate(p.Date_Paiement) : '';
    g('ref-bancaire').value  = p ? (p.Reference_Bancaire||'') : '';
    g('notes').value         = p ? (p.Notes||'') : '';
    UI.openModal('modal-paiement-form');
  }

  async function _save() {
    const id = document.getElementById('paiement-form-id').value;
    const g = (f) => document.getElementById('paiement-'+f);
    const data = {
      Reference_Contrat: g('contrat').value.trim(),
      Code_Bien:         g('bien').value.trim(),
      Client_Nom:        g('client').value.trim(),
      Numero_Echeance:   g('numero').value.trim(),
      Libelle:           g('libelle').value.trim(),
      Montant:           g('montant').value,
      Pourcentage:       g('pourcentage').value,
      Date_Prevue:       _fromInputDate(g('date-prevue').value),
      Etat:              g('etat').value,
      Mode:              g('mode').value,
      Date_Paiement:     _fromInputDate(g('date-paiement').value),
      Reference_Bancaire:g('ref-bancaire').value.trim(),
      Notes:             g('notes').value.trim(),
    };
    if (!data.Libelle || !data.Montant || !data.Date_Prevue) {
      UI.toast('Champs obligatoires : libellé, montant et date prévue.', 'error');
      return;
    }
    const btn = document.getElementById('btn-save-paiement');
    btn.textContent = 'Enregistrement…'; btn.disabled = true;
    const res = id ? await GoogleAPI.update(SHEET, id, data) : await GoogleAPI.create(SHEET, data);
    btn.textContent = 'Enregistrer'; btn.disabled = false;
    if (res.success) {
      UI.closeModal('modal-paiement-form');
      UI.toast(id ? 'Échéance modifiée.' : 'Échéance créée.', 'success');
      _loadData();
    } else {
      UI.toast('Erreur: ' + res.error, 'error');
    }
  }

  async function _delete(id) {
    const p = _state.records.find(r => String(r.ID) === String(id));
    if (!UI.confirm(`Supprimer cette échéance (${p?.Libelle||id}) ? Action irréversible.`)) return;
    const res = await GoogleAPI.remove(SHEET, id);
    UI.toast(res.success ? 'Échéance supprimée.' : 'Erreur: ' + res.error, res.success?'success':'error');
    if (res.success) _loadData();
  }

  function _bindEvents() {
    const searchEl = document.getElementById('paiement-search');
    if (searchEl) {
      let timer;
      searchEl.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => { _state.search = e.target.value; _applyFilters(); }, 300);
      });
    }
    document.getElementById('filter-p-etat')?.addEventListener('change', e => { _state.filterEtat = e.target.value; _applyFilters(); });
    document.getElementById('filter-p-mode')?.addEventListener('change', e => { _state.filterMode = e.target.value; _applyFilters(); });
    document.getElementById('btn-add-paiement')?.addEventListener('click', () => openEdit(null));
    document.getElementById('btn-save-paiement')?.addEventListener('click', _save);
    document.getElementById('btn-confirm-payer')?.addEventListener('click', _confirmPayer);

    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => UI.closeModal(el.dataset.close));
    });

    document.getElementById('paiements-list-wrap')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action, id = btn.dataset.id;
      if (action === 'pay')    _openPayer(id);
      if (action === 'edit')   openEdit(id);
      if (action === 'delete') _delete(id);
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
  function _startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }
  function _pad(n) { return ('0'+n).slice(-2); }
  function _today() { const d = new Date(); return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`; }
  function _toInputDate(v) { const d = _parseDate(v); return d ? `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}` : ''; }
  function _fromInputDate(v) { if (!v) return ''; const [y,m,d] = v.split('-'); return `${d}/${m}/${y}`; }

  return { render, openEdit };
})();

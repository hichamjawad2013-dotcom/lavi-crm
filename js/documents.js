// ============================================================
// LAVI CRM V2 — Module Documents
// ============================================================
// Parcourt les plans PDF du dossier Drive (via l'action LIST_PLANS du backend)
// et les rapproche des biens par leur Code. Aperçu, ouverture, partage WhatsApp.

const ModuleDocuments = (() => {

  let _state = {
    files: [],
    biens: [],
    filtered: [],
    search: '',
    folderUrl: '',
  };

  function render() {
    document.getElementById('content').innerHTML = `
      <div id="documents-module">
        <div class="module-header" style="margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <h1 style="font-size:22px; font-weight:800; color:var(--navy);">Documents — Plans des appartements</h1>
            <p style="font-size:13px; color:var(--muted); margin-top:2px;">Dossier Drive des plans — Programme LAVI</p>
          </div>
          <a class="btn btn-outline btn-sm" id="btn-open-folder" href="#" target="_blank" style="display:none;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Ouvrir le dossier Drive
          </a>
        </div>

        <div class="kpi-grid" id="documents-kpis">
          ${['Plans disponibles','Biens avec plan','Biens sans plan'].map(l=>`<div class="kpi-card"><div class="kpi-label">${l}</div><div class="kpi-value">—</div></div>`).join('')}
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div class="card-body" style="padding:14px 20px;">
            <div class="filter-bar">
              <div class="search-input">
                <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="doc-search" placeholder="Rechercher un plan (code, immeuble…)" value="${_state.search}">
              </div>
              <button class="btn btn-outline btn-sm" id="btn-doc-refresh" style="margin-left:auto;">Actualiser</button>
            </div>
          </div>
        </div>

        <div id="documents-list-wrap"></div>
      </div>

      <!-- Modale aperçu -->
      <div class="modal-overlay" id="modal-doc-preview">
        <div class="modal" style="max-width:900px;">
          <div class="modal-header">
            <h3 id="doc-preview-title">Aperçu du plan</h3>
            <span class="modal-close" data-close="modal-doc-preview">✕</span>
          </div>
          <div class="modal-body" id="doc-preview-body" style="padding:0;"></div>
        </div>
      </div>`;

    _bindEvents();
    _loadData();
  }

  async function _loadData() {
    UI.setLoading('documents-list-wrap', true);
    const [resP, resB] = await Promise.all([
      GoogleAPI.listPlans(),
      GoogleAPI.read(LAVI_CONFIG.SHEETS.BIENS),
    ]);
    UI.setLoading('documents-list-wrap', false);

    if (!resP.success) {
      document.getElementById('documents-list-wrap').innerHTML =
        UI.emptyState('⚠️', 'Impossible de lister les plans', resP.error + '<br><span style="font-size:12px;">Vérifiez que le backend Apps Script est à jour (action LIST_PLANS) et que le dossier des plans est configuré.</span>');
      return;
    }

    _state.files = resP.files || [];
    _state.folderUrl = resP.folderUrl || '';
    _state.biens = resB.success ? (resB.records || []) : [];

    const folderBtn = document.getElementById('btn-open-folder');
    if (folderBtn && _state.folderUrl) { folderBtn.href = _state.folderUrl; folderBtn.style.display = ''; }

    // Rapproche chaque plan d'un bien par code normalisé
    const biensByCode = {};
    _state.biens.forEach(b => { if (b.Code) biensByCode[_norm(b.Code)] = b; });
    _state.files.forEach(f => { f._bien = biensByCode[_norm(f.code)] || null; });

    _applyFilters();
    _renderKPIs(biensByCode);
  }

  function _renderKPIs(biensByCode) {
    const filesByCode = {};
    _state.files.forEach(f => filesByCode[_norm(f.code)] = true);
    const biensAvec = _state.biens.filter(b => b.Code && filesByCode[_norm(b.Code)]).length;
    const biensSans = _state.biens.filter(b => b.Code && !filesByCode[_norm(b.Code)]).length;
    const kpis = [
      { label:'Plans disponibles', value:_state.files.length },
      { label:'Biens avec plan',   value:biensAvec, color:'#2E7D52' },
      { label:'Biens sans plan',   value:biensSans, color:biensSans?'#C62828':'var(--muted)' },
    ];
    document.getElementById('documents-kpis').innerHTML = kpis.map(k => `
      <div class="kpi-card"><div class="kpi-label">${k.label}</div>
        <div class="kpi-value" style="${k.color?`color:${k.color};`:''}">${k.value}</div></div>`).join('');
  }

  function _applyFilters() {
    let data = [..._state.files];
    if (_state.search) {
      const q = _state.search.toLowerCase();
      data = data.filter(f =>
        (f.name||'').toLowerCase().includes(q) ||
        (f.code||'').toLowerCase().includes(q) ||
        (f._bien && ((f._bien.Immeuble||'').toLowerCase().includes(q) || (f._bien.Type||'').toLowerCase().includes(q)))
      );
    }
    _state.filtered = data;
    _renderList();
  }

  function _renderList() {
    const wrap = document.getElementById('documents-list-wrap');
    if (!wrap) return;
    if (_state.filtered.length === 0) {
      wrap.innerHTML = `<div class="card">${UI.emptyState('📄', 'Aucun plan', _state.files.length ? 'Aucun plan ne correspond à la recherche.' : 'Le dossier Drive des plans est vide ou introuvable.')}</div>`;
      return;
    }
    wrap.innerHTML = `
      <div class="card">
        <div class="table-wrap">
          <table class="lavi-table">
            <thead><tr><th>Plan (fichier)</th><th>Bien rattaché</th><th>Type</th><th>Actions</th></tr></thead>
            <tbody>
              ${_state.filtered.map((f, i) => `
                <tr>
                  <td><strong style="color:var(--navy);">${f.code}</strong><br><span style="font-size:11px; color:var(--muted);">${f.name}</span></td>
                  <td>${f._bien ? `${f._bien.Immeuble||''} · Appt ${f._bien.Num_Appt||'—'}` : '<span style="color:var(--muted);">— non rattaché —</span>'}</td>
                  <td>${f._bien ? (f._bien.Type||'—') : '—'}</td>
                  <td>
                    <div class="td-actions">
                      <button class="btn-icon btn-sm" title="Aperçu" data-action="preview" data-idx="${i}" style="color:var(--navy);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      <a class="btn-icon btn-sm" title="Ouvrir dans Drive" href="${f.url}" target="_blank" style="color:var(--navy);">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                      <button class="btn-icon btn-sm" title="Partager par WhatsApp" data-action="wa" data-idx="${i}" style="color:#1EBE5D;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    wrap.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = _state.filtered[parseInt(btn.dataset.idx)];
        if (!f) return;
        if (btn.dataset.action === 'preview') _preview(f);
        if (btn.dataset.action === 'wa')      _shareWhatsApp(f);
      });
    });
  }

  function _preview(f) {
    document.getElementById('doc-preview-title').textContent = f.code;
    document.getElementById('doc-preview-body').innerHTML =
      `<iframe src="${f.previewUrl}" style="width:100%; height:70vh; border:none; display:block;" allow="autoplay"></iframe>`;
    UI.openModal('modal-doc-preview');
  }

  function _shareWhatsApp(f) {
    const b = f._bien;
    const lines = [
      '*Programme LAVI — Plan de l\'appartement*',
      '━━━━━━━━━━━━━━━',
      `Réf : *${f.code}*`,
    ];
    if (b) {
      lines.push(`${b.Immeuble||''} · Appt ${b.Num_Appt||''}${b.Type?' · '+b.Type:''}`);
      if (b.Prix) lines.push(`Prix : *${UI.formatPrice(b.Prix)}*`);
    }
    lines.push('');
    lines.push(`Plan de l'appartement : ${f.url}`);
    lines.push('');
    lines.push('_AfriCapital Real Estate SA_');
    window.open('https://wa.me/?text=' + encodeURIComponent(lines.join('\n')), '_blank');
  }

  function _bindEvents() {
    const searchEl = document.getElementById('doc-search');
    if (searchEl) {
      let timer;
      searchEl.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => { _state.search = e.target.value; _applyFilters(); }, 300);
      });
    }
    document.getElementById('btn-doc-refresh')?.addEventListener('click', _loadData);
    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => UI.closeModal(el.dataset.close));
    });
  }

  // Normalise un code (comme le backend) : majuscules, alphanum, zéros ignorés
  function _norm(s) {
    return String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/([A-Z])0+(\d)/g, '$1$2');
  }

  return { render };
})();

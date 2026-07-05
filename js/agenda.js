// ============================================================
// LAVI CRM V2 — Module Agenda (relances)
// ============================================================
// Vue des relances commerciales à effectuer, à partir du champ
// Prochaine_Relance de la feuille Clients. Sans Google Calendar.

const ModuleAgenda = (() => {

  const SHEET = LAVI_CONFIG.SHEETS.CLIENTS;

  let _state = { clients: [], relances: [] };

  function render() {
    document.getElementById('content').innerHTML = `
      <div id="agenda-module">
        <div class="module-header" style="margin-bottom:20px;">
          <h1 style="font-size:22px; font-weight:800; color:var(--navy);">Agenda des relances</h1>
          <p style="font-size:13px; color:var(--muted); margin-top:2px;">Relances commerciales à effectuer — Programme LAVI</p>
        </div>
        <div class="kpi-grid" id="agenda-kpis">${_kpiSkeleton()}</div>
        <div id="agenda-list-wrap"></div>
      </div>`;
    _loadData();
  }

  async function _loadData() {
    UI.setLoading('agenda-list-wrap', true);
    const res = await GoogleAPI.read(SHEET);
    UI.setLoading('agenda-list-wrap', false);
    if (!res.success) {
      document.getElementById('agenda-list-wrap').innerHTML = UI.emptyState('⚠️', 'Erreur de chargement', res.error);
      return;
    }
    _state.clients = res.records || [];
    _state.relances = _state.clients
      .filter(c => _parseDate(c.Prochaine_Relance))
      .map(c => ({ client: c, date: _parseDate(c.Prochaine_Relance) }))
      .sort((a, b) => a.date - b.date);
    _renderKPIs();
    _renderList();
  }

  function _bucket(date) {
    const today = _startOfToday();
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
    if (date < today) return 'retard';
    if (date.getTime() === today.getTime()) return 'aujourdhui';
    if (date <= in7) return 'semaine';
    return 'plus_tard';
  }

  function _kpiSkeleton() {
    return ['En retard','Aujourd\'hui','7 prochains jours','Total planifiées'].map(l => `
      <div class="kpi-card"><div class="kpi-label">${l}</div><div class="kpi-value">—</div></div>`).join('');
  }

  function _renderKPIs() {
    const counts = { retard:0, aujourdhui:0, semaine:0 };
    _state.relances.forEach(r => { const b = _bucket(r.date); if (b==='retard') counts.retard++; else if (b==='aujourdhui') counts.aujourdhui++; else if (b==='semaine') counts.semaine++; });
    const kpis = [
      { label:'En retard',          value:counts.retard,     color:'#C62828' },
      { label:'Aujourd\'hui',       value:counts.aujourdhui, color:'#B8860B' },
      { label:'7 prochains jours',  value:counts.semaine,    color:'#1565C0' },
      { label:'Total planifiées',   value:_state.relances.length },
    ];
    document.getElementById('agenda-kpis').innerHTML = kpis.map(k => `
      <div class="kpi-card"><div class="kpi-label">${k.label}</div>
        <div class="kpi-value" style="${k.color?`color:${k.color};`:''}">${k.value}</div></div>`).join('');
  }

  function _renderList() {
    const wrap = document.getElementById('agenda-list-wrap');
    if (!wrap) return;
    if (_state.relances.length === 0) {
      wrap.innerHTML = `<div class="card">${UI.emptyState('📅', 'Aucune relance planifiée', 'Définissez une date de « Prochaine relance » sur une fiche client pour la voir ici.')}</div>`;
      return;
    }

    const groups = [
      { key:'retard',     titre:'En retard',          color:'#C62828' },
      { key:'aujourdhui', titre:'Aujourd\'hui',       color:'#B8860B' },
      { key:'semaine',    titre:'7 prochains jours',  color:'#1565C0' },
      { key:'plus_tard',  titre:'Plus tard',          color:'var(--muted)' },
    ];

    wrap.innerHTML = groups.map(g => {
      const items = _state.relances.filter(r => _bucket(r.date) === g.key);
      if (!items.length) return '';
      return `
        <div class="card" style="margin-bottom:16px;">
          <div class="card-header" style="display:flex; align-items:center; gap:8px;">
            <span style="width:9px; height:9px; border-radius:50%; background:${g.color}; display:inline-block;"></span>
            <span class="card-title">${g.titre}</span>
            <span style="margin-left:auto; font-size:12px; color:var(--muted);">${items.length}</span>
          </div>
          <div class="table-wrap">
            <table class="lavi-table">
              <thead><tr><th>Client</th><th>Téléphone</th><th>Étape</th><th>Relance prévue</th><th>Dernier contact</th><th>Actions</th></tr></thead>
              <tbody>
                ${items.map(({client:c}) => {
                  const tel = (c.Telephone||'').replace(/\s+/g,'');
                  return `
                  <tr data-client-id="${c.ID}">
                    <td><strong style="color:var(--navy);">${c.Nom||''} ${c.Prenom||''}</strong>${c.Notes?`<br><span style="font-size:11px; color:var(--muted);">${String(c.Notes).substring(0,60)}</span>`:''}</td>
                    <td>${c.Telephone||'—'}</td>
                    <td>${c.Etape_Pipeline?UI.badge(c.Etape_Pipeline):'—'}</td>
                    <td>${UI.formatDate(c.Prochaine_Relance)}</td>
                    <td>${c.Dernier_Contact?UI.formatDate(c.Dernier_Contact):'—'}</td>
                    <td>
                      <div class="td-actions">
                        ${tel?`<a class="btn-icon btn-sm" title="Appeler" href="tel:${tel}" style="color:var(--navy);">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        </a>
                        <a class="btn-icon btn-sm" title="WhatsApp" href="https://wa.me/${_waNumber(tel)}" target="_blank" style="color:#1EBE5D;">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>
                        </a>`:''}
                        <button class="btn-icon btn-sm" title="Marquer fait" data-action="done" data-id="${c.ID}" style="color:#2E7D52;">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="20 6 9 17 4 12"/></svg>
                        </button>
                        <button class="btn-icon btn-sm" title="Reporter (+7 j)" data-action="snooze" data-id="${c.ID}">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'done')   _markDone(btn.dataset.id);
        if (btn.dataset.action === 'snooze') _snooze(btn.dataset.id);
      });
    });
  }

  // ── Marquer une relance comme faite ─────────────────────────
  async function _markDone(id) {
    const res = await GoogleAPI.update(SHEET, id, {
      Dernier_Contact: _todayFr(),
      Prochaine_Relance: '',
    });
    UI.toast(res.success ? 'Relance marquée comme faite.' : 'Erreur: ' + res.error, res.success?'success':'error');
    if (res.success) _loadData();
  }

  // ── Reporter la relance de 7 jours ───────────────────────────
  async function _snooze(id) {
    const c = _state.clients.find(x => String(x.ID) === String(id));
    const base = _parseDate(c && c.Prochaine_Relance) || _startOfToday();
    const next = new Date(base); next.setDate(next.getDate() + 7);
    const res = await GoogleAPI.update(SHEET, id, { Prochaine_Relance: _fromDate(next) });
    UI.toast(res.success ? 'Relance reportée de 7 jours.' : 'Erreur: ' + res.error, res.success?'success':'error');
    if (res.success) _loadData();
  }

  // ── Helpers ──────────────────────────────────────────────────
  function _waNumber(tel) {
    let n = String(tel).replace(/[^\d+]/g, '');
    if (n.startsWith('0')) n = '212' + n.slice(1);   // Maroc
    if (n.startsWith('+')) n = n.slice(1);
    return n;
  }
  function _parseDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    const s = String(v).trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) { const d = new Date(+m[3], +m[2]-1, +m[1]); d.setHours(0,0,0,0); return d; }
    const d = new Date(s); if (isNaN(d)) return null; d.setHours(0,0,0,0); return d;
  }
  function _startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }
  function _pad(n) { return ('0'+n).slice(-2); }
  function _fromDate(d) { return `${_pad(d.getDate())}/${_pad(d.getMonth()+1)}/${d.getFullYear()}`; }
  function _todayFr() { return _fromDate(new Date()); }

  return { render };
})();

// ============================================================
// LAVI CRM V2 — Module Dashboard (KPIs & graphiques)
// ============================================================

const ModuleDashboard = (() => {

  const COLORS = {
    disponible: '#2E7D32',
    option:     '#F9A825',
    reserve:    '#1565C0',
    vendu:      '#C8A96E',
  };

  // ── Rendu principal ─────────────────────────────────────────
  function render() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div id="dash-module">
        <div class="module-header" style="margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div>
            <h1 style="font-size:22px; font-weight:800; color:var(--navy);">Dashboard</h1>
            <p style="font-size:13px; color:var(--muted); margin-top:2px;">Vue d'ensemble — Programme LAVI, Domaine d'Anfa</p>
          </div>
          <button class="btn btn-outline btn-sm" id="dash-refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Actualiser
          </button>
        </div>
        <div id="dash-body">
          <div class="kpi-grid">${_kpiSkeleton(8)}</div>
        </div>
      </div>`;

    document.getElementById('dash-refresh')?.addEventListener('click', _load);
    _load();
  }

  function _kpiSkeleton(n) {
    return Array(n).fill(`<div class="kpi-card"><div class="kpi-label">…</div><div class="kpi-value">—</div></div>`).join('');
  }

  // ── Chargement ───────────────────────────────────────────────
  async function _load() {
    UI.setLoading('dash-body', true);
    const result = await GoogleAPI.getStats();
    UI.setLoading('dash-body', false);

    if (!result.success) {
      document.getElementById('dash-body').innerHTML =
        UI.emptyState('⚠️', 'Erreur de chargement', result.error);
      UI.toast('Erreur: ' + result.error, 'error');
      return;
    }
    _renderStats(result.stats);
  }

  // ── Rendu des statistiques ───────────────────────────────────
  function _renderStats(s) {
    const b = s.biens || {}, ca = s.ca || {}, p = s.paiements || {}, cl = s.clients || {};

    document.getElementById('dash-body').innerHTML = `
      <!-- KPIs -->
      <div class="kpi-grid">
        ${_kpi('Biens disponibles', `${b.disponible ?? 0} <small>/ ${b.total ?? 0}</small>`, _sub('Valeur stock : ' + UI.formatPrice(b.valeur_disponible)))}
        ${_kpi('Réservés + Options', (b.reserve ?? 0) + (b.option ?? 0), _sub(`${b.reserve ?? 0} réservés · ${b.option ?? 0} options`))}
        ${_kpi('Biens vendus', b.vendu ?? 0, _sub(_pct(b.vendu, b.total) + ' du programme'))}
        ${_kpi('CA signé', UI.formatPrice(ca.total), _sub(`${ca.contrats_signes ?? 0} contrats signés · ${ca.contrats_en_cours ?? 0} en cours`))}
        ${_kpi('Encaissé', UI.formatPrice(p.encaisse), _sub('Attendu : ' + UI.formatPrice(p.attendu)))}
        ${_kpi('Paiements en retard', p.en_retard ?? 0, _sub(UI.formatPrice(p.retard_montant)), p.en_retard > 0 ? '#C62828' : null)}
        ${_kpi('Échéances 30 jours', p.a_venir_30j ?? 0, _sub('à encaisser sous 30 jours'))}
        ${_kpi('Clients / Prospects', cl.total ?? 0, _sub('dans la base'))}
      </div>

      <!-- Graphiques ligne 1 -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:16px; margin-bottom:16px;">
        <div class="card">
          <div class="card-header"><span class="card-title">Répartition des biens</span></div>
          <div class="card-body" style="display:flex; align-items:center; gap:24px; flex-wrap:wrap;">
            ${_donutHTML(b)}
            ${_legendHTML(b)}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Stock par immeuble</span></div>
          <div class="card-body">${_immeublesHTML(b.par_immeuble || {})}</div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Pipeline commercial</span></div>
          <div class="card-body">${_pipelineHTML(cl.pipeline || {}, cl.total || 0)}</div>
        </div>
      </div>

      <!-- Ventes par mois -->
      <div class="card" style="margin-bottom:16px;">
        <div class="card-header"><span class="card-title">Ventes signées — 12 derniers mois</span></div>
        <div class="card-body">${_ventesMoisHTML(s.ventes_mois || [])}</div>
      </div>

      <!-- Listes -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:16px;">
        <div class="card">
          <div class="card-header"><span class="card-title" style="color:#C62828;">⚠ Paiements en retard</span></div>
          <div class="card-body" style="padding:0;">${_echeancesTable(p.liste_retards || [], 'Aucun paiement en retard 🎉')}</div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Échéances à venir (30 j)</span></div>
          <div class="card-body" style="padding:0;">${_echeancesTable(p.liste_a_venir || [], 'Aucune échéance sous 30 jours')}</div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Dernières activités</span></div>
          <div class="card-body" style="padding:0;">${_activitesHTML(s.activites || [])}</div>
        </div>
      </div>`;
  }

  // ── Composants ───────────────────────────────────────────────
  function _kpi(label, value, sub = '', color = null) {
    return `<div class="kpi-card">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value" ${color ? `style="color:${color};"` : ''}>${value}</div>
      ${sub}
    </div>`;
  }
  const _sub = txt => `<div style="font-size:11.5px; color:var(--muted); margin-top:6px;">${txt}</div>`;
  const _pct = (n, total) => total ? Math.round((n / total) * 100) + '%' : '0%';

  // Donut SVG — répartition des statuts
  function _donutHTML(b) {
    const parts = [
      { key: 'disponible', val: b.disponible || 0, color: COLORS.disponible },
      { key: 'option',     val: b.option || 0,     color: COLORS.option },
      { key: 'reserve',    val: b.reserve || 0,    color: COLORS.reserve },
      { key: 'vendu',      val: b.vendu || 0,      color: COLORS.vendu },
    ];
    const total = parts.reduce((s, x) => s + x.val, 0);
    if (!total) return `<div style="color:var(--muted); font-size:13px;">Aucun bien enregistré.</div>`;

    const R = 54, C = 2 * Math.PI * R;
    let offset = 0;
    const circles = parts.filter(x => x.val > 0).map(x => {
      const frac = x.val / total;
      const el = `<circle r="${R}" cx="70" cy="70" fill="transparent" stroke="${x.color}" stroke-width="22"
        stroke-dasharray="${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}"
        stroke-dashoffset="${(-offset * C).toFixed(2)}" transform="rotate(-90 70 70)"/>`;
      offset += frac;
      return el;
    }).join('');

    return `<svg width="140" height="140" viewBox="0 0 140 140">
      ${circles}
      <text x="70" y="66" text-anchor="middle" font-size="26" font-weight="800" fill="var(--navy)">${total}</text>
      <text x="70" y="84" text-anchor="middle" font-size="10" fill="var(--muted)" letter-spacing="1">BIENS</text>
    </svg>`;
  }

  function _legendHTML(b) {
    const items = [
      ['Disponible', b.disponible || 0, COLORS.disponible],
      ['Option',     b.option || 0,     COLORS.option],
      ['Réservé',    b.reserve || 0,    COLORS.reserve],
      ['Vendu',      b.vendu || 0,      COLORS.vendu],
    ];
    return `<div style="display:flex; flex-direction:column; gap:8px;">
      ${items.map(([label, val, color]) => `
        <div style="display:flex; align-items:center; gap:8px; font-size:13px;">
          <span style="width:10px; height:10px; border-radius:2px; background:${color}; flex-shrink:0;"></span>
          <span style="color:var(--body-text); min-width:80px;">${label}</span>
          <strong style="color:var(--navy);">${val}</strong>
          <span style="color:var(--muted); font-size:11.5px;">(${_pct(val, (b.total || 0))})</span>
        </div>`).join('')}
    </div>`;
  }

  // Barres empilées par immeuble
  function _immeublesHTML(parImmeuble) {
    const keys = Object.keys(parImmeuble).sort();
    if (!keys.length) return `<div style="color:var(--muted); font-size:13px;">Aucune donnée.</div>`;
    return keys.map(im => {
      const d = parImmeuble[im];
      const seg = (val, color) => d.total && val ? `<div style="width:${(val / d.total) * 100}%; background:${color};" title="${val}"></div>` : '';
      return `<div style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
          <strong style="color:var(--navy);">${im}</strong>
          <span style="color:var(--muted);">${d.vendu}/${d.total} vendus</span>
        </div>
        <div style="display:flex; height:14px; border-radius:4px; overflow:hidden; background:var(--sand);">
          ${seg(d.disponible, COLORS.disponible)}${seg(d.option, COLORS.option)}${seg(d.reserve, COLORS.reserve)}${seg(d.vendu, COLORS.vendu)}
        </div>
      </div>`;
    }).join('');
  }

  // Pipeline prospects — barres horizontales
  function _pipelineHTML(pipeline, total) {
    const etapes = (LAVI_CONFIG.ETAPES_PIPELINE || []).filter(e => e !== undefined);
    if (!total) return `<div style="color:var(--muted); font-size:13px;">Aucun client dans le pipeline.</div>`;
    const max = Math.max(1, ...etapes.map(e => pipeline[e] || 0));
    return etapes.map(e => {
      const val = pipeline[e] || 0;
      const color = e === 'Gagné' ? COLORS.disponible : (e === 'Perdu' ? '#C62828' : 'var(--gold)');
      return `<div style="display:flex; align-items:center; gap:10px; margin-bottom:9px; font-size:12.5px;">
        <span style="min-width:130px; color:var(--body-text);">${e}</span>
        <div style="flex:1; height:12px; background:var(--sand); border-radius:4px; overflow:hidden;">
          <div style="width:${(val / max) * 100}%; height:100%; background:${color}; border-radius:4px;"></div>
        </div>
        <strong style="min-width:24px; text-align:right; color:var(--navy);">${val}</strong>
      </div>`;
    }).join('');
  }

  // Ventes par mois — barres verticales
  function _ventesMoisHTML(mois) {
    const max = Math.max(1, ...mois.map(m => m.montant));
    const hasData = mois.some(m => m.montant > 0);
    if (!hasData) return `<div style="color:var(--muted); font-size:13px;">Aucune vente signée sur les 12 derniers mois.</div>`;
    return `<div style="display:flex; align-items:flex-end; gap:8px; height:160px;">
      ${mois.map(m => `
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; height:100%; justify-content:flex-end;"
             title="${m.label} : ${UI.formatPrice(m.montant)} (${m.count} vente${m.count > 1 ? 's' : ''})">
          ${m.count ? `<span style="font-size:10px; color:var(--navy); font-weight:700;">${m.count}</span>` : ''}
          <div style="width:100%; max-width:36px; height:${Math.max(2, (m.montant / max) * 115)}px; background:${m.montant ? 'var(--gold)' : 'var(--border)'}; border-radius:3px 3px 0 0;"></div>
          <span style="font-size:10px; color:var(--muted); white-space:nowrap;">${m.label}</span>
        </div>`).join('')}
    </div>`;
  }

  // Tableau échéances (retards / à venir)
  function _echeancesTable(list, emptyMsg) {
    if (!list.length) return `<div style="padding:20px; font-size:13px; color:var(--muted); text-align:center;">${emptyMsg}</div>`;
    return `<div class="table-wrap"><table class="lavi-table">
      <thead><tr><th>Bien</th><th>Client</th><th>Échéance</th><th>Montant</th><th>Date</th></tr></thead>
      <tbody>
        ${list.map(e => `<tr>
          <td><strong>${e.bien}</strong></td>
          <td>${e.client}</td>
          <td>${e.libelle}</td>
          <td>${UI.formatPrice(e.montant)}</td>
          <td>${e.date}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  }

  // Dernières activités
  function _activitesHTML(activites) {
    if (!activites.length) return `<div style="padding:20px; font-size:13px; color:var(--muted); text-align:center;">Aucune activité récente.</div>`;
    return `<div style="padding:8px 0;">
      ${activites.map(a => `
        <div style="padding:9px 20px; border-bottom:1px solid var(--border); font-size:12.5px;">
          <div style="display:flex; justify-content:space-between; gap:8px;">
            <strong style="color:var(--navy);">${a.action} · ${a.module}</strong>
            <span style="color:var(--muted); white-space:nowrap; font-size:11px;">${a.date} ${a.heure}</span>
          </div>
          <div style="color:var(--muted); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${a.utilisateur ? a.utilisateur.split('@')[0] + ' — ' : ''}${a.description}
          </div>
        </div>`).join('')}
    </div>`;
  }

  return { render };
})();

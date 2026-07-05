// ============================================================
// LAVI CRM V2 — Module Paramètres (administration)
// ============================================================
// Page de référence + actions d'administration. Les listes métier et les
// emails autorisés proviennent de js/config.js (modifiables dans ce fichier
// puis republiés). Cette page les affiche et expose les actions Sheets.

const ModuleParametres = (() => {

  function render() {
    const user = (window.Auth && Auth.getUser && Auth.getUser()) || {};
    const hosted = (window.GoogleAPI && GoogleAPI.isHostedOnAppsScript && GoogleAPI.isHostedOnAppsScript()) ? 'Apps Script (hébergé)' : 'Web (GitHub Pages) + Apps Script';
    const R = LAVI_CONFIG.RESERVATION || {};

    const chips = (arr) => (arr||[]).map(x => `<span class="param-chip">${x}</span>`).join('');

    document.getElementById('content').innerHTML = `
      <div id="parametres-module">
        <div class="module-header" style="margin-bottom:20px;">
          <h1 style="font-size:22px; font-weight:800; color:var(--navy);">Paramètres</h1>
          <p style="font-size:13px; color:var(--muted); margin-top:2px;">Administration & configuration — LAVI CRM</p>
        </div>

        <style>
          .param-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); gap:16px; }
          .param-chip { display:inline-block; background:var(--sand,#F0E9DE); color:var(--navy); border:1px solid var(--gold-pale,#F0E4CC); border-radius:6px; padding:3px 9px; font-size:12px; margin:2px; }
          .param-kv { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--sand,#eee); font-size:13px; }
          .param-kv .k { color:var(--muted); }
          .param-kv .v { font-weight:600; color:var(--navy); text-align:right; }
        </style>

        <div class="param-grid">

          <!-- Compte -->
          <div class="card">
            <div class="card-header" style="background:var(--navy);"><span class="card-title" style="color:var(--gold);">Mon compte</span></div>
            <div class="card-body" style="padding:16px;">
              <div class="param-kv"><span class="k">Utilisateur</span><span class="v">${user.name || '—'}</span></div>
              <div class="param-kv"><span class="k">Email</span><span class="v">${user.email || '—'}</span></div>
              <div class="param-kv"><span class="k">Mode d'hébergement</span><span class="v">${hosted}</span></div>
              <div class="param-kv" style="border-bottom:none;"><span class="k">Version</span><span class="v">LAVI CRM V2.8</span></div>
            </div>
          </div>

          <!-- Accès -->
          <div class="card">
            <div class="card-header" style="background:var(--navy);"><span class="card-title" style="color:var(--gold);">Emails autorisés</span></div>
            <div class="card-body" style="padding:16px;">
              <div style="margin-bottom:10px;">${chips(LAVI_CONFIG.AUTHORIZED_EMAILS)}</div>
              <p style="font-size:12px; color:var(--muted); line-height:1.5;">
                Pour ajouter/retirer un accès : modifier <code>AUTHORIZED_EMAILS</code> dans <code>js/config.js</code>
                <b>et</b> dans <code>Code.gs</code> (Apps Script), puis republier.
              </p>
            </div>
          </div>

          <!-- Base de données -->
          <div class="card">
            <div class="card-header" style="background:var(--navy);"><span class="card-title" style="color:var(--gold);">Base de données (Google Sheets)</span></div>
            <div class="card-body" style="padding:16px;">
              <div style="margin-bottom:12px;">${chips(Object.values(LAVI_CONFIG.SHEETS))}</div>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button class="btn btn-outline btn-sm" id="btn-param-init">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                  Initialiser les feuilles
                </button>
                <button class="btn btn-outline btn-sm" id="btn-param-migrate">Migration pipeline</button>
              </div>
              <p style="font-size:12px; color:var(--muted); margin-top:10px; line-height:1.5;">
                « Initialiser » crée les feuilles manquantes avec leurs en-têtes (sans toucher aux données existantes).
              </p>
            </div>
          </div>

          <!-- Listes métier -->
          <div class="card">
            <div class="card-header" style="background:var(--navy);"><span class="card-title" style="color:var(--gold);">Listes métier</span></div>
            <div class="card-body" style="padding:16px;">
              <div class="detail-section-title">Immeubles</div><div>${chips(LAVI_CONFIG.IMMEUBLES)}</div>
              <div class="detail-section-title" style="margin-top:10px;">Types de biens</div><div>${chips(LAVI_CONFIG.TYPES_BIENS)}</div>
              <div class="detail-section-title" style="margin-top:10px;">Statuts biens</div><div>${chips(LAVI_CONFIG.STATUTS_BIENS)}</div>
              <div class="detail-section-title" style="margin-top:10px;">Étapes pipeline</div><div>${chips(LAVI_CONFIG.ETAPES_PIPELINE)}</div>
              <div class="detail-section-title" style="margin-top:10px;">Modes de paiement</div><div>${chips(LAVI_CONFIG.MODES_PAIEMENT)}</div>
              <div class="detail-section-title" style="margin-top:10px;">Origines clients</div><div>${chips(LAVI_CONFIG.ORIGINES_CLIENTS)}</div>
            </div>
          </div>

          <!-- Réservation -->
          <div class="card" style="grid-column:1 / -1;">
            <div class="card-header" style="background:var(--navy);"><span class="card-title" style="color:var(--gold);">Contrat de réservation — données du promoteur</span></div>
            <div class="card-body" style="padding:16px;">
              <div class="param-grid" style="gap:0 24px;">
                <div>
                  <div class="param-kv"><span class="k">Société</span><span class="v">${R.RESERVANT_SOCIETE||'—'}</span></div>
                  <div class="param-kv"><span class="k">Gérant</span><span class="v">${R.RESERVANT_GERANT||'—'}</span></div>
                  <div class="param-kv"><span class="k">Projet</span><span class="v">${R.PROJET_NOM||'—'}</span></div>
                  <div class="param-kv"><span class="k">Titre foncier mère</span><span class="v">${R.TF_MERE||'—'}</span></div>
                  <div class="param-kv" style="border-bottom:none;"><span class="k">Autorisation</span><span class="v">${R.AUTORISATION||'—'}</span></div>
                </div>
                <div>
                  <div class="param-kv"><span class="k">R.C.</span><span class="v">${R.RC||'—'}</span></div>
                  <div class="param-kv"><span class="k">I.F.</span><span class="v">${R.IF||'—'}</span></div>
                  <div class="param-kv"><span class="k">ICE</span><span class="v">${R.ICE||'—'}</span></div>
                  <div class="param-kv"><span class="k">Achèvement travaux</span><span class="v">${R.ACHEVEMENT_DATE||'—'}</span></div>
                  <div class="param-kv" style="border-bottom:none;"><span class="k">Échéancier défaut</span><span class="v">${R.ECHEANCIER_DEFAUT?`${R.ECHEANCIER_DEFAUT.acompte_pct}% · ${R.ECHEANCIER_DEFAUT.echeance1_pct}% · ${R.ECHEANCIER_DEFAUT.echeance2_pct}%`:'—'}</span></div>
                </div>
              </div>
              <p style="font-size:12px; color:var(--muted); margin-top:10px;">Ces valeurs sont éditables dans le bloc <code>RESERVATION</code> de <code>js/config.js</code>.</p>
            </div>
          </div>

        </div>
      </div>`;

    document.getElementById('btn-param-init')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      const res = await GoogleAPI.initSheets();
      btn.disabled = false;
      UI.toast(res.success ? 'Feuilles initialisées.' : 'Erreur: ' + res.error, res.success ? 'success' : 'error');
    });

    document.getElementById('btn-param-migrate')?.addEventListener('click', async (e) => {
      if (!UI.confirm('Lancer la migration du pipeline (ajout du champ Etape_Pipeline) ?')) return;
      const btn = e.currentTarget; btn.disabled = true;
      const res = await GoogleAPI.migratePipeline();
      btn.disabled = false;
      UI.toast(res.success ? `Migration OK (${res.migrated ?? 0} fiche(s)).` : 'Erreur: ' + res.error, res.success ? 'success' : 'error');
    });
  }

  return { render };
})();

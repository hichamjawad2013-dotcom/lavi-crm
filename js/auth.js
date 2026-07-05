// ============================================================
// LAVI CRM V2 — Module Authentification Google
// ============================================================
const Auth = (() => {
  let _user = null;
  let _onLoginCb = null;
  let _onLogoutCb = null;

  // ── Initialisation ──────────────────────────────────────────
  function init(onLogin, onLogout) {
    _onLoginCb  = onLogin;
    _onLogoutCb = onLogout;

    // Mode hébergé sur Apps Script : l'utilisateur est déjà connecté
    // à son compte Google (exigé par la Web App). Pas d'OAuth à gérer.
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      _initHostedMode();
      return;
    }

    // Charger session persistée
    const stored = sessionStorage.getItem('lavi_user');
    if (stored) {
      try {
        _user = JSON.parse(stored);
        if (_user && _onLoginCb) _onLoginCb(_user);
        return;
      } catch(e) { sessionStorage.removeItem('lavi_user'); }
    }

    // Mode démo si pas de Client ID configuré
    if (!LAVI_CONFIG.GOOGLE_CLIENT_ID) {
      console.warn('[Auth] GOOGLE_CLIENT_ID non configuré. Mode démo activé.');
      _renderDemoButton();
      return;
    }

    // Le script accounts.google.com/gsi/client est chargé en async/defer :
    // il peut ne pas être encore prêt au moment où on arrive ici. On attend
    // qu'il soit disponible avant d'initialiser, pour éviter un bouton vide.
    _waitForGoogleIdentity(_initGoogleButton);
  }

  // ── Mode hébergé Apps Script ────────────────────────────────
  function _initHostedMode() {
    const btnContainer = document.getElementById('google-signin-btn');
    if (btnContainer) btnContainer.innerHTML = `<span style="color:rgba(255,255,255,0.6); font-size:13px;">Vérification de votre compte Google…</span>`;

    google.script.run
      .withSuccessHandler(res => {
        let info;
        try { info = JSON.parse(res); } catch (e) { info = null; }
        if (!info || !info.email) {
          _showLoginError("Impossible d'identifier votre compte Google. Rechargez la page.");
          if (btnContainer) btnContainer.innerHTML = '';
          return;
        }
        if (!info.authorized) {
          _showLoginError(`Accès refusé pour ${info.email}. Contactez l'administrateur.`);
          if (btnContainer) btnContainer.innerHTML = '';
          return;
        }
        _user = { name: info.name || info.email, email: info.email, picture: null, initials: info.initials || 'U' };
        if (_onLoginCb) _onLoginCb(_user);
      })
      .withFailureHandler(err => {
        _showLoginError('Erreur de connexion au serveur: ' + (err && err.message ? err.message : err));
      })
      .getCurrentUserInfo();
  }

  function _waitForGoogleIdentity(callback, attempt = 0) {
    const ready = typeof google !== 'undefined' && google.accounts && google.accounts.id;
    if (ready) { callback(); return; }
    if (attempt >= 50) { // ~5 secondes
      console.error('[Auth] Google Identity Services non chargé après 5s.');
      _showLoginError('Impossible de charger la connexion Google. Vérifiez votre connexion internet et rechargez la page.');
      return;
    }
    setTimeout(() => _waitForGoogleIdentity(callback, attempt + 1), 100);
  }

  function _initGoogleButton() {
    google.accounts.id.initialize({
      client_id: LAVI_CONFIG.GOOGLE_CLIENT_ID,
      callback: _handleCredential,
      auto_select: false, // évite les blocages silencieux liés à auto_select
    });

    // Rendu du bouton officiel Google — beaucoup plus fiable que prompt()
    const btnContainer = document.getElementById('google-signin-btn');
    if (btnContainer) {
      google.accounts.id.renderButton(btnContainer, {
        theme: 'outline',
        size: 'large',
        width: 300,
        text: 'signin_with',
        locale: 'fr',
      });
    } else {
      console.warn('[Auth] #google-signin-btn introuvable dans le DOM.');
    }
  }

  // ── Bouton démo (si pas de Client ID) ───────────────────────
  function _renderDemoButton() {
    const btnContainer = document.getElementById('google-signin-btn');
    if (!btnContainer) return;
    btnContainer.innerHTML = `<button id="demo-login-btn" style="padding:12px 24px;border-radius:6px;border:none;background:#fff;cursor:pointer;font-weight:600;">Se connecter (mode démo)</button>`;
    document.getElementById('demo-login-btn').addEventListener('click', login);
  }

  // ── Déclenchement login manuel (fallback / mode démo) ──────
  function login() {
    if (!LAVI_CONFIG.GOOGLE_CLIENT_ID) {
      _user = { name: 'Hicham (Démo)', email: 'hichamjawad2013@gmail.com', picture: null, initials: 'H' };
      sessionStorage.setItem('lavi_user', JSON.stringify(_user));
      if (_onLoginCb) _onLoginCb(_user);
      return;
    }
    // Fallback de diagnostic si jamais on doit retenter via prompt()
    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        console.warn('[Auth] Prompt non affiché. Raison:', notification.getNotDisplayedReason());
        _showLoginError('Connexion impossible automatiquement. Utilisez le bouton Google ci-dessus.');
      }
      if (notification.isSkippedMoment()) {
        console.warn('[Auth] Prompt ignoré. Raison:', notification.getSkippedReason());
      }
    });
  }

  // ── Traitement du token Google ──────────────────────────────
  function _handleCredential(response) {
    const payload = _parseJwt(response.credential);
    if (!payload) { _showLoginError('Erreur de connexion Google.'); return; }

    const email = payload.email;
    if (LAVI_CONFIG.AUTHORIZED_EMAILS.length > 0 && !LAVI_CONFIG.AUTHORIZED_EMAILS.includes(email)) {
      _showLoginError(`Accès refusé. Cet email n'est pas autorisé.`);
      return;
    }

    const names = (payload.name || '').split(' ');
    const initials = names.map(n => n[0]).slice(0,2).join('').toUpperCase();

    _user = {
      name:     payload.name,
      email:    payload.email,
      picture:  payload.picture,
      initials: initials || 'U',
      token:    response.credential,
    };
    sessionStorage.setItem('lavi_user', JSON.stringify(_user));
    if (_onLoginCb) _onLoginCb(_user);
  }

  // ── Déconnexion ─────────────────────────────────────────────
  function logout() {
    _user = null;
    try { sessionStorage.removeItem('lavi_user'); } catch (e) {}
    if (LAVI_CONFIG.GOOGLE_CLIENT_ID && typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }
    if (_onLogoutCb) _onLogoutCb();
  }

  // ── Getters ─────────────────────────────────────────────────
  function getUser()  { return _user; }
  function isLogged() { return !!_user; }

  // ── Utilitaire JWT ──────────────────────────────────────────
  function _parseJwt(token) {
    try {
      const base64 = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      return JSON.parse(decodeURIComponent(atob(base64).split('').map(c =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join('')));
    } catch(e) { return null; }
  }

  function _showLoginError(msg) {
    const el = document.getElementById('login-error');
    if (el) el.textContent = msg;
    else console.error('[Auth]', msg);
  }

  return { init, login, logout, getUser, isLogged };
})();

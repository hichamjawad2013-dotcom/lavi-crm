// ============================================================
// LAVI CRM V2 — Utilitaires UI
// ============================================================

const UI = (() => {

  // ── Toasts ───────────────────────────────────────────────────
  function toast(message, type = 'default', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, duration);
  }

  // ── Modale ───────────────────────────────────────────────────
  function openModal(id)  {
    const el = document.getElementById(id);
    if (el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('open'); document.body.style.overflow = ''; }
  }
  function closeAllModals() {
    document.querySelectorAll('.modal-overlay.open').forEach(m => {
      m.classList.remove('open');
    });
    document.body.style.overflow = '';
  }

  // ── Loading sur un conteneur ─────────────────────────────────
  function setLoading(containerId, show) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let overlay = container.querySelector('.loading-overlay');
    if (show) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="spinner"></div>';
        container.style.position = 'relative';
        container.appendChild(overlay);
      }
    } else {
      if (overlay) overlay.remove();
    }
  }

  // ── Badge statut ─────────────────────────────────────────────
  function badge(statut) {
    const map = {
      'Disponible':  'badge-disponible',
      'Réservé':     'badge-reserve',
      'Vendu':       'badge-vendu',
      'Option':      'badge-option',
      'Signé':       'badge-signe',
      'En attente':  'badge-en-attente',
      'En retard':   'badge-en-retard',
      'Payé':        'badge-paye',
    };
    const cls = map[statut] || 'badge-en-attente';
    return `<span class="badge ${cls}">${statut || '—'}</span>`;
  }

  // ── Formatage prix ────────────────────────────────────────────
  function formatPrice(val) {
    if (!val && val !== 0) return '—';
    return Number(val).toLocaleString('fr-MA') + ' DH';
  }

  // ── Formatage date ────────────────────────────────────────────
  function formatDate(val) {
    if (!val) return '—';
    const d = new Date(val);
    if (isNaN(d)) return val;
    return d.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // ── Empty state HTML ──────────────────────────────────────────
  function emptyState(icon, title, message) {
    return `<div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h4>${title}</h4>
      <p>${message}</p>
    </div>`;
  }

  // ── Confirmation ──────────────────────────────────────────────
  function confirm(message) {
    return window.confirm(message);
  }

  // ── Pagination ────────────────────────────────────────────────
  function paginationHTML(current, total, perPage, totalRecords) {
    if (total <= 1) return '';
    const pages = [];
    for (let i = 1; i <= total; i++) {
      pages.push(`<button class="${i === current ? 'active' : ''}" data-page="${i}">${i}</button>`);
    }
    const from = (current - 1) * perPage + 1;
    const to   = Math.min(current * perPage, totalRecords);
    return `<div class="pagination">
      <span>${from}–${to} sur ${totalRecords} résultats</span>
      <div class="pagination-pages">${pages.join('')}</div>
    </div>`;
  }

  // ── Naviguer vers un module ───────────────────────────────────
  function navigate(module, arg) {
    if (window.App && App.navigate) App.navigate(module, arg);
  }

  return { toast, openModal, closeModal, closeAllModals, setLoading, badge, formatPrice, formatDate, emptyState, confirm, paginationHTML, navigate };
})();

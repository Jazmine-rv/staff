// frontend/js/inactive.js
import { supabase } from './supabaseClient.js';
import { requireAuth, getStaffProfile, signOut } from './auth.js';

const THEME_KEY = 'staff-manager-theme';

// ---------- TEMA ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
}
function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const c = document.documentElement.dataset.theme || 'dark';
    applyTheme(c === 'dark' ? 'light' : 'dark');
  });
}

// ---------- UTILIDADES ----------
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { dateStyle: 'medium' });
}
function escapeHtml(str) {
  return String(str ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function showError(msg) {
  const el = document.getElementById('inactive-error');
  if (!el) return;
  el.textContent = msg; el.hidden = false;
}

// ---------- ESTADO ----------
const state = { all: [], filtered: [], query: '', sort: 'leave_desc', joinCounts: {} };

// ---------- CARGA ----------
async function loadInactive() {
  // 1) Miembros inactivos
  const { data: members, error: mErr } = await supabase
    .from('members')
    .select('id, discord_id, username, nickname, first_join_at, last_join_at, last_leave_at, is_active')
    .eq('is_active', false)
    .order('last_leave_at', { ascending: false, nullsFirst: false });
  if (mErr) throw mErr;

  // 2) Conteo de JOIN por discord_id (solo los necesarios)
  const ids = (members ?? []).map((m) => m.discord_id);
  let counts = {};
  if (ids.length > 0) {
    const { data: events, error: eErr } = await supabase
      .from('member_events')
      .select('discord_id, event_type')
      .in('discord_id', ids)
      .eq('event_type', 'JOIN');
    if (eErr) throw eErr;
    for (const ev of events ?? []) {
      counts[ev.discord_id] = (counts[ev.discord_id] || 0) + 1;
    }
  }

  state.all = members ?? [];
  state.joinCounts = counts;
  applyFiltersAndRender();
}

// ---------- FILTRO + ORDEN ----------
function applyFiltersAndRender() {
  const q = state.query.trim().toLowerCase();
  let list = state.all;
  if (q) {
    list = list.filter((m) =>
      (m.username ?? '').toLowerCase().includes(q) ||
      (m.nickname ?? '').toLowerCase().includes(q) ||
      (m.discord_id ?? '').toLowerCase().includes(q)
    );
  }
  list = [...list].sort((a, b) => {
    switch (state.sort) {
      case 'leave_asc':  return new Date(a.last_leave_at ?? 0) - new Date(b.last_leave_at ?? 0);
      case 'leave_desc': return new Date(b.last_leave_at ?? 0) - new Date(a.last_leave_at ?? 0);
      case 'username_asc':  return (a.username ?? '').localeCompare(b.username ?? '');
      case 'username_desc': return (b.username ?? '').localeCompare(a.username ?? '');
      default: return 0;
    }
  });
  state.filtered = list;
  render();
}

// ---------- RENDER ----------
function render() {
  const tbody = document.getElementById('inactive-body');
  const total = state.filtered.length;
  setText('inactive-count', `${total} inactivo${total === 1 ? '' : 's'}`);

  if (total === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="muted">No hay miembros inactivos.</td></tr>';
    return;
  }

  tbody.innerHTML = state.filtered.map((m, i) => {
    const joins = state.joinCounts[m.discord_id] ?? 0;
    const nick = m.nickname ? escapeHtml(m.nickname) : '<span class="muted">—</span>';
    return `
      <tr>
        <td class="muted">${i + 1}</td>
        <td>${escapeHtml(m.username)}</td>
        <td>${nick}</td>
        <td><code>${escapeHtml(m.discord_id)}</code></td>
        <td>${fmtDate(m.first_join_at)}</td>
        <td>${fmtDate(m.last_join_at)}</td>
        <td>${fmtDate(m.last_leave_at)}</td>
        <td>${joins}</td>
        <td><a class="link-btn" href="./member-detail.html?id=${encodeURIComponent(m.id)}">Ver ficha →</a></td>
      </tr>
    `;
  }).join('');
}

// ---------- UI ----------
function initControls() {
  document.getElementById('search-input')?.addEventListener('input', (e) => {
    state.query = e.target.value; applyFiltersAndRender();
  });
  document.getElementById('sort-select')?.addEventListener('change', (e) => {
    state.sort = e.target.value; applyFiltersAndRender();
  });
}
function initLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try { await signOut(); } finally { window.location.href = './index.html'; }
  });
}

// ---------- ARRANQUE ----------
(async () => {
  initTheme(); initControls(); initLogout();
  const session = await requireAuth();
  if (!session) return;
  try {
    const profile = await getStaffProfile();
    setText('staff-role', profile?.role ?? 'sin rol');
    setText('whoami', session.user.email);
  } catch (err) { console.error(err); }
  try { await loadInactive(); }
  catch (err) { console.error(err); showError('No se pudieron cargar los inactivos.'); }
})();
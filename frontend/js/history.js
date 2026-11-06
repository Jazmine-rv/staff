// frontend/js/history.js
import { supabase } from './supabaseClient.js';
import { requireAuth, getStaffProfile, signOut } from './auth.js';

const THEME_KEY = 'staff-manager-theme';
const MAX_EVENTS = 500;

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

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}
function escapeHtml(str) {
  return String(str ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function showError(msg) {
  const el = document.getElementById('history-error');
  if (!el) return; el.textContent = msg; el.hidden = false;
}

const state = { all: [], filtered: [], query: '', type: '', from: '', to: '' };

async function loadEvents() {
  const { data, error } = await supabase
    .from('member_events')
    .select('id, discord_id, event_type, event_at, username_snapshot, nickname_snapshot, is_rejoin')
    .order('event_at', { ascending: false })
    .limit(MAX_EVENTS);
  if (error) throw error;
  state.all = data ?? [];
  applyFilters();
}

function applyFilters() {
  const q = state.query.trim().toLowerCase();
  let list = state.all;

  if (q) {
    list = list.filter((ev) =>
      (ev.username_snapshot ?? '').toLowerCase().includes(q) ||
      (ev.nickname_snapshot ?? '').toLowerCase().includes(q) ||
      (ev.discord_id ?? '').toLowerCase().includes(q)
    );
  }

  if (state.type) {
    if (state.type === 'REJOIN') list = list.filter((ev) => ev.event_type === 'JOIN' && ev.is_rejoin);
    else list = list.filter((ev) => ev.event_type === state.type);
  }

  if (state.from) {
    const fromMs = new Date(state.from + 'T00:00:00').getTime();
    list = list.filter((ev) => new Date(ev.event_at).getTime() >= fromMs);
  }
  if (state.to) {
    const toMs = new Date(state.to + 'T23:59:59').getTime();
    list = list.filter((ev) => new Date(ev.event_at).getTime() <= toMs);
  }

  state.filtered = list;
  render();
}

function render() {
  const tbody = document.getElementById('history-body');
  const total = state.filtered.length;
  setText('history-count', `${total} evento${total === 1 ? '' : 's'}`);

  if (total === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">No hay eventos que coincidan.</td></tr>';
    return;
  }

  tbody.innerHTML = state.filtered.map((ev) => {
    const name = ev.nickname_snapshot || ev.username_snapshot || ev.discord_id;
    const isJoin = ev.event_type === 'JOIN';
    const badgeClass = isJoin ? 'badge badge-join' : 'badge badge-leave';
    const badgeText = isJoin ? (ev.is_rejoin ? 'REINGRESO' : 'INGRESO') : 'SALIDA';
    return `
      <tr>
        <td><span class="${badgeClass}">${badgeText}</span></td>
        <td>${escapeHtml(name)}</td>
        <td><code>${escapeHtml(ev.discord_id)}</code></td>
        <td>${fmtDateTime(ev.event_at)}</td>
      </tr>
    `;
  }).join('');
}

function initControls() {
  document.getElementById('search-input')?.addEventListener('input', (e) => {
    state.query = e.target.value; applyFilters();
  });
  document.getElementById('type-select')?.addEventListener('change', (e) => {
    state.type = e.target.value; applyFilters();
  });
  document.getElementById('date-from')?.addEventListener('change', (e) => {
    state.from = e.target.value; applyFilters();
  });
  document.getElementById('date-to')?.addEventListener('change', (e) => {
    state.to = e.target.value; applyFilters();
  });
}
function initLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try { await signOut(); } finally { window.location.href = './index.html'; }
  });
}

(async () => {
  initTheme(); initControls(); initLogout();
  const session = await requireAuth();
  if (!session) return;
  try {
    const profile = await getStaffProfile();
    setText('staff-role', profile?.role ?? 'sin rol');
    setText('whoami', profile?.display_name ?? session.user.email);
  } catch (err) { console.error(err); }
  try { await loadEvents(); }
  catch (err) { console.error(err); showError('No se pudo cargar el historial.'); }
})();
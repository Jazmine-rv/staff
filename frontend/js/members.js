// frontend/js/members.js
import { supabase } from './supabaseClient.js';
import { requireAuth, getStaffProfile, signOut } from './auth.js';

const THEME_KEY = 'staff-manager-theme';
const PAGE_SIZE = 10;

// ---------- TEMA ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
}
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

// ---------- UTILIDADES ----------
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { dateStyle: 'medium' });
}
function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function showError(msg) {
  const el = document.getElementById('members-error');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

// ---------- ESTADO ----------
const state = {
  all: [],        // todos los miembros activos
  filtered: [],   // tras búsqueda y orden
  page: 1,
  query: '',
  sort: 'joined_desc',
};

// ---------- CARGA ----------
async function loadMembers() {
  const { data, error } = await supabase
    .from('members')
    .select('id, discord_id, username, nickname, avatar_url, first_join_at, last_join_at, is_active')
    .eq('is_active', true)
    .order('last_join_at', { ascending: false });

  if (error) throw error;
  state.all = data ?? [];
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

  const sort = state.sort;
  list = [...list].sort((a, b) => {
    switch (sort) {
      case 'joined_asc':  return new Date(a.last_join_at) - new Date(b.last_join_at);
      case 'joined_desc': return new Date(b.last_join_at) - new Date(a.last_join_at);
      case 'username_asc':  return (a.username ?? '').localeCompare(b.username ?? '');
      case 'username_desc': return (b.username ?? '').localeCompare(a.username ?? '');
      default: return 0;
    }
  });

  state.filtered = list;
  const maxPage = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (state.page > maxPage) state.page = maxPage;
  render();
}

// ---------- RENDER ----------
function render() {
  const tbody = document.getElementById('members-body');
  const total = state.filtered.length;
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (state.page - 1) * PAGE_SIZE;
  const pageItems = state.filtered.slice(start, start + PAGE_SIZE);

  setText('members-count', `${total} miembro${total === 1 ? '' : 's'}`);
  setText('page-info', `Página ${state.page} de ${maxPage}`);

  document.getElementById('prev-page').disabled = state.page <= 1;
  document.getElementById('next-page').disabled = state.page >= maxPage;

  if (total === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="muted">No hay miembros que coincidan.</td></tr>';
    return;
  }

  tbody.innerHTML = pageItems.map((m, i) => {
    const rowNumber = start + i + 1; // numeración dinámica en frontend
    const avatar = m.avatar_url
      ? `<img class="avatar" src="${escapeHtml(m.avatar_url)}" alt="" loading="lazy" />`
      : `<span class="avatar avatar-fallback">${escapeHtml((m.username ?? '?').slice(0, 1).toUpperCase())}</span>`;
    const nickname = m.nickname ? escapeHtml(m.nickname) : '<span class="muted">—</span>';
    return `
      <tr>
        <td class="muted">${rowNumber}</td>
        <td>${avatar}</td>
        <td>${escapeHtml(m.username)}</td>
        <td>${nickname}</td>
        <td><code>${escapeHtml(m.discord_id)}</code></td>
        <td>${fmtDate(m.last_join_at)}</td>
        <td><span class="badge badge-join">ACTIVO</span></td>
        <td><a class="link-btn" href="./member-detail.html?id=${encodeURIComponent(m.id)}">Ver ficha →</a></td>
      </tr>
    `;
  }).join('');
}

// ---------- EVENTOS UI ----------
function initControls() {
  const search = document.getElementById('search-input');
  const sort = document.getElementById('sort-select');
  search?.addEventListener('input', (e) => {
    state.query = e.target.value;
    state.page = 1;
    applyFiltersAndRender();
  });
  sort?.addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.page = 1;
    applyFiltersAndRender();
  });
  document.getElementById('prev-page')?.addEventListener('click', () => {
    if (state.page > 1) { state.page--; render(); }
  });
  document.getElementById('next-page')?.addEventListener('click', () => {
    const maxPage = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    if (state.page < maxPage) { state.page++; render(); }
  });
}

function initLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try { await signOut(); } finally { window.location.href = './index.html'; }
  });
}

// ---------- REALTIME ----------
let realtimeChannel = null;
function subscribeRealtime() {
  realtimeChannel = supabase
    .channel('members-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => {
      loadMembers().catch(console.error);
    })
    .subscribe((status) => console.log('Realtime members:', status));
}
window.addEventListener('beforeunload', () => {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
});

// ---------- ARRANQUE ----------
(async () => {
  initTheme();
  initControls();
  initLogout();

  const session = await requireAuth();
  if (!session) return;

  try {
    const profile = await getStaffProfile();
    setText('staff-role', profile?.role ?? 'sin rol');
    setText('whoami', profile?.display_name ?? session.user.email);
  } catch (err) {
    console.error(err);
  }

  try {
    await loadMembers();
  } catch (err) {
    console.error(err);
    showError('No se pudieron cargar los miembros. Revisá RLS y la consola.');
  }
})();
// frontend/js/dashboard.js
import { supabase } from './supabaseClient.js';
import { requireAuth, getStaffProfile, signOut } from './auth.js';

// ---------- TEMA CLARO/OSCURO ----------
const THEME_KEY = 'staff-manager-theme';

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
function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function showError(msg) {
  const el = document.getElementById('dashboard-error');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

// ---------- ESTADÍSTICAS ----------
async function loadStats() {
  const todayISO = startOfTodayISO();

  const [activeRes, totalRes, joinsTodayRes, leavesTodayRes] = await Promise.all([
    supabase.from('members').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('members').select('*', { count: 'exact', head: true }),
    supabase.from('member_events').select('*', { count: 'exact', head: true })
      .eq('event_type', 'JOIN').gte('event_at', todayISO),
    supabase.from('member_events').select('*', { count: 'exact', head: true })
      .eq('event_type', 'LEAVE').gte('event_at', todayISO),
  ]);

  if (activeRes.error) throw activeRes.error;
  if (totalRes.error) throw totalRes.error;
  if (joinsTodayRes.error) throw joinsTodayRes.error;
  if (leavesTodayRes.error) throw leavesTodayRes.error;

  setText('stat-active', activeRes.count ?? 0);
  setText('stat-total', totalRes.count ?? 0);
  setText('stat-joins-today', joinsTodayRes.count ?? 0);
  setText('stat-leaves-today', leavesTodayRes.count ?? 0);
}

// ---------- ACTIVIDAD RECIENTE ----------
async function loadRecentActivity() {
  const { data, error } = await supabase
    .from('member_events')
    .select('id, discord_id, event_type, event_at, username_snapshot, nickname_snapshot, is_rejoin')
    .order('event_at', { ascending: false })
    .limit(10);

  if (error) throw error;

  const tbody = document.getElementById('recent-activity-body');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Sin actividad todavía.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((ev) => {
    const name = ev.nickname_snapshot || ev.username_snapshot || ev.discord_id;
    const isJoin = ev.event_type === 'JOIN';
    const badgeClass = isJoin ? 'badge badge-join' : 'badge badge-leave';
    const badgeText = isJoin ? (ev.is_rejoin ? 'REINGRESO' : 'INGRESO') : 'SALIDA';
    return `
      <tr>
        <td><span class="${badgeClass}">${badgeText}</span></td>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(ev.discord_id)}</td>
        <td>${fmtDateTime(ev.event_at)}</td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// ---------- LOGOUT ----------
function initLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try { await signOut(); } finally { window.location.href = './index.html'; }
  });
}

// ---------- REALTIME ----------
let realtimeChannel = null;

function subscribeRealtime() {
  realtimeChannel = supabase
    .channel('dashboard-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, () => {
      loadStats().catch(console.error);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'member_events' }, () => {
      loadStats().catch(console.error);
      loadRecentActivity().catch(console.error);
    })
    .subscribe((status) => {
      console.log('Realtime status:', status);
    });
}

window.addEventListener('beforeunload', () => {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
});

// ---------- ARRANQUE ----------
(async () => {
  initTheme();
  initLogout();

  const session = await requireAuth();
  if (!session) return;

  try {
    const profile = await getStaffProfile();
    setText('staff-name', profile?.display_name ?? session.user.email);
    setText('staff-role', profile?.role ?? 'sin rol');
    setText('whoami',  profile?.display_name ?? session.user.email);
  } catch (err) {
    console.error(err);
    setText('staff-name', session.user.email);
    setText('staff-role', 'sin perfil');
  }

  try {
    await Promise.all([loadStats(), loadRecentActivity()]);
  } catch (err) {
    console.error(err);
    showError('No se pudieron cargar los datos. Revisá la consola y las políticas RLS.');
  }

  subscribeRealtime();
})();
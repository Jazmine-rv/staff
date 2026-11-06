// frontend/js/characters.js
import { supabase } from './supabaseClient.js';
import { requireAuth, getStaffProfile, signOut } from './auth.js';

const THEME_KEY = 'staff-manager-theme';

let currentProfile = null;
const state = { all: [], filtered: [], occupied: new Set(), query: '', game: '' };

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
function escapeHtml(str) {
  return String(str ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function showError(msg) {
  const el = document.getElementById('chars-error');
  if (!el) return; el.textContent = msg; el.hidden = false;
  document.getElementById('chars-ok').hidden = true;
}
function showOk() {
  const ok = document.getElementById('chars-ok');
  ok.hidden = false;
  document.getElementById('chars-error').hidden = true;
  setTimeout(() => { ok.hidden = true; }, 2000);
}
const isAdmin = () => currentProfile?.role === 'admin';

// ---------- CARGA ----------
async function loadCharacters() {
  const { data, error } = await supabase
    .from('characters')
    .select('id, game, name')
    .order('game', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  state.all = data ?? [];

  // Personajes ocupados por miembros activos
  const { data: members, error: mErr } = await supabase
    .from('members')
    .select('character_id')
    .eq('is_active', true)
    .not('character_id', 'is', null);
  if (mErr) throw mErr;
  state.occupied = new Set((members ?? []).map((m) => m.character_id));

  applyFilters();
}

// ---------- FILTRO ----------
function applyFilters() {
  const q = state.query.trim().toLowerCase();
  let list = state.all;
  if (state.game) list = list.filter((c) => c.game === state.game);
  if (q) list = list.filter((c) => (c.name ?? '').toLowerCase().includes(q));
  state.filtered = list;
  render();
}

// ---------- RENDER ----------
function render() {
  const tbody = document.getElementById('chars-body');
  const total = state.filtered.length;
  setText('chars-count', `${total} personaje${total === 1 ? '' : 's'}`);

  if (total === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">No hay personajes que coincidan.</td></tr>';
    return;
  }

  tbody.innerHTML = state.filtered.map((c, i) => {
    const busy = state.occupied.has(c.id);
    const statusBadge = busy
      ? '<span class="badge badge-leave">OCUPADO</span>'
      : '<span class="badge badge-join">LIBRE</span>';
    const actions = isAdmin()
      ? `<button class="ghost-btn small" data-action="rename" data-id="${c.id}">Renombrar</button>
         <button class="ghost-btn small danger" data-action="delete" data-id="${c.id}">Borrar</button>`
      : '<span class="muted">—</span>';
    return `
      <tr>
        <td class="muted">${i + 1}</td>
        <td>${escapeHtml(c.game)}</td>
        <td>${escapeHtml(c.name)}</td>
        <td>${statusBadge}</td>
        <td>${actions}</td>
      </tr>`;
  }).join('');

  // Delegación de eventos para los botones
  tbody.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action, btn.dataset.id));
  });
}

// ---------- ACCIONES ----------
async function handleAction(action, id) {
  if (!isAdmin()) return;
  const ch = state.all.find((c) => c.id === id);
  if (!ch) return;

  if (action === 'rename') {
    const newName = prompt(`Nuevo nombre para "${ch.name}":`, ch.name);
    if (newName === null) return;
    const clean = newName.trim();
    if (!clean) return;
    try {
      const { error } = await supabase.from('characters').update({ name: clean }).eq('id', id);
      if (error) throw error;
      showOk();
      await loadCharacters();
    } catch (err) {
      console.error(err);
      showError(err.message ?? 'No se pudo renombrar.');
    }
  }

  if (action === 'delete') {
    if (state.occupied.has(id)) {
      showError('No se puede borrar un personaje asignado a un miembro activo.');
      return;
    }
    if (!confirm(`¿Borrar "${ch.name}" (${ch.game})?`)) return;
    try {
      const { error } = await supabase.from('characters').delete().eq('id', id);
      if (error) throw error;
      showOk();
      await loadCharacters();
    } catch (err) {
      console.error(err);
      showError(err.message ?? 'No se pudo borrar.');
    }
  }
}

// ---------- AÑADIR ----------
async function handleAdd(e) {
  e.preventDefault();
  const btn = document.getElementById('add-btn');
  const game = document.getElementById('new-game').value;
  const name = document.getElementById('new-name').value.trim();
  if (!game || !name) return;

  btn.disabled = true; btn.textContent = 'Añadiendo…';
  try {
    const { error } = await supabase.from('characters').insert({ game, name });
    if (error) {
      if (error.code === '23505') throw new Error('Ese personaje ya existe en ese juego.');
      throw error;
    }
    document.getElementById('new-name').value = '';
    showOk();
    await loadCharacters();
  } catch (err) {
    console.error(err);
    showError(err.message ?? 'No se pudo añadir.');
  } finally {
    btn.disabled = false; btn.textContent = 'Añadir personaje';
  }
}

// ---------- EXPORTAR TXT ----------
function exportFreeCharactersTxt() {
  // Solo los libres, agrupados por juego
  const free = state.all.filter((c) => !state.occupied.has(c.id));

  if (free.length === 0) {
    showError('No hay personajes libres para exportar.');
    return;
  }

  const order = [
    'Genshin Impact',
    'Honkai Star Rail',
    'Honkai Impact 3rd',
    'Zenless Zone Zero',
    'Wuthering Waves',
  ];

  const byGame = new Map();
  for (const c of free) {
    if (!byGame.has(c.game)) byGame.set(c.game, []);
    byGame.get(c.game).push(c.name);
  }

  const lines = [];
  for (const game of order) {
    const names = byGame.get(game);
    if (!names || names.length === 0) continue;
    names.sort((a, b) => a.localeCompare(b, 'es'));
    lines.push(`**${game}** (${names.length} libres)`);
    for (const n of names) lines.push(n);
    lines.push(''); // línea en blanco entre juegos
  }

  const txt = lines.join('\n').trimEnd() + '\n';
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `personajes-libres-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  showOk();
}
// ---------- UI ----------
function initControls() {
  document.getElementById('search-input')?.addEventListener('input', (e) => {
    state.query = e.target.value; applyFilters();
  });
  document.getElementById('game-filter')?.addEventListener('change', (e) => {
    state.game = e.target.value; applyFilters();
  });
  document.getElementById('add-character-form')?.addEventListener('submit', handleAdd);
  document.getElementById('export-btn')?.addEventListener('click', exportFreeCharactersTxt);
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
    currentProfile = await getStaffProfile();
    setText('staff-role', currentProfile?.role ?? 'sin rol');
    setText('whoami', currentProfile?.display_name ?? session.user.email);
  } catch (err) { console.error(err); }
  try { await loadCharacters(); }
  catch (err) { console.error(err); showError('No se pudieron cargar los personajes.'); }
})();
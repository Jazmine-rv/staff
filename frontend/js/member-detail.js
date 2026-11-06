// frontend/js/member-detail.js
import { supabase } from './supabaseClient.js';
import { requireAuth, getStaffProfile, signOut } from './auth.js';

const THEME_KEY = 'staff-manager-theme';
const params = new URLSearchParams(window.location.search);
const memberId = params.get('id');

let currentSession = null;
let currentProfile = null;

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
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}
function escapeHtml(str) {
  return String(str ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v ?? ''; }
function showError(msg) {
  const el = document.getElementById('detail-error');
  if (!el) return; el.textContent = msg; el.hidden = false;
  document.getElementById('detail-ok').hidden = true;
}
function showOk() {
  const ok = document.getElementById('detail-ok');
  ok.hidden = false;
  document.getElementById('detail-error').hidden = true;
  setTimeout(() => { ok.hidden = true; }, 2500);
}
// ---------- CATÁLOGO DE PERSONAJES ----------
let charactersCatalog = []; // [{id, name, game}]

async function loadCharactersCatalog() {
  const { data, error } = await supabase
    .from('characters')
    .select('id, name, game')
    .order('game', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  charactersCatalog = data ?? [];
}

  try {
    await loadCharactersCatalog();
    const member = await loadMember();
    await loadHistory(member.discord_id);
  } catch (err) {
    console.error(err);
    showError(err.message || 'No se pudo cargar la ficha.');
  }
  
// Personajes ocupados por miembros activos (excluyendo al miembro actual)
async function getOccupiedCharacterIds(currentMemberId) {
  const { data, error } = await supabase
    .from('members')
    .select('character_id')
    .eq('is_active', true)
    .not('character_id', 'is', null)
    .neq('id', currentMemberId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.character_id));
}

// Rellena el <select> agrupado por juego, con los disponibles + el actual
function populateCharacterSelect(availableIds, currentCharacterId, currentMemberId) {
  const select = document.getElementById('f-character');
  if (!select) return;

  // Agrupar por juego
  const byGame = new Map();
  for (const c of charactersCatalog) {
    if (!byGame.has(c.game)) byGame.set(c.game, []);
    byGame.get(c.game).push(c);
  }

  // Limpiar manteniendo la opción vacía
  select.innerHTML = '<option value="">— Sin personaje —</option>';

  for (const [game, list] of [...byGame.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const group = document.createElement('optgroup');
    group.label = game;
    for (const c of list) {
      const isCurrent = c.id === currentCharacterId;
      const isOccupied = availableIds.has(c.id);
      if (isOccupied && !isCurrent) continue; // ocupado por otro activo
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      opt.dataset.game = c.game;
      if (isCurrent) opt.selected = true;
      group.appendChild(opt);
    }
    if (group.children.length > 0) select.appendChild(group);
  }
}

// Autocompleta el juego al cambiar el personaje
function bindCharacterGameAutofill() {
  const select = document.getElementById('f-character');
  const gameInput = document.getElementById('f-game');
  if (!select || !gameInput) return;

  const update = () => {
    const opt = select.selectedOptions[0];
    gameInput.value = opt?.dataset?.game ?? '';
  };
  select.addEventListener('change', update);
  update(); // estado inicial
}

// ---------- CARGA ----------
async function loadMember() {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('id', memberId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Miembro no encontrado');

  // --- Cabecera ---
  setText('profile-display', data.nickname || data.username || data.discord_id);
  setText('profile-username', data.username);
  setText('profile-discord-id', data.discord_id);
  setText('profile-nickname', data.nickname ? `(${data.nickname})` : '');

  const avatar = document.getElementById('profile-avatar');
  if (data.avatar_url) { avatar.src = data.avatar_url; avatar.alt = data.username ?? ''; }
  else { avatar.style.display = 'none'; }

  const status = document.getElementById('profile-status');
  status.textContent = data.is_active ? 'ACTIVO' : 'INACTIVO';
  status.className = 'badge ' + (data.is_active ? 'badge-join' : 'badge-leave');

  // --- Datos Discord ---
  setText('k-first-join', fmtDateTime(data.first_join_at));
  setText('k-last-join', fmtDateTime(data.last_join_at));
  setText('k-last-leave', fmtDateTime(data.last_leave_at));

  // --- Formulario ---
  setVal('f-real-name', data.real_name);
  setVal('f-age', data.age);
  setVal('f-country', data.country);
  setVal('f-alias', data.alias);
  setVal('f-observations', data.observations);
  setVal('f-notes', data.internal_notes);

  // --- Meta de notas (5.5) ---
  if (data.staff_notes_updated_at) {
    const meta = document.getElementById('notes-meta');
    meta.hidden = false;
    meta.textContent = `Notas actualizadas por ${data.staff_notes_updated_by ?? '—'} el ${fmtDateTime(data.staff_notes_updated_at)}`;
  }

  // --- Personaje (6.2) ---
  if (data.character_id) {
    const ch = charactersCatalog.find((c) => c.id === data.character_id);
    if (ch) {
      const pc = document.getElementById('profile-character');
      pc.hidden = false;
      pc.textContent = `Personaje: ${ch.name} — ${ch.game}`;
    }
  }

  // Selector de personaje (6.2)
  const occupied = await getOccupiedCharacterIds(data.id);
  populateCharacterSelect(occupied, data.character_id, data.id);
  bindCharacterGameAutofill();

  return data;
}

async function loadHistory(discordId) {
  const { data, error } = await supabase
    .from('member_events')
    .select('id, event_type, event_at, username_snapshot, nickname_snapshot, is_rejoin')
    .eq('discord_id', discordId)
    .order('event_at', { ascending: false });
  if (error) throw error;

  const tbody = document.getElementById('history-body');
  const events = data ?? [];
  if (events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Sin eventos registrados.</td></tr>';
    return;
  }

  // Conteo de ingresos para el KV
  const joins = events.filter((e) => e.event_type === 'JOIN').length;
  setText('k-joins', String(joins));

  tbody.innerHTML = events.map((ev) => {
    const isJoin = ev.event_type === 'JOIN';
    const cls = isJoin ? 'badge badge-join' : 'badge badge-leave';
    const txt = isJoin ? (ev.is_rejoin ? 'REINGRESO' : 'INGRESO') : 'SALIDA';
    return `
      <tr>
        <td><span class="${cls}">${txt}</span></td>
        <td>${fmtDateTime(ev.event_at)}</td>
        <td>${escapeHtml(ev.username_snapshot ?? '—')}</td>
        <td>${ev.nickname_snapshot ? escapeHtml(ev.nickname_snapshot) : '<span class="muted">—</span>'}</td>
      </tr>`;
  }).join('');
}

// ---------- GUARDAR ----------
async function saveChanges(e) {
  e.preventDefault();
  const btn = document.getElementById('save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  const characterId = document.getElementById('f-character').value || null;


  const updates = {
    real_name: document.getElementById('f-real-name').value.trim() || null,
    age: document.getElementById('f-age').value ? Number(document.getElementById('f-age').value) : null,
    country: document.getElementById('f-country').value.trim() || null,
    alias: document.getElementById('f-alias').value.trim() || null,
    observations: document.getElementById('f-observations').value.trim() || null,
    internal_notes: document.getElementById('f-notes').value.trim() || null,
    staff_notes_updated_by: currentSession?.user?.email ?? null,
    staff_notes_updated_at: new Date().toISOString(),
    character_id: characterId,
  };

  try {
    const { error } = await supabase.from('members').update(updates).eq('id', memberId);
    if (error) throw error;
    showOk();
    const meta = document.getElementById('notes-meta');
    meta.hidden = false;
    meta.textContent = `Notas actualizadas por ${updates.staff_notes_updated_by ?? '—'} el ${fmtDateTime(updates.staff_notes_updated_at)}`;
    } catch (err) {
    console.error(err);
    const msg = err?.message?.includes('Solo un administrador')
      ? 'Solo un administrador puede asignar o cambiar personajes.'
      : 'No se pudo guardar. Revisá RLS y la consola.';
    showError(msg);
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar cambios';
  }
}

function initLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try { await signOut(); } finally { window.location.href = './index.html'; }
  });
}

// ---------- ARRANQUE ----------
(async () => {
  initTheme(); initLogout();

  if (!memberId) {
    showError('Falta el parámetro ?id en la URL.');
    return;
  }

  currentSession = await requireAuth();
  if (!currentSession) return;

  try {
    currentProfile = await getStaffProfile();
    setText('staff-role', currentProfile?.role ?? 'sin rol');
    setText('whoami', currentSession.user.email);
  } catch (err) { console.error(err); }

  try {
    const member = await loadMember();
    await loadHistory(member.discord_id);
  } catch (err) {
    console.error(err);
    showError(err.message || 'No se pudo cargar la ficha.');
  }

  document.getElementById('edit-form')?.addEventListener('submit', saveChanges);
})();
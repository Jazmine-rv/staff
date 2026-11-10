// frontend/js/characters-public.js
import { supabase } from './supabaseClient.js';

const state = { all: [], query: '', game: '' };

const GAME_ORDER = [
  'Genshin Impact',
  'Honkai Star Rail',
  'Honkai Impact 3rd',
  'Zenless Zone Zero',
  'Wuthering Waves',
];

function escapeHtml(str) {
  return String(str ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function showError(msg) {
  const el = document.getElementById('pub-error');
  if (!el) return; el.textContent = msg; el.hidden = false;
}

async function load() {
  const { data, error } = await supabase
    .from('public_characters_view')
    .select('id, game, name, is_occupied')
    .order('game', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  state.all = data ?? [];
  render();
}

function render() {
  const q = state.query.trim().toLowerCase();
  let list = state.all;
  if (state.game) list = list.filter((c) => c.game === state.game);
  if (q) list = list.filter((c) => (c.name ?? '').toLowerCase().includes(q));

  const free = list.filter((c) => !c.is_occupied).length;
  setText('pub-count', `${list.length} personajes · ${free} libres · ${list.length - free} ocupados`);

  const container = document.getElementById('pub-groups');
  if (list.length === 0) {
    container.innerHTML = '<p class="muted">No hay personajes que coincidan.</p>';
    return;
  }

  const byGame = new Map();
  for (const c of list) {
    if (!byGame.has(c.game)) byGame.set(c.game, []);
    byGame.get(c.game).push(c);
  }

  const games = [...byGame.keys()].sort((a, b) => {
    const ia = GAME_ORDER.indexOf(a); const ib = GAME_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  container.innerHTML = games.map((game) => {
    const items = byGame.get(game).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return `
      <section class="public-group">
        <h2>${escapeHtml(game)} <span class="muted">(${items.length})</span></h2>
        <ul class="public-list">
          ${items.map((c) => `
            <li>
              <span>${escapeHtml(c.name)}</span>
              <span class="badge ${c.is_occupied ? 'badge-leave' : 'badge-join'}">
                ${c.is_occupied ? 'OCUPADO' : 'LIBRE'}
              </span>
            </li>`).join('')}
        </ul>
      </section>`;
  }).join('');
}

function initControls() {
  document.getElementById('search-input')?.addEventListener('input', (e) => {
    state.query = e.target.value; render();
  });
  document.getElementById('game-filter')?.addEventListener('change', (e) => {
    state.game = e.target.value; render();
  });
}

(async () => {
  initControls();
  try { await load(); }
  catch (err) { console.error(err); showError('No se pudo cargar la lista.'); }
})();
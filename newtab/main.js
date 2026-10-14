// ───────────────────────────────────────────────────────────────
//  Nueva pestaña: grilla, carpetas, menú contextual, editor de
//  sitios y "deshacer".
// ───────────────────────────────────────────────────────────────
import * as store from './store.js';
import * as images from './images.js';
import { DEFAULTS, loadAll, saveSettings, flushSettings, isOwnSettingsWrite, saveTiles, applySettings } from './settings.js';
import { initDnd } from './dnd.js';
import { el, button } from '../shared/dom.js';
import { faviconUrl, isGeneric } from '../shared/favicon.js';

const $ = sel => document.querySelector(sel);
const FOLDER_NAME = 'Carpeta';
const FAVICON_SIZE = devicePixelRatio > 1 ? 128 : 64;

// Ajustes que obligan a hacer algo más que cambiar CSS.
const RENDER_KEYS = ['iconMode', 'openInNewTab'];
const ELEMENT_KEYS = ['showClock', 'clock24', 'greeting'];
const WALLPAPER_KEYS = ['bgType', 'bgFile', 'bgImageUrl', 'bgBlur'];
const FOLDER_SIZE_KEYS = ['cols', 'tileWidth', 'gap', 'maxWidth', 'showAdd'];

const state = {
  rootId: null,
  tree: null,             // carpeta SpeedDial con todos sus hijos
  byId: new Map(),        // id → nodo, para búsquedas rápidas
  settings: { ...DEFAULTS },
  tiles: {},              // personalización por tarjeta: { [id]: { icon, bg } }
  folderId: null,         // carpeta abierta (o null)
  dragging: false,        // mientras arrastras no se redibuja...
  dirty: false,           // ...pero se recuerda que hubo cambios
  newFolder: null,        // carpeta recién creada al combinar dos sitios: se abre para ponerle nombre
};
let settingsUI = null;

start().catch(err => {
  console.error(err);
  $('#grid').textContent = 'No se pudo cargar el Speed Dial: ' + err.message;
});

async function start() {
  const saved = await loadAll();              // una sola lectura de storage
  state.settings = saved.settings;
  state.tiles = saved.tiles;
  applySettings(state.settings);

  state.rootId = await store.init(saved.rootId);
  await refresh();
  updateElements();
  bindEvents();
  initDnd(dndContext);
  store.watch(scheduleRefresh, id => state.byId.has(id));
  chrome.storage.onChanged.addListener(onStorageChanged);
  images.loadWallpaper(state.settings);

  if (state.settings.showSearch && state.settings.searchFocus) $('#q').focus();
  // La animación de entrada corre solo al abrir la pestaña, no cada vez que se redibuja.
  setTimeout(() => document.documentElement.classList.add('settled'), 1500);
  requestIdleCallback(pruneTiles);
}

// ── Datos ───────────────────────────────────────────────────────

async function refresh() {
  // Si borraron la carpeta SpeedDial desde el gestor de marcadores, se crea otra.
  state.tree = await store.getTree().catch(async () => {
    state.rootId = await store.init();
    return store.getTree();
  });
  state.byId = new Map();
  (function index(node) {
    state.byId.set(node.id, node);
    node.children?.forEach(index);
  })(state.tree);
  render();
}

// Varios cambios seguidos (ej. combinar = 3 operaciones) producen un solo redibujo.
let refreshTimer = 0;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 30);
}

// ── Dibujo ──────────────────────────────────────────────────────

function render() {
  if (state.dragging) { state.dirty = true; return; }
  state.dirty = false;
  fillGrid($('#grid'), state.tree.children ?? [], state.rootId, true);

  if (state.byId.has(state.newFolder)) {
    openFolder(state.newFolder, true);
    state.newFolder = null;
  } else if (state.folderId) {
    const folder = state.byId.get(state.folderId);
    if (folder && !folder.url) fillFolder(folder);
    else closeFolder();
  }
}

function fillGrid(grid, nodes, parentId, isRoot) {
  // Un solo nivel de carpetas: dentro de una carpeta, las subcarpetas no se muestran.
  const tiles = nodes.filter(n => n.url || isRoot).map((node, i) => {
    const tile = node.url ? siteTile(node) : folderTile(node);
    tile.style.setProperty('--i', Math.min(i, 40));   // orden para la animación en cascada
    return tile;
  });
  grid.replaceChildren(...tiles, addTile(parentId));
}

function tileBase(tag, node, kind, ...children) {
  const tile = el(tag, 'tile ' + kind, ...children);
  tile.draggable = true;
  tile.dataset.id = node.id;
  tile.dataset.index = node.index;
  const bg = state.tiles[node.id]?.bg;
  if (bg) tile.style.setProperty('--tile-custom', bg);
  return tile;
}

function siteTile(node) {
  const a = tileBase('a', node, 'site', thumb(iconFor(node)), label(node.title || hostOf(node.url)));
  a.href = node.url;
  if (state.settings.openInNewTab) a.target = '_blank';
  a.title = (node.title ? node.title + '\n' : '') + node.url;
  return a;
}

function folderTile(node) {
  const sites = (node.children ?? []).filter(n => n.url);
  const name = node.title || FOLDER_NAME;
  const mini = el('span', 'mini');   // miniatura 2×2 con los primeros sitios
  for (let k = 0; k < 4; k++) mini.append(el('span', 'cell', sites[k] && iconFor(sites[k])));
  const tile = tileBase('div', node, 'folder', thumb(mini), label(name));
  tile.tabIndex = 0;
  tile.setAttribute('role', 'button');
  tile.title = `${name} (${sites.length})`;
  return tile;
}

function addTile(parentId) {
  const b = el('button', 'tile add', thumb(el('span', 'plus', '+')), label(''));
  b.type = 'button';
  b.dataset.parent = parentId;
  b.title = 'Agregar sitio';
  b.setAttribute('aria-label', 'Agregar sitio');
  return b;
}

const thumb = child => el('span', 'thumb', child);
const label = text => el('span', 'label', text);

function iconFor(node) {
  const custom = state.tiles[node.id]?.icon;
  switch (custom?.type) {
    case 'text': return el('span', 'text-icon', custom.value);
    case 'url': return imgIcon(custom.value, node);
    case 'file': return fileIcon(node, custom.v);
    case 'letter': return letterIcon(node);
  }
  return state.settings.iconMode === 'letter' ? letterIcon(node) : faviconIcon(node);
}

// Brave entrega el mismo globo genérico para todo sitio que nunca visitaste:
// en su lugar se muestra la inicial.
const hasFavicon = new Map();   // dirección → true/false, o la comprobación en curso

function faviconIcon(node) {
  let known = hasFavicon.get(node.url);
  if (known === false) return letterIcon(node);
  const img = imgIcon(faviconUrl(node.url, FAVICON_SIZE), node);
  if (known !== true) {
    img.classList.add('checking');   // invisible hasta saber si es el globo
    if (!known) hasFavicon.set(node.url, known = checkFavicon(node.url));
    known.then(ok => (ok ? img.classList.remove('checking') : img.replaceWith(letterIcon(node))));
  }
  return img;
}

async function checkFavicon(url) {
  let ok = true;
  try {
    const blob = await (await fetch(faviconUrl(url, FAVICON_SIZE))).blob();
    ok = !(await isGeneric(blob, FAVICON_SIZE));
  } catch {}
  hasFavicon.set(url, ok);
  return ok;
}

function imgIcon(src, node) {
  const img = new Image();
  img.className = 'fav';
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.onerror = () => img.replaceWith(letterIcon(node));
  if (src) img.src = src;
  return img;
}

// Ícono subido como archivo (guardado en IndexedDB).
function fileIcon(node, version) {
  const img = imgIcon(null, node);
  images.url('tile:' + node.id, version).then(u => (u ? (img.src = u) : img.replaceWith(letterIcon(node))));
  return img;
}

function letterIcon(node) {
  const host = hostOf(node.url ?? '');
  const icon = el('span', 'letter', ([...(node.title || host || '?').trim()][0] ?? '?').toUpperCase());
  icon.style.setProperty('--hue', hash(host || node.title || '') % 360);
  return icon;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) | 0;
  return Math.abs(h);
}

// ── Carpetas ────────────────────────────────────────────────────

function openFolder(id, rename = false) {
  const folder = state.byId.get(id);
  if (!folder || folder.url) return;
  state.folderId = id;
  fillFolder(folder);
  const overlay = $('#folder-view');
  overlay.inert = false;
  overlay.classList.remove('drag-out');
  overlay.classList.add('open');
  const title = $('#folder-title');
  if (rename) { title.focus(); title.select(); }
  else ($('#folder-grid .tile') ?? title).focus({ preventScroll: true });
}

function fillFolder(folder) {
  const title = $('#folder-title');
  if (document.activeElement !== title) title.value = folder.title;
  fillGrid($('#folder-grid'), folder.children ?? [], folder.id, false);
  sizeFolderGrid(folder);
}

// Columnas del panel: las justas para el contenido, sin pasarse del ancho disponible.
function sizeFolderGrid(folder) {
  const s = state.settings;
  const count = (folder.children ?? []).filter(n => n.url).length + (s.showAdd ? 1 : 0);
  const avail = Math.min(innerWidth - 96, s.maxWidth);
  const fit = Math.max(1, Math.floor((avail + s.gap) / (s.tileWidth + s.gap)));
  $('#folder-grid').style.setProperty('--cols', Math.max(1, Math.min(count, s.cols || fit, fit)));
}

function closeFolder() {
  if (!state.folderId) return;
  const id = state.folderId;
  state.folderId = null;
  const overlay = $('#folder-view');
  overlay.classList.remove('open', 'drag-out');
  overlay.inert = true;
  $(`#grid .tile[data-id="${id}"]`)?.focus({ preventScroll: true });
}

const dndContext = {
  rootId: () => state.rootId,
  folderId: () => state.folderId,
  openFolder: id => openFolder(id),
  startDrag() { state.dragging = true; },
  endDrag() {
    if ($('#folder-view').classList.contains('drag-out')) closeFolder();
    state.dragging = false;
    if (state.dirty) render();
  },
  // id: tarjeta arrastrada desde esta página · link: algo arrastrado desde afuera.
  async drop(spot, id, link) {
    if (link) id = (await store.create({ title: link.title || hostOf(link.url), url: link.url, ...spot.dest })).id;
    else if (id && spot.mode !== 'combine') return store.move(id, spot.dest);
    const target = state.byId.get(spot.targetId);
    if (id && target && spot.mode === 'combine') state.newFolder = await store.combine(id, target);
  },
};

// ── Eventos ─────────────────────────────────────────────────────

function bindEvents() {
  document.addEventListener('click', onClick);
  document.addEventListener('auxclick', e => { if (e.button === 1) onSiteClick(e); });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#menu')) hideMenu(); }, true);
  window.addEventListener('blur', hideMenu);
  window.addEventListener('resize', () => {
    hideMenu();
    if (state.folderId) sizeFolderGrid(state.byId.get(state.folderId));
  });

  // Clic en el fondo oscuro cierra la carpeta (solo si el clic empezó ahí,
  // para no cerrarla al seleccionar texto del título y soltar afuera).
  const overlay = $('#folder-view');
  let downOnBackdrop = false;
  overlay.addEventListener('pointerdown', e => { downOnBackdrop = e.target === overlay; });
  overlay.addEventListener('click', e => { if (downOnBackdrop && e.target === overlay) closeFolder(); });

  const title = $('#folder-title');
  title.addEventListener('change', () => {
    if (state.folderId) store.update(state.folderId, { title: title.value.trim() || FOLDER_NAME });
  });
  title.addEventListener('keydown', e => { if (e.key === 'Enter') title.blur(); });

  $('#search').addEventListener('submit', onSearch);
  $('#settings-btn').addEventListener('click', toggleSettings);
  setupEditor();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushSettings();
    else if (state.settings.showClock) updateElements();   // el reloj se corrige al volver
  });
  window.addEventListener('pagehide', flushSettings);
}

function onClick(e) {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'close-folder') return closeFolder();
  if (action === 'close-settings') return settingsUI?.close();
  if (action === 'cancel-editor') return $('#editor').close('');

  const tile = e.target.closest('.tile');
  if (!tile) return;
  if (tile.classList.contains('folder')) openFolder(tile.dataset.id);
  else if (tile.classList.contains('add')) openEditor({ kind: 'site', parentId: tile.dataset.parent });
  else onSiteClick(e);
}

// Los links web los abre el propio navegador (clic, Ctrl+clic, clic central).
// Las direcciones internas (brave://, chrome://, file://) hay que abrirlas con la API.
function onSiteClick(e) {
  const a = e.target.closest('a.tile');
  if (!a) return;
  const url = a.getAttribute('href');
  if (/^https?:/i.test(url)) return;
  e.preventDefault();
  if (/^javascript:/i.test(url)) return toast('Los bookmarklets no funcionan desde la nueva pestaña.');
  const background = e.ctrlKey || e.metaKey || e.button === 1;
  if (background || e.shiftKey || state.settings.openInNewTab) chrome.tabs.create({ url, active: !background });
  else chrome.tabs.update({ url });
}

function onKeyDown(e) {
  const menu = $('#menu');
  if (e.key === 'Escape') {
    if (!menu.hidden) return hideMenu();
    if ($('#editor').open) return;                  // el diálogo maneja su propio Esc
    if (state.folderId) {
      $('#folder-title').blur();                    // guarda el nombre si lo estabas editando
      return closeFolder();
    }
    if (settingsUI?.isOpen()) return settingsUI.close();
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.tile.folder')) {
    e.preventDefault();
    openFolder(e.target.dataset.id);
  }
  if (!menu.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const items = [...menu.querySelectorAll('button:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }
}

function onSearch(e) {
  e.preventDefault();
  const text = $('#q').value.trim();
  if (/^https?:\/\/\S+$/i.test(text)) location.href = text;
  else if (text) chrome.search.query({ text, disposition: 'CURRENT_TAB' });
}

// ── Reloj y saludo ──────────────────────────────────────────────

let clockTimer = 0;
function updateElements() {
  $('#greeting').textContent = state.settings.greeting;
  clearTimeout(clockTimer);
  if (state.settings.showClock) tick();
}

function tick() {
  const now = new Date();
  $('#time').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !state.settings.clock24 });
  $('#date').textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  // Una actualización por minuto, justo cuando cambia el minuto.
  clockTimer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 20);
}

// ── Menú contextual ─────────────────────────────────────────────

function onContextMenu(e) {
  // Shift + clic derecho (o sobre campos de texto) deja el menú normal de Brave.
  if (e.shiftKey || e.target.closest('input, textarea, select, dialog, .drawer')) return;
  e.preventDefault();
  const tile = e.target.closest('.tile');
  const node = state.byId.get(tile?.dataset.id);
  const items = node?.url ? siteMenu(node)
    : node ? folderMenu(node)
    : backgroundMenu(e.target.closest('#folder-view') ? state.folderId : state.rootId);

  let { clientX: x, clientY: y } = e;
  if (!x && !y && tile) {                           // abierto con el teclado
    const r = tile.getBoundingClientRect();
    x = r.left + 12;
    y = r.bottom - 12;
  }
  showMenu(items, x, y);
}

function siteMenu(n) {
  return [
    { label: 'Abrir en pestaña nueva', run: () => chrome.tabs.create({ url: n.url, active: false }) },
    { label: 'Abrir en ventana nueva', run: () => chrome.windows.create({ url: n.url }) },
    { label: 'Copiar dirección', run: () => navigator.clipboard.writeText(n.url) },
    '-',
    { label: 'Editar…', run: () => openEditor({ kind: 'site', id: n.id }) },
    { label: 'Eliminar', danger: true, run: () => removeWithUndo(n.id) },
  ];
}

function folderMenu(n) {
  const urls = (n.children ?? []).filter(c => c.url).map(c => c.url);
  return [
    { label: 'Abrir carpeta', run: () => openFolder(n.id) },
    { label: `Abrir todo (${urls.length})`, disabled: !urls.length, run: () => openAll(urls) },
    { label: 'Abrir todo en un grupo', disabled: !urls.length, run: () => openAll(urls, n.title || FOLDER_NAME) },
    '-',
    { label: 'Editar…', run: () => openEditor({ kind: 'folder', id: n.id }) },
    { label: 'Eliminar carpeta', danger: true, run: () => removeWithUndo(n.id) },
  ];
}

function backgroundMenu(parentId) {
  return [
    { label: 'Agregar sitio…', run: () => openEditor({ kind: 'site', parentId }) },
    parentId === state.rootId && { label: 'Nueva carpeta…', run: () => openEditor({ kind: 'folder' }) },
    '-',
    { label: 'Personalizar…', run: toggleSettings },
  ].filter(Boolean);
}

function showMenu(items, x, y) {
  const menu = $('#menu');
  menu.replaceChildren(...items.map(item => {
    if (item === '-') return el('div', 'sep');
    const b = button(item.label, () => { hideMenu(); item.run(); }, item.danger ? 'danger' : '');
    b.setAttribute('role', 'menuitem');
    b.disabled = !!item.disabled;
    return b;
  }));
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
}

function hideMenu() {
  $('#menu').hidden = true;
}

async function openAll(urls, groupTitle) {
  const tabs = [];
  for (const url of urls) tabs.push(await chrome.tabs.create({ url, active: false }));   // en orden
  if (groupTitle) {
    const groupId = await chrome.tabs.group({ tabIds: tabs.map(t => t.id) });
    await chrome.tabGroups.update(groupId, { title: groupTitle });
  }
  chrome.tabs.update(tabs[0].id, { active: true });
}

// ── Editor (agregar / editar) ───────────────────────────────────

let editorJob = null;   // { kind, node }
const fields = () => $('#editor-form').elements;

function setupEditor() {
  const dialog = $('#editor');
  const F = fields();
  F.iconType.addEventListener('change', () => { dialog.dataset.icon = F.iconType.value; });
  F.bg.addEventListener('input', () => { F.bgOn.checked = true; });
  F.url.addEventListener('input', () => F.url.setCustomValidity(''));
  // Valida la dirección antes de cerrar; si no sirve, el diálogo sigue abierto.
  $('#editor-form').addEventListener('submit', e => {
    if (editorJob?.kind !== 'site') return;
    const ok = isValidUrl(normalizeUrl(F.url.value));
    F.url.setCustomValidity(ok ? '' : 'Escribe una dirección válida, por ejemplo: ejemplo.com');
    if (!ok) { e.preventDefault(); F.url.reportValidity(); }
  });
  dialog.addEventListener('close', () => {
    const job = editorJob;
    editorJob = null;
    if (dialog.returnValue === 'ok' && job) saveEditor(job, F).catch(err => toast('No se pudo guardar: ' + err.message));
  });
}

function openEditor({ kind, id = null, parentId = state.rootId }) {
  const dialog = $('#editor');
  const F = fields();
  const node = state.byId.get(id);
  const custom = state.tiles[id] ?? {};
  const isSite = kind === 'site';
  editorJob = { kind, node };

  $('#editor-form').reset();
  dialog.classList.toggle('is-folder', !isSite);
  $('#editor-title').textContent = isSite ? (node ? 'Editar sitio' : 'Agregar sitio') : (node ? 'Editar carpeta' : 'Nueva carpeta');
  F.label.value = node?.title ?? '';
  F.url.value = node?.url ?? '';
  F.url.required = isSite;
  F.url.setCustomValidity('');
  const folders = (state.tree.children ?? []).filter(n => !n.url);
  F.parent.replaceChildren(new Option('Inicio', state.rootId), ...folders.map(n => new Option(n.title || FOLDER_NAME, n.id)));
  F.parent.value = node?.parentId ?? parentId;
  F.iconType.value = custom.icon?.type ?? '';
  F.iconText.value = custom.icon?.type === 'text' ? custom.icon.value : '';
  F.iconUrl.value = custom.icon?.type === 'url' ? custom.icon.value : '';
  F.bgOn.checked = !!custom.bg;
  F.bg.value = custom.bg ?? state.settings.tileBg;
  dialog.dataset.icon = F.iconType.value;
  dialog.returnValue = '';
  dialog.showModal();
  (isSite && !node ? F.url : F.label).focus();
}

async function saveEditor({ kind, node }, F) {
  const name = F.label.value.trim();
  const bg = F.bgOn.checked ? F.bg.value : undefined;

  if (kind === 'folder') {
    const title = name || FOLDER_NAME;
    let id = node?.id;
    if (!node) id = (await store.create({ parentId: state.rootId, title })).id;
    else if (node.title !== title) await store.update(id, { title });
    return setTileCustom(id, { bg });
  }

  const url = normalizeUrl(F.url.value);
  const title = name || hostOf(url);
  const parentId = F.parent.value;
  let id = node?.id;
  if (!node) {
    id = (await store.create({ parentId, title, url })).id;
  } else {
    if (title !== node.title || url !== node.url) await store.update(id, { title, url });
    if (parentId !== node.parentId) await store.move(id, { parentId });
  }
  const icon = await readIconField(id, F, state.tiles[id]?.icon);
  await setTileCustom(id, { icon, bg });
}

async function readIconField(id, F, previous) {
  const text = F.iconText.value.trim();
  const url = F.iconUrl.value.trim();
  switch (F.iconType.value) {
    case 'letter': return { type: 'letter' };
    case 'text': return text ? { type: 'text', value: text } : undefined;
    case 'url': return url ? { type: 'url', value: url } : undefined;
    case 'file': {
      const file = F.iconFile.files[0];
      if (!file) return previous?.type === 'file' ? previous : undefined;
      await images.put('tile:' + id, await images.shrink(file, 256));   // un ícono no necesita más
      return { type: 'file', v: Date.now() };
    }
  }
  return undefined;   // automático
}

async function setTileCustom(id, patch) {
  const next = { ...state.tiles[id], ...patch };
  for (const k in next) if (next[k] === undefined) delete next[k];
  // Si el ícono era un archivo y ya no, se borra el archivo.
  if (state.tiles[id]?.icon?.type === 'file' && next.icon?.type !== 'file') images.del('tile:' + id).catch(() => {});
  state.tiles = { ...state.tiles, [id]: next };
  if (!Object.keys(next).length) delete state.tiles[id];
  await saveTiles(state.tiles);
  render();
}

function normalizeUrl(text) {
  const s = text.trim();
  if (!s) return '';
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(s)) return 'http://' + s;   // localhost:3000, 192.168.0.1
  if (/^[a-z][\w+.-]*:(?!\d)/i.test(s)) return s;   // ya trae esquema: https:, brave:, file:…
  return 'https://' + s;
}

function isValidUrl(s) {
  try {
    const u = new URL(s);
    return /^(https?|ftp):$/.test(u.protocol) ? !!u.hostname : true;
  } catch {
    return false;
  }
}

// ── Eliminar con "Deshacer" ─────────────────────────────────────

async function removeWithUndo(id) {
  const [snapshot] = await chrome.bookmarks.getSubTree(id);
  await store.remove(snapshot);
  toast(`Se eliminó «${snapshot.title || hostOf(snapshot.url ?? '')}»`, 'Deshacer', async () => {
    const renamed = [];
    await store.restore(snapshot, (oldId, newId) => renamed.push([oldId, newId]));
    // La personalización estaba ligada a los ids viejos: se pasa a los nuevos.
    const tiles = { ...state.tiles };
    for (const [oldId, newId] of renamed) {
      if (!tiles[oldId]) continue;
      tiles[newId] = tiles[oldId];
      delete tiles[oldId];
      if (tiles[newId].icon?.type === 'file') await images.rename('tile:' + oldId, 'tile:' + newId);
    }
    state.tiles = tiles;
    await saveTiles(tiles);
    render();
  });
}

let toastTimer = 0;
function toast(text, actionLabel, action) {
  const box = $('#toast');
  const b = box.querySelector('button');
  const hide = () => { box.hidden = true; };
  box.querySelector('.msg').textContent = text;
  b.hidden = !action;
  b.textContent = actionLabel ?? '';
  b.onclick = action && (() => { hide(); action(); });
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? 7000 : 3500);
}

// Borra personalizaciones e íconos de tarjetas que ya no existen (cuando el navegador está libre).
async function pruneTiles() {
  const stale = Object.keys(state.tiles).filter(id => !state.byId.has(id));
  if (stale.length) {
    state.tiles = { ...state.tiles };
    for (const id of stale) delete state.tiles[id];
    await saveTiles(state.tiles);
  }
  for (const key of await images.keys()) {
    if (String(key).startsWith('tile:') && state.tiles[key.slice(5)]?.icon?.type !== 'file') images.del(key);
  }
}

// ── Ajustes ─────────────────────────────────────────────────────

function changeSettings(patch, { save = true } = {}) {
  const prev = state.settings;
  const next = { ...prev, ...patch };
  state.settings = next;
  applySettings(next);
  const changed = k => prev[k] !== next[k];
  if (RENDER_KEYS.some(changed)) render();
  if (ELEMENT_KEYS.some(changed)) updateElements();
  if (WALLPAPER_KEYS.some(changed)) images.loadWallpaper(next);
  if (state.folderId && FOLDER_SIZE_KEYS.some(changed)) sizeFolderGrid(state.byId.get(state.folderId));
  if (save) saveSettings(next);
}

// Mantiene sincronizadas varias pestañas nuevas abiertas a la vez.
function onStorageChanged(changes, area) {
  if (area !== 'local') return;
  const s = changes.settings?.newValue;
  if (s && !isOwnSettingsWrite(s)) {
    changeSettings({ ...DEFAULTS, ...s }, { save: false });
    settingsUI?.sync();
  }
  if (changes.tiles && JSON.stringify(changes.tiles.newValue ?? {}) !== JSON.stringify(state.tiles)) {
    state.tiles = changes.tiles.newValue ?? {};
    render();
  }
}

// El panel de ajustes se carga recién la primera vez que lo abres.
async function toggleSettings() {
  if (!settingsUI) {
    const { createSettingsUI } = await import('./settings-ui.js');
    settingsUI = createSettingsUI({
      get: () => state.settings,
      change: changeSettings,
      previewBlur: px => images.previewBlur(state.settings, px),
      exportData,
      importData,
      toast,
    });
  }
  settingsUI.toggle();
}

// Exporta ajustes + personalización de tarjetas (por dirección, para que sirva en otro equipo).
function exportData() {
  const tiles = {};
  for (const [id, { icon, ...rest }] of Object.entries(state.tiles)) {
    const node = state.byId.get(id);
    if (!node) continue;
    const entry = icon && icon.type !== 'file' ? { ...rest, icon } : rest;   // los archivos no viajan
    if (Object.keys(entry).length) tiles[node.url ?? 'carpeta:' + node.title] = entry;
  }
  const { bgFile, ...settings } = state.settings;
  return { app: 'SpeedDial11', version: 1, settings, tiles };
}

async function importData(data) {
  if (data?.app !== 'SpeedDial11') throw new Error('No es un archivo de SpeedDial11');
  const settings = {};
  for (const [k, v] of Object.entries(data.settings ?? {})) {
    if (k in DEFAULTS && k !== 'bgFile' && typeof v === typeof DEFAULTS[k]) settings[k] = v;
  }
  const byKey = new Map([...state.byId.values()].map(n => [n.url ?? 'carpeta:' + n.title, n.id]));
  const tiles = { ...state.tiles };
  for (const [key, custom] of Object.entries(data.tiles ?? {})) {
    const id = byKey.get(key);
    if (id && custom && typeof custom === 'object') tiles[id] = custom;
  }
  state.tiles = tiles;
  await saveTiles(tiles);
  changeSettings({ ...DEFAULTS, ...settings, bgFile: state.settings.bgFile });
  render();
}

// ───────────────────────────────────────────────────────────────
//  Stickers de pestaña · parte del service worker.
//  Recuerda qué pestaña lleva qué sticker e inyecta content.js solo
//  en esas pestañas: las demás no cargan ni una línea de código.
// ───────────────────────────────────────────────────────────────
import { STICKER_PREFS } from '../shared/prefs.js';
import { faviconUrl, toDataUrl, isGeneric } from '../shared/favicon.js';

const CONTENT = 'stickers/content.js';
const NAV_FILTER = { url: [{ schemes: ['http', 'https', 'file'] }] };
const QUICK = [['🔴', 'Rojo'], ['🟠', 'Naranja'], ['🟡', 'Amarillo'], ['🟢', 'Verde'], ['🔵', 'Azul'], ['🟣', 'Morado'], ['⚫', 'Negro'], ['⭐', 'Estrella']];

let stickers = {};       // { [idPestaña]: { emoji, url, index } }
let prefs = { ...STICKER_PREFS };
let pending = [];        // stickers de la sesión anterior que todavía buscan su pestaña
let pendingUntil = 0;

// El service worker se duerme y pierde sus variables: al despertar se releen.
// Si además es una sesión nueva de Brave (o recargaste la extensión), los ids
// de las pestañas cambiaron y hay que reubicar cada sticker en su pestaña.
const ready = (async () => {
  const data = await chrome.storage.local.get(['stickers', 'stickerPrefs']);
  stickers = data.stickers ?? {};
  prefs = { ...STICKER_PREFS, ...data.stickerPrefs };
  const { stickerSession } = await chrome.storage.session.get('stickerSession');
  if (!stickerSession) {
    await chrome.storage.session.set({ stickerSession: true });
    await restore();
  }
})();

let saveTimer = 0;
const saveNow = () => { clearTimeout(saveTimer); return chrome.storage.local.set({ stickers }); };
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 500); };

async function setSticker(tab, emoji) {
  await ready;
  if (emoji) {
    stickers[tab.id] = { emoji, url: tab.url ?? '', index: tab.index ?? 0 };
    rememberRecent(emoji);
  } else {
    delete stickers[tab.id];
  }
  await saveNow();
  return inject(tab.id);
}

async function rememberRecent(emoji) {
  const { stickerRecent: list = [] } = await chrome.storage.local.get('stickerRecent');
  await chrome.storage.local.set({ stickerRecent: [emoji, ...list.filter(e => e !== emoji)].slice(0, 8) });
}

// Inyectar dos veces no duplica nada: content.js se da cuenta y solo se actualiza.
// Devuelve false en páginas donde Brave no deja entrar: brave://, tienda de extensiones, PDF…
function inject(tabId) {
  return chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT], injectImmediately: true })
    .then(() => true, () => false);
}

// ── Reubicar stickers tras reiniciar Brave ──────────────────────

async function restore() {
  const previous = Object.values(stickers);
  stickers = {};
  if (previous.length) {
    pending = assign(previous, await chrome.tabs.query({}));
    pendingUntil = Date.now() + 120_000;
    for (const id in stickers) inject(Number(id));
    if (pending.length) setTimeout(retryPending, 5000);   // al arrancar, algunas pestañas aparecen después
  }
  await saveNow();
}

async function retryPending() {
  if (!pending.length) return;
  const before = new Set(Object.keys(stickers));
  pending = assign(pending, await chrome.tabs.query({}));
  for (const id in stickers) if (!before.has(id)) inject(Number(id));
  save();
}

// Asigna stickers a pestañas: primero por dirección exacta y luego por mismo sitio;
// si hay varias candidatas gana la de posición más parecida. Devuelve los que sobran.
function assign(entries, tabs) {
  const taken = new Set(Object.keys(stickers).map(Number));
  for (const matches of [sameUrl, sameSite]) {
    const left = [];
    for (const entry of entries) {
      const options = tabs.filter(t => !taken.has(t.id) && matches(urlOf(t), entry.url));
      if (!options.length) { left.push(entry); continue; }
      const tab = options.reduce((a, b) => (Math.abs(b.index - entry.index) < Math.abs(a.index - entry.index) ? b : a));
      taken.add(tab.id);
      stickers[tab.id] = { ...entry, url: urlOf(tab) || entry.url, index: tab.index };
    }
    entries = left;
  }
  return entries;
}

const urlOf = tab => tab.url || tab.pendingUrl || '';
const sameUrl = (a, b) => !!a && a === b;
function sameSite(a, b) {
  try { return new URL(a).host === new URL(b).host; } catch { return false; }
}

// ── Eventos de las pestañas ─────────────────────────────────────

// Una pestaña empezó a mostrar una página nueva: si tiene sticker, se lo ponemos de inmediato.
chrome.webNavigation.onCommitted.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  await ready;
  if (!stickers[tabId] && pending.length && Date.now() < pendingUntil) {
    pending = assign(pending, [{ id: tabId, url, index: 0 }]);
  }
  if (!stickers[tabId]) return;
  stickers[tabId].url = url;
  save();
  inject(tabId);
}, NAV_FILTER);

// Sitios que cambian de dirección sin recargar (Gmail, YouTube…): se anota la dirección
// para poder reconocer la pestaña si reinicias Brave.
chrome.webNavigation.onHistoryStateUpdated.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  await ready;
  if (stickers[tabId]) { stickers[tabId].url = url; save(); }
}, NAV_FILTER);

// Red de seguridad: al terminar de cargar, se asegura de que el sticker esté.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return;
  await ready;
  if (stickers[tabId]) inject(tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId, { isWindowClosing }) => {
  await ready;
  // Si se cierra la ventana completa se conserva: puede que estés cerrando Brave.
  if (!stickers[tabId] || isWindowClosing) return;
  delete stickers[tabId];
  save();
});

// Brave puede reemplazar una pestaña por otra con distinto id (por ejemplo, al suspenderla).
chrome.tabs.onReplaced.addListener(async (addedId, removedId) => {
  await ready;
  if (!stickers[removedId]) return;
  stickers[addedId] = stickers[removedId];
  delete stickers[removedId];
  save();
});

// Cambió la forma de mostrarlos (título / ícono): se avisa a las pestañas con sticker.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.stickerPrefs) return;
  await ready;
  prefs = { ...STICKER_PREFS, ...changes.stickerPrefs.newValue };
  for (const id in stickers) chrome.tabs.sendMessage(Number(id), { type: 'sticker:refresh' }).catch(() => {});
});

// ── Mensajes (de content.js y del menú del ícono) ───────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg?.type) {
    case 'sticker:get':   // content.js: ¿qué sticker tengo y cómo se muestra?
      ready.then(() => {
        const entry = stickers[sender.tab?.id];
        sendResponse({ sticker: entry ? { emoji: entry.emoji, ...prefs } : null });
      });
      return true;   // "voy a responder después"
    case 'sticker:icon':
      fetchIcon(msg.url, sender.tab?.url).then(sendResponse);
      return true;
    case 'sticker:state':   // menú del ícono: sticker de esa pestaña
      ready.then(() => sendResponse({ sticker: stickers[msg.tabId]?.emoji ?? null }));
      return true;
    case 'sticker:set':
      setSticker(msg.tab, msg.emoji).then(ok => sendResponse({ ok }));
      return true;
  }
});

// ── Favicon original (para dibujar el sticker encima) ───────────
// Lo descarga el service worker porque la página no puede leer los píxeles
// de imágenes de otros dominios. Se piden sin cookies.
const iconCache = new Map();

async function fetchIcon(url, pageUrl) {
  if (iconCache.has(url)) return iconCache.get(url);
  const data = /^https?:/i.test(url) ? await fetchImage(url, false) : null;
  // Si no se pudo, se usa el ícono que Brave ya tiene guardado para esa página (no se guarda: puede aparecer después).
  if (!data) return pageUrl ? fetchImage(faviconUrl(pageUrl, 64), true) : null;
  if (iconCache.size > 60) iconCache.clear();
  iconCache.set(url, data);
  return data;
}

async function fetchImage(url, fromBrave) {
  try {
    const res = await fetch(url, { credentials: 'omit' });
    const blob = res.ok && await res.blob();
    if (!blob || blob.size > 512 * 1024) return null;
    if (!fromBrave && blob.type && !blob.type.startsWith('image/')) return null;
    if (fromBrave && (await isGeneric(blob, 64))) return null;   // el globo genérico no sirve
    return toDataUrl(blob);
  } catch {
    return null;
  }
}

// ── Menú del clic derecho ───────────────────────────────────────
// Brave no deja agregar opciones al clic derecho sobre la pestaña misma;
// van en el clic derecho sobre la página y sobre el ícono de la extensión.

export function createMenus() {
  const contexts = ['page', 'frame', 'action'];
  const sub = (id, title) => chrome.contextMenus.create({ id: 'sticker:' + id, parentId: 'sticker', title, contexts });
  chrome.contextMenus.create({ id: 'sticker', title: 'Sticker de pestaña', contexts });
  for (const [emoji, name] of QUICK) sub(emoji, `${emoji}  ${name}`);
  chrome.contextMenus.create({ id: 'sticker:sep', parentId: 'sticker', type: 'separator', contexts });
  sub('more', 'Más stickers…');
  sub('clear', 'Quitar sticker');
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = String(info.menuItemId);
  if (!id.startsWith('sticker:') || !tab || tab.id < 0) return;
  if (id === 'sticker:clear') setSticker(tab, null);
  else if (id === 'sticker:more') chrome.action.openPopup?.().catch(() => {});
  else setSticker(tab, id.slice('sticker:'.length));
});

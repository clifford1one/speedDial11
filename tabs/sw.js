// ───────────────────────────────────────────────────────────────
//  Cambio de pestañas por uso reciente (como Ctrl+Tab de Opera).
//  Brave ya anota cuándo usaste cada pestaña (tab.lastAccessed), así
//  que no hace falta vigilar cada cambio: el service worker despierta
//  solo cuando presionas el atajo.
// ───────────────────────────────────────────────────────────────
import { TAB_PREFS } from '../shared/prefs.js';
import { faviconUrl, toDataUrl } from '../shared/favicon.js';

const OVERLAY = 'tabs/overlay.js';
const OWN_PAGES = chrome.runtime.getURL('');
const MAX_TABS = 30;              // pestañas en la lista
const TRANSIENT = 'mruTransient'; // pestañas por las que solo "pasaste" (modo rápido)

let prefs = { ...TAB_PREFS };
const prefsReady = chrome.storage.local.get('tabPrefs').then(d => { prefs = { ...TAB_PREFS, ...d.tabPrefs }; });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tabPrefs) prefs = { ...TAB_PREFS, ...changes.tabPrefs.newValue };
});

// Todo lo que toca el ciclo pasa por esta cola: los toques rápidos se procesan en orden.
let queue = Promise.resolve();
function enqueue(task) {
  queue = queue.then(task).catch(err => console.warn('Cambio de pestañas:', err));
}

// ── El atajo ────────────────────────────────────────────────────

let cycle = null;   // ciclo en curso; dura segundos, así que basta con tenerlo en memoria

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'mru-next') enqueue(() => step(1, tab));
  else if (command === 'mru-prev') enqueue(() => step(-1, tab));
});

async function step(dir, tab) {
  await prefsReady;
  if (!cycle) {
    const active = tab?.id >= 0 ? tab : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (!active) return;
    const tabs = await recentTabs(active);
    if (tabs.length < 2) return;
    cycle = {
      tabs,                               // foto de la lista al empezar
      sel: dir > 0 ? 1 : tabs.length - 1,
      origin: active.id,                  // pestaña donde empezaste
      current: active.id,                 // pestaña visible ahora (cambia en modo rápido)
      overlay: false, focused: false, held: false,
      visited: [], timer: 0,
    };
    if (prefs.mode === 'overlay') await showOverlay(cycle);
  } else {
    cycle.sel = (cycle.sel + dir + cycle.tabs.length) % cycle.tabs.length;
    if (cycle.overlay) toOverlay({ type: 'mru:select', sel: cycle.sel });
  }
  if (!cycle) return;   // se resolvió mientras tanto (soltaste Alt muy rápido)
  if (!cycle.overlay) await jump(cycle);
  arm();
}

// Pestañas ordenadas por uso: la actual primero y luego de la más a la menos reciente.
async function recentTabs(active) {
  const query = prefs.scope === 'all' ? { windowType: 'normal' } : { windowId: active.windowId };
  const [tabs, fixes] = await Promise.all([
    chrome.tabs.query(query),
    chrome.storage.session.get(TRANSIENT).then(d => d[TRANSIENT] ?? {}),
  ]);
  tabs.sort((a, b) => (b.id === active.id) - (a.id === active.id) || used(b, fixes) - used(a, fixes));
  return tabs.slice(0, MAX_TABS).map(t => ({
    id: t.id, windowId: t.windowId, title: t.title ?? '', url: t.url || t.pendingUrl || '', used: used(t, fixes),
  }));
}

// Si por una pestaña solo pasaste de camino (modo rápido), cuenta su uso anterior.
function used(tab, fixes) {
  const fix = fixes[tab.id];
  const last = tab.lastAccessed ?? 0;
  return fix && last <= fix.at + 1500 ? fix.orig : last;
}

async function showOverlay(c) {
  // Se marca antes de mostrarla: el aviso "solté Alt" puede llegar muy rápido.
  c.overlay = true;
  const items = Promise.all(c.tabs.map(async (t, i) => ({
    title: t.title, url: t.url, icon: await iconFor(t.url), current: i === 0, where: windowLabel(c, t),
  })));
  try {
    if (!c.tabs[0].url.startsWith(OWN_PAGES)) {   // la nueva pestaña de la extensión ya la trae
      await chrome.scripting.executeScript({ target: { tabId: c.origin }, files: [OVERLAY], injectImmediately: true });
    }
    const res = await chrome.tabs.sendMessage(c.origin, { type: 'mru:show', items: await items, sel: c.sel, delay: 120 }, { frameId: 0 });
    c.focused = !!res?.focused;
  } catch {
    c.overlay = false;   // brave://, tienda de extensiones, PDF…: se usa el modo rápido
  }
}

function toOverlay(msg) {
  chrome.tabs.sendMessage(cycle.origin, msg, { frameId: 0 }).catch(() => {});
}

function windowLabel(c, tab) {
  const here = c.tabs[0].windowId;
  if (tab.windowId === here) return '';
  const others = [...new Set(c.tabs.map(t => t.windowId).filter(id => id !== here))];
  return others.length === 1 ? 'Otra ventana' : `Ventana ${others.indexOf(tab.windowId) + 2}`;
}

const icons = new Map();   // dirección → ícono (data URL); dura lo que dure el service worker
async function iconFor(url) {
  if (!url) return null;
  if (icons.has(url)) return icons.get(url);
  let data = null;
  try {
    const res = await fetch(faviconUrl(url, 32));
    if (res.ok) data = await toDataUrl(await res.blob());
  } catch {}
  if (icons.size > 300) icons.clear();
  icons.set(url, data);
  return data;
}

// Modo rápido (o página donde no puede aparecer la lista): cambia de inmediato.
async function jump(c) {
  const target = c.tabs[c.sel];
  if (target.id !== c.current) c.visited.push(target);
  c.current = target.id;
  await focusTab(target);
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  if (prefs.scope === 'all') await chrome.windows.update(tab.windowId, { focused: true });
}

// Cuándo se da por terminado el ciclo si no llega el aviso de "solté Alt".
function arm() {
  clearTimeout(cycle.timer);
  // Sin lista (o si Brave no le da el foco a la página) no hay forma de saber cuándo
  // sueltas Alt: se confirma tras una pausa corta. Con la lista se espera a que sueltes.
  const ms = !cycle.overlay ? 900 : cycle.held ? 20000 : cycle.focused ? 1500 : 900;
  cycle.timer = setTimeout(() => enqueue(() => commit()), ms);
}

async function commit(pick) {
  const c = cycle;
  if (!c) return;
  cycle = null;
  clearTimeout(c.timer);
  if (pick != null) c.sel = pick;
  if (!c.overlay) return rememberTransient(c);
  chrome.tabs.sendMessage(c.origin, { type: 'mru:hide' }, { frameId: 0 }).catch(() => {});
  // Si mientras tanto cambiaste de pestaña por otro lado (con el mouse), no se hace nada.
  const origin = await chrome.tabs.get(c.origin).catch(() => null);
  if (!origin?.active) return;
  const target = c.tabs[c.sel];
  if (target.id !== c.origin) await focusTab(target);
}

function cancel() {
  const c = cycle;
  if (!c) return;
  cycle = null;
  clearTimeout(c.timer);
  if (c.overlay) chrome.tabs.sendMessage(c.origin, { type: 'mru:hide' }, { frameId: 0 }).catch(() => {});
}

// En modo rápido pasaste por varias pestañas: solo la última cuenta como "usada".
async function rememberTransient(c) {
  const passed = c.visited.filter(t => t.id !== c.current);
  if (!passed.length) return;
  const { [TRANSIENT]: fixes = {} } = await chrome.storage.session.get(TRANSIENT);
  const open = new Map((await chrome.tabs.query({})).map(t => [t.id, t]));
  for (const id of Object.keys(fixes)) {
    const tab = open.get(Number(id));
    if (!tab || (tab.lastAccessed ?? 0) > fixes[id].at + 1500) delete fixes[id];   // cerrada o usada de verdad
  }
  const now = Date.now();
  for (const t of passed) fixes[t.id] = { orig: fixes[t.id]?.orig ?? t.used, at: now };
  await chrome.storage.session.set({ [TRANSIENT]: fixes });
}

// Avisos que manda la lista (overlay.js) desde la página.
chrome.runtime.onMessage.addListener((msg, sender) => {
  const type = msg?.type;
  if (typeof type !== 'string' || !type.startsWith('mru:')) return;
  if (type === 'mru:command') return enqueue(() => step(msg.dir, sender.tab));
  enqueue(() => {
    if (!cycle || sender.tab?.id !== cycle.origin) return;
    if (type === 'mru:release') return commit();
    if (type === 'mru:pick') return commit(msg.index);
    if (type === 'mru:cancel') return cancel();
    if (type === 'mru:held') { cycle.held = true; arm(); }
    if (type === 'mru:blur') { cycle.held = false; cycle.focused = false; arm(); }
  });
});

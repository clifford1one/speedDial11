// Menú del ícono de la extensión: elegir el sticker de la pestaña actual.
// Teclado: 1–8 = los colores de la primera fila · 0 = quitar.
import { button } from '../shared/dom.js';

const EMOJIS = [
  '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚫',
  '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫', '⬛',
  '⭐', '❤️', '🔥', '✅', '❌', '⚠️', '📌', '💡',
  '💼', '🏠', '🎵', '🎮', '📚', '🛒', '💬', '📧',
  '📅', '💰', '🔒', '🐞', '🧪', '✈️', '🍔', '🎬',
];
const $ = sel => document.querySelector(sel);

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const current = (await chrome.runtime.sendMessage({ type: 'sticker:state', tabId: tab?.id }))?.sticker ?? null;
const { stickerRecent: recent = [] } = await chrome.storage.local.get('stickerRecent');

$('#tab-title').textContent = tab?.title ?? '';
$('#current').textContent = current ?? '—';
$('#clear').disabled = !current;
fill($('#grid'), EMOJIS);
fill($('#recent'), recent);
$('#recent-box').hidden = !recent.length;

$('#clear').addEventListener('click', () => choose(null));
$('#options').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#custom').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#custom-text').value.trim();
  const graphemes = [...new Intl.Segmenter().segment(text)].length;
  if (!text || graphemes > 2) return note('Usa un emoji o hasta 2 letras.');
  choose(text);
});

document.addEventListener('keydown', e => {
  if (e.target.matches('input')) return;
  if (e.key >= '1' && e.key <= '8') { e.preventDefault(); choose(EMOJIS[Number(e.key) - 1]); }
  else if (e.key === '0' || e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); choose(null); }
});

const reason = await blockedReason(tab?.url ?? '');
if (reason) note(reason);
showShortcut();

function fill(container, list) {
  container.append(...list.map(emoji => button(emoji, () => choose(emoji), emoji === current ? 'selected' : '')));
}

async function choose(emoji) {
  if (!tab) return;
  const res = await chrome.runtime.sendMessage({ type: 'sticker:set', tab: { id: tab.id, url: tab.url, index: tab.index }, emoji });
  if (res?.ok || !emoji) return window.close();
  // Se guardó, pero esta página no se deja modificar.
  $('#current').textContent = emoji;
  note('Guardado, pero esta página no permite mostrarlo. Aparecerá cuando la pestaña abra otro sitio.');
}

function note(text) {
  $('#note').textContent = text;
  $('#note').hidden = false;
}

// Por qué no se puede mostrar el sticker en esta página ('' si se puede).
async function blockedReason(url) {
  if (/^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i.test(url)) return 'Brave no deja modificar la tienda de extensiones.';
  if (/^https?:/i.test(url)) return '';
  if (/^file:/i.test(url)) {
    return (await chrome.extension.isAllowedFileSchemeAccess()) ? ''
      : 'Para archivos locales, activa «Permitir acceso a URLs de archivo» en brave://extensions.';
  }
  return 'Brave no deja modificar sus páginas internas (como esta). El sticker se verá cuando la pestaña abra un sitio web.';
}

async function showShortcut() {
  const commands = await chrome.commands.getAll();
  const key = commands.find(c => c.name === '_execute_action')?.shortcut;
  $('#hint').textContent = (key ? `Abrir con ${key} · ` : 'Sin atajo (configúralo en brave://extensions/shortcuts) · ') + '1–8 colores · 0 quitar';
}

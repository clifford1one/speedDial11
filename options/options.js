// Página de ajustes: cada cambio se guarda al instante en chrome.storage.
// El service worker y las pestañas se enteran solos (escuchan esos cambios).
import { TAB_PREFS, STICKER_PREFS } from '../shared/prefs.js';
import { el } from '../shared/dom.js';

const $ = id => document.getElementById(id);
const saved = await chrome.storage.local.get(['tabPrefs', 'stickerPrefs']);
const tabPrefs = { ...TAB_PREFS, ...saved.tabPrefs };
const stickerPrefs = { ...STICKER_PREFS, ...saved.stickerPrefs };

// control → [objeto de preferencias, clave, clave en storage]
const FIELDS = {
  mode: [tabPrefs, 'mode', 'tabPrefs'],
  scope: [tabPrefs, 'scope', 'tabPrefs'],
  stickerTitle: [stickerPrefs, 'title', 'stickerPrefs'],
  stickerIcon: [stickerPrefs, 'icon', 'stickerPrefs'],
};

for (const [id, [prefs, key, storageKey]] of Object.entries(FIELDS)) {
  const input = $(id);
  const prop = input.type === 'checkbox' ? 'checked' : 'value';
  input[prop] = prefs[key];
  input.addEventListener('change', () => {
    prefs[key] = input[prop];
    chrome.storage.local.set({ [storageKey]: prefs });
  });
}

$('edit-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

const NAMES = { 'mru-next': 'Pestaña anterior', 'mru-prev': 'Recorrer al revés', _execute_action: 'Menú de stickers' };
const commands = (await chrome.commands.getAll()).filter(c => NAMES[c.name]);
$('shortcuts').replaceChildren(...commands.map((c, i) =>
  el('span', '', `${i ? ' · ' : ''}${NAMES[c.name]}: `, el('kbd', '', c.shortcut || 'sin asignar'))));

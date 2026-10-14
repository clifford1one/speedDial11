// ───────────────────────────────────────────────────────────────
//  Personalización: valores por defecto, guardar/cargar y aplicar.
//  Casi todo se aplica como variables CSS en <html>: cambiar un
//  ajuste no obliga a redibujar la grilla, por eso es instantáneo.
// ───────────────────────────────────────────────────────────────

export const DEFAULTS = {
  // Fondo
  bgType: 'color',          // color | gradient | image
  bgColor: '#16181d',
  bgColor2: '#2c3444',
  bgAngle: 160,
  bgFile: 0,                // versión de la imagen subida (0 = ninguna)
  bgImageUrl: '',
  bgBlur: 0,
  bgDim: 0.2,
  // Cuadrícula
  cols: 0,                  // 0 = automático
  tileWidth: 156,
  tileRatio: '16/10',
  gap: 18,
  maxWidth: 1180,
  vAlign: 'center',         // top | center
  showAdd: true,
  // Tarjetas
  tileStyle: 'solid',       // solid | outline | transparent | glass
  tileBg: '#23262e',
  tileOpacity: 1,
  borderWidth: 0,
  borderColor: '#3a3f4b',
  shadow: false,
  iconMode: 'favicon',      // favicon | letter
  iconSize: 40,
  showTitles: true,
  titleSize: 13,
  // Efectos
  hover: 'lift',            // none | lift | zoom | glow | accent
  appear: 'none',           // none | fade | rise
  folderAnim: 'zoom',       // none | fade | zoom | slide
  animSpeed: 160,
  // Colores y texto
  textColor: '#e6e7ea',
  accent: '#5b8cff',
  font: 'system',           // system | serif | mono | condensed
  // Elementos
  showClock: true,
  clock24: true,
  showDate: true,
  showSearch: true,
  searchFocus: true,
  greeting: '',
  // Comportamiento
  openInNewTab: false,
  // Avanzado
  customCss: '',
};

// Estilos rápidos: cada uno cambia solo algunos ajustes.
export const PRESETS = {
  Grafito: { bgType: 'color', bgColor: '#16181d', textColor: '#e6e7ea', accent: '#5b8cff', tileStyle: 'solid', tileBg: '#23262e', tileOpacity: 1, borderWidth: 0, font: 'system' },
  Papel: { bgType: 'color', bgColor: '#efede8', textColor: '#1f2023', accent: '#b4532a', tileStyle: 'solid', tileBg: '#ffffff', tileOpacity: 1, borderWidth: 1, borderColor: '#d9d5cc', font: 'system' },
  Noche: { bgType: 'gradient', bgColor: '#0e1322', bgColor2: '#2a3350', bgAngle: 160, textColor: '#dfe5f5', accent: '#8ab4ff', tileStyle: 'solid', tileBg: '#ffffff', tileOpacity: 0.06, borderWidth: 1, borderColor: '#36405e', font: 'system' },
  Terminal: { bgType: 'color', bgColor: '#0b0d0b', textColor: '#b8f5b0', accent: '#4be36a', tileStyle: 'outline', borderWidth: 1, borderColor: '#2d4a2f', font: 'mono' },
  Contraste: { bgType: 'color', bgColor: '#000000', textColor: '#ffffff', accent: '#ffd400', tileStyle: 'outline', borderWidth: 2, borderColor: '#ffffff', font: 'system' },
};

// Solo fuentes que ya vienen con Windows: cargar fuentes de internet haría más lenta la pestaña.
const FONTS = {
  system: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Cascadia Code", Consolas, "Courier New", monospace',
  condensed: '"Bahnschrift SemiCondensed", "Arial Narrow", sans-serif',
};

export async function loadAll() {
  const data = await chrome.storage.local.get(['settings', 'tiles', 'rootId']);
  return { settings: { ...DEFAULTS, ...data.settings }, tiles: data.tiles ?? {}, rootId: data.rootId ?? null };
}

// Se guarda con una pequeña espera: mover un control dispara decenas de cambios
// por segundo y no vale la pena escribirlos todos.
let pending = null;
let timer = 0;
let lastWritten = '';

export function saveSettings(s) {
  pending = s;
  clearTimeout(timer);
  timer = setTimeout(flushSettings, 300);
}

export function flushSettings() {
  clearTimeout(timer);
  if (!pending) return;
  lastWritten = JSON.stringify(pending);
  chrome.storage.local.set({ settings: pending });
  pending = null;
}

// ¿Este cambio de storage lo escribimos nosotros (o hay uno más nuevo sin guardar)?
// Sin esto, otra pestaña abierta "devolvería" un valor viejo mientras mueves un control.
export const isOwnSettingsWrite = value => pending !== null || JSON.stringify(value) === lastWritten;

export const saveTiles = tiles => chrome.storage.local.set({ tiles });

export function applySettings(s) {
  const vars = {
    '--bg-color': s.bgColor,
    '--bg-gradient': s.bgType === 'gradient' ? `linear-gradient(${s.bgAngle}deg, ${s.bgColor}, ${s.bgColor2})` : 'none',
    '--bg-dim': s.bgType === 'color' ? 0 : s.bgDim,
    '--text': s.textColor,
    '--accent': s.accent,
    '--accent-fg': readableOn(s.accent),
    '--font': FONTS[s.font] ?? FONTS.system,
    '--cols': s.cols > 0 ? s.cols : 'auto-fit',
    '--tile-w': s.tileWidth + 'px',
    '--tile-ratio': s.tileRatio,
    '--gap': s.gap + 'px',
    '--max-w': s.maxWidth + 'px',
    '--tile-bg': rgba(s.tileBg, s.tileOpacity),
    '--border-w': s.borderWidth + 'px',
    '--border-c': s.borderColor,
    '--icon-size': s.iconSize + 'px',
    '--title-size': s.titleSize + 'px',
    '--speed': s.animSpeed + 'ms',
  };
  // Los atributos data-* activan reglas del CSS (estilo de tarjeta, efectos, qué se muestra).
  const onOff = v => (v ? 'on' : 'off');
  const data = {
    bg: s.bgType,
    tileStyle: s.tileStyle,
    hover: s.hover,
    appear: s.appear,
    folderAnim: s.folderAnim,
    valign: s.vAlign,
    titles: onOff(s.showTitles),
    shadow: onOff(s.shadow),
    add: onOff(s.showAdd),
    clock: onOff(s.showClock),
    date: onOff(s.showDate),
    search: onOff(s.showSearch),
    greeting: onOff(s.greeting.trim() !== ''),
  };
  const root = document.documentElement;
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  Object.assign(root.dataset, data);
  setCustomCss(s.customCss);
  try { localStorage.setItem('sd-boot', JSON.stringify({ vars, data, css: s.customCss })); } catch {}
}

function setCustomCss(css) {
  let el = document.getElementById('custom-css');
  if (!el) {
    el = document.createElement('style');
    el.id = 'custom-css';
    document.head.append(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

function hexRgb(hex) {
  const n = parseInt(String(hex).slice(1), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex, alpha) {
  const [r, g, b] = hexRgb(hex);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

// Texto negro o blanco según qué se lea mejor sobre el color de acento.
function readableOn(hex) {
  const [r, g, b] = hexRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111111' : '#ffffff';
}

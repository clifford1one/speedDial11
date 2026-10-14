// ───────────────────────────────────────────────────────────────
//  Panel de personalización. Este archivo se carga recién cuando
//  abres el panel por primera vez (import dinámico en main.js):
//  la nueva pestaña normal no paga ese costo.
// ───────────────────────────────────────────────────────────────
import { DEFAULTS, PRESETS } from './settings.js';
import * as images from './images.js';
import { el, button } from '../shared/dom.js';

const isImage = s => s.bgType === 'image';
const hasTileColor = s => s.tileStyle === 'solid' || s.tileStyle === 'glass';
const pct = v => Math.round(v * 100) + '%';

// Cada fila: key = ajuste, type = control. `if` decide cuándo se muestra.
const SECTIONS = [
  ['Estilo rápido', [{ type: 'presets' }]],
  ['Fondo', [
    { key: 'bgType', label: 'Tipo', type: 'select', options: { color: 'Color', gradient: 'Degradado', image: 'Imagen' } },
    { key: 'bgColor', label: 'Color', type: 'color' },
    { key: 'bgColor2', label: 'Color 2', type: 'color', if: s => s.bgType === 'gradient' },
    { key: 'bgAngle', label: 'Ángulo', type: 'range', min: 0, max: 360, step: 5, unit: '°', if: s => s.bgType === 'gradient' },
    { type: 'wallpaper', if: isImage },
    { key: 'bgBlur', label: 'Desenfoque', type: 'range', min: 0, max: 40, unit: 'px', if: isImage },
    { key: 'bgDim', label: 'Oscurecer', type: 'range', min: 0, max: 0.8, step: 0.05, format: pct, if: s => s.bgType !== 'color' },
  ]],
  ['Cuadrícula', [
    { key: 'cols', label: 'Columnas', type: 'range', min: 0, max: 12, format: v => (v ? String(v) : 'auto') },
    { key: 'tileWidth', label: 'Ancho', type: 'range', min: 80, max: 320, step: 4, unit: 'px' },
    { key: 'tileRatio', label: 'Proporción', type: 'select', options: { '1/1': 'Cuadrada', '4/3': '4:3', '16/10': '16:10', '16/9': '16:9', '2/1': '2:1' } },
    { key: 'gap', label: 'Separación', type: 'range', min: 0, max: 48, unit: 'px' },
    { key: 'maxWidth', label: 'Ancho máximo', type: 'range', min: 480, max: 2400, step: 20, unit: 'px' },
    { key: 'vAlign', label: 'Posición', type: 'select', options: { center: 'Centrada', top: 'Arriba' } },
    { key: 'showAdd', label: 'Mostrar botón «+»', type: 'check' },
  ]],
  ['Tarjetas', [
    { key: 'tileStyle', label: 'Estilo', type: 'select', options: { solid: 'Sólida', outline: 'Solo borde', transparent: 'Sin fondo', glass: 'Vidrio (más pesado)' } },
    { key: 'tileBg', label: 'Color', type: 'color', if: hasTileColor },
    { key: 'tileOpacity', label: 'Opacidad', type: 'range', min: 0, max: 1, step: 0.05, format: pct, if: hasTileColor },
    { key: 'borderWidth', label: 'Borde', type: 'range', min: 0, max: 6, unit: 'px' },
    { key: 'borderColor', label: 'Color del borde', type: 'color' },
    { key: 'shadow', label: 'Sombra', type: 'check' },
    { key: 'iconMode', label: 'Ícono', type: 'select', options: { favicon: 'Favicon del sitio', letter: 'Inicial' } },
    { key: 'iconSize', label: 'Tamaño del ícono', type: 'range', min: 16, max: 96, unit: 'px' },
    { key: 'showTitles', label: 'Mostrar nombres', type: 'check' },
    { key: 'titleSize', label: 'Tamaño del nombre', type: 'range', min: 10, max: 20, unit: 'px', if: s => s.showTitles },
  ]],
  ['Efectos', [
    { key: 'hover', label: 'Al pasar el mouse', type: 'select', options: { none: 'Nada', lift: 'Elevar', zoom: 'Acercar', glow: 'Brillo', accent: 'Borde de acento' } },
    { key: 'appear', label: 'Al abrir', type: 'select', options: { none: 'Sin animación', fade: 'Aparecer', rise: 'Subir en cascada' } },
    { key: 'folderAnim', label: 'Abrir carpeta', type: 'select', options: { none: 'Sin animación', fade: 'Fundido', zoom: 'Zoom', slide: 'Deslizar' } },
    { key: 'animSpeed', label: 'Duración', type: 'range', min: 60, max: 500, step: 10, unit: 'ms' },
  ]],
  ['Colores y texto', [
    { key: 'textColor', label: 'Texto', type: 'color' },
    { key: 'accent', label: 'Acento', type: 'color' },
    { key: 'font', label: 'Fuente', type: 'select', options: { system: 'Sistema', serif: 'Serif', mono: 'Monoespaciada', condensed: 'Condensada' } },
  ]],
  ['Elementos', [
    { key: 'showClock', label: 'Reloj', type: 'check' },
    { key: 'clock24', label: 'Formato 24 horas', type: 'check', if: s => s.showClock },
    { key: 'showDate', label: 'Fecha', type: 'check', if: s => s.showClock },
    { key: 'showSearch', label: 'Buscador', type: 'check' },
    { key: 'searchFocus', label: 'Escribir en el buscador al abrir', type: 'check', if: s => s.showSearch },
    { key: 'greeting', label: 'Frase', type: 'text', placeholder: 'Un saludo o lo que quieras' },
  ]],
  ['Comportamiento', [
    { key: 'openInNewTab', label: 'Abrir sitios en pestaña nueva', type: 'check' },
  ]],
  ['CSS personalizado', [
    { key: 'customCss', type: 'textarea', placeholder: '/* Ej: */\n.tile .label { letter-spacing: .04em; }' },
  ]],
  ['Copia de seguridad', [{ type: 'backup' }]],
];

export function createSettingsUI(ctx) {
  const drawer = document.getElementById('settings');
  const rows = [];                 // { item, row, input?, out? }
  let refreshWallpaperInfo = () => {};

  document.getElementById('settings-body').append(...SECTIONS.map(([title, items]) =>
    el('section', 's-section', el('h3', '', title), ...items.map(buildItem))));

  function buildItem(item) {
    if (item.type === 'presets') return presetsRow();
    if (item.type === 'wallpaper') return wallpaperRow(item);
    if (item.type === 'backup') return backupRow();

    let input;
    let out = null;
    if (item.type === 'select') {
      input = el('select', '', ...Object.entries(item.options).map(([value, text]) => new Option(text, value)));
    } else if (item.type === 'textarea') {
      input = el('textarea');
      input.rows = 7;
      input.spellcheck = false;
    } else {
      input = el('input');
      input.type = { check: 'checkbox', range: 'range', color: 'color', text: 'text' }[item.type];
      if (item.type === 'range') {
        Object.assign(input, { min: item.min, max: item.max, step: item.step ?? 1 });
        out = el('output');
      }
    }
    if (item.placeholder) input.placeholder = item.placeholder;

    input.addEventListener('input', () => {
      const value = read(item, input);
      if (out) out.textContent = format(item, value);
      // El desenfoque se previsualiza al mover y se aplica (hornea) al soltar.
      if (item.key === 'bgBlur') return ctx.previewBlur(value);
      ctx.change({ [item.key]: value });
      refreshVisibility();
    });
    if (item.key === 'bgBlur') input.addEventListener('change', () => ctx.change({ bgBlur: read(item, input) }));

    const row = el('label', `s-row ${item.type}${item.type === 'textarea' ? ' block' : ''}`,
      item.label && el('span', 's-label', item.label), input, out);
    rows.push({ item, row, input, out });
    return row;
  }

  function presetsRow() {
    return el('div', 's-row block presets', ...Object.entries(PRESETS).map(([name, patch]) => {
      const b = button(name, () => { ctx.change(patch); sync(); }, 'btn swatch');
      b.style.setProperty('--sw-bg', patch.bgColor);
      b.style.setProperty('--sw-fg', patch.textColor);
      b.style.setProperty('--sw-accent', patch.accent);
      return b;
    }));
  }

  function wallpaperRow(item) {
    const info = el('small', 's-hint');
    const file = fileInput('image/*', async f => {
      info.textContent = 'Procesando…';
      try {
        ctx.change({ bgType: 'image', bgFile: await images.setWallpaperFile(f), bgImageUrl: '' });
      } catch (err) {
        console.error(err);
        ctx.toast('No se pudo usar esa imagen.');
      }
      sync();
    });
    const clear = button('Quitar', async () => {
      await images.clearWallpaper();
      ctx.change({ bgFile: 0, bgImageUrl: '' });
      sync();
    });
    const link = el('input');
    link.type = 'text';
    link.placeholder = 'o pega la URL de una imagen';
    link.addEventListener('change', async () => {
      const value = link.value.trim();
      if (value) await images.clearWallpaper();   // una URL reemplaza a la imagen subida
      ctx.change({ bgImageUrl: value, bgFile: value ? 0 : ctx.get().bgFile });
      sync();
    });

    refreshWallpaperInfo = () => {
      const s = ctx.get();
      if (document.activeElement !== link) link.value = s.bgImageUrl;
      info.textContent = s.bgFile ? 'Imagen guardada en este equipo, ajustada a tu pantalla.'
        : s.bgImageUrl ? 'Imagen desde internet (se descarga al abrir la pestaña).'
        : 'Sin imagen todavía.';
      clear.disabled = !s.bgFile && !s.bgImageUrl;
    };

    const row = el('div', 's-row block', el('div', 'btn-row', button('Subir imagen…', () => file.click()), clear, file), link, info);
    rows.push({ item, row });
    return row;
  }

  function backupRow() {
    const file = fileInput('application/json,.json', async f => {
      try {
        await ctx.importData(JSON.parse(await f.text()));
        sync();
        ctx.toast('Ajustes importados.');
      } catch (err) {
        ctx.toast('No se pudo importar: ' + err.message);
      }
    });
    const exportBtn = button('Exportar', () => {
      const a = el('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(ctx.exportData(), null, 2)], { type: 'application/json' }));
      a.download = 'speeddial-ajustes.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    const resetBtn = button('Restablecer', async () => {
      if (!confirm('¿Volver a los ajustes de fábrica? Tus sitios y carpetas no se tocan.')) return;
      await images.clearWallpaper();
      ctx.change({ ...DEFAULTS });
      sync();
    });
    return el('div', 's-row block',
      el('div', 'btn-row', exportBtn, button('Importar', () => file.click()), resetBtn, file),
      el('small', 's-hint', 'Tus sitios ya se sincronizan como marcadores; esto guarda el diseño.'));
  }

  // Copia los valores actuales a los controles (al abrir, o si cambian en otra pestaña).
  function sync() {
    const s = ctx.get();
    for (const { item, input, out } of rows) {
      if (!input) continue;
      const value = s[item.key];
      if (item.type === 'check') input.checked = !!value;
      else if (document.activeElement !== input) input.value = value;
      if (out) out.textContent = format(item, value);
    }
    refreshVisibility();
    refreshWallpaperInfo();
  }

  function refreshVisibility() {
    const s = ctx.get();
    for (const { item, row } of rows) if (item.if) row.hidden = !item.if(s);
  }

  const isOpen = () => drawer.classList.contains('open');
  function open() { sync(); drawer.inert = false; drawer.classList.add('open'); }
  function close() { drawer.classList.remove('open'); drawer.inert = true; }
  const toggle = () => (isOpen() ? close() : open());

  return { open, close, toggle, isOpen, sync };
}

// Selector de archivo invisible: se abre con un botón y llama a onFile con el archivo elegido.
function fileInput(accept, onFile) {
  const file = el('input');
  file.type = 'file';
  file.accept = accept;
  file.hidden = true;
  file.addEventListener('change', async () => {
    if (file.files[0]) await onFile(file.files[0]);
    file.value = '';
  });
  return file;
}

function read(item, input) {
  if (item.type === 'check') return input.checked;
  if (item.type === 'range') return Number(input.value);
  return input.value;
}

function format(item, value) {
  if (item.format) return item.format(value);
  return item.unit ? value + item.unit : String(value);
}

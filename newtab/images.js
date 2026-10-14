// ───────────────────────────────────────────────────────────────
//  Imágenes guardadas en este equipo (IndexedDB): el fondo de
//  pantalla y los íconos que subas. IndexedDB guarda archivos
//  binarios tal cual, sin convertirlos a texto, así que es rápido.
// ───────────────────────────────────────────────────────────────
const STORE = 'images';
let db = null;

function run(mode, fn) {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('speeddial', 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return db.then(d => new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  }));
}

const get = key => run('readonly', s => s.get(key));
export const keys = () => run('readonly', s => s.getAllKeys());
export const put = (key, blob) => { forget(key); return run('readwrite', s => s.put(blob, key)); };
export const del = key => { forget(key); return run('readwrite', s => s.delete(key)); };

export async function rename(from, to) {
  const blob = await get(from);
  if (blob) { await put(to, blob); await del(from); }
}

// ── Direcciones "blob:" ─────────────────────────────────────────
// Para mostrar un archivo guardado se crea una dirección temporal en memoria.
// Se reutiliza mientras `version` no cambie (cambia cuando subes otro archivo).
const urls = new Map();   // key → { version, url: promesa de la dirección }

export function url(key, version = 0) {
  const hit = urls.get(key);
  if (hit?.version === version) return hit.url;
  forget(key);
  const promise = get(key).then(blob => blob && URL.createObjectURL(blob));
  urls.set(key, { version, url: promise });
  return promise;
}

function forget(key) {
  urls.get(key)?.url.then(u => u && URL.revokeObjectURL(u));
  urls.delete(key);
}

// Reduce una imagen a `maxSide` px como máximo (y opcionalmente la desenfoca).
export async function shrink(blob, maxSide, blur = 0) {
  if (blob.type === 'image/svg+xml' || (blob.type === 'image/gif' && !blur)) return blob;   // SVG y GIF animados, tal cual
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext('2d');
  const pad = blur * 2;   // al desenfocar se dibuja más grande, para que los bordes no queden transparentes
  if (blur) g.filter = `blur(${blur}px)`;
  g.drawImage(bmp, -pad, -pad, w + pad * 2, h + pad * 2);
  bmp.close();
  return canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
}

// ── Fondo de pantalla ───────────────────────────────────────────
// Al subirla, la imagen se reduce al tamaño de tu pantalla: una foto de
// 6000 px ocupa ~100 MB de memoria una vez decodificada; reducida, unos
// pocos. El desenfoque también se "hornea" en la imagen una sola vez, así
// la tarjeta gráfica no tiene que recalcularlo continuamente.

export async function setWallpaperFile(file) {
  // Lado mayor de tu pantalla en píxeles reales; mínimo 1920 por si después usas un monitor más grande.
  const side = Math.min(3840, Math.max(1920, Math.round(Math.max(screen.width, screen.height) * devicePixelRatio)));
  await put('bg', await shrink(file, side));
  await dropBlurred();
  return Date.now();   // nueva versión → settings.bgFile
}

export async function clearWallpaper() {
  await del('bg');
  await dropBlurred();
}

// Borra las copias desenfocadas ("bg@<px>"), menos `except`.
async function dropBlurred(except) {
  for (const k of await keys()) if (String(k).startsWith('bg@') && k !== except) await del(k);
}

async function blurredUrl(s) {
  const key = 'bg@' + s.bgBlur;
  const hit = await url(key, s.bgFile);
  if (hit) return hit;
  const original = await get('bg');
  if (!original) return null;
  await put(key, await shrink(original, Infinity, Math.round(s.bgBlur * devicePixelRatio)));
  await dropBlurred(key);
  return url(key, s.bgFile);
}

let wallSeq = 0;
export async function loadWallpaper(s) {
  const seq = ++wallSeq;
  let src = null;
  let cssBlur = 0;
  try {
    if (s.bgType === 'image' && s.bgFile) {
      src = s.bgBlur > 0 ? await blurredUrl(s) : await url('bg', s.bgFile);
    } else if (s.bgType === 'image' && s.bgImageUrl) {
      src = s.bgImageUrl;
      cssBlur = s.bgBlur;   // una imagen de internet no se puede hornear: se desenfoca con CSS
    }
    if (src) await decode(src);   // decodificar antes de mostrar evita un tirón
  } catch (err) {
    console.warn('Fondo:', err);
  }
  if (seq !== wallSeq) return;   // llegó un cambio más nuevo mientras tanto
  const bg = document.getElementById('bg');
  setImage(bg, src);
  setCssBlur(bg, src ? cssBlur : 0);
  bg.classList.toggle('ready', !!src);
}

function decode(src) {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => {});
}

// Vista previa mientras mueves el control de desenfoque; al soltarlo se hornea.
export async function previewBlur(s, px) {
  if (s.bgType !== 'image') return;
  const bg = document.getElementById('bg');
  const original = s.bgFile && await url('bg', s.bgFile);
  if (original) setImage(bg, original);
  setCssBlur(bg, px);
}

function setImage(bg, src) {
  if (src) bg.style.setProperty('--bg-image', `url(${JSON.stringify(src)})`);
  else bg.style.removeProperty('--bg-image');
}

function setCssBlur(bg, px) {
  bg.classList.toggle('filtered', px > 0);
  bg.style.setProperty('--bg-filter', px > 0 ? `blur(${px}px)` : 'none');
}

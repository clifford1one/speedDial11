// ───────────────────────────────────────────────────────────────
//  Sticker de pestaña · se inyecta SOLO en las pestañas con sticker.
//  Antepone el emoji al título y lo dibuja sobre el favicon; si la
//  página los cambia (Gmail, WhatsApp…), los vuelve a poner.
// ───────────────────────────────────────────────────────────────
(() => {
  // Si ya corre en esta página, solo se actualiza. Si quedó "huérfano" porque
  // recargaste la extensión (ya no puede hablar con ella), se reemplaza.
  const previous = window.__stickerTab;
  if (previous?.alive()) { previous.refresh(); return; }
  previous?.dispose();

  const HIDDEN = 'x-sticker-icon';                       // rel que se pone a los íconos de la página
  const PAGE_ICONS = 'link[rel~="icon" i]:not([data-sticker])';
  const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

  let sticker = null;        // { emoji, title, icon } o null
  let iconLink = document.querySelector('link[data-sticker]');   // por si quedó de antes
  let iconKey = '';          // qué se dibujó por última vez
  let observer = null;
  let observed = null;       // nodo que se está vigilando
  let queued = false;

  const onMessage = msg => { if (msg?.type === 'sticker:refresh') refresh(); };
  chrome.runtime.onMessage.addListener(onMessage);

  window.__stickerTab = {
    alive() { try { return !!chrome.runtime?.id; } catch { return false; } },
    refresh,
    dispose() {
      observer?.disconnect();
      try { chrome.runtime.onMessage.removeListener(onMessage); } catch {}
    },
  };
  refresh();

  async function refresh() {
    let res;
    try { res = await chrome.runtime.sendMessage({ type: 'sticker:get' }); } catch { return; }
    sticker = res?.sticker ?? null;
    iconKey = '';
    if (sticker) {
      watch();
      update();
    } else {
      observer?.disconnect();
      observed = null;
      setPrefix('');
      restoreIcons();
    }
  }

  // Vigila <head>: título e íconos. Mientras no exista, espera a que aparezca.
  function watch() {
    observer ??= new MutationObserver(() => {
      if (!queued) { queued = true; queueMicrotask(update); }
    });
    observer.disconnect();
    observed = document.head ?? document.documentElement ?? document;
    if (observed === document.head) {
      observer.observe(observed, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'rel'] });
    } else {
      observer.observe(observed, { childList: true });
    }
  }

  // Deja todo como debe estar. Si ya lo está, no toca nada (así no se crea un bucle).
  function update() {
    queued = false;
    if (!sticker) return;
    if ((document.head ?? document.documentElement ?? document) !== observed) watch();
    setPrefix(sticker.title ? prefixFor(sticker.emoji) : '');
    if (sticker.icon === 'off') restoreIcons();
    else applyIcon();
  }

  // ── Título ──
  // El prefijo actual se anota en <html> para poder quitarlo aunque la extensión se recargue.
  function setPrefix(next) {
    const html = document.documentElement;
    if (!html) return;
    const old = html.getAttribute('data-sticker-prefix') ?? '';
    if (old !== next) {
      const title = document.title;
      if (old && title.startsWith(old.trimEnd())) document.title = title.slice(old.trimEnd().length).trimStart();
      if (next) html.setAttribute('data-sticker-prefix', next);
      else html.removeAttribute('data-sticker-prefix');
    }
    // trimEnd: Brave recorta los espacios del final de un título.
    if (next && document.head && !document.title.startsWith(next.trimEnd())) document.title = next + document.title;
  }

  // ── Ícono ──
  function applyIcon() {
    // Los íconos ya apagados van primero: si la página agrega uno nuevo, ese gana.
    const links = [...document.querySelectorAll(`link[rel="${HIDDEN}"]`), ...document.querySelectorAll(PAGE_ICONS)];
    const source = pickSource(links) ?? new URL('/favicon.ico', location.href).href;
    const key = `${sticker.emoji}|${sticker.icon}|${source}`;
    if (key !== iconKey) {
      iconKey = key;
      draw(source, key);
    } else if (iconLink?.href) {
      install();
    }
  }

  async function draw(source, key) {
    const href = await composite(source);
    if (key !== iconKey || !href || !document.head) return;   // algo cambió mientras se dibujaba
    if (!iconLink) {
      iconLink = document.createElement('link');
      iconLink.setAttribute('data-sticker', '');
    }
    iconLink.rel = 'icon';
    iconLink.type = 'image/png';
    iconLink.href = href;
    install();
  }

  // Recién con nuestro ícono listo se "apagan" los de la página (cambiándoles el rel),
  // así la pestaña nunca queda sin ícono mientras se dibuja.
  function install() {
    for (const link of document.querySelectorAll(PAGE_ICONS)) {
      link.setAttribute('data-sticker-rel', link.getAttribute('rel'));
      link.setAttribute('rel', HIDDEN);
    }
    if (iconLink.parentNode !== document.head) document.head?.append(iconLink);
  }

  function restoreIcons() {
    iconKey = '';
    for (const link of document.querySelectorAll('link[data-sticker]')) link.remove();
    iconLink = null;
    for (const link of document.querySelectorAll(`link[rel="${HIDDEN}"]`)) {
      link.setAttribute('rel', link.getAttribute('data-sticker-rel') || 'icon');
      link.removeAttribute('data-sticker-rel');
    }
  }

  // De los íconos que declara la página, el mejor para dibujar: SVG o el tamaño más cercano a 32 px.
  function pickSource(links) {
    let best = null;
    let bestScore = -1;
    for (const link of links) {
      if (!link.href) continue;
      const sizes = (link.getAttribute('sizes') || '').toLowerCase();
      const n = parseInt(sizes, 10);
      const score = sizes === 'any' || /\.svg(\?|$)/i.test(link.href) ? 1000 : n ? (n >= 32 ? 500 - n : n) : 100;
      if (score >= bestScore) { best = link.href; bestScore = score; }
    }
    return best;
  }

  // Dibuja el ícono de 64×64: favicon arriba a la izquierda + sticker abajo a la derecha.
  async function composite(source) {
    const S = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const g = canvas.getContext('2d');
    const img = sticker.icon === 'badge' ? await loadIcon(source) : null;
    if (img) {
      g.drawImage(img, 0, 0, S * 0.8, S * 0.8);
      drawSticker(g, S * 0.64, S * 0.68, S * 0.68, true);
    } else {
      drawSticker(g, S, S / 2, S / 2, false);   // sin favicon (o modo "reemplazar"): ocupa todo
    }
    try { return canvas.toDataURL('image/png'); } catch { return null; }
  }

  function drawSticker(g, size, cx, cy, badge) {
    const text = sticker.emoji;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (isEmoji(text)) {
      g.font = `${Math.round(size * 0.86)}px ${EMOJI_FONT}`;
      if (badge) { g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = size * 0.14; }   // lo separa del favicon
      g.fillText(text, cx, cy + size * 0.06);
      g.shadowColor = 'transparent';
    } else {
      // Letras: un cuadrado de color con el texto en blanco.
      g.fillStyle = '#5b8cff';
      g.fillRect(cx - size / 2, cy - size / 2, size, size);
      g.fillStyle = '#ffffff';
      g.font = `700 ${Math.round(size * ([...text].length > 1 ? 0.5 : 0.7))}px "Segoe UI", system-ui, sans-serif`;
      g.fillText(text, cx, cy + size * 0.04);
    }
  }

  // El favicon lo descarga la extensión (la página no puede leer imágenes de otros dominios).
  async function loadIcon(url) {
    let data = null;
    try { data = await chrome.runtime.sendMessage({ type: 'sticker:icon', url }); } catch {}
    if (!data) return null;
    // Se espera "load" y no img.decode(): en pestañas de fondo Brave posterga
    // decode() hasta que la pestaña se ve, y el ícono quedaría sin actualizar.
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = data;
    });
  }

  function isEmoji(text) {
    return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(text);
  }

  function prefixFor(text) {
    return isEmoji(text) ? text + ' ' : `[${text}] `;
  }
})();

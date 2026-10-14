// ───────────────────────────────────────────────────────────────
//  Lista para cambiar de pestaña (como Ctrl+Tab de Opera).
//  Se inyecta en la pestaña activa solo cuando presionas el atajo
//  (la nueva pestaña de la extensión la carga por su cuenta).
//  Vive en una "shadow root" cerrada: la página no puede leer los
//  títulos de tus otras pestañas ni cambiar el estilo de la lista.
//  Su trabajo es avisar cuándo sueltas Alt: el resto lo decide
//  el service worker (tabs/sw.js).
// ───────────────────────────────────────────────────────────────
(() => {
  if (window.__mruOverlay?.alive()) return;
  window.__mruOverlay?.dispose();

  const CSS = `
    * { box-sizing: border-box; margin: 0; border-radius: 0 !important; }
    .wrap {
      position: fixed; inset: 0; display: grid; place-items: center;
      background: rgb(0 0 0 / .28); opacity: 0; pointer-events: none;
      transition: opacity 90ms ease;
      font: 13px/1.35 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; color: #e6e7ea;
    }
    .wrap.visible { opacity: 1; pointer-events: auto; }
    .panel {
      width: min(560px, calc(100vw - 32px)); max-height: min(72vh, 560px); overflow: auto;
      padding: 6px 0; background: #1b1d22; border: 1px solid #363a43;
      box-shadow: 0 24px 60px rgb(0 0 0 / .5);
    }
    .row {
      display: grid; grid-template-columns: 16px 1fr auto; align-items: center; gap: 10px;
      height: 34px; padding: 0 14px 0 11px; border-left: 3px solid transparent; cursor: pointer;
    }
    .row:hover { background: #22252c; }
    .row.sel { background: #272b35; border-left-color: #5b8cff; }
    .row.current .title { color: #9aa0aa; }
    .fav { width: 16px; height: 16px; object-fit: contain; }
    .fav.none { background: #363a43; }
    .title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .where { color: #9aa0aa; font-size: 11px; }
    .hint { padding: 8px 14px 4px; border-top: 1px solid #2c2f36; margin-top: 6px; color: #9aa0aa; font-size: 11px; }
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-thumb { background: #3a3e47; }
  `;

  let host = null;
  let wrap = null;
  let panel = null;
  let rows = [];
  let open = false;        // la lista está activa (visible o a punto de aparecer)
  let heldSent = false;
  let showTimer = 0;

  const onMessage = (msg, sender, sendResponse) => {
    if (msg?.type === 'mru:show') {
      show(msg);
      sendResponse({ focused: document.hasFocus() });
    } else if (msg?.type === 'mru:select') {
      select(msg.sel);
    } else if (msg?.type === 'mru:hide') {
      hide();
    }
  };
  chrome.runtime.onMessage.addListener(onMessage);

  window.__mruOverlay = {
    alive() { try { return !!chrome.runtime?.id; } catch { return false; } },
    dispose() { hide(); try { chrome.runtime.onMessage.removeListener(onMessage); } catch {} },
  };

  function show({ items, sel, delay = 0 }) {
    build(items);
    select(sel);
    if (open) return;
    open = true;
    heldSent = false;
    listen(true);
    // Pequeña espera antes de aparecer: si solo tocaste el atajo, la lista ni se ve.
    clearTimeout(showTimer);
    showTimer = setTimeout(() => wrap.classList.add('visible'), delay);
  }

  function build(items) {
    if (!host) {
      host = document.createElement('speeddial-tabs');
      host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';
      const root = host.attachShadow({ mode: 'closed' });
      // Hoja de estilo "construible": las reglas de seguridad (CSP) de la página no la bloquean.
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
      wrap = document.createElement('div');
      wrap.className = 'wrap';
      panel = document.createElement('div');
      panel.className = 'panel';
      panel.setAttribute('role', 'listbox');
      wrap.append(panel);
      root.append(wrap);
      wrap.addEventListener('pointerdown', onPointer);
    }
    if (!host.isConnected) (document.body ?? document.documentElement).append(host);
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Suelta Alt para cambiar · Q avanza · ↑↓ también · Esc cancela';
    panel.replaceChildren(...items.map(row), hint);
    rows = [...panel.querySelectorAll('.row')];
  }

  function row(item, i) {
    const el = document.createElement('div');
    el.className = 'row' + (item.current ? ' current' : '');
    el.dataset.i = i;
    el.setAttribute('role', 'option');
    const icon = document.createElement('img');
    icon.className = 'fav';
    icon.alt = '';
    icon.onerror = () => icon.classList.add('none');
    if (item.icon) icon.src = item.icon;
    else icon.classList.add('none');
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = item.title || item.url || 'Pestaña';
    el.append(icon, title);
    if (item.where) {
      const where = document.createElement('span');
      where.className = 'where';
      where.textContent = item.where;
      el.append(where);
    }
    return el;
  }

  function select(i) {
    rows.forEach((r, k) => {
      r.classList.toggle('sel', k === i);
      r.setAttribute('aria-selected', k === i);
    });
    rows[i]?.scrollIntoView({ block: 'nearest' });
  }

  function hide() {
    open = false;
    clearTimeout(showTimer);
    listen(false);
    wrap?.classList.remove('visible');
    host?.remove();
  }

  // Mientras la lista está activa se escucha el teclado ANTES que la página (fase de captura).
  function listen(on) {
    const method = on ? 'addEventListener' : 'removeEventListener';
    window[method]('keydown', onKey, true);
    window[method]('keyup', onKey, true);
    window[method]('mousemove', onMove, true);
    window[method]('blur', onBlur, true);
  }

  function onKey(e) {
    if (!open) return;
    if (e.key === 'Alt') {
      if (e.type === 'keyup') finish({ type: 'mru:release' });
      else held();
      return;
    }
    if (e.type === 'keydown') {
      if (e.key === 'Escape') return swallow(e, { type: 'mru:cancel' }, true);
      if (e.key === 'Enter') return swallow(e, { type: 'mru:release' }, true);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') return swallow(e, { type: 'mru:command', dir: e.key === 'ArrowDown' ? 1 : -1 });
    }
    // Cualquier otra tecla: si Alt sigue apretada se confirma; si no, es que ya la soltaste.
    if (e.altKey) held();
    else finish({ type: 'mru:release' });
  }

  function onMove(e) {
    if (!open) return;
    if (e.altKey) held();
    else finish({ type: 'mru:release' });
  }

  function onBlur(e) {
    if (open && e.target === window) send({ type: 'mru:blur' });
  }

  function onPointer(e) {
    const r = e.target.closest?.('.row');
    if (r) finish({ type: 'mru:pick', index: Number(r.dataset.i) });
    else if (e.target === wrap) finish({ type: 'mru:cancel' });
  }

  function swallow(e, msg, end = false) {
    e.preventDefault();
    e.stopPropagation();
    if (end) finish(msg);
    else send(msg);
  }

  // Avisar una sola vez que Alt sigue apretada (así el service worker espera a que la sueltes).
  function held() {
    if (heldSent) return;
    heldSent = true;
    send({ type: 'mru:held' });
  }

  function finish(msg) {
    if (!open) return;
    hide();
    send(msg);
  }

  function send(msg) {
    try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch {}
  }
})();

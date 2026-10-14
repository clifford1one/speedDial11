// ───────────────────────────────────────────────────────────────
//  Drag & drop nativo (HTML5), sin librerías.
//   · Borde izquierdo/derecho de una tarjeta → insertar antes/después
//   · Centro de una carpeta → meter dentro (si esperas, se abre)
//   · Centro de un sitio → crear una carpeta con los dos (como Opera)
//   · Arrastrar fuera del panel de una carpeta → sacarlo de la carpeta
//   · Links desde la barra de direcciones u otra página → nuevo sitio
// ───────────────────────────────────────────────────────────────
const TYPE = 'application/x-speeddial-id';
const SPRING_MS = 650;   // espera sobre una carpeta para abrirla
const OUT_MS = 300;      // espera fuera del panel para esconderlo

export function initDnd(ctx) {
  let drag = null;       // { id, isFolder } de la tarjeta que se arrastra desde esta página
  let marked = null;     // { el, cls } marca visual actual
  let spring = { id: null, since: 0 };
  let outTimer = 0;
  let dimFrame = 0;

  document.addEventListener('dragstart', e => {
    const tile = e.target.closest?.('.tile[data-id]');
    if (!tile) return;
    drag = { id: tile.dataset.id, isFolder: tile.classList.contains('folder') };
    const dt = e.dataTransfer;
    dt.effectAllowed = 'copyMove';
    dt.setData(TYPE, drag.id);
    const href = tile.getAttribute('href');
    if (href) {                          // permite soltarlo también en la barra de pestañas
      dt.setData('text/uri-list', href);
      dt.setData('text/plain', href);
    }
    // Se atenúa en el siguiente cuadro: así la "imagen fantasma" sale opaca.
    dimFrame = requestAnimationFrame(() => tile.classList.add('dragging'));
    ctx.startDrag();
  });

  document.addEventListener('dragover', e => {
    const kind = kindOf(e.dataTransfer);
    if (!kind || e.target.closest?.('input, textarea')) return;
    e.preventDefault();                  // permite soltar (y evita que Brave abra el link)
    if (kind === 'files') { e.dataTransfer.dropEffect = 'none'; return; }
    const spot = locate(e, kind);
    e.dataTransfer.dropEffect = spot && !spot.self ? (kind === 'internal' ? 'move' : 'copy') : 'none';
    mark(spot);
    springLoad(spot);
    dragOut(e);
  });

  document.addEventListener('dragleave', e => {
    if (!e.relatedTarget) mark(null);    // el puntero salió de la ventana
  });

  document.addEventListener('drop', async e => {
    const kind = kindOf(e.dataTransfer);
    if (!kind || e.target.closest?.('input, textarea')) return;
    e.preventDefault();
    const spot = kind !== 'files' && locate(e, kind);
    mark(null);
    if (!spot || spot.self) return;
    try {
      if (kind === 'internal') await ctx.drop(spot, e.dataTransfer.getData(TYPE) || drag?.id);
      else await ctx.drop(spot, null, readLink(e.dataTransfer));
    } catch (err) {
      console.error(err);
    }
  });

  document.addEventListener('dragend', () => {
    cancelAnimationFrame(dimFrame);
    document.querySelector('.tile.dragging')?.classList.remove('dragging');
    mark(null);
    clearTimeout(outTimer);
    outTimer = 0;
    spring = { id: null, since: 0 };
    drag = null;
    ctx.endDrag();
  });

  function kindOf(dt) {
    if (!dt) return null;
    if (dt.types.includes(TYPE)) return 'internal';
    if (dt.types.includes('text/uri-list')) return 'external';
    if (dt.types.includes('Files')) return 'files';   // se ignoran, pero sin que Brave abra el archivo
    return null;
  }

  // Dónde caería lo que se arrastra según la posición del puntero:
  // { mode, dest: destino en marcadores, targetId, el: tarjeta a marcar }.
  function locate(e, kind) {
    const grid = e.target.closest?.('.grid');
    if (!grid) return null;
    const inFolder = grid.id === 'folder-grid';
    const parentId = inFolder ? ctx.folderId() : ctx.rootId();
    if (!parentId) return null;

    const tile = e.target.closest('.tile');
    if (!tile || tile.classList.contains('add')) {
      return { mode: 'end', dest: { parentId }, el: grid.querySelector(':scope > .tile.add') };
    }
    if (drag && tile.dataset.id === drag.id) return { self: true };

    const targetId = tile.dataset.id;
    const r = tile.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const canNest = !inFolder && !(kind === 'internal' && drag?.isFolder);   // un solo nivel de carpetas
    if (canNest && x > 0.25 && x < 0.75) {
      return tile.classList.contains('folder')
        ? { mode: 'into', dest: { parentId: targetId }, targetId, el: tile }
        : { mode: 'combine', dest: { parentId }, targetId, el: tile };
    }
    const mode = x < 0.5 ? 'before' : 'after';
    // Índice "antes de mover": chrome.bookmarks.move ya compensa al mover dentro de la misma carpeta.
    const index = Number(tile.dataset.index) + (mode === 'after' ? 1 : 0);
    return { mode, dest: { parentId, index }, targetId, el: tile };
  }

  function mark(spot) {
    const el = spot?.el ?? null;
    const cls = el ? 'drop-' + spot.mode : '';
    if (marked?.el === el && marked.cls === cls) return;
    marked?.el.classList.remove(marked.cls);
    el?.classList.add(cls);
    marked = el ? { el, cls } : null;
  }

  // Mantener el puntero sobre una carpeta la abre, para soltar en una posición exacta.
  function springLoad(spot) {
    if (spot?.mode !== 'into') { spring = { id: null, since: 0 }; return; }
    if (spring.id !== spot.targetId) { spring = { id: spot.targetId, since: performance.now() }; return; }
    if (performance.now() - spring.since > SPRING_MS) {
      spring = { id: null, since: 0 };
      ctx.openFolder(spot.targetId);
    }
  }

  // Con una carpeta abierta, si el puntero sale del panel se esconde el panel
  // para poder soltar en la grilla principal.
  function dragOut(e) {
    const overlay = document.getElementById('folder-view');
    if (!ctx.folderId() || overlay.classList.contains('drag-out')) return;
    if (e.target !== overlay) { clearTimeout(outTimer); outTimer = 0; return; }
    outTimer ||= setTimeout(() => { outTimer = 0; overlay.classList.add('drag-out'); }, OUT_MS);
  }
}

// Lee el link de algo arrastrado desde fuera (barra de direcciones, otra página…).
function readLink(dt) {
  const url = (dt.getData('text/uri-list') || '').split(/\r?\n/).find(line => line && !line.startsWith('#'));
  if (!url) return null;
  const html = dt.getData('text/html');
  const title = html ? new DOMParser().parseFromString(html, 'text/html').body.textContent.trim() : '';
  return { url, title: title.slice(0, 200) };
}

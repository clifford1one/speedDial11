// ───────────────────────────────────────────────────────────────
//  Datos: todo lo que toca chrome.bookmarks vive aquí.
//  La carpeta "SpeedDial" (en "Otros marcadores") es la fuente de
//  verdad, así viaja con Brave Sync y sobrevive si quitas la extensión.
// ───────────────────────────────────────────────────────────────
const ROOT_TITLE = 'SpeedDial';
const FOLDER_NAME = 'Carpeta';
let rootId = null;

// Busca la carpeta raíz (o la crea) y recuerda su id. Se guarda el id y no
// solo el nombre para que siga funcionando aunque la renombres.
export async function init(savedId = null) {
  rootId = (await findRoot(savedId)) ?? (await createRoot());
  rootId = await preferSynced(rootId);
  if (rootId !== savedId) await chrome.storage.local.set({ rootId });
  return rootId;
}

// Si tu carpeta está vacía pero existe otra "SpeedDial" con sitios (por ejemplo, llegó
// por Brave Sync después de instalar en un equipo nuevo), se usa esa y se borra la vacía.
async function preferSynced(id) {
  if ((await chrome.bookmarks.getChildren(id)).length) return id;
  const others = (await chrome.bookmarks.search({ title: ROOT_TITLE })).filter(n => !n.url && n.id !== id);
  for (const other of others) {
    if ((await chrome.bookmarks.getChildren(other.id)).length) {
      await chrome.bookmarks.remove(id).catch(() => {});
      return other.id;
    }
  }
  return id;
}

async function findRoot(savedId) {
  if (savedId) {
    const [node] = await chrome.bookmarks.get(savedId).catch(() => []);
    if (node && !node.url) return node.id;
  }
  const matches = await chrome.bookmarks.search({ title: ROOT_TITLE });
  return matches.find(n => !n.url)?.id ?? null;
}

async function createRoot() {
  // '0' es la raíz invisible; sus hijos son Barra de marcadores, Otros marcadores, etc.
  const top = await chrome.bookmarks.getChildren('0');
  const other = top.find(n => n.folderType === 'other') ?? top[1] ?? top[0];
  const folder = await chrome.bookmarks.create({ parentId: other.id, title: ROOT_TITLE });
  return folder.id;
}

export async function getTree() {
  const [node] = await chrome.bookmarks.getSubTree(rootId);
  return node;
}

export const create = props => chrome.bookmarks.create(props);
export const update = (id, changes) => chrome.bookmarks.update(id, changes);
export const move = (id, destination) => chrome.bookmarks.move(id, destination);
export const remove = node => node.url ? chrome.bookmarks.remove(node.id) : chrome.bookmarks.removeTree(node.id);

// Crea una carpeta en el lugar de `target` y mete ahí `target` y luego `sourceId`
// (lo que pasa en Opera al soltar un sitio encima de otro).
export async function combine(sourceId, target) {
  const folder = await chrome.bookmarks.create({ parentId: target.parentId, index: target.index, title: FOLDER_NAME });
  await chrome.bookmarks.move(target.id, { parentId: folder.id });
  await chrome.bookmarks.move(sourceId, { parentId: folder.id });
  return folder.id;
}

// Vuelve a crear un nodo borrado y sus hijos (para "Deshacer").
// Los marcadores recreados tienen ids nuevos: onCreated(idViejo, idNuevo) avisa cuáles.
export async function restore(node, onCreated, parentId = node.parentId) {
  const props = { parentId, index: node.index, title: node.title };
  if (node.url) props.url = node.url;
  let created;
  try {
    created = await chrome.bookmarks.create(props);
  } catch {
    // La carpeta original ya no existe o cambió de tamaño: se deja al final del inicio.
    delete props.index;
    created = await chrome.bookmarks.create({ ...props, parentId: rootId });
  }
  onCreated(node.id, created.id);
  for (const child of node.children ?? []) await restore(child, onCreated, created.id);
  return created;
}

// Avisa (cb) cuando cambia algo DENTRO de SpeedDial. Los cambios en el resto de tus
// marcadores se ignoran: así una sincronización grande no hace trabajar a la página.
export function watch(cb, isKnown) {
  const b = chrome.bookmarks;
  b.onCreated.addListener((id, node) => isKnown(node.parentId) && cb());
  b.onRemoved.addListener((id, info) => (isKnown(id) || isKnown(info.parentId)) && cb());
  b.onChanged.addListener(id => isKnown(id) && cb());
  b.onMoved.addListener((id, info) => (isKnown(id) || isKnown(info.parentId) || isKnown(info.oldParentId)) && cb());
  b.onChildrenReordered.addListener(id => isKnown(id) && cb());
  b.onImportEnded?.addListener(cb);
}

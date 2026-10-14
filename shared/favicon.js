// Íconos de los sitios desde la caché de favicons de Brave (permiso "favicon"): no usa internet.
export const faviconUrl = (pageUrl, size = 32) =>
  chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`);

// Brave entrega el mismo globo genérico para todo sitio sin ícono guardado.
const generic = new Map();   // tamaño → bytes del globo
export async function isGeneric(blob, size) {
  if (!generic.has(size)) generic.set(size, fetch(faviconUrl('https://speeddial.invalid/', size)).then(r => r.arrayBuffer()));
  const [a, b] = (await Promise.all([blob.arrayBuffer(), generic.get(size)])).map(buf => new Uint8Array(buf));
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// Convierte un archivo a "data URL" (texto) para poder mandarlo en un mensaje.
export async function toDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

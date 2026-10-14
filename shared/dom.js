// Atajos para crear elementos en las páginas de la extensión.

// el('span', 'clase', hijo, 'texto', …). Los hijos vacíos (null, undefined, false) se ignoran.
export function el(tag, className = '', ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter(c => c != null && c !== false));
  return node;
}

// Botón que no envía formularios.
export function button(text, onClick, className = 'btn') {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

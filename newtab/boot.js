// Se ejecuta antes de pintar la página (es un script clásico en <head>, no un módulo).
// Aplica la última personalización para que no aparezcan un instante los colores
// por defecto. La fuente de verdad sigue siendo chrome.storage: esto es solo una
// copia rápida en localStorage, que a diferencia de chrome.storage se lee al instante.
try {
  const boot = JSON.parse(localStorage.getItem('sd-boot') || 'null');
  if (boot) {
    const root = document.documentElement;
    for (const name in boot.vars) root.style.setProperty(name, boot.vars[name]);
    Object.assign(root.dataset, boot.data);
    if (boot.css) {
      const style = document.createElement('style');
      style.id = 'custom-css';
      style.textContent = boot.css;
      document.head.append(style);
    }
  }
} catch {}

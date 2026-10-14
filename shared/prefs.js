// Valores por defecto de las preferencias. Los usan el service worker y las páginas
// (menú del ícono y página de ajustes), así se definen en un solo lugar.

// Stickers. icon: badge (encima del favicon) | replace (en su lugar) | off (no tocar)
export const STICKER_PREFS = { title: true, icon: 'badge' };

// Cambio de pestañas.
//   mode: overlay (lista mientras mantienes Alt) | rapido (cambia al instante, sin lista)
//   scope: window (solo esta ventana) | all (todas las ventanas)
export const TAB_PREFS = { mode: 'overlay', scope: 'window' };

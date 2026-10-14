// Proceso de fondo (service worker). Brave lo despierta solo cuando hay algo que hacer.
// Cada módulo registra sus eventos al importarse: tiene que ser de inmediato,
// para que Brave sepa a quién despertar.
import { createMenus } from './stickers/sw.js';
import './tabs/sw.js';

// Al instalar o actualizar: se crean los menús del clic derecho
// y se borran los datos de la barra lateral que tenía la v0.4.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(createMenus);
  chrome.storage.local.remove(['boards', 'sideApps', 'sidePrefs']);
});

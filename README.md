# SpeedDial11

Extensión para Brave (Manifest V3) con funciones de Opera:

- **Speed Dial con carpetas** en la nueva pestaña.
- **Stickers** para distinguir pestañas (incluso dos del mismo sitio).
- **Cambio de pestañas por uso reciente** (como el Ctrl+Tab de Opera).

## Instalar

1. Abre `brave://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** y elige esta carpeta (la que contiene `manifest.json`).
4. Abre una pestaña nueva. Si Brave pregunta si quieres conservar el cambio de página de nueva pestaña, elige conservarlo.
5. Fija el ícono en la barra: botón de extensiones (la pieza de rompecabezas) → 📌 junto a **SpeedDial11**.

Si editas el código, pulsa ⟳ en la tarjeta de la extensión en `brave://extensions`.

**Atajos:** se ven y se cambian en `brave://extensions/shortcuts`. Si actualizaste desde una versión anterior, puede que Brave no asigne solo los atajos nuevos: ahí los pones.

| Atajo | Qué hace |
|---|---|
| **Alt+S** | Menú de stickers |
| **Alt+Q** | Pestaña usada antes (mantén Alt y repite Q para ir más atrás) |
| **Alt+Shift+Q** | Recorre las pestañas recientes al revés |

**Ajustes:** clic derecho en el ícono → **Opciones** (o «Ajustes» en el menú de stickers). El diseño del Speed Dial se cambia desde la nueva pestaña, con el botón de arriba a la derecha.

## Dónde quedan tus datos

| Qué | Dónde | ¿Se sincroniza? |
|---|---|---|
| Sitios y carpetas | Marcadores → Otros marcadores → **SpeedDial** | Sí, con Brave Sync (si sincronizas marcadores) |
| Diseño (colores, efectos, CSS) | Este equipo | No. Usa Personalizar → Copia de seguridad → Exportar/Importar |
| Fondo e íconos subidos | Este equipo (IndexedDB) | No |
| Stickers | Este equipo | No (son de tus pestañas abiertas) |

Si desinstalas la extensión, tus sitios quedan como marcadores normales.

**Llevarte tus sitios a otro equipo:** con Brave Sync (marcadores activados) llegan solos. Sin Sync: `brave://bookmarks` → ⋮ → Exportar marcadores, e importa ese archivo en el otro equipo (`brave://settings/importData`); después mueve la carpeta **SpeedDial** a **Otros marcadores**. El diseño se lleva aparte con Exportar/Importar, después de tener los marcadores (la personalización de cada tarjeta se reconoce por su dirección).

## Speed Dial

- **Agregar:** el botón **+**, clic derecho en el fondo, o arrastrar un link desde la barra de direcciones u otra página.
- **Arrastrar una tarjeta:**
  - al borde de otra tarjeta: reordena;
  - al centro de una carpeta: la mete dentro (si esperas un momento, la carpeta se abre);
  - al centro de otro sitio: crea una carpeta con los dos, como en Opera;
  - fuera del panel de una carpeta: la saca de la carpeta.
- **Clic derecho en un sitio:** abrir en pestaña o ventana nueva, copiar la dirección, editar (nombre, dirección, carpeta, ícono, color) y eliminar, con **Deshacer**.
- **Clic derecho en una carpeta:** abrir todo, o abrir todo como un grupo de pestañas con el nombre de la carpeta.
- **Shift + clic derecho:** el menú normal de Brave.
- **Personalizar (arriba a la derecha):** estilos rápidos, fondo (color, degradado o imagen, con desenfoque y oscurecido), cuadrícula, tarjetas, efectos, colores, fuente, reloj, buscador, frase y CSS propio.

## Stickers de pestaña

**Cómo poner uno** (en una pestaña con un sitio web abierto):

- Pulsa el ícono de SpeedDial11 en la barra (o **Alt+S**) y elige un emoji, o escribe uno propio (también sirven 1–2 letras). Las teclas **1–8** eligen los colores de la primera fila y **0** lo quita.
- O haz clic derecho sobre la página → **Sticker de pestaña** → un color.

**Dónde se ve:** antes del título (`🔴 Gmail`) y encima del favicon. En **Opciones** eliges si va en el título y cómo se ve en el ícono (encima del favicon, en su lugar, o sin tocarlo).

**Cuánto dura:** es de esa pestaña, no del sitio: dos pestañas de Gmail pueden llevar stickers distintos. Se mantiene al recargar y al navegar. Al reiniciar Brave, cada sticker vuelve a su pestaña según la dirección y la posición; normalmente funciona, pero no es 100 % seguro.

**Si no aparece:**
- En la nueva pestaña, en `brave://…`, en la tienda de extensiones y en PDFs no se puede mostrar (Brave no deja modificarlas). Queda guardado y aparece cuando la pestaña abre un sitio web.
- En `brave://extensions` → Detalles de SpeedDial11 → **Acceso a sitios** tiene que estar en **En todos los sitios**.

Las pestañas sin sticker no cargan ningún código de la extensión.

## Cambiar de pestaña (como Ctrl+Tab de Opera)

- **Toque rápido:** **Alt+Q** y sueltas: vuelves a la pestaña que usaste antes. Otro toque te devuelve.
- **Ir más atrás:** mantén **Alt** y toca **Q** varias veces. Aparece la lista de pestañas, de la más a la menos usada; al soltar Alt vas a la marcada.
- **Dentro de la lista:** **Alt+Shift+Q** retrocede, ↑↓ también mueven la selección, **Esc** cancela y un clic elige.
- **En Opciones:** modo con lista o rápido (cada toque cambia al instante), y si entran solo las pestañas de esta ventana o las de todas.
- **Liviano:** Brave ya anota cuándo usaste cada pestaña, así que la extensión no vigila tus cambios de pestaña. Solo actúa al presionar el atajo.

## Estructura

```
speedDial11/
├── manifest.json        ← configuración de la extensión (comentada)
├── background.js        ← proceso de fondo: carga stickers/sw.js y tabs/sw.js
├── icons/
├── shared/              ← preferencias por defecto, íconos de sitios y ayudas para crear elementos
├── options/             ← página de Opciones
├── newtab/              ← Speed Dial
│   ├── newtab.html/.css ← página y estilos (lo personalizable son variables CSS)
│   ├── boot.js          ← aplica tu tema antes del primer pintado (evita parpadeo)
│   ├── main.js          ← grilla, carpetas, menú, editor, deshacer
│   ├── store.js         ← todo lo que toca chrome.bookmarks
│   ├── dnd.js           ← arrastrar y soltar
│   ├── settings.js      ← valores por defecto, guardar y aplicar ajustes
│   ├── settings-ui.js   ← panel Personalizar (se carga solo al abrirlo)
│   └── images.js        ← fondo e íconos subidos (IndexedDB)
├── stickers/
│   ├── sw.js            ← qué pestaña tiene qué sticker; menú del clic derecho
│   ├── content.js       ← se inyecta solo en pestañas con sticker: título e ícono
│   └── popup.*          ← menú del ícono de la extensión
└── tabs/
    ├── sw.js            ← Alt+Q y orden por uso reciente
    └── overlay.js       ← la lista de pestañas (se inyecta solo al presionar el atajo)
```

## Límites conocidos

**Speed Dial**
- **El foco no va a la barra de direcciones.** Chromium no lo permite en una nueva pestaña de extensión. Escribe en el buscador de la página o usa Ctrl+L.
- **Íconos:** salen de la caché de favicons de Brave. Un sitio que nunca visitaste muestra su inicial hasta que lo visites.
- **El estilo de tarjeta «Vidrio»** es el único ajuste que le pide más a la tarjeta gráfica.
- **Animaciones:** si las desactivaste en Windows, la página también.

**Stickers**
- **No se pueden poner desde el clic derecho sobre la pestaña:** Brave no lo permite a las extensiones. Están en el clic derecho sobre la página y sobre el ícono.
- **El emoji forma parte del título real de la página:** si la guardas como marcador mientras tiene sticker, el título lo incluye.

**Cambio de pestañas**
- **Ctrl+Tab no se puede usar:** Brave no deja reasignarlo; por eso es Alt+Q.
- **En páginas internas de Brave, la tienda y los PDFs no hay lista:** la lista tiene que estar dentro de la página para saber cuándo sueltas Alt. Ahí cada toque cambia al instante y el recorrido se confirma tras 0,9 s.
- **Si el cursor está en la barra de direcciones,** la página no recibe el teclado: la lista aparece igual y se confirma sola tras una pausa corta.

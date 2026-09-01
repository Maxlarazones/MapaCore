# LRMap — mapa base La Razón

Chasis común para todos los mapas interactivos. No conoce ninguna fuente de datos:
cada proyecto le entrega GeoJSON normalizado y, si quiere, cómo pintarlo.

```
lr-map-base/
├── lrmap.js      ← núcleo (≈18 KB sin minificar)
├── lrmap.css     ← chrome y tokens
└── index.html    ← demostración con datos de prueba
```

Peso en el navegador: Leaflet 42 KB gz + LRMap ~6 KB gz. Sin build, sin framework,
sin clave de API para el basemap por defecto.

---

## 1. Contrato de datos

Toda fuente (RSS, XML, DATEX2, API JSON, CSV) se convierte **en el backend** a este GeoJSON.
Es la pieza que hace reutilizable todo lo demás: leyenda, panel, filtros, tabla accesible
y deep-link funcionan sin tocar nada si las propiedades se llaman así.

| Propiedad   | Tipo             | Uso                                                        |
|-------------|------------------|------------------------------------------------------------|
| `id`        | string           | Deep-link y actualización incremental. Obligatoria.        |
| `titulo`    | string           | Tooltip y cabecera del panel. Obligatoria.                 |
| `resumen`   | string           | Párrafo del panel.                                         |
| `ts`        | ISO 8601         | Fecha del dato (no de la carga).                           |
| `nivel`     | 0–4              | Intensidad → tamaño y color por defecto.                   |
| `categoria` | string \| number | Clave de filtrado desde la leyenda.                        |
| `valor`     | number           | Cifra destacada del panel.                                 |
| `unidad`    | string           | Sufijo de `valor`.                                         |
| `lugar`     | string           | Municipio o provincia.                                     |
| `url`       | string           | Enlace al artículo relacionado. Alimenta la recirculación. |

Cualquier propiedad extra se conserva y está disponible en los callbacks.

## 2. Uso mínimo

```html
<div id="mapa"></div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="/lrmap.js"></script>
<script>
  const mapa = LRMap.crear({
    el: '#mapa',
    titulo: 'Incendios activos en España',
    fuente: { texto: 'NASA FIRMS', url: 'https://firms.modaps.eosdis.nasa.gov' },
    actualizado: datos.generado,
    encuadre: 'espana'
  });
  mapa.cargar('/api/incendios.geojson');
</script>
```

`cargar()` ya gestiona spinner, error con botón de reintento y estado vacío.

## 3. Opciones

| Opción                | Por defecto | Qué hace                                                     |
|-----------------------|-------------|--------------------------------------------------------------|
| `encuadre`            | `'espana'`  | `espana`, `peninsula`, `canarias`, `baleares`, `madrid` u objeto propio |
| `basemap`             | `'lienzo'`  | `lienzo` (CARTO), `ign`, `satelite` (PNOA)                    |
| `tema`                | `'auto'`    | `dia`, `noche`, `auto`                                        |
| `leyenda`             | `null`      | Array de items; con `filtrable: true` filtran por `categoria` |
| `gestosCooperativos`  | `true`      | Un dedo desplaza la página; Ctrl/⌘ + rueda hace zoom          |
| `deepLink`            | `true`      | Sincroniza `#zoom/lat/lng/id` con la URL                      |
| `selectorCapas`       | `false`     | Botón para rotar entre capas base                             |
| `estilo(f)`           | `null`      | Devuelve opciones de path para polígonos y líneas             |
| `punto(f, latlng)`    | `null`      | Devuelve una capa Leaflet propia para cada punto              |
| `alSeleccionar(f, l)` | `null`      | Devuelve el contenido del panel, o `false` para no abrirlo    |

## 4. Métodos y eventos

```js
mapa.setDatos(geojson)     mapa.cargar(url, transformar)
mapa.ajustarADatos()       mapa.reencuadrar()
mapa.setLeyenda(items, titulo, nota)
mapa.setActualizado(iso)   mapa.mostrarEstado(tipo, mensaje, boton, fn)
mapa.abrirPanel({...})     mapa.cerrarPanel()

mapa.on('seleccion', f => ...)   // también como evento DOM lrmap:seleccion
mapa.on('datos', ({total}) => ...)
mapa.on('filtro', f => ...)      mapa.on('error', e => ...)
```

Los eventos DOM burbujean, así que la medición se conecta una sola vez y sirve
para todos los mapas:

```js
document.addEventListener('lrmap:seleccion', e => {
  dataLayer.push({ event: 'mapa_interaccion', mapa_id: 'incendios', elemento: e.detail.properties.id });
});
```

## 5. Embebido en artículo

El mapa vive en Vercel y entra en el artículo por iframe, así que no depende del
calendario de despliegues del CMS.

```html
<iframe src="https://mapas.larazon.es/incendios/" title="Incendios activos en España"
        style="width:100%;border:0;height:520px" loading="lazy" scrolling="no"></iframe>
<script>
  addEventListener('message', e => {
    if (e.origin !== 'https://mapas.larazon.es') return;
    if (e.data?.tipo === 'lrmap:alto') {
      document.querySelector('iframe[src^="https://mapas.larazon.es"]').style.height = e.data.alto + 'px';
    }
  });
</script>
```

`loading="lazy"` mantiene el mapa fuera del LCP. La altura llega por `postMessage`
para que no haya salto de layout.

## 6. Decisiones que conviene no revertir sin motivo

- **El basemap es casi acromático.** El rojo de marca se reserva al dato. Un basemap
  vistoso compite con lo único que importa.
- **Gestos cooperativos activados.** Un mapa que atrapa el scroll en móvil hunde el
  scroll depth de la noticia entera.
- **`aspect-ratio` en vez de `height` fija.** Cero CLS.
- **Canvas, no SVG.** Por encima de ~400 elementos, SVG se arrastra en gama media.
- **Tabla oculta con los datos.** Accesibilidad y algo de contenido indexable.

## 7. Límites conocidos

- Los tiles de CARTO son gratuitos bajo uso razonable (del orden de 75.000 cargas
  al mes). Por encima hay que pasar a plan de pago, a MapTiler/Stadia con clave, o
  al WMTS del IGN, que es gratuito pero sólo cubre España y es visualmente más pobre.
  El cambio es una línea en `BASEMAPS`.
- Sin clustering. Por encima de ~2.000 puntos hay que añadir Supercluster o agregar
  por municipio en el backend.
- Sin capa de coropletas lista. La geometría de municipios y provincias pesa
  demasiado para incluirla en el núcleo; va como módulo aparte con topojson.

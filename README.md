# LRMap — mapa base La Razón

Chasis común para todos los mapas interactivos: incendios, tráfico, alertas
meteorológicas, sismos, lo que venga. No conoce ninguna fuente de datos.

```
lr-map-base/
├── index.html                 demostración con datos de prueba
├── lrmap.js                   núcleo (~22 KB sin minificar)
├── lrmap.css                  estilos y variables
└── datos/base-espana.json     cartografía (88 KB, 19 KB con gzip)
```

**Sin proveedor de tiles.** Ni CARTO, ni Mapbox, ni MapTiler, ni IGN. La
cartografía es un fichero propio servido desde el mismo dominio: sin clave, sin
cuota, sin marca de agua, sin factura, y sin que un tercero pueda tumbar el mapa
en plena cobertura. La única dependencia externa es Leaflet.

---

## 1. Las tres decisiones de diseño

**Proyección cónica conforme de Lambert**, calibrada con los paralelos 37° y 43°,
la familia que usa el IGN para España. Mercator estira España un 30% en vertical;
esto no. Es la diferencia entre un mapa de periódico y un widget.

**Canarias en recuadro**, a escala y en su sitio del papel, no a 1.800 km al
suroeste obligando al lector a alejar el zoom. El recuadro se dibuja en píxeles,
no en coordenadas: un marco geográfico saldría girado por la convergencia de
meridianos. Los datos que caen en Canarias se desplazan solos.

**Topónimos propios en español**, con jerarquía por zoom: comunidades en serif
espaciado hasta z 6,4; provincias a partir de ahí; ciudades desde z 7,6. Con
supresión de solapes. Ningún proveedor sirve etiquetas en español fiables.

Alrededor de eso: filete rojo de cabecera, firma en el pie, y un basemap casi
acromático para que el rojo de marca quede reservado al dato.

## 2. Contrato de datos

Toda fuente (RSS, XML, DATEX2, API, CSV) se convierte **en el backend** a este
GeoJSON. Es lo que hace reutilizable el resto: leyenda, ficha, filtros, tabla
accesible y deep-link funcionan sin escribir nada si las propiedades se llaman así.

| Propiedad   | Tipo             | Uso                                                    |
|-------------|------------------|--------------------------------------------------------|
| `id`        | string           | Deep-link. Obligatoria.                                |
| `titulo`    | string           | Tooltip y cabecera de la ficha. Obligatoria.           |
| `resumen`   | string           | Párrafo de la ficha.                                   |
| `ts`        | ISO 8601         | Fecha del dato, no de la carga.                        |
| `nivel`     | 0–4              | Intensidad: tamaño y color por defecto.                |
| `categoria` | string \| number | Clave de filtrado desde la leyenda.                    |
| `valor`     | number           | Cifra destacada.                                       |
| `unidad`    | string           | Sufijo de `valor`.                                     |
| `lugar`     | string           | Municipio o provincia.                                 |
| `url`       | string           | Enlace al artículo. Es la recirculación del mapa.      |

Si el JSON de datos trae un campo `generado` con fecha ISO, `cargar()` actualiza
solo el sello de la cabecera.

## 3. Uso mínimo

```html
<div id="mapa"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="/lrmap.js"></script>
<script>
  const mapa = LRMap.crear({
    el: '#mapa',
    titulo: 'Incendios activos en España',
    entradilla: 'Focos detectados por satélite en las últimas 24 horas.',
    fuente: { texto: 'NASA FIRMS', url: 'https://firms.modaps.eosdis.nasa.gov' },
    nota: 'El satélite detecta calor, no incendios: puede marcar quemas agrícolas.'
  });
  mapa.on('listo', () => mapa.cargar('/api/incendios.geojson'));
</script>
```

`cargar()` gestiona spinner, error con reintento y estado vacío. Espera al evento
`listo` para no pintar datos antes de que exista el mapa.

## 4. Opciones

| Opción                | Por defecto              | Qué hace                                              |
|-----------------------|--------------------------|-------------------------------------------------------|
| `encuadre`            | `'espana'`               | `espana`, `peninsula`, `canarias`, `baleares`, `madrid` u objeto |
| `detalle`             | `'auto'`                 | Fuerza `ccaa` o `provincias` en los topónimos          |
| `tema`                | `'dia'`                  | `dia` o `noche`                                        |
| `leyenda`             | `null`                   | `{ titulo, nota, items:[{id, etiqueta, color, forma, filtrable}] }` |
| `nota`                | `''`                     | Metodología o advertencia, al pie                      |
| `insetCanarias`       | `true`                   | Recuadro y desplazamiento automático de los datos      |
| `gestosCooperativos`  | `true`                   | Un dedo desplaza la página; Ctrl/⌘ + rueda hace zoom   |
| `deepLink`            | `true`                   | Sincroniza `#zoom/lat/lng/id` con la URL               |
| `geolocalizacion`     | `false`                  | Añade el botón de "ir a mi zona"                       |
| `firma`               | `'La Razón'`             | Texto de firma en el pie                               |
| `cartografia`         | `'datos/base-espana.json'` | Ruta del fichero cartográfico                        |
| `estilo(f)`           | `null`                   | Opciones de trazo para polígonos y líneas              |
| `punto(f, latlng)`    | `null`                   | Capa Leaflet propia para cada punto                    |
| `alSeleccionar(f, c)` | `null`                   | Contenido de la ficha, o `false` para no abrirla       |

## 5. Métodos y eventos

```js
mapa.setDatos(geojson)      mapa.cargar(url, transformar)
mapa.ajustarADatos()        mapa.reencuadrar()
mapa.setLeyenda({...})      mapa.setActualizado(iso)
mapa.abrirFicha({...})      mapa.cerrarFicha()
mapa.mostrarEstado(tipo, mensaje, boton, fn)

mapa.on('listo',      () => ...)   // cartografía dibujada
mapa.on('datos',      ({total}) => ...)
mapa.on('seleccion',  f => ...)
mapa.on('filtro',     f => ...)
mapa.on('error',      e => ...)
```

Los eventos también burbujean como eventos DOM, así que la medición se conecta
una sola vez y sirve para todos los mapas presentes y futuros:

```js
document.addEventListener('lrmap:seleccion', e => {
  dataLayer.push({ event: 'mapa_interaccion', mapa_id: 'incendios',
                   elemento: e.detail.properties.id });
});
```

## 6. Embebido en artículo

Vive en Vercel y entra por iframe, así que no depende del calendario del CMS.

```html
<iframe src="https://mapas.larazon.es/incendios/" title="Incendios activos en España"
        style="width:100%;border:0;height:560px" loading="lazy" scrolling="no"></iframe>
<script>
  addEventListener('message', e => {
    if (e.origin !== 'https://mapas.larazon.es') return;
    if (e.data?.tipo === 'lrmap:alto') {
      document.querySelector('iframe[src^="https://mapas.larazon.es"]')
        .style.height = e.data.alto + 'px';
    }
  });
</script>
```

## 7. Cómo se regenera la cartografía

`datos/base-espana.json` se construye a partir de Natural Earth 1:10M, que es de
dominio público y sin restricción comercial. El proceso: filtrar España, simplificar
al 8% preservando topología, disolver por comunidad, calcular puntos interiores de
etiqueta, desplazar Canarias y redondear a tres decimales. Se regenera solo si hace
falta más detalle o cambia una división administrativa: no es un paso de despliegue.

Los nombres de provincia van en su forma castellana (Gerona, Lérida, La Coruña,
Orense). Es una decisión editorial, no técnica: si la redacción prefiere las formas
oficiales, se cambian en el fichero y ya.

## 8. Límites conocidos

- **No hay callejero.** Es cartografía de escala nacional y provincial. Útil hasta
  zoom 10-11. Un mapa que necesite ver calles (un accidente en una travesía
  concreta) necesita otra cosa.
- **Sin clustering.** Por encima de ~2.000 puntos hay que agregar en el backend o
  añadir Supercluster.
- **Sin municipios.** La geometría de los 8.131 municipios pesa demasiado para el
  núcleo. Va como fichero aparte cuando un proyecto lo pida.
- **La proyección es propia**, así que ninguna capa de tiles raster encajará
  encima. Es el precio de no tener proveedor, y es un precio que conviene pagar.

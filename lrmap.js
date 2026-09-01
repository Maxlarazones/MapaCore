/* ==========================================================================
   LRMap v2 — base cartográfica La Razón
   Cartografía propia. Sin tiles, sin proveedor, sin clave, sin cuota.

   Tres decisiones que lo separan de un mapa web cualquiera:
   1. Proyección cónica conforme de Lambert calibrada para España (37°/43°),
      la familia que usa el IGN. España tiene su forma real, no la estirada
      de Mercator.
   2. Cartografía vectorial propia de 19 KB, con topónimos en español.
   3. Canarias en recuadro, a escala, como en el mapa impreso.

   Requiere Leaflet 1.9.x.
   ========================================================================== */

(function (global) {
  'use strict';

  var L = global.L;

  // =========================================================================
  // 1. Proyección: cónica conforme de Lambert para España
  // =========================================================================

  var R = 6378137, rad = Math.PI / 180;
  var LAT1 = 37 * rad, LAT2 = 43 * rad, LAT0 = 40 * rad, LON0 = -3 * rad;

  function tg(p) { return Math.tan(Math.PI / 4 + p / 2); }

  var N = Math.log(Math.cos(LAT1) / Math.cos(LAT2)) / Math.log(tg(LAT2) / tg(LAT1));
  var FF = Math.cos(LAT1) * Math.pow(tg(LAT1), N) / N;
  var RHO0 = R * FF / Math.pow(tg(LAT0), N);
  var MUNDO = 20037508.342789244;   // mantiene los niveles de zoom familiares

  var ProyeccionEspana = {
    project: function (latlng) {
      var p = Math.max(-1.4835, Math.min(1.4835, latlng.lat * rad));
      var rho = R * FF / Math.pow(tg(p), N);
      var th = N * (latlng.lng * rad - LON0);
      return new L.Point(rho * Math.sin(th), RHO0 - rho * Math.cos(th));
    },
    unproject: function (punto) {
      var dy = RHO0 - punto.y;
      var rho = (N < 0 ? -1 : 1) * Math.sqrt(punto.x * punto.x + dy * dy);
      var th = Math.atan2(punto.x, dy);
      var lat = 2 * Math.atan(Math.pow(R * FF / rho, 1 / N)) - Math.PI / 2;
      return new L.LatLng(lat / rad, (LON0 + th / N) / rad);
    },
    bounds: L.bounds([-MUNDO, -MUNDO], [MUNDO, MUNDO])
  };

  var CRS_ESPANA = L.extend({}, L.CRS.Earth, {
    code: 'LR:ES-LCC',
    projection: ProyeccionEspana,
    transformation: new L.Transformation(1 / (2 * MUNDO), 0.5, -1 / (2 * MUNDO), 0.5)
  });

  // — Canarias: el mismo desplazamiento que aplicó el preproceso —
  var CANARIAS = { dlat: 6.90, dlon: 4.20, bbox: [-18.6, 27.4, -13.2, 29.6] };

  function enCanarias(lng, lat) {
    return lng >= CANARIAS.bbox[0] && lng <= CANARIAS.bbox[2] &&
           lat >= CANARIAS.bbox[1] && lat <= CANARIAS.bbox[3];
  }

  /** Reubica en el recuadro las geometrías que caen en Canarias. */
  function moverCanarias(geojson) {
    function mover(c) {
      if (typeof c[0] === 'number') {
        return enCanarias(c[0], c[1]) ? [c[0] + CANARIAS.dlon, c[1] + CANARIAS.dlat] : c;
      }
      return c.map(mover);
    }
    var copia = JSON.parse(JSON.stringify(geojson));
    (copia.features || [copia]).forEach(function (f) {
      if (f.geometry && f.geometry.coordinates) f.geometry.coordinates = mover(f.geometry.coordinates);
    });
    return copia;
  }

  // =========================================================================
  // 2. Encuadres
  // =========================================================================

  var ENCUADRES = {
    espana:    { limites: [[33.9, -15.0], [44.0, 4.7]] },
    peninsula: { limites: [[35.8, -9.8],  [43.9, 3.5]] },
    canarias:  { limites: [[34.2, -14.4], [36.6, -8.8]] },   // ya desplazadas
    baleares:  { limites: [[38.5, 1.1],   [40.2, 4.4]] },
    madrid:    { limites: [[39.9, -4.6],  [41.2, -3.0]] }
  };

  // =========================================================================
  // 3. Utilidades
  // =========================================================================

  function el(etiqueta, clase, html) {
    var e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function fecha(iso, conHora) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var o = { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' };
    if (conHora !== false) { o.hour = '2-digit'; o.minute = '2-digit'; }
    return new Intl.DateTimeFormat('es-ES', o).format(d);
  }

  function numero(n) {
    return typeof n === 'number' ? new Intl.NumberFormat('es-ES').format(n) : n;
  }

  function escapar(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var ICONO = {
    mas:   '<svg viewBox="0 0 20 20"><path d="M10 4.2v11.6M4.2 10h11.6"/></svg>',
    menos: '<svg viewBox="0 0 20 20"><path d="M4.2 10h11.6"/></svg>',
    todo:  '<svg viewBox="0 0 20 20"><path d="M7.4 3.2H3.2v4.2M12.6 3.2h4.2v4.2M7.4 16.8H3.2v-4.2M12.6 16.8h4.2v-4.2"/></svg>',
    yo:    '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="2.5"/><path d="M10 2.2v2.6M10 15.2v2.6M2.2 10h2.6M15.2 10h2.6"/></svg>'
  };

  // =========================================================================
  // 4. Constructor
  // =========================================================================

  function LRMap(op) {
    var o = this.op = Object.assign({
      el: null,
      titulo: '',
      entradilla: '',
      fuente: null,                  // { texto, url }
      actualizado: null,
      nota: '',                      // metodología o advertencia, al pie
      encuadre: 'espana',
      cartografia: 'datos/base-espana.json',
      tema: 'dia',                   // 'dia' | 'noche'
      firma: 'La Razón',
      detalle: 'auto',               // 'ccaa' | 'provincias' | 'auto'
      leyenda: null,
      geolocalizacion: false,
      gestosCooperativos: true,
      deepLink: true,
      insetCanarias: true,
      tablaAccesible: true,
      alSeleccionar: null,
      estilo: null,
      punto: null,
      rotulo: null,                  // fn(f) -> texto junto al punto, o null
      etiquetaFlotante: null
    }, op || {});

    this.caja = typeof o.el === 'string' ? document.querySelector(o.el) : o.el;
    if (!this.caja) throw new Error('LRMap: no encuentro el contenedor ' + o.el);

    this.oyentes = {};
    this.filtros = {};

    this._chrome();
    this._mapa();
    this._gestos();
    if (o.deepLink) this._deepLink();
    this._embed();
    this._cargarCartografia();
  }

  // — DOM --------------------------------------------------------------------

  LRMap.prototype._chrome = function () {
    var o = this.op, c = this.caja, self = this;
    c.classList.add('lrmap');
    c.dataset.tema = o.tema;

    // cabecera sólida: no flota sobre el territorio, no muerde el norte
    var cab = el('header', 'lrmap__cabecera');
    var izq = el('div');
    if (o.titulo) izq.appendChild(el('h2', 'lrmap__titulo', escapar(o.titulo)));
    if (o.entradilla) izq.appendChild(el('p', 'lrmap__entradilla', o.entradilla));
    cab.appendChild(izq);
    this.elSello = el('div', 'lrmap__sello');
    if (o.actualizado) this.elSello.innerHTML = '<span>Datos de</span><time>' + fecha(o.actualizado) + '</time>';
    cab.appendChild(this.elSello);
    c.appendChild(cab);

    // escenario
    var esc = el('div', 'lrmap__escenario');
    this.lienzo = el('div', 'lrmap__lienzo');
    esc.appendChild(this.lienzo);

    var mandos = el('div', 'lrmap__mandos');
    function mando(icono, texto, fn) {
      var b = el('button', 'lrmap__mando', icono);
      b.type = 'button'; b.title = texto; b.setAttribute('aria-label', texto);
      b.addEventListener('click', fn);
      mandos.appendChild(b);
      return b;
    }
    mando(ICONO.mas, 'Acercar', function () { self.mapa.zoomIn(); });
    mando(ICONO.menos, 'Alejar', function () { self.mapa.zoomOut(); });
    this.btnTodo = mando(ICONO.todo, 'Ver España entera', function () { self.reencuadrar(); });
    this.btnTodo.classList.add('lrmap__mando--guardado');
    if (o.geolocalizacion && navigator.geolocation) {
      var bg = mando(ICONO.yo, 'Ir a mi zona', function () { self._geolocalizar(bg); });
    }
    esc.appendChild(mandos);

    this.panel = el('aside', 'lrmap__ficha');
    this.panel.dataset.abierta = 'no';
    this.panel.setAttribute('aria-live', 'polite');
    var x = el('button', 'lrmap__ficha-cerrar', '&#215;');
    x.type = 'button'; x.setAttribute('aria-label', 'Cerrar detalle');
    x.addEventListener('click', function () { self.cerrarFicha(); });
    this.panel.appendChild(x);
    this.panelCuerpo = el('div', 'lrmap__ficha-cuerpo');
    this.panel.appendChild(this.panelCuerpo);
    esc.appendChild(this.panel);

    this.elEstado = el('div', 'lrmap__estado'); this.elEstado.hidden = true;
    esc.appendChild(this.elEstado);
    this.elGesto = el('div', 'lrmap__gesto'); this.elGesto.setAttribute('aria-hidden', 'true');
    esc.appendChild(this.elGesto);

    c.appendChild(esc);

    // pie único: clave + fuente + firma
    var pie = el('footer', 'lrmap__pie');
    this.elLeyenda = el('div', 'lrmap__clave');
    pie.appendChild(this.elLeyenda);
    var cred = el('div', 'lrmap__creditos');
    this.elFuente = el('span', 'lrmap__fuente');
    if (o.fuente) {
      this.elFuente.innerHTML = 'Fuente: ' + (o.fuente.url
        ? '<a href="' + o.fuente.url + '" target="_blank" rel="noopener">' + escapar(o.fuente.texto) + '</a>'
        : escapar(o.fuente.texto));
    }
    cred.appendChild(this.elFuente);
    if (o.firma) cred.appendChild(el('span', 'lrmap__firma', escapar(o.firma)));
    pie.appendChild(cred);
    if (o.nota) pie.appendChild(el('p', 'lrmap__metodologia', o.nota));
    c.appendChild(pie);

    if (o.leyenda) this.setLeyenda(o.leyenda);
    if (o.tablaAccesible) { this.elTabla = el('div', 'lrmap__tabla'); c.appendChild(this.elTabla); }
  };

  // — Mapa -------------------------------------------------------------------

  LRMap.prototype._encuadre = function () {
    var e = this.op.encuadre;
    var v = typeof e === 'string' ? (ENCUADRES[e] || ENCUADRES.espana) : e;
    return L.latLngBounds(v.limites);
  };

  LRMap.prototype._mapa = function () {
    var self = this;
    var movil = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

    var mapa = this.mapa = L.map(this.lienzo, {
      crs: CRS_ESPANA,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      zoomSnap: 0,
      zoomDelta: 0.6,
      wheelPxPerZoomLevel: 160,
      scrollWheelZoom: false,
      dragging: !movil,
      tap: false,
      minZoom: 4.4,
      maxZoom: 13,
      maxBoundsViscosity: 0.85,
      fadeAnimation: false
    });

    mapa.fitBounds(this._encuadre(), { padding: [6, 6] });
    mapa.setMaxBounds(this._encuadre().pad(0.4));

    ['lrFondo', 'lrTrazos', 'lrAreas', 'lrToponimos', 'lrLineas', 'lrPuntos'].forEach(function (p, i) {
      mapa.createPane(p);
      mapa.getPane(p).style.zIndex = [200, 300, 380, 420, 460, 600][i];
    });

    // Los topónimos son un pane, no un div flotante: así Leaflet los arrastra
    // junto al mapa y quedan clavados al territorio, no a la pantalla.
    this.capaEtiquetas = mapa.getPane('lrToponimos');
    this.capaEtiquetas.classList.add('lrmap__toponimos');

    this.rFondo  = L.canvas({ pane: 'lrFondo',  padding: 0.4 });
    this.rTrazos = L.canvas({ pane: 'lrTrazos', padding: 0.4 });
    this.rAreas  = L.canvas({ pane: 'lrAreas',  padding: 0.3 });
    this.rPuntos = L.canvas({ pane: 'lrPuntos', padding: 0.3 });

    this.capaDatos = L.layerGroup().addTo(mapa);

    var refrescar = function () {
      self._pintarToponimos();
      var base = self._encuadre(), ahora = self.mapa.getBounds();
      var fuera = !base.contains(ahora) || (ahora.getNorth() - ahora.getSouth()) < (base.getNorth() - base.getSouth()) * 0.85;
      self.btnTodo.classList.toggle('lrmap__mando--guardado', !fuera);
    };
    // En el zoom el pane se escala y el texto se deformaría: lo fundimos y
    // lo recolocamos al terminar. En el arrastre no hace falta: viaja solo.
    mapa.on('zoomstart', function () { self.capaEtiquetas.dataset.zoom = 'si'; });
    mapa.on('zoomend', function () { self.capaEtiquetas.dataset.zoom = 'no'; });
    mapa.on('zoomend moveend viewreset', refrescar);
    mapa.on('click', function () { self.cerrarFicha(); });
    window.addEventListener('resize', function () { self._pintarToponimos(); });
  };

  LRMap.prototype._color = function (n) {
    return getComputedStyle(this.caja).getPropertyValue('--lr-' + n).trim();
  };

  LRMap.prototype._cargarCartografia = function () {
    var self = this;
    this.mostrarEstado('cargando', 'Dibujando el mapa…');
    fetch(this.op.cartografia)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (base) { self._pintarBase(base); self.ocultarEstado(); self.emitir('listo'); })
      .catch(function (e) {
        self.mostrarEstado('error', 'No hemos podido dibujar el mapa base.', 'Reintentar',
          function () { self._cargarCartografia(); });
        self.emitir('error', e);
      });
  };

  LRMap.prototype._pintarBase = function (base) {
    this.base = base;
    var self = this;

    function capa(datos, opciones) {
      return L.geoJSON(datos, Object.assign({ interactive: false }, opciones)).addTo(self.mapa);
    }

    // vecinos: presentes, atenuados, sin nombre
    capa(base.contexto, {
      renderer: this.rFondo, pane: 'lrFondo',
      style: { color: this._color('borde-ajeno'), weight: 0.6,
               fillColor: this._color('tierra-ajena'), fillOpacity: 1 }
    });

    capa(base.provincias, {
      renderer: this.rFondo, pane: 'lrFondo',
      style: { stroke: false, fillColor: this._color('tierra'), fillOpacity: 1 }
    });

    capa(base.lineasProv, {
      renderer: this.rTrazos, pane: 'lrTrazos',
      style: { color: this._color('linea-prov'), weight: 0.55 }
    });

    capa(base.lineasCcaa, {
      renderer: this.rTrazos, pane: 'lrTrazos',
      style: { color: this._color('linea-ccaa'), weight: 0.95 }
    });

    capa(base.nacion, {
      renderer: this.rTrazos, pane: 'lrTrazos',
      style: { color: this._color('costa'), weight: 1.05, fill: false }
    });

    // El recuadro canario se dibuja en píxeles, no en coordenadas: un marco
    // geográfico saldría girado por la convergencia de meridianos de la cónica.
    if (this.op.insetCanarias && base.meta && base.meta.recuadro) {
      var r = base.meta.recuadro;
      this.recuadro = L.latLngBounds([[r[1], r[0]], [r[3], r[2]]]);
      this.elRecuadro = el('div', 'lrmap__recuadro');
      this.capaEtiquetas.appendChild(this.elRecuadro);
    }

    this._pintarToponimos();
  };

  // — Topónimos: capa HTML propia, en español, con jerarquía por zoom --------

  LRMap.prototype._pintarToponimos = function () {
    if (!this.base) return;
    if (!this.elTextos) {
      this.elTextos = el('div', 'lrmap__rotulos');
      this.capaEtiquetas.appendChild(this.elTextos);
    }
    var z = this.mapa.getZoom(), modo = this.op.detalle;
    if (modo === 'auto') modo = z < 6.4 ? 'ccaa' : 'provincias';

    var lista;
    if (modo === 'ccaa') {
      lista = this.base.etiquetasCcaa.features.map(function (f) { return { f: f, clase: 'region' }; });
    } else {
      lista = this.base.etiquetasProv.features.map(function (f) { return { f: f, clase: 'provincia' }; });
      if (z >= 7.6) {
        lista = this.base.ciudades.features
          .filter(function (f) { return z >= 8.6 || f.properties.rango === 1; })
          .map(function (f) { return { f: f, clase: 'ciudad' }; })
          .concat(lista);
      }
    }

    // Margen generoso: durante el arrastre las etiquetas viajan con el mapa,
    // así que conviene tener ya calculadas las que van a entrar en cuadro.
    var vista = this.mapa.getBounds().pad(0.5);
    var ocupado = [], html = '';
    var self = this;

    function libre(caja) {
      for (var k = 0; k < ocupado.length; k++) {
        var q = ocupado[k];
        if (!(caja[2] < q[0] || caja[0] > q[2] || caja[3] < q[1] || caja[1] > q[3])) return false;
      }
      return true;
    }

    // 1. Los rótulos del dato van primero: mandan sobre la toponimia del fondo.
    if (this.op.rotulo && this.datos && this.datos.features) {
      this.datos.features.forEach(function (f) {
        if (!f.geometry || f.geometry.type !== 'Point') return;
        if (!self._filtra(f)) return;
        var texto = self.op.rotulo(f);
        if (!texto) return;
        var c = f.geometry.coordinates;
        var ll = L.latLng(c[1], c[0]);
        if (!vista.contains(ll)) return;
        var q = self.mapa.latLngToLayerPoint(ll);
        // el punto ocupa sitio aunque el rótulo no quepa
        ocupado.push([q.x - 10, q.y - 10, q.x + 10, q.y + 10]);
        var an = texto.length * 5.6 + 8;
        var caja = [q.x - an / 2, q.y + 8, q.x + an / 2, q.y + 23];
        if (!libre(caja)) return;
        ocupado.push(caja);
        html += '<span class="lrmap__toponimo lrmap__toponimo--dato" style="left:' +
                Math.round(q.x) + 'px;top:' + Math.round(q.y + 15) + 'px">' + escapar(texto) + '</span>';
      });
    }

    // 2. Toponimia del mapa base, en los huecos que queden.
    for (var i = 0; i < lista.length; i++) {
      var it = lista[i], co = it.f.geometry.coordinates;
      var ll = L.latLng(co[1], co[0]);
      if (!vista.contains(ll)) continue;
      var p = this.mapa.latLngToLayerPoint(ll);
      var texto = it.f.properties.nombre;
      var ancho = texto.length * (it.clase === 'ciudad' ? 5.5 : 6.1) + 10;
      var caja = [p.x - ancho / 2, p.y - 8, p.x + ancho / 2, p.y + 8];
      if (!libre(caja)) continue;
      ocupado.push(caja);
      html += '<span class="lrmap__toponimo lrmap__toponimo--' + it.clase + '" style="left:' +
              Math.round(p.x) + 'px;top:' + Math.round(p.y) + 'px">' +
              (it.clase === 'ciudad' ? '<i></i>' : '') + escapar(texto) + '</span>';
    }

    if (this.op.insetCanarias && this.recuadro && this.elRecuadro) {
      var esquinas = [
        this.recuadro.getNorthWest(), this.recuadro.getNorthEast(),
        this.recuadro.getSouthWest(), this.recuadro.getSouthEast()
      ].map(this.mapa.latLngToLayerPoint, this.mapa);
      var xs = esquinas.map(function (e) { return e.x; });
      var ys = esquinas.map(function (e) { return e.y; });
      var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
      var x1 = Math.max.apply(null, xs), y1 = Math.max.apply(null, ys);
      this.elRecuadro.style.left = Math.round(x0) + 'px';
      this.elRecuadro.style.top = Math.round(y0) + 'px';
      this.elRecuadro.style.width = Math.round(x1 - x0) + 'px';
      this.elRecuadro.style.height = Math.round(y1 - y0) + 'px';
      html += '<span class="lrmap__toponimo lrmap__toponimo--recuadro" style="left:' +
              Math.round(x0 + 9) + 'px;top:' + Math.round(y0 + 13) + 'px">Canarias</span>';
    }

    this.elTextos.innerHTML = html;
  };

  // — Interacción ------------------------------------------------------------

  LRMap.prototype._gestos = function () {
    var self = this, mapa = this.mapa, nodo = this.lienzo, t;
    if (!this.op.gestosCooperativos) { mapa.scrollWheelZoom.enable(); mapa.dragging.enable(); return; }
    var mac = /Mac|iPhone|iPad/.test(navigator.platform);

    function avisar(txt) {
      self.elGesto.textContent = txt;
      self.elGesto.dataset.visible = 'si';
      clearTimeout(t);
      t = setTimeout(function () { self.elGesto.dataset.visible = 'no'; }, 1300);
    }
    nodo.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        mapa.scrollWheelZoom.enable();
        clearTimeout(self._w);
        self._w = setTimeout(function () { mapa.scrollWheelZoom.disable(); }, 700);
      } else avisar((mac ? '⌘' : 'Ctrl') + ' + rueda para hacer zoom');
    }, { passive: false });
    nodo.addEventListener('touchstart', function (e) {
      if (e.touches.length >= 2) { mapa.dragging.enable(); self.elGesto.dataset.visible = 'no'; }
    }, { passive: true });
    nodo.addEventListener('touchmove', function (e) {
      if (e.touches.length === 1 && !mapa.dragging.enabled()) avisar('Mueve el mapa con dos dedos');
    }, { passive: true });
    nodo.addEventListener('touchend', function (e) {
      if (!e.touches.length) mapa.dragging.disable();
    }, { passive: true });
  };

  LRMap.prototype._geolocalizar = function (boton) {
    var self = this;
    boton.disabled = true;
    navigator.geolocation.getCurrentPosition(function (p) {
      boton.disabled = false;
      var lat = p.coords.latitude, lng = p.coords.longitude;
      if (self.op.insetCanarias && enCanarias(lng, lat)) { lat += CANARIAS.dlat; lng += CANARIAS.dlon; }
      self.mapa.flyTo([lat, lng], 9, { duration: 0.8 });
      self.emitir('geolocalizado', { lat: p.coords.latitude, lng: p.coords.longitude });
    }, function () {
      boton.disabled = false;
      self.mostrarEstado('aviso', 'No hemos podido situarte. Revisa los permisos de ubicación del navegador.', 'Entendido');
    }, { timeout: 8000, maximumAge: 300000 });
  };

  LRMap.prototype._deepLink = function () {
    var self = this;
    var m = /^#(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)(?:\/(.+))?$/.exec(location.hash);
    if (m) {
      this.mapa.setView([+m[2], +m[3]], +m[1]);
      this._pendiente = m[4] ? decodeURIComponent(m[4]) : null;
    }
    this._hash = function () {
      var c = self.mapa.getCenter();
      var h = '#' + self.mapa.getZoom().toFixed(1) + '/' + c.lat.toFixed(3) + '/' + c.lng.toFixed(3);
      if (self.elegido && self.elegido.properties && self.elegido.properties.id) {
        h += '/' + encodeURIComponent(self.elegido.properties.id);
      }
      history.replaceState(null, '', h);
    };
    this.mapa.on('moveend zoomend', this._hash);
  };

  LRMap.prototype._embed = function () {
    if (window.parent === window) return;
    var self = this;
    var avisar = function () {
      window.parent.postMessage({
        tipo: 'lrmap:alto',
        alto: Math.ceil(self.caja.getBoundingClientRect().height),
        id: self.op.idEmbed || null
      }, '*');
    };
    window.addEventListener('load', avisar);
    if (window.ResizeObserver) new ResizeObserver(avisar).observe(this.caja);
  };

  // =========================================================================
  // 5. API pública
  // =========================================================================

  LRMap.prototype.setDatos = function (geojson, extra) {
    var self = this, o = this.op;
    this.datosOriginales = geojson;
    if (o.insetCanarias) geojson = moverCanarias(geojson);
    this.datos = geojson;
    this.capaDatos.clearLayers();

    this.capa = L.geoJSON(geojson, Object.assign({
      filter: function (f) { return self._filtra(f); },
      style: function (f) {
        var b = { renderer: self.rAreas, pane: 'lrAreas', weight: 1, opacity: 0.95, fillOpacity: 0.6 };
        return o.estilo ? Object.assign(b, o.estilo(f)) : b;
      },
      pointToLayer: function (f, ll) {
        if (o.punto) return o.punto(f, ll);
        var p = f.properties || {};
        return L.circleMarker(ll, {
          renderer: self.rPuntos, pane: 'lrPuntos',
          radius: 4.5 + (Number(p.nivel) || 0) * 2.1,
          weight: 1.3, color: self._color('halo'), opacity: 1,
          fillColor: self.colorNivel(p.nivel), fillOpacity: 0.95
        });
      },
      onEachFeature: function (f, capa) {
        var t = o.etiquetaFlotante ? o.etiquetaFlotante(f) : (f.properties || {}).titulo;
        if (t) capa.bindTooltip(t, { direction: 'top', offset: [0, -7], sticky: true });
        capa.on('click', function (e) { L.DomEvent.stopPropagation(e); self.elegir(f, capa); });
      }
    }, extra || {})).addTo(this.capaDatos);

    var n = (geojson.features || []).length;
    if (!n) this.mostrarEstado('vacio', 'Ahora mismo no hay datos que representar.');
    else this.ocultarEstado();
    if (this.op.tablaAccesible) this._tabla(geojson);
    if (this._pendiente) { this._elegirPorId(this._pendiente); this._pendiente = null; }
    this._pintarToponimos();
    this.emitir('datos', { total: n });
    return this.capa;
  };

  LRMap.prototype.cargar = function (url, transformar) {
    var self = this;
    this.mostrarEstado('cargando', 'Cargando datos…');
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        self.setDatos(transformar ? transformar(j) : j);
        if (j.generado) self.setActualizado(j.generado);
        return j;
      })
      .catch(function (e) {
        self.mostrarEstado('error', 'No hemos podido cargar los datos.', 'Reintentar',
          function () { self.cargar(url, transformar); });
        self.emitir('error', e);
      });
  };

  LRMap.prototype.colorNivel = function (nivel) {
    var n = Math.max(1, Math.min(5, (Number(nivel) || 0) + 1));
    return this._color('n' + n) || '#c5161d';
  };

  LRMap.prototype.reencuadrar = function () {
    this.cerrarFicha();
    this.mapa.flyToBounds(this._encuadre(), { padding: [6, 6], duration: 0.6 });
  };

  LRMap.prototype.ajustarADatos = function (margen) {
    if (!this.capa) return;
    var b = this.capa.getBounds();
    if (b.isValid()) this.mapa.fitBounds(b, { padding: margen || [36, 36], maxZoom: 10 });
  };

  LRMap.prototype.elegir = function (feature, capa) {
    var p = feature.properties || {};
    var f = this.op.alSeleccionar ? this.op.alSeleccionar(feature, capa) : null;
    if (f === false) return;
    if (!f) {
      f = {
        titulo: p.titulo || 'Sin título',
        texto: p.resumen || '',
        datos: [
          p.lugar ? { etiqueta: 'Dónde', valor: escapar(p.lugar) } : null,
          p.valor != null ? { etiqueta: 'Valor', valor: numero(p.valor) + (p.unidad ? ' ' + escapar(p.unidad) : '') } : null,
          p.ts ? { etiqueta: 'Dato de', valor: fecha(p.ts) } : null
        ].filter(Boolean),
        enlace: p.url ? { texto: 'Seguir leyendo', url: p.url } : null
      };
    }
    this.abrirFicha(f);
    this.elegido = feature;
    if (this._hash) this._hash();
    this.emitir('seleccion', feature);
  };

  LRMap.prototype._elegirPorId = function (id) {
    var self = this;
    if (!this.capa) return;
    this.capa.eachLayer(function (c) {
      var p = c.feature && c.feature.properties;
      if (p && String(p.id) === String(id)) {
        self.elegir(c.feature, c);
        if (c.getLatLng) self.mapa.setView(c.getLatLng(), Math.max(self.mapa.getZoom(), 8));
      }
    });
  };

  LRMap.prototype.abrirFicha = function (f) {
    var h = '<h3>' + escapar(f.titulo) + '</h3>';
    if (f.texto) h += '<p>' + f.texto + '</p>';
    if (f.datos && f.datos.length) {
      h += '<dl class="lrmap__cifras">';
      f.datos.forEach(function (d) {
        h += '<div><dt>' + escapar(d.etiqueta) + '</dt><dd>' + d.valor + '</dd></div>';
      });
      h += '</dl>';
    }
    if (f.html) h += f.html;
    if (f.enlace) h += '<a class="lrmap__ficha-enlace" href="' + f.enlace.url + '">' + escapar(f.enlace.texto) + '</a>';
    this.panelCuerpo.innerHTML = h;
    this.panel.dataset.abierta = 'si';
    this.caja.classList.add('lrmap--ficha');
  };

  LRMap.prototype.cerrarFicha = function () {
    this.panel.dataset.abierta = 'no';
    this.caja.classList.remove('lrmap--ficha');
    this.elegido = null;
  };

  /** leyenda: { titulo, nota, items: [{ id, etiqueta, color, forma, filtrable }] } */
  LRMap.prototype.setLeyenda = function (ley) {
    var self = this;
    if (!ley || !ley.items || !ley.items.length) { this.elLeyenda.innerHTML = ''; return; }
    var h = '';
    if (ley.titulo) h += '<span class="lrmap__clave-titulo">' + escapar(ley.titulo) + '</span>';
    h += '<ul class="lrmap__clave-lista">';
    ley.items.forEach(function (it) {
      var forma = 'lrmap__signo' + (it.forma === 'linea' ? ' lrmap__signo--linea'
                : it.forma === 'area' ? ' lrmap__signo--area'
                : it.forma === 'hueco' ? ' lrmap__signo--hueco' : '');
      var signo = it.forma === 'hueco'
        ? '<span class="' + forma + '" style="border-color:' + it.color + '"></span>'
        : '<span class="' + forma + '" style="background:' + it.color + '"></span>';
      var txt = '<span>' + escapar(it.etiqueta) + '</span>';
      h += it.filtrable
        ? '<li data-id="' + escapar(it.id) + '" aria-pressed="true"><button type="button">' + signo + txt + '</button></li>'
        : '<li>' + signo + txt + '</li>';
    });
    h += '</ul>';
    if (ley.nota) h += '<span class="lrmap__clave-nota">' + escapar(ley.nota) + '</span>';
    this.elLeyenda.innerHTML = h;

    this.elLeyenda.querySelectorAll('li[data-id] button').forEach(function (b) {
      b.addEventListener('click', function () {
        var li = b.parentElement, on = li.getAttribute('aria-pressed') === 'true';
        li.setAttribute('aria-pressed', on ? 'false' : 'true');
        self.filtros[li.dataset.id] = !on;
        if (self.datosOriginales) self.setDatos(self.datosOriginales);
        self.emitir('filtro', self.filtros);
      });
    });
  };

  LRMap.prototype._filtra = function (f) {
    var p = f.properties || {};
    var clave = p.categoria != null ? p.categoria : p.nivel;
    return clave == null ? true : this.filtros[clave] !== false;
  };

  LRMap.prototype.mostrarEstado = function (tipo, mensaje, boton, fn) {
    var self = this, h = '';
    if (tipo === 'cargando') h += '<span class="lrmap__hilo" role="status" aria-label="Cargando"></span>';
    h += '<p>' + escapar(mensaje || '') + '</p>';
    if (boton) h += '<button type="button">' + escapar(boton) + '</button>';
    this.elEstado.innerHTML = h;
    this.elEstado.dataset.tipo = tipo;
    this.elEstado.hidden = false;
    var b = this.elEstado.querySelector('button');
    if (b) b.addEventListener('click', function () { self.ocultarEstado(); if (fn) fn(); });
  };

  LRMap.prototype.ocultarEstado = function () { this.elEstado.hidden = true; };

  LRMap.prototype.setActualizado = function (iso) {
    if (this.elSello) this.elSello.innerHTML = '<span>Datos de</span><time>' + fecha(iso) + '</time>';
  };

  LRMap.prototype._tabla = function (g) {
    var filas = (g.features || []).slice(0, 400).map(function (f) {
      var p = f.properties || {};
      return '<tr><td>' + escapar(p.titulo) + '</td><td>' + escapar(p.lugar) + '</td><td>' +
             escapar(p.valor) + '</td><td>' + escapar(p.ts) + '</td></tr>';
    }).join('');
    this.elTabla.innerHTML = '<table><caption>' + escapar(this.op.titulo || 'Datos del mapa') +
      '</caption><thead><tr><th>Elemento</th><th>Dónde</th><th>Valor</th><th>Fecha</th></tr></thead><tbody>' +
      filas + '</tbody></table>';
  };

  LRMap.prototype.on = function (ev, fn) {
    (this.oyentes[ev] = this.oyentes[ev] || []).push(fn); return this;
  };
  LRMap.prototype.emitir = function (ev, d) {
    (this.oyentes[ev] || []).forEach(function (fn) { fn(d); });
    this.caja.dispatchEvent(new CustomEvent('lrmap:' + ev, { detail: d, bubbles: true }));
  };

  // =========================================================================

  global.LRMap = {
    crear: function (o) { return new LRMap(o); },
    ENCUADRES: ENCUADRES,
    CRS: CRS_ESPANA,
    moverCanarias: moverCanarias,
    enCanarias: enCanarias,
    fecha: fecha,
    numero: numero
  };

})(window);

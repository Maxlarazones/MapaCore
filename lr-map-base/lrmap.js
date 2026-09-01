/* ==========================================================================
   LRMap v1 — base cartográfica reutilizable (La Razón)
   Requiere Leaflet 1.9.x cargado antes que este archivo.

   Filosofía: este módulo NO sabe nada de incendios, tráfico ni AEMET.
   Sólo sabe de: encuadre España, basemaps, chrome, estados, selección,
   deep-link y embebido. Cada proyecto le entrega GeoJSON normalizado y,
   opcionalmente, cómo pintarlo.
   ========================================================================== */

(function (global) {
  'use strict';

  // — Encuadres frecuentes. Evita que cada proyecto reinvente coordenadas —
  var ENCUADRES = {
    espana:     { centro: [40.1, -3.6],  zoom: 5.6, limites: [[35.6, -19.5], [44.2, 5.1]] },
    peninsula:  { centro: [40.2, -3.7],  zoom: 6.2, limites: [[35.8, -9.8],  [43.9, 3.5]] },
    canarias:   { centro: [28.4, -15.9], zoom: 7.6, limites: [[27.5, -18.4], [29.5, -13.3]] },
    baleares:   { centro: [39.6,  2.9],  zoom: 8.4, limites: [[38.5,  1.1],  [40.2, 4.4]] },
    madrid:     { centro: [40.42, -3.70],zoom: 10.5,limites: [[39.85, -4.6], [41.2, -3.0]] }
  };

  // — Capas base. CARTO no pide clave; IGN es la red de seguridad soberana —
  var BASEMAPS = {
    lienzo: {
      fondo: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
      etiquetas: 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png',
      subdominios: 'abcd', maxZoom: 19,
      atribucion: '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://carto.com/attributions">CARTO</a>'
    },
    lienzoNoche: {
      fondo: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      etiquetas: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
      subdominios: 'abcd', maxZoom: 19,
      atribucion: '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://carto.com/attributions">CARTO</a>'
    },
    ign: {
      fondo: 'https://www.ign.es/wmts/ign-base?layer=IGNBaseTodo&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
      etiquetas: null, subdominios: '', maxZoom: 18,
      atribucion: '<a href="https://www.ign.es">Instituto Geográfico Nacional</a>'
    },
    satelite: {
      fondo: 'https://www.ign.es/wmts/pnoa-ma?layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
      etiquetas: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
      subdominios: 'abcd', maxZoom: 19,
      atribucion: 'PNOA © <a href="https://www.ign.es">IGN</a> · etiquetas CARTO'
    }
  };

  var ICONOS = {
    mas:    '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    menos:  '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
    inicio: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
    yo:     '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    capas:  '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
    pleno:  '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'
  };

  function crearElemento(etiqueta, clase, html) {
    var el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (html != null) el.innerHTML = html;
    return el;
  }

  function esMovil() {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }

  function formatearFecha(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Madrid'
    }).format(d).replace('.', '');
  }

  // ==========================================================================
  // Constructor
  // ==========================================================================

  function LRMap(opciones) {
    var o = this.opciones = Object.assign({
      el: null,
      titulo: '',
      subtitulo: '',
      fuente: null,                 // { texto, url }
      actualizado: null,            // ISO
      encuadre: 'espana',           // clave de ENCUADRES u objeto propio
      basemap: 'lienzo',
      tema: 'auto',                 // 'dia' | 'noche' | 'auto'
      leyenda: null,                // [{ id, etiqueta, color, forma, filtrable }]
      leyendaTitulo: '',
      leyendaNota: '',
      geolocalizacion: true,
      selectorCapas: false,
      pantallaCompleta: true,
      deepLink: true,               // sincroniza vista con el hash de la URL
      gestosCooperativos: true,     // no secuestrar el scroll del artículo
      tablaAccesible: true,
      alSeleccionar: null,          // fn(feature, capa) -> {titulo, texto, datos, enlace} | false
      estilo: null,                 // fn(feature) -> opciones de path Leaflet
      punto: null,                  // fn(feature, latlng) -> capa Leaflet
      etiquetaFlotante: null        // fn(feature) -> string para tooltip
    }, opciones || {});

    this.contenedor = typeof o.el === 'string' ? document.querySelector(o.el) : o.el;
    if (!this.contenedor) throw new Error('LRMap: contenedor no encontrado');

    this.escuchas = {};
    this.filtros = {};
    this.datos = null;

    this._montarChrome();
    this._crearMapa();
    this._montarControles();
    this._montarGestos();
    if (o.deepLink) this._montarDeepLink();
    this._montarEmbed();
    this._aplicarTema();
  }

  LRMap.prototype._encuadre = function () {
    var e = this.opciones.encuadre;
    return typeof e === 'string' ? (ENCUADRES[e] || ENCUADRES.espana) : e;
  };

  // — Estructura DOM ---------------------------------------------------------

  LRMap.prototype._montarChrome = function () {
    var o = this.opciones;
    var c = this.contenedor;
    c.classList.add('lrmap');

    this.lienzo = crearElemento('div', 'lrmap__canvas');
    c.appendChild(this.lienzo);

    // cabecera
    if (o.titulo || o.actualizado) {
      var cab = crearElemento('div', 'lrmap__cabecera');
      var bloque = crearElemento('div');
      if (o.titulo) bloque.appendChild(crearElemento('h2', 'lrmap__titulo', o.titulo));
      if (o.subtitulo) bloque.appendChild(crearElemento('p', 'lrmap__pie-titulo', o.subtitulo));
      cab.appendChild(bloque);
      if (o.actualizado) {
        this.elActualizado = crearElemento('div', 'lrmap__actualizado',
          'Actualizado<b>' + formatearFecha(o.actualizado) + '</b>');
        cab.appendChild(this.elActualizado);
      }
      c.appendChild(cab);
    }

    // leyenda
    this.elLeyenda = crearElemento('div', 'lrmap__leyenda');
    this.elLeyenda.hidden = true;
    c.appendChild(this.elLeyenda);
    if (o.leyenda) this.setLeyenda(o.leyenda, o.leyendaTitulo, o.leyendaNota);

    // panel de detalle
    this.elPanel = crearElemento('aside', 'lrmap__panel');
    this.elPanel.setAttribute('aria-live', 'polite');
    this.elPanel.dataset.abierto = 'no';
    var cerrar = crearElemento('button', 'lrmap__panel-cerrar', '&times;');
    cerrar.setAttribute('aria-label', 'Cerrar detalle');
    cerrar.addEventListener('click', this.cerrarPanel.bind(this));
    this.elPanel.appendChild(cerrar);
    this.elPanelCuerpo = crearElemento('div');
    this.elPanel.appendChild(this.elPanelCuerpo);
    c.appendChild(this.elPanel);

    // pie
    var pie = crearElemento('div', 'lrmap__pie');
    this.elFuente = crearElemento('span', 'lrmap__fuente');
    if (o.fuente) {
      this.elFuente.innerHTML = 'Fuente: ' + (o.fuente.url
        ? '<a href="' + o.fuente.url + '" target="_blank" rel="noopener">' + o.fuente.texto + '</a>'
        : o.fuente.texto);
    }
    pie.appendChild(this.elFuente);
    this.elAtribucion = crearElemento('span', 'lrmap__atribucion');
    pie.appendChild(this.elAtribucion);
    c.appendChild(pie);

    // estado
    this.elEstado = crearElemento('div', 'lrmap__estado');
    this.elEstado.hidden = true;
    c.appendChild(this.elEstado);

    // aviso de gestos
    this.elGesto = crearElemento('div', 'lrmap__gesto');
    this.elGesto.setAttribute('aria-hidden', 'true');
    c.appendChild(this.elGesto);

    // tabla accesible
    if (o.tablaAccesible) {
      this.elTabla = crearElemento('div', 'lrmap__tabla');
      c.appendChild(this.elTabla);
    }
  };

  // — Mapa Leaflet -----------------------------------------------------------

  LRMap.prototype._crearMapa = function () {
    var enc = this._encuadre();
    var movil = esMovil();

    var mapa = this.mapa = L.map(this.lienzo, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      zoomSnap: 0.25,
      wheelPxPerZoomLevel: 140,
      scrollWheelZoom: false,
      dragging: !movil,
      tap: false,
      minZoom: 3,
      maxBounds: enc.limites ? L.latLngBounds(enc.limites).pad(0.55) : null,
      maxBoundsViscosity: 0.7
    }).setView(enc.centro, enc.zoom);

    // Panes: etiquetas del basemap por encima de polígonos, por debajo de puntos.
    mapa.createPane('lrAreas');       mapa.getPane('lrAreas').style.zIndex = 380;
    mapa.createPane('lrEtiquetas');   mapa.getPane('lrEtiquetas').style.zIndex = 430;
    mapa.getPane('lrEtiquetas').classList.add('leaflet-pane--etiquetas');
    mapa.createPane('lrLineas');      mapa.getPane('lrLineas').style.zIndex = 460;
    mapa.createPane('lrPuntos');      mapa.getPane('lrPuntos').style.zIndex = 600;

    this.lienzoAreas = L.canvas({ pane: 'lrAreas', padding: 0.3 });
    this.lienzoPuntos = L.canvas({ pane: 'lrPuntos', padding: 0.3 });

    this._pintarBasemap(this.opciones.basemap);

    this.capaDatos = L.layerGroup().addTo(mapa);
  };

  LRMap.prototype._pintarBasemap = function (clave) {
    var cfg = BASEMAPS[clave] || BASEMAPS.lienzo;
    if (this._tFondo) this.mapa.removeLayer(this._tFondo);
    if (this._tEtiquetas) this.mapa.removeLayer(this._tEtiquetas);

    this._tFondo = L.tileLayer(cfg.fondo, {
      subdomains: cfg.subdominios, maxZoom: cfg.maxZoom, detectRetina: true, crossOrigin: true
    }).addTo(this.mapa);

    if (cfg.etiquetas) {
      this._tEtiquetas = L.tileLayer(cfg.etiquetas, {
        subdomains: cfg.subdominios, maxZoom: cfg.maxZoom, detectRetina: true,
        pane: 'lrEtiquetas', crossOrigin: true
      }).addTo(this.mapa);
    }
    this.elAtribucion.innerHTML = cfg.atribucion;
    this.basemapActual = clave;
  };

  // — Controles --------------------------------------------------------------

  LRMap.prototype._montarControles = function () {
    var self = this, o = this.opciones;
    var caja = crearElemento('div', 'lrmap__controles');

    function boton(icono, etiqueta, alPulsar) {
      var b = crearElemento('button', 'lrmap__btn', icono);
      b.type = 'button';
      b.setAttribute('aria-label', etiqueta);
      b.title = etiqueta;
      b.addEventListener('click', alPulsar);
      caja.appendChild(b);
      return b;
    }

    boton(ICONOS.mas, 'Acercar', function () { self.mapa.zoomIn(); });
    boton(ICONOS.menos, 'Alejar', function () { self.mapa.zoomOut(); });
    boton(ICONOS.inicio, 'Ver todo el mapa', function () { self.reencuadrar(); });

    if (o.geolocalizacion && navigator.geolocation) {
      var bGeo = boton(ICONOS.yo, 'Centrar en mi ubicación', function () {
        bGeo.disabled = true;
        navigator.geolocation.getCurrentPosition(function (p) {
          bGeo.disabled = false;
          self.mapa.flyTo([p.coords.latitude, p.coords.longitude], 11, { duration: 0.9 });
          self.emitir('geolocalizado', { lat: p.coords.latitude, lng: p.coords.longitude });
        }, function () {
          bGeo.disabled = false;
          self.mostrarEstado('aviso', 'No hemos podido obtener tu ubicación. Revisa los permisos del navegador.', 'Entendido');
        }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
      });
    }

    if (o.selectorCapas) {
      var orden = ['lienzo', 'ign', 'satelite'];
      boton(ICONOS.capas, 'Cambiar capa base', function () {
        var i = orden.indexOf(self.basemapActual);
        self._pintarBasemap(orden[(i + 1) % orden.length]);
        self.emitir('basemap', self.basemapActual);
      });
    }

    if (o.pantallaCompleta && document.fullscreenEnabled) {
      var bFull = boton(ICONOS.pleno, 'Pantalla completa', function () {
        if (document.fullscreenElement) document.exitFullscreen();
        else self.contenedor.requestFullscreen().catch(function () {});
      });
      document.addEventListener('fullscreenchange', function () {
        bFull.classList.toggle('lrmap__btn--activo', document.fullscreenElement === self.contenedor);
        setTimeout(function () { self.mapa.invalidateSize(); }, 60);
      });
    }

    this.contenedor.appendChild(caja);
  };

  // — Gestos: el mapa nunca debe robar el scroll del artículo ----------------

  LRMap.prototype._montarGestos = function () {
    if (!this.opciones.gestosCooperativos) {
      this.mapa.scrollWheelZoom.enable();
      this.mapa.dragging.enable();
      return;
    }
    var self = this, mapa = this.mapa, el = this.lienzo, temporizador;
    var teclaMac = /Mac|iPhone|iPad/.test(navigator.platform);

    function avisar(texto) {
      self.elGesto.textContent = texto;
      self.elGesto.dataset.visible = 'si';
      clearTimeout(temporizador);
      temporizador = setTimeout(function () { self.elGesto.dataset.visible = 'no'; }, 1400);
    }

    el.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        mapa.scrollWheelZoom.enable();
        clearTimeout(self._wheelOff);
        self._wheelOff = setTimeout(function () { mapa.scrollWheelZoom.disable(); }, 600);
      } else {
        avisar('Usa ' + (teclaMac ? '⌘' : 'Ctrl') + ' + rueda para hacer zoom');
      }
    }, { passive: false });

    el.addEventListener('touchstart', function (e) {
      if (e.touches.length >= 2) { mapa.dragging.enable(); self.elGesto.dataset.visible = 'no'; }
    }, { passive: true });

    el.addEventListener('touchmove', function (e) {
      if (e.touches.length === 1 && !mapa.dragging.enabled()) avisar('Mueve el mapa con dos dedos');
    }, { passive: true });

    el.addEventListener('touchend', function (e) {
      if (!e.touches.length) mapa.dragging.disable();
    }, { passive: true });
  };

  // — Deep link: #6.2/40.12/-3.70 (+ /id opcional) ---------------------------

  LRMap.prototype._montarDeepLink = function () {
    var self = this;
    var m = /^#(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)(?:\/(.+))?$/.exec(location.hash);
    if (m) {
      this.mapa.setView([parseFloat(m[2]), parseFloat(m[3])], parseFloat(m[1]));
      this._idPendiente = m[4] ? decodeURIComponent(m[4]) : null;
    }
    var escribir = function () {
      var c = self.mapa.getCenter();
      var h = '#' + self.mapa.getZoom().toFixed(2) + '/' + c.lat.toFixed(4) + '/' + c.lng.toFixed(4);
      if (self.seleccionado && self.seleccionado.properties && self.seleccionado.properties.id) {
        h += '/' + encodeURIComponent(self.seleccionado.properties.id);
      }
      history.replaceState(null, '', h);
    };
    this.mapa.on('moveend zoomend', escribir);
    this._escribirHash = escribir;
  };

  // — Embebido en iframe: avisa de su altura al contenedor -------------------

  LRMap.prototype._montarEmbed = function () {
    if (window.parent === window) return;
    var self = this;
    var enviar = function () {
      var alto = Math.ceil(self.contenedor.getBoundingClientRect().height);
      window.parent.postMessage({ tipo: 'lrmap:alto', alto: alto, id: self.opciones.idEmbed || null }, '*');
    };
    window.addEventListener('load', enviar);
    if (window.ResizeObserver) new ResizeObserver(enviar).observe(this.contenedor);
    this.mapa.on('click', function () {
      window.parent.postMessage({ tipo: 'lrmap:interaccion' }, '*');
    });
  };

  LRMap.prototype._aplicarTema = function () {
    var t = this.opciones.tema;
    if (t === 'auto') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'noche' : 'dia';
    }
    this.contenedor.dataset.theme = t;
    if (t === 'noche' && this.basemapActual === 'lienzo') this._pintarBasemap('lienzoNoche');
  };

  // ==========================================================================
  // API pública
  // ==========================================================================

  /**
   * Carga datos. Acepta GeoJSON con propiedades canónicas:
   *   id, titulo, resumen, ts, nivel (0-4), categoria, valor, unidad, lugar, url
   */
  LRMap.prototype.setDatos = function (geojson, opcionesCapa) {
    var self = this, o = this.opciones;
    this.datos = geojson;
    this.capaDatos.clearLayers();

    var capa = L.geoJSON(geojson, Object.assign({
      renderer: this.lienzoPuntos,
      pane: 'lrPuntos',
      filter: function (f) { return self._pasaFiltro(f); },
      style: function (f) {
        var base = { renderer: self.lienzoAreas, pane: 'lrAreas', weight: 1, opacity: .9, fillOpacity: .55 };
        return o.estilo ? Object.assign(base, o.estilo(f)) : base;
      },
      pointToLayer: function (f, ll) {
        if (o.punto) return o.punto(f, ll);
        var p = f.properties || {};
        var r = 5 + (Number(p.nivel) || 0) * 2.2;
        return L.circleMarker(ll, {
          renderer: self.lienzoPuntos, pane: 'lrPuntos',
          radius: r, weight: 1.4, color: '#fff', opacity: .95,
          fillColor: self.colorNivel(p.nivel), fillOpacity: .92
        });
      },
      onEachFeature: function (f, l) {
        if (o.etiquetaFlotante) {
          var t = o.etiquetaFlotante(f);
          if (t) l.bindTooltip(t, { direction: 'top', offset: [0, -6], sticky: true });
        } else if (f.properties && f.properties.titulo) {
          l.bindTooltip(f.properties.titulo, { direction: 'top', offset: [0, -6], sticky: true });
        }
        l.on('click', function () { self.seleccionar(f, l); });
        l.on('keypress', function (e) { if (e.originalEvent.key === 'Enter') self.seleccionar(f, l); });
      }
    }, opcionesCapa || {}));

    capa.addTo(this.capaDatos);
    this.capa = capa;

    this.ocultarEstado();
    var n = (geojson.features || []).length;
    if (!n) this.mostrarEstado('vacio', 'No hay datos que mostrar en este momento.');
    if (this.opciones.tablaAccesible) this._pintarTabla(geojson);
    if (this._idPendiente) {
      this._seleccionarPorId(this._idPendiente);
      this._idPendiente = null;
    }
    this.emitir('datos', { total: n });
    return capa;
  };

  LRMap.prototype.colorNivel = function (nivel) {
    var estilos = getComputedStyle(this.contenedor);
    var n = Math.max(1, Math.min(5, (Number(nivel) || 0) + 1));
    return estilos.getPropertyValue('--lr-n' + n).trim() || '#c5161d';
  };

  LRMap.prototype.reencuadrar = function () {
    var enc = this._encuadre();
    this.cerrarPanel();
    this.mapa.flyTo(enc.centro, enc.zoom, { duration: 0.7 });
  };

  LRMap.prototype.ajustarADatos = function (margen) {
    if (!this.capa) return;
    var b = this.capa.getBounds();
    if (b.isValid()) this.mapa.fitBounds(b, { padding: margen || [40, 40], maxZoom: 11 });
  };

  LRMap.prototype.seleccionar = function (feature, capa) {
    var o = this.opciones;
    var p = feature.properties || {};
    var contenido = o.alSeleccionar ? o.alSeleccionar(feature, capa) : null;
    if (contenido === false) return;
    if (!contenido) {
      contenido = {
        titulo: p.titulo || 'Sin título',
        texto: p.resumen || '',
        datos: [
          p.lugar ? { etiqueta: 'Lugar', valor: p.lugar } : null,
          p.valor != null ? { etiqueta: 'Valor', valor: p.valor + (p.unidad ? ' ' + p.unidad : '') } : null,
          p.ts ? { etiqueta: 'Actualizado', valor: formatearFecha(p.ts) } : null
        ].filter(Boolean),
        enlace: p.url ? { texto: 'Leer la información', url: p.url } : null
      };
    }
    this.abrirPanel(contenido);
    this.seleccionado = feature;
    if (this._escribirHash) this._escribirHash();
    this.emitir('seleccion', feature);
  };

  LRMap.prototype._seleccionarPorId = function (id) {
    var self = this;
    if (!this.capa) return;
    this.capa.eachLayer(function (l) {
      if (l.feature && l.feature.properties && String(l.feature.properties.id) === String(id)) {
        self.seleccionar(l.feature, l);
        if (l.getLatLng) self.mapa.setView(l.getLatLng(), Math.max(self.mapa.getZoom(), 9));
      }
    });
  };

  LRMap.prototype.abrirPanel = function (c) {
    var html = '<h3>' + c.titulo + '</h3>';
    if (c.texto) html += '<p>' + c.texto + '</p>';
    if (c.datos && c.datos.length) {
      html += '<dl class="lrmap__datos">';
      c.datos.forEach(function (d) {
        html += '<div class="lrmap__dato"><dt>' + d.etiqueta + '</dt><dd>' + d.valor + '</dd></div>';
      });
      html += '</dl>';
    }
    if (c.html) html += c.html;
    if (c.enlace) {
      html += '<a class="lrmap__panel-enlace" href="' + c.enlace.url + '">' + c.enlace.texto + '</a>';
    }
    this.elPanelCuerpo.innerHTML = html;
    this.elPanel.dataset.abierto = 'si';
    this.contenedor.classList.add('lrmap--panel-abierto');
  };

  LRMap.prototype.cerrarPanel = function () {
    this.elPanel.dataset.abierto = 'no';
    this.contenedor.classList.remove('lrmap--panel-abierto');
    this.seleccionado = null;
  };

  /** leyenda: [{ id, etiqueta, color, forma: 'punto'|'linea'|'area', filtrable }] */
  LRMap.prototype.setLeyenda = function (items, titulo, nota) {
    var self = this;
    if (!items || !items.length) { this.elLeyenda.hidden = true; return; }
    var html = '';
    if (titulo) html += '<p class="lrmap__leyenda-titulo">' + titulo + '</p>';
    html += '<ul class="lrmap__leyenda-lista">';
    items.forEach(function (it) {
      var forma = 'lrmap__muestra' + (it.forma === 'linea' ? ' lrmap__muestra--linea'
                 : it.forma === 'area' ? ' lrmap__muestra--area' : '');
      var muestra = '<span class="' + forma + '" style="background:' + it.color + '"></span>';
      if (it.filtrable) {
        html += '<li class="lrmap__leyenda-item" aria-pressed="true" data-id="' + it.id + '">' +
                '<button type="button">' + muestra + '<span>' + it.etiqueta + '</span></button></li>';
      } else {
        html += '<li class="lrmap__leyenda-item">' + muestra + '<span>' + it.etiqueta + '</span></li>';
      }
    });
    html += '</ul>';
    if (nota) html += '<p class="lrmap__leyenda-nota">' + nota + '</p>';
    this.elLeyenda.innerHTML = html;
    this.elLeyenda.hidden = false;

    this.elLeyenda.querySelectorAll('.lrmap__leyenda-item[data-id] button').forEach(function (b) {
      b.addEventListener('click', function () {
        var li = b.parentElement, id = li.dataset.id;
        var activo = li.getAttribute('aria-pressed') === 'true';
        li.setAttribute('aria-pressed', activo ? 'false' : 'true');
        self.filtros[id] = activo ? false : true;
        if (self.datos) self.setDatos(self.datos);
        self.emitir('filtro', self.filtros);
      });
    });
  };

  LRMap.prototype._pasaFiltro = function (f) {
    var cat = f.properties && (f.properties.categoria || f.properties.nivel);
    if (cat == null) return true;
    return this.filtros[cat] !== false;
  };

  /** tipo: 'cargando' | 'error' | 'vacio' | 'aviso' */
  LRMap.prototype.mostrarEstado = function (tipo, mensaje, textoBoton, alPulsar) {
    var self = this;
    var html = '';
    if (tipo === 'cargando') html += '<div class="lrmap__hilo" role="status" aria-label="Cargando datos"></div>';
    html += '<p>' + (mensaje || '') + '</p>';
    if (textoBoton) html += '<button type="button" class="lrmap__btn">' + textoBoton + '</button>';
    this.elEstado.innerHTML = html;
    this.elEstado.hidden = false;
    var b = this.elEstado.querySelector('button');
    if (b) b.addEventListener('click', function () {
      self.ocultarEstado();
      if (alPulsar) alPulsar();
    });
  };

  LRMap.prototype.ocultarEstado = function () { this.elEstado.hidden = true; };

  LRMap.prototype.setActualizado = function (iso) {
    if (this.elActualizado) this.elActualizado.innerHTML = 'Actualizado<b>' + formatearFecha(iso) + '</b>';
  };

  LRMap.prototype._pintarTabla = function (geojson) {
    var filas = (geojson.features || []).slice(0, 300).map(function (f) {
      var p = f.properties || {};
      return '<tr><td>' + (p.titulo || '') + '</td><td>' + (p.lugar || '') + '</td><td>' +
             (p.valor != null ? p.valor : '') + '</td><td>' + (p.ts || '') + '</td></tr>';
    }).join('');
    this.elTabla.innerHTML =
      '<table><caption>' + (this.opciones.titulo || 'Datos del mapa') + '</caption>' +
      '<thead><tr><th>Elemento</th><th>Lugar</th><th>Valor</th><th>Fecha</th></tr></thead>' +
      '<tbody>' + filas + '</tbody></table>';
  };

  // — eventos ----------------------------------------------------------------

  LRMap.prototype.on = function (evento, fn) {
    (this.escuchas[evento] = this.escuchas[evento] || []).push(fn);
    return this;
  };
  LRMap.prototype.emitir = function (evento, datos) {
    (this.escuchas[evento] || []).forEach(function (fn) { fn(datos); });
    this.contenedor.dispatchEvent(new CustomEvent('lrmap:' + evento, { detail: datos, bubbles: true }));
  };

  /** Utilidad: carga un GeoJSON con estados y reintento incluidos. */
  LRMap.prototype.cargar = function (url, transformar) {
    var self = this;
    this.mostrarEstado('cargando', 'Cargando datos…');
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { self.setDatos(transformar ? transformar(j) : j); return j; })
      .catch(function (e) {
        self.mostrarEstado('error', 'No hemos podido cargar los datos.', 'Reintentar',
          function () { self.cargar(url, transformar); });
        self.emitir('error', e);
      });
  };

  // ==========================================================================

  global.LRMap = {
    crear: function (o) { return new LRMap(o); },
    ENCUADRES: ENCUADRES,
    BASEMAPS: BASEMAPS,
    formatearFecha: formatearFecha
  };

})(window);

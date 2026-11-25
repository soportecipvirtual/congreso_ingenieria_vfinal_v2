/* ==========================================================================
   PLANO DE EXHIBICIÓN — dibujo e interacción
   --------------------------------------------------------------------------
   Lee js/plano-data.js (planta) y data/modulos.json (estado de cada
   módulo) y dibuja el plano de exhibicion.html:

     · traza el contorno del recinto y el pórtico de ingreso,
     · ubica cada módulo y cada servicio a escala, en metros,
     · pinta cada módulo según su estado (disponible / reservado / ocupado),
     · cuenta cuántos hay de cada estado para la leyenda,
     · filtra por estado y por tipo,
     · al pulsar un módulo muestra su ficha al costado.

   Las posiciones van en porcentaje del recinto: el plano se estira con el
   ancho disponible sin deformarse, porque el recinto guarda su proporción.
   ========================================================================== */

(function () {
  "use strict";

  var PLANO = window.PLANO;
  if (!PLANO) return;

  var R = PLANO.recinto;

  var ESTADOS = {
    disponible: "Disponible",
    reservado: "Reservado",
    ocupado: "Ocupado"
  };

  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* Los módulos 01 a 04 no llevan letra en el plano: son del tipo M */
  function letraDe(codigo) {
    var l = codigo.charAt(0);
    return PLANO.tipos[l] ? l : "M";
  }

  /* [x, y, ancho, alto] en metros → posición en % del recinto. El hueco
     se suma a cada lado: positivo separa, negativo hace que los bordes de
     dos módulos vecinos se monten y queden pegados en una sola línea. */
  function posicion(sitio, hueco) {
    var h = hueco || 0;
    return "left:calc(" + (sitio[0] / R.ancho * 100) + "% + " + h + "px);" +
      "top:calc(" + (sitio[1] / R.alto * 100) + "% + " + h + "px);" +
      "width:calc(" + (sitio[2] / R.ancho * 100) + "% - " + 2 * h + "px);" +
      "height:calc(" + (sitio[3] / R.alto * 100) + "% - " + 2 * h + "px);";
  }

  /* Archivo con el estado de cada módulo. Se pide sin caché para que un
     cambio en el JSON se vea apenas se recarga la página. */
  var URL_MODULOS = "data/modulos.json";

  /* Hoja de Google Sheets publicada como CSV (Archivo > Compartir >
     Publicar en la web > pestaña «stands» > .csv). Si tiene una URL, los
     estados se leen de la hoja; si está vacía, o la hoja no responde en
     5 segundos, se usa data/modulos.json como respaldo.
     Columnas de la hoja, con encabezado: codigo | estado | empresa | rubro */
  var URL_HOJA = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTwC3bfZF8pWRKd3Ey1hxC64J30bnXrmTFZ_G_gGres-B9jCpgK6Y2_ybhnWT2NEbb5OEJ3huFTLg1y/pub?gid=477041777&single=true&output=csv";
  var ESPERA_HOJA_MS = 5000;

  function avisar(texto) {
    if (window.console) console.warn("plano: " + texto);
  }

  /* Arma la lista de módulos: la planta (PLANO.ubicaciones) dice qué
     módulos existen y dónde van; el JSON dice su estado, empresa y rubro.
     Un módulo de la planta que no esté en el JSON se da por disponible. */
  var TODOS = [];

  function construir(filas) {
    var datos = {};
    (filas || []).forEach(function (f) {
      if (!f || !f.codigo) return;
      var codigo = String(f.codigo).trim();
      if (!PLANO.ubicaciones[codigo]) {
        avisar("el módulo " + codigo + " del JSON no existe en la planta");
        return;
      }
      datos[codigo] = f;
    });

    TODOS = Object.keys(PLANO.ubicaciones).map(function (codigo) {
      var f = datos[codigo] || {};
      var estado = String(f.estado || "disponible").trim().toLowerCase();
      if (!ESTADOS[estado]) {
        avisar("estado desconocido \"" + f.estado + "\" en " + codigo + "; se toma como disponible");
        estado = "disponible";
      }
      var letra = letraDe(codigo);
      var tipo = PLANO.tipos[letra] || {};
      return {
        codigo: codigo,
        letra: letra,
        sitio: PLANO.ubicaciones[codigo],
        estado: estado,
        empresa: estado === "disponible" ? "" : String(f.empresa || "").trim(),
        rubro: estado === "disponible" ? "" : String(f.rubro || "").trim(),
        tipo: tipo.nombre || "",
        medida: tipo.medida || "",
        zona: tipo.zona || ""
      };
    });
  }

  function cargarJSON() {
    if (!window.fetch) return Promise.resolve([]);
    return fetch(URL_MODULOS, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (json) {
        return Array.isArray(json) ? json : (json && json.modulos) || [];
      })
      .catch(function (e) {
        avisar("no se pudo leer " + URL_MODULOS + " (" + e.message + "); todos los módulos se muestran disponibles");
        return [];
      });
  }

  /* Lector de CSV: respeta comillas, comas dentro de comillas y saltos
     de línea de Windows. Devuelve una lista de filas (listas de celdas). */
  function leerCSV(texto) {
    var filas = [], fila = [], campo = "", comillas = false;
    for (var i = 0; i < texto.length; i++) {
      var c = texto.charAt(i);
      if (comillas) {
        if (c === '"' && texto.charAt(i + 1) === '"') { campo += '"'; i++; }
        else if (c === '"') comillas = false;
        else campo += c;
      } else if (c === '"' && campo === "") comillas = true;
      else if (c === ",") { fila.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && texto.charAt(i + 1) === "\n") i++;
        fila.push(campo); filas.push(fila); fila = []; campo = "";
      } else campo += c;
    }
    if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }

  /* Convierte el CSV de la hoja en la misma forma que el JSON:
     [{ codigo, estado, empresa, rubro }, ...] */
  function filasDeHoja(texto) {
    var filas = leerCSV(texto.replace(/^\uFEFF/, ""));
    if (filas.length < 2) throw new Error("la hoja está vacía");
    var cab = filas[0].map(function (t) { return t.trim().toLowerCase(); });
    var iCod = cab.indexOf("codigo"), iEst = cab.indexOf("estado"),
        iEmp = cab.indexOf("empresa"), iRub = cab.indexOf("rubro");
    if (iCod < 0 || iEst < 0) throw new Error("faltan las columnas codigo y estado");

    var salida = [];
    filas.slice(1).forEach(function (f) {
      var codigo = (f[iCod] || "").trim().toUpperCase();
      if (!codigo) return;
      if (/^\d$/.test(codigo)) codigo = "0" + codigo; /* Sheets convierte "01" en 1 */
      salida.push({
        codigo: codigo,
        estado: (f[iEst] || "").trim(),
        empresa: iEmp >= 0 ? (f[iEmp] || "") : "",
        rubro: iRub >= 0 ? (f[iRub] || "") : ""
      });
    });
    return salida;
  }

  function cargarHoja() {
    return new Promise(function (resolver, rechazar) {
      var reloj = setTimeout(function () {
        rechazar(new Error("la hoja no respondió en " + ESPERA_HOJA_MS / 1000 + " s"));
      }, ESPERA_HOJA_MS);
      var url = URL_HOJA + (URL_HOJA.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now();
      fetch(url, { cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        })
        .then(function (texto) { clearTimeout(reloj); resolver(filasDeHoja(texto)); })
        .catch(function (e) { clearTimeout(reloj); rechazar(e); });
    });
  }

  /* Primero la hoja de Google; si falla o no hay URL, el JSON */
  function cargarModulos() {
    if (!URL_HOJA || !window.fetch || !window.Promise) return cargarJSON();
    return cargarHoja()
      .then(function (filas) {
        if (window.console) console.info("plano: " + filas.length + " módulos leídos de la hoja de Google");
        return filas;
      })
      .catch(function (e) {
        avisar("no se pudo leer la hoja de Google (" + e.message + "); se usa " + URL_MODULOS);
        return cargarJSON();
      });
  }

  /* ------------------------------------------------------------- Dibujo -- */

  function etiquetaAria(m) {
    var partes = [m.tipo + " " + m.codigo, ESTADOS[m.estado] || m.estado];
    if (m.empresa) partes.push(m.empresa);
    return partes.join(", ") + ".";
  }

  function celda(m) {
    /* En los módulos chicos solo cabe el código; el nombre de quien lo
       ocupa sale al pasar el cursor y en la ficha del costado. */
    var chica = m.sitio[2] * m.sitio[3] < 12;
    var etiqueta = m.empresa && !chica
      ? '<span class="plano-celda-emp">' + esc(m.empresa) + "</span>"
      : "";

    return '<button type="button" class="plano-celda es-' + m.estado + '"' +
      ' style="' + posicion(m.sitio, -0.5) + '"' +
      ' data-codigo="' + esc(m.codigo) + '"' +
      ' title="' + esc(etiquetaAria(m)) + '"' +
      ' aria-label="' + esc(etiquetaAria(m)) + '">' +
      '<span class="plano-celda-cod">' + esc(m.codigo) + "</span>" +
      etiqueta +
      "</button>";
  }

  function servicio(s) {
    return '<div class="plano-servicio ' + esc(s.clase) +
      (s.forma === "vertical" ? " es-vertical" : "") + '"' +
      ' style="' + posicion(s.sitio, 2) + '">' + esc(s.nombre) + "</div>";
  }

  /* Contorno y pórtico van en un SVG con las mismas medidas del recinto */
  function trazado() {
    var c = R.contorno;
    var puntos = c.map(function (p) { return p.join(","); }).join(" ");

    /* El pórtico es el lado diagonal: del 3er al 4to vértice */
    var a = c[2], b = c[3];
    var angulo = Math.atan2(a[1] - b[1], a[0] - b[0]) * 180 / Math.PI;
    var mx = (a[0] + b[0]) / 2 - 0.9;
    var my = (a[1] + b[1]) / 2 - 0.8;

    return '<svg class="plano-trazado" viewBox="0 0 ' + R.ancho + " " + R.alto + '"' +
      ' preserveAspectRatio="none" aria-hidden="true">' +
      '<polygon class="plano-piso" points="' + puntos + '"/>' +
      '<line class="plano-portico" x1="' + a[0] + '" y1="' + a[1] +
        '" x2="' + b[0] + '" y2="' + b[1] + '"/>' +
      '<text class="plano-portico-rotulo" x="' + mx + '" y="' + my + '"' +
        ' transform="rotate(' + angulo + " " + mx + " " + my + ')">Pórtico · Ingreso</text>' +
      "</svg>";
  }

  function dibujar() {
    var recinto = document.getElementById("plano-recinto");
    if (!recinto) return;
    recinto.style.aspectRatio = R.ancho + " / " + R.alto;
    recinto.innerHTML = trazado() +
      PLANO.servicios.map(servicio).join("") +
      TODOS.map(celda).join("");
  }

  /* ------------------------------------------------------------ Leyenda -- */

  function contar(estado) {
    return TODOS.filter(function (m) { return m.estado === estado; }).length;
  }

  function pintarConteos() {
    Object.keys(ESTADOS).forEach(function (e) {
      var caja = document.querySelector('[data-conteo="' + e + '"]');
      if (caja) caja.textContent = contar(e);
    });
    var total = document.querySelector("[data-conteo-total]");
    if (total) total.textContent = TODOS.length;
  }

  /* ------------------------------------------------------------- Ficha --- */

  var fichaCaja = document.getElementById("plano-ficha");
  var seleccionado = null;

  function fichaVacia() {
    return '<p class="plano-ficha-vacia">Seleccione un módulo del plano para ver su ' +
      "situación, medidas y ubicación.</p>";
  }

  function fila(rotulo, valor) {
    return "<dt>" + esc(rotulo) + "</dt><dd>" + esc(valor) + "</dd>";
  }

  function pintarFicha(m) {
    if (!fichaCaja) return;

    if (!m) {
      fichaCaja.innerHTML = fichaVacia();
      return;
    }

    var datos = fila("Tipo", m.tipo) + fila("Medida", m.medida) + fila("Zona", m.zona);
    if (m.empresa) datos += fila("Asignado a", m.empresa);
    if (m.rubro) datos += fila("Rubro", m.rubro);

    /* Con número de WhatsApp configurado (js/main.js) la reserva va por
       ahí; si no, al formulario de contacto. */
    var whatsapp = window.enlaceWhatsApp && window.enlaceWhatsApp(
      "Hola, quisiera información para participar como exhibidor en el I Congreso Nacional de Ingeniería.");

    var pie = m.estado === "disponible"
      ? '<a class="btn btn-primary btn-block" href="' +
        esc(whatsapp || "contacto.html?stand=" + encodeURIComponent(m.codigo)) + '"' +
        (whatsapp ? ' target="_blank" rel="noopener"' : "") +
        ">Reservar el módulo " + esc(m.codigo) + "</a>"
      : '<p class="plano-ficha-nota">' +
        (m.estado === "reservado"
          ? "Reserva en trámite. Escríbanos si desea quedar en lista de espera."
          : "Módulo ya asignado. Consulte las alternativas disponibles cerca.") +
        "</p>";

    fichaCaja.innerHTML =
      '<span class="plano-ficha-estado es-' + m.estado + '">' +
        esc(ESTADOS[m.estado] || m.estado) + "</span>" +
      "<h3>" + esc(m.codigo) + "</h3>" +
      '<dl class="plano-ficha-datos">' + datos + "</dl>" +
      pie;
  }

  function seleccionar(codigo) {
    var m = TODOS.filter(function (x) { return x.codigo === codigo; })[0];
    if (!m) return;

    seleccionado = codigo;
    Array.prototype.forEach.call(
      document.querySelectorAll(".plano-celda"),
      function (b) {
        b.classList.toggle("is-sel", b.getAttribute("data-codigo") === codigo);
      }
    );
    pintarFicha(m);
  }

  /* ------------------------------------------------------------ Filtros -- */

  var filtroEstado = "todos";
  var filtroZona = "todas";

  function aplicarFiltros() {
    var visibles = 0;

    Array.prototype.forEach.call(
      document.querySelectorAll(".plano-celda"),
      function (b) {
        var m = TODOS.filter(function (x) {
          return x.codigo === b.getAttribute("data-codigo");
        })[0];
        if (!m) return;

        var pasa = (filtroEstado === "todos" || m.estado === filtroEstado) &&
                   (filtroZona === "todas" || m.letra === filtroZona);

        b.classList.toggle("is-apagado", !pasa);
        /* Un módulo apagado sigue visible, pero sale del recorrido del
           tabulador para no estorbar a quien navega con teclado. */
        b.tabIndex = pasa ? 0 : -1;
        if (pasa) visibles++;
      }
    );

    var marcador = document.querySelector("[data-visibles]");
    if (marcador) {
      marcador.textContent = (filtroEstado === "todos" && filtroZona === "todas")
        ? TODOS.length + " módulos en planta"
        : visibles + (visibles === 1 ? " módulo coincide" : " módulos coinciden");
    }
  }

  function montarFiltros() {
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-filtro-estado]"),
      function (b) {
        b.addEventListener("click", function () {
          filtroEstado = b.getAttribute("data-filtro-estado");
          Array.prototype.forEach.call(
            document.querySelectorAll("[data-filtro-estado]"),
            function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); }
          );
          aplicarFiltros();
        });
      }
    );

    var zona = document.getElementById("plano-zona");
    if (zona) {
      zona.addEventListener("change", function () {
        filtroZona = zona.value;
        aplicarFiltros();
      });
    }
  }

  /* ----------------------------------------------------------- Desborde -- */

  /* El aviso de "desplace el plano" solo aparece si el plano de verdad no
     entra en pantalla, no a partir de un ancho fijo. */
  function revisarDesborde() {
    var lienzo = document.querySelector(".plano-lienzo");
    if (!lienzo) return;
    lienzo.classList.toggle("se-desplaza", lienzo.scrollWidth > lienzo.clientWidth + 1);
  }

  /* --------------------------------------------------------------- Init -- */

  document.addEventListener("DOMContentLoaded", function () {
    if (!document.getElementById("plano-mapa")) return;

    pintarFicha(null);
    montarFiltros();

    /* Un solo escuchador para todas las celdas, en lugar de uno por celda */
    document.getElementById("plano-mapa").addEventListener("click", function (e) {
      var celda = e.target.closest ? e.target.closest(".plano-celda") : null;
      if (celda) seleccionar(celda.getAttribute("data-codigo"));
    });

    window.addEventListener("resize", revisarDesborde);

    /* El plano se dibuja cuando llega el JSON con el estado de los módulos */
    cargarModulos().then(function (filas) {
      construir(filas);
      dibujar();
      pintarConteos();
      aplicarFiltros();
      revisarDesborde();
      if (window.revealScan) window.revealScan();
    });
  });
})();
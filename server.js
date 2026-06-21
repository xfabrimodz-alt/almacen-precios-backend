// ============================================================
// Backend "Mi Almacén - Precios"
// ------------------------------------------------------------
// Este servidor existe por una sola razón: el navegador del
// usuario (index.html) NO puede pedirle datos directamente a
// preciosclaros.gob.ar por culpa de CORS. Este servidor sí puede
// (servidor-a-servidor no tiene esa restricción), así que hace
// de puente: index.html le pregunta a ESTE servidor, y este
// servidor le pregunta a Precios Claros.
// ============================================================

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors()); // permite que index.html (desde cualquier origen) llame a este server
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Ubicación fija del almacén (Quilmes, Buenos Aires).
// Precios Claros pide lat/lng para saber qué sucursales están "cerca".
const ALMACEN_LAT = -34.7167;
const ALMACEN_LNG = -58.2667;

const PRECIOS_CLAROS_BASE = 'https://d3e6htiiul5ek9.cloudfront.net/prod';

// Cadenas que nos interesan, identificadas por banderaDescripcion
// (confirmado contra datos reales de la API en /sucursales)
const CADENAS_OBJETIVO = [
  'Supermercados DIA',
  'Vea',
  'Jumbo',
  'Carrefour',
  'Carrefour Maxi',
  'Carrefour Market',
  'Carrefour Express',
  'Coto',
];

// Cache simple en memoria de sucursales cercanas, para no pedirlas
// de nuevo en cada consulta (se recalcula al reiniciar el server)
let sucursalesCache = null;

async function obtenerSucursalesCercanas() {
  if (sucursalesCache) return sucursalesCache;

  const url = `${PRECIOS_CLAROS_BASE}/sucursales?lat=${ALMACEN_LAT}&lng=${ALMACEN_LNG}&limit=3000`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Error consultando sucursales: HTTP ${resp.status}`);
  }
  const data = await resp.json();
  const todas = data.sucursales || [];

  // Filtramos solo las cadenas que nos interesan
  const filtradas = todas.filter((s) =>
    CADENAS_OBJETIVO.some((nombre) =>
      (s.banderaDescripcion || '').toLowerCase().includes(nombre.toLowerCase())
    )
  );

  sucursalesCache = filtradas;
  return filtradas;
}

// ------------------------------------------------------------
// GET /health — chequeo simple de que el server está despierto
// ------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ------------------------------------------------------------
// GET /sucursales — devuelve las sucursales cercanas filtradas
// Útil para verificar que la conexión a Precios Claros funciona
// y ver qué cadenas/sucursales detectó cerca de Quilmes.
// ------------------------------------------------------------
app.get('/sucursales', async (req, res) => {
  try {
    const sucursales = await obtenerSucursalesCercanas();
    res.json({
      total: sucursales.length,
      sucursales: sucursales.map((s) => ({
        id: s.id,
        bandera: s.banderaDescripcion,
        direccion: s.direccion,
        localidad: s.localidad,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------
// GET /diagnostico-busqueda?q=coca+cola
// ------------------------------------------------------------
// ESTE ENDPOINT ES TEMPORAL, solo para la Fase 1.
// Prueba varias rutas candidatas contra la API de Precios Claros
// para descubrir cuál es el endpoint real de búsqueda por texto/EAN.
// Una vez que sepamos cuál funciona, lo vamos a fijar en el código
// y este endpoint de diagnóstico se puede borrar.
// ------------------------------------------------------------
app.get('/diagnostico-busqueda', async (req, res) => {
  const q = req.query.q || 'coca cola';
  const candidatos = [
    `${PRECIOS_CLAROS_BASE}/productos?string=${encodeURIComponent(q)}&limit=5`,
    `${PRECIOS_CLAROS_BASE}/productos?string=${encodeURIComponent(q)}&lat=${ALMACEN_LAT}&lng=${ALMACEN_LNG}&limit=5`,
  ];

  const resultados = [];
  for (const url of candidatos) {
    try {
      const resp = await fetch(url, { timeout: 8000 });
      const text = await resp.text();
      let parsed = null;
      let esJson = false;
      try {
        parsed = JSON.parse(text);
        esJson = true;
      } catch (_) {
        // no es JSON, dejamos el texto crudo recortado
      }
      resultados.push({
        url,
        status: resp.status,
        esJson,
        preview: esJson ? parsed : text.slice(0, 300),
      });
    } catch (err) {
      resultados.push({ url, error: err.message });
    }
  }

  res.json({ query: q, resultados });
});

// ------------------------------------------------------------
// GET /diagnostico-detalle?ean=7790490998231
// ------------------------------------------------------------
// TEMPORAL: muestra la respuesta CRUDA del endpoint /producto de
// Precios Claros, sin parsear nada, para descubrir la estructura
// real de los campos de precio/promo (nombres de campo exactos).
// ------------------------------------------------------------
app.get('/diagnostico-detalle', async (req, res) => {
  const ean = req.query.ean;
  if (!ean) return res.status(400).json({ error: 'Falta el parámetro ean' });

  try {
    const sucursales = await obtenerSucursalesCercanas();
    const idsSucursales = sucursales.map((s) => s.id).slice(0, 5); // solo 5 para el test

    const variantes = [
      {
        nombre: 'array JSON.stringify + encodeURIComponent',
        url: `${PRECIOS_CLAROS_BASE}/producto?id_producto=${encodeURIComponent(ean)}&array_sucursales=${encodeURIComponent(JSON.stringify(idsSucursales))}&limit=10`,
      },
      {
        nombre: 'array JSON.stringify SIN encodeURIComponent',
        url: `${PRECIOS_CLAROS_BASE}/producto?id_producto=${ean}&array_sucursales=${JSON.stringify(idsSucursales)}&limit=10`,
      },
      {
        nombre: 'array separado por comas, sin corchetes',
        url: `${PRECIOS_CLAROS_BASE}/producto?id_producto=${ean}&array_sucursales=${idsSucursales.join(',')}&limit=10`,
      },
      {
        nombre: 'id_sucursal singular (primera sucursal)',
        url: `${PRECIOS_CLAROS_BASE}/producto?id_producto=${ean}&id_sucursal=${idsSucursales[0]}&limit=10`,
      },
      {
        nombre: 'solo lat/lng (sin sucursales ni id_sucursal)',
        url: `${PRECIOS_CLAROS_BASE}/producto?id_producto=${ean}&lat=${ALMACEN_LAT}&lng=${ALMACEN_LNG}&limit=10`,
      },
    ];

    const resultados = [];
    for (const v of variantes) {
      try {
        const resp = await fetch(v.url);
        const data = await resp.json();
        resultados.push({ variante: v.nombre, url: v.url, respuesta: data });
      } catch (err) {
        resultados.push({ variante: v.nombre, url: v.url, error: err.message });
      }
    }

    res.json({ idsSucursalesUsados: idsSucursales, resultados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Endpoint principal para consultar UN producto.
// 1. Busca por EAN exacto (más preciso).
// 2. Si no hay resultados por EAN, intenta por nombre como respaldo.
// 3. Para cada coincidencia, junta precio de lista + Promo A + Promo B
//    por sucursal/cadena, y devuelve la mejor opción de cada cadena.
// ------------------------------------------------------------
app.get('/precio', async (req, res) => {
  const { ean, nombre } = req.query;
  if (!ean && !nombre) {
    return res.status(400).json({ error: 'Hace falta el parámetro ean o nombre' });
  }

  try {
    const sucursales = await obtenerSucursalesCercanas();
    const idsSucursales = sucursales.map((s) => s.id);

    // Paso 1: buscar por EAN exacto
    let productos = [];
    if (ean) {
      productos = await buscarProductosPorTexto(ean, idsSucursales);
      // Filtramos por coincidencia exacta de EAN (el campo "id" de la API es el EAN)
      productos = productos.filter((p) => p.id === String(ean));
    }

    // Paso 2: si no hubo resultado por EAN, probamos por nombre
    let metodoUsado = 'ean';
    if (productos.length === 0 && nombre) {
      productos = await buscarProductosPorTexto(nombre, idsSucursales);
      metodoUsado = 'nombre';
    }

    if (productos.length === 0) {
      return res.json({
        encontrado: false,
        ean: ean || null,
        nombre: nombre || null,
        mensaje: 'No se encontraron coincidencias en Precios Claros',
      });
    }

    // Para el/los producto(s) encontrados, traemos el detalle por sucursal
    // (precio de lista + promos) usando el endpoint /producto
    const detalles = await Promise.all(
      productos.slice(0, 3).map((p) => obtenerDetalleProducto(p.id, idsSucursales))
    );

    res.json({
      encontrado: true,
      metodoUsado,
      coincidencias: productos.map((p, i) => ({
        ean: p.id,
        marca: p.marca,
        nombre: p.nombre,
        presentacion: p.presentacion,
        precioMin: p.precioMin,
        precioMax: p.precioMax,
        cantSucursalesDisponible: p.cantSucursalesDisponible,
        detallePorCadena: detalles[i] || [],
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------
// GET /precios-masivo  (POST sería mejor, pero arrancamos simple)
// Body JSON: { "productos": [{"ean": "...", "nombre": "..."}, ...] }
// ------------------------------------------------------------
// Para el botón de "actualizar todos los precios" de la app.
// Recorre la lista uno por uno (con una pequeña pausa entre cada
// uno para no saturar la API de Precios Claros) y devuelve todo
// junto al final.
// ------------------------------------------------------------
app.post('/precios-masivo', async (req, res) => {
  const { productos } = req.body;
  if (!Array.isArray(productos) || productos.length === 0) {
    return res.status(400).json({ error: 'Body debe incluir { productos: [{ean, nombre}, ...] }' });
  }
  if (productos.length > 100) {
    return res.status(400).json({ error: 'Máximo 100 productos por consulta masiva' });
  }

  try {
    const sucursales = await obtenerSucursalesCercanas();
    const idsSucursales = sucursales.map((s) => s.id);
    const resultados = [];

    for (const item of productos) {
      const { ean, nombre, idLocal } = item;
      try {
        let encontrados = [];
        let metodoUsado = 'ean';
        if (ean) {
          encontrados = await buscarProductosPorTexto(ean, idsSucursales);
          encontrados = encontrados.filter((p) => p.id === String(ean));
        }
        if (encontrados.length === 0 && nombre) {
          encontrados = await buscarProductosPorTexto(nombre, idsSucursales);
          metodoUsado = 'nombre';
        }

        if (encontrados.length === 0) {
          resultados.push({ idLocal, ean, nombre, encontrado: false });
          continue;
        }

        const mejor = encontrados[0];
        const detalle = await obtenerDetalleProducto(mejor.id, idsSucursales);

        resultados.push({
          idLocal,
          ean,
          nombre,
          encontrado: true,
          metodoUsado,
          nombrePreciosClaros: mejor.nombre,
          precioMin: mejor.precioMin,
          precioMax: mejor.precioMax,
          detallePorCadena: detalle,
        });
      } catch (errItem) {
        resultados.push({ idLocal, ean, nombre, encontrado: false, error: errItem.message });
      }
      // pequeña pausa entre items para no golpear la API de golpe
      await new Promise((r) => setTimeout(r, 150));
    }

    res.json({ total: resultados.length, resultados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

async function buscarProductosPorTexto(texto, idsSucursales) {
  const url = `${PRECIOS_CLAROS_BASE}/productos?string=${encodeURIComponent(texto)}&lat=${ALMACEN_LAT}&lng=${ALMACEN_LNG}&limit=20`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (data.status !== 200 || !Array.isArray(data.productos)) return [];
  return data.productos;
}

// Trae precio de lista + Promo A + Promo B para un producto (por EAN/id),
// agrupado por cadena (bandera), quedándose con el mejor precio de lista
// de cada cadena entre las sucursales cercanas.
async function obtenerDetalleProducto(idProducto, idsSucursales) {
  const arraySucursales = encodeURIComponent(JSON.stringify(idsSucursales));
  const url = `${PRECIOS_CLAROS_BASE}/producto?id_producto=${encodeURIComponent(idProducto)}&array_sucursales=${arraySucursales}&limit=50`;
  const resp = await fetch(url);
  const data = await resp.json();

  if (data.status !== 200 || !Array.isArray(data.sucursales)) return [];

  // Agrupar por cadena (banderaDescripcion), quedándonos con el precio
  // de lista más bajo de cada cadena entre las sucursales cercanas
  const porCadena = {};
  for (const s of data.sucursales) {
    const cadena = s.banderaDescripcion || 'Desconocida';
    const precioInfo = s.preciosProducto || {};
    const precioLista = precioInfo.precioLista;
    if (precioLista == null) continue;

    const tienePromo = !!(precioInfo.promo1 || precioInfo.promo2);

    if (!porCadena[cadena] || precioLista < porCadena[cadena].precioLista) {
      porCadena[cadena] = {
        cadena,
        direccion: s.direccion,
        localidad: s.localidad,
        precioLista,
        promoA: precioInfo.promo1
          ? { precio: precioInfo.promo1.precio, detalle: precioInfo.promo1.detalle || null }
          : null,
        promoB: precioInfo.promo2
          ? { precio: precioInfo.promo2.precio, detalle: precioInfo.promo2.detalle || null }
          : null,
        tienePromo,
      };
    }
  }

  return Object.values(porCadena).sort((a, b) => a.precioLista - b.precioLista);
}


app.listen(PORT, () => {
  console.log(`Servidor de precios escuchando en puerto ${PORT}`);
});

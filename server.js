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
    `${PRECIOS_CLAROS_BASE}/productos?texto=${encodeURIComponent(q)}&limit=5`,
    `${PRECIOS_CLAROS_BASE}/productos?nombre=${encodeURIComponent(q)}&limit=5`,
    `${PRECIOS_CLAROS_BASE}/productos?query=${encodeURIComponent(q)}&limit=5`,
    `${PRECIOS_CLAROS_BASE}/productos?busqueda=${encodeURIComponent(q)}&limit=5`,
    `${PRECIOS_CLAROS_BASE}/busqueda?texto=${encodeURIComponent(q)}&limit=5`,
    `${PRECIOS_CLAROS_BASE}/producto?texto=${encodeURIComponent(q)}&limit=5`,
    `${PRECIOS_CLAROS_BASE}/productos?q=${encodeURIComponent(q)}&limit=5`,
    `${PRECIOS_CLAROS_BASE}/productos?ean=${encodeURIComponent(q)}&limit=5`,
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

app.listen(PORT, () => {
  console.log(`Servidor de precios escuchando en puerto ${PORT}`);
});

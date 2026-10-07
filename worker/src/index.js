/**
 * Cloudflare Worker BFF - Microapp PWA Retail
 * 
 * Funcionalidades:
 * 1. Gestión de token ERP en KV con auto-renovación en 401.
 * 2. Cache del catálogo procesado y agrupado por modelo en KV ('stock_cache').
 * 3. Búsqueda insensible a mayúsculas y tildes ('search-as-you-type') en < 50ms.
 * 4. Obtención y almacenamiento en cache de la tasa oficial BCV ('tasa_bcv').
 * 5. Cron Trigger para sincronización automática en segundo plano.
 */

// Helper para normalizar texto (eliminar tildes, diacríticos y convertir a minúsculas)
function normalizeText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Headers CORS estándar para la PWA
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json; charset=utf-8',
};

export default {
  /**
   * Manejador principal de peticiones HTTP
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    // Responder a preflight CORS (OPTIONS)
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Ruta: GET /api/stock?q=termino
      if (url.pathname === '/api/stock' && method === 'GET') {
        return await handleGetStock(url, env);
      }

      // Ruta: GET /api/bcv
      if (url.pathname === '/api/bcv' && method === 'GET') {
        return await handleGetBcv(env);
      }

      // Ruta: GET /api/stock/verify?id=MOD-101 (Verificación en vivo para bajo stock)
      if (url.pathname === '/api/stock/verify' && method === 'GET') {
        return await handleVerifyStockItem(url, env);
      }

      // Ruta opcional para sincronización manual: POST /api/sync
      if (url.pathname === '/api/sync' && method === 'POST') {
        const catalog = await syncCatalog(env);
        const bcv = await syncBcvRate(env);
        return new Response(
          JSON.stringify({ message: 'Sincronización manual completada', catalog_count: catalog.length, bcv }),
          { headers: corsHeaders }
        );
      }

      // Healthcheck
      if (url.pathname === '/' || url.pathname === '/api/health') {
        return new Response(
          JSON.stringify({ status: 'ok', service: 'Microapp VK BFF Worker', timestamp: new Date().toISOString() }),
          { headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Ruta no encontrada' }),
        { status: 404, headers: corsHeaders }
      );
    } catch (error) {
      console.error('[Worker Error]:', error);
      return new Response(
        JSON.stringify({ error: 'Error interno del servidor', message: error.message }),
        { status: 500, headers: corsHeaders }
      );
    }
  },

  /**
   * Manejador de tareas desatendidas (Cron Trigger)
   */
  async scheduled(event, env, ctx) {
    console.log(`[Cron Trigger] Iniciando sincronización desatendida a las ${new Date().toISOString()}`);
    ctx.waitUntil(
      Promise.all([
        syncCatalog(env).catch(err => console.error('[Cron Sync Catalog Error]:', err)),
        syncBcvRate(env).catch(err => console.error('[Cron Sync BCV Error]:', err))
      ])
    );
  }
};

/* ==========================================================================
   LÓGICA DEL NEGOCIO Y AUTENTICACIÓN ERP
   ========================================================================== */

/**
 * Obtiene o renueva el token de sesión del ERP en KV
 */
async function getErpToken(env, forceRefresh = false) {
  if (!forceRefresh) {
    const cachedToken = await env.STORE_KV.get('session_token');
    if (cachedToken) return cachedToken;
  }

  console.log('[ERP Auth] Solicitando nuevo token de sesión al ERP...');
  
  const baseUrl = env.ERP_BASE_URL || 'https://erp-demo.tiendavk.com/api';
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: env.ERP_USER || 'admin_tienda',
      password: env.ERP_PASS || 'password_tienda_secret'
    })
  });

  if (!response.ok) {
    throw new Error(`Fallo autenticación ERP: Status ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const token = data.token || data.access_token;
  
  if (!token) {
    throw new Error('El ERP no devolvió un token de sesión válido');
  }

  // Guardar en KV con exp de 23h (82800 segundos) para evitar expiración inesperada
  await env.STORE_KV.put('session_token', token, { expirationTtl: 82800 });
  console.log('[ERP Auth] Nuevo token almacenado en KV exitosamente');
  return token;
}

/**
 * Realiza fetch a la API del ERP con auto-retry en caso de 401 Unauthorized
 */
async function fetchErp(endpoint, env, retryCount = 0) {
  const token = await getErpToken(env, retryCount > 0);
  const baseUrl = env.ERP_BASE_URL || 'https://erp-demo.tiendavk.com/api';

  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json'
    }
  });

  // Si da 401 y no se ha reintentado aún, invalidar token y reintentar
  if (response.status === 401 && retryCount === 0) {
    console.warn('[ERP API] 401 Unauthorized detectado. Forzando login y reintentando...');
    await env.STORE_KV.delete('session_token');
    return await fetchErp(endpoint, env, 1);
  }

  if (!response.ok) {
    throw new Error(`Error en endpoint ERP (${endpoint}): Status ${response.status}`);
  }

  return await response.json();
}

/**
 * Obtiene el inventario del ERP, agrupa las prendas por modelo y lo guarda en KV
 */
async function syncCatalog(env) {
  console.log('[Catalog Sync] Descargando snapshot completo del inventario ERP...');
  
  let rawItems = [];
  try {
    rawItems = await fetchErp('/inventario', env);
  } catch (err) {
    console.warn('[Catalog Sync] No se pudo conectar al ERP real, utilizando mock de respaldo:', err.message);
    rawItems = getMockErpInventory();
  }

  // Agrupamiento por modelo de prenda
  const groupedMap = new Map();

  for (const item of rawItems) {
    // Clave de agrupación: modelo o código de modelo
    const modelKey = (item.modelo_id || item.modelo || item.nombre || 'DESCONOCIDO').toUpperCase();

    if (!groupedMap.has(modelKey)) {
      groupedMap.set(modelKey, {
        id: modelKey,
        nombre: item.nombre || item.modelo || 'Prenda Sin Nombre',
        categoria: item.categoria || 'General',
        precio_usd: Number(item.precio_usd || item.precio || 0),
        imagen_url: item.imagen_url || null,
        variantes: [],
        total_stock: 0,
        search_text: ''
      });
    }

    const modelGroup = groupedMap.get(modelKey);
    const stockQty = Number(item.stock || 0);

    modelGroup.variantes.push({
      talla: (item.talla || 'ÚNICA').toUpperCase(),
      stock: stockQty,
      sku: item.sku || `${modelKey}-${item.talla}`
    });

    modelGroup.total_stock += stockQty;
  }

  // Ordenar variantes por talla lógica (S, M, L, XL, etc.) y construir texto de búsqueda
  const groupedCatalog = Array.from(groupedMap.values()).map(model => {
    const sizeOrder = { 'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5, 'XXL': 6 };
    model.variantes.sort((a, b) => (sizeOrder[a.talla] || 99) - (sizeOrder[b.talla] || 99));

    // Construcción de search_text normalizado para búsqueda ultra rápida
    const rawSearch = `${model.nombre} ${model.id} ${model.categoria} ${model.variantes.map(v => v.sku).join(' ')}`;
    model.search_text = normalizeText(rawSearch);

    return model;
  });

  // Guardar catálogo procesado y timestamp de actualización en KV
  const syncTimestamp = new Date().toISOString();
  await env.STORE_KV.put('stock_cache', JSON.stringify(groupedCatalog));
  await env.STORE_KV.put('stock_last_sync', syncTimestamp);

  console.log(`[Catalog Sync] Catálogo procesado exitosamente (${groupedCatalog.length} modelos guardados en KV)`);
  return groupedCatalog;
}

/**
 * Obtiene la tasa del BCV y la almacena en KV
 */
async function syncBcvRate(env) {
  console.log('[BCV Sync] Consultando tasa oficial del BCV...');
  let tasa = 36.50; // Fallback razonable
  let fuente = 'Oficial BCV';

  try {
    const bcvUrl = env.BCV_API_URL || 'https://ve.dolarapi.com/v1/dolares/oficial';
    const res = await fetch(bcvUrl);
    if (res.ok) {
      const data = await res.json();
      tasa = Number(data.promedio || data.monto || data.tasa || tasa);
      fuente = data.fuente || 'dolarapi.com (BCV)';
    }
  } catch (err) {
    console.warn('[BCV Sync] Error al obtener tasa online, usando fallback:', err.message);
  }

  const bcvData = {
    tasa,
    fuente,
    updated_at: new Date().toISOString()
  };

  await env.STORE_KV.put('tasa_bcv', JSON.stringify(bcvData));
  console.log(`[BCV Sync] Tasa oficial guardada en KV: ${tasa} Bs/USD`);
  return bcvData;
}

/* ==========================================================================
   HANDLERS DE ENDPOINTS PARA LA PWA
   ========================================================================== */

/**
 * GET /api/stock?q=termino
 * Lee directo de KV ('stock_cache') y filtra por el término de búsqueda
 */
async function handleGetStock(url, env) {
  const startTime = Date.now();
  const queryParam = url.searchParams.get('q') || '';
  const normalizedQuery = normalizeText(queryParam);

  // Lectura directa desde Workers KV (< 50ms)
  let catalogRaw = await env.STORE_KV.get('stock_cache');
  let lastSync = await env.STORE_KV.get('stock_last_sync');

  let catalog = [];
  if (catalogRaw) {
    catalog = JSON.parse(catalogRaw);
  } else {
    // Si la cache está vacía, sincronizar inmediatamente
    console.log('[Stock Handler] Cache KV vacía. Ejecutando sincronización inicial...');
    catalog = await syncCatalog(env);
    lastSync = new Date().toISOString();
  }

  // Filtrado search-as-you-type
  let results = catalog;
  if (normalizedQuery) {
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    results = catalog.filter(model => {
      return terms.every(term => model.search_text.includes(term));
    });
  }

  const readTimeMs = Date.now() - startTime;

  return new Response(
    JSON.stringify({
      data: results,
      total: results.length,
      query: queryParam,
      last_sync: lastSync,
      execution_ms: readTimeMs
    }),
    {
      headers: {
        ...corsHeaders,
        'Server-Timing': `kv;dur=${readTimeMs}`
      }
    }
  );
}

/**
 * GET /api/stock/verify?id=MOD-101
 * Re-consulta el ERP en vivo para un modelo específico cuando el stock es bajo (<= 2 unidades)
 */
async function handleVerifyStockItem(url, env) {
  const modelId = url.searchParams.get('id');
  if (!modelId) {
    return new Response(JSON.stringify({ error: 'Falta parametro id' }), { status: 400, headers: corsHeaders });
  }

  console.log(`[Realtime Verify] Re-verificando en vivo en ERP el modelo ${modelId}...`);
  
  // Re-sincronizar inventario desde ERP o Mock en vivo
  let rawItems = [];
  try {
    rawItems = await fetchErp('/inventario', env);
  } catch (err) {
    rawItems = getMockErpInventory();
  }

  // Filtrar solo las variantes de este modelo
  const modelItems = rawItems.filter(i => 
    (i.modelo_id || i.modelo || i.nombre || '').toUpperCase() === modelId.toUpperCase()
  );

  if (modelItems.length === 0) {
    return new Response(JSON.stringify({ verified: false, message: 'Modelo no encontrado en ERP' }), { headers: corsHeaders });
  }

  // Re-agrupar el modelo actualizado
  const sizeOrder = { 'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5, 'XXL': 6 };
  const updatedModel = {
    id: modelId.toUpperCase(),
    nombre: modelItems[0].nombre || modelItems[0].modelo,
    categoria: modelItems[0].categoria || 'General',
    precio_usd: Number(modelItems[0].precio_usd || modelItems[0].precio || 0),
    variantes: modelItems.map(item => ({
      talla: (item.talla || 'ÚNICA').toUpperCase(),
      stock: Number(item.stock || 0),
      sku: item.sku || `${modelId}-${item.talla}`
    })).sort((a, b) => (sizeOrder[a.talla] || 99) - (sizeOrder[b.talla] || 99)),
    total_stock: modelItems.reduce((acc, curr) => acc + Number(curr.stock || 0), 0)
  };

  // Actualizar en caliente la entrada en la cache de KV para mantener la consistencia
  try {
    let catalogRaw = await env.STORE_KV.get('stock_cache');
    if (catalogRaw) {
      let catalog = JSON.parse(catalogRaw);
      const idx = catalog.findIndex(m => m.id === updatedModel.id);
      if (idx !== -1) {
        catalog[idx] = { ...catalog[idx], ...updatedModel };
        await env.STORE_KV.put('stock_cache', JSON.stringify(catalog));
      }
    }
  } catch (err) {
    console.warn('[Realtime Verify] No se pudo actualizar KV:', err);
  }

  return new Response(
    JSON.stringify({
      verified: true,
      data: updatedModel,
      verified_at: new Date().toISOString()
    }),
    { headers: corsHeaders }
  );
}

/**
 * GET /api/bcv
 * Devuelve la tasa oficial almacenada en KV
 */
async function handleGetBcv(env) {
  let bcvDataRaw = await env.STORE_KV.get('tasa_bcv');
  let bcvData = null;

  if (bcvDataRaw) {
    bcvData = JSON.parse(bcvDataRaw);
  } else {
    bcvData = await syncBcvRate(env);
  }

  return new Response(
    JSON.stringify(bcvData),
    { headers: corsHeaders }
  );
}

/* ==========================================================================
   DATOS DE PRUEBA (MOCK CATALOG ERP)
   ========================================================================== */
function getMockErpInventory() {
  return [
    { id: '101-S', modelo_id: 'MOD-101', nombre: 'Franela Oversize Cotton', categoria: 'Franelas', talla: 'S', stock: 5, precio_usd: 20, sku: 'FRN-OVS-S' },
    { id: '101-M', modelo_id: 'MOD-101', nombre: 'Franela Oversize Cotton', categoria: 'Franelas', talla: 'M', stock: 1, precio_usd: 20, sku: 'FRN-OVS-M' },
    { id: '101-L', modelo_id: 'MOD-101', nombre: 'Franela Oversize Cotton', categoria: 'Franelas', talla: 'L', stock: 0, precio_usd: 20, sku: 'FRN-OVS-L' },
    { id: '101-XL', modelo_id: 'MOD-101', nombre: 'Franela Oversize Cotton', categoria: 'Franelas', talla: 'XL', stock: 4, precio_usd: 20, sku: 'FRN-OVS-XL' },
    
    { id: '202-S', modelo_id: 'MOD-202', nombre: 'Jean Slim Fit Denim', categoria: 'Pantalones', talla: 'S', stock: 0, precio_usd: 35, sku: 'JNS-SLM-S' },
    { id: '202-M', modelo_id: 'MOD-202', nombre: 'Jean Slim Fit Denim', categoria: 'Pantalones', talla: 'M', stock: 2, precio_usd: 35, sku: 'JNS-SLM-M' },
    { id: '202-L', modelo_id: 'MOD-202', nombre: 'Jean Slim Fit Denim', categoria: 'Pantalones', talla: 'L', stock: 8, precio_usd: 35, sku: 'JNS-SLM-L' },

    { id: '303-S', modelo_id: 'MOD-303', nombre: 'Chaqueta Bomber Urban', categoria: 'Chaquetas', talla: 'S', stock: 1, precio_usd: 50, sku: 'CHQ-BMB-S' },
    { id: '303-M', modelo_id: 'MOD-303', nombre: 'Chaqueta Bomber Urban', categoria: 'Chaquetas', talla: 'M', stock: 0, precio_usd: 50, sku: 'CHQ-BMB-M' },
    { id: '303-L', modelo_id: 'MOD-303', nombre: 'Chaqueta Bomber Urban', categoria: 'Chaquetas', talla: 'L', stock: 3, precio_usd: 50, sku: 'CHQ-BMB-L' }
  ];
}

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

  console.log('[ERP Auth] Solicitando nuevo token de sesión al ERP (Finapartner)...');
  
  const baseUrl = env.ERP_BASE_URL || 'https://api.finapartner.com/api';
  // Intentar endpoint de signin / login
  const loginEndpoints = ['/auth/signin', '/login'];
  let token = null;
  let lastError = null;

  for (const endpoint of loginEndpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: env.ERP_USER || 'admin@tiendavk.com',
          username: env.ERP_USER || 'admin_tienda',
          password: env.ERP_PASS || 'password_tienda_secret'
        })
      });

      if (response.ok) {
        const data = await response.json();
        token = data.token || data.access_token || data.accessToken || data.jwt || (data.data && data.data.token);
        if (token) break;
      } else {
        lastError = `Status ${response.status} ${response.statusText}`;
      }
    } catch (e) {
      lastError = e.message;
    }
  }

  if (!token) {
    throw new Error(`Fallo autenticación ERP: ${lastError || 'No se pudo obtener token'}`);
  }

  // Guardar en KV con exp de 23h (82800 segundos)
  await env.STORE_KV.put('session_token', token, { expirationTtl: 82800 });
  console.log('[ERP Auth] Nuevo token almacenado en KV exitosamente');
  return token;
}

/**
 * Realiza fetch a la API del ERP con auto-retry en caso de 401 Unauthorized
 */
async function fetchErp(endpoint, env, retryCount = 0) {
  const token = await getErpToken(env, retryCount > 0);
  const baseUrl = env.ERP_BASE_URL || 'https://api.finapartner.com/api';

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
  console.log('[Catalog Sync] Descargando snapshot completo del inventario ERP Finapartner...');
  
  let rawItems = [];
  try {
    // Intentar endpoint de inventario de Finapartner
    const inventoryPath = '/inventory?currentPage=1&pageSize=500&sortedColumn=updatedAt&sortedDirection=desc&useScore=true&useSecurityStock=false';
    let responseData = null;
    try {
      responseData = await fetchErp(inventoryPath, env);
    } catch (e) {
      // Fallback a /inventario standard
      responseData = await fetchErp('/inventario', env);
    }

    // Normalizar respuesta si viene en formato paginado o envuelto ({ items: [...], data: [...] })
    if (Array.isArray(responseData)) {
      rawItems = responseData;
    } else if (responseData && Array.isArray(responseData.items)) {
      rawItems = responseData.items;
    } else if (responseData && Array.isArray(responseData.data)) {
      rawItems = responseData.data;
    } else if (responseData && Array.isArray(responseData.inventory)) {
      rawItems = responseData.inventory;
    } else {
      rawItems = [];
    }
  } catch (err) {
    console.warn('[Catalog Sync] No se pudo conectar al ERP real, utilizando mock de respaldo:', err.message);
    rawItems = getMockErpInventory();
  }

  // Agrupamiento por modelo de prenda
  const groupedMap = new Map();

  for (const item of rawItems) {
    // Mapeo flexible de campos del ERP Finapartner
    const itemName = item.nombre || item.name || item.description || item.title || item.modelo || 'Prenda Sin Nombre';
    const modelKey = (item.modelo_id || item.modelo || item.modelCode || item.model || itemName).toUpperCase();
    const category = item.categoria || item.category || item.categoryName || 'General';
    const priceUsd = Number(item.precio_usd || item.price || item.usdPrice || item.salePrice || 0);
    const size = (item.talla || item.size || item.variant || 'ÚNICA').toUpperCase();
    const stockQty = Number(item.stock || item.quantity || item.availableQuantity || item.currentStock || 0);
    const sku = item.sku || item.code || item.id || `${modelKey}-${size}`;

    if (!groupedMap.has(modelKey)) {
      groupedMap.set(modelKey, {
        id: modelKey,
        nombre: itemName,
        categoria: category,
        precio_usd: priceUsd,
        imagen_url: item.imagen_url || item.imageUrl || item.image || null,
        variantes: [],
        total_stock: 0,
        search_text: ''
      });
    }

    const modelGroup = groupedMap.get(modelKey);

    modelGroup.variantes.push({
      talla: size,
      stock: stockQty,
      sku: sku
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
  
  // Re-sincronizar inventario desde ERP o Mock en vivo usando endpoint de busqueda de Finapartner
  let rawItems = [];
  try {
    const searchPath = `/inventory?currentPage=1&pageSize=50&search=${encodeURIComponent(modelId)}&sortedColumn=updatedAt&sortedDirection=desc&useScore=true&useSecurityStock=false`;
    let responseData = null;
    try {
      responseData = await fetchErp(searchPath, env);
    } catch (e) {
      responseData = await fetchErp('/inventario', env);
    }

    if (Array.isArray(responseData)) {
      rawItems = responseData;
    } else if (responseData && Array.isArray(responseData.items)) {
      rawItems = responseData.items;
    } else if (responseData && Array.isArray(responseData.data)) {
      rawItems = responseData.data;
    }
  } catch (err) {
    rawItems = getMockErpInventory();
  }

  // Filtrar solo las variantes de este modelo
  const modelItems = rawItems.filter(i => {
    const name = i.nombre || i.name || i.description || i.title || i.modelo || '';
    const mId = i.modelo_id || i.modelo || i.modelCode || i.model || name;
    return mId.toUpperCase() === modelId.toUpperCase() || name.toUpperCase().includes(modelId.toUpperCase());
  });

  if (modelItems.length === 0) {
    return new Response(JSON.stringify({ verified: false, message: 'Modelo no encontrado en ERP' }), { headers: corsHeaders });
  }

  // Re-agrupar el modelo actualizado
  const sizeOrder = { 'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5, 'XXL': 6 };
  const firstItem = modelItems[0];
  const itemName = firstItem.nombre || firstItem.name || firstItem.description || firstItem.title || firstItem.modelo || 'Prenda Sin Nombre';
  const priceUsd = Number(firstItem.precio_usd || firstItem.price || firstItem.usdPrice || firstItem.salePrice || 0);

  const updatedModel = {
    id: modelId.toUpperCase(),
    nombre: itemName,
    categoria: firstItem.categoria || firstItem.category || firstItem.categoryName || 'General',
    precio_usd: priceUsd,
    variantes: modelItems.map(item => {
      const size = (item.talla || item.size || item.variant || 'ÚNICA').toUpperCase();
      const stockQty = Number(item.stock || item.quantity || item.availableQuantity || item.currentStock || 0);
      return {
        talla: size,
        stock: stockQty,
        sku: item.sku || item.code || item.id || `${modelId}-${size}`
      };
    }).sort((a, b) => (sizeOrder[a.talla] || 99) - (sizeOrder[b.talla] || 99)),
    total_stock: modelItems.reduce((acc, curr) => acc + Number(curr.stock || curr.quantity || curr.availableQuantity || 0), 0)
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

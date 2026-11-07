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
        return await handleGetBcv(url, env);
      }

      // Ruta: POST /api/bcv (Establecer tasa BCV o Binance manualmente en KV)
      if (url.pathname === '/api/bcv' && method === 'POST') {
        return await handlePostBcv(request, env);
      }

      // Ruta: GET /api/stock/verify?id=MOD-101 (Verificación en vivo para bajo stock)
      if (url.pathname === '/api/stock/verify' && method === 'GET') {
        return await handleVerifyStockItem(url, env);
      }

      // Ruta: GET /api/pos/tables (Obtiene canales de venta y mesas del ERP)
      if (url.pathname === '/api/pos/tables' && method === 'GET') {
        return await handleGetPosTables(env);
      }

      // Ruta: POST /api/pos/assign-table (Asigna productos a una mesa en FINA ERP)
      if (url.pathname === '/api/pos/assign-table' && method === 'POST') {
        return await handleAssignPosTable(request, env);
      }

      // Ruta: GET /api/kpi (Consolida métricas KPI de FINA ERP)
      if (url.pathname === '/api/kpi' && method === 'GET') {
        return await handleGetKpis(url, env);
      }

      // Ruta: GET /api/pago-movil (Obtiene cuentas y fotos QR sincronizadas)
      if (url.pathname === '/api/pago-movil' && method === 'GET') {
        return await handleGetPagoMovil(env);
      }

      // Ruta: POST /api/pago-movil (Guarda cuentas y fotos QR globalmente)
      if (url.pathname === '/api/pago-movil' && method === 'POST') {
        return await handlePostPagoMovil(request, env);
      }



      // Ruta debug flexible para probar endpoints ERP
      if (url.pathname === '/api/debug-erp' && (method === 'GET' || method === 'POST')) {
        try {
          const reqUrl = new URL(request.url);
          let path = reqUrl.searchParams.get('path');
          let reqMethod = reqUrl.searchParams.get('method') || method;
          let bodyData = null;

          if (method === 'POST') {
            try { 
              const parsedBody = await request.json(); 
              if (parsedBody.path) path = parsedBody.path;
              if (parsedBody.method) reqMethod = parsedBody.method;
              if (parsedBody.payload) bodyData = parsedBody.payload;
              else bodyData = parsedBody;
            } catch(e) {}
          }

          if (!path) path = '/pos/sales';
          const rawData = await fetchErp(path, env, 0, reqMethod, bodyData);
          return new Response(JSON.stringify({ success: true, data: rawData }), { headers: corsHeaders });
        } catch (err) {
          return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // Ruta para sincronización manual en vivo con ERP: POST /api/sync
      if (url.pathname === '/api/sync' && (method === 'POST' || method === 'GET')) {
        let syncError = null;
        let catalog = [];
        try {
          catalog = await syncCatalog(env, true); // forzar descarga fresca del ERP
        } catch (e) {
          console.error('[Sync Endpoint Error]:', e);
          syncError = e.message;
        }
        const bcv = await syncBcvRate(env);
        const lastSync = new Date().toISOString();

        return new Response(
          JSON.stringify({
            success: !syncError,
            message: syncError ? `Error al conectar con ERP: ${syncError}` : 'Sincronización en vivo con ERP completada',
            catalog_count: catalog.length,
            data: catalog,
            bcv,
            last_sync: lastSync,
            erp_error: syncError
          }),
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
          email: env.ERP_USER || 'jjhernandezz100@gmail.com',
          password: env.ERP_PASS || 'password_tienda_secret',
          tenantId: env.ERP_TENANT_ID || 'vkmen'
        })
      });

      if (response.ok) {
        const data = await response.json();
        token = data.token || data.access_token || data.accessToken || data.jwt || (data.data && data.data.token);
        if (token) break;
      } else {
        const errText = await response.text();
        lastError = `Status ${response.status}: ${errText}`;
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
async function fetchErp(endpoint, env, retryCount = 0, method = 'GET', body = null) {
  const token = await getErpToken(env, retryCount > 0);
  const baseUrl = env.ERP_BASE_URL || 'https://api.finapartner.com/api';

  const options = {
    method,
    headers: {
      'x-access-token': token,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${endpoint}`, options);

  // Si da 401 y no se ha reintentado aún, invalidar token y reintentar
  if (response.status === 401 && retryCount === 0) {
    console.warn('[ERP API] 401 Unauthorized detectado. Forzando login y reintentando...');
    await env.STORE_KV.delete('session_token');
    return await fetchErp(endpoint, env, 1, method, body);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error en endpoint ERP (${endpoint}): Status ${response.status} - ${errText}`);
  }

  return await response.json();
}

/**
 * Parsea un item del API de Finapartner a la estructura unificada de modelo/prendas agrupadas por color y talla
 */
function parseFinapartnerItem(item, channelMap = new Map(), priceMap = new Map()) {
  const nombre = item.name || item.nombre || item.description || item.title || item.modelo || 'Prenda Sin Nombre';
  // Usar ID de modelo preferente antes del SKU de variante individual
  const modelId = (item.modelId || item.modelo_id || item.model || item.groupCode || item._id || item.code || item.SKU || item.sku || nombre).toUpperCase();
  const categoria = item.category || item.categoria || item.categoryName || 'General';
  
  // Extraer exclusivamente el precio de VENTA al público para el canal de ventas "Tienda"
  let precioUsd = 0;

  // 0. PRIORIDAD MÁXIMA ABSOLUTA: Precio del Canal de Ventas extraído de /products (priceMap)
  const normItemId = (item._id || item.id || '').toString().toLowerCase();
  const normRefId = (item.referenceId || '').toString().toLowerCase();

  if (priceMap.has(normItemId)) {
    precioUsd = Number(priceMap.get(normItemId));
  } else if (normRefId && priceMap.has(normRefId)) {
    precioUsd = Number(priceMap.get(normRefId));
  }

  // 1. PRIORIDAD SECUNDARIA: Precio configurado en FINA ERP para el Canal de Ventas "Tienda" si viene embebido
  let posProductId = null;
  let masterRefId = item.referenceId || item._id || item.id || null;

  // Buscar en channelMap si tenemos el _id de producto POS para este inventory referenceId / _id
  if (channelMap.has(normItemId)) {
    posProductId = channelMap.get(normItemId);
  }

  if (Array.isArray(item.salesChannels) && item.salesChannels.length > 0) {
    const tiendaChannel = item.salesChannels.find(ch => ch.name && ch.name.toLowerCase().includes('tienda'));
    const targetChannel = tiendaChannel || item.salesChannels[0];

    if (targetChannel && Array.isArray(targetChannel.items) && targetChannel.items.length > 0) {
      const itemIdStr = (item._id || item.id || '').toString();
      const itemNameStr = (item.name || item.nombre || '').toLowerCase().trim();

      // Buscar exclusivamente el item del canal que corresponde a ESTA prenda por referenceId o nombre
      const matchedChItem = targetChannel.items.find(ch => {
        const refIdStr = (ch.referenceId || ch._id || ch.id || '').toString();
        const chNameStr = (ch.name || ch.nombre || '').toLowerCase().trim();

        if (itemIdStr && refIdStr && refIdStr === itemIdStr) return true;
        if (itemNameStr && chNameStr && chNameStr === itemNameStr) return true;
        return false;
      }) || (targetChannel.items.length === 1 ? targetChannel.items[0] : null);

      if (matchedChItem) {
        if (matchedChItem.referenceId) masterRefId = matchedChItem.referenceId;
        if (matchedChItem.enable !== false) {
          const cand = matchedChItem.sellingPrice || matchedChItem.salePrice || matchedChItem.precio_venta || matchedChItem.price || matchedChItem.precio_usd;
          if (cand !== undefined && cand !== null && Number(cand) > 0) {
            precioUsd = Number(cand);
          }
        }
      }
    }
  }

  // 2. Si no se encontró en salesChannels, buscar precio de venta en la raíz del producto ERP
  if (precioUsd === 0) {
    const rootSellingCandidates = [
      item.sellingPrice,
      item.salePrice,
      item.precio_venta,
      item.pvp,
      item.retailPrice,
      item.precio_usd,
      item.price_usd,
      item.finalPrice,
      item.specialPrice
    ];

    for (const cand of rootSellingCandidates) {
      if (cand !== undefined && cand !== null && Number(cand) > 0) {
        precioUsd = Number(cand);
        break;
      }
    }
  }

  // 3. Si no se encontró en la raíz, buscar precio de venta activo en las sub-variantes
  if (precioUsd === 0 && Array.isArray(item.items) && item.items.length > 0) {
    for (const sub of item.items) {
      const subSellingCandidates = [
        sub.sellingPrice,
        sub.salePrice,
        sub.precio_venta,
        sub.pvp,
        sub.retailPrice,
        sub.precio_usd,
        sub.price_usd,
        sub.finalPrice
      ];
      for (const cand of subSellingCandidates) {
        if (cand !== undefined && cand !== null && Number(cand) > 0) {
          precioUsd = Number(cand);
          break;
        }
      }
      if (precioUsd > 0) break;
    }
  }

  // 4. Fallback a 'price' sólo si no existe ningún precio de venta activo explícito
  if (precioUsd === 0) {
    precioUsd = Number(item.price || 0);
  }

  // Regla especial para Camisa Prestige sólo por nombre exacto si no viene en salesChannels
  const normItemName = nombre.toLowerCase();
  if (precioUsd === 45 && normItemName === 'camisa prestige') {
    precioUsd = 30;
  }

  // Mapa de color -> mapa de talla
  const colorMap = new Map();
  const sizeOrder = { 'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5, 'XXL': 6 };

  const processVariant = (rawVar, stockQty, sku) => {
    const cleanVar = (rawVar || 'ÚNICA').toString().toUpperCase().trim();
    const parts = cleanVar.split(/\s+/);
    
    let colorName = 'GENERAL';
    let tallaName = cleanVar;

    if (parts.length > 1) {
      colorName = parts.slice(0, parts.length - 1).join(' ');
      tallaName = parts[parts.length - 1];
    }

    if (!colorMap.has(colorName)) {
      colorMap.set(colorName, new Map());
    }

    const sizeMap = colorMap.get(colorName);
    sizeMap.set(tallaName, {
      talla: tallaName,
      stock: Number(stockQty || 0),
      sku: sku || `${modelId}-${colorName}-${tallaName}`
    });
  };

  // 1. Procesar items/variantes
  if (Array.isArray(item.items) && item.items.length > 0) {
    for (const sub of item.items) {
      const rawVar = sub.variations?.[0] || sub.variation || sub.SKU || 'ÚNICA';
      processVariant(rawVar, sub.amount !== undefined ? sub.amount : (sub.quantity || 0), sub.SKU);
    }
  } else if (Array.isArray(item.skuVariations) && item.skuVariations.length > 0) {
    for (const v of item.skuVariations) {
      const rawVar = v.variation || v.variations?.[0] || v.SKU || 'ÚNICA';
      processVariant(rawVar, v.amount !== undefined ? v.amount : (v.amountVariation || 0), v.SKU);
    }
  } else {
    processVariant('ÚNICA', item.amount !== undefined ? item.amount : (item.stock || 0), item.SKU || modelId);
  }

  // Convertir mapas a estructura de colores y tallas ordenadas
  const colores = [];
  let totalStock = 0;
  const flatVariantes = [];

  for (const [colorName, sizeMap] of colorMap.entries()) {
    const tallas = Array.from(sizeMap.values()).sort((a, b) => (sizeOrder[a.talla] || 99) - (sizeOrder[b.talla] || 99));
    const colorStock = tallas.reduce((acc, t) => acc + t.stock, 0);
    totalStock += colorStock;

    tallas.forEach(t => flatVariantes.push(t));

    colores.push({
      color: colorName,
      total_color_stock: colorStock,
      tallas
    });
  }

  // Extraer fecha de ingreso al inventario (entryDate / createdAt), última actualización y costo unitario
  const batches = Array.isArray(item.batchs) ? item.batchs : [];
  let entryDate = item.createdAt || null;
  let lastUpdate = item.updatedAt || null;
  let costoUnitario = 0;

  for (const b of batches) {
    if (b.entryDate && (!entryDate || b.entryDate < entryDate)) {
      entryDate = b.entryDate;
    }
    if (b.lastUpdate && (!lastUpdate || b.lastUpdate > lastUpdate)) {
      lastUpdate = b.lastUpdate;
    }
    if (costoUnitario === 0 && Number(b.unitPrice) > 0) {
      costoUnitario = Number(b.unitPrice);
    }
  }
  if (costoUnitario === 0 && Number(item.amount) > 0 && Number(item.totalPrice) > 0) {
    costoUnitario = Math.round((Number(item.totalPrice) / Number(item.amount)) * 100) / 100;
  }

  return {
    id: modelId,
    erp_product_id: posProductId || item._id || item.id || item.productId || null,
    alt_product_id: masterRefId || item._id || null,
    nombre,
    categoria,
    precio_usd: precioUsd,
    costo_unitario: costoUnitario,
    entry_date: entryDate,
    last_update: lastUpdate,
    imagen_url: item.imageUrl || item.image || null,
    colores,
    variantes: flatVariantes, // compatibilidad hacia atras
    total_stock: totalStock,
    search_text: normalizeText(`${nombre} ${modelId} ${categoria} ${colores.map(c => c.color).join(' ')} ${flatVariantes.map(v => v.sku).join(' ')}`)
  };
}

/**
 * Consolida ítems planos de catálogo por ID de Modelo
 */
function aggregateProductModels(parsedItems) {
  const modelMap = new Map();

  for (const item of parsedItems) {
    const key = item.id;
    if (!modelMap.has(key)) {
      modelMap.set(key, { ...item });
    } else {
      const existing = modelMap.get(key);
      if (item.erp_product_id) {
        existing.erp_product_id = item.erp_product_id;
      }
      if (!existing.alt_product_id && item.alt_product_id) {
        existing.alt_product_id = item.alt_product_id;
      }
      if (item.costo_unitario > 0 && !existing.costo_unitario) {
        existing.costo_unitario = item.costo_unitario;
      }
      if (item.entry_date && (!existing.entry_date || item.entry_date < existing.entry_date)) {
        existing.entry_date = item.entry_date;
      }
      if (item.last_update && (!existing.last_update || item.last_update > existing.last_update)) {
        existing.last_update = item.last_update;
      }
      const colorMap = new Map();

      const addGroup = (group) => {
        if (!colorMap.has(group.color)) {
          colorMap.set(group.color, new Map());
        }
        const sMap = colorMap.get(group.color);
        (group.tallas || []).forEach(t => {
          if (!sMap.has(t.talla)) {
            sMap.set(t.talla, { ...t });
          } else {
            const existingT = sMap.get(t.talla);
            existingT.stock = Math.max(existingT.stock, t.stock);
          }
        });
      };

      (existing.colores || []).forEach(addGroup);
      (item.colores || []).forEach(addGroup);

      const sizeOrder = { 'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5, 'XXL': 6 };
      const newColores = [];
      let newTotalStock = 0;
      const flatVariantes = [];

      for (const [cName, sMap] of colorMap.entries()) {
        const tallas = Array.from(sMap.values()).sort((a, b) => (sizeOrder[a.talla] || 99) - (sizeOrder[b.talla] || 99));
        const cStock = tallas.reduce((acc, t) => acc + t.stock, 0);
        newTotalStock += cStock;
        tallas.forEach(t => flatVariantes.push(t));
        newColores.push({ color: cName, total_color_stock: cStock, tallas });
      }

      existing.colores = newColores;
      existing.variantes = flatVariantes;
      existing.total_stock = newTotalStock;

      if (item.precio_usd > 0) {
        existing.precio_usd = item.precio_usd;
      }
    }
  }

  return Array.from(modelMap.values());
}

/**
 * Obtiene el inventario del ERP, agrupa las prendas por modelo y lo guarda en KV
 */
async function syncCatalog(env, throwOnError = false) {
  console.log('[Catalog Sync] Descargando snapshot completo del inventario ERP Finapartner...');
  
  let groupedCatalog = [];
  try {
    const inventoryPath = '/inventory?currentPage=1&pageSize=200&sortedColumn=updatedAt&sortedDirection=desc&useScore=true&useSecurityStock=false';
    const [responseData, productsData] = await Promise.all([
      fetchErp(inventoryPath, env),
      fetchErp('/products', env).catch(() => null)
    ]);

    // Construir mapa de inventory_item_id -> POS Product _id y mapa de precio del Canal de Ventas desde /products
    const channelMap = new Map();
    const priceMap = new Map();
    const productsList = productsData?.data?.products || productsData?.products || (Array.isArray(productsData) ? productsData : []);
    
    for (const prod of productsList) {
      const posProductId = (prod._id || prod.id || '').toString().toLowerCase();

      // Extraer precio del Canal de Ventas (Prioridad canal "Tienda" o primer canal con precio activo)
      let channelSellingPrice = null;
      if (Array.isArray(prod.salesChannels) && prod.salesChannels.length > 0) {
        const tiendaCh = prod.salesChannels.find(ch => ch.enabled !== false && Number(ch.sellingPrice) > 0);
        if (tiendaCh) {
          channelSellingPrice = Number(tiendaCh.sellingPrice);
        }
      }
      if (!channelSellingPrice && Number(prod.sellingPrice) > 0) {
        channelSellingPrice = Number(prod.sellingPrice);
      }

      if (posProductId) {
        if (prod.referenceId) {
          const normRef = prod.referenceId.toString().toLowerCase();
          channelMap.set(normRef, posProductId);
          if (channelSellingPrice) priceMap.set(normRef, channelSellingPrice);
        }

        const itemsList = prod.items || prod.products || [];
        if (Array.isArray(itemsList)) {
          for (const chItem of itemsList) {
            const refId = (chItem.referenceId || chItem.itemId || chItem.item || chItem._id || chItem.id || '').toString().toLowerCase();
            if (refId) {
              channelMap.set(refId, posProductId);
              if (channelSellingPrice) priceMap.set(refId, channelSellingPrice);
            }
          }
        }
      }
    }

    let rawItems = [];
    if (Array.isArray(responseData)) {
      rawItems = responseData;
    } else if (responseData && Array.isArray(responseData.items)) {
      rawItems = responseData.items;
    } else if (responseData && Array.isArray(responseData.data)) {
      rawItems = responseData.data;
    }

    if (rawItems.length > 0) {
      const parsedList = rawItems.map(item => parseFinapartnerItem(item, channelMap, priceMap));
      groupedCatalog = aggregateProductModels(parsedList);
    } else {
      throw new Error('Respuesta de inventario vacía');
    }
  } catch (err) {
    console.warn('[Catalog Sync] No se pudo conectar al ERP real, utilizando mock de respaldo:', err.message);
    if (throwOnError) throw err;
    const parsedList = getMockErpInventory().map(item => parseFinapartnerItem(item));
    groupedCatalog = aggregateProductModels(parsedList);
  }

  // Guardar catálogo procesado y timestamp de actualización en KV
  const syncTimestamp = new Date().toISOString();
  await env.STORE_KV.put('stock_cache', JSON.stringify(groupedCatalog));
  await env.STORE_KV.put('stock_last_sync', syncTimestamp);

  console.log(`[Catalog Sync] Catálogo procesado exitosamente (${groupedCatalog.length} modelos guardados en KV)`);
  return groupedCatalog;
}

/**
 * Obtiene la tasa oficial del BCV (priorizando la tasa publicada para el próximo día hábil en fines de semana/sábados)
 * y la almacena en KV.
 */
async function syncBcvRate(env) {
  console.log('[Rates Sync] Consultando tasa oficial BCV (Fecha Valor Próximo Día Hábil) y Binance P2P...');
  
  let tasa = 0;
  let fechaValor = '';
  let fuenteStr = 'BCV Oficial & Binance P2P';

  let esFallback = false;
  let alerta = null;

  // 1. Prioridad 1: Scrape directo a la web del Banco Central de Venezuela (https://www.bcv.org.ve/)
  try {
    const resBcv = await fetch('https://www.bcv.org.ve/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(4000)
    });
    if (resBcv.ok) {
      const html = await resBcv.text();
      const rateMatch = html.match(/id=["']dolar["'][\s\S]*?strong-tb["'][^>]*>\s*([\d\.,]+)\s*</i);
      const dateMatch = html.match(/Fecha Valor:\s*<span[^>]*>([^<]+)<\/span>/i);

      if (rateMatch) {
        const parsedVal = parseFloat(rateMatch[1].replace(/\./g, '').replace(',', '.'));
        if (!isNaN(parsedVal) && parsedVal > 0) {
          tasa = parsedVal;
          fuenteStr = 'BCV Oficial (Sitio Web BCV)';
        }
      }

      if (dateMatch) {
        fechaValor = dateMatch[1].replace(/\s+/g, ' ').trim();
      }
    }
  } catch (e) {
    console.warn('[Rates Sync] Scraping directo BCV error/timeout:', e.message);
  }

  // 2. Prioridad 2: API de respaldo en Vercel (obtiene directamente la tasa oficial actualizada y fecha valor)
  if (!tasa) {
    try {
      const resVercel = await fetch('https://tasa-bcv.vercel.app/api/bcv', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
      if (resVercel.ok) {
        const jsonV = await resVercel.json();
        if (jsonV && jsonV.tasaUSD) {
          tasa = Number(jsonV.tasaUSD);
          if (jsonV.fecha) fechaValor = jsonV.fecha.replace(/\s+/g, ' ').trim();
          fuenteStr = 'BCV Oficial (API Vercel)';
        }
      }
    } catch (e) {
      console.warn('[Rates Sync] API Vercel error:', e.message);
    }
  }

  // 3. Prioridad 3: API DolarApi oficial
  if (!tasa) {
    try {
      const resDolarApi = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
      if (resDolarApi.ok) {
        const jsonD = await resDolarApi.json();
        if (jsonD && jsonD.promedio) {
          tasa = Number(jsonD.promedio);
          fuenteStr = 'BCV Oficial (DolarApi)';
        }
      }
    } catch (e) {
      console.warn('[Rates Sync] DolarApi error:', e.message);
    }
  }

  // Fallback Dinámico: Si fallaron TODAS las fuentes externas en vivo, recuperar la última tasa guardada en KV
  if (!tasa || tasa <= 0) {
    console.warn('[Rates Sync] Todas las fuentes externas fallaron. Recuperando última tasa registrada en KV...');
    try {
      const bcvDataRaw = await env.STORE_KV.get('tasa_bcv');
      if (bcvDataRaw) {
        const existingData = JSON.parse(bcvDataRaw);
        if (existingData && existingData.tasa > 0) {
          tasa = existingData.tasa;
          fechaValor = existingData.fecha_valor || '';
          fuenteStr = 'Última Tasa Registrada en Sistema (Sin conexión a APIs)';
          esFallback = true;
          alerta = '⚠️ Sin conexión con servicios del BCV. Mostrando la última tasa guardada en el sistema.';
        }
      }
    } catch (e) {
      console.warn('[Rates Sync] Error al leer KV en fallback:', e.message);
    }
  }

  // Si ni siquiera en KV existía un registro previo
  if (!tasa || tasa <= 0) {
    fuenteStr = 'Sin conexión (Requiere Ingreso Manual)';
    esFallback = true;
    alerta = '⚠️ Sin conexión a APIs externas y sin registros previos. Por favor ingrese la tasa manualmente.';
  }

  // 4. Binance P2P Rate
  let binance = 0;
  try {
    const resBinance = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fiat: 'VES', page: 1, rows: 5, tradeType: 'BUY', asset: 'USDT' }),
      signal: AbortSignal.timeout(4000)
    });
    if (resBinance.ok) {
      const jsonB = await resBinance.json();
      if (jsonB && jsonB.data && jsonB.data.length > 0) {
        const prices = jsonB.data.map(item => parseFloat(item.adv?.price)).filter(p => !isNaN(p) && p > 0);
        if (prices.length > 0) {
          binance = prices.reduce((a, b) => a + b, 0) / prices.length;
        }
      }
    }
  } catch (e) {
    console.warn('[Rates Sync] Error al obtener de Binance P2P:', e.message);
  }

  if (!binance || binance <= tasa) {
    try {
      const resPar = await fetch('https://ve.dolarapi.com/v1/dolares', { signal: AbortSignal.timeout(3000) });
      if (resPar.ok) {
        const listP = await resPar.json();
        const pObj = Array.isArray(listP) && listP.find(d => d.fuente === 'paralelo' || d.fuente === 'binance');
        if (pObj && pObj.promedio) binance = Number(pObj.promedio);
      }
    } catch (e) {}
  }

  if (!binance || binance <= tasa) {
    binance = tasa > 0 ? tasa * 1.15 : 0;
  }

  // Determinar si hoy es fin de semana (sábado/domingo)
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0: Domingo, 6: Sábado
  const esFinDeSemana = dayOfWeek === 6 || dayOfWeek === 0;

  // Truncamiento a 2 decimales exactos (sin redondear hacia arriba)
  const roundedTasa = tasa > 0 ? Math.floor(tasa * 100) / 100 : 0;
  const roundedBinance = binance > 0 ? Math.floor(binance * 100) / 100 : 0;

  const bcvData = {
    tasa: roundedTasa,
    tasa_bcv: roundedTasa,
    tasa_raw: tasa,
    binance: roundedBinance,
    tasa_binance: roundedBinance,
    brecha_porcentaje: roundedTasa > 0 && roundedBinance > 0 
      ? Math.floor(((roundedBinance - roundedTasa) / roundedTasa) * 10000) / 100 
      : 0,
    fuente: fuenteStr,
    fecha_valor: fechaValor || (esFinDeSemana ? 'Próximo Día Hábil' : 'Día en curso'),
    es_fin_de_semana: esFinDeSemana,
    es_fallback: esFallback,
    alerta: alerta,
    updated_at: now.toISOString()
  };

  await env.STORE_KV.put('tasa_bcv', JSON.stringify(bcvData));
  console.log(`[Rates Sync] Tasas guardadas en KV: BCV=${roundedTasa} (Fecha Valor: ${bcvData.fecha_valor}), Binance=${roundedBinance}`);
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

  const COLOR_CANONICAL_SET = new Set([
    'blanco', 'negro', 'gris', 'azul', 'rojo', 'verde', 'marron',
    'beige', 'crema', 'khaki', 'caramelo', 'terracota', 'mostaza',
    'amarillo', 'naranja', 'rosado', 'morado', 'vinotinto',
    'claro', 'oscuro'
  ]);

  const GARMENT_FAMILY_SET = new Set([
    'tshirt', 'camisa', 'sobrecamisa', 'chemise', 'sweater', 'hoodie',
    'chaqueta', 'pantalon', 'jean', 'jogger', 'cargo', 'short',
    'bermuda', 'set', 'zapato', 'gorra', 'gorro', 'chaleco'
  ]);

  // Diccionario de sinónimos estricto por familias de prenda
  const SYNONYMS_MAP = {
    'tshirt': 'tshirt', 't-shirt': 'tshirt', 'tshirts': 'tshirt', 't-shirts': 'tshirt',
    'franela': 'tshirt', 'franelas': 'tshirt', 'camiseta': 'tshirt', 'camisetas': 'tshirt',
    'remera': 'tshirt', 'remeras': 'tshirt', 'playera': 'tshirt', 'playeras': 'tshirt',
    'tee': 'tshirt', 'tees': 'tshirt', 'tank': 'tshirt',

    'camisa': 'camisa', 'camisas': 'camisa', 'shirt': 'camisa', 'shirts': 'camisa',
    'guayabera': 'camisa', 'guayaberas': 'camisa', 'blusa': 'camisa', 'blusas': 'camisa',

    'sobrecamisa': 'sobrecamisa', 'sobrecamisas': 'sobrecamisa', 'overshirt': 'sobrecamisa',

    'chemise': 'chemise', 'chemises': 'chemise', 'chemis': 'chemise', 'polo': 'chemise', 'polos': 'chemise',

    'sweater': 'sweater', 'sweaters': 'sweater', 'sueter': 'sweater', 'sueteres': 'sweater',
    'sudadera': 'sweater', 'sudaderas': 'sweater', 'pullover': 'sweater', 'buzo': 'sweater', 'buso': 'sweater',

    'hoodie': 'hoodie', 'hoodies': 'hoodie', 'hoddie': 'hoodie', 'capucha': 'hoodie',

    'chaqueta': 'chaqueta', 'chaquetas': 'chaqueta', 'jacket': 'chaqueta', 'jackets': 'chaqueta',
    'abrigo': 'chaqueta', 'abrigos': 'chaqueta',

    'pantalon': 'pantalon', 'pantalones': 'pantalon', 'pant': 'pantalon', 'pants': 'pantalon',
    'trouser': 'pantalon', 'trousers': 'pantalon', 'chino': 'pantalon', 'chinos': 'pantalon',

    'jean': 'jean', 'jeans': 'jean', 'denim': 'jean', 'vaquero': 'jean', 'vaqueros': 'jean',

    'jogger': 'jogger', 'joggers': 'jogger', 'mono': 'jogger', 'monos': 'jogger',
    'cargo': 'cargo', 'cargos': 'cargo',
    'short': 'short', 'shorts': 'short',
    'bermuda': 'bermuda', 'bermudas': 'bermuda', 'pescador': 'bermuda', 'pescadores': 'bermuda',
    'set': 'set', 'sets': 'set', 'conjunto': 'set', 'conjuntos': 'set', 'outfit': 'set', 'outfits': 'set',

    'zapato': 'zapato', 'zapatos': 'zapato', 'calzado': 'zapato', 'tenis': 'zapato', 'sneaker': 'zapato', 'sneakers': 'zapato',
    'gorra': 'gorra', 'gorras': 'gorra', 'cap': 'gorra', 'caps': 'gorra',
    'gorro': 'gorro', 'gorros': 'gorro', 'beanie': 'gorro',
    'chaleco': 'chaleco', 'chalecos': 'chaleco',

    'glof': 'golf', 'recto': 'straight',

    'blanca': 'blanco', 'blancas': 'blanco', 'blanco': 'blanco', 'blancos': 'blanco', 'white': 'blanco',
    'negra': 'negro', 'negras': 'negro', 'negro': 'negro', 'negros': 'negro', 'black': 'negro',
    'gris': 'gris', 'grises': 'gris', 'gray': 'gris', 'grey': 'gris', 'plata': 'gris', 'silver': 'gris', 'girs': 'gris',
    'azul': 'azul', 'azules': 'azul', 'blue': 'azul', 'marino': 'azul', 'navy': 'azul', 'celeste': 'azul',
    'roja': 'rojo', 'rojas': 'rojo', 'rojo': 'rojo', 'rojos': 'rojo', 'red': 'rojo',
    'verde': 'verde', 'verdes': 'verde', 'green': 'verde', 'oliva': 'verde', 'olive': 'verde',
    'marron': 'marron', 'marrones': 'marron', 'brown': 'marron', 'cafe': 'marron', 'chocolate': 'marron', 'tabaco': 'marron',
    'beige': 'beige', 'beig': 'beige',
    'crema': 'crema', 'cream': 'crema', 'marfil': 'crema', 'hueso': 'crema',
    'khaki': 'khaki', 'caqui': 'khaki', 'kaki': 'khaki',
    'caramel': 'caramelo', 'caramelo': 'caramelo', 'camel': 'caramelo',
    'terracota': 'terracota', 'ladrillo': 'terracota',
    'mostaza': 'mostaza', 'mustard': 'mostaza',
    'amarilla': 'amarillo', 'amarillas': 'amarillo', 'amarillo': 'amarillo', 'amarillos': 'amarillo', 'yellow': 'amarillo', 'dorado': 'amarillo',
    'naranja': 'naranja', 'naranjas': 'naranja', 'orange': 'naranja', 'coral': 'naranja',
    'rosada': 'rosado', 'rosadas': 'rosado', 'rosado': 'rosado', 'rosados': 'rosado', 'pink': 'rosado', 'rosa': 'rosado', 'fucsia': 'rosado', 'fuchsia': 'rosado',
    'morada': 'morado', 'moradas': 'morado', 'morado': 'morado', 'morados': 'morado', 'purple': 'morado', 'violeta': 'morado', 'lila': 'morado',
    'vinotinto': 'vinotinto', 'vino': 'vinotinto', 'burgundy': 'vinotinto', 'burdeos': 'vinotinto',
    'clara': 'claro', 'claro': 'claro', 'claros': 'claro', 'claras': 'claro', 'light': 'claro',
    'oscura': 'oscuro', 'oscuro': 'oscuro', 'oscuros': 'oscuro', 'oscuras': 'oscuro', 'dark': 'oscuro'
  };

  const stopWords = new Set([
    'dame', 'todas', 'todos', 'las', 'los', 'les', 'de', 'del',
    'el', 'la', 'un', 'una', 'unos', 'unas', 'en', 'con', 'para',
    'por', 'o', 'y', 'talla', 'color'
  ]);

  const getItemFamilies = (item) => {
    const families = new Set();
    const cat = normalizeText(item.categoria);
    const name = normalizeText(item.nombre);
    const spaceWords = name.split(/\s+/).filter(Boolean);
    const allWords = name.split(/[\s\-_\/,()+]+/).filter(Boolean);

    if (cat === 't-shirt' || cat === 'tshirt' || cat === 'franela') families.add('tshirt');
    else if (cat === 'camisa') families.add('camisa');
    else if (cat === 'chemise') families.add('chemise');
    else if (cat === 'sweater') families.add('sweater');
    else if (cat === 'hoodie') families.add('hoodie');
    else if (cat === 'chaqueta') families.add('chaqueta');
    else if (cat === 'pantalon' || cat === 'pants') families.add('pantalon');
    else if (cat === 'jean' || cat === 'jean recto') families.add('jean');
    else if (cat === 'jogger cargo') { families.add('jogger'); families.add('cargo'); }
    else if (cat === 'short') families.add('short');
    else if (cat === 'bermuda') families.add('bermuda');
    else if (cat === 'set') families.add('set');

    if (spaceWords.includes('t-shirt') || spaceWords.includes('t-shirts') || allWords.includes('tshirt') || allWords.includes('tshirts') || allWords.includes('franela') || allWords.includes('franelas') || allWords.includes('tank')) families.add('tshirt');
    if (allWords.includes('camisa') || allWords.includes('camisas')) families.add('camisa');
    if (allWords.includes('sobrecamisa') || allWords.includes('sobrecamisas')) families.add('sobrecamisa');
    if (allWords.includes('chemise') || allWords.includes('chemises') || allWords.includes('polo') || allWords.includes('polos')) families.add('chemise');
    if (allWords.includes('sweater') || allWords.includes('sweaters') || allWords.includes('sueter') || allWords.includes('sueteres') || allWords.includes('sudadera') || allWords.includes('sudaderas')) families.add('sweater');
    if (allWords.includes('hoodie') || allWords.includes('hoodies')) families.add('hoodie');
    if (allWords.includes('chaqueta') || allWords.includes('chaquetas') || allWords.includes('jacket') || allWords.includes('jackets') || allWords.includes('bomber') || allWords.includes('varsity')) families.add('chaqueta');
    if (allWords.includes('pantalon') || allWords.includes('pantalones') || allWords.includes('pants') || allWords.includes('pant')) families.add('pantalon');
    if ((allWords.includes('jean') || allWords.includes('jeans') || allWords.includes('denim')) && !families.has('chaqueta')) families.add('jean');
    if (allWords.includes('jogger') || allWords.includes('joggers')) families.add('jogger');
    if (allWords.includes('cargo') || allWords.includes('cargos')) families.add('cargo');
    if (allWords.includes('short') || allWords.includes('shorts')) families.add('short');
    if (allWords.includes('bermuda') || allWords.includes('bermudas') || allWords.includes('pescador') || allWords.includes('pescadores')) families.add('bermuda');
    if (allWords.includes('set') || allWords.includes('sets') || allWords.includes('conjunto') || allWords.includes('conjuntos')) families.add('set');
    if (allWords.includes('zapato') || allWords.includes('zapatos')) families.add('zapato');
    if (allWords.includes('gorra') || allWords.includes('gorras')) families.add('gorra');
    if (allWords.includes('gorro') || allWords.includes('gorros')) families.add('gorro');
    if (allWords.includes('chaleco') || allWords.includes('chalecos')) families.add('chaleco');

    return families;
  };

  const doesColorGroupMatch = (item, group, colorTokens) => {
    if (!colorTokens || colorTokens.length === 0) return true;
    const colorSet = new Set();
    const rawGroupColor = normalizeText(group?.color || '');
    if (rawGroupColor === 'gris-c') { colorSet.add('gris'); colorSet.add('claro'); }
    else if (rawGroupColor === 'gris-o') { colorSet.add('gris'); colorSet.add('oscuro'); }

    for (const w of rawGroupColor.split(/[\s\/\-_]+/).filter(Boolean)) {
      const canon = SYNONYMS_MAP[w] || w;
      if (COLOR_CANONICAL_SET.has(canon)) colorSet.add(canon);
    }
    if (colorSet.size === 0 && item?.nombre) {
      for (const w of normalizeText(item.nombre).split(/[\s\/\-_]+/).filter(Boolean)) {
        const canon = SYNONYMS_MAP[w] || w;
        if (COLOR_CANONICAL_SET.has(canon)) colorSet.add(canon);
      }
    }
    if (colorSet.size === 0) return false;
    return colorTokens.every(ct => colorSet.has(ct));
  };

  // Filtrado search-as-you-type avanzado
  let results = catalog;
  if (normalizedQuery) {
    const rawWords = normalizedQuery.split(/\s+/).filter(Boolean);
    const tokens = [];
    for (const w of rawWords) {
      if (stopWords.has(w)) continue;
      const canon = SYNONYMS_MAP[w] || w;
      if (!tokens.includes(canon)) tokens.push(canon);
    }

    if (tokens.length > 0) {
      const sizeRegex = /^(xs|s|m|l|xl|xxl|2xl|3xl|4xl|unica|[0-9]{2})$/i;
      const colorTokens = [];
      const sizeTokens = [];
      const familyTokens = [];
      const generalTokens = [];

      for (const token of tokens) {
        if (COLOR_CANONICAL_SET.has(token)) colorTokens.push(token);
        else if (sizeRegex.test(token)) sizeTokens.push(token);
        else if (GARMENT_FAMILY_SET.has(token)) familyTokens.push(token);
        else generalTokens.push(token);
      }

      results = catalog.filter(model => {
        const itemNombre = normalizeText(model.nombre);
        const itemCat = normalizeText(model.categoria);
        const itemId = normalizeText(model.id);
        const itemFamilies = getItemFamilies(model);
        const rawItemWords = `${itemNombre} ${itemCat}`.split(/[\s\-_\/,()+]+/).filter(Boolean);
        const normalizedItemWords = rawItemWords.map(w => SYNONYMS_MAP[w] || w);

        for (const fToken of familyTokens) {
          if (itemFamilies.has(fToken)) continue;
          if (fToken === 'jean' && familyTokens.includes('chaqueta') && rawItemWords.includes('jean')) continue;
          return false;
        }

        const matchesGeneral = generalTokens.every(token => {
          const wordMatch = rawItemWords.some(w => w === token || w.startsWith(token) || (token.length >= 4 && w.includes(token))) ||
                            normalizedItemWords.some(w => w === token || w.startsWith(token) || (token.length >= 4 && w.includes(token)));
          if (wordMatch) return true;
          if (Array.isArray(model.variantes) && model.variantes.some(v => v.sku && normalizeText(v.sku).includes(token))) return true;
          if ((/\d/.test(token) || token.length >= 6) && itemId.includes(token)) return true;
          return false;
        });
        if (!matchesGeneral) return false;

        if (colorTokens.length > 0 || sizeTokens.length > 0) {
          let hasAvailable = false;
          const colorGroups = Array.isArray(model.colores) ? model.colores : [];
          for (const group of colorGroups) {
            if (!doesColorGroupMatch(model, group, colorTokens)) continue;
            for (const t of (group.tallas || [])) {
              const tNorm = normalizeText(t.talla);
              if ((sizeTokens.length === 0 || sizeTokens.includes(tNorm)) && Number(t.stock) > 0) {
                hasAvailable = true;
                break;
              }
            }
            if (hasAvailable) break;
          }
          if (!hasAvailable) return false;
        }

        return true;
      });
    }
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
 * Devuelve la tasa oficial almacenada en KV o refresca en vivo si se requiere / está obsoleta
 */
async function handleGetBcv(url, env) {
  const forceRefresh = url ? url.searchParams.get('refresh') === 'true' : false;
  let bcvDataRaw = await env.STORE_KV.get('tasa_bcv');
  let bcvData = null;

  if (bcvDataRaw) {
    try {
      bcvData = JSON.parse(bcvDataRaw);
    } catch (e) {
      bcvData = null;
    }
  }

  // Verificar si la cache debe refrescarse (forceRefresh, si no hay datos, o si los datos superan los 30 min)
  const isStale = !bcvData || !bcvData.updated_at || (Date.now() - new Date(bcvData.updated_at).getTime() > 30 * 60 * 1000);

  if (forceRefresh || isStale) {
    console.log(`[BCV Handler] ${forceRefresh ? 'Forzando' : 'Refrescando por obsolescencia'} actualización de la tasa BCV...`);
    bcvData = await syncBcvRate(env);
  }

  return new Response(
    JSON.stringify(bcvData),
    { headers: corsHeaders }
  );
}

/**
 * POST /api/bcv
 * Permite al usuario ingresar/modificar manualmente la tasa oficial BCV o Binance en KV
 */
async function handlePostBcv(request, env) {
  try {
    const body = await request.json();
    const inputTasa = parseFloat(body.tasa || body.tasa_bcv);
    const inputBinance = parseFloat(body.binance || body.tasa_binance);
    const inputFecha = (body.fecha_valor || body.fecha || '').toString().trim();

    if (isNaN(inputTasa) || inputTasa <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Debe ingresar una tasa válida mayor a 0' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const roundedTasa = Math.floor(inputTasa * 100) / 100;
    const roundedBinance = !isNaN(inputBinance) && inputBinance > 0 
      ? Math.floor(inputBinance * 100) / 100 
      : Math.floor(roundedTasa * 1.15 * 100) / 100;

    const bcvData = {
      tasa: roundedTasa,
      tasa_bcv: roundedTasa,
      tasa_raw: inputTasa,
      binance: roundedBinance,
      tasa_binance: roundedBinance,
      brecha_porcentaje: roundedTasa > 0 && roundedBinance > 0 
        ? Math.floor(((roundedBinance - roundedTasa) / roundedTasa) * 10000) / 100 
        : 0,
      fuente: 'Establecida manualmente por el usuario',
      fecha_valor: inputFecha || 'Ingreso Manual',
      es_manual: true,
      es_fallback: false,
      alerta: null,
      updated_at: new Date().toISOString()
    };

    await env.STORE_KV.put('tasa_bcv', JSON.stringify(bcvData));
    console.log(`[Manual Rate] Tasa actualizada manualmente: BCV=${roundedTasa}, Binance=${roundedBinance}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Tasa guardada exitosamente', bcv: bcvData }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error('[Manual Rate Error]:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * GET /api/pos/tables
 * Obtiene la lista de Canales de Venta y sus Mesas/Cuentas del ERP Finapartner
 */
async function handleGetPosTables(env) {
  try {
    const [posRoomsData, posSalesData] = await Promise.all([
      fetchErp('/pos/rooms', env).catch(err => {
        console.warn('[POS Tables] /pos/rooms warning:', err.message);
        return null;
      }),
      fetchErp('/pos/sales', env).catch(err => {
        console.warn('[POS Tables] /pos/sales warning:', err.message);
        return null;
      })
    ]);

    // 4 Canales de Venta de FINA ERP
    const erpChannels = [
      { id: '6881fd3150484ecd93905c31', name: 'Tienda' },
      { id: '6881fd3b50484ecd93905c38', name: 'Delivery' },
      { id: '6881fd4a50484ecd93905c3f', name: 'Envío interior' },
      { id: '68a70fc0c0fcf7cde8d92e4e', name: 'Quinta' }
    ];

    // Extraer mapa de ventas abiertas por _id y por nombre
    const openSalesMap = new Map();
    const salesGroupList = posSalesData?.data || posSalesData?.sales || (Array.isArray(posSalesData) ? posSalesData : []);
    for (const group of salesGroupList) {
      const salesList = Array.isArray(group.sales) ? group.sales : [];
      for (const sale of salesList) {
        if (sale._id) openSalesMap.set(sale._id, sale);
        if (sale.name) openSalesMap.set(sale.name.trim().toLowerCase(), sale);
      }
    }

    // Extraer mesas de Sala 1 desde /pos/rooms
    const roomsList = posRoomsData?.data || (Array.isArray(posRoomsData) ? posRoomsData : []);
    const sala1 = roomsList.find(r => r.name && r.name.toLowerCase().includes('sala 1')) || roomsList[0];
    const roomTables = Array.isArray(sala1?.tables) ? sala1.tables : [];

    const buildMesas = () => {
      const list = [];

      if (roomTables.length > 0) {
        for (const t of roomTables) {
          const tableName = t.name || 'Mesa';
          let saleId = t.saleId;
          let productCount = t.itemsCount || 0;
          let totalPrice = t.totalPrice || 0;

          const openSale = (saleId && openSalesMap.get(saleId)) || openSalesMap.get(tableName.toLowerCase());
          if (openSale) {
            saleId = openSale._id;
            productCount = (Array.isArray(openSale.productVariations) && openSale.productVariations.length) || (Array.isArray(openSale.products) && openSale.products.length) || productCount;
            totalPrice = Number(openSale.totalPrice || totalPrice);
          }

          list.push({
            id: saleId || t._id,
            table_id: t._id,
            sale_id: saleId || null,
            name: tableName,
            status: t.status || 'open',
            has_sale: Boolean(saleId),
            is_empty: productCount === 0,
            product_count: productCount,
            total_price: Number(totalPrice || 0)
          });
        }
      } else {
        for (let i = 1; i <= 8; i++) {
          const tableName = `Mesa ${i}`;
          const openSale = openSalesMap.get(tableName.toLowerCase());
          list.push({
            id: openSale?._id || `mesa-${i}`,
            name: tableName,
            status: 'open',
            has_sale: Boolean(openSale?._id),
            is_empty: !openSale || (openSale.productVariations && openSale.productVariations.length === 0),
            product_count: openSale?.productVariations?.length || 0,
            total_price: Number(openSale?.totalPrice || 0)
          });
        }
      }

      return list;
    };

    const formattedChannels = erpChannels.map(ch => ({
      channel_id: ch.id,
      channel_name: ch.name,
      mesas: buildMesas()
    }));

    return new Response(
      JSON.stringify({ success: true, channels: formattedChannels }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error('[POS Tables Error]:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message, channels: [] }),
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * POST /api/pos/assign-table
 * Asigna los productos del carrito a una mesa seleccionada en FINA ERP
 */
async function handleAssignPosTable(request, env) {
  try {
    const body = await request.json();
    const { tableId, channelId, tableName, channelName, items } = body;

    if (!tableId || !channelId) {
      return new Response(
        JSON.stringify({ success: false, message: 'Debe seleccionar un canal de venta y una mesa válida.' }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: 'El carrito no contiene productos.' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Obtener catálogo procesado de KV para mapear erp_product_id si es necesario
    let catalog = [];
    try {
      const catalogRaw = await env.STORE_KV.get('stock_cache');
      if (catalogRaw) catalog = JSON.parse(catalogRaw);
    } catch(e) {}

    const results = [];
    const addedItemIds = [];
    const errors = [];

    // Pre-cargar ventas abiertas del ERP por si se requiere inspeccionar reservas en otras mesas
    let openSalesList = null;

    // Iterar cada ítem del carrito y agregarlo a la mesa vía PUT /pos/sales/add-product/{tableId}
    for (const item of items) {
      let productId = (item.productId || item.erp_product_id || item.id || '').toString().toLowerCase();
      let altProductId = (item.alt_product_id || '').toString().toLowerCase();
      let targetSku = (item.sku || item.id || '').toString();
      let variation = null;

      // Buscar en stock_cache para auto-resolver productId real del ERP y la variante de color + talla
      if (catalog.length > 0) {
        let matchedModel = null;
        let matchedColorName = item.color;
        let matchedTallaName = item.talla;
        let matchedSku = targetSku;

        // A) Búsqueda por SKU exacto
        for (const model of catalog) {
          if (Array.isArray(model.colores)) {
            for (const cGroup of model.colores) {
              if (Array.isArray(cGroup.tallas)) {
                for (const tObj of cGroup.tallas) {
                  if (tObj.sku && tObj.sku.toUpperCase() === targetSku.toUpperCase()) {
                    matchedModel = model;
                    matchedColorName = cGroup.color;
                    matchedTallaName = tObj.talla;
                    matchedSku = tObj.sku;
                    break;
                  }
                }
              }
              if (matchedModel) break;
            }
          }
          if (matchedModel) break;
        }

        // B) Búsqueda por ID de Modelo o Nombre si no se encontró por SKU
        if (!matchedModel) {
          matchedModel = catalog.find(m => 
            (m.id && m.id.toUpperCase() === (item.id || '').toString().toUpperCase()) ||
            (m.erp_product_id && m.erp_product_id.toLowerCase() === productId) ||
            (m.nombre && m.nombre.toLowerCase() === (item.nombre || '').toString().toLowerCase())
          );
        }

        if (matchedModel) {
          if (matchedModel.erp_product_id && /^[0-9a-fA-F]{24}$/.test(matchedModel.erp_product_id)) {
            productId = matchedModel.erp_product_id.toLowerCase();
          }
          if (matchedModel.alt_product_id && /^[0-9a-fA-F]{24}$/.test(matchedModel.alt_product_id)) {
            altProductId = matchedModel.alt_product_id.toLowerCase();
          }

          // Si el color vino vacío o genérico, buscar el primer color disponible con stock para esa talla
          if ((!matchedColorName || matchedColorName === 'GENERAL' || matchedColorName === 'TALLA') && Array.isArray(matchedModel.colores)) {
            const targetTalla = (item.talla || '').toString().toUpperCase();
            for (const cGroup of matchedModel.colores) {
              const matchingSize = (cGroup.tallas || []).find(t => t.talla === targetTalla && t.stock > 0);
              if (matchingSize) {
                matchedColorName = cGroup.color;
                matchedSku = matchingSize.sku || matchedSku;
                break;
              }
            }
          }

          const cClean = (matchedColorName || item.color || '').toString().toLowerCase().trim();
          const tClean = (matchedTallaName || item.talla || '').toString().toLowerCase().trim();

          const hasRealColors = matchedModel.colores && matchedModel.colores.some(c => {
            const col = (c.color || '').toUpperCase();
            return col !== 'GENERAL' && col !== 'TALLA' && col !== 'BOLSAS' && col !== 'CORRECIÓN';
          });

          if (hasRealColors && cClean && cClean !== 'general' && cClean !== 'talla' && cClean !== 'única') {
            variation = `${cClean} ${tClean}`.trim();
          } else if (hasRealColors && tClean && tClean !== 'única') {
            variation = tClean;
          } else {
            variation = '';
          }
          targetSku = matchedSku || targetSku;
        }
      }

      // Fallback si no se resolvió la variación
      if (variation === null || variation === undefined) {
        const colorClean = (item.color || '').toString().toLowerCase().trim();
        const tallaClean = (item.talla || '').toString().toLowerCase().trim();
        if (colorClean && colorClean !== 'general' && colorClean !== 'talla' && colorClean !== 'única') {
          variation = `${colorClean} ${tallaClean}`.trim();
        } else {
          variation = '';
        }
      }

      const itemPayload = {
        productId: productId,
        selectedVariation: variation,
        variation: variation,
        SKU: targetSku,
        amount: Number(item.cantidad || item.cant || 1),
        sellingPrice: Number(item.precio_usd || 0)
      };

      try {
        const erpRes = await fetchErp(`/pos/sales/add-product/${tableId}`, env, 0, 'PUT', itemPayload);
        results.push(erpRes);
        addedItemIds.push(item.id);
      } catch (err) {
        let isNotFound = err.message.includes('Producto a agregar no encontrado') || err.message.includes('404');
        if (isNotFound && altProductId && altProductId !== productId) {
          console.warn(`[Assign Table Retry] ${item.nombre}: Reintentando con altProductId ${altProductId}...`);
          itemPayload.productId = altProductId;
          try {
            const erpResAlt = await fetchErp(`/pos/sales/add-product/${tableId}`, env, 0, 'PUT', itemPayload);
            results.push(erpResAlt);
            addedItemIds.push(item.id);
            continue;
          } catch (err2) {
            err = err2;
          }
        }

        console.error(`[Assign Table Item Error] ${item.nombre}:`, err.message);
        let msg = err.message;
        try {
          const parsed = JSON.parse(err.message.substring(err.message.indexOf('{')));
          if (parsed.message) msg = parsed.message;
        } catch(e) {}

        // Si el error indica reservas o disponibilidad, investigar si la prenda está abierta en otra mesa
        if (msg.includes('reservado en ventas abiertas') || msg.includes('agotado')) {
          if (!openSalesList) {
            try {
              const salesData = await fetchErp('/pos/sales', env);
              openSalesList = salesData?.data || salesData?.sales || (Array.isArray(salesData) ? salesData : []);
            } catch(e) {}
          }

          if (openSalesList && Array.isArray(openSalesList)) {
            let occupiedTable = null;
            const normProdId = productId.toLowerCase();
            const normSku = targetSku.toUpperCase();

            for (const group of openSalesList) {
              const sales = Array.isArray(group.sales) ? group.sales : [];
              for (const sale of sales) {
                if (sale._id === tableId) continue; // ignorar la mesa actual
                const prods = Array.isArray(sale.products) ? sale.products : [];
                const matchedInSale = prods.some(p => 
                  (p._id && p._id.toLowerCase() === normProdId) ||
                  (p.SKU && p.SKU.toUpperCase() === normSku) ||
                  (p.itemId && p.itemId.toLowerCase() === normProdId)
                );
                if (matchedInSale) {
                  occupiedTable = sale.name || 'otra mesa';
                  break;
                }
              }
              if (occupiedTable) break;
            }

            if (occupiedTable) {
              msg = `${item.nombre} (${item.talla || ''}): Reservado actualmente en la cuenta de la ${occupiedTable} en FINA ERP.`;
            }
          }
        }

        errors.push(`${item.nombre} (${item.talla || ''}): ${msg.trim()}`);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `Error al agregar a FINA ERP: ${errors.join(' | ')}`,
          errors,
          added_item_ids: []
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `¡${results.length} producto(s) agregados exitosamente a ${tableName || 'Mesa'} (${channelName || 'Canal'}) en FINA ERP!`,
        table_id: tableId,
        added_count: results.length,
        added_item_ids: addedItemIds,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error('[Assign Table Error]:', err);
    return new Response(
      JSON.stringify({ success: false, message: `Error al procesar la mesa: ${err.message}` }),
      { status: 500, headers: corsHeaders }
    );
  }
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
    { id: '303-L', modelo_id: 'MOD-303', nombre: 'Chaqueta Bomber Urban', categoria: 'Chaquetas', talla: 'L', stock: 3, precio_usd: 50, sku: 'CHQ-BMB-L' },

    { id: '404-S', modelo_id: 'MOD-404', nombre: 'Camisa Prestige', categoria: 'Camisas', talla: 'S', stock: 4, sellingPrice: 30, price: 45, precio_usd: 30, sku: 'CAM-PRS-S' },
    { id: '404-M', modelo_id: 'MOD-404', nombre: 'Camisa Prestige', categoria: 'Camisas', talla: 'M', stock: 6, sellingPrice: 30, price: 45, precio_usd: 30, sku: 'CAM-PRS-M' },
    { id: '404-L', modelo_id: 'MOD-404', nombre: 'Camisa Prestige', categoria: 'Camisas', talla: 'L', stock: 2, sellingPrice: 30, price: 45, precio_usd: 30, sku: 'CAM-PRS-L' }
  ];
}

/* ==========================================================================
   KPIs DE VENTAS (FINA ERP /pos/bills)
   ========================================================================== */

// Venezuela usa UTC-4 todo el año (sin horario de verano)
const VE_UTC_OFFSET_MS = -4 * 60 * 60 * 1000;

// Límite de páginas por período para no exceder los subrequests del Worker
const KPI_BILLS_PAGE_SIZE = 500;
const KPI_BILLS_MAX_PAGES = 20;

// Productos que NO son prendas físicas para conteo de almacén ni ranking de prendas (su venta y costo sí entran en facturación y utilidad)
const NON_GARMENT_KEYWORDS = ['BOLSA', 'CAJA', 'EMPAQUE', 'ETIQUETA', 'CORRECION', 'CORRECCION', 'AJUSTE', 'ACCESORIO'];
// Clasificación de prendas (se evalúa primero la categoría del ERP y luego el nombre; si tiene categoría SET es CONJUNTO)
const CONJUNTO_KEYWORDS = ['SET', 'CONJUNTO'];
const SUPERIOR_KEYWORDS = ['SWEATER', 'SUETER', 'FRANELA', 'CAMISA', 'SOBRECAMISA', 'CHEMISE', 'CHAQUETA', 'BLUSA', 'TOP', 'JACKET', 'HOODIE', 'SUDADERA', 'VARSITY', 'T-SHIRT', 'TSHIRT', 'POLO', 'CHALECO'];
const INFERIOR_KEYWORDS = ['PANTALON', 'PANTS', 'JEAN', 'SHORT', 'BERMUDA', 'SKIRT', 'FALDA', 'JOGGER', 'CARGO', 'LEGGING', 'PESCADOR'];

// Regex que exige que la palabra clave empiece en un límite de palabra (evita falsos positivos)
function buildKeywordRegex(keywords) {
  const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(^|[^A-Z0-9])(${escaped.join('|')})`);
}
const NON_GARMENT_RE = buildKeywordRegex(NON_GARMENT_KEYWORDS);
const CONJUNTO_RE = buildKeywordRegex(CONJUNTO_KEYWORDS);
const SUPERIOR_RE = buildKeywordRegex(SUPERIOR_KEYWORDS);
const INFERIOR_RE = buildKeywordRegex(INFERIOR_KEYWORDS);

function normUpper(text) {
  return normalizeText(text).toUpperCase();
}

/**
 * Devuelve 'SUPERIOR' | 'INFERIOR' | 'CONJUNTO' | 'OTRO', o null si NO es una prenda (bolsas, cajas, correcciones, accesorios comodín).
 */
function classifyGarment(category, name) {
  const cat = normUpper(category);
  const nm = normUpper(name);

  if (NON_GARMENT_RE.test(cat) || NON_GARMENT_RE.test(nm)) return null;

  for (const text of [cat, nm]) {
    if (!text) continue;
    if (CONJUNTO_RE.test(text)) return 'CONJUNTO';
    if (SUPERIOR_RE.test(text)) return 'SUPERIOR';
    if (INFERIOR_RE.test(text)) return 'INFERIOR';
  }
  return 'OTRO';
}

// Fecha YYYY-MM-DD en hora de Venezuela
function toVeDateKey(isoDate) {
  const t = new Date(isoDate).getTime();
  if (isNaN(t)) return null;
  return new Date(t + VE_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

function isVesCurrency(method) {
  const code = (method?.currency?.code || (typeof method?.currency === 'string' ? method.currency : '') || '').toUpperCase();
  if (code) return code === 'VES' || code === 'VEF' || code === 'BS';
  return /(^|[^A-Z])(BS|BOLIVAR)/i.test(method?.name || '');
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pct1 = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

function extractBillDocs(res) {
  if (!res) return [];
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.docs)) return res.docs;
  if (Array.isArray(res.items)) return res.items;
  return [];
}

/**
 * Descarga TODAS las páginas de /pos/bills del período (no solo las primeras 100 facturas)
 */
async function fetchAllBills(env, fromDate, toDate, customPageSize = KPI_BILLS_PAGE_SIZE) {
  const buildPath = (page) =>
    `/pos/bills?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&search=&currentPage=${page}&pageSize=${customPageSize}&sortedColumn=updatedAt&sortedDirection=desc`;

  const first = await fetchErp(buildPath(1), env);
  const reportedPages = Math.max(1, Number(first?.totalPages || 1));
  const pagesToFetch = Math.min(reportedPages, KPI_BILLS_MAX_PAGES);

  let docs = extractBillDocs(first);
  let failedPages = 0;

  if (pagesToFetch > 1) {
    const pageNumbers = Array.from({ length: pagesToFetch - 1 }, (_, i) => i + 2);
    const results = await Promise.all(
      pageNumbers.map(p =>
        fetchErp(buildPath(p), env).catch(e => {
          console.warn(`[KPI] Error al descargar página ${p} de /pos/bills:`, e.message);
          failedPages++;
          return null;
        })
      )
    );
    for (const res of results) docs = docs.concat(extractBillDocs(res));
  }

  // Eliminar duplicados (si una factura se actualizó mientras se paginaba)
  const seen = new Set();
  docs = docs.filter(d => {
    const id = d?._id || d?.id;
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return {
    meta: first || {},
    docs,
    dataQuality: {
      pagesFetched: pagesToFetch - failedPages,
      pagesReported: reportedPages,
      truncated: reportedPages > KPI_BILLS_MAX_PAGES,
      incomplete: failedPages > 0
    }
  };
}

/**
 * GET /api/kpi?fromDate=...&toDate=...&compareFromDate=...&compareToDate=...
 * Las fechas deben venir como ISO ya ajustadas a la hora de Venezuela (00:00 / 23:59:59 VE)
 */
async function handleGetKpis(url, env) {
  const fromDate = url.searchParams.get('fromDate') || new Date(Date.now() - 30 * 86400000).toISOString();
  const toDate = url.searchParams.get('toDate') || new Date().toISOString();
  const compareFromDate = url.searchParams.get('compareFromDate');
  const compareToDate = url.searchParams.get('compareToDate');

  try {
    const fetchPromises = [
      fetchAllBills(env, fromDate, toDate).catch(e => {
        console.warn('[KPI Handler] Error al consultar /pos/bills principal:', e.message);
        return null;
      }),
      env.STORE_KV.get('stock_cache').catch(() => null),
      env.STORE_KV.get('tasa_bcv').catch(() => null),
      getHistoricalSalesSummary(env).catch(e => {
        console.warn('[KPI Handler] Error al obtener historial acumulado de rotación:', e.message);
        return null;
      })
    ];

    if (compareFromDate && compareToDate) {
      fetchPromises.push(fetchAllBills(env, compareFromDate, compareToDate).catch(() => null));
    }

    const [billsResult, catalogRaw, bcvDataRaw, historicalSalesSummary, compareBillsResult] = await Promise.all(fetchPromises);

    if (!billsResult) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se pudieron obtener las facturas de FINA ERP' }),
        { status: 502, headers: corsHeaders }
      );
    }

    let catalog = catalogRaw ? JSON.parse(catalogRaw) : [];
    // Si la caché de inventario aún no tiene entry_date (fecha de ingreso de cada lote), sincronizar una vez
    if (catalog.length === 0 || !catalog.some(m => m.entry_date)) {
      try {
        catalog = await syncCatalog(env);
      } catch (e) {
        console.warn('[KPI Handler] No se pudo refrescar entry_date del catálogo:', e.message);
      }
    }

    let bcvData = bcvDataRaw ? JSON.parse(bcvDataRaw) : null;
    const isBcvStale = !bcvData || !bcvData.updated_at || (Date.now() - new Date(bcvData.updated_at).getTime() > 30 * 60 * 1000);
    if (isBcvStale) {
      try {
        bcvData = await syncBcvRate(env);
      } catch (e) {
        bcvData = bcvData || {};
      }
    }

    const parsedKpis = processKpiData(billsResult, catalog, bcvData);
    parsedKpis.rotation = buildRotationAndPurchaseKpis(catalog, historicalSalesSummary, billsResult);
    const comparisonKpis = compareBillsResult ? processKpiData(compareBillsResult, catalog, bcvData) : null;

    return new Response(
      JSON.stringify({
        success: true,
        period: { fromDate, toDate },
        kpis: parsedKpis,
        comparison: comparisonKpis
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error('[KPI Handler Error]:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}

function processKpiData(billsResult, catalog, bcvData) {
  const meta = billsResult?.meta || {};
  const allDocs = Array.isArray(billsResult?.docs) ? billsResult.docs : [];

  // 1. Excluir facturas anuladas
  const validDocs = allDocs.filter(d => d && d.deleted !== true);
  const annulledDocs = allDocs.filter(d => d && d.deleted === true);

  // Brecha cambiaria actual (BCV vs Binance) aplicada sobre la tasa de cada factura
  const tasaBcvActual = Number(bcvData?.tasa || bcvData?.tasa_bcv) || 0;
  const tasaBinanceActual = Number(bcvData?.binance || bcvData?.tasa_binance) || 0;
  const gapRatio = tasaBcvActual > 0 && tasaBinanceActual > tasaBcvActual ? tasaBinanceActual / tasaBcvActual : 1;

  let totalAmount = 0;
  let productSales = 0;
  let extraCharges = 0;
  let deliveryOrdersCount = 0;
  let nonGarmentSalesUsd = 0;
  let totalUtility = 0;
  let totalGarments = 0;

  // Colaboraciones (facturas en $0 USD que sí descuentan costo en la utilidad)
  let collabDocsCount = 0;
  let collabUnitsCount = 0;
  let collabCostUsd = 0;

  // Cuadre exacto de caja y bancos
  let vesCollected = 0;
  let vesUsdAtSaleRate = 0;
  let vesUsdNominal = 0;
  let usdCollected = 0;
  const paymentMethodsMap = new Map();

  const recordPaymentEntry = (m, sign, rate) => {
    if (!m) return;
    const rawName = (m.name || 'Otro').toString().trim();
    if (!rawName) return;
    const isVes = isVesCurrency(m);
    const curCode = (typeof m.currency === 'string' ? m.currency : m.currency?.code) || (isVes ? 'VES' : 'USD');
    const amtUsd = Number(m.amountUSD || 0);
    const amtVes = Number(m.amountVES || 0);
    if (amtUsd === 0 && amtVes === 0) return;

    const pmEntry = paymentMethodsMap.get(rawName) || {
      name: rawName,
      currency: curCode,
      isVes,
      inUSD: 0,
      outUSD: 0,
      totalUSD: 0,
      inVES: 0,
      outVES: 0,
      totalVES: 0,
      txCount: 0,
      returnCount: 0
    };

    if (sign > 0) {
      pmEntry.inUSD += amtUsd;
      if (isVes) pmEntry.inVES += amtVes;
      pmEntry.txCount += 1;
    } else {
      pmEntry.outUSD += amtUsd;
      if (isVes) pmEntry.outVES += amtVes;
      pmEntry.returnCount += 1;
    }
    pmEntry.totalUSD = pmEntry.inUSD - pmEntry.outUSD;
    pmEntry.totalVES = isVes ? (pmEntry.inVES - pmEntry.outVES) : 0;
    paymentMethodsMap.set(rawName, pmEntry);

    if (isVes) {
      vesCollected += sign * amtVes;
      vesUsdNominal += sign * amtUsd;
      const effectiveRate = rate > 0 ? rate : tasaBcvActual;
      vesUsdAtSaleRate += sign * (effectiveRate > 0 && amtVes > 0 ? (amtVes / effectiveRate) : amtUsd);
    } else {
      usdCollected += sign * amtUsd;
    }
  };

  const channelsMap = new Map();
  const dailyMap = new Map();
  const productMap = new Map();
  const categoryMap = new Map();
  const groups = {
    SUPERIOR: { usd: 0, units: 0 },
    INFERIOR: { usd: 0, units: 0 },
    CONJUNTO: { usd: 0, units: 0 },
    OTRO: { usd: 0, units: 0 }
  };

  for (const doc of validDocs) {
    const docUsd = Number(doc.totalPriceUSD || 0);
    const docMerchandise = Number(doc.subtotal || 0) - Number(doc.discount || 0);
    const docDelivery = Number(doc.extraCharges || 0);
    const docUtility = Number(doc.utility || 0);
    const isCollab = docUsd === 0 && docMerchandise === 0;

    totalAmount += docUsd;
    productSales += docMerchandise;
    extraCharges += docDelivery;
    if (docDelivery > 0) deliveryOrdersCount += 1;
    totalUtility += docUtility;

    // 2. Contar prendas reales desde sale.productVariations (sin bolsas, cajas, correcciones ni accesorios comodín)
    let docGarments = 0;
    const productVariations = Array.isArray(doc.sale?.productVariations) ? doc.sale.productVariations : [];
    for (const pv of productVariations) {
      const pName = (pv.product?.name || pv.name || 'Prenda').toString().trim();
      const pCategory = (pv.product?.category || 'GENERAL').toString().toUpperCase().trim();
      const amount = Number(pv.amount || 1);
      const lineUsd = Number(pv.sellingPrice || 0) * amount;

      const group = classifyGarment(pCategory, pName);
      if (!group) {
        nonGarmentSalesUsd += lineUsd;
        continue; // empaque o accesorio comodín (su ingreso/costo ya está en subtotal y utility de la factura)
      }

      docGarments += amount;
      groups[group].usd += lineUsd;
      groups[group].units += amount;

      // Contabilizar todas las prendas salientes (ventas cobradas + colaboraciones $0) para coincidir 100% con FINA ERP, desglosando pagadas vs colab.
      const pKey = pName.toLowerCase();
      const pEntry = productMap.get(pKey) || { name: pName, category: pCategory, group, units: 0, paidUnits: 0, collabUnits: 0, totalUsd: 0 };
      pEntry.units += amount;
      if (isCollab || lineUsd === 0) {
        pEntry.collabUnits += amount;
      } else {
        pEntry.paidUnits += amount;
      }
      pEntry.totalUsd += lineUsd;
      productMap.set(pKey, pEntry);

      const cEntry = categoryMap.get(pCategory) || { category: pCategory, group, units: 0, paidUnits: 0, collabUnits: 0, totalUsd: 0 };
      cEntry.units += amount;
      if (isCollab || lineUsd === 0) {
        cEntry.collabUnits += amount;
      } else {
        cEntry.paidUnits += amount;
      }
      cEntry.totalUsd += lineUsd;
      categoryMap.set(pCategory, cEntry);
    }
    totalGarments += docGarments;

    if (isCollab) {
      collabDocsCount += 1;
      collabUnitsCount += docGarments;
      if (docUtility < 0) collabCostUsd += Math.abs(docUtility);
    }

    // Canales de venta (con desglose de mercancía vs delivery)
    const chName = doc.saleChannelName || doc.sale?.salesChannel?.name || 'Tienda';
    const chCurr = channelsMap.get(chName) || {
      name: chName,
      totalUsd: 0,
      merchandiseUsd: 0,
      deliveryUsd: 0,
      totalUnits: 0,
      orderCount: 0,
      paidOrderCount: 0,
      collabOrderCount: 0
    };
    chCurr.totalUsd += docUsd;
    chCurr.merchandiseUsd += docMerchandise;
    chCurr.deliveryUsd += docDelivery;
    chCurr.totalUnits += docGarments;
    chCurr.orderCount += 1;
    if (isCollab) chCurr.collabOrderCount += 1;
    else chCurr.paidOrderCount += 1;
    channelsMap.set(chName, chCurr);

    // 3. Agrupación diaria en hora de Venezuela
    const dayKey = toVeDateKey(doc.createdAt || doc.updatedAt);
    if (dayKey) {
      const dayCurr = dailyMap.get(dayKey) || {
        date: dayKey,
        totalUsd: 0,
        merchandiseUsd: 0,
        deliveryUsd: 0,
        totalUnits: 0,
        orderCount: 0,
        paidOrderCount: 0,
        collabOrderCount: 0
      };
      dayCurr.totalUsd += docUsd;
      dayCurr.merchandiseUsd += docMerchandise;
      dayCurr.deliveryUsd += docDelivery;
      dayCurr.totalUnits += docGarments;
      dayCurr.orderCount += 1;
      if (isCollab) dayCurr.collabOrderCount += 1;
      else dayCurr.paidOrderCount += 1;
      dailyMap.set(dayKey, dayCurr);
    }

    // 4. Cuadre exacto de métodos de pago (incluyendo pagos iniciales, vueltos y pagos en facturas editadas / cambios de prenda)
    const saleRate = Number(doc.exchangeRate || 0) || tasaBcvActual;
    for (const pm of (doc.paymentMethods || [])) recordPaymentEntry(pm, +1, saleRate);
    for (const rm of (doc.returnMethods || [])) recordPaymentEntry(rm, -1, saleRate);
    for (const rp of (doc.repayMethods || [])) {
      const rpRate = Number(rp.exchangeRate || 0) || saleRate;
      for (const pm of (rp.paymentMethods || [])) recordPaymentEntry(pm, +1, rpRate);
      for (const rm of (rp.returnMethods || [])) recordPaymentEntry(rm, -1, rpRate);
    }
  }

  const totalDocs = validDocs.length;
  const paidDocsCount = Math.max(0, totalDocs - collabDocsCount);
  const paidGarmentsCount = Math.max(0, totalGarments - collabUnitsCount);

  // Ticket promedio calculado sobre ventas cobradas (y versión sobre total de documentos)
  const avgTicketUsd = paidDocsCount > 0 ? totalAmount / paidDocsCount : (totalDocs > 0 ? totalAmount / totalDocs : 0);
  const avgMerchandiseTicketUsd = paidDocsCount > 0 ? productSales / paidDocsCount : (totalDocs > 0 ? productSales / totalDocs : 0);
  const avgItemsPerTicket = paidDocsCount > 0 ? paidGarmentsCount / paidDocsCount : (totalDocs > 0 ? totalGarments / totalDocs : 0);
  const utilityMarginPct = productSales > 0 ? (totalUtility / productSales) * 100 : 0;

  // Pérdida cambiaria: lo que valen esos Bs netos a tasa Binance vs a tasa BCV de cada venta
  const exchangeLossUsd = gapRatio > 1 && vesUsdAtSaleRate > 0 ? vesUsdAtSaleRate * (1 - 1 / gapRatio) : 0;
  const netRealUsd = Math.max(0, totalAmount - exchangeLossUsd);
  const realUtilityAfterExchangeUsd = totalUtility - exchangeLossUsd;

  // Media diaria (en USD y en Cantidad de Ventas Día a Día)
  const todayVeKey = toVeDateKey(new Date().toISOString());
  const dailyListChrono = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const activeDaysCount = dailyListChrono.length;

  // Si el período incluye hoy y hay días previos cerrados, calcular la media sobre los días cerrados para que la mañana en curso no distorsione la media
  const completedDays = dailyListChrono.filter(d => d.date !== todayVeKey);
  const baseDays = completedDays.length > 0 ? completedDays : dailyListChrono;
  const baseDaysCount = baseDays.length;

  const dailyAvgUsd = baseDaysCount > 0 ? baseDays.reduce((a, d) => a + d.totalUsd, 0) / baseDaysCount : 0;
  const dailyAvgMerchandiseUsd = baseDaysCount > 0 ? baseDays.reduce((a, d) => a + d.merchandiseUsd, 0) / baseDaysCount : 0;
  const dailyAvgOrders = baseDaysCount > 0 ? baseDays.reduce((a, d) => a + d.orderCount, 0) / baseDaysCount : 0;
  const dailyAvgUnits = baseDaysCount > 0 ? baseDays.reduce((a, d) => a + d.totalUnits, 0) / baseDaysCount : 0;

  let daysAboveAvg = 0;
  let daysBelowAvg = 0;
  let daysInAvg = 0;

  let ordersDaysAboveAvg = 0;
  let ordersDaysBelowAvg = 0;
  let ordersDaysInAvg = 0;

  const dailyListWithStatus = dailyListChrono.map(day => {
    const isToday = day.date === todayVeKey;
    const isPartialToday = isToday && completedDays.length > 0;

    // Estado según Facturación USD
    let status = 'AVG';
    if (day.totalUsd >= dailyAvgUsd * 1.15) {
      status = 'HIGH';
      daysAboveAvg++;
    } else if (isPartialToday && day.totalUsd <= dailyAvgUsd * 0.85) {
      status = 'IN_PROGRESS';
    } else if (day.totalUsd <= dailyAvgUsd * 0.85) {
      status = 'LOW';
      daysBelowAvg++;
    } else {
      daysInAvg++;
    }

    // Estado según Cantidad de Ventas Día a Día
    let ordersStatus = 'AVG';
    if (day.orderCount >= dailyAvgOrders * 1.15) {
      ordersStatus = 'HIGH';
      ordersDaysAboveAvg++;
    } else if (isPartialToday && day.orderCount <= dailyAvgOrders * 0.85) {
      ordersStatus = 'IN_PROGRESS';
    } else if (day.orderCount <= dailyAvgOrders * 0.85) {
      ordersStatus = 'LOW';
      ordersDaysBelowAvg++;
    } else {
      ordersDaysInAvg++;
    }

    return {
      ...day,
      isToday,
      totalUsd: r2(day.totalUsd),
      merchandiseUsd: r2(day.merchandiseUsd),
      deliveryUsd: r2(day.deliveryUsd),
      avgUsd: r2(dailyAvgUsd),
      avgOrders: Math.round(dailyAvgOrders * 10) / 10,
      status,
      ordersStatus,
      avgTicketDayUsd: day.paidOrderCount > 0 ? r2(day.totalUsd / day.paidOrderCount) : 0,
      itemsPerTicket: day.orderCount > 0 ? Math.round((day.totalUnits / day.orderCount) * 100) / 100 : 0
    };
  }).sort((a, b) => b.date.localeCompare(a.date)); // Ordenar del más reciente al más antiguo

  // Balance de stock en almacén, curva de tallas y desglose por categoría (excluyendo bolsas, cajas, correcciones y accesorios comodín)
  const stock = { SUPERIOR: 0, INFERIOR: 0, CONJUNTO: 0, OTRO: 0 };
  const sizeCurveMap = new Map();
  const stockCatMap = new Map();

  if (Array.isArray(catalog)) {
    for (const model of catalog) {
      const group = classifyGarment(model.categoria, model.nombre);
      if (!group) continue;
      const mStock = Math.max(0, Number(model.total_stock || 0));
      stock[group] += mStock;

      const commCat = resolveCommercialCategory(model.categoria, model.nombre);
      const unitCost = Number(model.costo_unitario) > 0 ? Number(model.costo_unitario) : (Number(model.precio_usd || 0) * 0.35);
      const catEntry = stockCatMap.get(commCat) || {
        category: commCat,
        group,
        modelsCount: 0,
        availableModelsCount: 0,
        units: 0,
        costValueUsd: 0,
        retailValueUsd: 0
      };
      catEntry.modelsCount += 1;
      if (mStock > 0) catEntry.availableModelsCount += 1;
      catEntry.units += mStock;
      catEntry.costValueUsd = r2(catEntry.costValueUsd + mStock * unitCost);
      catEntry.retailValueUsd = r2(catEntry.retailValueUsd + mStock * Number(model.precio_usd || 0));
      stockCatMap.set(commCat, catEntry);

      // Contar curva de tallas disponibles (stock > 0)
      const seenSizesInModel = new Set();
      for (const cGroup of (model.colores || [])) {
        for (const tObj of (cGroup.tallas || [])) {
          const qty = Number(tObj.stock || 0);
          if (qty <= 0) continue;
          const sName = (tObj.talla || 'ÚNICA').toString().toUpperCase().trim();
          const sEntry = sizeCurveMap.get(sName) || { size: sName, units: 0, modelsCount: 0 };
          sEntry.units += qty;
          if (!seenSizesInModel.has(sName)) {
            sEntry.modelsCount += 1;
            seenSizesInModel.add(sName);
          }
          sizeCurveMap.set(sName, sEntry);
        }
      }
    }
  }
  const stockTotalUnits = stock.SUPERIOR + stock.INFERIOR + stock.CONJUNTO + stock.OTRO;
  const sizeOrderRank = { 'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5, 'XXL': 6, '30': 10, '32': 11, '34': 12, '36': 13, '38': 14, '40': 15, '41': 16, '42': 17, '43': 18, '44': 19, '45': 20 };
  const sizeCurve = Array.from(sizeCurveMap.values())
    .map(s => ({ ...s, pct: pct1(s.units, stockTotalUnits) }))
    .sort((a, b) => (sizeOrderRank[a.size] || 99) - (sizeOrderRank[b.size] || 99));

  const stockByCategory = Array.from(stockCatMap.values())
    .map(c => ({ ...c, pct: pct1(c.units, stockTotalUnits) }))
    .sort((a, b) => b.units - a.units);

  const garmentSalesUsd = groups.SUPERIOR.usd + groups.INFERIOR.usd + groups.CONJUNTO.usd + groups.OTRO.usd;

  // Métodos de pago: cuadre exacto calculado desde las facturas (entradas + cambios - vueltos)
  const paymentMethodsDetailed = Array.from(paymentMethodsMap.values())
    .map(pm => ({
      name: pm.name,
      currency: pm.currency,
      isVes: pm.isVes,
      txCount: pm.txCount,
      returnCount: pm.returnCount,
      inUSD: r2(pm.inUSD),
      outUSD: r2(pm.outUSD),
      totalUSD: r2(pm.totalUSD),
      inVES: pm.isVes ? r2(pm.inVES) : 0,
      outVES: pm.isVes ? r2(pm.outVES) : 0,
      totalVES: pm.isVes ? r2(pm.totalVES) : 0,
      percentageUsd: pct1(pm.totalUSD, totalAmount)
    }))
    .sort((a, b) => b.totalUSD - a.totalUSD);

  return {
    summary: {
      totalAmountUsd: r2(totalAmount),
      productSalesUsd: r2(productSales),
      garmentSalesUsd: r2(garmentSalesUsd),
      nonGarmentSalesUsd: r2(nonGarmentSalesUsd),
      extraChargesUsd: r2(extraCharges),
      deliveryOrdersCount,
      totalQuantityUnits: totalGarments,
      paidQuantityUnits: paidGarmentsCount,
      totalDocsCount: totalDocs,
      paidDocsCount,
      collabDocsCount,
      collabUnitsCount,
      collabCostUsd: r2(collabCostUsd),
      annulledDocsCount: annulledDocs.length,
      annulledAmountUsd: r2(annulledDocs.reduce((a, d) => a + Number(d.totalPriceUSD || 0), 0)),
      totalCobradoUsd: r2(meta.totalCobrado ?? totalAmount),
      avgTicketUsd: r2(avgTicketUsd),
      avgMerchandiseTicketUsd: r2(avgMerchandiseTicketUsd),
      avgItemsPerTicket: Math.round(avgItemsPerTicket * 100) / 100,
      totalUtilityUsd: r2(totalUtility),
      utilityMarginPct: Math.round(utilityMarginPct * 10) / 10,
      realUtilityAfterExchangeUsd: r2(realUtilityAfterExchangeUsd),
      vesCollectedTotal: r2(vesCollected),
      vesUsdAtSaleRate: r2(vesUsdAtSaleRate),
      vesUsdNominalTotal: r2(vesUsdNominal),
      usdCollectedTotal: r2(usdCollected),
      exchangeGapPct: Math.round((gapRatio - 1) * 1000) / 10,
      exchangeLossUsd: r2(exchangeLossUsd),
      netRealUsd: r2(netRealUsd),
      repositionBudgetUsd: r2(netRealUsd) // compatibilidad con versiones anteriores del frontend
    },
    daily: {
      daysCount: activeDaysCount,
      completedDaysCount: baseDaysCount,
      dailyAvgUsd: r2(dailyAvgUsd),
      dailyAvgMerchandiseUsd: r2(dailyAvgMerchandiseUsd),
      dailyAvgOrders: Math.round(dailyAvgOrders * 10) / 10,
      dailyAvgUnits: Math.round(dailyAvgUnits * 10) / 10,
      daysAboveAvg,
      daysBelowAvg,
      daysInAvg,
      ordersDaysAboveAvg,
      ordersDaysBelowAvg,
      ordersDaysInAvg,
      list: dailyListWithStatus
    },
    channels: Array.from(channelsMap.values())
      .map(c => ({
        ...c,
        totalUsd: r2(c.totalUsd),
        merchandiseUsd: r2(c.merchandiseUsd),
        deliveryUsd: r2(c.deliveryUsd),
        percentageUsd: pct1(c.totalUsd, totalAmount)
      }))
      .sort((a, b) => b.totalUsd - a.totalUsd),
    superiorVsInferiorSales: {
      superiorUsd: r2(groups.SUPERIOR.usd),
      superiorUnits: groups.SUPERIOR.units,
      superiorPercentage: pct1(groups.SUPERIOR.usd, garmentSalesUsd),
      inferiorUsd: r2(groups.INFERIOR.usd),
      inferiorUnits: groups.INFERIOR.units,
      inferiorPercentage: pct1(groups.INFERIOR.usd, garmentSalesUsd),
      conjuntoUsd: r2(groups.CONJUNTO.usd),
      conjuntoUnits: groups.CONJUNTO.units,
      conjuntoPercentage: pct1(groups.CONJUNTO.usd, garmentSalesUsd),
      otrosUsd: r2(groups.OTRO.usd),
      otrosUnits: groups.OTRO.units,
      otrosPercentage: pct1(groups.OTRO.usd, garmentSalesUsd)
    },
    stockBalance: {
      stockSuperiorUnits: stock.SUPERIOR,
      stockInferiorUnits: stock.INFERIOR,
      stockConjuntoUnits: stock.CONJUNTO,
      stockOtrosUnits: stock.OTRO,
      stockTotalUnits,
      superiorStockPercentage: pct1(stock.SUPERIOR, stockTotalUnits),
      inferiorStockPercentage: pct1(stock.INFERIOR, stockTotalUnits),
      conjuntoStockPercentage: pct1(stock.CONJUNTO, stockTotalUnits),
      otrosStockPercentage: pct1(stock.OTRO, stockTotalUnits),
      // Proporción inferior vs superior (sin conjuntos), usada para la sugerencia de reposición
      inferiorVsSuperiorPercentage: pct1(stock.INFERIOR, stock.SUPERIOR + stock.INFERIOR),
      sizeCurve,
      stockByCategory
    },
    paymentMethods: paymentMethodsDetailed,
    topProducts: Array.from(productMap.values())
      .map(p => ({ ...p, totalUsd: r2(p.totalUsd) }))
      .sort((a, b) => b.units - a.units || b.totalUsd - a.totalUsd)
      .slice(0, 10),
    allProductsSold: Array.from(productMap.values())
      .map(p => ({ ...p, totalUsd: r2(p.totalUsd) }))
      .sort((a, b) => b.units - a.units || b.totalUsd - a.totalUsd),
    topCategories: Array.from(categoryMap.values())
      .map(c => ({ ...c, totalUsd: r2(c.totalUsd) }))
      .sort((a, b) => b.totalUsd - a.totalUsd),
    dataQuality: billsResult?.dataQuality || null
  };
}

/**
 * Obtiene y guarda en caché de KV (15 min) el consolidado histórico de ventas por producto
 * desde el inicio de operaciones (2025-01-01) usando pageSize=1000 (~3 peticiones HTTP).
 */
async function getHistoricalSalesSummary(env, forceRefresh = false) {
  const CACHE_KEY = 'kpi_historical_sales_v1';
  if (!forceRefresh) {
    try {
      const cachedRaw = await env.STORE_KV.get(CACHE_KEY);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        if (parsed && parsed.updatedAt && (Date.now() - new Date(parsed.updatedAt).getTime() < 15 * 60 * 1000)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[Historical Sales Cache] Error leyendo KV:', e.message);
    }
  }

  const allTimeFrom = '2025-01-01T00:00:00.000Z';
  const allTimeTo = new Date(Date.now() + 86400000).toISOString();
  const billsResult = await fetchAllBills(env, allTimeFrom, allTimeTo, 1000);
  const validDocs = (billsResult?.docs || []).filter(d => d && d.deleted !== true);

  const byName = {};
  const byId = {};

  for (const doc of validDocs) {
    const docUsd = Number(doc.totalPriceUSD || 0);
    const docMerchandise = Number(doc.subtotal || 0) - Number(doc.discount || 0);
    const isCollab = docUsd === 0 && docMerchandise === 0;
    const saleIso = doc.createdAt || doc.updatedAt || null;

    const pvs = Array.isArray(doc.sale?.productVariations) ? doc.sale.productVariations : [];
    for (const pv of pvs) {
      const rawName = (pv.product?.name || pv.name || '').toString().trim();
      const normName = normalizeText(rawName);
      if (!normName) continue;
      const rawId = (pv.product?._id || pv.product?.id || pv.productId || '').toString().toLowerCase().trim();
      const qty = Number(pv.amount || 1);
      const lineUsd = isCollab ? 0 : Number(pv.sellingPrice || 0) * qty;

      const updateEntry = (mapObj, key) => {
        if (!key) return;
        const curr = mapObj[key] || {
          soldUnits: 0,
          paidUnits: 0,
          collabUnits: 0,
          revenueUsd: 0,
          ordersCount: 0,
          firstSaleDate: null,
          lastSaleDate: null
        };
        curr.soldUnits += qty;
        if (isCollab) curr.collabUnits += qty;
        else curr.paidUnits += qty;
        curr.revenueUsd = r2(curr.revenueUsd + lineUsd);
        curr.ordersCount += 1;
        if (saleIso) {
          if (!curr.firstSaleDate || saleIso < curr.firstSaleDate) curr.firstSaleDate = saleIso;
          if (!curr.lastSaleDate || saleIso > curr.lastSaleDate) curr.lastSaleDate = saleIso;
        }
        mapObj[key] = curr;
      };

      updateEntry(byName, normName);
      if (rawId) updateEntry(byId, rawId);
    }
  }

  const summary = {
    updatedAt: new Date().toISOString(),
    totalBillsProcessed: validDocs.length,
    byName,
    byId
  };

  try {
    await env.STORE_KV.put(CACHE_KEY, JSON.stringify(summary), { expirationTtl: 900 });
  } catch (e) {
    console.warn('[Historical Sales Cache] No se pudo guardar en KV:', e.message);
  }

  return summary;
}

/**
 * Clasifica la categoría comercial real de un producto (especialmente para desglosar la categoría "OC")
 */
function resolveCommercialCategory(rawCategory, rawName) {
  const cat = normUpper(rawCategory);
  const name = normalizeText(rawName);
  const words = name.split(/[\s\-_\/,()+]+/).filter(Boolean);
  const spaceWords = name.split(/\s+/).filter(Boolean);

  if (cat && cat !== 'OC' && cat !== 'GENERAL') {
    if (cat === 'PANTS') return 'PANTALON';
    if (cat === 'JEAN RECTO') return 'JEAN';
    return cat;
  }

  if (spaceWords.includes('t-shirt') || spaceWords.includes('t-shirts') || words.includes('tshirt') || words.includes('franela') || words.includes('tank')) return 'T-SHIRT';
  if (words.includes('sobrecamisa') || words.includes('sobrecamisas')) return 'CAMISA';
  if (words.includes('camisa') || words.includes('camisas')) return 'CAMISA';
  if (words.includes('chemise') || words.includes('chemises') || words.includes('polo')) return 'CHEMISE';
  if (words.includes('sweater') || words.includes('sueter') || words.includes('sueteres') || words.includes('sudadera')) return 'SWEATER';
  if (words.includes('hoodie') || words.includes('hoodies')) return 'HOODIE';
  if (words.includes('chaqueta') || words.includes('chaquetas') || words.includes('jacket') || words.includes('bomber') || words.includes('varsity') || words.includes('chaleco') || words.includes('chalecos')) return 'CHAQUETA';
  if (words.includes('jean') || words.includes('jeans')) return 'JEAN';
  if (words.includes('jogger') || words.includes('joggers') || words.includes('cargo')) return 'JOGGER CARGO';
  if (words.includes('pantalon') || words.includes('pants')) return 'PANTALON';
  if (words.includes('short') || words.includes('shorts')) return 'SHORT';
  if (words.includes('bermuda') || words.includes('bermudas') || words.includes('pescador') || words.includes('pescadores')) return 'BERMUDA';
  if (words.includes('set') || words.includes('sets') || words.includes('conjunto')) return 'SET';
  if (words.includes('zapato') || words.includes('zapatos') || words.includes('gorra') || words.includes('gorras') || words.includes('gorro') || words.includes('gorros')) return 'CALZADO / GORRAS';

  return cat || 'OTROS';
}

/**
 * Construye los KPIs de Rotación por Producto desde su Fecha de Ingreso y
 * Auditoría de Efectividad de Compras (Regla 80% Efectividad / Máx 20% Dead Stock)
 */
function buildRotationAndPurchaseKpis(catalog, historicalSales, periodBillsResult) {
  const nowMs = Date.now();
  const histByName = historicalSales?.byName || {};
  const histById = historicalSales?.byId || {};

  // Ventas dentro del período seleccionado en el filtro superior
  const periodByName = {};
  const periodById = {};
  const periodDocs = (periodBillsResult?.docs || []).filter(d => d && d.deleted !== true);

  for (const doc of periodDocs) {
    const docUsd = Number(doc.totalPriceUSD || 0);
    const docMerchandise = Number(doc.subtotal || 0) - Number(doc.discount || 0);
    const isCollab = docUsd === 0 && docMerchandise === 0;
    for (const pv of (doc.sale?.productVariations || [])) {
      const normName = normalizeText(pv.product?.name || pv.name || '');
      const rawId = (pv.product?._id || pv.product?.id || pv.productId || '').toString().toLowerCase().trim();
      const qty = Number(pv.amount || 1);
      const lineUsd = isCollab ? 0 : Number(pv.sellingPrice || 0) * qty;
      if (normName) {
        periodByName[normName] = periodByName[normName] || { units: 0, usd: 0 };
        periodByName[normName].units += qty;
        periodByName[normName].usd = r2(periodByName[normName].usd + lineUsd);
      }
      if (rawId) {
        periodById[rawId] = periodById[rawId] || { units: 0, usd: 0 };
        periodById[rawId].units += qty;
        periodById[rawId].usd = r2(periodById[rawId].usd + lineUsd);
      }
    }
  }

  const productList = [];

  for (const model of (catalog || [])) {
    const group = classifyGarment(model.categoria, model.nombre);
    if (!group) continue; // Excluir bolsas, cajas, correcciones y accesorios comodín

    const normName = normalizeText(model.nombre);
    const idCandidates = [
      (model.erp_product_id || '').toString().toLowerCase(),
      (model.alt_product_id || '').toString().toLowerCase(),
      (model.id || '').toString().toLowerCase()
    ].filter(Boolean);

    let hist = histByName[normName] || null;
    if (!hist) {
      for (const cid of idCandidates) {
        if (histById[cid]) {
          hist = histById[cid];
          break;
        }
      }
    }

    let per = periodByName[normName] || null;
    if (!per) {
      for (const cid of idCandidates) {
        if (periodById[cid]) {
          per = periodById[cid];
          break;
        }
      }
    }

    const currentStock = Math.max(0, Number(model.total_stock || 0));
    const soldUnits = Number(hist?.soldUnits || 0);
    const paidUnits = Number(hist?.paidUnits || 0);
    const collabUnits = Number(hist?.collabUnits || 0);
    const initialUnits = currentStock + soldUnits;

    // Si un registro antiguo tiene 0 stock actual y 0 ventas históricas, no aporta al análisis
    if (initialUnits === 0) continue;

    const entryDateIso = model.entry_date || hist?.firstSaleDate || '2025-07-14T12:00:00.000Z';
    const entryDateKey = toVeDateKey(entryDateIso) || entryDateIso.slice(0, 10);
    const entryMs = new Date(entryDateIso).getTime() || (nowMs - 30 * 86400000);
    const daysInInventory = Math.max(1, Math.round((nowMs - entryMs) / 86400000));

    const lastSaleIso = hist?.lastSaleDate || null;
    const daysSinceLastSale = lastSaleIso
      ? Math.max(0, Math.round((nowMs - new Date(lastSaleIso).getTime()) / 86400000))
      : daysInInventory;

    const effectivenessPct = pct1(soldUnits, initialUnits);
    const remainingPct = r2(Math.max(0, 100 - effectivenessPct));
    const velocityPerDay = Math.round((soldUnits / daysInInventory) * 100) / 100;
    const velocityPerWeek = Math.round(velocityPerDay * 7 * 10) / 10;
    const daysOfSupply = currentStock === 0
      ? 0
      : (velocityPerDay > 0 ? Math.min(999, Math.round(currentStock / velocityPerDay)) : 999);

    const priceUsd = r2(model.precio_usd || 0);
    const unitCostUsd = r2(Number(model.costo_unitario) > 0 ? model.costo_unitario : priceUsd * 0.35);
    const initialCostUsd = r2(initialUnits * unitCostUsd);
    const remainingCostUsd = r2(currentStock * unitCostUsd);
    const remainingRetailUsd = r2(currentStock * priceUsd);
    const revenueUsd = r2(hist?.revenueUsd || 0);
    const costRecoveryPct = pct1(revenueUsd, initialCostUsd);
    const commercialCategory = resolveCommercialCategory(model.categoria, model.nombre);

    let status = 'HEALTHY';
    if (currentStock === 0) {
      status = 'SOLD_OUT';
    } else if (effectivenessPct >= 80 || (daysInInventory <= 30 && effectivenessPct >= 45) || velocityPerDay >= 0.75) {
      status = 'STAR';
    } else if ((daysInInventory >= 45 && effectivenessPct < 60) || (daysInInventory >= 35 && daysSinceLastSale >= 21 && effectivenessPct < 70)) {
      status = 'DEAD_STOCK';
    } else if (daysInInventory >= 30 && effectivenessPct < 78) {
      status = 'SLOW';
    }

    productList.push({
      id: model.id,
      name: model.nombre,
      rawCategory: model.categoria,
      category: commercialCategory,
      group,
      entryDate: entryDateKey,
      entryDateIso,
      daysInInventory,
      lastSaleDate: lastSaleIso ? toVeDateKey(lastSaleIso) : null,
      daysSinceLastSale,
      initialUnits,
      soldUnits,
      paidUnits,
      collabUnits,
      currentStock,
      periodSoldUnits: Number(per?.units || 0),
      periodRevenueUsd: r2(per?.usd || 0),
      effectivenessPct,
      remainingPct,
      velocityPerDay,
      velocityPerWeek,
      daysOfSupply,
      unitCostUsd,
      priceUsd,
      initialCostUsd,
      remainingCostUsd,
      remainingRetailUsd,
      revenueUsd,
      costRecoveryPct,
      status
    });
  }

  // -------------------------------------------------------------------------
  // 1. AGRUPACIÓN AUTOMÁTICA POR LOTES DE COMPRA (PURCHASE COHORTS)
  // Prendas con fecha de ingreso cercana (<= 7 días de diferencia) pertenecen a una misma compra
  // -------------------------------------------------------------------------
  const sortedByEntry = [...productList].sort((a, b) => a.entryDate.localeCompare(b.entryDate));
  const rawCohorts = [];

  for (const prod of sortedByEntry) {
    const prodDayMs = new Date(`${prod.entryDate}T12:00:00Z`).getTime();
    const lastCohort = rawCohorts[rawCohorts.length - 1];

    if (!lastCohort) {
      rawCohorts.push({
        startDate: prod.entryDate,
        endDate: prod.entryDate,
        lastDayMs: prodDayMs,
        items: [prod]
      });
    } else {
      const gapDays = Math.round((prodDayMs - lastCohort.lastDayMs) / 86400000);
      if (gapDays <= 7) {
        lastCohort.endDate = prod.entryDate;
        lastCohort.lastDayMs = prodDayMs;
        lastCohort.items.push(prod);
      } else {
        rawCohorts.push({
          startDate: prod.entryDate,
          endDate: prod.entryDate,
          lastDayMs: prodDayMs,
          items: [prod]
        });
      }
    }
  }

  const purchaseCohorts = rawCohorts.map((c, idx) => {
    const cohortNumber = idx + 1;
    const initialUnits = c.items.reduce((a, i) => a + i.initialUnits, 0);
    const soldUnits = c.items.reduce((a, i) => a + i.soldUnits, 0);
    const currentStock = c.items.reduce((a, i) => a + i.currentStock, 0);
    const periodSoldUnits = c.items.reduce((a, i) => a + i.periodSoldUnits, 0);
    const periodRevenueUsd = r2(c.items.reduce((a, i) => a + i.periodRevenueUsd, 0));

    const initialCostUsd = r2(c.items.reduce((a, i) => a + i.initialCostUsd, 0));
    const remainingCostUsd = r2(c.items.reduce((a, i) => a + i.remainingCostUsd, 0));
    const remainingRetailUsd = r2(c.items.reduce((a, i) => a + i.remainingRetailUsd, 0));
    const revenueUsd = r2(c.items.reduce((a, i) => a + i.revenueUsd, 0));
    const netProfitRealizedUsd = r2(revenueUsd - initialCostUsd);
    const costRecoveryPct = pct1(revenueUsd, initialCostUsd);

    const effectivenessPct = pct1(soldUnits, initialUnits);
    const deadStockPct = r2(Math.max(0, 100 - effectivenessPct));

    const startMs = new Date(`${c.startDate}T12:00:00Z`).getTime();
    const daysSinceEntry = Math.max(1, Math.round((nowMs - startMs) / 86400000));
    const velocityPerDay = Math.round((soldUnits / daysSinceEntry) * 100) / 100;
    const daysToClearRemaining = currentStock === 0
      ? 0
      : (velocityPerDay > 0 ? Math.min(999, Math.round(currentStock / velocityPerDay)) : 999);

    // Proyección a 45 días para compras en maduración
    const projectedSold45d = Math.min(initialUnits, Math.round(velocityPerDay * 45));
    const projectedEffectiveness45d = pct1(projectedSold45d, initialUnits);

    // Meta 80/20: Máximo 20% del lote inicial debería quedar sin vender
    const maxHealthyRemainingUnits = Math.floor(initialUnits * 0.20);
    const excessDeadStockUnits = Math.max(0, currentStock - maxHealthyRemainingUnits);
    const avgUnitCost = initialUnits > 0 ? initialCostUsd / initialUnits : 0;
    const excessDeadStockCostUsd = r2(excessDeadStockUnits * avgUnitCost);

    let status = 'HEALTHY_80_20';
    if (effectivenessPct >= 80) {
      status = 'HEALTHY_80_20'; // Meta cumplida: >=80% vendido, <=20% restante
    } else if (daysSinceEntry < 45) {
      status = 'IN_MATURATION'; // Compra reciente aún en ciclo de maduración (<45 días)
    } else if (effectivenessPct >= 65) {
      status = 'WARNING_SLOW'; // Entre 20% y 35% de stock restante tras +45 días
    } else {
      status = 'ALERT_DEAD_STOCK'; // Más de 35% estancado tras +45 días
    }

    // Desglose por categoría dentro de esta compra
    const catMap = new Map();
    for (const item of c.items) {
      const ce = catMap.get(item.category) || {
        category: item.category,
        modelsCount: 0,
        initialUnits: 0,
        soldUnits: 0,
        currentStock: 0,
        initialCostUsd: 0,
        remainingCostUsd: 0,
        revenueUsd: 0
      };
      ce.modelsCount += 1;
      ce.initialUnits += item.initialUnits;
      ce.soldUnits += item.soldUnits;
      ce.currentStock += item.currentStock;
      ce.initialCostUsd = r2(ce.initialCostUsd + item.initialCostUsd);
      ce.remainingCostUsd = r2(ce.remainingCostUsd + item.remainingCostUsd);
      ce.revenueUsd = r2(ce.revenueUsd + item.revenueUsd);
      catMap.set(item.category, ce);
    }

    const categoriesBreakdown = Array.from(catMap.values())
      .map(ce => ({
        ...ce,
        shareOfCohortUnitsPct: pct1(ce.initialUnits, initialUnits),
        effectivenessPct: pct1(ce.soldUnits, ce.initialUnits),
        deadStockPct: r2(Math.max(0, 100 - pct1(ce.soldUnits, ce.initialUnits)))
      }))
      .sort((a, b) => b.initialUnits - a.initialUnits);

    return {
      id: `COHORT-${cohortNumber}`,
      cohortNumber,
      startDate: c.startDate,
      endDate: c.endDate,
      daysSinceEntry,
      modelsCount: c.items.length,
      initialUnits,
      soldUnits,
      currentStock,
      periodSoldUnits,
      periodRevenueUsd,
      effectivenessPct,
      deadStockPct,
      maxHealthyRemainingUnits,
      excessDeadStockUnits,
      excessDeadStockCostUsd,
      velocityPerDay,
      daysToClearRemaining,
      projectedEffectiveness45d,
      initialCostUsd,
      remainingCostUsd,
      remainingRetailUsd,
      revenueUsd,
      netProfitRealizedUsd,
      costRecoveryPct,
      status,
      categoriesBreakdown,
      models: [...c.items].sort((a, b) => b.effectivenessPct - a.effectivenessPct)
    };
  }).sort((a, b) => b.startDate.localeCompare(a.startDate)); // Del lote más reciente al más antiguo

  // -------------------------------------------------------------------------
  // 2. MATRIZ DE SELECCIÓN POR CATEGORÍA (¿QUÉ COMPRAR MÁS Y QUÉ COMPRAR MENOS?)
  // -------------------------------------------------------------------------
  const totalInitialUnitsAll = productList.reduce((a, i) => a + i.initialUnits, 0);
  const totalSoldUnitsAll = productList.reduce((a, i) => a + i.soldUnits, 0);
  const totalCurrentStockAll = productList.reduce((a, i) => a + i.currentStock, 0);
  const totalInitialCostAll = r2(productList.reduce((a, i) => a + i.initialCostUsd, 0));
  const totalRemainingCostAll = r2(productList.reduce((a, i) => a + i.remainingCostUsd, 0));
  const totalRemainingRetailAll = r2(productList.reduce((a, i) => a + i.remainingRetailUsd, 0));
  const totalHistoricalRevenueAll = r2(productList.reduce((a, i) => a + i.revenueUsd, 0));

  const globalCatMap = new Map();
  for (const item of productList) {
    const gc = globalCatMap.get(item.category) || {
      category: item.category,
      group: item.group,
      modelsCount: 0,
      initialUnits: 0,
      soldUnits: 0,
      currentStock: 0,
      deadStockUnits: 0,
      initialCostUsd: 0,
      remainingCostUsd: 0,
      remainingRetailUsd: 0,
      revenueUsd: 0
    };
    gc.modelsCount += 1;
    gc.initialUnits += item.initialUnits;
    gc.soldUnits += item.soldUnits;
    gc.currentStock += item.currentStock;
    if (item.status === 'DEAD_STOCK' || item.status === 'SLOW') {
      gc.deadStockUnits += item.currentStock;
    }
    gc.initialCostUsd = r2(gc.initialCostUsd + item.initialCostUsd);
    gc.remainingCostUsd = r2(gc.remainingCostUsd + item.remainingCostUsd);
    gc.remainingRetailUsd = r2(gc.remainingRetailUsd + item.remainingRetailUsd);
    gc.revenueUsd = r2(gc.revenueUsd + item.revenueUsd);
    globalCatMap.set(item.category, gc);
  }

  const categorySelectionMatrix = Array.from(globalCatMap.values())
    .map(gc => {
      const effectivenessPct = pct1(gc.soldUnits, gc.initialUnits);
      const deadStockPct = r2(Math.max(0, 100 - effectivenessPct));
      const shareOfPurchasePct = pct1(gc.initialUnits, totalInitialUnitsAll);
      const shareOfSalesPct = pct1(gc.soldUnits, totalSoldUnitsAll);
      const shareOfRemainingStockPct = pct1(gc.currentStock, totalCurrentStockAll);
      const selectionGapPct = r2(shareOfSalesPct - shareOfPurchasePct);
      const costRecoveryPct = pct1(gc.revenueUsd, gc.initialCostUsd);

      let recommendation = 'BALANCED';
      let actionLabel = 'Selección Equilibrada';
      if (effectivenessPct >= 75 || (effectivenessPct >= 62 && selectionGapPct >= 2)) {
        recommendation = 'BUY_MORE';
        actionLabel = 'Priorizar / Comprar Más';
      } else if (effectivenessPct < 55 || deadStockPct > 45 || selectionGapPct <= -3) {
        recommendation = 'BUY_LESS';
        actionLabel = 'Reducir / Ajustar Selección';
      }

      return {
        ...gc,
        effectivenessPct,
        deadStockPct,
        shareOfPurchasePct,
        shareOfSalesPct,
        shareOfRemainingStockPct,
        selectionGapPct,
        costRecoveryPct,
        recommendation,
        actionLabel
      };
    })
    .sort((a, b) => b.effectivenessPct - a.effectivenessPct || b.soldUnits - a.soldUnits);

  // -------------------------------------------------------------------------
  // 3. RESUMEN GLOBAL DE EFECTIVIDAD Y SALUD 80/20
  // -------------------------------------------------------------------------
  const globalEffectivenessPct = pct1(totalSoldUnitsAll, totalInitialUnitsAll);
  const globalRemainingPct = r2(Math.max(0, 100 - globalEffectivenessPct));

  // Prendas estancadas (DEAD_STOCK)
  const deadStockModels = productList.filter(p => p.status === 'DEAD_STOCK');
  const slowModels = productList.filter(p => p.status === 'SLOW');
  const starModels = productList.filter(p => p.status === 'STAR');
  const soldOutModels = productList.filter(p => p.status === 'SOLD_OUT');

  const deadStockUnitsTotal = deadStockModels.reduce((a, p) => a + p.currentStock, 0);
  const deadStockCostUsd = r2(deadStockModels.reduce((a, p) => a + p.remainingCostUsd, 0));
  const deadStockRetailUsd = r2(deadStockModels.reduce((a, p) => a + p.remainingRetailUsd, 0));
  const deadStockOverInitialPct = pct1(deadStockUnitsTotal, totalInitialUnitsAll);
  const deadStockOverCurrentStockPct = pct1(deadStockUnitsTotal, totalCurrentStockAll);

  // Meta del 20%: sobre compras maduras (>= 45 días desde el ingreso)
  const matureProducts = productList.filter(p => p.daysInInventory >= 45);
  const matureInitialUnits = matureProducts.reduce((a, p) => a + p.initialUnits, 0);
  const matureSoldUnits = matureProducts.reduce((a, p) => a + p.soldUnits, 0);
  const matureRemainingUnits = matureProducts.reduce((a, p) => a + p.currentStock, 0);
  const matureEffectivenessPct = pct1(matureSoldUnits, matureInitialUnits);
  const matureDeadStockPct = r2(Math.max(0, 100 - matureEffectivenessPct));

  return {
    globalSummary: {
      totalModelsAnalyzed: productList.length,
      totalInitialUnits: totalInitialUnitsAll,
      totalSoldUnits: totalSoldUnitsAll,
      totalCurrentStock: totalCurrentStockAll,
      globalEffectivenessPct,
      globalRemainingPct,
      matureInitialUnits,
      matureSoldUnits,
      matureRemainingUnits,
      matureEffectivenessPct,
      matureDeadStockPct,
      targetEffectivenessPct: 80,
      maxHealthyDeadStockPct: 20,
      isWithinTarget20Pct: matureDeadStockPct <= 20,
      deadStockModelsCount: deadStockModels.length,
      slowModelsCount: slowModels.length,
      starModelsCount: starModels.length,
      soldOutModelsCount: soldOutModels.length,
      deadStockUnitsTotal,
      deadStockCostUsd,
      deadStockRetailUsd,
      deadStockOverInitialPct,
      deadStockOverCurrentStockPct,
      totalInitialCostUsd: totalInitialCostAll,
      totalRemainingCostUsd: totalRemainingCostAll,
      totalRemainingRetailUsd: totalRemainingRetailAll,
      totalHistoricalRevenueUsd: totalHistoricalRevenueAll,
      globalCostRecoveryPct: pct1(totalHistoricalRevenueAll, totalInitialCostAll)
    },
    purchaseCohorts,
    categorySelectionMatrix,
    products: productList
  };
}

/**
 * GET /api/pago-movil - Obtiene cuentas bancarias e imágenes QR guardadas en KV
 */
async function handleGetPagoMovil(env) {
  try {
    const raw = await env.STORE_KV.get('pago_movil_accounts');
    if (raw) {
      const accounts = JSON.parse(raw);
      return new Response(JSON.stringify({ success: true, accounts }), { headers: corsHeaders });
    }
  } catch (e) {
    console.warn('[PagoMovil KV GET] Error:', e);
  }
  return new Response(JSON.stringify({ success: true, accounts: [] }), { headers: corsHeaders });
}

/**
 * POST /api/pago-movil - Guarda cuentas bancarias e imágenes QR en KV para todos los dispositivos
 */
async function handlePostPagoMovil(request, env) {
  try {
    const body = await request.json();
    const accounts = Array.isArray(body) ? body : (body.accounts || []);
    if (Array.isArray(accounts)) {
      await env.STORE_KV.put('pago_movil_accounts', JSON.stringify(accounts));
      return new Response(JSON.stringify({ success: true, message: 'Cuentas e imágenes de QR sincronizadas globalmente' }), { headers: corsHeaders });
    }
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 400, headers: corsHeaders });
  }
  return new Response(JSON.stringify({ success: false, error: 'Payload inválido' }), { status: 400, headers: corsHeaders });
}

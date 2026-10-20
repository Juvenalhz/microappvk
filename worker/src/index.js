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

  return {
    id: modelId,
    erp_product_id: posProductId || item._id || item.id || item.productId || null,
    alt_product_id: masterRefId || item._id || null,
    nombre,
    categoria,
    precio_usd: precioUsd,
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

  // Synonyms map para búsqueda avanzada en Worker API
  const SYNONYMS_MAP = {
    'camisa': 'camisa', 'camisas': 'camisa', 'chemise': 'camisa', 'chemises': 'camisa', 'sobrecamisa': 'camisa', 'sobrecamisas': 'camisa', 'shirt': 'camisa', 'shirts': 'camisa',
    'tshirt': 'franela', 't-shirt': 'franela', 'remera': 'franela', 'playera': 'franela', 'franela': 'franela', 'franelas': 'franela',
    'pantalon': 'pantalon', 'pantalones': 'pantalon', 'jean': 'pantalon', 'jeans': 'pantalon', 'denim': 'pantalon', 'pants': 'pantalon',
    'chaqueta': 'chaqueta', 'chaquetas': 'chaqueta', 'sueter': 'chaqueta', 'hoodie': 'chaqueta', 'abrigo': 'chaqueta',
    'mono': 'mono', 'monos': 'mono', 'jogger': 'mono', 'short': 'short', 'shorts': 'short',
    'blanca': 'blanco', 'blancas': 'blanco', 'blanco': 'blanco', 'blancos': 'blanco', 'white': 'blanco',
    'negra': 'negro', 'negras': 'negro', 'negro': 'negro', 'negros': 'negro', 'black': 'negro',
    'marron': 'marron', 'marrón': 'marron', 'marrones': 'marron', 'brown': 'marron', 'cafe': 'marron',
    'azul': 'azul', 'azules': 'azul', 'blue': 'azul', 'marino': 'azul', 'celeste': 'azul',
    'roja': 'rojo', 'rojas': 'rojo', 'rojo': 'rojo', 'rojos': 'rojo', 'red': 'rojo',
    'verde': 'verde', 'verdes': 'verde', 'green': 'verde', 'oliva': 'verde',
    'gris': 'gris', 'grises': 'gris', 'gray': 'gris', 'grey': 'gris', 'plata': 'gris',
    'rosada': 'rosado', 'rosadas': 'rosado', 'rosado': 'rosado', 'rosados': 'rosado', 'pink': 'rosado', 'rosa': 'rosado',
    'amarilla': 'amarillo', 'amarillas': 'amarillo', 'amarillo': 'amarillo', 'yellow': 'amarillo', 'mostaza': 'amarillo',
    'morada': 'morado', 'morado': 'morado', 'purple': 'morado', 'violeta': 'morado',
    'vinotinto': 'vinotinto', 'vino': 'vinotinto', 'naranja': 'naranja', 'fucsia': 'fucsia', 'beige': 'beige'
  };

  const stopWords = new Set(['dame', 'todas', 'todos', 'las', 'los', 'les', 'de', 'del', 'el', 'la', 'un', 'una', 'unos', 'unas', 'en', 'con', 'para', 'por', 'o', 'y']);

  // Filtrado search-as-you-type avanzado
  let results = catalog;
  if (normalizedQuery) {
    const rawWords = normalizedQuery.split(/\s+/).filter(Boolean);
    const tokens = rawWords.filter(w => !stopWords.has(w)).map(w => SYNONYMS_MAP[w] || w);

    if (tokens.length > 0) {
      results = catalog.filter(model => {
        const itemNombre = normalizeText(model.nombre);
        const itemCat = normalizeText(model.categoria);
        const itemCatCanon = SYNONYMS_MAP[itemCat] || itemCat;
        const itemId = normalizeText(model.id);
        const itemSearchText = normalizeText(model.search_text);

        const itemColores = (model.colores || []).map(c => normalizeText(c.color));
        const itemTallas = new Set();
        (model.colores || []).forEach(c => (c.tallas || []).forEach(t => itemTallas.add(normalizeText(t.talla))));

        return tokens.every(token => {
          if (itemCat.includes(token) || itemCatCanon.includes(token)) return true;
          if (itemNombre.includes(token) || itemId.includes(token)) return true;
          if (itemSearchText.includes(token)) return true;
          if (itemColores.some(c => c.includes(token) || (SYNONYMS_MAP[c] && SYNONYMS_MAP[c].includes(token)))) return true;
          if (itemTallas.has(token)) return true;
          if ((token === 'camisa' || token === 'chemise' || token === 'franela') && 
              (itemCat.includes('chemise') || itemCat.includes('camisa') || itemCat.includes('franela') || itemCat.includes('set') || itemNombre.includes('camisa') || itemNombre.includes('chemise'))) return true;
          return false;
        });
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
const KPI_BILLS_PAGE_SIZE = 100;
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
async function fetchAllBills(env, fromDate, toDate) {
  const buildPath = (page) =>
    `/pos/bills?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(toDate)}&search=&currentPage=${page}&pageSize=${KPI_BILLS_PAGE_SIZE}&sortedColumn=updatedAt&sortedDirection=desc`;

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
      env.STORE_KV.get('tasa_bcv').catch(() => null)
    ];

    if (compareFromDate && compareToDate) {
      fetchPromises.push(fetchAllBills(env, compareFromDate, compareToDate).catch(() => null));
    }

    const [billsResult, catalogRaw, bcvDataRaw, compareBillsResult] = await Promise.all(fetchPromises);

    if (!billsResult) {
      return new Response(
        JSON.stringify({ success: false, error: 'No se pudieron obtener las facturas de FINA ERP' }),
        { status: 502, headers: corsHeaders }
      );
    }

    const catalog = catalogRaw ? JSON.parse(catalogRaw) : [];
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

      // Excluir colaboraciones en $0 del ranking de "Más Vendidas" para no mostrar prendas con $0 USD vendidos
      if (!isCollab) {
        const pKey = pName.toLowerCase();
        const pEntry = productMap.get(pKey) || { name: pName, category: pCategory, group, units: 0, totalUsd: 0 };
        pEntry.units += amount;
        pEntry.totalUsd += lineUsd;
        productMap.set(pKey, pEntry);

        const cEntry = categoryMap.get(pCategory) || { category: pCategory, group, units: 0, totalUsd: 0 };
        cEntry.units += amount;
        cEntry.totalUsd += lineUsd;
        categoryMap.set(pCategory, cEntry);
      }
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

  // Balance de stock en almacén (excluyendo bolsas, cajas, correcciones y accesorios comodín)
  const stock = { SUPERIOR: 0, INFERIOR: 0, CONJUNTO: 0, OTRO: 0 };
  if (Array.isArray(catalog)) {
    for (const model of catalog) {
      const group = classifyGarment(model.categoria, model.nombre);
      if (!group) continue;
      stock[group] += Math.max(0, Number(model.total_stock || 0));
    }
  }
  const stockTotalUnits = stock.SUPERIOR + stock.INFERIOR + stock.CONJUNTO + stock.OTRO;

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
      inferiorVsSuperiorPercentage: pct1(stock.INFERIOR, stock.SUPERIOR + stock.INFERIOR)
    },
    paymentMethods: paymentMethodsDetailed,
    topProducts: Array.from(productMap.values())
      .map(p => ({ ...p, totalUsd: r2(p.totalUsd) }))
      .sort((a, b) => b.units - a.units || b.totalUsd - a.totalUsd)
      .slice(0, 10),
    topCategories: Array.from(categoryMap.values())
      .map(c => ({ ...c, totalUsd: r2(c.totalUsd) }))
      .sort((a, b) => b.totalUsd - a.totalUsd),
    dataQuality: billsResult?.dataQuality || null
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

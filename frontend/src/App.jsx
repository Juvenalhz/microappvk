import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import StockModule from './components/StockModule';
import BcvModule from './components/BcvModule';
import BinanceBrechaModule from './components/BinanceBrechaModule';
import PagoMovilModule from './components/PagoMovilModule';
import BottomNav from './components/BottomNav';

export default function App() {
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' | 'bcv' | 'pago'
  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem('vk_last_search') || '');
  
  // Carga instantánea (0ms) desde cache local al abrir la PWA
  const [stockData, setStockData] = useState(() => {
    try {
      const cached = localStorage.getItem('vk_stock_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        const lastSearch = localStorage.getItem('vk_last_search');
        if (lastSearch) {
          const q = lastSearch.toLowerCase();
          return parsed.filter(m => 
            (m.nombre && m.nombre.toLowerCase().includes(q)) || 
            (m.id && m.id.toLowerCase().includes(q)) || 
            (m.categoria && m.categoria.toLowerCase().includes(q))
          );
        }
        return parsed;
      }
    } catch (e) {
      console.warn('[App] Error al leer vk_stock_cache inicial:', e);
    }
    return [];
  });

  const [bcvRate, setBcvRate] = useState(() => {
    try {
      const cached = localStorage.getItem('vk_bcv_cache');
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.warn('[App] Error al leer vk_bcv_cache inicial:', e);
    }
    return { tasa: 36.50, fuente: 'Cache Inicial' };
  });

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  // Persistir último término buscado para no perder el contexto al cambiar de pestaña o recargar
  useEffect(() => {
    if (searchTerm) {
      localStorage.setItem('vk_last_search', searchTerm);
    } else {
      localStorage.removeItem('vk_last_search');
    }
  }, [searchTerm]);

  // Escuchar estado de conexión a Internet (Online / Offline)
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Cargar tasa BCV
  const fetchBcvRate = useCallback(async () => {
    try {
      let res = await fetch('https://microapp-vk-bff.jjhernandezz100.workers.dev/api/bcv');
      if (!res.ok) res = await fetch('/api/bcv');

      if (res.ok) {
        const data = await res.json();
        if (data && data.tasa) {
          setBcvRate(data);
          localStorage.setItem('vk_bcv_cache', JSON.stringify(data));
        }
      }
    } catch (err) {
      console.warn('[App] Error al consultar /api/bcv, usando cache local:', err);
    }
  }, []);

  // Cargar inventario filtrado por término de búsqueda (search-as-you-type)
  const fetchStock = useCallback(async (query = '') => {
    // Si no hay datos en pantalla, mostrar indicador de carga; de lo contrario actualizar en segundo plano silenciosamente
    if (!stockData || stockData.length === 0) {
      setIsLoadingStock(true);
    }
    
    const workerUrl = `https://microapp-vk-bff.jjhernandezz100.workers.dev/api/stock?q=${encodeURIComponent(query)}`;
    
    try {
      let res = await fetch(workerUrl);
      if (!res.ok) {
        res = await fetch(`/api/stock?q=${encodeURIComponent(query)}`);
      }

      if (res.ok) {
        const json = await res.json();
        setStockData(json.data || []);
        setLastSync(json.last_sync || null);
        
        // Auto-Verificación en segundo plano no-bloqueante
        setTimeout(() => autoVerifyLowStockModels(json.data || []), 50);

        // Almacenar en localStorage snapshot completo para offline
        if (!query) {
          localStorage.setItem('vk_stock_cache', JSON.stringify(json.data || []));
        }
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('[App] Error al consultar /api/stock, aplicando datos offline:', err);
      const cachedStock = localStorage.getItem('vk_stock_cache');
      if (cachedStock) {
        const parsed = JSON.parse(cachedStock);
        if (query) {
          const q = query.toLowerCase();
          const filtered = parsed.filter(m => 
            (m.nombre && m.nombre.toLowerCase().includes(q)) || 
            (m.id && m.id.toLowerCase().includes(q)) || 
            (m.categoria && m.categoria.toLowerCase().includes(q))
          );
          setStockData(filtered);
        } else {
          setStockData(parsed);
        }
      }
    } finally {
      setIsLoadingStock(false);
    }
  }, []);

  // Función para re-verificar automáticamente en vivo modelos con 1 unidad (paralelizado en segundo plano)
  const autoVerifyLowStockModels = async (models) => {
    const lowStockModels = models.filter(m => 
      m.variantes && m.variantes.some(v => v.stock === 1)
    );

    if (lowStockModels.length === 0) return;

    // Ejecutar verificaciones en paralelo sin bloquear el hilo principal
    await Promise.allSettled(
      lowStockModels.map(async (model) => {
        try {
          let res = await fetch(`https://microapp-vk-bff.jjhernandezz100.workers.dev/api/stock/verify?id=${encodeURIComponent(model.id)}`);
          if (!res.ok) res = await fetch(`/api/stock/verify?id=${encodeURIComponent(model.id)}`);

          if (res.ok) {
            const json = await res.json();
            if (json.verified && json.data) {
              setStockData(prevData => 
                prevData.map(item => item.id === json.data.id ? { ...item, ...json.data, verified_live: true } : item)
              );
            }
          }
        } catch (e) {
          console.warn(`[AutoVerify] No se pudo verificar en vivo modelo ${model.id}:`, e);
        }
      })
    );
  };

  // Re-consultar tasas en vivo cada vez que se entra a la pestaña Brecha o Calculadora
  useEffect(() => {
    if (activeTab === 'binance' || activeTab === 'bcv') {
      fetchBcvRate();
    }
  }, [activeTab, fetchBcvRate]);

  // Carga inicial al montar la app
  useEffect(() => {
    fetchBcvRate();
    fetchStock('');
  }, [fetchBcvRate, fetchStock]);

  // Debounce para la búsqueda en tiempo real
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStock(searchTerm);
    }, 150); // 150ms debounce ultra rápido

    return () => clearTimeout(timer);
  }, [searchTerm, fetchStock]);

  // Refresco manual al presionar el botón de la cabecera (Sincronización en vivo con el ERP)
  const handleRefresh = async () => {
    setIsSyncing(true);
    try {
      let res = await fetch('https://microapp-vk-bff.jjhernandezz100.workers.dev/api/sync', { method: 'POST' });
      if (!res.ok) {
        res = await fetch('/api/sync', { method: 'POST' });
      }

      if (res.ok) {
        const json = await res.json();
        if (json.data && Array.isArray(json.data) && json.data.length > 0) {
          // Filtrar con el término de búsqueda actual si existe
          if (searchTerm) {
            const q = searchTerm.toLowerCase();
            const filtered = json.data.filter(m => 
              (m.nombre && m.nombre.toLowerCase().includes(q)) || 
              (m.id && m.id.toLowerCase().includes(q)) || 
              (m.categoria && m.categoria.toLowerCase().includes(q))
            );
            setStockData(filtered);
          } else {
            setStockData(json.data);
          }
          localStorage.setItem('vk_stock_cache', JSON.stringify(json.data));
        }
        if (json.bcv) {
          setBcvRate(json.bcv);
          localStorage.setItem('vk_bcv_cache', JSON.stringify(json.bcv));
        }
        if (json.last_sync) {
          setLastSync(json.last_sync);
        }
      } else {
        await Promise.all([fetchBcvRate(), fetchStock(searchTerm)]);
      }
    } catch (err) {
      console.warn('[App] Error al forzar sincronización manual en vivo:', err);
      await Promise.all([fetchBcvRate(), fetchStock(searchTerm)]);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col h-dvh h-screen w-screen bg-[#0b0f19] text-slate-100 overflow-hidden font-sans">
      
      {/* Header Fijo */}
      <Header 
        bcvRate={bcvRate}
        isOnline={isOnline}
        isSyncing={isSyncing}
        onRefresh={handleRefresh}
        lastSync={lastSync}
      />

      {/* Contenido Dinámico Según Pestaña Seleccionada */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'stock' && (
          <StockModule
            stockData={stockData}
            bcvRate={bcvRate}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            isLoading={isLoadingStock}
          />
        )}

        {activeTab === 'bcv' && (
          <BcvModule bcvRate={bcvRate} />
        )}

        {activeTab === 'binance' && (
          <BinanceBrechaModule bcvRate={bcvRate} onRefreshRates={fetchBcvRate} />
        )}

        {activeTab === 'pago' && (
          <PagoMovilModule />
        )}
      </main>

      {/* Barra de Navegación Inferior Mobile-First */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

    </div>
  );
}

/**
 * Fallback Mock local en caso de primera carga sin servidor de desarrollo activo
 */
function getInitialMockCatalog() {
  return [
    {
      id: 'MOD-101',
      nombre: 'Franela Oversize Cotton',
      categoria: 'Franelas',
      precio_usd: 20,
      total_stock: 10,
      variantes: [
        { talla: 'S', stock: 5, sku: 'FRN-OVS-S' },
        { talla: 'M', stock: 1, sku: 'FRN-OVS-M' },
        { talla: 'L', stock: 0, sku: 'FRN-OVS-L' },
        { talla: 'XL', stock: 4, sku: 'FRN-OVS-XL' }
      ]
    },
    {
      id: 'MOD-202',
      nombre: 'Jean Slim Fit Denim',
      categoria: 'Pantalones',
      precio_usd: 35,
      total_stock: 10,
      variantes: [
        { talla: 'S', stock: 0, sku: 'JNS-SLM-S' },
        { talla: 'M', stock: 2, sku: 'JNS-SLM-M' },
        { talla: 'L', stock: 8, sku: 'JNS-SLM-L' }
      ]
    },
    {
      id: 'MOD-303',
      nombre: 'Chaqueta Bomber Urban',
      categoria: 'Chaquetas',
      precio_usd: 50,
      total_stock: 4,
      variantes: [
        { talla: 'S', stock: 1, sku: 'CHQ-BMB-S' },
        { talla: 'M', stock: 0, sku: 'CHQ-BMB-M' },
        { talla: 'L', stock: 3, sku: 'CHQ-BMB-L' }
      ]
    }
  ];
}

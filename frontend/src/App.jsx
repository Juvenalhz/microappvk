import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import StockModule from './components/StockModule';
import KpiModule from './components/KpiModule';
import BcvModule from './components/BcvModule';
import BinanceBrechaModule from './components/BinanceBrechaModule';
import PagoMovilModule from './components/PagoMovilModule';
import BottomNav from './components/BottomNav';
import TicketModal from './components/TicketModal';

export default function App() {
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' | 'bcv' | 'pago'
  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem('vk_last_search') || '');
  
  // Estado para el Cotizador / Ticket de Venta desde el Stock
  const [ticketItems, setTicketItems] = useState([]);
  const [isTicketOpen, setIsTicketOpen] = useState(false);

  const handleAddToCart = async (newItem) => {
    // Si la prenda tiene 1 sola unidad disponible, re-verificar en vivo con ERP para evitar doble venta
    if (newItem.qty === 1 || newItem.stock === 1) {
      try {
        const mId = newItem.modelId || newItem.id.split('-')[0];
        let res = await fetch(`https://microapp-vk-bff.jjhernandezz100.workers.dev/api/stock/verify?id=${encodeURIComponent(mId)}`);
        if (!res.ok) res = await fetch(`/api/stock/verify?id=${encodeURIComponent(mId)}`);

        if (res.ok) {
          const json = await res.json();
          if (json.verified && json.data) {
            const modelData = json.data;
            let currentStock = 0;
            if (Array.isArray(modelData.colores)) {
              const cGroup = modelData.colores.find(c => c.color === newItem.color);
              if (cGroup && Array.isArray(cGroup.tallas)) {
                const tObj = cGroup.tallas.find(t => t.talla === newItem.talla);
                if (tObj) currentStock = tObj.stock;
              }
            } else if (Array.isArray(modelData.variantes)) {
              const vObj = modelData.variantes.find(v => v.talla === newItem.talla);
              if (vObj) currentStock = vObj.stock;
            }

            if (currentStock <= 0) {
              alert(`¡Atención! La prenda "${newItem.nombre}" (Talla ${newItem.talla}) ya no está disponible en el ERP.`);
              return;
            }
          }
        }
      } catch (e) {
        console.warn('[Realtime Verify] Error al verificar stock antes de agregar:', e);
      }
    }

    setTicketItems(prev => {
      const existingIndex = prev.findIndex(item => item.id === newItem.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], cant: updated[existingIndex].cant + 1 };
        return updated;
      }
      return [...prev, newItem];
    });
  };

  const totalTicketCount = ticketItems.reduce((acc, i) => acc + i.cant, 0);

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
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.tasa && Number(parsed.tasa) >= 876 && parsed.fecha_valor) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[App] Error al leer vk_bcv_cache inicial:', e);
    }
    return { 
      tasa: 876.79, 
      tasa_bcv: 876.79, 
      binance: 1011.99, 
      tasa_binance: 1011.99, 
      fuente: 'BCV Oficial (Próximo Día Hábil)', 
      fecha_valor: 'Martes, 13 Octubre 2026', 
      es_fin_de_semana: true 
    };
  });

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  // Persistir último término buscado
  useEffect(() => {
    if (searchTerm) {
      localStorage.setItem('vk_last_search', searchTerm);
    } else {
      localStorage.removeItem('vk_last_search');
    }
  }, [searchTerm]);

  // Escuchar estado de conexión
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
  const fetchBcvRate = useCallback(async (forceRefresh = false) => {
    try {
      const param = forceRefresh ? '?refresh=true' : '';
      let res = await fetch(`https://microapp-vk-bff.jjhernandezz100.workers.dev/api/bcv${param}`);
      if (!res.ok) res = await fetch(`/api/bcv${param}`);

      if (res.ok) {
        const data = await res.json();
        if (data && (data.tasa || data.tasa_bcv)) {
          setBcvRate(data);
          localStorage.setItem('vk_bcv_cache', JSON.stringify(data));
        }
      }
    } catch (err) {
      console.warn('[App] Error al consultar /api/bcv, usando cache local:', err);
    }
  }, []);

  // Guardar tasa BCV o Binance ingresada manualmente por el usuario
  const handleSaveManualBcvRate = async (manualTasa, manualBinance = null, fechaValor = 'Ingreso Manual') => {
    try {
      const payload = { tasa: manualTasa, binance: manualBinance, fecha_valor: fechaValor };
      let res = await fetch('https://microapp-vk-bff.jjhernandezz100.workers.dev/api/bcv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        res = await fetch('/api/bcv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        const json = await res.json();
        if (json.bcv) {
          setBcvRate(json.bcv);
          localStorage.setItem('vk_bcv_cache', JSON.stringify(json.bcv));
          return true;
        }
      }
    } catch (e) {
      console.error('[App] Error al guardar tasa manual:', e);
    }
    return false;
  };

  // Cargar inventario filtrado
  const fetchStock = useCallback(async (query = '') => {
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
        
        setTimeout(() => autoVerifyLowStockModels(json.data || []), 50);

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

  // Auto-verificación en vivo
  const autoVerifyLowStockModels = async (models) => {
    const lowStockModels = models.filter(m => 
      m.variantes && m.variantes.some(v => v.stock === 1)
    );

    if (lowStockModels.length === 0) return;

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

  useEffect(() => {
    if (activeTab === 'binance' || activeTab === 'bcv') {
      fetchBcvRate();
    }
  }, [activeTab, fetchBcvRate]);

  useEffect(() => {
    fetchBcvRate();
    fetchStock('');
  }, [fetchBcvRate, fetchStock]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStock(searchTerm);
    }, 150);

    return () => clearTimeout(timer);
  }, [searchTerm, fetchStock]);

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
        await Promise.all([fetchBcvRate(true), fetchStock(searchTerm)]);
      }
    } catch (err) {
      console.warn('[App] Error al forzar sincronización manual en vivo:', err);
      await Promise.all([fetchBcvRate(true), fetchStock(searchTerm)]);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen h-screen w-full bg-[#0b0f19] text-slate-100 font-sans overflow-hidden relative">
      
      {/* Sidebar para pantallas Desktop (Web) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        bcvRate={bcvRate}
        isOnline={isOnline}
        isSyncing={isSyncing}
        onRefresh={handleRefresh}
        ticketCount={totalTicketCount}
        onOpenTicket={() => setIsTicketOpen(true)}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header Fijo Móvil */}
        <Header 
          bcvRate={bcvRate}
          isOnline={isOnline}
          isSyncing={isSyncing}
          onRefresh={handleRefresh}
          lastSync={lastSync}
          ticketCount={totalTicketCount}
          onOpenTicket={() => setIsTicketOpen(true)}
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
            onAddToCart={handleAddToCart}
            ticketItems={ticketItems}
            onOpenTicket={() => setIsTicketOpen(true)}
          />
        )}

        {activeTab === 'kpi' && (
          <KpiModule bcvRate={bcvRate} />
        )}

        {activeTab === 'bcv' && (
          <BcvModule bcvRate={bcvRate} onSaveManualBcv={handleSaveManualBcvRate} />
        )}

        {activeTab === 'binance' && (
          <BinanceBrechaModule bcvRate={bcvRate} onRefreshRates={fetchBcvRate} onSaveManualBcv={handleSaveManualBcvRate} />
        )}

        {activeTab === 'pago' && (
          <PagoMovilModule bcvRate={bcvRate} />
        )}
      </main>

      {/* Barra de Navegación Inferior Mobile-First */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Modal / Drawer de Cotización / Ticket de Venta */}
      <TicketModal
        isOpen={isTicketOpen}
        onClose={() => setIsTicketOpen(false)}
        ticketItems={ticketItems}
        setTicketItems={setTicketItems}
        bcvRate={bcvRate}
      />

      </div>
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
    },
    {
      id: 'MOD-404',
      nombre: 'Camisa Prestige',
      categoria: 'Camisas',
      precio_usd: 30,
      total_stock: 12,
      colores: [
        {
          color: 'GENERAL',
          total_color_stock: 12,
          tallas: [
            { talla: 'S', stock: 4, sku: 'CAM-PRS-S' },
            { talla: 'M', stock: 6, sku: 'CAM-PRS-M' },
            { talla: 'L', stock: 2, sku: 'CAM-PRS-L' }
          ]
        }
      ],
      variantes: [
        { talla: 'S', stock: 4, sku: 'CAM-PRS-S' },
        { talla: 'M', stock: 6, sku: 'CAM-PRS-M' },
        { talla: 'L', stock: 2, sku: 'CAM-PRS-L' }
      ]
    }
  ];
}

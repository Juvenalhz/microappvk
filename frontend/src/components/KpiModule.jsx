import React, { useState, useEffect } from 'react';
import { 
  Lock, Unlock, ShieldAlert, BarChart3, TrendingUp, TrendingDown, 
  DollarSign, ShoppingBag, Calendar, ArrowUpRight, ArrowDownRight, 
  Layers, Wallet, RefreshCw, AlertTriangle, Package, CheckCircle2, ChevronRight
} from 'lucide-react';

const API_BASE_URL = 'https://microapp-vk-bff.jjhernandezz100.workers.dev';
const KPI_PIN = 'vk2024.24';

export default function KpiModule({ bcvRate }) {
  // Estado de autenticación
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('vk_kpi_authed') === 'true';
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Estados de Filtro de Fechas y Comparaciones
  const [preset, setPreset] = useState('this_month'); // 'today' | 'yesterday' | 'this_month' | 'last_month' | 'custom'
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Comparaciones entre períodos
  const [enableCompare, setEnableCompare] = useState(false);
  const [compareType, setCompareType] = useState('previous_period'); // 'previous_period' | 'previous_year'

  // Pestañas Internas del Módulo KPI
  const [subTab, setSubTab] = useState('resumen'); // 'resumen' | 'canales' | 'finanzas' | 'almacen'

  // Datos de API
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [kpiData, setKpiData] = useState(null);
  const [compareKpiData, setCompareKpiData] = useState(null);

  // Autenticar PIN
  const handleLogin = (e) => {
    if (e) e.preventDefault();
    if (pinInput === KPI_PIN) {
      setIsAuthenticated(true);
      localStorage.setItem('vk_kpi_authed', 'true');
      setPinError(false);
      setPinInput('');
    } else {
      setPinError(true);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('vk_kpi_authed');
    setPinInput('');
  };

  // Manejar cambio de presets de fechas
  const handlePresetChange = (newPreset) => {
    setPreset(newPreset);
    const now = new Date();

    if (newPreset === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (newPreset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split('T')[0];
      setFromDate(yStr);
      setToDate(yStr);
    } else if (newPreset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const todayStr = now.toISOString().split('T')[0];
      setFromDate(start);
      setToDate(todayStr);
    } else if (newPreset === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      setFromDate(start);
      setToDate(end);
    }
  };

  // Cargar KPIs desde Backend BFF
  useEffect(() => {
    if (isAuthenticated) {
      fetchKpis();
    }
  }, [isAuthenticated, fromDate, toDate, enableCompare, compareType]);

  const fetchKpis = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const startIso = new Date(`${fromDate}T00:00:00.000Z`).toISOString();
      const endIso = new Date(`${toDate}T23:59:59.999Z`).toISOString();

      let compStartIso = null;
      let compEndIso = null;

      if (enableCompare) {
        const dStart = new Date(fromDate);
        const dEnd = new Date(toDate);
        const diffMs = dEnd.getTime() - dStart.getTime();

        if (compareType === 'previous_year') {
          dStart.setFullYear(dStart.getFullYear() - 1);
          dEnd.setFullYear(dEnd.getFullYear() - 1);
        } else {
          // Período anterior inmediato
          dEnd.setTime(dStart.getTime() - 86400000);
          dStart.setTime(dEnd.getTime() - diffMs);
        }
        compStartIso = dStart.toISOString();
        compEndIso = dEnd.toISOString();
      }

      let url = `${API_BASE_URL}/api/kpi?fromDate=${encodeURIComponent(startIso)}&toDate=${encodeURIComponent(endIso)}`;
      if (compStartIso && compEndIso) {
        url += `&compareFromDate=${encodeURIComponent(compStartIso)}&compareToDate=${encodeURIComponent(compEndIso)}`;
      }

      let res = await fetch(url);
      if (!res.ok) res = await fetch(`/api/kpi?fromDate=${encodeURIComponent(startIso)}&toDate=${encodeURIComponent(endIso)}`);

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setKpiData(json.kpis);
          setCompareKpiData(json.comparison || null);
        } else {
          throw new Error(json.error || 'Error al procesar KPIs');
        }
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('[KpiModule] Error al obtener datos KPI:', err);
      setErrorMsg('No se pudieron obtener los reportes de FINA ERP.');
    } finally {
      setLoading(false);
    }
  };

  // Helper para calcular % de variación
  const calcVariation = (currVal, prevVal) => {
    if (!prevVal || prevVal === 0) return null;
    const diff = currVal - prevVal;
    const pct = (diff / prevVal) * 100;
    return Math.round(pct * 10) / 10;
  };

  // ---------------------------------------------------------------------------
  // PANTALLA DE BLOQUEO DE SEGURIDAD CON CLAVE
  // ---------------------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] px-4 py-8 animate-fade-in">
        <div className="bg-[#0f172a] border border-amber-500/30 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center space-y-6 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600" />
          
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto text-amber-400 shadow-inner">
            <Lock className="w-8 h-8" />
          </div>

          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight">Módulo KPI & Finanzas</h2>
            <p className="text-xs text-slate-400 mt-1">Introduce la clave de acceso para ver reportes</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <input
                type="password"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError(false);
                }}
                placeholder="Ingresa la clave..."
                className={`w-full bg-slate-900 border text-center font-mono text-lg font-bold tracking-widest text-white px-4 py-3 rounded-2xl focus:outline-none transition-all ${
                  pinError ? 'border-red-500 bg-red-500/10 text-red-300' : 'border-slate-700 focus:border-amber-400'
                }`}
                autoFocus
              />
              {pinError && (
                <p className="text-xs font-semibold text-red-400 mt-1.5 flex items-center justify-center space-x-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Clave incorrecta. Intenta de nuevo.</span>
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-2xl font-extrabold text-sm text-slate-950 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:brightness-110 active:scale-95 transition-all shadow-lg flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>Desbloquear Módulo</span>
            </button>
          </form>

          <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-800">
            🔒 Acceso restringido únicamente a gerencia de VK.
          </p>
        </div>
      </div>
    );
  }

  const kpis = kpiData?.summary || {};
  const daily = kpiData?.daily || {};
  const compareKpis = compareKpiData?.summary;

  return (
    <div className="flex flex-col h-full bg-[#0b0f19] text-slate-100 overflow-y-auto pb-24 no-scrollbar">
      
      {/* BARRA SUPERIOR DE CONTROL: PERÍODO Y COMPARACIÓN */}
      <div className="bg-[#0f172a]/95 border-b border-slate-800 p-2.5 sm:p-3 md:p-3 space-y-2.5 md:space-y-0 sticky top-0 z-30 backdrop-blur-md shadow-md md:flex md:items-center md:justify-between md:gap-3">
        
        {/* Izquierda: Sub-pestañas integradas */}
        <div className="flex items-center space-x-2 shrink-0">
          <div className="hidden lg:flex items-center space-x-2 mr-1.5">
            <div className="p-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <BarChart3 className="w-4 h-4" />
            </div>
            <span className="font-black text-white text-xs whitespace-nowrap">KPIs Live</span>
          </div>

          <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800/80 shrink-0">
            {[
              { id: 'resumen', label: '🎯 Resumen' },
              { id: 'canales', label: '📊 Canales' },
              { id: 'finanzas', label: '💱 Finanzas' },
              { id: 'almacen', label: '📦 Almacén' }
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setSubTab(st.id)}
                className={`px-2.5 py-1 text-center text-xs font-extrabold rounded-xl transition-all whitespace-nowrap ${
                  subTab === st.id
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-inner'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Derecha: Selector de Presets + Rango + Comparar + Botones Acción */}
        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar shrink-0 justify-end">
          {/* Presets */}
          <div className="flex items-center space-x-1 shrink-0">
            {[
              { id: 'today', label: 'Hoy' },
              { id: 'yesterday', label: 'Ayer' },
              { id: 'this_month', label: 'Este Mes' },
              { id: 'last_month', label: 'Mes Ant.' },
              { id: 'custom', label: 'Fechas' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => handlePresetChange(p.id)}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold shrink-0 transition-all border ${
                  preset === p.id
                    ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm scale-105'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Rango Personalizado */}
          {preset === 'custom' && (
            <div className="flex items-center space-x-1 text-xs shrink-0">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-2 py-0.5 text-white font-mono text-[11px] focus:outline-none focus:border-amber-400"
              />
              <span className="text-slate-500 text-[10px]">-</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-2 py-0.5 text-white font-mono text-[11px] focus:outline-none focus:border-amber-400"
              />
            </div>
          )}

          {/* Comparar */}
          <div className="flex items-center space-x-1.5 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800 shrink-0">
            <label className="flex items-center space-x-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enableCompare}
                onChange={(e) => setEnableCompare(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-amber-500/20"
              />
              <span className="text-[11px] font-bold text-slate-300 whitespace-nowrap">Comparar</span>
            </label>

            {enableCompare && (
              <select
                value={compareType}
                onChange={(e) => setCompareType(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-amber-400 font-bold text-[10px] rounded-lg px-1.5 py-0.5 focus:outline-none"
              >
                <option value="previous_period">vs Mes Ant.</option>
                <option value="previous_year">vs Año Ant.</option>
              </select>
            )}
          </div>

          {/* Botones Refrescar / Bloquear */}
          <div className="flex items-center space-x-1 shrink-0">
            <button
              onClick={fetchKpis}
              disabled={loading}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all active:scale-90"
              title="Actualizar datos ERP"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 transition-all"
              title="Bloquear módulo"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>

      {/* ESTADO DE CARGA / ERROR */}
      {errorMsg && (
        <div className="m-4 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center space-x-3 text-red-300 text-xs font-medium">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* CONTENIDO PRINCIPAL SEGÚN SUB-PESTAÑA */}
      <div className="p-3 sm:p-4 space-y-4">
        
        {/* ===================================================================
            PESTAÑA 1: 🎯 RESUMEN & MEDIA DIARIA
            =================================================================== */}
        {subTab === 'resumen' && (
          <div className="space-y-4">
            
            {/* CARDS PRINCIPALES DE IMPACTO (4 Columnas en Web) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              
              {/* Card 1: Facturación Total USD */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 space-y-2 relative overflow-hidden shadow-lg">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-bold uppercase tracking-wider">Facturación USD</span>
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                
                <div className="text-2xl font-black text-white font-mono">
                  ${(kpis.totalAmountUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>

                {enableCompare && compareKpis && (
                  <div className="flex items-center space-x-1 text-xs pt-1">
                    {(() => {
                      const v = calcVariation(kpis.totalAmountUsd, compareKpis.totalAmountUsd);
                      if (v === null) return <span className="text-slate-500">Sin comparativa</span>;
                      const isUp = v >= 0;
                      return (
                        <span className={`flex items-center font-extrabold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          <span>{isUp ? `+${v}%` : `${v}%`}</span>
                          <span className="text-slate-500 font-normal ml-1">vs comp.</span>
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Card 2: Prendas Vendidas */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 space-y-2 relative overflow-hidden shadow-lg">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-bold uppercase tracking-wider">Prendas Vendidas</span>
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                </div>

                <div className="text-2xl font-black text-amber-400 font-mono">
                  {kpis.totalQuantityUnits || 0} <span className="text-xs font-sans text-slate-400">prendas</span>
                </div>

                {enableCompare && compareKpis && (
                  <div className="flex items-center space-x-1 text-xs pt-1">
                    {(() => {
                      const v = calcVariation(kpis.totalQuantityUnits, compareKpis.totalQuantityUnits);
                      if (v === null) return <span className="text-slate-500">Sin comparativa</span>;
                      const isUp = v >= 0;
                      return (
                        <span className={`flex items-center font-extrabold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          <span>{isUp ? `+${v}%` : `${v}%`}</span>
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Card 3: Ticket Promedio USD */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 space-y-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ticket Promedio</div>
                <div className="text-xl font-extrabold text-white font-mono">
                  ${(kpis.avgTicketUsd || 0).toFixed(2)} USD
                </div>
                <p className="text-[10px] text-slate-400">Monto promedio por venta</p>
              </div>

              {/* Card 4: Rotación Prendas/Ticket */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 space-y-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prendas por Ticket</div>
                <div className="text-xl font-extrabold text-emerald-400 font-mono">
                  {kpis.avgItemsPerTicket || 0} prendas
                </div>
                <p className="text-[10px] text-slate-400">Artículos media por compra</p>
              </div>

            </div>

            {/* SECCIÓN DE MEDIA DE VENTAS AL DÍA Y ALERTAS */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-white text-sm flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                    <span>Media de Ventas al Día & Alertas</span>
                  </h3>
                  <p className="text-xs text-slate-400">Promedio diario en el período seleccionado</p>
                </div>

                <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-amber-500/30 text-amber-400 font-mono font-bold text-xs">
                  Media: ${(daily.dailyAvgUsd || 0).toFixed(2)} / día
                </div>
              </div>

              {/* Indicadores de Escala: High / Avg / Low */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded-2xl">
                  <div className="text-emerald-400 font-bold text-base font-mono">{daily.daysAboveAvg || 0} días</div>
                  <span className="text-[10px] text-emerald-300/80 font-bold uppercase">Por Encima (Alto)</span>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/30 p-2 rounded-2xl">
                  <div className="text-blue-400 font-bold text-base font-mono">{daily.daysInAvg || 0} días</div>
                  <span className="text-[10px] text-blue-300/80 font-bold uppercase">En la Media</span>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 p-2 rounded-2xl">
                  <div className="text-red-400 font-bold text-base font-mono">{daily.daysBelowAvg || 0} días</div>
                  <span className="text-[10px] text-red-300/80 font-bold uppercase">Alerta (Bajo)</span>
                </div>
              </div>

              {/* Listado / Histórico Diario Visual */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Detalle por Día:</span>
                <div className="max-h-56 overflow-y-auto space-y-2 no-scrollbar pr-1">
                  {(daily.list || []).map((day) => {
                    const isHigh = day.status === 'HIGH';
                    const isLow = day.status === 'LOW';

                    return (
                      <div 
                        key={day.date}
                        className={`p-3 rounded-2xl border flex items-center justify-between text-xs transition-all ${
                          isHigh 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' 
                            : isLow 
                              ? 'bg-red-500/10 border-red-500/30 text-red-200' 
                              : 'bg-slate-950/70 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <span className="font-mono font-bold text-white">{day.date}</span>
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] uppercase ${
                            isHigh ? 'bg-emerald-500/20 text-emerald-400' : isLow ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {isHigh ? 'Alto' : isLow ? 'Alerta Bajo' : 'Normal'}
                          </span>
                        </div>

                        <div className="flex items-center space-x-4 font-mono font-bold">
                          <span>{day.orderCount} ventas ({day.totalUnits} prendas)</span>
                          <span className="text-amber-400">${day.totalUsd.toFixed(2)} USD</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ===================================================================
            PESTAÑA 2: 📊 CANALES & CATEGORÍAS
            =================================================================== */}
        {subTab === 'canales' && (
          <div className="space-y-4">
            
            {/* VENDEDOR / CANALES DE VENTA */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl">
              <h3 className="font-extrabold text-white text-sm flex items-center space-x-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Desglose por Canales de Venta</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(kpiData?.channels || []).map((ch) => (
                  <div key={ch.name} className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white text-xs">{ch.name}</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">{ch.orderCount} ventas • {ch.totalUnits} prendas</p>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-extrabold text-emerald-400 text-sm">${ch.totalUsd.toFixed(2)} USD</div>
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        {ch.percentageUsd}% del total
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PRENDA SUPERIOR VS PRENDA INFERIOR */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl">
              <h3 className="font-extrabold text-white text-sm flex items-center space-x-2">
                <Package className="w-4 h-4 text-emerald-400" />
                <span>Prenda Superior vs Prenda Inferior (Ventas)</span>
              </h3>

              {(() => {
                const sup = kpiData?.superiorVsInferiorSales || {};
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-center space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Prendas Superiores</span>
                        <div className="text-lg font-black text-amber-400 font-mono">{sup.superiorPercentage || 0}%</div>
                        <p className="text-xs text-slate-300 font-mono font-bold">${(sup.superiorUsd || 0).toFixed(2)} USD ({sup.superiorUnits || 0} unds)</p>
                      </div>

                      <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-center space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Prendas Inferiores</span>
                        <div className="text-lg font-black text-emerald-400 font-mono">{sup.inferiorPercentage || 0}%</div>
                        <p className="text-xs text-slate-300 font-mono font-bold">${(sup.inferiorUsd || 0).toFixed(2)} USD ({sup.inferiorUnits || 0} unds)</p>
                      </div>
                    </div>

                    {/* Barra Visual de Proporción */}
                    <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                      <div style={{ width: `${sup.superiorPercentage || 50}%` }} className="bg-amber-400 h-full" title="Superiores" />
                      <div style={{ width: `${sup.inferiorPercentage || 50}%` }} className="bg-emerald-400 h-full" title="Inferiores" />
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* TOP PRODUCTOS MÁS VENDIDOS */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 space-y-3 shadow-xl">
              <h3 className="font-extrabold text-white text-sm">Top Prendas Más Vendidas</h3>
              <div className="space-y-2">
                {(kpiData?.topProducts || []).map((p, idx) => (
                  <div key={idx} className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold text-[11px] flex items-center justify-center border border-amber-500/30">
                        {idx + 1}
                      </span>
                      <div>
                        <h4 className="font-bold text-white">{p.name}</h4>
                        <span className="text-[10px] text-slate-400 uppercase">{p.category}</span>
                      </div>
                    </div>

                    <div className="text-right font-mono font-bold">
                      <div className="text-emerald-400">{p.units} unds</div>
                      <div className="text-[10px] text-slate-400">${p.totalUsd.toFixed(2)} USD</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ===================================================================
            PESTAÑA 3: 💱 FINANZAS & PÉRDIDA CAMBIARIA
            =================================================================== */}
        {subTab === 'finanzas' && (
          <div className="space-y-4">
            
            {/* CARD PÉRDIDA CAMBIARIA & PRESUPUESTO LIBRE DE REPOSICIÓN */}
            <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-white text-sm flex items-center space-x-2">
                  <Wallet className="w-4 h-4 text-amber-400" />
                  <span>Pérdida por Brecha Cambiaria (BCV vs Binance)</span>
                </h3>
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-md border border-amber-500/30">
                  Estimación de Reposición
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-red-500/30 text-red-300 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-red-400">Pérdida Cambiaria Estimada</span>
                  <div className="text-xl font-black font-mono">${(kpis.exchangeLossUsd || 0).toFixed(2)} USD</div>
                  <p className="text-[10px] text-red-300/80">Por brecha entre BCV y mercado Binance</p>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-2xl border border-emerald-500/30 text-emerald-300 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-emerald-400">Presupuesto Real de Reposición</span>
                  <div className="text-xl font-black font-mono">${(kpis.repositionBudgetUsd || 0).toFixed(2)} USD</div>
                  <p className="text-[10px] text-emerald-300/80">Monto limpio para comprar nueva mercancía</p>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                💡 <strong>Análisis:</strong> Al cobrar en Bs a tasa BCV y comprar insumos a valor mercado, la pérdida cambiaria del período es de <strong>${(kpis.exchangeLossUsd || 0).toFixed(2)} USD</strong>. Se recomienda ajustar el presupuesto de compras a <strong>${(kpis.repositionBudgetUsd || 0).toFixed(2)} USD</strong>.
              </p>
            </div>

            {/* DESGROSE DE MÉTODOS DE PAGO */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl">
              <h3 className="font-extrabold text-white text-sm">Métodos de Pago Cobrados en ERP</h3>

              <div className="space-y-2">
                {(kpiData?.paymentMethods || []).map((pm, idx) => (
                  <div key={idx} className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between text-xs">
                    <div className="font-bold text-white flex items-center space-x-2">
                      <span className={`w-2 h-2 rounded-full ${pm.isVes ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                      <span>{pm.name}</span>
                    </div>

                    <div className="text-right font-mono font-bold">
                      <div className="text-emerald-400">${pm.totalUSD.toFixed(2)} USD</div>
                      {pm.totalVES > 0 && (
                        <div className="text-[10px] text-amber-400">{pm.totalVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ===================================================================
            PESTAÑA 4: 📦 BALANCE DE ALMACÉN
            =================================================================== */}
        {subTab === 'almacen' && (
          <div className="space-y-4">
            
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl">
              <h3 className="font-extrabold text-white text-sm flex items-center space-x-2">
                <Package className="w-4 h-4 text-amber-400" />
                <span>Balance de Stock Disponible en Almacén</span>
              </h3>

              {(() => {
                const sb = kpiData?.stockBalance || {};
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center space-y-1">
                        <span className="text-xs font-bold text-slate-400 uppercase">Stock Parte Superior</span>
                        <div className="text-2xl font-black text-amber-400 font-mono">{sb.superiorStockPercentage || 0}%</div>
                        <p className="text-xs text-slate-300 font-mono font-bold">{sb.stockSuperiorUnits || 0} prendas en tienda</p>
                      </div>

                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center space-y-1">
                        <span className="text-xs font-bold text-slate-400 uppercase">Stock Parte Inferior</span>
                        <div className="text-2xl font-black text-emerald-400 font-mono">{sb.inferiorStockPercentage || 0}%</div>
                        <p className="text-xs text-slate-300 font-mono font-bold">{sb.stockInferiorUnits || 0} prendas en tienda</p>
                      </div>
                    </div>

                    {/* Barra de Proporción del Almacén */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-slate-400">
                        <span>Total Prendas Físicas: {sb.stockTotalUnits || 0} unds</span>
                        <span>Balance de Inventario</span>
                      </div>
                      <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                        <div style={{ width: `${sb.superiorStockPercentage || 50}%` }} className="bg-amber-400 h-full" title="Superiores" />
                        <div style={{ width: `${sb.inferiorStockPercentage || 50}%` }} className="bg-emerald-400 h-full" title="Inferiores" />
                      </div>
                    </div>

                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-200 space-y-1">
                      <span className="font-bold text-amber-400 flex items-center space-x-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Sugerencia de Reposición de Stock:</span>
                      </span>
                      <p className="text-[11px] leading-relaxed">
                        {sb.inferiorStockPercentage < 35 
                          ? '⚠️ El inventario de prendas inferiores (pantalones/shorts) se encuentra bajo en proporción. Se recomienda priorizar la compra de partes inferiores.' 
                          : '🟢 El inventario físico se encuentra equilibrado entre prendas superiores e inferiores.'}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>

          </div>
        )}

      </div>

    </div>
  );
}

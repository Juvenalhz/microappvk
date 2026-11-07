import React, { useState, useEffect } from 'react';
import { 
  Lock, Unlock, ShieldAlert, BarChart3, TrendingUp, TrendingDown, 
  DollarSign, ShoppingBag, Calendar, ArrowUpRight, ArrowDownRight, 
  Layers, Wallet, RefreshCw, AlertTriangle, Package, CheckCircle2, ChevronRight,
  Search, X, SlidersHorizontal, Sparkles, Eye
} from 'lucide-react';

const API_BASE_URL = 'https://microapp-vk-bff.jjhernandezz100.workers.dev';
const KPI_PIN = 'vk2024.24';

// ---------------------------------------------------------------------------
// Fechas en hora de Venezuela (UTC-4, sin horario de verano)
// ---------------------------------------------------------------------------
const VE_TZ = 'America/Caracas';
const VE_OFFSET = '-04:00';

// Fecha de hoy (YYYY-MM-DD) en Venezuela, sin importar la zona horaria del dispositivo
function veToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: VE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Suma/resta días a una fecha YYYY-MM-DD (aritmética de calendario pura)
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addYears(dateStr, years) {
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(y + years, m - 1, day, 12));
  // Ajuste 29-feb → 28-feb
  if (d.getUTCMonth() !== m - 1) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

function monthStart(dateStr, monthOffset = 0) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + monthOffset, 1, 12)).toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStr) {
  return Math.round((new Date(`${toStr}T12:00:00Z`) - new Date(`${fromStr}T12:00:00Z`)) / 86400000);
}

// Inicio y fin del día en Venezuela expresados en ISO (UTC)
const veStartIso = (dateStr) => new Date(`${dateStr}T00:00:00.000${VE_OFFSET}`).toISOString();
const veEndIso = (dateStr) => new Date(`${dateStr}T23:59:59.999${VE_OFFSET}`).toISOString();

function formatVeDayLabel(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(`${dateStr}T12:00:00Z`);
    const label = new Intl.DateTimeFormat('es-VE', {
      timeZone: 'UTC',
      weekday: 'short',
      day: '2-digit',
      month: 'short'
    }).format(d);
    return label.replace(/\./g, '');
  } catch (e) {
    return dateStr;
  }
}

export default function KpiModule({ bcvRate }) {
  // Estado de autenticación
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('vk_kpi_authed') === 'true';
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Estados de Filtro de Fechas y Comparaciones
  const [preset, setPreset] = useState('this_month'); // 'today' | 'yesterday' | 'this_month' | 'last_month' | 'custom'
  const [fromDate, setFromDate] = useState(() => monthStart(veToday()));
  const [toDate, setToDate] = useState(() => veToday());

  // Comparaciones entre períodos
  const [enableCompare, setEnableCompare] = useState(false);
  const [compareType, setCompareType] = useState('previous_period'); // 'previous_period' | 'previous_year'

  // Pestañas Internas del Módulo KPI (Separadas Compras 80/20 y Rotación de Prendas)
  const [subTab, setSubTab] = useState('resumen'); // 'resumen' | 'canales' | 'finanzas' | 'almacen' | 'compras' | 'rotacion'
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Estados interactivos para Pestaña 1: Resumen Diario
  const [dailyFilter, setDailyFilter] = useState('ALL'); // 'ALL' | 'HIGH' | 'AVG' | 'LOW'
  const [showAllDays, setShowAllDays] = useState(false);

  // Estados interactivos para Pestaña 2: Canales & Prendas Vendidas
  const [channelProductSearch, setChannelProductSearch] = useState('');
  const [channelCategoryFilter, setChannelCategoryFilter] = useState('ALL');
  const [showAllSoldProducts, setShowAllSoldProducts] = useState(false);

  // Estados interactivos para Pestaña 5: Compras 80/20 (Cohorts y Matriz)
  const [cohortStatusFilter, setCohortStatusFilter] = useState('ALL'); // 'ALL' | 'HEALTHY' | 'IN_MATURATION' | 'ALERT'
  const [expandedCohortId, setExpandedCohortId] = useState(null);
  const [cohortModelSearch, setCohortModelSearch] = useState('');
  const [cohortModelStatusFilter, setCohortModelStatusFilter] = useState('ALL');
  const [showAllCohortModels, setShowAllCohortModels] = useState(false);
  const [matrixRecFilter, setMatrixRecFilter] = useState('ALL'); // 'ALL' | 'BUY_MORE' | 'BALANCED' | 'BUY_LESS'

  // Estados interactivos para Pestaña 6: Explorador de Rotación por Prenda
  const [rotationFilter, setRotationFilter] = useState('ALL'); // 'ALL' | 'STAR' | 'HEALTHY' | 'SLOW' | 'DEAD_STOCK' | 'SOLD_OUT' | 'HIGH_COST'
  const [rotationCategoryFilter, setRotationCategoryFilter] = useState('ALL');
  const [rotationSearch, setRotationSearch] = useState('');
  const [rotationSortBy, setRotationSortBy] = useState('VELOCITY_DESC'); // 'VELOCITY_DESC' | 'EFFECTIVENESS_DESC' | 'EFFECTIVENESS_ASC' | 'CAPITAL_DESC' | 'STALE_DESC' | 'RECENT_DESC'
  const [showAllRotationProducts, setShowAllRotationProducts] = useState(false);

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
    const today = veToday();

    if (newPreset === 'today') {
      setFromDate(today);
      setToDate(today);
    } else if (newPreset === 'yesterday') {
      const yStr = addDays(today, -1);
      setFromDate(yStr);
      setToDate(yStr);
    } else if (newPreset === 'this_month') {
      setFromDate(monthStart(today));
      setToDate(today);
    } else if (newPreset === 'last_month') {
      setFromDate(monthStart(today, -1));
      setToDate(addDays(monthStart(today), -1));
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
      // Rango completo del día en hora de Venezuela (00:00 a 23:59:59 VE)
      const startIso = veStartIso(fromDate);
      const endIso = veEndIso(toDate);

      let compStartIso = null;
      let compEndIso = null;

      if (enableCompare) {
        let compFrom;
        let compTo;
        if (compareType === 'previous_year') {
          compFrom = addYears(fromDate, -1);
          compTo = addYears(toDate, -1);
        } else {
          // Período anterior inmediato con la misma cantidad de días
          const lengthDays = daysBetween(fromDate, toDate);
          compTo = addDays(fromDate, -1);
          compFrom = addDays(compTo, -lengthDays);
        }
        compStartIso = veStartIso(compFrom);
        compEndIso = veEndIso(compTo);
      }

      const query = `fromDate=${encodeURIComponent(startIso)}&toDate=${encodeURIComponent(endIso)}` +
        (compStartIso && compEndIso
          ? `&compareFromDate=${encodeURIComponent(compStartIso)}&compareToDate=${encodeURIComponent(compEndIso)}`
          : '');

      let res = await fetch(`${API_BASE_URL}/api/kpi?${query}`);
      if (!res.ok) res = await fetch(`/api/kpi?${query}`);

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
      
      {/* BARRA SUPERIOR DE CONTROL: SUB-PESTAÑAS + PERÍODO COLAPSABLE EN MÓVIL */}
      <div className="bg-[#0f172a]/95 border-b border-slate-800 px-2.5 py-2 sm:p-3 sticky top-0 z-30 backdrop-blur-md shadow-md space-y-2 xl:space-y-0 xl:flex xl:items-center xl:justify-between xl:gap-3">
        
        {/* Fila Principal: Sub-pestañas + Controles Compactos en Móvil */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <div className="hidden lg:flex items-center space-x-2 mr-1 shrink-0">
              <div className="p-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <BarChart3 className="w-4 h-4" />
              </div>
              <span className="font-black text-white text-xs whitespace-nowrap">KPIs Live</span>
            </div>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800/80 overflow-x-auto no-scrollbar max-w-full">
              {[
                { id: 'resumen', label: '🎯 Resumen' },
                { id: 'canales', label: '📊 Canales' },
                { id: 'finanzas', label: '💱 Finanzas' },
                { id: 'almacen', label: '📦 Almacén' },
                { id: 'compras', label: '🛍️ Compras 80/20' },
                { id: 'rotacion', label: '⏱️ Rotación' }
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setSubTab(st.id)}
                  className={`px-2.5 py-1.5 text-center text-xs font-extrabold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
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

          {/* Botones Rápidos en Móvil/Tablet para abrir/cerrar Fechas + Refrescar + Bloquear */}
          <div className="flex xl:hidden items-center space-x-1 shrink-0">
            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center space-x-1 border transition-all cursor-pointer ${
                showMobileFilters || enableCompare || preset !== 'this_month'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-slate-900 text-slate-300 border-slate-800'
              }`}
              title="Filtrar fechas y comparaciones"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">
                {preset === 'today' ? 'Hoy' : preset === 'yesterday' ? 'Ayer' : preset === 'this_month' ? 'Este Mes' : preset === 'last_month' ? 'Mes Ant.' : `${fromDate.slice(5)}/${toDate.slice(5)}`}
              </span>
            </button>
            <button
              onClick={fetchKpis}
              disabled={loading}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all active:scale-90 cursor-pointer"
              title="Actualizar datos ERP"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 transition-all cursor-pointer"
              title="Bloquear módulo"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Derecha / Fila Colapsable en Móvil: Selector de Presets + Rango + Comparar + Botones Acción */}
        <div className={`${showMobileFilters ? 'flex' : 'hidden xl:flex'} flex-wrap items-center gap-2 overflow-x-auto no-scrollbar shrink-0 justify-between xl:justify-end pt-1 xl:pt-0 border-t border-slate-800/70 xl:border-t-0`}>
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
                className={`px-2.5 py-1 rounded-xl text-xs font-bold shrink-0 transition-all border cursor-pointer ${
                  preset === p.id
                    ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm'
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
                <option value="previous_period">vs Período Ant.</option>
                <option value="previous_year">vs Año Ant.</option>
              </select>
            )}
          </div>

          {/* Botones Refrescar / Bloquear en Desktop */}
          <div className="hidden xl:flex items-center space-x-1 shrink-0">
            <button
              onClick={fetchKpis}
              disabled={loading}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all active:scale-90 cursor-pointer"
              title="Actualizar datos ERP"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 transition-all cursor-pointer"
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
            
            {/* Aviso si el período es tan largo que no se pudieron descargar todas las facturas */}
            {kpiData?.dataQuality && (kpiData.dataQuality.truncated || kpiData.dataQuality.incomplete) && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center space-x-2 text-amber-200 text-[11px] font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  {kpiData.dataQuality.truncated
                    ? `Período muy largo: se analizaron ${kpiData.dataQuality.pagesFetched * 100} facturas de ${kpiData.dataQuality.pagesReported * 100} aprox. Reduce el rango de fechas para ver cifras exactas.`
                    : 'Algunas páginas de facturas no respondieron desde FINA ERP. Pulsa actualizar para reintentar.'}
                </span>
              </div>
            )}

            {/* CARDS PRINCIPALES DE IMPACTO (5 Columnas en Web) */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              
              {/* Card 1: Facturación Total USD (Desglosando Mercancía vs Delivery) */}
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

                {/* Desglose Mercancía vs Delivery */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                  <span className="bg-slate-950 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-lg font-bold">
                    👕 Mercancía: ${(kpis.productSalesUsd ?? kpis.totalAmountUsd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  {(kpis.extraChargesUsd || 0) > 0 && (
                    <span className="bg-slate-950 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded-lg font-bold">
                      🛵 Delivery: +${(kpis.extraChargesUsd || 0).toFixed(2)}
                    </span>
                  )}
                </div>

                <p className="text-[10px] text-slate-400 leading-relaxed">
                  {kpis.paidDocsCount ?? kpis.totalDocsCount ?? 0} ventas cobradas
                  {(kpis.collabDocsCount || 0) > 0 && (
                    <span className="text-amber-300/90"> · {kpis.collabDocsCount} colab. ($0)</span>
                  )}
                  {kpis.annulledDocsCount > 0 && (
                    <span className="text-slate-500"> · {kpis.annulledDocsCount} anuladas (${(kpis.annulledAmountUsd || 0).toFixed(0)})</span>
                  )}
                </p>

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
                  <span className="text-xs font-bold uppercase tracking-wider">Prendas Salientes</span>
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                </div>

                <div className="text-2xl font-black text-amber-400 font-mono">
                  {kpis.totalQuantityUnits || 0} <span className="text-xs font-sans text-slate-400">prendas</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  {(kpis.collabUnitsCount || 0) > 0
                    ? `${kpis.paidQuantityUnits || 0} vendidas + ${kpis.collabUnitsCount} en colab. ($0)`
                    : 'Sin bolsas, cajas ni accesorios comodín'}
                </p>

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
                {(kpis.extraChargesUsd || 0) > 0 ? (
                  <p className="text-[10px] text-slate-400">
                    Solo mercancía: <strong className="text-slate-200 font-mono">${(kpis.avgMerchandiseTicketUsd || 0).toFixed(2)} USD</strong> / venta
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400">Gasto promedio por cada venta cobrada</p>
                )}

                {enableCompare && compareKpis && (
                  <div className="flex items-center space-x-1 text-xs pt-1">
                    {(() => {
                      const v = calcVariation(kpis.avgTicketUsd, compareKpis.avgTicketUsd);
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

              {/* Card 4: Prendas por Ticket */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 space-y-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prendas por Ticket</div>
                <div className="text-xl font-extrabold text-emerald-400 font-mono">
                  {(kpis.avgItemsPerTicket || 0).toFixed(2)} prendas
                </div>
                <p className="text-[10px] text-slate-400">Promedio de prendas por cada venta cobrada</p>

                {enableCompare && compareKpis && (
                  <div className="flex items-center space-x-1 text-xs pt-1">
                    {(() => {
                      const v = calcVariation(kpis.avgItemsPerTicket, compareKpis.avgItemsPerTicket);
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

              {/* Card 5: Utilidad y Margen (Afectada por Colaboraciones y Costos de Factura) */}
              <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-emerald-500/10 to-slate-900/90 border border-emerald-500/30 rounded-3xl p-4 space-y-2 shadow-lg">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Utilidad</span>
                  <span className="text-[10px] font-black text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    Margen {(kpis.utilityMarginPct || 0).toFixed(1)}%
                  </span>
                </div>
                <div className="text-xl font-extrabold text-emerald-400 font-mono">
                  ${(kpis.totalUtilityUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Ganancia = mercancía − costos de factura
                  {(kpis.collabDocsCount || 0) > 0 && (
                    <span className="block text-amber-300/90 font-mono mt-0.5">
                      🤝 Descuenta -${(kpis.collabCostUsd || 0).toFixed(2)} de {kpis.collabDocsCount} colab. ($0)
                    </span>
                  )}
                </p>

                {enableCompare && compareKpis && (
                  <div className="flex items-center space-x-1 text-xs">
                    {(() => {
                      const v = calcVariation(kpis.totalUtilityUsd, compareKpis.totalUtilityUsd);
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

            </div>

            {/* SECCIÓN DE MEDIA DE VENTAS AL DÍA (EN USD Y EN CANTIDAD DE VENTAS) Y ALERTAS */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="font-extrabold text-white text-sm flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                    <span>Media Diaria (Facturación & Cantidad de Ventas)</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Promedio sobre {daily.completedDaysCount || daily.daysCount || 0} días activos del período
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-amber-500/30 text-amber-400 font-mono font-bold text-xs">
                    💵 Media: ${(daily.dailyAvgUsd || 0).toFixed(2)} / día
                  </div>
                  <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-sky-500/30 text-sky-400 font-mono font-bold text-xs">
                    🧾 Media: {(daily.dailyAvgOrders || 0).toFixed(1)} ventas / día ({(daily.dailyAvgUnits || 0).toFixed(1)} prendas)
                  </div>
                </div>
              </div>

              {/* Doble Escala Interactiva: 1) Por Facturación USD  2) Por Cantidad de Ventas Día a Día */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Escala por Facturación USD (Interactiva: filtra listado inferior) */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                    <span>💵 Escala por Facturación ($/día) · <span className="text-slate-400 font-normal">Toca para filtrar</span></span>
                    <span className="font-mono text-amber-400">${(daily.dailyAvgUsd || 0).toFixed(2)} prom.</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <button
                      onClick={() => setDailyFilter(dailyFilter === 'HIGH' ? 'ALL' : 'HIGH')}
                      className={`p-2 rounded-xl border transition-all cursor-pointer ${
                        dailyFilter === 'HIGH'
                          ? 'bg-emerald-500/25 border-emerald-400 ring-1 ring-emerald-400/50'
                          : 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
                      }`}
                    >
                      <div className="text-emerald-400 font-bold text-sm font-mono">{daily.daysAboveAvg || 0} días</div>
                      <span className="text-[9px] text-emerald-300/80 font-bold uppercase">Alto (+15%)</span>
                    </button>
                    <button
                      onClick={() => setDailyFilter(dailyFilter === 'AVG' ? 'ALL' : 'AVG')}
                      className={`p-2 rounded-xl border transition-all cursor-pointer ${
                        dailyFilter === 'AVG'
                          ? 'bg-blue-500/25 border-blue-400 ring-1 ring-blue-400/50'
                          : 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20'
                      }`}
                    >
                      <div className="text-blue-400 font-bold text-sm font-mono">{daily.daysInAvg || 0} días</div>
                      <span className="text-[9px] text-blue-300/80 font-bold uppercase">En la Media</span>
                    </button>
                    <button
                      onClick={() => setDailyFilter(dailyFilter === 'LOW' ? 'ALL' : 'LOW')}
                      className={`p-2 rounded-xl border transition-all cursor-pointer ${
                        dailyFilter === 'LOW'
                          ? 'bg-red-500/25 border-red-400 ring-1 ring-red-400/50'
                          : 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
                      }`}
                    >
                      <div className="text-red-400 font-bold text-sm font-mono">{daily.daysBelowAvg || 0} días</div>
                      <span className="text-[9px] text-red-300/80 font-bold uppercase">Alerta Bajo</span>
                    </button>
                  </div>
                </div>

                {/* Escala por Cantidad de Ventas Día a Día */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                    <span>🧾 Escala por Cantidad de Ventas (ventas/día)</span>
                    <span className="font-mono text-sky-400">{(daily.dailyAvgOrders || 0).toFixed(1)} ventas prom.</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded-xl">
                      <div className="text-emerald-400 font-bold text-sm font-mono">{daily.ordersDaysAboveAvg || 0} días</div>
                      <span className="text-[9px] text-emerald-300/80 font-bold uppercase">Alto (+15%)</span>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/30 p-2 rounded-xl">
                      <div className="text-blue-400 font-bold text-sm font-mono">{daily.ordersDaysInAvg || 0} días</div>
                      <span className="text-[9px] text-blue-300/80 font-bold uppercase">En la Media</span>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/30 p-2 rounded-xl">
                      <div className="text-red-400 font-bold text-sm font-mono">{daily.ordersDaysBelowAvg || 0} días</div>
                      <span className="text-[9px] text-red-300/80 font-bold uppercase">Alerta Bajo</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Listado / Histórico Diario Visual (Más reciente primero, sin doble scroll atrapado) */}
              {(() => {
                const rawDays = daily.list || [];
                const filteredDays = rawDays.filter((d) => {
                  if (dailyFilter === 'ALL') return true;
                  if (dailyFilter === 'HIGH') return d.status === 'HIGH';
                  if (dailyFilter === 'LOW') return d.status === 'LOW';
                  if (dailyFilter === 'AVG') return d.status === 'AVG' || d.status === 'IN_PROGRESS';
                  return true;
                });
                const visibleDays = showAllDays ? filteredDays : filteredDays.slice(0, 10);

                return (
                  <div className="space-y-2.5 pt-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          Detalle Día a Día ({filteredDays.length} días):
                        </span>
                        {dailyFilter !== 'ALL' && (
                          <button
                            onClick={() => setDailyFilter('ALL')}
                            className="text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-lg hover:bg-amber-500/25 cursor-pointer"
                          >
                            ✕ Quitar filtro ({dailyFilter === 'HIGH' ? 'Alto' : dailyFilter === 'LOW' ? 'Alerta Bajo' : 'En la Media'})
                          </button>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {(daily.dailyAvgMerchandiseUsd || 0) > 0 && (daily.dailyAvgUsd || 0) !== (daily.dailyAvgMerchandiseUsd || 0) && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            Media solo mercancía: ${(daily.dailyAvgMerchandiseUsd || 0).toFixed(2)}/día
                          </span>
                        )}
                        {filteredDays.length > 10 && (
                          <button
                            onClick={() => setShowAllDays(!showAllDays)}
                            className="text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-xl cursor-pointer"
                          >
                            {showAllDays ? 'Compactar a últimos 10 días' : `Ver todos (${filteredDays.length} días)`}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                      {visibleDays.map((day) => {
                        const isHigh = day.status === 'HIGH';
                        const isLow = day.status === 'LOW';
                        const isInProgress = day.status === 'IN_PROGRESS';

                        const ordHigh = day.ordersStatus === 'HIGH';
                        const ordLow = day.ordersStatus === 'LOW';
                        const ordProg = day.ordersStatus === 'IN_PROGRESS';

                        return (
                          <div 
                            key={day.date}
                            className={`p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs transition-all ${
                              isHigh 
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' 
                                : isLow 
                                  ? 'bg-red-500/10 border-red-500/30 text-red-200' 
                                  : 'bg-slate-950/70 border-slate-800 text-slate-300'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono font-bold text-white capitalize">
                                {formatVeDayLabel(day.date)} <span className="text-slate-500 font-normal text-[10px]">({day.date})</span>
                              </span>
                              <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] uppercase ${
                                isHigh
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : isLow
                                    ? 'bg-red-500/20 text-red-400'
                                    : isInProgress
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : 'bg-slate-800 text-slate-400'
                              }`}>
                                {isHigh ? '💵 Alto' : isLow ? '💵 Alerta Bajo' : isInProgress ? '⏳ En Curso' : '💵 Normal'}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] uppercase ${
                                ordHigh
                                  ? 'bg-sky-500/20 text-sky-300'
                                  : ordLow
                                    ? 'bg-red-500/20 text-red-300'
                                    : ordProg
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : 'bg-slate-800 text-slate-400'
                              }`}>
                                {ordHigh ? '🧾 Ventas Alto' : ordLow ? '🧾 Ventas Bajo' : ordProg ? '🧾 En Curso' : '🧾 Ventas Media'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end space-x-3 font-mono font-bold shrink-0">
                              <div className="text-right">
                                <span className="text-slate-200">{day.orderCount} vtas ({day.totalUnits} unds)</span>
                                {(day.collabOrderCount || 0) > 0 && (
                                  <span className="block text-[9px] text-amber-300/80">incl. {day.collabOrderCount} colab. ($0)</span>
                                )}
                              </div>
                              <div className="text-right">
                                <span className="text-amber-400 block">${day.totalUsd.toFixed(2)}</span>
                                {(day.deliveryUsd || 0) > 0 && (
                                  <span className="text-[9px] text-slate-400 block">
                                    M:${(day.merchandiseUsd ?? day.totalUsd).toFixed(0)} + D:${day.deliveryUsd.toFixed(0)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

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
                    <div className="space-y-1">
                      <h4 className="font-bold text-white text-xs">{ch.name}</h4>
                      <p className="text-[10px] text-slate-400">
                        {ch.orderCount} ventas
                        {(ch.collabOrderCount || 0) > 0 ? ` (${ch.collabOrderCount} colab. $0)` : ''} • {ch.totalUnits} prendas
                      </p>
                      {(ch.deliveryUsd || 0) > 0 && (
                        <p className="text-[10px] font-mono text-slate-300">
                          👕 Mercancía: <strong className="text-emerald-300">${(ch.merchandiseUsd ?? ch.totalUsd).toFixed(2)}</strong> · 🛵 Delivery: <strong className="text-amber-300">+${ch.deliveryUsd.toFixed(2)}</strong>
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-extrabold text-emerald-400 text-sm">${ch.totalUsd.toFixed(2)} USD</div>
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        {ch.percentageUsd}% del total
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PRENDA SUPERIOR VS INFERIOR VS CONJUNTOS */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl">
              <h3 className="font-extrabold text-white text-sm flex items-center space-x-2">
                <Package className="w-4 h-4 text-emerald-400" />
                <span>Ventas por Tipo de Prenda</span>
              </h3>
              <p className="text-[11px] text-slate-400 -mt-1">Superior (camisas, chemises, franelas, chaquetas) · Inferior (pantalones, jeans, shorts) · Conjuntos (categoría SET)</p>

              {(() => {
                const sup = kpiData?.superiorVsInferiorSales || {};
                const segments = [
                  { key: 'sup', label: 'Superiores', pct: sup.superiorPercentage, usd: sup.superiorUsd, units: sup.superiorUnits, text: 'text-amber-400', bg: 'bg-amber-400' },
                  { key: 'inf', label: 'Inferiores', pct: sup.inferiorPercentage, usd: sup.inferiorUsd, units: sup.inferiorUnits, text: 'text-emerald-400', bg: 'bg-emerald-400' },
                  { key: 'set', label: 'Conjuntos (SET)', pct: sup.conjuntoPercentage, usd: sup.conjuntoUsd, units: sup.conjuntoUnits, text: 'text-sky-400', bg: 'bg-sky-400' },
                  { key: 'otro', label: 'Otros calzados/gorras', pct: sup.otrosPercentage, usd: sup.otrosUsd, units: sup.otrosUnits, text: 'text-slate-300', bg: 'bg-slate-500' }
                ].filter(s => s.key !== 'otro' || (s.units || 0) > 0);

                return (
                  <div className="space-y-3">
                    <div className={`grid gap-3 ${segments.length > 3 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                      {segments.map(s => (
                        <div key={s.key} className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-center space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">{s.label}</span>
                          <div className={`text-lg font-black font-mono ${s.text}`}>{s.pct || 0}%</div>
                          <p className="text-[11px] text-slate-300 font-mono font-bold">${(s.usd || 0).toFixed(2)}</p>
                          <p className="text-[10px] text-slate-500 font-mono">{s.units || 0} unds</p>
                        </div>
                      ))}
                    </div>

                    {/* Barra Visual de Proporción */}
                    <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                      {segments.map(s => (
                        <div key={s.key} style={{ width: `${s.pct || 0}%` }} className={`${s.bg} h-full`} title={s.label} />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* EXPLORADOR DE PRENDAS VENDIDAS EN EL PERÍODO (CON BUSCADOR Y VER TODAS) */}
            {(() => {
              const allSold = kpiData?.allProductsSold || kpiData?.topProducts || [];
              const soldCategories = ['ALL', ...Array.from(new Set(allSold.map(p => p.category).filter(Boolean))).sort()];
              const filteredSold = allSold.filter(p => {
                if (channelCategoryFilter !== 'ALL' && p.category !== channelCategoryFilter) return false;
                if (channelProductSearch.trim()) {
                  const q = channelProductSearch.toLowerCase().trim();
                  return (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
                }
                return true;
              });
              const visibleSold = (showAllSoldProducts || channelProductSearch.trim() || channelCategoryFilter !== 'ALL')
                ? filteredSold
                : filteredSold.slice(0, 10);

              return (
                <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="font-extrabold text-white text-sm flex items-center space-x-2">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <span>Ranking de Prendas Salientes en el Período ({filteredSold.length} modelos)</span>
                      </h3>
                      <p className="text-[10px] text-slate-400">
                        Coincide 100% con FINA ERP (incluye ventas cobradas + colaboraciones $0 desglosadas; excluye bolsas y cajas).
                      </p>
                    </div>

                    {/* Buscador + Botón Ver Todas */}
                    <div className="flex items-center space-x-2">
                      <div className="relative flex-1 sm:w-56">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={channelProductSearch}
                          onChange={(e) => setChannelProductSearch(e.target.value)}
                          placeholder="Buscar prenda vendida..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                        />
                        {channelProductSearch && (
                          <button
                            onClick={() => setChannelProductSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {filteredSold.length > 10 && (
                        <button
                          onClick={() => setShowAllSoldProducts(!showAllSoldProducts)}
                          className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 shrink-0 cursor-pointer"
                        >
                          {showAllSoldProducts ? 'Ver Top 10' : `Ver todas (${filteredSold.length})`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Chips de Categoría */}
                  {soldCategories.length > 2 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                      {soldCategories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setChannelCategoryFilter(cat)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold shrink-0 border transition-all cursor-pointer ${
                            channelCategoryFilter === cat
                              ? 'bg-amber-400 text-slate-950 border-amber-400'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          {cat === 'ALL' ? `Todas (${allSold.length})` : cat}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {visibleSold.map((p, idx) => (
                      <div key={idx} className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between text-xs hover:border-slate-700 transition-all">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-mono font-bold text-[11px] flex items-center justify-center border border-amber-500/30 shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <h4 className="font-bold text-white truncate">{p.name}</h4>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] text-slate-400 uppercase font-mono">{p.category}</span>
                              {(p.collabUnits || 0) > 0 && (
                                <span className="text-[9px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded">
                                  {p.paidUnits ?? (p.units - p.collabUnits)} vend. + {p.collabUnits} colab. ($0)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono font-bold shrink-0 ml-2">
                          <div className="text-emerald-400">{p.units} unds</div>
                          <div className="text-[10px] text-slate-400">${p.totalUsd.toFixed(2)} USD</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

          </div>
        )}

        {/* ===================================================================
            PESTAÑA 3: 💱 FINANZAS, BRECHA & CUADRE EXACTO DE CAJA
            =================================================================== */}
        {subTab === 'finanzas' && (
          <div className="space-y-4">
            
            {/* CARD PÉRDIDA CAMBIARIA & VENTAS NETAS USD REALES */}
            <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-white text-sm flex items-center space-x-2">
                  <Wallet className="w-4 h-4 text-amber-400" />
                  <span>Pérdida por Brecha Cambiaria (BCV vs Binance)</span>
                </h3>
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-md border border-amber-500/30">
                  Brecha actual {(kpis.exchangeGapPct || 0).toFixed(1)}%
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-red-500/30 text-red-300 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-red-400">Pérdida Cambiaria Estimada</span>
                  <div className="text-xl font-black font-mono">${(kpis.exchangeLossUsd || 0).toFixed(2)} USD</div>
                  <p className="text-[10px] text-red-300/80">Valor que pierden los Bs netos cobrados al pasarlos a tasa Binance</p>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-2xl border border-emerald-500/30 text-emerald-300 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-emerald-400">Ventas Netas USD Reales</span>
                  <div className="text-xl font-black font-mono">${(kpis.netRealUsd ?? kpis.repositionBudgetUsd ?? 0).toFixed(2)} USD</div>
                  <p className="text-[10px] text-emerald-300/80">Facturación menos pérdida cambiaria (sin descontar costo)</p>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-2xl border border-sky-500/30 text-sky-300 space-y-1">
                  <span className="text-[10px] font-bold uppercase text-sky-400">Utilidad Real Post-Brecha</span>
                  <div className="text-xl font-black font-mono">${(kpis.realUtilityAfterExchangeUsd ?? ((kpis.totalUtilityUsd || 0) - (kpis.exchangeLossUsd || 0))).toFixed(2)} USD</div>
                  <p className="text-[10px] text-sky-300/80">Utilidad neta (${(kpis.totalUtilityUsd || 0).toFixed(2)}) menos pérdida cambiaria</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Bs netos en bancos (con cambios y vueltos)</span>
                  <strong className="text-amber-400 font-mono">{(kpis.vesCollectedTotal || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs</strong>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Equivalente a tasa BCV de cada venta</span>
                  <strong className="text-white font-mono">${(kpis.vesUsdAtSaleRate || 0).toFixed(2)} USD</strong>
                </div>
                <div className="col-span-2 sm:col-span-1 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block">Cobrado neto en Divisas (USD)</span>
                  <strong className="text-emerald-400 font-mono">${(kpis.usdCollectedTotal || 0).toFixed(2)} USD</strong>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                💡 <strong>Análisis:</strong> Cada pago y vuelto en Bs (incluyendo diferencias por cambios de prenda) se valora con la tasa BCV de esa venta y se compara contra la brecha con Binance ({(kpis.exchangeGapPct || 0).toFixed(1)}%). Al convertir esos Bs a divisas se pierden aprox. <strong>${(kpis.exchangeLossUsd || 0).toFixed(2)} USD</strong>, dejando una utilidad real en divisas de <strong>${(kpis.realUtilityAfterExchangeUsd ?? ((kpis.totalUtilityUsd || 0) - (kpis.exchangeLossUsd || 0))).toFixed(2)} USD</strong>.
              </p>
            </div>

            {/* CUADRE EXACTO DE CAJA Y BANCOS POR MÉTODO DE PAGO */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div>
                  <h3 className="font-extrabold text-white text-sm">Cuadre Exacto de Caja y Bancos</h3>
                  <p className="text-[11px] text-slate-400">
                    Calculado directamente de facturas (Entradas + Cambios de Prenda − Vueltos dados de cada cuenta/gaveta)
                  </p>
                </div>
                <div className="text-xs font-mono font-bold bg-slate-950 px-3 py-1 rounded-xl border border-slate-800 text-emerald-400">
                  Total Cuadrado: ${((kpis.vesUsdNominalTotal || 0) + (kpis.usdCollectedTotal || 0) || kpis.totalAmountUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(kpiData?.paymentMethods || []).map((pm, idx) => (
                  <div key={idx} className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between text-xs gap-2">
                    <div className="space-y-0.5">
                      <div className="font-bold text-white flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${pm.isVes ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                        <span>{pm.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase ${
                          pm.isVes ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {pm.isVes ? 'Bs / VES' : 'Divisas USD'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono pl-4">
                        {pm.txCount || 0} cobros ({pm.percentageUsd ?? 0}% del total)
                        {(pm.outUSD || 0) > 0.01 && (
                          <span className="text-slate-300">
                            {' '}• Entró ${(pm.inUSD || 0).toFixed(2)} − Vuelto ${(pm.outUSD || 0).toFixed(2)}
                            {pm.isVes && (pm.outVES || 0) > 0.1
                              ? ` (${(pm.outVES || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs)`
                              : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right font-mono font-bold shrink-0">
                      <div className="text-emerald-400 text-sm">${pm.totalUSD.toFixed(2)} USD</div>
                      {pm.isVes && pm.totalVES > 0 && (
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
            PESTAÑA 4: 📦 BALANCE DE ALMACÉN, CURVA DE TALLAS Y CATEGORÍAS
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
                const infVsSup = sb.inferiorVsSuperiorPercentage ?? (
                  (sb.stockSuperiorUnits || 0) + (sb.stockInferiorUnits || 0) > 0
                    ? Math.round(((sb.stockInferiorUnits || 0) / ((sb.stockSuperiorUnits || 0) + (sb.stockInferiorUnits || 0))) * 1000) / 10
                    : 50
                );
                const segments = [
                  { key: 'sup', label: 'Parte Superior', pct: sb.superiorStockPercentage, units: sb.stockSuperiorUnits, text: 'text-amber-400', bg: 'bg-amber-400' },
                  { key: 'inf', label: 'Parte Inferior', pct: sb.inferiorStockPercentage, units: sb.stockInferiorUnits, text: 'text-emerald-400', bg: 'bg-emerald-400' },
                  { key: 'set', label: 'Conjuntos (SET)', pct: sb.conjuntoStockPercentage, units: sb.stockConjuntoUnits, text: 'text-sky-400', bg: 'bg-sky-400' },
                  { key: 'otro', label: 'Calzado y Gorras (OC)', pct: sb.otrosStockPercentage, units: sb.stockOtrosUnits, text: 'text-slate-300', bg: 'bg-slate-500' }
                ].filter(s => s.key !== 'otro' || (s.units || 0) > 0);

                return (
                  <div className="space-y-4">
                    <div className={`grid gap-3 ${segments.length > 3 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                      {segments.map(s => (
                        <div key={s.key} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-center space-y-1">
                          <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase">{s.label}</span>
                          <div className={`text-2xl font-black font-mono ${s.text}`}>{s.pct || 0}%</div>
                          <p className="text-[11px] text-slate-300 font-mono font-bold">{s.units || 0} prendas</p>
                        </div>
                      ))}
                    </div>

                    {/* Barra de Proporción del Almacén */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-slate-400">
                        <span>Total Prendas Físicas: {sb.stockTotalUnits || 0} unds</span>
                        <span>Excluye bolsas, cajas, correcciones y accesorios comodín</span>
                      </div>
                      <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                        {segments.map(s => (
                          <div key={s.key} style={{ width: `${s.pct || 0}%` }} className={`${s.bg} h-full`} title={s.label} />
                        ))}
                      </div>
                    </div>

                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-200 space-y-1">
                      <span className="font-bold text-amber-400 flex items-center space-x-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Sugerencia de Reposición de Stock:</span>
                      </span>
                      <p className="text-[11px] leading-relaxed">
                        {infVsSup < 35
                          ? `⚠️ Por cada 100 prendas superiores e inferiores, solo ${Math.round(infVsSup)} son de la parte inferior (pantalones/shorts). Se recomienda priorizar la compra de partes inferiores.`
                          : infVsSup > 65
                            ? `⚠️ Por cada 100 prendas superiores e inferiores, ${Math.round(infVsSup)} son de la parte inferior. Se recomienda priorizar la compra de partes superiores (camisas, chemises, franelas).`
                            : '🟢 El inventario físico se encuentra equilibrado entre prendas superiores e inferiores.'}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* CURVA DE TALLAS DISPONIBLES EN ALMACÉN */}
            {(kpiData?.stockBalance?.sizeCurve || []).length > 0 && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl">
                <div>
                  <h3 className="font-extrabold text-white text-sm flex items-center space-x-2">
                    <SlidersHorizontal className="w-4 h-4 text-sky-400" />
                    <span>Curva de Tallas Disponible en Tienda</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Detecta de un vistazo si alguna talla clave (S, M, L, XL) se está quedando sin stock en el almacén.
                  </p>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                  {(kpiData?.stockBalance?.sizeCurve || []).map((sc) => (
                    <div key={sc.size} className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center space-y-1">
                      <span className="text-xs font-black text-amber-400 font-mono block">Talla {sc.size}</span>
                      <div className="text-lg font-black text-white font-mono">{sc.units} <span className="text-[10px] font-normal text-slate-400">unds</span></div>
                      <span className="text-[10px] font-mono text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20 inline-block">
                        {sc.pct}% del stock
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STOCK Y VALOR POR CATEGORÍA */}
            {(kpiData?.stockBalance?.stockByCategory || []).length > 0 && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl">
                <div>
                  <h3 className="font-extrabold text-white text-sm flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>Distribución de Inventario y Capital por Categoría</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Unidades físicas, peso porcentual en el almacén, costo invertido y valor de venta (PVP) por familia de prenda.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {(kpiData?.stockBalance?.stockByCategory || []).map((cat) => (
                    <div key={cat.category} className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-white text-xs sm:text-sm">{cat.category}</span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          {cat.pct}% del almacén
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px] font-mono bg-slate-900/70 p-2 rounded-xl border border-slate-800/80">
                        <div>
                          <span className="text-[9px] text-slate-400 block">Unidades</span>
                          <strong className="text-white">{cat.units} unds</strong>
                          <span className="text-[9px] text-slate-500 block">{cat.modelsCount} mod.</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 block">Costo Stock</span>
                          <strong className="text-sky-300">${Number(cat.costValueUsd ?? cat.costUsd ?? 0).toFixed(0)}</strong>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 block">Valor PVP</span>
                          <strong className="text-emerald-400">${Number(cat.retailValueUsd ?? cat.retailUsd ?? 0).toFixed(0)}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ===================================================================
            PESTAÑA 5: 🛍️ COMPRAS 80/20 (EFECTIVIDAD POR COMPRA Y MATRIZ DE SELECCIÓN)
            =================================================================== */}
        {subTab === 'compras' && (() => {
          const rot = kpiData?.rotation || {};
          const gs = rot.globalSummary || {};
          const cohorts = rot.purchaseCohorts || [];
          const catMatrix = rot.categorySelectionMatrix || [];

          const filteredCohorts = cohorts.filter((c) => {
            if (cohortStatusFilter === 'ALL') return true;
            if (cohortStatusFilter === 'HEALTHY') return c.status === 'HEALTHY_80_20';
            if (cohortStatusFilter === 'IN_MATURATION') return c.status === 'IN_MATURATION';
            if (cohortStatusFilter === 'ALERT') return c.status === 'ALERT_DEAD_STOCK' || c.status === 'WARNING_SLOW';
            return true;
          });

          const filteredMatrix = catMatrix.filter((cat) => {
            if (matrixRecFilter === 'ALL') return true;
            return cat.recommendation === matrixRecFilter;
          });

          return (
            <div className="space-y-4">

              {/* 1. RESUMEN EJECUTIVO DE EFECTIVIDAD DE COMPRA Y META 80/20 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-white text-sm flex items-center space-x-2">
                      <TrendingUp className="w-4 h-4 text-amber-400" />
                      <span>Salud Global de Compras & Regla 80/20 (Máx. 20% Merma / Dead Stock)</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Mide qué porcentaje de todas las prendas compradas ya se vendió desde su fecha de ingreso al ERP y cuánto capital sigue en percha.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold border shrink-0 ${
                      (gs.matureDeadStockPct || 0) <= 20
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                    }`}>
                      {(gs.matureDeadStockPct || 0) <= 20
                        ? `🟢 Compras Maduras en Meta (${gs.matureDeadStockPct || 0}% ≤ 20% máx)`
                        : `🔴 Merma en Compras Maduras: ${gs.matureDeadStockPct || 0}% (Meta ≤ 20%)`}
                    </span>
                    <button
                      onClick={() => setSubTab('rotacion')}
                      className="px-3 py-1 rounded-full text-[11px] font-extrabold bg-amber-400 text-slate-950 hover:brightness-110 transition-all cursor-pointer shrink-0"
                    >
                      ⏱️ Ir a Explorador de Prendas →
                    </button>
                  </div>
                </div>

                {/* Tarjetas Principales de Efectividad y Capital */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Efectividad Global */}
                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-emerald-500/30 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-emerald-400 block">
                      % Efectividad Global (Sell-Through)
                    </span>
                    <div className="text-2xl font-black font-mono text-white">
                      {gs.globalEffectivenessPct || 0}%
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono">
                      <strong className="text-emerald-400">{gs.totalSoldUnits || 0} vendidas</strong> de {gs.totalInitialUnits || 0} compradas
                    </p>
                  </div>

                  {/* % Stock Restante / Merma */}
                  <div className={`bg-slate-950 p-3.5 rounded-2xl border space-y-1 ${
                    (gs.globalRemainingPct || 0) <= 20 ? 'border-emerald-500/30' : 'border-amber-500/30'
                  }`}>
                    <span className="text-[10px] font-bold uppercase text-amber-400 block">
                      % Stock por Evacuar (Meta ≤ 20%)
                    </span>
                    <div className="text-2xl font-black font-mono text-amber-300">
                      {gs.globalRemainingPct || 0}%
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono">
                      <strong className="text-white">{gs.totalCurrentStock || 0} prendas</strong> hoy en almacén
                    </p>
                  </div>

                  {/* Dead Stock Crítico (+45d / Sin Rotación) */}
                  <div
                    onClick={() => {
                      setRotationFilter('DEAD_STOCK');
                      setSubTab('rotacion');
                    }}
                    className="bg-slate-950 p-3.5 rounded-2xl border border-rose-500/30 hover:border-rose-400 space-y-1 cursor-pointer transition-all"
                    title="Toca para ver las prendas en Dead Stock"
                  >
                    <span className="text-[10px] font-bold uppercase text-rose-400 flex items-center justify-between">
                      <span>🧊 Dead Stock Crítico (+45d)</span>
                      <span className="underline text-[9px]">Ver →</span>
                    </span>
                    <div className="text-2xl font-black font-mono text-rose-400">
                      {gs.deadStockOverInitialPct || 0}% <span className="text-xs font-normal text-rose-300">del total comprado</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {gs.deadStockUnitsTotal || 0} unds ({gs.deadStockModelsCount || 0} mod.) • Costo: <strong className="text-rose-300">${(gs.deadStockCostUsd || 0).toFixed(2)}</strong>
                    </p>
                  </div>

                  {/* Capital Inmovilizado vs Recuperación */}
                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-sky-500/30 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-sky-400 block">
                      💰 Capital en Stock vs Recuperado
                    </span>
                    <div className="text-xl font-black font-mono text-sky-300">
                      ${(gs.totalRemainingCostUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-[10px] text-slate-400 font-normal">costo actual</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono">
                      PVP en percha: <strong className="text-white">${(gs.totalRemainingRetailUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> • ROI: <strong className="text-emerald-400">{gs.globalCostRecoveryPct || 0}%</strong>
                    </p>
                  </div>
                </div>

                {/* Barra Visual de Efectividad vs Regla del 80/20 */}
                <div className="space-y-1.5 bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                  <div className="flex flex-wrap items-center justify-between text-[11px] gap-1">
                    <span className="font-bold text-slate-300">
                      Progreso Global de Evacuación de Compras ({gs.globalEffectivenessPct || 0}% vendido vs 80% meta ideal)
                    </span>
                    <span className="font-mono text-slate-400">
                      Compras maduras (+45d): <strong className="text-emerald-400">{gs.matureEffectivenessPct || 0}% efectividad</strong> ({gs.matureDeadStockPct || 0}% sin vender)
                    </span>
                  </div>
                  <div className="relative h-3.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800 flex">
                    <div
                      style={{ width: `${Math.min(100, gs.globalEffectivenessPct || 0)}%` }}
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all"
                      title={`Vendido: ${gs.globalEffectivenessPct || 0}%`}
                    />
                    <div
                      style={{ width: `${Math.max(0, 100 - (gs.globalEffectivenessPct || 0))}%` }}
                      className="bg-amber-500/40 h-full"
                      title={`Stock restante: ${gs.globalRemainingPct || 0}%`}
                    />
                    {/* Línea guía en el 80% */}
                    <div
                      style={{ left: '80%' }}
                      className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_#fff]"
                      title="Meta 80% Efectividad (Máx 20% Dead Stock)"
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>0%</span>
                    <span className="text-amber-300 font-bold">⬆ Meta 80% Efectividad (Máx. 20% Stock Restante)</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              {/* 2. AUDITORÍA POR LOTES DE COMPRA (AGRUPADOS POR FECHA DE INGRESO AL INVENTARIO) */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-white text-sm flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-amber-400" />
                      <span>Efectividad por Lote de Compra (Agrupado por Fecha de Ingreso)</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Cada bloque agrupa las prendas que entraron juntas en una misma compra. Toca cualquier compra para auditar sus categorías y modelos.
                    </p>
                  </div>

                  {/* Filtro rápido de Lotes de Compra */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {[
                      { id: 'ALL', label: `Todas (${cohorts.length})` },
                      { id: 'HEALTHY', label: '🟢 En Meta (≤20%)' },
                      { id: 'IN_MATURATION', label: '🔵 En Ciclo (<45d)' },
                      { id: 'ALERT', label: '🔴 Con Alerta (>20%)' }
                    ].map((cf) => (
                      <button
                        key={cf.id}
                        onClick={() => setCohortStatusFilter(cf.id)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                          cohortStatusFilter === cf.id
                            ? 'bg-amber-400 text-slate-950 border-amber-400'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {cf.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {filteredCohorts.map((cohort) => {
                    const isExpanded = expandedCohortId === cohort.id;
                    let badgeStyle = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                    let badgeText = '🟢 Meta Cumplida (≤20% Merma)';
                    if (cohort.status === 'IN_MATURATION') {
                      badgeStyle = 'bg-sky-500/15 text-sky-300 border-sky-500/30';
                      badgeText = `🔵 En Ciclo (${cohort.daysSinceEntry}d • Proy. 45d: ${cohort.projectedEffectiveness45d}%)`;
                    } else if (cohort.status === 'WARNING_SLOW') {
                      badgeStyle = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
                      badgeText = `🟡 Por Empujar (${cohort.deadStockPct}% restante)`;
                    } else if (cohort.status === 'ALERT_DEAD_STOCK') {
                      badgeStyle = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
                      badgeText = `🔴 Exceso Dead Stock (${cohort.deadStockPct}% > 20%)`;
                    }

                    const rawCohortModels = cohort.models || [];
                    const filteredCohortModels = rawCohortModels.filter((m) => {
                      if (cohortModelStatusFilter !== 'ALL' && m.status !== cohortModelStatusFilter) return false;
                      if (cohortModelSearch.trim()) {
                        const q = cohortModelSearch.toLowerCase().trim();
                        return m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q);
                      }
                      return true;
                    });
                    const visibleCohortModels = (showAllCohortModels || cohortModelSearch.trim() || cohortModelStatusFilter !== 'ALL')
                      ? filteredCohortModels
                      : filteredCohortModels.slice(0, 12);

                    return (
                      <div
                        key={cohort.id}
                        className="bg-slate-950 border border-slate-800/90 rounded-2xl overflow-hidden transition-all"
                      >
                        {/* Cabecera clickeable de la Compra */}
                        <div
                          onClick={() => {
                            if (isExpanded) {
                              setExpandedCohortId(null);
                            } else {
                              setExpandedCohortId(cohort.id);
                              setCohortModelSearch('');
                              setCohortModelStatusFilter('ALL');
                              setShowAllCohortModels(false);
                            }
                          }}
                          className="p-3.5 sm:p-4 cursor-pointer hover:bg-slate-900/60 transition-colors space-y-2.5"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-start sm:items-center space-x-2.5">
                              <ChevronRight className={`w-4 h-4 text-amber-400 mt-0.5 sm:mt-0 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-extrabold text-white text-xs sm:text-sm">
                                    Compra #{cohort.cohortNumber}: {cohort.startDate === cohort.endDate ? formatVeDayLabel(cohort.startDate) : `${formatVeDayLabel(cohort.startDate)} al ${formatVeDayLabel(cohort.endDate)}`}
                                  </span>
                                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800">
                                    {cohort.startDate} • Hace {cohort.daysSinceEntry} días
                                  </span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeStyle}`}>
                                    {badgeText}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                                  {cohort.modelsCount} modelos • Lote inicial: <strong className="text-white">{cohort.initialUnits} unds</strong> → Vendidas: <strong className="text-emerald-400">{cohort.soldUnits} unds</strong> ({cohort.periodSoldUnits} en este período) → Quedan: <strong className="text-amber-300">{cohort.currentStock} unds</strong>
                                </div>
                              </div>
                            </div>

                            {/* Métricas Derecha */}
                            <div className="flex items-center space-x-4 sm:text-right pl-6 sm:pl-0 shrink-0">
                              <div>
                                <span className="text-[10px] text-slate-400 uppercase block">Efectividad</span>
                                <span className={`text-base sm:text-lg font-black font-mono ${
                                  cohort.effectivenessPct >= 80 ? 'text-emerald-400' : cohort.effectivenessPct >= 60 ? 'text-amber-300' : 'text-rose-400'
                                }`}>
                                  {cohort.effectivenessPct}%
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 uppercase block">Restante</span>
                                <span className={`text-base sm:text-lg font-black font-mono ${
                                  cohort.deadStockPct <= 20 ? 'text-emerald-400' : 'text-rose-400'
                                }`}>
                                  {cohort.deadStockPct}%
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 uppercase block">Ritmo</span>
                                <span className="text-xs sm:text-sm font-bold font-mono text-sky-300">
                                  {cohort.velocityPerDay}/día
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Barra de progreso 80/20 del Lote */}
                          <div className="space-y-1 pl-6">
                            <div className="relative h-2 w-full bg-slate-900 rounded-full overflow-hidden flex">
                              <div
                                style={{ width: `${Math.min(100, cohort.effectivenessPct)}%` }}
                                className={`h-full ${
                                  cohort.effectivenessPct >= 80 ? 'bg-emerald-400' : cohort.effectivenessPct >= 60 ? 'bg-amber-400' : 'bg-rose-500'
                                }`}
                              />
                              <div
                                style={{ left: '80%' }}
                                className="absolute top-0 bottom-0 w-0.5 bg-white"
                              />
                            </div>
                            <div className="flex flex-wrap justify-between text-[10px] font-mono text-slate-400 gap-1">
                              <span>
                                Costo Compra: <strong className="text-slate-200">${cohort.initialCostUsd.toFixed(2)}</strong> • Ya Cobrado: <strong className="text-emerald-400">${cohort.revenueUsd.toFixed(2)}</strong> ({cohort.costRecoveryPct}% recuperado)
                              </span>
                              <span>
                                Costo aún en percha: <strong className="text-amber-300">${cohort.remainingCostUsd.toFixed(2)}</strong>
                                {cohort.excessDeadStockUnits > 0 && cohort.daysSinceEntry >= 45 && (
                                  <span className="text-rose-400"> • Sobran {cohort.excessDeadStockUnits} unds (${cohort.excessDeadStockCostUsd.toFixed(2)}) sobre el 20% máx</span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Detalle Expandible de la Compra: Mix de Categorías y Modelos del Lote (CON BUSCADOR Y TOP 12) */}
                        {isExpanded && (
                          <div className="border-t border-slate-800 bg-slate-900/50 p-3.5 sm:p-4 space-y-3.5 animate-fade-in">
                            {/* Mix de categorías en esta compra */}
                            <div>
                              <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-amber-400 mb-2">
                                📊 Rendimiento por Categoría dentro de esta Compra:
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {(cohort.categoriesBreakdown || []).map((cb, cIdx) => (
                                  <div key={cIdx} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                                    <div>
                                      <div className="font-extrabold text-white flex items-center space-x-1.5">
                                        <span>{cb.category}</span>
                                        <span className="text-[10px] text-slate-400 font-mono">({cb.shareOfCohortUnitsPct}% del lote)</span>
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-mono">
                                        {cb.soldUnits} vend. / {cb.initialUnits} comp. • Quedan {cb.currentStock}
                                      </div>
                                    </div>
                                    <div className="text-right font-mono">
                                      <div className={`font-black ${cb.effectivenessPct >= 80 ? 'text-emerald-400' : cb.effectivenessPct >= 60 ? 'text-amber-300' : 'text-rose-400'}`}>
                                        {cb.effectivenessPct}% efect.
                                      </div>
                                      <div className="text-[10px] text-slate-400">
                                        Merma: {cb.deadStockPct}%
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Lista de modelos de esta compra con buscador y filtro de semáforo */}
                            <div className="space-y-2.5">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-sky-400">
                                  👕 Prendas de esta Compra ({filteredCohortModels.length} modelos):
                                </h4>

                                {/* Buscador interno del lote + botón Ver todas */}
                                <div className="flex items-center space-x-2">
                                  <div className="relative flex-1 sm:w-56">
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                    <input
                                      type="text"
                                      value={cohortModelSearch}
                                      onChange={(e) => setCohortModelSearch(e.target.value)}
                                      placeholder="Buscar en esta compra..."
                                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-6 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                                    />
                                    {cohortModelSearch && (
                                      <button
                                        onClick={() => setCohortModelSearch('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                  {filteredCohortModels.length > 12 && (
                                    <button
                                      onClick={() => setShowAllCohortModels(!showAllCohortModels)}
                                      className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/25 cursor-pointer shrink-0"
                                    >
                                      {showAllCohortModels ? 'Compactar (Top 12)' : `Ver todos (${filteredCohortModels.length})`}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Filtros rápidos de estado dentro del lote */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                {[
                                  { id: 'ALL', label: 'Todas' },
                                  { id: 'STAR', label: '🔥 Estrellas' },
                                  { id: 'HEALTHY', label: '✅ Saludables' },
                                  { id: 'SLOW', label: '⚠️ Lentas' },
                                  { id: 'DEAD_STOCK', label: '🧊 Dead Stock' },
                                  { id: 'SOLD_OUT', label: '🏁 Agotadas' }
                                ].map((st) => (
                                  <button
                                    key={st.id}
                                    onClick={() => setCohortModelStatusFilter(st.id)}
                                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border cursor-pointer transition-all ${
                                      cohortModelStatusFilter === st.id
                                        ? 'bg-sky-400 text-slate-950 border-sky-400'
                                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                                    }`}
                                  >
                                    {st.label}
                                  </button>
                                ))}
                              </div>

                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                                {visibleCohortModels.map((m, mIdx) => (
                                  <div key={mIdx} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1.5">
                                    <div className="flex items-center space-x-2 min-w-0">
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 uppercase shrink-0">
                                        {m.category}
                                      </span>
                                      <span className="font-bold text-white truncate">{m.name}</span>
                                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                                        ({m.daysSinceLastSale === 0 ? 'Hoy' : m.lastSaleDate ? `Hace ${m.daysSinceLastSale}d` : '0 vtas'})
                                      </span>
                                    </div>
                                    <div className="flex items-center space-x-2.5 font-mono text-[11px] self-end sm:self-auto shrink-0">
                                      <span className="text-slate-300">
                                        <strong className="text-emerald-400">{m.soldUnits}</strong>/{m.initialUnits} (Stock: <strong className="text-amber-300">{m.currentStock}</strong>)
                                      </span>
                                      <span className="text-sky-300">{m.velocityPerDay}/d</span>
                                      <span className={`font-black px-2 py-0.5 rounded-lg ${
                                        m.effectivenessPct >= 80
                                          ? 'bg-emerald-500/15 text-emerald-300'
                                          : m.effectivenessPct >= 60
                                            ? 'bg-amber-500/15 text-amber-300'
                                            : 'bg-rose-500/15 text-rose-300'
                                      }`}>
                                        {m.effectivenessPct}%
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. MATRIZ DE AJUSTE DE SELECCIÓN POR CATEGORÍA (¿QUÉ COMPRAR MÁS Y QUÉ COMPRAR MENOS?) */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-white text-sm flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-amber-400" />
                      <span>Matriz de Selección de Compra por Categoría (Guía para Futuras Compras)</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Compara cuánto volumen destinaste a cada categoría vs cuánto rota realmente. Toca cualquier categoría para ver sus prendas en Rotación.
                    </p>
                  </div>

                  {/* Filtro rápido por recomendación */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {[
                      { id: 'ALL', label: `Todas (${catMatrix.length})` },
                      { id: 'BUY_MORE', label: '🚀 Priorizar / Comprar Más' },
                      { id: 'BALANCED', label: '✅ Equilibradas' },
                      { id: 'BUY_LESS', label: '⚠️ Reducir / Ajustar' }
                    ].map((rf) => (
                      <button
                        key={rf.id}
                        onClick={() => setMatrixRecFilter(rf.id)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                          matrixRecFilter === rf.id
                            ? 'bg-amber-400 text-slate-950 border-amber-400'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {rf.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {filteredMatrix.map((cat, idx) => {
                    let recBadge = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                    let recIcon = '🚀 Priorizar / Comprar Más';
                    if (cat.recommendation === 'BALANCED') {
                      recBadge = 'bg-sky-500/15 text-sky-300 border-sky-500/30';
                      recIcon = '✅ Selección Equilibrada';
                    } else if (cat.recommendation === 'BUY_LESS') {
                      recBadge = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
                      recIcon = '⚠️ Reducir / Ajustar Selección';
                    }

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setRotationCategoryFilter(cat.category);
                          setRotationFilter('ALL');
                          setSubTab('rotacion');
                        }}
                        className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 hover:border-amber-500/40 space-y-2 cursor-pointer transition-all"
                        title={`Toca para auditar las prendas de ${cat.category} en Rotación`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="font-black text-white text-sm">{cat.category}</span>
                            <span className="text-[10px] text-slate-400 font-mono ml-1.5">({cat.modelsCount} mod.)</span>
                          </div>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${recBadge}`}>
                            {recIcon}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-[11px] font-mono bg-slate-900/70 p-2 rounded-xl border border-slate-800/80">
                          <div>
                            <span className="text-[10px] text-slate-400 block">% Compra</span>
                            <strong className="text-white">{cat.shareOfPurchasePct}%</strong>
                            <span className="text-[10px] text-slate-500 block">{cat.initialUnits} unds</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">% Venta</span>
                            <strong className="text-emerald-400">{cat.shareOfSalesPct}%</strong>
                            <span className="text-[10px] text-slate-500 block">{cat.soldUnits} unds</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Efectividad</span>
                            <strong className={cat.effectivenessPct >= 75 ? 'text-emerald-400' : cat.effectivenessPct >= 55 ? 'text-amber-300' : 'text-rose-400'}>
                              {cat.effectivenessPct}%
                            </strong>
                            <span className="text-[10px] text-slate-400 block">Resta: {cat.deadStockPct}%</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                          <span>
                            Stock: <strong className="text-amber-300">{cat.currentStock} unds</strong> (${cat.remainingCostUsd.toFixed(0)})
                          </span>
                          <span className="text-amber-400 font-bold">
                            Ver prendas →
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          );
        })()}

        {/* ===================================================================
            PESTAÑA 6: ⏱️ EXPLORADOR DEDICADO DE ROTACIÓN POR PRENDA (SIN SCROLL INFINITO)
            =================================================================== */}
        {subTab === 'rotacion' && (() => {
          const rot = kpiData?.rotation || {};
          const gs = rot.globalSummary || {};
          const allProducts = rot.products || [];

          const healthyCount = allProducts.filter(p => p.status === 'HEALTHY').length;

          // Conteo por categoría para los chips rápidos
          const catCounts = {};
          allProducts.forEach((p) => {
            catCounts[p.category] = (catCounts[p.category] || 0) + 1;
          });
          const availableCategories = ['ALL', ...Object.keys(catCounts).sort((a, b) => catCounts[b] - catCounts[a])];

          // Filtrar productos según Semáforo, Categoría y Buscador
          let filteredProducts = allProducts.filter((p) => {
            if (rotationCategoryFilter !== 'ALL' && p.category !== rotationCategoryFilter) return false;
            if (rotationSearch.trim()) {
              const q = rotationSearch.toLowerCase().trim();
              if (!p.name.toLowerCase().includes(q) && !p.category.toLowerCase().includes(q) && !p.entryDate.includes(q)) {
                return false;
              }
            }
            if (rotationFilter === 'STAR') return p.status === 'STAR';
            if (rotationFilter === 'HEALTHY') return p.status === 'HEALTHY';
            if (rotationFilter === 'DEAD_STOCK') return p.status === 'DEAD_STOCK';
            if (rotationFilter === 'SLOW') return p.status === 'SLOW';
            if (rotationFilter === 'SOLD_OUT') return p.status === 'SOLD_OUT';
            if (rotationFilter === 'HIGH_COST') return p.currentStock > 0;
            return true;
          });

          // Ordenamiento explícito elegido por el usuario
          filteredProducts.sort((a, b) => {
            if (rotationSortBy === 'VELOCITY_DESC') {
              return b.velocityPerDay - a.velocityPerDay || b.effectivenessPct - a.effectivenessPct;
            }
            if (rotationSortBy === 'EFFECTIVENESS_DESC') {
              return b.effectivenessPct - a.effectivenessPct || b.velocityPerDay - a.velocityPerDay;
            }
            if (rotationSortBy === 'EFFECTIVENESS_ASC') {
              return a.effectivenessPct - b.effectivenessPct || b.remainingCostUsd - a.remainingCostUsd;
            }
            if (rotationSortBy === 'CAPITAL_DESC') {
              return b.remainingCostUsd - a.remainingCostUsd || a.effectivenessPct - b.effectivenessPct;
            }
            if (rotationSortBy === 'STALE_DESC') {
              const aStale = a.currentStock > 0 ? (a.daysSinceLastSale ?? a.daysInInventory) : -1;
              const bStale = b.currentStock > 0 ? (b.daysSinceLastSale ?? b.daysInInventory) : -1;
              return bStale - aStale || b.remainingCostUsd - a.remainingCostUsd;
            }
            if (rotationSortBy === 'RECENT_DESC') {
              return b.entryDate.localeCompare(a.entryDate) || b.velocityPerDay - a.velocityPerDay;
            }
            return b.velocityPerDay - a.velocityPerDay;
          });

          // Paginación inteligente: Mostrar Top 16 por defecto salvo que busque o active "Ver todos"
          const isSearching = rotationSearch.trim().length > 0;
          const visibleProducts = (showAllRotationProducts || isSearching)
            ? filteredProducts
            : filteredProducts.slice(0, 16);

          return (
            <div className="space-y-4">

              {/* 1. TARJETAS INTERACTIVAS DE SEMÁFORO DE ROTACIÓN (1-TAP FILTERS) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {[
                  {
                    id: 'ALL',
                    title: '📦 Todas las Prendas',
                    count: allProducts.length,
                    sub: `${gs.globalEffectivenessPct || 0}% efect. global`,
                    activeClass: 'bg-amber-500/20 border-amber-400 ring-1 ring-amber-400/50',
                    baseClass: 'bg-slate-900/90 border-slate-800 hover:border-slate-700',
                    textClass: 'text-white',
                    defaultSort: 'VELOCITY_DESC'
                  },
                  {
                    id: 'STAR',
                    title: '🔥 Top Estrellas',
                    count: gs.starModelsCount || 0,
                    sub: 'Alta velocidad / repetir',
                    activeClass: 'bg-amber-500/25 border-amber-400 ring-1 ring-amber-400/50',
                    baseClass: 'bg-slate-900/90 border-amber-500/30 hover:border-amber-400/60',
                    textClass: 'text-amber-400',
                    defaultSort: 'VELOCITY_DESC'
                  },
                  {
                    id: 'HEALTHY',
                    title: '✅ Saludables',
                    count: healthyCount,
                    sub: 'Rotación firme en ciclo',
                    activeClass: 'bg-emerald-500/25 border-emerald-400 ring-1 ring-emerald-400/50',
                    baseClass: 'bg-slate-900/90 border-emerald-500/30 hover:border-emerald-400/60',
                    textClass: 'text-emerald-400',
                    defaultSort: 'EFFECTIVENESS_DESC'
                  },
                  {
                    id: 'SLOW',
                    title: '⚠️ Rotación Lenta',
                    count: gs.slowModelsCount || 0,
                    sub: 'Impulsar en piso / redes',
                    activeClass: 'bg-orange-500/25 border-orange-400 ring-1 ring-orange-400/50',
                    baseClass: 'bg-slate-900/90 border-orange-500/30 hover:border-orange-400/60',
                    textClass: 'text-orange-400',
                    defaultSort: 'CAPITAL_DESC'
                  },
                  {
                    id: 'DEAD_STOCK',
                    title: '🧊 Dead Stock',
                    count: gs.deadStockModelsCount || 0,
                    sub: `$${(gs.deadStockCostUsd || 0).toFixed(0)} costo retenido`,
                    activeClass: 'bg-rose-500/25 border-rose-400 ring-1 ring-rose-400/50',
                    baseClass: 'bg-slate-900/90 border-rose-500/30 hover:border-rose-400/60',
                    textClass: 'text-rose-400',
                    defaultSort: 'CAPITAL_DESC'
                  },
                  {
                    id: 'SOLD_OUT',
                    title: '🏁 Agotadas 100%',
                    count: gs.soldOutModelsCount || 0,
                    sub: 'Éxito total (0 en percha)',
                    activeClass: 'bg-sky-500/25 border-sky-400 ring-1 ring-sky-400/50',
                    baseClass: 'bg-slate-900/90 border-sky-500/30 hover:border-sky-400/60',
                    textClass: 'text-sky-400',
                    defaultSort: 'VELOCITY_DESC'
                  }
                ].map((card) => (
                  <button
                    key={card.id}
                    onClick={() => {
                      setRotationFilter(card.id);
                      setRotationSortBy(card.defaultSort);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      rotationFilter === card.id ? card.activeClass : card.baseClass
                    }`}
                  >
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-300 block truncate">
                      {card.title}
                    </span>
                    <div className={`text-xl font-black font-mono mt-0.5 ${card.textClass}`}>
                      {card.count} <span className="text-[10px] font-normal text-slate-400">mod.</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono block truncate mt-0.5">
                      {card.sub}
                    </span>
                  </button>
                ))}
              </div>

              {/* 2. BARRA DE CONTROL DE ROTACIÓN: BUSCADOR + CHIPS DE CATEGORÍA + ORDENAMIENTO + PAGINACIÓN */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-xl">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Buscador prominente con botón limpiar */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={rotationSearch}
                      onChange={(e) => setRotationSearch(e.target.value)}
                      placeholder="Buscar producto específico, categoría o fecha de ingreso (ej. azzaro, set, 2026-09)..."
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-2xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 shadow-inner"
                    />
                    {rotationSearch && (
                      <button
                        onClick={() => setRotationSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                        title="Limpiar búsqueda"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Controles derecha: Ordenar por + Botón Ver Todos / Top 16 */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="flex items-center space-x-1.5 bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[11px] font-bold text-slate-400">Ordenar:</span>
                      <select
                        value={rotationSortBy}
                        onChange={(e) => setRotationSortBy(e.target.value)}
                        className="bg-transparent text-xs font-extrabold text-white focus:outline-none cursor-pointer"
                      >
                        <option value="VELOCITY_DESC" className="bg-slate-900">⚡ Mayor Velocidad (/día)</option>
                        <option value="EFFECTIVENESS_DESC" className="bg-slate-900">📈 Mayor % Efectividad</option>
                        <option value="EFFECTIVENESS_ASC" className="bg-slate-900">📉 Menor % Efectividad</option>
                        <option value="CAPITAL_DESC" className="bg-slate-900">💰 Mayor Capital en Percha ($)</option>
                        <option value="STALE_DESC" className="bg-slate-900">🕒 Más Días sin Vender</option>
                        <option value="RECENT_DESC" className="bg-slate-900">📅 Ingreso Más Reciente</option>
                      </select>
                    </div>

                    {filteredProducts.length > 16 && !isSearching && (
                      <button
                        onClick={() => setShowAllRotationProducts(!showAllRotationProducts)}
                        className={`px-3.5 py-2 rounded-2xl text-xs font-extrabold border transition-all flex items-center space-x-1.5 cursor-pointer ${
                          showAllRotationProducts
                            ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-md'
                            : 'bg-slate-950 text-amber-400 border-amber-500/40 hover:bg-amber-500/15'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>
                          {showAllRotationProducts
                            ? 'Compactar a Top 16'
                            : `Ver todos (${filteredProducts.length})`}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Chips Rápidos de Categoría (1-Tap) */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {availableCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setRotationCategoryFilter(cat)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold shrink-0 border transition-all cursor-pointer ${
                        rotationCategoryFilter === cat
                          ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {cat === 'ALL' ? `Todas las Categorías (${allProducts.length})` : `${cat} (${catCounts[cat] || 0})`}
                    </button>
                  ))}
                </div>

                {/* Barra de estado de resultados filtrados */}
                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 gap-2">
                  <span>
                    Mostrando <strong className="text-white font-mono">{visibleProducts.length}</strong> de <strong className="text-amber-400 font-mono">{filteredProducts.length}</strong> prendas
                    {rotationFilter !== 'ALL' && ` • Filtro: ${rotationFilter}`}
                    {rotationCategoryFilter !== 'ALL' && ` • Categoría: ${rotationCategoryFilter}`}
                  </span>
                  {(rotationFilter !== 'ALL' || rotationCategoryFilter !== 'ALL' || rotationSearch) && (
                    <button
                      onClick={() => {
                        setRotationFilter('ALL');
                        setRotationCategoryFilter('ALL');
                        setRotationSearch('');
                      }}
                      className="text-xs font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer"
                    >
                      Restablecer todos los filtros
                    </button>
                  )}
                </div>

                {/* 3. GRILLA DE PRENDAS EN 2 COLUMNAS EN DESKTOP (SIN DOBLE SCROLL ATRAPADO) */}
                {visibleProducts.length === 0 ? (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
                    <p className="text-sm font-bold text-slate-300">No se encontraron prendas con esos filtros.</p>
                    <button
                      onClick={() => {
                        setRotationFilter('ALL');
                        setRotationCategoryFilter('ALL');
                        setRotationSearch('');
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-400 text-slate-950 cursor-pointer"
                    >
                      Ver todas las prendas
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {visibleProducts.map((p, idx) => {
                      let statusBadge = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                      let statusLabel = '✅ Saludable';
                      if (p.status === 'STAR') {
                        statusBadge = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                        statusLabel = '🔥 Estrella';
                      } else if (p.status === 'DEAD_STOCK') {
                        statusBadge = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
                        statusLabel = '🧊 Dead Stock';
                      } else if (p.status === 'SLOW') {
                        statusBadge = 'bg-orange-500/20 text-orange-300 border-orange-500/40';
                        statusLabel = '⚠️ Lenta';
                      } else if (p.status === 'SOLD_OUT') {
                        statusBadge = 'bg-sky-500/20 text-sky-300 border-sky-500/40';
                        statusLabel = '🏁 Agotada 100%';
                      }

                      return (
                        <div key={p.id || idx} className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800/90 hover:border-slate-700 space-y-2.5 transition-all flex flex-col justify-between">
                          <div className="space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                                    {p.category}
                                  </span>
                                  <span className="font-extrabold text-white text-xs sm:text-sm truncate">{p.name}</span>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  📥 Ingresó: <strong className="text-slate-200">{p.entryDate}</strong> ({p.daysInInventory}d)
                                  {' • '}
                                  {p.lastSaleDate
                                    ? `🕒 Últ. venta: hace ${p.daysSinceLastSale}d (${p.lastSaleDate})`
                                    : '⚠️ Sin ventas'}
                                </div>
                              </div>

                              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${statusBadge}`}>
                                {statusLabel}
                              </span>
                            </div>

                            {/* Barra visual de efectividad de la prenda */}
                            <div className="flex items-center space-x-2">
                              <div className="h-1.5 flex-1 bg-slate-900 rounded-full overflow-hidden">
                                <div
                                  style={{ width: `${Math.min(100, p.effectivenessPct)}%` }}
                                  className={`h-full ${
                                    p.effectivenessPct >= 80 ? 'bg-emerald-400' : p.effectivenessPct >= 60 ? 'bg-amber-400' : 'bg-rose-500'
                                  }`}
                                />
                              </div>
                              <span className={`text-xs font-black font-mono shrink-0 ${
                                p.effectivenessPct >= 80 ? 'text-emerald-400' : p.effectivenessPct >= 60 ? 'text-amber-300' : 'text-rose-400'
                              }`}>
                                {p.effectivenessPct}% efect.
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-1.5 text-[11px] font-mono bg-slate-900/60 p-2 rounded-xl border border-slate-800/70">
                            <div>
                              <span className="text-[9px] text-slate-400 block">Lote → Salientes</span>
                              <strong className="text-white">{p.initialUnits}</strong> → <strong className="text-emerald-400">{p.soldUnits}</strong>
                              <span className="text-[9px] text-amber-300 block">
                                {p.periodSoldUnits || 0} en período{p.collabUnits > 0 ? ` (${p.collabUnits} colab.)` : ''}
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 block">En Percha</span>
                              <strong className={p.remainingPct <= 20 ? 'text-emerald-400' : 'text-amber-300'}>
                                {p.currentStock} ({p.remainingPct}%)
                              </strong>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 block">Ritmo / Cob.</span>
                              <strong className="text-sky-300">{p.velocityPerDay}/d</strong>
                              <span className="text-[9px] text-slate-400 block">
                                {p.currentStock === 0 ? '0d' : p.daysOfSupply >= 999 ? '∞' : `~${p.daysOfSupply}d`}
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] text-slate-400 block">Costo Retenido</span>
                              <strong className="text-rose-300">${p.remainingCostUsd.toFixed(0)}</strong>
                              <span className="text-[9px] text-emerald-400 block">ROI {p.costRecoveryPct}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Botón inferior para expandir o compactar la lista sin scroll infinito */}
                {filteredProducts.length > 16 && !isSearching && (
                  <div className="pt-2 flex justify-center">
                    <button
                      onClick={() => setShowAllRotationProducts(!showAllRotationProducts)}
                      className="px-5 py-2.5 rounded-2xl text-xs font-extrabold bg-slate-950 hover:bg-slate-800 text-amber-400 border border-amber-500/30 transition-all cursor-pointer shadow-lg"
                    >
                      {showAllRotationProducts
                        ? '⬆ Mostrar solo el Top 16 de este filtro'
                        : `⬇ Ver los ${filteredProducts.length} modelos de este filtro (${filteredProducts.length - 16} más)`}
                    </button>
                  </div>
                )}
              </div>

            </div>
          );
        })()}

      </div>

    </div>
  );
}

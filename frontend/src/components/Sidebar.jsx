import React from 'react';
import { Search, Calculator, TrendingDown, CreditCard, BarChart3, RefreshCw, ShoppingBag, Wifi, WifiOff } from 'lucide-react';

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  bcvRate, 
  isOnline, 
  isSyncing, 
  onRefresh, 
  ticketCount, 
  onOpenTicket 
}) {
  const navItems = [
    { id: 'stock', label: 'Stock e Inventario', icon: Search },
    { id: 'kpi', label: 'KPIs & Reportes', icon: BarChart3, badge: 'PRO' },
    { id: 'bcv', label: 'Calculadora BCV', icon: Calculator, badge: 'BCV' },
    { id: 'binance', label: 'Brecha Cambiaria', icon: TrendingDown, badge: 'Binance' },
    { id: 'pago', label: 'Datos Pago Móvil', icon: CreditCard }
  ];

  const rawTasa = bcvRate ? Number(bcvRate.tasa) : 36.5;
  const tasa = Math.floor(rawTasa * 100) / 100;

  return (
    <aside className="hidden md:flex flex-col w-64 bg-[#0d1624] border-r border-slate-800/80 p-4 shrink-0 h-screen justify-between select-none z-40">
      
      {/* Brand & Status */}
      <div className="space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-black text-amber-400 text-sm tracking-tighter shadow-inner">
              VK
            </div>
            <div>
              <h1 className="font-extrabold text-white text-sm tracking-wide leading-tight">VK MEN</h1>
              <p className="text-[10px] text-slate-400 font-medium">Control de Stock & KPIs</p>
            </div>
          </div>

          <button
            onClick={onRefresh}
            disabled={isSyncing}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all active:scale-95 disabled:opacity-50"
            title="Sincronizar en vivo con FINA ERP"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>

        {/* Tasa BCV & Online Indicator */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tasa BCV Oficial</span>
            <div className="flex items-center space-x-1">
              {isOnline ? (
                <span className="flex items-center text-[10px] font-bold text-emerald-400 space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Online</span>
                </span>
              ) : (
                <span className="flex items-center text-[10px] font-bold text-red-400 space-x-1">
                  <WifiOff className="w-3 h-3" />
                  <span>Offline</span>
                </span>
              )}
            </div>
          </div>

          <div className="text-lg font-black text-amber-400 font-mono flex items-baseline justify-between">
            <span>{tasa.toFixed(2)} <span className="text-xs text-slate-300">Bs/$</span></span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1.5">
          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-2">Navegación</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all ${
                  isActive
                    ? 'bg-amber-400 text-slate-950 shadow-md scale-[1.02]'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/80'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase border ${
                    isActive
                      ? 'bg-slate-950 text-amber-400 border-slate-950'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Ticket / Cotizador Button */}
      <div className="pt-4 border-t border-slate-800 space-y-2">
        <button
          onClick={onOpenTicket}
          className="w-full py-3 px-3.5 rounded-2xl font-extrabold text-xs text-slate-950 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:brightness-110 active:scale-95 transition-all shadow-lg flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <ShoppingBag className="w-4 h-4" />
            <span>Ticket de Venta</span>
          </div>

          <span className="bg-slate-950 text-amber-400 font-mono font-bold text-[11px] px-2 py-0.5 rounded-xl">
            {ticketCount}
          </span>
        </button>

        <p className="text-[10px] text-slate-500 text-center">VK MEN Microapp Retail v1.2</p>
      </div>

    </aside>
  );
}

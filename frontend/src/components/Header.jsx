import React from 'react';
import { RefreshCw, Wifi, WifiOff, DollarSign, ShoppingBag } from 'lucide-react';

export default function Header({ bcvRate, isOnline, isSyncing, onRefresh, lastSync, ticketCount = 0, onOpenTicket }) {
  const rawRate = bcvRate ? Number(bcvRate.tasa) : 0;
  const formattedRate = rawRate > 0 ? (Math.floor(rawRate * 100) / 100).toFixed(2) : '--.--';

  const formatSyncTime = (isoString) => {
    if (!isoString) return 'En vivo';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'En vivo';
    }
  };

  return (
    <header className="sticky top-0 z-30 glass-panel px-4 py-3 safe-pt border-b border-surface-cardBorder md:hidden">
      <div className="flex items-center justify-between max-w-lg mx-auto">
        
        {/* Marca / Título */}
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <span className="font-extrabold text-white text-sm tracking-wider">VK</span>
          </div>
          <div>
            <h1 className="font-bold text-white text-base leading-none">Piso de Venta</h1>
            <p className="text-[10px] text-slate-400 font-medium">
              Tienda Retail • ERP: <span className="text-emerald-400 font-bold">{formatSyncTime(lastSync)}</span>
            </p>
          </div>
        </div>

        {/* Info Tasa BCV & Status */}
        <div className="flex items-center space-x-2">
          
          {/* Badge Tasa BCV */}
          <div 
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-brand-gold/10 border border-brand-gold/20 text-brand-gold relative"
            title="Tasa BCV Oficial"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span className="text-xs font-bold">{formattedRate} <span className="text-[10px] font-normal opacity-80">Bs/$</span></span>
          </div>

          {/* Botón Ticket de Venta activo */}
          {ticketCount > 0 && (
            <button
              onClick={onOpenTicket}
              className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500 hover:text-slate-950 transition-all relative active:scale-95"
              title="Ver Ticket de Cotización"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center shadow">
                {ticketCount}
              </span>
            </button>
          )}

          {/* Botón Refrescar */}
          <button
            onClick={onRefresh}
            disabled={isSyncing}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 transition-touch relative"
            title="Refrescar datos"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-brand-500' : ''}`} />
          </button>

          {/* Indicador Online/Offline */}
          <div 
            className={`flex items-center justify-center p-1.5 rounded-full ${
              isOnline ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'
            }`}
            title={isOnline ? 'Conectado a Internet' : 'Modo Offline (Cache Activa)'}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          </div>

        </div>

      </div>
    </header>
  );
}


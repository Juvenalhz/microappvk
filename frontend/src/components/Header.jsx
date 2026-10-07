import React from 'react';
import { RefreshCw, Wifi, WifiOff, DollarSign } from 'lucide-react';

export default function Header({ bcvRate, isOnline, isSyncing, onRefresh, lastSync }) {
  const formattedRate = bcvRate ? Number(bcvRate.tasa).toFixed(2) : '--.--';

  return (
    <header className="sticky top-0 z-30 glass-panel px-4 py-3 border-b border-surface-cardBorder">
      <div className="flex items-center justify-between max-w-lg mx-auto">
        
        {/* Marca / Título */}
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
            <span className="font-extrabold text-white text-sm tracking-wider">VK</span>
          </div>
          <div>
            <h1 className="font-bold text-white text-base leading-none">Piso de Venta</h1>
            <p className="text-[10px] text-slate-400 font-medium">Tienda Retail • Mobile PWA</p>
          </div>
        </div>

        {/* Info Tasa BCV & Status */}
        <div className="flex items-center space-x-2">
          
          {/* Badge Tasa BCV */}
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-brand-gold/10 border border-brand-gold/20 text-brand-gold">
            <DollarSign className="w-3.5 h-3.5" />
            <span className="text-xs font-bold">{formattedRate} <span className="text-[10px] font-normal opacity-80">Bs/$</span></span>
          </div>

          {/* Botón Refrescar / Estado Red */}
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

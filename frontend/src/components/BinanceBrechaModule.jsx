import React, { useState, useEffect } from 'react';
import { 
  TrendingDown, 
  Copy, 
  Check, 
  Delete, 
  ShieldAlert, 
  Percent,
  ArrowUpRight,
  RefreshCw
} from 'lucide-react';

export default function BinanceBrechaModule({ bcvRate, onRefreshRates }) {
  // Tasas oficiales y de mercado auto-cargadas desde el BFF / API
  const defaultBcv = bcvRate?.tasa ? Number(bcvRate.tasa).toFixed(2) : '873.87';
  const defaultBinance = bcvRate?.binance ? Number(bcvRate.binance).toFixed(2) : '1007.74';

  // Monto en Bs inicia VACÍO
  const [montoBs, setMontoBs] = useState('');
  const [tasaBinance, setTasaBinance] = useState(defaultBinance);
  const [tasaBcv, setTasaBcv] = useState(defaultBcv);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Campo activo para el teclado táctil: 'bs' | 'binance' | 'bcv'
  const [activeInput, setActiveInput] = useState('bs');
  const [copied, setCopied] = useState(false);

  // Auto-actualizar tasas cuando bcvRate cambie
  useEffect(() => {
    if (bcvRate?.tasa) {
      setTasaBcv(Number(bcvRate.tasa).toFixed(2));
    }
    if (bcvRate?.binance) {
      setTasaBinance(Number(bcvRate.binance).toFixed(2));
    }
  }, [bcvRate]);

  // Manejador para refrescar manualmente las tasas desde la API
  const handleRefreshClick = async () => {
    if (onRefreshRates) {
      setIsRefreshing(true);
      await onRefreshRates();
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  // Valores numéricos limpios
  const bsNum = parseFloat(montoBs) || 0;
  const binanceNum = parseFloat(tasaBinance) || 0;
  const bcvNum = parseFloat(tasaBcv) || 0;

  // Cálculos de Brecha
  const usdBcv = bcvNum > 0 ? bsNum / bcvNum : 0;
  const usdBinance = binanceNum > 0 ? bsNum / binanceNum : 0;
  const perdidaUsd = usdBcv - usdBinance;
  const porcentajePerdida = usdBcv > 0 ? (perdidaUsd / usdBcv) * 100 : 0;
  
  // Brecha porcentual de la tasa Binance sobre la tasa BCV
  const brechaTasaPorcentaje = bcvNum > 0 && binanceNum > 0 
    ? ((binanceNum - bcvNum) / bcvNum) * 100 
    : 0;

  // Factor de reposición
  const factorReposicion = binanceNum > 0 && bcvNum > 0 ? (binanceNum / bcvNum) : 1;

  // Formatear montos sin truncar
  const formatBs = (num) => {
    if (!num) return '0';
    return num.toLocaleString('es-VE', { maximumFractionDigits: 2 });
  };

  // Teclado táctil para editar Monto Bs, Tasa Binance o Tasa BCV
  const handleKeyPress = (val) => {
    const getValue = () => {
      if (activeInput === 'bs') return montoBs;
      if (activeInput === 'binance') return tasaBinance;
      return tasaBcv;
    };

    const setValue = (newVal) => {
      if (activeInput === 'bs') setMontoBs(newVal);
      else if (activeInput === 'binance') setTasaBinance(newVal);
      else setTasaBcv(newVal);
    };

    const current = getValue();

    if (val === 'DEL') {
      setValue(current.slice(0, -1));
    } else if (val === 'CLEAR') {
      setValue('');
    } else if (val === '.') {
      if (!current.includes('.')) {
        setValue(current === '' ? '0.' : current + '.');
      }
    } else {
      if (current.includes('.')) {
        const [, decimal] = current.split('.');
        if (decimal && decimal.length >= 2) return;
      }
      setValue(current === '0' ? val : current + val);
    }
  };

  // Copiar reporte para WhatsApp
  const handleCopyReport = () => {
    const report = 
`📉 *REPORTE DE BRECHA CAMBIARIA*
----------------------------------
🏛️ Tasa BCV: ${bcvNum.toFixed(2)} Bs/USD
🟡 Tasa Binance P2P: ${binanceNum.toFixed(2)} Bs/USDT
📈 *Diferencial de Tasa (Brecha):* +${brechaTasaPorcentaje.toFixed(2)}%
💡 *Factor de Reposición:* x${factorReposicion.toFixed(3)} (+${((factorReposicion - 1) * 100).toFixed(1)}%)
${bsNum > 0 ? `----------------------------------
💰 Monto a cambiar: ${formatBs(bsNum)} Bs
💵 Venta equivalente BCV: $${usdBcv.toFixed(2)} USD
🪙 Recibido en Binance: $${usdBinance.toFixed(2)} USDT
⚠️ Pérdida en Compra: -$${perdidaUsd.toFixed(2)} USD (-${porcentajePerdida.toFixed(2)}%)` : ''}`;

    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-3 max-w-lg mx-auto w-full h-full overflow-y-auto no-scrollbar space-y-2 pb-[calc(3.5rem+env(safe-area-inset-bottom,0.25rem))]">
      
      {/* 1. Header Compacto con Botón de Refresco en Vivo */}
      <div className="flex items-center justify-between bg-surface-card border border-surface-cardBorder rounded-xl px-3 py-2 shadow-md">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <TrendingDown className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-black text-white leading-tight">Brecha Cambiaria BCV vs Binance</h2>
            <p className="text-[10px] text-slate-400">Consulta en vivo (BCV & Binance P2P)</p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={handleRefreshClick}
            title="Refrescar tasas en vivo"
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-amber-400 border border-slate-700 active:scale-95 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          <button
            onClick={handleCopyReport}
            className={`px-2.5 py-1 rounded-lg flex items-center space-x-1 text-[11px] font-bold transition-all shadow ${
              copied
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 active:scale-95'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
            <span>{copied ? '¡Copiado!' : 'Reporte'}</span>
          </button>
        </div>
      </div>

      {/* 2. TARJETA HERO DE RESULTADOS (CALCULADA DE INMEDIATO) */}
      <div className="bg-gradient-to-br from-surface-card via-slate-900 to-[#121827] border border-amber-500/30 rounded-2xl p-3 shadow-xl space-y-2.5 relative overflow-hidden">
        
        {/* Glow sutil */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />

        {/* Métrica de Brecha General (Instantánea) */}
        <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/25 rounded-xl p-2.5">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
              <ArrowUpRight className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Diferencial de Tasa (Brecha)</div>
              <div className="text-xl font-black text-amber-400 font-mono leading-none tracking-tight mt-0.5">
                +{brechaTasaPorcentaje.toFixed(2)}% <span className="text-xs font-bold text-slate-300">sobre BCV</span>
              </div>
            </div>
          </div>

          <div className="text-right flex flex-col items-end">
            <span className="text-[9px] font-bold text-slate-400 uppercase">Factor Reposición</span>
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-black text-xs font-mono border border-amber-500/40 shadow-sm mt-0.5">
              x{factorReposicion.toFixed(3)}
            </span>
          </div>
        </div>

        {/* Desglose de Operación en Divisas (Si hay monto en Bs) o Estado Listo */}
        {bsNum > 0 ? (
          <div className="space-y-2 animate-fade-in">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                <div className="text-[10px] font-medium text-slate-400">🏛️ Venta a Tasa BCV:</div>
                <div className="text-base font-black text-emerald-400 font-mono mt-0.5 leading-none">
                  ${usdBcv.toFixed(2)} <span className="text-[9px] text-slate-400">USD</span>
                </div>
                <div className="text-[9px] text-slate-500 font-mono mt-1">Tasa: {bcvNum.toFixed(2)}</div>
              </div>

              <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                <div className="text-[10px] font-medium text-slate-400">🟡 Recibido en Binance:</div>
                <div className="text-base font-black text-amber-400 font-mono mt-0.5 leading-none">
                  ${usdBinance.toFixed(2)} <span className="text-[9px] text-slate-400">USDT</span>
                </div>
                <div className="text-[9px] text-slate-500 font-mono mt-1">Tasa: {binanceNum.toFixed(2)}</div>
              </div>
            </div>

            {/* Pérdida Neta */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                <span className="text-xs font-bold text-red-300">Pérdida en Compra:</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-black text-red-400 font-mono">-${perdidaUsd.toFixed(2)} USD</span>
                <span className="text-[10px] font-bold text-red-300 ml-1 font-mono">(-{porcentajePerdida.toFixed(2)}%)</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800 text-center text-xs text-slate-400 font-medium">
            💡 Ingresa un monto en Bs para calcular los dólares netos recibidos en Binance.
          </div>
        )}

      </div>

      {/* 3. Selector de Inputs MODIFICABLES (Toca cualquier campo para editar con el teclado táctil) */}
      <div className="grid grid-cols-3 gap-1.5">
        {/* Input Monto Bs */}
        <button
          onClick={() => setActiveInput('bs')}
          className={`p-2 rounded-xl text-left border transition-all relative overflow-hidden ${
            activeInput === 'bs'
              ? 'bg-amber-500/15 border-amber-400 text-white ring-1 ring-amber-400/40 shadow-md'
              : 'bg-surface-card border-surface-cardBorder text-slate-300 hover:border-slate-700'
          }`}
        >
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Monto en Bs</div>
          <div className="text-xs sm:text-sm font-black font-mono text-amber-400 leading-tight min-h-[1.25rem]">
            {bsNum > 0 ? formatBs(bsNum) : <span className="text-slate-500 italic">Ingresar...</span>}
          </div>
          {activeInput === 'bs' && (
            <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>

        {/* Input Tasa Binance Modificable */}
        <button
          onClick={() => setActiveInput('binance')}
          className={`p-2 rounded-xl text-left border transition-all relative overflow-hidden ${
            activeInput === 'binance'
              ? 'bg-amber-500/15 border-amber-400 text-white ring-1 ring-amber-400/40 shadow-md'
              : 'bg-surface-card border-surface-cardBorder text-slate-300 hover:border-slate-700'
          }`}
        >
          <div className="text-[9px] font-bold uppercase tracking-wider text-amber-400 mb-0.5 flex items-center justify-between">
            <span>Tasa Binance</span>
            <span className="text-[8px] opacity-75">✏️</span>
          </div>
          <div className="text-xs sm:text-sm font-black font-mono text-white leading-tight">
            {binanceNum > 0 ? binanceNum.toFixed(2) : '0'}
          </div>
          {activeInput === 'binance' && (
            <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>

        {/* Input Tasa BCV Modificable */}
        <button
          onClick={() => setActiveInput('bcv')}
          className={`p-2 rounded-xl text-left border transition-all relative overflow-hidden ${
            activeInput === 'bcv'
              ? 'bg-blue-500/15 border-blue-400 text-white ring-1 ring-blue-400/40 shadow-md'
              : 'bg-surface-card border-surface-cardBorder text-slate-300 hover:border-slate-700'
          }`}
        >
          <div className="text-[9px] font-bold uppercase tracking-wider text-blue-400 mb-0.5 flex items-center justify-between">
            <span>Tasa BCV</span>
            <span className="text-[8px] opacity-75">✏️</span>
          </div>
          <div className="text-xs sm:text-sm font-black font-mono text-white leading-tight">
            {bcvNum > 0 ? bcvNum.toFixed(2) : '0'}
          </div>
          {activeInput === 'bcv' && (
            <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          )}
        </button>
      </div>

      {/* 4. TECLADO NUMÉRICO TÁCTIL COMPACTO */}
      <div className="grid grid-cols-3 gap-1.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'DEL'].map((key) => {
          if (key === 'DEL') {
            return (
              <button
                key={key}
                onClick={() => handleKeyPress('DEL')}
                className="py-2 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-touch active:scale-95 shadow"
              >
                <Delete className="w-4 h-4" />
              </button>
            );
          }

          return (
            <button
              key={key}
              onClick={() => handleKeyPress(key)}
              className="py-2 rounded-xl bg-surface-card border border-surface-cardBorder text-white font-extrabold text-lg shadow transition-touch active:scale-95 active:bg-slate-700"
            >
              {key}
            </button>
          );
        })}
      </div>

      {/* Botón Borrar Todo / Limpiar Campo */}
      <button
        onClick={() => handleKeyPress('CLEAR')}
        className="w-full py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 text-[11px] font-semibold hover:text-white transition-all"
      >
        Limpiar {activeInput === 'bs' ? 'Monto Bs' : activeInput === 'binance' ? 'Tasa Binance' : 'Tasa BCV'}
      </button>

    </div>
  );
}

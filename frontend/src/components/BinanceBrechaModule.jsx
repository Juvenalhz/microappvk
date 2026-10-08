import React, { useState, useEffect } from 'react';
import { 
  TrendingDown, 
  ArrowLeftRight, 
  Copy, 
  Check, 
  Delete, 
  AlertTriangle, 
  ShieldAlert, 
  DollarSign, 
  Coins, 
  Percent,
  RefreshCw
} from 'lucide-react';

export default function BinanceBrechaModule({ bcvRate }) {
  // Tasa BCV inicial proveniente del BFF / App
  const defaultBcv = bcvRate?.tasa ? Number(bcvRate.tasa).toFixed(2) : '794.99';

  const [montoBs, setMontoBs] = useState('308000');
  const [tasaBinance, setTasaBinance] = useState('948');
  const [tasaBcv, setTasaBcv] = useState(defaultBcv);
  
  // Campo que actualmente recibe entrada del teclado táctil: 'bs' | 'binance' | 'bcv'
  const [activeInput, setActiveInput] = useState('bs');
  const [copied, setCopied] = useState(false);

  // Actualizar tasa BCV si cambia externamente y el usuario no la ha personalizado activamente
  useEffect(() => {
    if (bcvRate?.tasa) {
      setTasaBcv(Number(bcvRate.tasa).toFixed(2));
    }
  }, [bcvRate]);

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

  // Factor de reposición (cuánto deberías cobrar a tasa BCV en la tienda para no perder al cambiar a Binance)
  const factorReposicion = usdBinance > 0 ? (usdBcv / usdBinance) : 1;

  // Manejo de teclado táctil según el input activo
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

  // Botones de presets rápidos para Tasa Binance (+15%, +20%, +25% sobre BCV)
  const applyBinanceSpreadPreset = (percentage) => {
    if (bcvNum > 0) {
      const calculated = (bcvNum * (1 + percentage / 100)).toFixed(2);
      setTasaBinance(calculated);
    }
  };

  // Botón de preseteo de montos en Bs
  const handleAddBs = (amount) => {
    setMontoBs((prev) => String((parseFloat(prev) || 0) + amount));
  };

  // Copiar reporte para WhatsApp
  const handleCopyReport = () => {
    if (bsNum <= 0) return;

    const report = 
`📉 *REPORTE DE BRECHA CAMBIARIA*
----------------------------------
💰 Monto a cambiar: ${bsNum.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
🏛️ Tasa BCV: ${bcvNum.toFixed(2)} Bs/USD
💵 Venta equivalente BCV: $${usdBcv.toFixed(2)} USD

🟡 Tasa Binance: ${binanceNum.toFixed(2)} Bs/USDT
🪙 Recibido en Binance: $${usdBinance.toFixed(2)} USDT
----------------------------------
⚠️ *Pérdida en Compra:* -$${perdidaUsd.toFixed(2)} USD (-${porcentajePerdida.toFixed(2)}%)
📈 *Diferencial de Tasa:* +${brechaTasaPorcentaje.toFixed(2)}% sobre BCV
💡 *Factor Reposición:* Multiplicar precios por x${factorReposicion.toFixed(3)} para compensar brecha.`;

    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-4 max-w-lg mx-auto w-full h-full overflow-y-auto no-scrollbar space-y-3 pb-[calc(4rem+env(safe-area-inset-bottom,0.5rem))]">
      
      {/* Header del Módulo */}
      <div className="flex items-center justify-between bg-surface-card border border-surface-cardBorder rounded-2xl p-3 shadow-lg">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white leading-tight">Pérdida por Brecha Binance</h2>
            <p className="text-[11px] text-slate-400">Venta BCV vs Recompra en Binance P2P</p>
          </div>
        </div>

        <button
          onClick={handleCopyReport}
          disabled={bsNum <= 0}
          className={`px-3 py-1.5 rounded-xl flex items-center space-x-1.5 text-xs font-bold transition-all shadow ${
            copied
              ? 'bg-emerald-500 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30'
          }`}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
          <span>{copied ? '¡Copiado!' : 'Reporte'}</span>
        </button>
      </div>

      {/* Selectores de Inputs (Monto Bs, Tasa Binance, Tasa BCV) */}
      <div className="grid grid-cols-3 gap-2">
        {/* Input Monto Bs */}
        <button
          onClick={() => setActiveInput('bs')}
          className={`p-2.5 rounded-2xl text-left border transition-all relative overflow-hidden ${
            activeInput === 'bs'
              ? 'bg-brand-gold/10 border-brand-gold text-white shadow-lg shadow-amber-500/10'
              : 'bg-surface-card border-surface-cardBorder text-slate-300 hover:border-slate-700'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Monto en Bs</div>
          <div className="text-base font-black font-mono truncate text-amber-400">
            {bsNum > 0 ? bsNum.toLocaleString('es-VE') : '0'} <span className="text-[10px]">Bs</span>
          </div>
          {activeInput === 'bs' && (
            <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>

        {/* Input Tasa Binance */}
        <button
          onClick={() => setActiveInput('binance')}
          className={`p-2.5 rounded-2xl text-left border transition-all relative overflow-hidden ${
            activeInput === 'binance'
              ? 'bg-amber-500/15 border-amber-500 text-white shadow-lg shadow-amber-500/10'
              : 'bg-surface-card border-surface-cardBorder text-slate-300 hover:border-slate-700'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-0.5">Tasa Binance</div>
          <div className="text-base font-black font-mono truncate text-white">
            {binanceNum > 0 ? binanceNum.toFixed(2) : '0'}
          </div>
          {activeInput === 'binance' && (
            <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>

        {/* Input Tasa BCV */}
        <button
          onClick={() => setActiveInput('bcv')}
          className={`p-2.5 rounded-2xl text-left border transition-all relative overflow-hidden ${
            activeInput === 'bcv'
              ? 'bg-blue-500/15 border-blue-500 text-white shadow-lg shadow-blue-500/10'
              : 'bg-surface-card border-surface-cardBorder text-slate-300 hover:border-slate-700'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-0.5">Tasa BCV</div>
          <div className="text-base font-black font-mono truncate text-white">
            {bcvNum > 0 ? bcvNum.toFixed(2) : '0'}
          </div>
          {activeInput === 'bcv' && (
            <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          )}
        </button>
      </div>

      {/* Presets Rápidos según el input activo */}
      {activeInput === 'binance' && (
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 no-scrollbar">
          <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">Margen rápido:</span>
          {[15, 18, 20, 25].map((pct) => (
            <button
              key={pct}
              onClick={() => applyBinanceSpreadPreset(pct)}
              className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold hover:bg-amber-500/20 active:scale-95 transition-all"
            >
              +{pct}% ({bcvNum > 0 ? (bcvNum * (1 + pct/100)).toFixed(0) : '0'})
            </button>
          ))}
        </div>
      )}

      {activeInput === 'bs' && (
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 no-scrollbar">
          <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">Sumar Bs:</span>
          {[50000, 100000, 300000, 500000].map((amt) => (
            <button
              key={amt}
              onClick={() => handleAddBs(amt)}
              className="px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold hover:text-white active:scale-95 transition-all"
            >
              +{(amt / 1000).toFixed(0)}k Bs
            </button>
          ))}
        </div>
      )}

      {/* TARJETA RESULTADOS DE COMPARA Y PÉRDIDA */}
      <div className="bg-surface-card border border-surface-cardBorder rounded-3xl p-4 shadow-xl space-y-3 relative overflow-hidden">
        
        {/* Adorno de fondo si hay pérdida */}
        <div className="absolute -top-10 -right-10 w-28 h-28 bg-red-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Comparativa USD BCV vs Binance USDT */}
        <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-800">
          <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center space-x-1">
              <span>🏛️ Venta a Tasa BCV</span>
            </span>
            <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">
              ${usdBcv.toFixed(2)} <span className="text-[10px] font-bold text-slate-400">USD</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              {bsNum.toLocaleString()} Bs ÷ {bcvNum.toFixed(2)}
            </div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center space-x-1">
              <span>🟡 Recibido Binance</span>
            </span>
            <div className="text-xl font-black text-amber-400 font-mono mt-0.5">
              ${usdBinance.toFixed(2)} <span className="text-[10px] font-bold text-slate-400">USDT</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              {bsNum.toLocaleString()} Bs ÷ {binanceNum.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Highlight de Pérdida en Divisas */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-red-500/20 text-red-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-red-300">Pérdida en Compra</div>
              <div className="text-2xl font-black text-red-400 font-mono tracking-tight">
                -${perdidaUsd.toFixed(2)} <span className="text-xs font-bold">USD</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="inline-block px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 font-black text-xs font-mono border border-red-500/40">
              -{porcentajePerdida.toFixed(2)}%
            </div>
            <div className="text-[10px] text-slate-400 mt-1 font-medium">
              Brecha: +{brechaTasaPorcentaje.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Indicador de Factor de Reposición */}
        <div className="bg-slate-900/60 rounded-2xl p-3 border border-slate-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <Percent className="w-4 h-4 text-brand-gold shrink-0" />
            <span className="text-slate-300 font-medium">
              Para recuperar el 100% al reposicionar:
            </span>
          </div>
          <span className="font-black text-brand-gold font-mono bg-brand-gold/10 px-2 py-0.5 rounded-lg border border-brand-gold/20">
            x{factorReposicion.toFixed(3)} (+{( (factorReposicion - 1) * 100 ).toFixed(1)}%)
          </span>
        </div>

      </div>

      {/* Teclado Numérico Táctil */}
      <div className="grid grid-cols-3 gap-2 flex-1">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'DEL'].map((key) => {
          if (key === 'DEL') {
            return (
              <button
                key={key}
                onClick={() => handleKeyPress('DEL')}
                className="py-3 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-touch active:scale-95 shadow-md"
              >
                <Delete className="w-5 h-5" />
              </button>
            );
          }

          return (
            <button
              key={key}
              onClick={() => handleKeyPress(key)}
              className="py-3 rounded-2xl bg-surface-card border border-surface-cardBorder text-white font-extrabold text-xl shadow-md transition-touch active:scale-95 active:bg-slate-700"
            >
              {key}
            </button>
          );
        })}
      </div>

      {/* Botón Borrar Todo */}
      <button
        onClick={() => handleKeyPress('CLEAR')}
        className="w-full py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs font-semibold hover:text-white transition-all"
      >
        Limpiar Campo ({activeInput === 'bs' ? 'Monto Bs' : activeInput === 'binance' ? 'Tasa Binance' : 'Tasa BCV'})
      </button>

    </div>
  );
}

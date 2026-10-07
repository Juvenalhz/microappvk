import React, { useState } from 'react';
import { Delete, Copy, Check, DollarSign, Calculator, Plus } from 'lucide-react';

export default function BcvModule({ bcvRate }) {
  const [usdInput, setUsdInput] = useState('');
  const [copied, setCopied] = useState(false);

  const rawTasa = bcvRate ? Number(bcvRate.tasa) : 36.50;
  const tasa = Math.floor(rawTasa * 100) / 100;

  // Calculo de monto en USD
  const numericUsd = parseFloat(usdInput) || 0;
  const totalBs = (numericUsd * tasa).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  // Manejo de teclado táctil
  const handleKeyPress = (val) => {
    if (val === 'DEL') {
      setUsdInput(prev => prev.slice(0, -1));
    } else if (val === 'CLEAR') {
      setUsdInput('');
    } else if (val === '.') {
      if (!usdInput.includes('.')) {
        setUsdInput(prev => (prev === '' ? '0.' : prev + '.'));
      }
    } else {
      // Limitar a máximo 2 decimales si ya hay punto
      if (usdInput.includes('.')) {
        const [, decimal] = usdInput.split('.');
        if (decimal && decimal.length >= 2) return;
      }
      setUsdInput(prev => (prev === '0' ? val : prev + val));
    }
  };

  // Botones de acceso rápido (+$20, +$25, +$30, +$50)
  const handleAddPreset = (amount) => {
    const current = parseFloat(usdInput) || 0;
    const updated = (current + amount).toFixed(2);
    // Eliminar decimales innecesarios .00 si es entero
    setUsdInput(updated.endsWith('.00') ? String(parseInt(updated)) : updated);
  };

  // Copiar monto en Bs
  const handleCopyBs = () => {
    if (numericUsd <= 0) return;
    const textToCopy = `${totalBs} Bs.`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-4 max-w-lg mx-auto w-full h-full overflow-y-auto no-scrollbar space-y-3 pb-24">
      
      {/* Tarjeta de Tasa y Display de Cálculo */}
      <div className="bg-surface-card border border-surface-cardBorder rounded-3xl p-4 pb-5 shadow-xl shadow-black/30 relative overflow-hidden">
        
        {/* Adorno de fondo */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-brand-gold/10 rounded-full blur-2xl pointer-events-none" />

        {/* Tasa Oficial Header */}
        <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
          <span className="flex items-center space-x-1 font-semibold text-slate-300">
            <Calculator className="w-4 h-4 text-brand-gold" />
            <span>Tasa Oficial BCV</span>
          </span>
          <span className="font-mono bg-brand-gold/10 text-brand-gold px-2.5 py-0.5 rounded-full font-bold">
            1 USD = {tasa.toFixed(2)} Bs
          </span>
        </div>

        {/* Campo USD Ingresado */}
        <div className="text-right py-1">
          <div className="text-xs text-slate-400 font-medium mb-0.5">Monto en Divisas (USD):</div>
          <div className="text-3xl font-black text-white font-mono flex items-center justify-end">
            <span className="text-emerald-400 mr-1">$</span>
            {usdInput || '0'}
          </div>
        </div>

        <div className="my-2.5 border-t border-slate-800" />

        {/* Resultado Conversión en Bolívares */}
        <div className="flex items-center justify-between pt-1 pb-1">
          <div>
            <span className="text-xs text-slate-400 font-medium">Total a Pagar en Bs:</span>
            <div className="text-2xl font-black text-brand-gold font-mono tracking-tight">
              {totalBs} <span className="text-xs font-bold text-slate-400">Bs</span>
            </div>
          </div>

          <button
            onClick={handleCopyBs}
            disabled={numericUsd <= 0}
            className={`px-3.5 py-2.5 rounded-xl flex items-center space-x-1.5 text-xs font-bold transition-all shadow-md active:scale-95 ${
              copied
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span>¡Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-brand-gold" />
                <span>Copiar Bs</span>
              </>
            )}
          </button>
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
        Limpiar Cálculo
      </button>

    </div>
  );
}

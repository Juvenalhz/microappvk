import React, { useState, useEffect } from 'react';
import { Delete, Copy, Check, Calculator, Plus, Trash2, ShoppingBag, X } from 'lucide-react';

export default function BcvModule({ bcvRate }) {
  const [items, setItems] = useState([]); // Lista de montos sumados [15, 20, 12.5]
  const [usdInput, setUsdInput] = useState('');
  const [copied, setCopied] = useState(false);

  const rawTasa = bcvRate ? Number(bcvRate.tasa) : 36.50;
  const tasa = Math.floor(rawTasa * 100) / 100;

  // Cálculo de Subtotales y Totales en USD
  const subtotalItemsUsd = items.reduce((sum, val) => sum + val, 0);
  const currentInputNum = parseFloat(usdInput) || 0;
  const totalUsd = subtotalItemsUsd + currentInputNum;
  
  // Total a pagar en Bolívares (Tasa oficial BCV)
  const totalBsNum = totalUsd * tasa;
  const totalBsFormatted = totalBsNum.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  // Agregar prenda / monto a la lista de suma
  const handleAddItem = () => {
    if (currentInputNum > 0) {
      setItems(prev => [...prev, currentInputNum]);
      setUsdInput('');
    }
  };

  // Eliminar una prenda específica de la lista
  const handleRemoveItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Limpiar todo (lista e input)
  const handleClearAll = () => {
    setItems([]);
    setUsdInput('');
  };

  // Manejo del teclado numérico en pantalla
  const handleKeyPress = (val) => {
    if (val === 'DEL') {
      setUsdInput(prev => prev.slice(0, -1));
    } else if (val === 'CLEAR') {
      handleClearAll();
    } else if (val === '.') {
      if (!usdInput.includes('.')) {
        setUsdInput(prev => (prev === '' ? '0.' : prev + '.'));
      }
    } else {
      if (usdInput.includes('.')) {
        const [, decimal] = usdInput.split('.');
        if (decimal && decimal.length >= 2) return;
      }
      setUsdInput(prev => (prev === '0' ? val : prev + val));
    }
  };

  // Soporte completo para teclado físico de PC / Laptop (0-9, ., +, Enter, Backspace, Escape)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === '.' || e.key === ',') {
        handleKeyPress('.');
      } else if (e.key === 'Backspace') {
        handleKeyPress('DEL');
      } else if (e.key === 'Escape') {
        handleClearAll();
      } else if (e.key === '+' || e.key === 'Enter') {
        e.preventDefault();
        handleAddItem();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [usdInput, currentInputNum]);

  // Copiar monto o reporte desglose al portapapeles
  const handleCopyReport = () => {
    if (totalUsd <= 0) return;

    let textToCopy = '';
    if (items.length > 0) {
      const itemsListText = items.map((price, i) => `• Prenda ${i + 1}: $${price.toFixed(2)}`).join('\n');
      const currentPendingText = currentInputNum > 0 ? `\n• Prenda ${items.length + 1}: $${currentInputNum.toFixed(2)}` : '';
      
      textToCopy = 
`🛒 *CÁLCULO DE VENTA BCV* (${items.length + (currentInputNum > 0 ? 1 : 0)} prendas)
----------------------------------
${itemsListText}${currentPendingText}
----------------------------------
💵 *Total USD:* $${totalUsd.toFixed(2)}
🏛️ *Tasa BCV:* ${tasa.toFixed(2)} Bs
🇻🇪 *Total a Pagar:* ${totalBsFormatted} Bs`;
    } else {
      textToCopy = `${totalBsFormatted} Bs.`;
    }

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalPrendasCount = items.length + (currentInputNum > 0 ? 1 : 0);

  return (
    <div className="flex-1 flex flex-col justify-start p-3 sm:p-5 max-w-lg md:max-w-4xl mx-auto w-full h-full overflow-y-auto no-scrollbar space-y-3.5 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      
      {/* Grid Responsivo: 1 columna en móvil, 2 columnas en Desktop Web (md:) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-start">
        
        {/* COLUMNA IZQUIERDA: Tarjeta Principal y Lista de Suma de Prendas */}
        <div className="space-y-3">
          
          {/* TARJETA HERO DE CÁLCULO */}
          <div className="bg-surface-card border border-surface-cardBorder rounded-3xl p-4 sm:p-5 shadow-xl shadow-black/30 relative overflow-hidden space-y-3">
            
            {/* Adorno sutil de fondo */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-brand-gold/10 rounded-full blur-2xl pointer-events-none" />

            {/* Header Tasa Oficial BCV */}
            <div className="flex items-center justify-between text-xs sm:text-sm text-slate-400">
              <span className="flex items-center space-x-1.5 font-bold text-slate-200">
                <Calculator className="w-4 h-4 text-brand-gold" />
                <span>Calculadora BCV</span>
              </span>
              <span className="font-mono bg-brand-gold/10 text-brand-gold px-2.5 py-0.5 rounded-full font-bold text-xs">
                1 USD = {tasa.toFixed(2)} Bs
              </span>
            </div>

            {/* Display Principal: Monto USD y Conteo de Prendas */}
            <div className="py-1">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-0.5">
                <span>Total Acumulado (USD):</span>
                {totalPrendasCount > 0 && (
                  <span className="bg-slate-800 text-amber-400 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center space-x-1 border border-slate-700">
                    <ShoppingBag className="w-3 h-3 text-amber-400" />
                    <span>{totalPrendasCount} {totalPrendasCount === 1 ? 'prenda' : 'prendas'}</span>
                  </span>
                )}
              </div>

              <div className="text-3xl sm:text-4xl font-black text-white font-mono flex items-center justify-between">
                <span className="text-emerald-400 text-2xl sm:text-3xl">$</span>
                <span className="tracking-tight">{totalUsd > 0 ? totalUsd.toFixed(2) : '0.00'}</span>
              </div>
            </div>

            <div className="my-1 border-t border-slate-800" />

            {/* Total a Pagar en Bolívares */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-1 pb-1 gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-xs text-slate-400 font-medium block mb-0.5">Total a Pagar en Bs:</span>
                <div className="text-2xl sm:text-3xl font-black text-brand-gold font-mono tracking-tight break-all">
                  {totalBsFormatted} <span className="text-xs sm:text-sm font-bold text-slate-400">Bs</span>
                </div>
              </div>

              <button
                onClick={handleCopyReport}
                disabled={totalUsd <= 0}
                className={`px-3.5 py-2 rounded-xl flex items-center justify-center space-x-1.5 text-xs font-bold transition-all shadow-md shrink-0 active:scale-95 ${
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
                    <span>{items.length > 0 ? 'Copiar Ticket' : 'Copiar Bs'}</span>
                  </>
                )}
              </button>
            </div>

          </div>

          {/* LISTA / TICKET DE PRENDAS AGREGADAS */}
          {items.length > 0 && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 space-y-2 animate-fade-in">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300 px-1">
                <span className="flex items-center space-x-1 text-amber-400">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Desglose de prendas sumadas:</span>
                </span>
                <button
                  onClick={handleClearAll}
                  className="text-[10px] text-red-400 hover:text-red-300 font-semibold flex items-center space-x-1 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Vaciar Lista</span>
                </button>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 no-scrollbar">
                {items.map((price, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-slate-950/70 px-3 py-1.5 rounded-xl border border-slate-800/80 text-xs"
                  >
                    <span className="text-slate-300 font-medium">
                      Prenda {idx + 1}:
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-emerald-400">
                        ${price.toFixed(2)} USD
                      </span>
                      <button
                        onClick={() => handleRemoveItem(idx)}
                        className="text-slate-500 hover:text-red-400 p-0.5 rounded transition-all"
                        title="Eliminar esta prenda"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* COLUMNA DERECHA: Teclado Numérico + Botón Sumar Prenda */}
        <div className="space-y-2.5">
          
          {/* Indicador de entrada actual */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Ingresando prenda:</span>
            <span className="font-mono font-extrabold text-white text-base">
              ${usdInput || '0'} <span className="text-xs text-slate-400 font-normal">USD</span>
            </span>
          </div>

          {/* Teclado Táctil */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'DEL'].map((key) => {
              if (key === 'DEL') {
                return (
                  <button
                    key={key}
                    onClick={() => handleKeyPress('DEL')}
                    className="py-3 sm:py-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-touch active:scale-95 shadow"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                );
              }

              return (
                <button
                  key={key}
                  onClick={() => handleKeyPress(key)}
                  className="py-3 sm:py-3.5 rounded-2xl bg-surface-card border border-surface-cardBorder text-white font-extrabold text-xl shadow transition-touch active:scale-95 active:bg-slate-700"
                >
                  {key}
                </button>
              );
            })}
          </div>

          {/* Botones de Acción: Sumar Prenda (+) y Limpiar */}
          <div className="grid grid-cols-3 gap-2 pt-0.5">
            <button
              onClick={handleAddItem}
              disabled={currentInputNum <= 0}
              className={`col-span-2 py-3 rounded-2xl font-black text-sm flex items-center justify-center space-x-2 transition-all shadow-lg active:scale-95 ${
                currentInputNum > 0
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-amber-500/20'
                  : 'bg-slate-800/60 text-slate-500 border border-slate-800'
              }`}
            >
              <Plus className="w-5 h-5 stroke-[3]" />
              <span>Sumar Prenda (+)</span>
            </button>

            <button
              onClick={handleClearAll}
              className="col-span-1 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 text-xs font-bold hover:text-white transition-all active:scale-95"
            >
              Limpiar
            </button>
          </div>

        </div>

      </div>

    </div>
  );
}


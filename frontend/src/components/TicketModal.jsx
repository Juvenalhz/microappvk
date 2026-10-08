import React, { useState } from 'react';
import { X, ShoppingBag, Trash2, Copy, Check, Plus, Minus, Send } from 'lucide-react';

export default function TicketModal({ isOpen, onClose, ticketItems, setTicketItems, bcvRate }) {
  const [copiedMode, setCopiedMode] = useState(null); // 'full' | 'bs_only' | null

  if (!isOpen) return null;

  const rawTasa = bcvRate ? Number(bcvRate.tasa) : 36.50;
  const tasa = Math.floor(rawTasa * 100) / 100;

  // Cálculos de Totales
  const totalUsd = ticketItems.reduce((acc, item) => acc + (item.precio_usd * item.cant), 0);
  const totalBsNum = totalUsd * tasa;
  const totalBsFormatted = totalBsNum.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const totalCount = ticketItems.reduce((acc, item) => acc + item.cant, 0);

  // Modificar cantidad
  const handleUpdateQty = (itemId, delta) => {
    setTicketItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const newQty = item.cant + delta;
        return newQty > 0 ? { ...item, cant: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  // Modificar precio unitario (oferta/descuento personalizado en ticket)
  const handleUpdatePrice = (itemId, newPriceVal) => {
    const val = parseFloat(newPriceVal);
    if (!isNaN(val) && val >= 0) {
      setTicketItems(prev => prev.map(item => item.id === itemId ? { ...item, precio_usd: val } : item));
    }
  };

  // Eliminar prenda
  const handleRemoveItem = (itemId) => {
    setTicketItems(prev => prev.filter(item => item.id !== itemId));
  };

  // Vaciar ticket
  const handleClearAll = () => {
    setTicketItems([]);
  };

  // Copiar solo el monto en Bolívares
  const handleCopyBsOnly = () => {
    if (totalBsNum <= 0) return;
    navigator.clipboard.writeText(`${totalBsFormatted} Bs.`);
    setCopiedMode('bs_only');
    setTimeout(() => setCopiedMode(null), 2000);
  };

  // Helper para convertir nombre a Mayúscula Inicial (Title Case)
  const toTitleCase = (str) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Copiar el reporte detallado formateado para WhatsApp
  const handleCopyFullReport = () => {
    if (ticketItems.length === 0) return;

    const itemsText = ticketItems.map((item) => {
      const formattedName = toTitleCase(item.nombre);
      const colorText = item.color ? item.color.toUpperCase() : 'ÚNICO';
      return (
`${formattedName}
• Color: ${colorText} | Talla: ${item.talla}
• Cantidad: ${item.cant} x $${item.precio_usd.toFixed(2)} USD`
      );
    }).join('\n\n');

    const fullReport = 
`📋 *DETALLADO DE COMPRA*
----------------------------------
${itemsText}
----------------------------------
📦 Total prendas: ${totalCount}
💵 Total USD: $${totalUsd.toFixed(2)} USD
🏛️ Tasa BCV Oficial: ${tasa.toFixed(2)} Bs
🇻🇪 *TOTAL A PAGAR: ${totalBsFormatted} Bs*`;

    navigator.clipboard.writeText(fullReport);
    setCopiedMode('full');
    setTimeout(() => setCopiedMode(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
        
        {/* Cabecera del Cotizador */}
        <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-base leading-tight">Ticket de Cotización</h3>
              <p className="text-xs text-slate-400">Seleccionado directamente del stock</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-all active:scale-90"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo / Lista de Prendas Seleccionadas */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
          {ticketItems.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <ShoppingBag className="w-12 h-12 text-slate-600 mx-auto stroke-[1.5]" />
              <p className="text-slate-300 font-bold text-sm">El ticket está vacío</p>
              <p className="text-slate-500 text-xs max-w-xs mx-auto">
                Navega en el módulo <strong>Stock</strong> y toca cualquier talla disponible para agregarla aquí.
              </p>
            </div>
          ) : (
            ticketItems.map((item) => {
              const itemBs = (item.precio_usd * item.cant * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2 });

              return (
                <div 
                  key={item.id}
                  className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3 flex items-start justify-between gap-3 shadow"
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-white text-sm truncate">{item.nombre}</h4>
                    <div className="flex items-center space-x-2 mt-1 text-xs">
                      <span className="bg-slate-800 text-amber-400 font-bold px-2 py-0.5 rounded-md text-[10px] uppercase border border-slate-700">
                        {item.color}
                      </span>
                      <span className="bg-emerald-500/20 text-emerald-300 font-extrabold px-2 py-0.5 rounded-md text-[10px] border border-emerald-500/30">
                        Talla: {item.talla}
                      </span>
                    </div>
                    
                    <div className="mt-2 text-xs font-mono flex items-center space-x-2">
                      <div className="flex items-center space-x-1 bg-slate-950 px-2 py-0.5 rounded-lg border border-emerald-500/40 text-emerald-400 font-bold shadow-inner">
                        <span>$</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={item.precio_usd}
                          onChange={(e) => handleUpdatePrice(item.id, e.target.value)}
                          className="w-14 bg-transparent text-emerald-400 font-mono font-bold focus:outline-none text-xs"
                          title="Modificar precio para este ticket/oferta"
                        />
                      </div>
                      <span className="text-slate-400 text-[11px] font-sans">≈ {itemBs} Bs</span>
                    </div>
                  </div>

                  {/* Controles de Cantidad */}
                  <div className="flex flex-col items-end justify-between space-y-2 shrink-0">
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-slate-500 hover:text-red-400 p-1 transition-all"
                      title="Quitar prenda"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="flex items-center space-x-1.5 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800">
                      <button
                        onClick={() => handleUpdateQty(item.id, -1)}
                        className="text-slate-400 hover:text-white p-0.5 rounded"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-extrabold text-white text-xs px-1 font-mono">{item.cant}</span>
                      <button
                        onClick={() => handleUpdateQty(item.id, 1)}
                        className="text-slate-400 hover:text-white p-0.5 rounded"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Resumen de Totales y Botones de Acción */}
        {ticketItems.length > 0 && (
          <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3 shrink-0">
            
            {/* Totales */}
            <div className="space-y-1 bg-slate-900/90 p-3 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>Total Prendas ({totalCount}):</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">${totalUsd.toFixed(2)} USD</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span>Tasa Oficial BCV:</span>
                <span className="font-mono font-bold text-amber-400">{tasa.toFixed(2)} Bs</span>
              </div>
              <div className="my-1 border-t border-slate-800" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase">Total a Pagar:</span>
                <span className="text-xl font-black text-brand-gold font-mono">{totalBsFormatted} Bs</span>
              </div>
            </div>

            {/* Dos Botones de Copiar Diferenciados */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleCopyBsOnly}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all shadow active:scale-95 ${
                  copiedMode === 'bs_only'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
              >
                {copiedMode === 'bs_only' ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>¡Bs Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-brand-gold" />
                    <span>Copiar Solo Bs</span>
                  </>
                )}
              </button>

              <button
                onClick={handleCopyFullReport}
                className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all shadow active:scale-95 ${
                  copiedMode === 'full'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                }`}
              >
                {copiedMode === 'full' ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>¡Detalle Copiado!</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Copiar Detalle</span>
                  </>
                )}
              </button>
            </div>

            {/* Vaciar Ticket */}
            <button
              onClick={handleClearAll}
              className="w-full py-1.5 text-[11px] font-semibold text-slate-400 hover:text-red-400 transition-colors text-center"
            >
              Vaciar Ticket de Venta
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

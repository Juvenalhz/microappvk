import React, { useRef } from 'react';
import { Search, X, Package, CheckCircle2 } from 'lucide-react';
import { filterCatalog, tokenizeQuery, normalizeStr, SYNONYMS_MAP } from '../utils/searchEngine';

export default function StockModule({ stockData, bcvRate, searchTerm, setSearchTerm, isLoading }) {
  const inputRef = useRef(null);
  const rawTasa = bcvRate ? Number(bcvRate.tasa) : 0;
  const tasa = rawTasa > 0 ? Math.floor(rawTasa * 100) / 100 : 0;

  const handleClear = () => {
    setSearchTerm('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Filtrado avanzado por tokens (0ms en cliente)
  const filteredData = filterCatalog(stockData, searchTerm);
  const activeTokens = tokenizeQuery(searchTerm);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-4 space-y-4 max-w-lg mx-auto w-full">
      
      {/* Barra de Búsqueda instantánea con soporte multitérmino */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <Search className="w-5 h-5" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar: ej. tshirt blanca, pantalon 32..."
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          className="w-full pl-11 pr-10 py-3 bg-surface-card border border-surface-cardBorder rounded-xl text-white placeholder-slate-400 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 shadow-inner transition-all"
        />
        {searchTerm && (
          <button
            onClick={handleClear}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5 bg-slate-800 rounded-full p-0.5" />
          </button>
        )}
      </div>

      {/* Contador de resultados y etiquetas de filtro activo */}
      <div className="flex flex-col space-y-1.5 px-1 text-xs text-slate-400">
        <div className="flex items-center justify-between">
          <span>Resultados ({filteredData ? filteredData.length : 0} modelos)</span>
          {isLoading && <span className="text-brand-500 font-medium animate-pulse">Buscando...</span>}
        </div>

        {/* Tokens reconocidos */}
        {activeTokens.length > 0 && (
          <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Filtros:</span>
            {activeTokens.map((t, idx) => (
              <span key={idx} className="bg-brand-500/15 text-brand-500 border border-brand-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Lista de Modelos (Scrollable con aceleración GPU) */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 no-scrollbar smooth-scroll pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
        {!filteredData || filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-6 bg-surface-card/40 rounded-2xl border border-surface-cardBorder">
            <Package className="w-12 h-12 text-slate-600 mb-2 stroke-[1.5]" />
            <p className="text-slate-300 font-medium text-sm">No se encontraron prendas</p>
            <p className="text-slate-500 text-xs mt-1">Prueba combinando prendas, color o talla (ej: "franela marron s")</p>
          </div>
        ) : (
          filteredData.map((item) => {
            const precioBs = tasa > 0 ? (item.precio_usd * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--';

            return (
              <div 
                key={item.id}
                className="product-card bg-surface-card border border-surface-cardBorder rounded-2xl p-4 shadow-md shadow-black/20"
              >
                {/* Cabecera del Modelo */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-1.5 mb-1">
                      <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-800 text-slate-400 uppercase tracking-wide">
                        {item.categoria}
                      </span>
                      {item.verified_live && (
                        <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>En vivo ERP</span>
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-white text-base leading-snug">{item.nombre}</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">MOD: {item.id}</p>
                  </div>

                  {/* Precios USD & Bs */}
                  <div className="text-right">
                    <div className="text-lg font-black text-emerald-400 flex items-center justify-end">
                      <span className="text-sm mr-0.5">$</span>
                      {Number(item.precio_usd).toFixed(2)}
                    </div>
                    <div className="text-[11px] font-medium text-brand-gold bg-brand-gold/10 px-2 py-0.5 rounded-full inline-block mt-0.5">
                      ≈ {precioBs} Bs
                    </div>
                  </div>
                </div>

                {/* Separador */}
                <div className="my-3 border-t border-slate-800/80" />

                {/* Variantes por Color y Talla (Semáforo Inteligente y Enfocado) */}
                <div className="space-y-3">
                  {(() => {
                    // Identificar si la búsqueda actual contiene tokens de color o talla
                    const colorTokens = activeTokens.filter(token => {
                      return item.colores?.some(c => {
                        const normC = normalizeStr(c.color);
                        const canonC = SYNONYMS_MAP[normC] || normC;
                        return normC.includes(token) || canonC.includes(token) || SYNONYMS_MAP[token] === canonC;
                      });
                    });
                    const hasColorToken = colorTokens.length > 0;

                    const sizeTokens = activeTokens.filter(token => {
                      return item.colores?.some(c => c.tallas?.some(t => normalizeStr(t.talla) === token)) ||
                             item.variantes?.some(v => normalizeStr(v.talla) === token);
                    });
                    const hasSizeToken = sizeTokens.length > 0;

                    // Filtrar colores: Si se especificó un color (ej: "marron"), ocultar los demás colores
                    let displayColores = item.colores || [];
                    if (hasColorToken) {
                      displayColores = displayColores.filter(c => {
                        const normC = normalizeStr(c.color);
                        const canonC = SYNONYMS_MAP[normC] || normC;
                        return colorTokens.some(t => normC.includes(t) || canonC.includes(t) || SYNONYMS_MAP[t] === canonC);
                      });
                    }

                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            {hasColorToken ? 'Color Filtrado:' : 'Disponibilidad por Variantes:'}
                          </span>
                          <span className="text-xs font-medium text-slate-300">
                            Total: <strong className="text-white">{item.total_stock} unids.</strong>
                          </span>
                        </div>

                        {displayColores.length > 0 ? (
                          displayColores.map((colorGroup) => {
                            const normColor = normalizeStr(colorGroup.color);
                            const canonColor = SYNONYMS_MAP[normColor] || normColor;
                            const isColorMatched = hasColorToken && colorTokens.some(t => normColor.includes(t) || canonColor.includes(t) || SYNONYMS_MAP[t] === canonColor);

                            // Si se está buscando una talla específica, ocultar las variantes agotadas (stock 0) para limpiar la vista
                            let visibleTallas = colorGroup.tallas || [];
                            if (hasSizeToken) {
                              const avail = visibleTallas.filter(t => t.stock > 0);
                              if (avail.length > 0) visibleTallas = avail;
                            }

                            return (
                              <div 
                                key={colorGroup.color} 
                                className={`p-2.5 rounded-xl border transition-all ${
                                  isColorMatched
                                    ? 'bg-slate-900/90 border-brand-500/60 ring-1 ring-brand-500/40'
                                    : 'bg-slate-900/40 border-slate-800/80'
                                }`}
                              >
                                {colorGroup.color !== 'GENERAL' && (
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-slate-200 flex items-center space-x-1">
                                      <span className={`w-2 h-2 rounded-full inline-block ${isColorMatched ? 'bg-brand-500 animate-pulse' : 'bg-slate-500'}`} />
                                      <span className={`uppercase tracking-wide ${isColorMatched ? 'text-brand-500 font-extrabold' : ''}`}>
                                        {colorGroup.color}
                                      </span>
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {colorGroup.total_color_stock} disp.
                                    </span>
                                  </div>
                                )}

                                <div className="grid grid-cols-4 gap-2">
                                  {visibleTallas.map((varItem) => {
                                    const qty = varItem.stock;
                                    const isSizeMatched = hasSizeToken && sizeTokens.includes(normalizeStr(varItem.talla));

                                    let badgeClasses = '';
                                    if (isSizeMatched) {
                                      badgeClasses = 'ring-2 ring-brand-500 scale-105 shadow-md shadow-brand-500/30 ';
                                    }

                                    if (qty > 1) {
                                      return (
                                        <div 
                                          key={varItem.talla}
                                          className={`${badgeClasses} bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-xl p-2 text-center flex flex-col items-center justify-center`}
                                        >
                                          <span className="font-bold text-sm leading-none">{varItem.talla}</span>
                                          <span className="text-[10px] font-medium opacity-90 mt-1">{qty} dispon.</span>
                                        </div>
                                      );
                                    } else if (qty === 1) {
                                      return (
                                        <div 
                                          key={varItem.talla}
                                          className={`${badgeClasses} relative bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-xl p-2 text-center flex flex-col items-center justify-center`}
                                        >
                                          <span className="absolute -top-2 bg-amber-500 text-slate-950 font-black text-[8px] px-1.5 rounded-full uppercase tracking-wider">
                                            ¡ÚLTIMA!
                                          </span>
                                          <span className="font-bold text-sm leading-none mt-1">{varItem.talla}</span>
                                          <span className="text-[10px] font-bold text-amber-200 mt-0.5">1 disp.</span>
                                        </div>
                                      );
                                    } else {
                                      return (
                                        <div 
                                          key={varItem.talla}
                                          className={`${badgeClasses} bg-slate-800/40 border border-slate-800 text-slate-500 rounded-xl p-2 text-center flex flex-col items-center justify-center opacity-60`}
                                        >
                                          <span className="font-bold text-sm leading-none line-through">{varItem.talla}</span>
                                          <span className="text-[10px] font-medium mt-1">Agotada</span>
                                        </div>
                                      );
                                    }
                                  })}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-xs text-slate-400 italic">No hay colores coincidentes</div>
                        )}
                      </>
                    );
                  })()}
                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
}

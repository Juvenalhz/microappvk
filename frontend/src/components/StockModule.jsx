import React, { useRef, useState } from 'react';
import { Search, X, Package, CheckCircle2, Eye, EyeOff, ArrowUpDown } from 'lucide-react';
import { filterCatalog, tokenizeQuery, normalizeStr, COLOR_CANONICAL_SET, doesColorGroupMatch, getItemFamilies } from '../utils/searchEngine';

const QUICK_CATEGORIES = [
  { id: 'ALL', label: 'Todas' },
  { id: 'tshirt', label: 'T-Shirts' },
  { id: 'camisa', label: 'Camisas' },
  { id: 'chemise', label: 'Chemises' },
  { id: 'set', label: 'Sets / Conjuntos' },
  { id: 'pantalon', label: 'Pantalones' },
  { id: 'jean', label: 'Jeans' },
  { id: 'short', label: 'Shorts' },
  { id: 'bermuda', label: 'Bermudas' },
  { id: 'sweater', label: 'Sweaters' },
  { id: 'chaqueta', label: 'Chaquetas' },
  { id: 'jogger', label: 'Joggers' }
];

const QUICK_SIZES = ['S', 'M', 'L', 'XL', '30', '32', '34', '36', '38'];

export default function StockModule({ stockData, bcvRate, searchTerm, setSearchTerm, isLoading, onAddToCart, ticketItems = [], onOpenTicket }) {
  const inputRef = useRef(null);
  const [quickCat, setQuickCat] = useState('ALL');
  const [quickSize, setQuickSize] = useState('');
  const [hideZeroStock, setHideZeroStock] = useState(true);
  const [sortBy, setSortBy] = useState('default'); // 'default' | 'stock_desc' | 'price_asc' | 'price_desc' | 'name_asc'

  const rawTasa = bcvRate ? Number(bcvRate.tasa) : 0;
  const tasa = rawTasa > 0 ? Math.floor(rawTasa * 100) / 100 : 0;

  const handleClear = () => {
    setSearchTerm('');
    setQuickCat('ALL');
    setQuickSize('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Combinar búsqueda escrita con filtros rápidos de categoría y talla
  const combinedQuery = [
    searchTerm,
    quickCat !== 'ALL' ? quickCat : '',
    quickSize
  ].filter(Boolean).join(' ').trim();

  // Filtrado avanzado por tokens (0ms en cliente)
  let filteredData = filterCatalog(stockData, combinedQuery);

  // Filtrar agotados si el switch "Disponibles" está activo
  if (hideZeroStock) {
    filteredData = filteredData.filter(item => Number(item.total_stock || 0) > 0);
  }

  // Ordenamiento rápido
  if (sortBy !== 'default') {
    filteredData = [...filteredData].sort((a, b) => {
      if (sortBy === 'stock_desc') return Number(b.total_stock || 0) - Number(a.total_stock || 0);
      if (sortBy === 'price_asc') return Number(a.precio_usd || 0) - Number(b.precio_usd || 0);
      if (sortBy === 'price_desc') return Number(b.precio_usd || 0) - Number(a.precio_usd || 0);
      if (sortBy === 'name_asc') return (a.nombre || '').localeCompare(b.nombre || '');
      return 0;
    });
  }

  const activeTokens = tokenizeQuery(combinedQuery);

  const totalTicketUsd = ticketItems.reduce((acc, i) => acc + (i.precio_usd * i.cant), 0);
  const totalTicketCount = ticketItems.reduce((acc, i) => acc + i.cant, 0);

  const sizeRegex = /^(xs|s|m|l|xl|xxl|2xl|3xl|4xl|unica|[0-9]{2})$/i;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-3 sm:p-4 space-y-2.5 max-w-lg md:max-w-6xl mx-auto w-full">
      
      {/* 1. Barra de Búsqueda + Controles Superiores */}
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar prenda, color o talla (ej: tshirt blanca m)..."
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            className="w-full pl-10 pr-10 py-2.5 sm:py-3 bg-surface-card border border-surface-cardBorder rounded-xl text-white placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 shadow-inner transition-all"
          />
          {(searchTerm || quickCat !== 'ALL' || quickSize) && (
            <button
              onClick={handleClear}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
              title="Limpiar filtros"
            >
              <X className="w-5 h-5 bg-slate-800 rounded-full p-0.5" />
            </button>
          )}
        </div>

        {/* Controles rápidos: Ocultar Agotados + Ordenar */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setHideZeroStock(!hideZeroStock)}
            className={`px-2.5 py-2 rounded-xl text-[11px] font-bold border flex items-center space-x-1.5 transition-all cursor-pointer shrink-0 ${
              hideZeroStock
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
            title="Mostrar u ocultar prendas y colores en 0 stock"
          >
            {hideZeroStock ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{hideZeroStock ? 'Solo con Stock' : 'Incl. Agotados'}</span>
          </button>

          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-[11px] text-slate-300 flex-1 md:flex-initial">
            <ArrowUpDown className="w-3.5 h-3.5 text-amber-400 mr-1.5 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-slate-200 font-bold focus:outline-none w-full cursor-pointer text-[11px]"
            >
              <option value="default" className="bg-slate-950">Orden: Relevancia</option>
              <option value="stock_desc" className="bg-slate-950">Mayor Stock</option>
              <option value="price_asc" className="bg-slate-950">Precio: Menor a Mayor</option>
              <option value="price_desc" className="bg-slate-950">Precio: Mayor a Menor</option>
              <option value="name_asc" className="bg-slate-950">Nombre (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Píldoras Rápidas de Categoría (1 toque sin usar el teclado) */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 shrink-0">
        {QUICK_CATEGORIES.map((cat) => {
          const isActive = quickCat === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setQuickCat(isActive && cat.id !== 'ALL' ? 'ALL' : cat.id)}
              className={`px-3 py-1 rounded-full text-[11px] font-extrabold whitespace-nowrap border transition-all cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm'
                  : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* 3. Píldoras Rápidas de Talla + Contador de Resultados */}
      <div className="flex items-center justify-between gap-2 text-xs text-slate-400 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase mr-1 shrink-0">Talla:</span>
          {QUICK_SIZES.map((sz) => {
            const isSel = quickSize.toUpperCase() === sz;
            return (
              <button
                key={sz}
                onClick={() => setQuickSize(isSel ? '' : sz.toLowerCase())}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold border transition-all cursor-pointer shrink-0 ${
                  isSel
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                    : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {sz}
              </button>
            );
          })}
        </div>

        <span className="text-[11px] font-mono text-slate-400 shrink-0">
          <strong className="text-white">{filteredData ? filteredData.length : 0}</strong> modelos
          {isLoading && <span className="text-brand-500 ml-1 animate-pulse">• Sync...</span>}
        </span>
      </div>

      {/* Banner Flotante de Ticket Activo si hay prendas seleccionadas */}
      {totalTicketCount > 0 && (
        <div 
          onClick={onOpenTicket}
          className="bg-gradient-to-r from-amber-500/20 via-surface-card to-amber-500/10 border border-amber-500/40 rounded-2xl p-2.5 px-3.5 flex items-center justify-between cursor-pointer hover:border-amber-400 transition-all shadow-lg active:scale-98 animate-fade-in shrink-0"
        >
          <div className="flex items-center space-x-2">
            <span className="bg-amber-500 text-slate-950 font-black text-xs px-2 py-0.5 rounded-full uppercase tracking-wider">
              {totalTicketCount} {totalTicketCount === 1 ? 'prenda' : 'prendas'}
            </span>
            <span className="text-xs font-bold text-white">
              Ticket: <strong className="text-amber-400 font-mono">${totalTicketUsd.toFixed(2)} USD</strong>
            </span>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onOpenTicket(); }}
            className="bg-amber-500 text-slate-950 text-[11px] font-black px-2.5 py-1 rounded-xl shadow hover:bg-amber-400 transition-all"
          >
            Ver Detalle 📋
          </button>
        </div>
      )}

      {/* Lista de Modelos en Grilla Responsiva (1 col en móvil, 2 en tablet/laptop, 3 en pantallas anchas) */}
      <div className="flex-1 overflow-y-auto pr-1 no-scrollbar smooth-scroll pb-[calc(4.5rem+env(safe-area-inset-bottom,16px))]">
        {!filteredData || filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-6 bg-surface-card/40 rounded-2xl border border-surface-cardBorder">
            <Package className="w-12 h-12 text-slate-600 mb-2 stroke-[1.5]" />
            <p className="text-slate-300 font-medium text-sm">No se encontraron prendas con ese filtro</p>
            <p className="text-slate-500 text-xs mt-1">
              {hideZeroStock ? 'Prueba limpiando los filtros o activando "Incl. Agotados"' : 'Prueba combinando prenda, color o talla'}
            </p>
            {(searchTerm || quickCat !== 'ALL' || quickSize) && (
              <button
                onClick={handleClear}
                className="mt-3 px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/30"
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 items-start">
            {filteredData.map((item) => {
              const precioBs = tasa > 0 ? (item.precio_usd * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--';

              return (
                <div 
                  key={item.id}
                  className="product-card bg-surface-card border border-surface-cardBorder rounded-2xl p-3.5 sm:p-4 shadow-md shadow-black/20"
                >
                  {/* Cabecera del Modelo */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5 mb-1">
                        <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-800 text-slate-300 uppercase tracking-wide">
                          {item.categoria}
                        </span>
                        <span className="inline-block px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-slate-900 text-amber-400 border border-slate-800">
                          {item.total_stock} disp.
                        </span>
                        {item.verified_live && (
                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>En vivo</span>
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-white text-sm sm:text-base leading-snug truncate">{item.nombre}</h3>
                    </div>

                    {/* Precios USD & Bs */}
                    <div className="text-right shrink-0">
                      <div className="text-base sm:text-lg font-black text-emerald-400 flex items-center justify-end leading-none">
                        <span className="text-xs mr-0.5">$</span>
                        {Number(item.precio_usd).toFixed(2)}
                      </div>
                      <div className="text-[10px] font-medium text-brand-gold bg-brand-gold/10 px-2 py-0.5 rounded-full inline-block mt-1">
                        ≈ {precioBs} Bs
                      </div>
                    </div>
                  </div>

                  {/* Separador */}
                  <div className="my-2.5 border-t border-slate-800/80" />

                  {/* Variantes por Color y Talla */}
                  <div className="space-y-2.5">
                    {(() => {
                      const colorTokens = activeTokens.filter(token => COLOR_CANONICAL_SET.has(token));
                      const hasColorToken = colorTokens.length > 0;

                      const sizeTokens = activeTokens.filter(token => sizeRegex.test(token));
                      const hasSizeToken = sizeTokens.length > 0;

                      let displayColores = item.colores || [];
                      if (hasColorToken) {
                        displayColores = displayColores.filter(c => doesColorGroupMatch(item, c, colorTokens));
                      }

                      // Si "Solo con Stock" está activo, ocultar bloques de color totalmente agotados (0 disp.) para no hacer las tarjetas eternas
                      if (hideZeroStock) {
                        displayColores = displayColores.filter(c => Number(c.total_color_stock || 0) > 0);
                      }

                      if (hasSizeToken) {
                        displayColores = displayColores.filter(c => {
                          const tallas = Array.isArray(c.tallas) ? c.tallas : [];
                          return tallas.some(t => Number(t.stock) > 0 && sizeTokens.includes(normalizeStr(t.talla)));
                        });
                      }

                      return (
                        <>
                          {displayColores.length > 0 ? (
                            displayColores.map((colorGroup) => {
                              const isColorMatched = hasColorToken && doesColorGroupMatch(item, colorGroup, colorTokens);

                              let visibleTallas = colorGroup.tallas || [];
                              if (hasSizeToken) {
                                visibleTallas = visibleTallas.filter(t => Number(t.stock) > 0 && sizeTokens.includes(normalizeStr(t.talla)));
                              }

                              return (
                                <div 
                                  key={colorGroup.color} 
                                  className={`p-2 rounded-xl border transition-all ${
                                    isColorMatched
                                      ? 'bg-slate-900/90 border-brand-500/60 ring-1 ring-brand-500/40'
                                      : 'bg-slate-900/40 border-slate-800/80'
                                  }`}
                                >
                                  {colorGroup.color !== 'GENERAL' && colorGroup.color !== 'TALLA' && (
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-[11px] font-bold text-slate-200 flex items-center space-x-1">
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

                                  <div className="grid grid-cols-4 gap-1.5">
                                    {visibleTallas.map((varItem) => {
                                      const qty = varItem.stock;
                                      const isSizeMatched = hasSizeToken && sizeTokens.includes(normalizeStr(varItem.talla));

                                      const handleSelectVariant = () => {
                                        if (qty > 0 && onAddToCart) {
                                          onAddToCart({
                                            id: `${item.id}-${colorGroup.color}-${varItem.talla}`,
                                            modelId: item.id,
                                            erp_product_id: item.erp_product_id || item.id,
                                            nombre: item.nombre,
                                            color: colorGroup.color,
                                            talla: varItem.talla,
                                            sku: varItem.sku || `${item.id}-${colorGroup.color}-${varItem.talla}`,
                                            precio_usd: item.precio_usd,
                                            cant: 1
                                          });
                                        }
                                      };

                                      let badgeClasses = '';
                                      if (isSizeMatched) {
                                        badgeClasses = 'ring-2 ring-brand-500 scale-105 shadow-md shadow-brand-500/30 ';
                                      }

                                      if (qty > 1) {
                                        return (
                                          <button 
                                            key={varItem.talla}
                                            onClick={handleSelectVariant}
                                            className={`${badgeClasses} bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-300 rounded-xl py-1.5 px-1 text-center flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer relative group`}
                                            title="Toca para agregar a Cotización"
                                          >
                                            <span className="font-bold text-xs sm:text-sm leading-none flex items-center">
                                              {varItem.talla}
                                              <span className="ml-0.5 text-[9px] font-black text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity">+</span>
                                            </span>
                                            <span className="text-[9px] sm:text-[10px] font-medium opacity-90 mt-0.5">{qty} disp.</span>
                                          </button>
                                        );
                                      } else if (qty === 1) {
                                        return (
                                          <button 
                                            key={varItem.talla}
                                            onClick={handleSelectVariant}
                                            className={`${badgeClasses} relative bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-300 rounded-xl py-1.5 px-1 text-center flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer group`}
                                            title="Toca para agregar a Cotización"
                                          >
                                            <span className="absolute -top-2 bg-amber-500 text-slate-950 font-black text-[7px] px-1.5 rounded-full uppercase tracking-wider">
                                              ¡ÚLTIMA!
                                            </span>
                                            <span className="font-bold text-xs sm:text-sm leading-none mt-0.5">{varItem.talla}</span>
                                            <span className="text-[9px] sm:text-[10px] font-bold text-amber-200 mt-0.5">1 disp.</span>
                                          </button>
                                        );
                                      } else {
                                        return (
                                          <div 
                                            key={varItem.talla}
                                            className={`${badgeClasses} bg-slate-800/40 border border-slate-800 text-slate-500 rounded-xl py-1.5 px-1 text-center flex flex-col items-center justify-center opacity-50 pointer-events-none`}
                                          >
                                            <span className="font-bold text-xs sm:text-sm leading-none line-through">{varItem.talla}</span>
                                            <span className="text-[9px] font-medium mt-0.5">0</span>
                                          </div>
                                        );
                                      }
                                    })}
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-xs text-slate-400 italic">No hay colores con stock disponible</div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

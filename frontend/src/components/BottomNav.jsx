import React, { useState } from 'react';
import { Search, Calculator, TrendingDown, CreditCard, Layout, Layers } from 'lucide-react';

export default function BottomNav({ activeTab, setActiveTab }) {
  // Estado para alternar entre Modo A (Dock Flotante) y Modo B (Barra Fija Full Width)
  const [navStyle, setNavStyle] = useState(() => {
    return localStorage.getItem('vk_nav_style') || 'dock'; // 'dock' | 'full'
  });

  const toggleNavStyle = (e) => {
    e.stopPropagation();
    const nextStyle = navStyle === 'dock' ? 'full' : 'dock';
    setNavStyle(nextStyle);
    localStorage.setItem('vk_nav_style', nextStyle);
  };

  const navItems = [
    {
      id: 'stock',
      label: 'Stock',
      icon: Search,
      badge: null
    },
    {
      id: 'bcv',
      label: 'Calculadora',
      icon: Calculator,
      badge: 'BCV'
    },
    {
      id: 'binance',
      label: 'Brecha',
      icon: TrendingDown,
      badge: 'Binance'
    },
    {
      id: 'pago',
      label: 'Pago Móvil',
      icon: CreditCard,
      badge: null
    }
  ];

  return (
    <>
      {navStyle === 'dock' ? (
        /* OPCIÓN A: Dock Flotante Ultra Compacto (Esquinas redondeadas, ancho contenido, pegado justo arriba del Home Indicator) */
        <nav className="fixed inset-x-3 bottom-[calc(0.25rem+env(safe-area-inset-bottom,0px))] z-50 mx-auto max-w-md flex items-center justify-around py-1.5 px-2 rounded-2xl bg-[#0d1624]/95 backdrop-blur-md border border-slate-700/60 shadow-2xl shadow-black/80 transition-all">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all relative ${
                  isActive ? 'text-amber-400 bg-amber-400/10 font-bold' : 'text-slate-400 hover:text-slate-200 font-medium'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 text-amber-400' : 'text-slate-400'}`} />
                  {item.badge && (
                    <span className="absolute -top-1 -right-3.5 bg-brand-gold text-slate-950 font-black text-[7px] px-1 rounded-full uppercase leading-tight shadow">
                      {item.badge}
                    </span>
                  )}
                </div>

                <span className={`text-[10px] mt-0.5 leading-none transition-all ${
                  isActive ? 'text-white font-bold' : 'text-slate-400'
                }`}>
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* Botón switcher para alternar a Opción B: Barra Fija Full Width */}
          <button
            onClick={toggleNavStyle}
            title="Cambiar a Barra Fija Completa"
            className="p-1.5 text-slate-500 hover:text-amber-400 rounded-lg transition-all shrink-0 active:scale-90"
          >
            <Layout className="w-3.5 h-3.5" />
          </button>
        </nav>
      ) : (
        /* OPCIÓN B: Barra Fija Completa hasta el Borde Inferior (Full Width, Relleno de fondo cubriendo Zona Segura) */
        <nav className="fixed bottom-0 inset-x-0 z-50 w-full bg-[#0d1624]/95 backdrop-blur-md border-t border-slate-700/60 shadow-2xl pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))] pt-1.5 px-3 transition-all">
          <div className="max-w-md mx-auto flex items-center justify-around">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all relative ${
                    isActive ? 'text-amber-400 bg-amber-400/10 font-bold' : 'text-slate-400 hover:text-slate-200 font-medium'
                  }`}
                >
                  <div className="relative">
                    <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 text-amber-400' : 'text-slate-400'}`} />
                    {item.badge && (
                      <span className="absolute -top-1 -right-3.5 bg-brand-gold text-slate-950 font-black text-[7px] px-1 rounded-full uppercase leading-tight shadow">
                        {item.badge}
                      </span>
                    )}
                  </div>

                  <span className={`text-[10px] mt-0.5 leading-none transition-all ${
                    isActive ? 'text-white font-bold' : 'text-slate-400'
                  }`}>
                    {item.label}
                  </span>
                </button>
              );
            })}

            {/* Botón switcher para alternar a Opción A: Dock Flotante */}
            <button
              onClick={toggleNavStyle}
              title="Cambiar a Dock Flotante"
              className="p-1.5 text-slate-500 hover:text-amber-400 rounded-lg transition-all shrink-0 active:scale-90"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
          </div>
        </nav>
      )}
    </>
  );
}


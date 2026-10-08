import React from 'react';
import { Search, Calculator, TrendingDown, CreditCard } from 'lucide-react';

export default function BottomNav({ activeTab, setActiveTab }) {
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
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0b0f19]/95 backdrop-blur-xl border-t border-slate-800/80 shadow-2xl safe-pb">
      <div className="flex items-center justify-around max-w-lg mx-auto h-12 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 flex flex-col items-center justify-center py-0.5 transition-all relative ${
                isActive ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
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

              <span className={`text-[10px] mt-0.5 font-medium transition-all ${
                isActive ? 'text-white font-bold' : 'text-slate-400'
              }`}>
                {item.label}
              </span>

              {/* Indicador sutil de pestaña activa */}
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-amber-400 mt-0.5 shadow-sm shadow-amber-400 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

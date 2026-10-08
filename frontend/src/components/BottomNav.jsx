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
    <nav className="fixed inset-x-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-50 mx-auto max-w-md flex items-center justify-around py-2.5 px-4 rounded-2xl bg-[#0d1624]/90 backdrop-blur-md border border-slate-700/50 shadow-2xl shadow-black/60">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;

        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex-1 flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all relative ${
              isActive ? 'text-amber-400 bg-amber-400/10' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 text-amber-400' : 'text-slate-400'}`} />
              {item.badge && (
                <span className="absolute -top-1.5 -right-3.5 bg-brand-gold text-slate-950 font-black text-[7px] px-1 rounded-full uppercase leading-tight shadow">
                  {item.badge}
                </span>
              )}
            </div>

            <span className={`text-[10px] mt-0.5 font-medium transition-all ${
              isActive ? 'text-white font-bold' : 'text-slate-400'
            }`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

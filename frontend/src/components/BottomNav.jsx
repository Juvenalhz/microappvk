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
    <nav className="fixed bottom-0 inset-x-0 w-full z-50 bg-[#0d1624] border-t border-slate-800/80 pt-2 pb-[env(safe-area-inset-bottom,16px)] shadow-2xl">
      <div className="max-w-md mx-auto flex items-center justify-around px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1 px-1 transition-all relative ${
                isActive ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200 font-medium'
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

              <span className={`text-[10px] mt-1 leading-none transition-all ${
                isActive ? 'text-white font-bold' : 'text-slate-400'
              }`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}



import React from 'react';
import { Search, Calculator, CreditCard } from 'lucide-react';

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
      id: 'pago',
      label: 'Pago Móvil',
      icon: CreditCard,
      badge: null
    }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 glass-nav safe-pb shadow-2xl border-t border-slate-800">
      <div className="flex items-center justify-around max-w-lg mx-auto py-2 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl relative transition-all ${
                isActive ? 'text-brand-500 bg-brand-500/10' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 text-brand-500' : ''}`} />
                {item.badge && (
                  <span className="absolute -top-1 -right-4 bg-brand-gold text-slate-950 font-black text-[8px] px-1.5 rounded-full uppercase leading-tight shadow">
                    {item.badge}
                  </span>
                )}
              </div>

              <span className={`text-[11px] mt-0.5 font-bold transition-all ${
                isActive ? 'text-white' : 'text-slate-400'
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

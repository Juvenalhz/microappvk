import React, { useState } from 'react';
import { CreditCard, Copy, Check, QrCode, Maximize2, X, ShieldCheck, Phone, User, Hash, Building2 } from 'lucide-react';

export default function PagoMovilModule() {
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  // Cuentas de Pago Móvil de la Tienda física (Offline-first data)
  const bankAccounts = [
    {
      id: 1,
      banco: "0102 - Banco de Venezuela",
      rif: "J-501928374",
      telefono: "0412-5551234",
      titular: "TIENDAS RETAIL VK C.A.",
      color: "from-blue-600 to-indigo-700",
      badge: "Principal"
    },
    {
      id: 2,
      banco: "0134 - Banesco Banco Universal",
      rif: "J-501928374",
      telefono: "0414-9998877",
      titular: "TIENDAS RETAIL VK C.A.",
      color: "from-emerald-600 to-teal-800",
      badge: "Secundaria"
    }
  ];

  const handleCopyAccount = (acc, index) => {
    const textToCopy = `PAGO MÓVIL VK:\nBanco: ${acc.banco}\nRIF: ${acc.rif}\nTeléfono: ${acc.telefono}\nTitular: ${acc.titular}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col p-4 max-w-lg mx-auto w-full h-full overflow-y-auto no-scrollbar space-y-4">
      
      {/* Encabezado Módulo */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-1.5">
            <CreditCard className="w-5 h-5 text-brand-500" />
            <span>Pago Móvil en Caja</span>
          </h2>
          <p className="text-xs text-slate-400">Datos bancarios precacheados (Modo Offline Directo)</p>
        </div>
        
        <button
          onClick={() => setIsQrModalOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-brand-500/20 border border-brand-500/30 text-brand-500 text-xs font-bold flex items-center space-x-1 hover:bg-brand-500 hover:text-white transition-all shadow-md active:scale-95"
        >
          <QrCode className="w-4 h-4" />
          <span>Ver QR</span>
        </button>
      </div>

      {/* Tarjetas Bancarias */}
      <div className="space-y-3.5">
        {bankAccounts.map((acc, index) => (
          <div 
            key={acc.id}
            className="bg-surface-card border border-surface-cardBorder rounded-2xl p-4 shadow-xl shadow-black/25 relative overflow-hidden group"
          >
            {/* Gradiente sutil decorativo */}
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${acc.color} opacity-15 rounded-bl-full pointer-events-none`} />

            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {acc.badge}
                </span>
                <h3 className="text-sm font-extrabold text-white mt-1 flex items-center space-x-1">
                  <Building2 className="w-4 h-4 text-brand-500" />
                  <span>{acc.banco}</span>
                </h3>
              </div>
            </div>

            {/* Grid de Datos */}
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium flex items-center space-x-1">
                  <Phone className="w-3 h-3 text-slate-500" />
                  <span>Teléfono:</span>
                </span>
                <strong className="text-slate-100 font-mono text-xs">{acc.telefono}</strong>
              </div>

              <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium flex items-center space-x-1">
                  <Hash className="w-3 h-3 text-slate-500" />
                  <span>RIF:</span>
                </span>
                <strong className="text-slate-100 font-mono text-xs">{acc.rif}</strong>
              </div>

              <div className="col-span-2 bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium flex items-center space-x-1">
                  <User className="w-3 h-3 text-slate-500" />
                  <span>Titular:</span>
                </span>
                <strong className="text-slate-200 text-xs">{acc.titular}</strong>
              </div>
            </div>

            {/* Botón Copiar Todos los Datos */}
            <button
              onClick={() => handleCopyAccount(acc, index)}
              className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md active:scale-95 ${
                copiedIndex === index
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              {copiedIndex === index ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>¡Datos Copiados al Portapapeles!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-brand-500" />
                  <span>Copiar Datos de Pago Móvil</span>
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Banner QR de Vista Rapida */}
      <div 
        onClick={() => setIsQrModalOpen(true)}
        className="bg-gradient-to-r from-brand-900/40 via-surface-card to-slate-900 border border-brand-500/30 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-brand-500 transition-all shadow-lg active:scale-98"
      >
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-xl bg-white p-1.5 flex items-center justify-center shadow-md">
            <img 
              src="/qr-pagomovil.svg" 
              alt="QR Pago Móvil" 
              className="w-full h-full object-contain"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <QrCode className="w-8 h-8 text-slate-900" />
          </div>
          <div>
            <h4 className="font-extrabold text-white text-sm">Código QR para Cliente</h4>
            <p className="text-xs text-slate-400">Toca para abrir a pantalla completa</p>
          </div>
        </div>

        <Maximize2 className="w-5 h-5 text-brand-500" />
      </div>

      {/* Modal Pantalla Completa QR */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fade-in">
          
          <button
            onClick={() => setIsQrModalOpen(false)}
            className="absolute top-6 right-6 p-3 rounded-full bg-slate-800 text-white hover:bg-slate-700 transition-transform active:scale-90"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="bg-white p-6 rounded-3xl shadow-2xl max-w-xs w-full text-center space-y-4 animate-scale-in">
            <h3 className="font-extrabold text-slate-900 text-lg">PAGO MÓVIL RÁPIDO</h3>
            <p className="text-xs text-slate-500 font-medium">Escanea con la App de tu banco</p>

            <div className="w-64 h-64 mx-auto bg-slate-50 p-3 rounded-2xl border border-slate-200 flex items-center justify-center shadow-inner">
              <svg viewBox="0 0 100 100" className="w-full h-full text-slate-900 fill-current">
                {/* SVG QR Decorativo Generado de alta resolución */}
                <rect x="5" y="5" width="30" height="30" rx="4" fill="currentColor"/>
                <rect x="10" y="10" width="20" height="20" rx="2" fill="white"/>
                <rect x="15" y="15" width="10" height="10" rx="1" fill="currentColor"/>

                <rect x="65" y="5" width="30" height="30" rx="4" fill="currentColor"/>
                <rect x="70" y="10" width="20" height="20" rx="2" fill="white"/>
                <rect x="75" y="15" width="10" height="10" rx="1" fill="currentColor"/>

                <rect x="5" y="65" width="30" height="30" rx="4" fill="currentColor"/>
                <rect x="10" y="70" width="20" height="20" rx="2" fill="white"/>
                <rect x="15" y="75" width="10" height="10" rx="1" fill="currentColor"/>

                <rect x="40" y="10" width="8" height="8" fill="currentColor"/>
                <rect x="50" y="15" width="8" height="8" fill="currentColor"/>
                <rect x="42" y="30" width="16" height="6" fill="currentColor"/>
                
                <rect x="40" y="60" width="10" height="10" fill="currentColor"/>
                <rect x="55" y="55" width="12" height="12" fill="currentColor"/>
                <rect x="70" y="45" width="15" height="8" fill="currentColor"/>
                <rect x="45" y="75" width="15" height="15" fill="currentColor"/>
                <rect x="65" y="70" width="20" height="20" fill="currentColor"/>
              </svg>
            </div>

            <div className="bg-slate-100 p-3 rounded-xl text-left text-xs space-y-1 text-slate-700">
              <p><strong>Banco:</strong> 0102 - Banco de Venezuela</p>
              <p><strong>RIF:</strong> J-501928374</p>
              <p><strong>Teléfono:</strong> 0412-5551234</p>
            </div>

            <button
              onClick={() => setIsQrModalOpen(false)}
              className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition-all"
            >
              Cerrar QR
            </button>
          </div>

        </div>
      )}

    </div>
  );
}

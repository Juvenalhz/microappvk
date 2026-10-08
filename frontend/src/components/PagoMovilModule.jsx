import React, { useState } from 'react';
import { CreditCard, Copy, Check, QrCode, Maximize2, X, Phone, User, Hash, Building2, SlidersHorizontal } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function PagoMovilModule() {
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [qrFormatMode, setQrFormatMode] = useState('standard'); // 'standard' | 'readable'

  // Cuentas de Pago Móvil precacheadas (Modo Offline Directo)
  const [bankAccounts] = useState([
    {
      id: 1,
      banco: "0102 - Banco de Venezuela",
      codigoBanco: "0102",
      rif: "V-23654575",
      cedulaNumero: "23654575",
      telefono: "04241346969",
      telefonoFormateado: "0424-1346969",
      titular: "Prueba Banco de Venezuela",
      color: "from-blue-600 to-indigo-700",
      badge: "Principal (BDV)"
    }
  ]);

  const activeAccount = selectedAccount || bankAccounts[0];

  const handleCopyAccount = (acc, index) => {
    const textToCopy = `PAGO MÓVIL BDV:\nBanco: ${acc.banco}\nCédula/RIF: ${acc.rif}\nTeléfono: ${acc.telefonoFormateado || acc.telefono}\nTitular: ${acc.titular}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const openQrForAccount = (acc) => {
    setSelectedAccount(acc);
    setIsQrModalOpen(true);
  };

  // Genera el payload string que leerá el escáner del banco
  // 1. Estándar bancario compacto (Formato 0102|V23654575|04241346969)
  // 2. Texto multilínea legible
  const getQrPayload = (acc) => {
    if (!acc) return '';
    const cleanPhone = acc.telefono.replace(/[^0-9]/g, '');
    const cleanDoc = acc.rif.replace(/[^0-9VJEGvjeg]/g, '').toUpperCase();
    const bankCode = acc.codigoBanco || '0102';

    if (qrFormatMode === 'standard') {
      // Estándar usual de escaneo rápido BDV / Pago Móvil
      return `${bankCode}|${cleanDoc}|${cleanPhone}`;
    } else {
      // Formato texto legible para cualquier cámara
      return `PAGO MOVIL\nBanco: ${acc.banco}\nCI/RIF: ${acc.rif}\nTeléfono: ${acc.telefonoFormateado || acc.telefono}`;
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 max-w-lg mx-auto w-full h-full overflow-y-auto no-scrollbar space-y-4 pb-[calc(4.5rem+env(safe-area-inset-bottom,16px))]">
      
      {/* Encabezado Módulo */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-1.5">
            <CreditCard className="w-5 h-5 text-brand-500" />
            <span>Pago Móvil en Caja</span>
          </h2>
          <p className="text-xs text-slate-400">Datos bancarios y QR dinámico escaneable</p>
        </div>
        
        <button
          onClick={() => openQrForAccount(bankAccounts[0])}
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

              <button
                onClick={() => openQrForAccount(acc)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-brand-400 border border-slate-700 transition-all active:scale-95"
                title="Generar QR de esta cuenta"
              >
                <QrCode className="w-4 h-4" />
              </button>
            </div>

            {/* Grid de Datos */}
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium flex items-center space-x-1">
                  <Phone className="w-3 h-3 text-slate-500" />
                  <span>Teléfono:</span>
                </span>
                <strong className="text-slate-100 font-mono text-xs">{acc.telefonoFormateado || acc.telefono}</strong>
              </div>

              <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-medium flex items-center space-x-1">
                  <Hash className="w-3 h-3 text-slate-500" />
                  <span>Cédula / RIF:</span>
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

      {/* Banner QR de Vista Rápida */}
      <div 
        onClick={() => openQrForAccount(bankAccounts[0])}
        className="bg-gradient-to-r from-brand-900/40 via-surface-card to-slate-900 border border-brand-500/30 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-brand-500 transition-all shadow-lg active:scale-98"
      >
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-xl bg-white p-2 flex items-center justify-center shadow-md">
            <QRCodeSVG value={getQrPayload(bankAccounts[0])} size={40} level="M" />
          </div>
          <div>
            <h4 className="font-extrabold text-white text-sm">QR Escaneable para Cliente</h4>
            <p className="text-xs text-slate-400">Toca para abrir a pantalla completa</p>
          </div>
        </div>

        <Maximize2 className="w-5 h-5 text-brand-500" />
      </div>

      {/* Modal Pantalla Completa QR */}
      {isQrModalOpen && activeAccount && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fade-in">
          
          <button
            onClick={() => setIsQrModalOpen(false)}
            className="absolute top-6 right-6 p-3 rounded-full bg-slate-800 text-white hover:bg-slate-700 transition-transform active:scale-90"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="bg-white p-6 rounded-3xl shadow-2xl max-w-xs w-full text-center space-y-4 animate-scale-in">
            <div>
              <h3 className="font-extrabold text-slate-900 text-lg">PAGO MÓVIL RÁPIDO</h3>
              <p className="text-xs text-slate-500 font-medium">Escanea con la App de tu banco</p>
            </div>

            {/* Contenedor del QR Real SVG */}
            <div className="w-64 h-64 mx-auto bg-white p-4 rounded-2xl border-2 border-slate-200 flex items-center justify-center shadow-inner">
              <QRCodeSVG 
                value={getQrPayload(activeAccount)} 
                size={220}
                level="H"
                includeMargin={true}
              />
            </div>

            {/* Selector de formato del QR (para probar compatibilidad del scanner) */}
            <div className="flex items-center justify-between bg-slate-100 p-1.5 rounded-xl text-[11px] font-bold">
              <button
                onClick={() => setQrFormatMode('standard')}
                className={`flex-1 py-1 rounded-lg transition-all ${
                  qrFormatMode === 'standard' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cifrado BDV ({activeAccount.codigoBanco}|{activeAccount.cedulaNumero})
              </button>
              <button
                onClick={() => setQrFormatMode('readable')}
                className={`flex-1 py-1 rounded-lg transition-all ${
                  qrFormatMode === 'readable' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Texto Plano
              </button>
            </div>

            <div className="bg-slate-100 p-3 rounded-xl text-left text-xs space-y-1 text-slate-700">
              <p><strong>Banco:</strong> {activeAccount.banco}</p>
              <p><strong>Cédula/RIF:</strong> {activeAccount.rif}</p>
              <p><strong>Teléfono:</strong> {activeAccount.telefonoFormateado || activeAccount.telefono}</p>
            </div>

            <button
              onClick={() => setIsQrModalOpen(false)}
              className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition-all shadow-md"
            >
              Cerrar QR
            </button>
          </div>

        </div>
      )}

    </div>
  );
}


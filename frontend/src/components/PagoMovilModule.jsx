import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Copy, 
  Check, 
  Maximize2, 
  X, 
  Phone, 
  User, 
  Hash, 
  Building2, 
  Plus, 
  Edit3, 
  Upload,
  Image as ImageIcon,
  Trash2
} from 'lucide-react';

// Helper para comprimir y convertir imágenes a Base64 súper liviano (< 60KB)
function processImageFile(file, callback) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 600;
      const MAX_HEIGHT = 600;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Calidad 0.75 en JPEG (Ultra ligero y súper nítido)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      callback(dataUrl);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

export default function PagoMovilModule({ bcvRate }) {
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isEditAccountModalOpen, setIsEditAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);

  // Cuentas de Pago Móvil guardadas en localStorage
  const [bankAccounts, setBankAccounts] = useState(() => {
    try {
      const cached = localStorage.getItem('vk_pago_movil_accounts');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('[PagoMovil] Error al leer cuentas guardadas:', e);
    }
    return [
      {
        id: 1,
        banco: "0102 - Banco de Venezuela",
        codigoBanco: "0102",
        rif: "V-23654575",
        telefono: "04241346969",
        telefonoFormateado: "0424-1346969",
        titular: "VK MEN Tienda",
        color: "from-blue-600 to-indigo-700",
        badge: "Principal (BDV)",
        qrImage: null
      },
      {
        id: 2,
        banco: "0134 - Banesco",
        codigoBanco: "0134",
        rif: "J-500123456",
        telefono: "04129876543",
        telefonoFormateado: "0412-9876543",
        titular: "VK MEN C.A.",
        color: "from-emerald-600 to-teal-700",
        badge: "Secundaria (Banesco)",
        qrImage: null
      }
    ];
  });

  const activeAccount = selectedAccount || bankAccounts[0];

  const WORKER_PAGO_MOVIL_URL = 'https://microapp-vk-bff.jjhernandezz100.workers.dev/api/pago-movil';

  // Sincronizar cuentas e imágenes de QR desde la nube (Worker KV) al cargar
  useEffect(() => {
    async function syncAccountsFromKv() {
      try {
        let res = await fetch(`${WORKER_PAGO_MOVIL_URL}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) {
          res = await fetch(`/api/pago-movil?t=${Date.now()}`, { cache: 'no-store' });
        }
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.accounts) && data.accounts.length > 0) {
            setBankAccounts(data.accounts);
            localStorage.setItem('vk_pago_movil_accounts', JSON.stringify(data.accounts));
          }
        }
      } catch (e) {
        console.warn('[PagoMovil] Error al obtener cuentas sincronizadas:', e);
      }
    }
    syncAccountsFromKv();
  }, []);

  // Persistir cuentas bancarias localmente y en la nube (KV Global)
  const saveAccounts = async (newAccounts) => {
    setBankAccounts(newAccounts);
    try {
      localStorage.setItem('vk_pago_movil_accounts', JSON.stringify(newAccounts));
      let res = await fetch(WORKER_PAGO_MOVIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: newAccounts })
      });
      if (!res.ok) {
        res = await fetch('/api/pago-movil', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accounts: newAccounts })
        });
      }
      if (res.ok) {
        console.log('[PagoMovil] Cuentas e imágenes sincronizadas con éxito en la nube KV');
      }
    } catch (e) {
      console.warn('[PagoMovil] Error al guardar cuentas:', e);
    }
  };

  const handleCopyAccount = (acc, index) => {
    const textToCopy = `PAGO MÓVIL:\nBanco: ${acc.banco}\nCédula/RIF: ${acc.rif}\nTeléfono: ${acc.telefonoFormateado || acc.telefono}\nTitular: ${acc.titular}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const openQrForAccount = (acc) => {
    setSelectedAccount(acc);
    setIsQrModalOpen(true);
  };

  const openEditModal = (acc = null) => {
    if (acc) {
      setEditingAccount({ ...acc });
    } else {
      setEditingAccount({
        id: Date.now(),
        banco: "0102 - Banco de Venezuela",
        codigoBanco: "0102",
        rif: "V-00000000",
        telefono: "04140000000",
        telefonoFormateado: "0414-0000000",
        titular: "Nombre del Titular",
        color: "from-blue-600 to-indigo-700",
        badge: "Cuenta Adicional",
        qrImage: null
      });
    }
    setIsEditAccountModalOpen(true);
  };

  const handleSaveAccountForm = (e) => {
    e.preventDefault();
    if (!editingAccount) return;

    const exists = bankAccounts.some(a => a.id === editingAccount.id);
    let updated = [];
    if (exists) {
      updated = bankAccounts.map(a => a.id === editingAccount.id ? editingAccount : a);
    } else {
      updated = [...bankAccounts, editingAccount];
    }

    saveAccounts(updated);
    if (selectedAccount && selectedAccount.id === editingAccount.id) {
      setSelectedAccount(editingAccount);
    }
    setIsEditAccountModalOpen(false);
  };

  const handleDeleteAccount = (id) => {
    if (bankAccounts.length <= 1) {
      alert('Debe haber al menos una cuenta registrada.');
      return;
    }
    if (confirm('¿Deseas eliminar esta cuenta de Pago Móvil?')) {
      const updated = bankAccounts.filter(a => a.id !== id);
      saveAccounts(updated);
      if (selectedAccount && selectedAccount.id === id) {
        setSelectedAccount(updated[0]);
      }
    }
  };

  // Cargar imagen de QR desde el modal o la tarjeta
  const handleFileUploadForAccount = (file, accountId) => {
    processImageFile(file, (dataUrl) => {
      const updated = bankAccounts.map(acc => {
        if (acc.id === accountId) {
          return { ...acc, qrImage: dataUrl };
        }
        return acc;
      });
      saveAccounts(updated);
      if (selectedAccount && selectedAccount.id === accountId) {
        setSelectedAccount(prev => ({ ...prev, qrImage: dataUrl }));
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col p-3 sm:p-5 max-w-lg md:max-w-4xl mx-auto w-full h-full overflow-y-auto no-scrollbar space-y-4 pb-[calc(4.5rem+env(safe-area-inset-bottom,16px))]">
      
      {/* 1. Encabezado de Módulo */}
      <div className="flex items-center justify-between bg-surface-card border border-surface-cardBorder rounded-2xl p-3.5 shadow-md">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-white leading-tight">Cuentas Pago Móvil</h2>
            <p className="text-[11px] sm:text-xs text-slate-400">Afiches y Fotos de QR Oficiales de Banco</p>
          </div>
        </div>

        <button
          onClick={() => openEditModal(null)}
          className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center space-x-1.5 transition-all shadow-md active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Cuenta</span>
        </button>
      </div>

      {/* 2. Tarjetas de Cuentas Bancarias */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {bankAccounts.map((acc, index) => (
          <div 
            key={acc.id}
            className="bg-surface-card border border-surface-cardBorder rounded-2xl p-4 shadow-xl shadow-black/25 relative overflow-hidden flex flex-col justify-between space-y-3"
          >
            {/* Adorno visual */}
            <div className={`absolute top-0 right-0 w-28 h-28 bg-gradient-to-br ${acc.color || 'from-amber-500 to-amber-700'} opacity-15 rounded-bl-full pointer-events-none`} />

            <div>
              <div className="flex items-start justify-between mb-2.5">
                <div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
                    {acc.badge}
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-white mt-1 flex items-center space-x-1.5">
                    <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{acc.banco}</span>
                  </h3>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => openEditModal(acc)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all"
                    title="Editar datos e imagen de QR"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => openQrForAccount(acc)}
                    className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/40 transition-all active:scale-95"
                    title="Ver Foto del QR de esta cuenta"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Vista previa de Imagen de QR o Botón de carga rápida */}
              <div className="my-2">
                {acc.qrImage ? (
                  <div 
                    onClick={() => openQrForAccount(acc)}
                    className="bg-slate-950/80 p-2 rounded-xl border border-emerald-500/30 flex items-center space-x-3 cursor-pointer hover:border-emerald-400 transition-all group"
                  >
                    <img 
                      src={acc.qrImage} 
                      alt="QR Bancario" 
                      className="w-12 h-12 object-contain bg-white rounded-lg p-1 border border-slate-700 group-hover:scale-105 transition-transform"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full inline-block mb-0.5 border border-emerald-500/20">
                        ✓ Foto QR Cargada
                      </span>
                      <p className="text-[11px] text-slate-300 font-medium truncate">Toca para ampliar foto en pantalla</p>
                    </div>
                    <Maximize2 className="w-4 h-4 text-slate-400 group-hover:text-amber-400 shrink-0" />
                  </div>
                ) : (
                  <label className="bg-slate-950/40 hover:bg-slate-900 border border-dashed border-slate-700 hover:border-amber-500/50 p-2.5 rounded-xl flex items-center justify-center space-x-2 cursor-pointer transition-all text-xs text-slate-400 hover:text-amber-300">
                    <Upload className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-[11px]">Subir foto del QR oficial del banco</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileUploadForAccount(e.target.files[0], acc.id);
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Grid de Datos Bancarios */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-medium flex items-center space-x-1">
                    <Phone className="w-3 h-3 text-slate-500" />
                    <span>Teléfono:</span>
                  </span>
                  <strong className="text-slate-100 font-mono text-xs">{acc.telefonoFormateado || acc.telefono}</strong>
                </div>

                <div className="bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-medium flex items-center space-x-1">
                    <Hash className="w-3 h-3 text-slate-500" />
                    <span>Cédula / RIF:</span>
                  </span>
                  <strong className="text-slate-100 font-mono text-xs">{acc.rif}</strong>
                </div>

                <div className="col-span-2 bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-medium flex items-center space-x-1">
                    <User className="w-3 h-3 text-slate-500" />
                    <span>Titular:</span>
                  </span>
                  <strong className="text-slate-200 text-xs truncate block">{acc.titular}</strong>
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex items-center space-x-2 pt-1">
              <button
                onClick={() => handleCopyAccount(acc, index)}
                className={`flex-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-all shadow active:scale-95 ${
                  copiedIndex === index
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
              >
                {copiedIndex === index ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-amber-400" />
                    <span>Copiar Datos</span>
                  </>
                )}
              </button>

              <button
                onClick={() => openQrForAccount(acc)}
                className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold hover:bg-amber-500 hover:text-slate-950 transition-all flex items-center space-x-1"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Ampliar Foto</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 3. MODAL PANTALLA COMPLETA: VISUALIZADOR DE LA FOTO DEL AFICHE QR */}
      {isQrModalOpen && activeAccount && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 animate-fade-in overflow-y-auto">
          
          <button
            onClick={() => setIsQrModalOpen(false)}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-slate-800 text-slate-300 hover:text-white transition-transform active:scale-90 z-10"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-4 animate-scale-in my-auto">
            
            {/* Header Modal */}
            <div className="space-y-1">
              <span className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-block">
                {activeAccount.banco}
              </span>
              <h3 className="font-black text-slate-900 text-lg sm:text-xl leading-tight">AFICHE DE PAGO MÓVIL</h3>
              <p className="text-xs text-slate-500 font-medium">Muestra esta imagen al cliente para escanear</p>
            </div>

            {/* Visualizador Principal de la Foto del QR */}
            <div className="mx-auto bg-white p-3 rounded-2xl border-2 border-slate-200 flex flex-col items-center justify-center shadow-inner relative min-h-[220px]">
              {activeAccount.qrImage ? (
                <div className="space-y-2">
                  <img 
                    src={activeAccount.qrImage} 
                    alt="AFICHE QR Oficial" 
                    className="max-h-80 w-auto object-contain rounded-xl shadow-md"
                  />
                </div>
              ) : (
                <div className="space-y-3 py-6 px-2 text-center">
                  <ImageIcon className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-600 font-bold">
                    No has subido la foto del QR de esta cuenta todavía.
                  </p>
                  <label className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs transition-all inline-flex items-center space-x-1.5 cursor-pointer shadow">
                    <Upload className="w-4 h-4" />
                    <span>Seleccionar foto / captura</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileUploadForAccount(e.target.files[0], activeAccount.id);
                        }
                      }}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Resumen de Datos de la Cuenta */}
            <div className="bg-slate-50 p-2.5 rounded-xl text-left text-xs space-y-0.5 text-slate-700 border border-slate-200">
              <p><strong>Banco:</strong> {activeAccount.banco}</p>
              <p><strong>Cédula/RIF:</strong> {activeAccount.rif}</p>
              <p><strong>Teléfono:</strong> {activeAccount.telefonoFormateado || activeAccount.telefono}</p>
              <p className="truncate"><strong>Titular:</strong> {activeAccount.titular}</p>
            </div>

            {/* Botones de Carga de Imagen y Acciones */}
            <div className="space-y-2 pt-1">
              <label className="w-full py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold text-xs border border-blue-200 transition-all flex items-center justify-center space-x-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{activeAccount.qrImage ? 'Cambiar Foto del QR' : 'Subir Foto del QR'}</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUploadForAccount(e.target.files[0], activeAccount.id);
                    }
                  }}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const text = `PAGO MÓVIL:\nBanco: ${activeAccount.banco}\nCI/RIF: ${activeAccount.rif}\nTeléfono: ${activeAccount.telefonoFormateado || activeAccount.telefono}`;
                    navigator.clipboard.writeText(text);
                    alert('¡Datos copiados al portapapeles!');
                  }}
                  className="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-all flex items-center justify-center space-x-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Datos</span>
                </button>

                <button
                  onClick={() => setIsQrModalOpen(false)}
                  className="py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-all shadow-md"
                >
                  Cerrar
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* 4. MODAL EDICIÓN DE CUENTA BANCARIA E IMAGEN QR */}
      {isEditAccountModalOpen && editingAccount && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#0f172a] border border-slate-700 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-scale-in text-white max-h-[90vh] overflow-y-auto no-scrollbar">
            
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-extrabold text-sm flex items-center space-x-1.5">
                <Edit3 className="w-4 h-4 text-amber-400" />
                <span>Configurar Cuenta & Foto QR</span>
              </h3>
              <button
                onClick={() => setIsEditAccountModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAccountForm} className="space-y-3 text-xs">
              
              {/* Carga de Imagen en la edición */}
              <div>
                <label className="text-amber-300 font-bold block mb-1">Foto / Captura del QR Oficial del Banco:</label>
                {editingAccount.qrImage ? (
                  <div className="bg-slate-900 p-2 rounded-xl border border-slate-700 flex items-center space-x-3">
                    <img 
                      src={editingAccount.qrImage} 
                      alt="QR Cargado" 
                      className="w-14 h-14 object-contain bg-white rounded-lg p-1"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold text-emerald-400">✓ Foto Cargada</span>
                      <div className="flex space-x-2 mt-1">
                        <label className="text-[10px] text-blue-400 font-bold hover:underline cursor-pointer">
                          Cambiar
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                processImageFile(e.target.files[0], (url) => {
                                  setEditingAccount(prev => ({ ...prev, qrImage: url }));
                                });
                              }
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setEditingAccount(prev => ({ ...prev, qrImage: null }))}
                          className="text-[10px] text-red-400 font-bold hover:underline"
                        >
                          Quitar Foto
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <label className="bg-slate-900 hover:bg-slate-800 border border-dashed border-slate-700 p-3 rounded-xl flex flex-col items-center justify-center space-y-1 cursor-pointer transition-all text-slate-400 hover:text-amber-400">
                    <ImageIcon className="w-6 h-6 text-amber-400" />
                    <span className="font-bold text-[11px]">Seleccionar o tomar foto del QR</span>
                    <span className="text-[9px] text-slate-500">Admite PNG, JPG, WEBP</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          processImageFile(e.target.files[0], (url) => {
                            setEditingAccount(prev => ({ ...prev, qrImage: url }));
                          });
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Nombre del Banco & Código:</label>
                <input
                  type="text"
                  required
                  value={editingAccount.banco}
                  onChange={(e) => {
                    const val = e.target.value;
                    const codeMatch = val.match(/\d{4}/);
                    setEditingAccount(prev => ({
                      ...prev,
                      banco: val,
                      codigoBanco: codeMatch ? codeMatch[0] : prev.codigoBanco
                    }));
                  }}
                  placeholder="ej: 0102 - Banco de Venezuela"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Cédula o RIF:</label>
                  <input
                    type="text"
                    required
                    value={editingAccount.rif}
                    onChange={(e) => setEditingAccount(prev => ({ ...prev, rif: e.target.value.toUpperCase() }))}
                    placeholder="V-23654575"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="text-slate-400 font-bold block mb-1">Teléfono:</label>
                  <input
                    type="text"
                    required
                    value={editingAccount.telefonoFormateado || editingAccount.telefono}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const clean = raw.replace(/[^0-9]/g, '');
                      setEditingAccount(prev => ({
                        ...prev,
                        telefono: clean,
                        telefonoFormateado: raw
                      }));
                    }}
                    placeholder="0424-1346969"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Titular de la Cuenta:</label>
                <input
                  type="text"
                  required
                  value={editingAccount.titular}
                  onChange={(e) => setEditingAccount(prev => ({ ...prev, titular: e.target.value }))}
                  placeholder="Nombre de la empresa o persona"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Etiqueta / Badge:</label>
                <input
                  type="text"
                  value={editingAccount.badge || ''}
                  onChange={(e) => setEditingAccount(prev => ({ ...prev, badge: e.target.value }))}
                  placeholder="ej: Principal (BDV)"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs hover:bg-amber-400 transition-all shadow"
                >
                  Guardar Cuenta
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteAccount(editingAccount.id)}
                  className="py-2.5 px-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 font-bold text-xs hover:bg-red-500/20 transition-all"
                >
                  Eliminar
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}

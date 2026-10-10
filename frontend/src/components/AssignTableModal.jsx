import React, { useState, useEffect } from 'react';
import { X, Layers, LayoutGrid, CheckCircle2, AlertCircle, Loader2, ArrowRight, ShoppingBag } from 'lucide-react';

const API_BASE_URL = 'https://microapp-vk-bff.jjhernandezz100.workers.dev';

export default function AssignTableModal({ isOpen, onClose, ticketItems, bcvRate, onAssignSuccess }) {
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [warningList, setWarningList] = useState([]);
  const [addedItemIds, setAddedItemIds] = useState([]);

  const rawTasa = bcvRate ? Number(bcvRate.tasa) : 36.50;
  const tasa = Math.floor(rawTasa * 100) / 100;

  const totalUsd = ticketItems.reduce((acc, item) => acc + (item.precio_usd * item.cant), 0);
  const totalBsFormatted = (totalUsd * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalCount = ticketItems.reduce((acc, item) => acc + item.cant, 0);

  // Cargar canales de venta y mesas del ERP al abrir el modal
  useEffect(() => {
    if (isOpen) {
      fetchTables();
    } else {
      // Reset al cerrar
      setSelectedChannelId('');
      setSelectedTableId('');
      setErrorMsg(null);
      setSuccessMsg(null);
      setWarningList([]);
      setAddedItemIds([]);
    }
  }, [isOpen]);

  const fetchTables = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/pos/tables`);
      const data = await res.json();

      if (data.success && Array.isArray(data.channels) && data.channels.length > 0) {
        setChannels(data.channels);
        // Seleccionar primer canal por defecto
        const defaultCh = data.channels[0];
        setSelectedChannelId(defaultCh.channel_id);

        // Seleccionar primera mesa activa y vacía del primer canal si existe
        const activeMesas = (defaultCh.mesas || []).filter(m => m.has_sale);
        const emptyMesas = activeMesas.filter(m => m.is_empty);
        const bestMesa = emptyMesas[0] || activeMesas[0] || defaultCh.mesas?.[0];
        if (bestMesa) {
          setSelectedTableId(bestMesa.id);
        }
      } else {
        setChannels([]);
        setErrorMsg('No se encontraron canales de venta ni mesas registradas en FINA ERP.');
      }
    } catch (err) {
      console.error('Error al cargar mesas ERP:', err);
      setErrorMsg('Error de conexión al obtener mesas de FINA ERP.');
    } finally {
      setLoading(false);
    }
  };

  // Al cambiar el canal seleccionado, actualizar la mesa seleccionada por defecto
  const handleChannelChange = (e) => {
    const chId = e.target.value;
    setSelectedChannelId(chId);
    
    const ch = channels.find(c => c.channel_id === chId);
    if (ch) {
      const activeMesas = (ch.mesas || []).filter(m => m.has_sale);
      const emptyMesas = activeMesas.filter(m => m.is_empty);
      const bestMesa = emptyMesas[0] || activeMesas[0] || ch.mesas?.[0];
      if (bestMesa) {
        setSelectedTableId(bestMesa.id);
      } else {
        setSelectedTableId('');
      }
    } else {
      setSelectedTableId('');
    }
  };

  const handleConfirmWarning = () => {
    if (onAssignSuccess) onAssignSuccess(addedItemIds);
    onClose();
  };

  // Enviar asignación de productos a la mesa seleccionada en FINA ERP
  const handleAssign = async () => {
    if (!selectedChannelId || !selectedTableId) {
      setErrorMsg('Debes seleccionar un canal de venta y una mesa vacía.');
      return;
    }

    const channelObj = channels.find(c => c.channel_id === selectedChannelId);
    const tableObj = channelObj?.mesas?.find(m => m.id === selectedTableId);

    setAssigning(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/pos/assign-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: selectedTableId,
          channelId: selectedChannelId,
          tableName: tableObj?.name || 'Mesa',
          channelName: channelObj?.channel_name || 'Canal',
          items: ticketItems.map(i => ({
            id: i.id,
            modelId: i.modelId || i.id,
            erp_product_id: i.erp_product_id,
            nombre: i.nombre,
            color: i.color,
            talla: i.talla,
            sku: i.sku || i.id,
            cantidad: i.cant,
            precio_usd: i.precio_usd
          }))
        })
      });

      const data = await res.json();
      const currentAddedIds = data.added_item_ids || [];
      setAddedItemIds(currentAddedIds);

      if (data.success) {
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          setWarningList(data.errors);
          setSuccessMsg(data.message || 'Se cargaron algunos productos a la mesa.');
        } else {
          setSuccessMsg(data.message || `¡Productos cargados a ${tableObj?.name || 'Mesa'} exitosamente!`);
          setTimeout(() => {
            if (onAssignSuccess) onAssignSuccess(currentAddedIds);
            onClose();
          }, 1500);
        }
      } else {
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          setWarningList(data.errors);
        }
        setErrorMsg(data.message || 'No se pudo asignar a la mesa en FINA ERP.');
      }
    } catch (err) {
      console.error('Error al asignar mesa:', err);
      setErrorMsg('Error al conectar con FINA ERP para asignar la mesa.');
    } finally {
      setAssigning(false);
    }
  };

  if (!isOpen) return null;

  const currentChannel = channels.find(c => c.channel_id === selectedChannelId);
  const availableMesas = (currentChannel?.mesas || []).filter(m => m.is_empty);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col animate-scale-in">
        
        {/* Encabezado */}
        <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-base leading-tight">Asignar a Mesa FINA ERP</h3>
              <p className="text-xs text-slate-400">Selecciona Canal de Venta y Mesa Vacía</p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={assigning}
            className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-all disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-5 space-y-4">

          {/* Estado Mensajes */}
          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center space-x-2.5 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-4 bg-emerald-500/15 border border-emerald-500/40 rounded-2xl flex items-center space-x-3 text-emerald-300 text-sm font-bold animate-bounce-short">
              <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {warningList.length > 0 && (
            <div className="p-4 bg-amber-500/15 border border-amber-500/40 rounded-2xl space-y-3 text-amber-200 text-xs shadow-lg animate-scale-in">
              <div className="flex items-center space-x-2 font-extrabold text-amber-300 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
                <span>Atención: Prendas rechazadas por FINA ERP</span>
              </div>
              <ul className="space-y-2 text-xs font-medium text-amber-100 divide-y divide-amber-500/20 pt-1">
                {warningList.map((errStr, idx) => (
                  <li key={idx} className="pt-2 flex items-start space-x-2">
                    <span className="text-amber-400 font-bold">•</span>
                    <span className="leading-relaxed">{errStr}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-300/90 bg-amber-950/50 p-2.5 rounded-xl border border-amber-500/20">
                💡 <strong>Nota:</strong> Las prendas rechazadas seguirán en tu ticket para que las verifiques. Las prendas agregadas con éxito ya fueron enviadas a la mesa.
              </p>
              <button
                onClick={handleConfirmWarning}
                className="w-full py-3 px-4 rounded-xl font-extrabold text-xs uppercase tracking-wider text-slate-950 bg-amber-400 hover:bg-amber-300 transition-all shadow-md active:scale-95 flex items-center justify-center space-x-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-slate-950" />
                <span>OK / Entendido</span>
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-10 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-medium">Obteniendo Canales de Venta y Mesas de FINA ERP...</p>
            </div>
          ) : (
            <>
              {/* Selector 1: Canal de Venta */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5 uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>Canal de Venta FINA ERP</span>
                </label>
                <select
                  value={selectedChannelId}
                  onChange={handleChannelChange}
                  disabled={assigning || channels.length === 0}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-2xl px-3.5 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-amber-400 transition-all disabled:opacity-50"
                >
                  {channels.length === 0 ? (
                    <option value="">No hay canales disponibles</option>
                  ) : (
                    channels.map(ch => (
                      <option key={ch.channel_id} value={ch.channel_id}>
                        {ch.channel_name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Selector 2: Mesa Disponible */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5 uppercase tracking-wider">
                  <LayoutGrid className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mesa de FINA ERP</span>
                </label>
                <select
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  disabled={assigning || (currentChannel?.mesas || []).length === 0}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-2xl px-3.5 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-emerald-400 transition-all disabled:opacity-50"
                >
                  {(currentChannel?.mesas || []).length === 0 ? (
                    <option value="">No hay mesas registradas en este canal</option>
                  ) : (
                    (currentChannel?.mesas || []).map(m => (
                      <option key={m.id} value={m.id}>
                        {m.has_sale
                          ? (m.is_empty ? `🟢 ${m.name} (Vacía)` : `🟡 ${m.name} (${m.product_count} prendas en mesa)`)
                          : `⚪ ${m.name} (Disponible en ERP)`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Resumen del Ticket a Cargar */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center space-x-1">
                    <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                    <span>Productos a Cargar:</span>
                  </span>
                  <span className="font-extrabold text-white">{totalCount} prendas</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Monto Total USD:</span>
                  <span className="font-mono font-bold text-emerald-400">${totalUsd.toFixed(2)} USD</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-800 pt-2 font-bold text-white">
                  <span>Total en Bs (BCV {tasa.toFixed(2)}):</span>
                  <span className="font-mono text-amber-400">{totalBsFormatted} Bs</span>
                </div>
              </div>

              {/* Botón Acción Principal */}
              <button
                onClick={handleAssign}
                disabled={assigning || !selectedTableId}
                className="w-full py-3.5 px-4 rounded-2xl font-extrabold text-sm text-slate-950 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:brightness-110 active:scale-95 transition-all shadow-lg flex items-center justify-center space-x-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                {assigning ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Cargando a FINA ERP...</span>
                  </>
                ) : (
                  <>
                    <span>Confirmar y Asignar a Mesa</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          )}

        </div>

      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { FaFilePdf, FaQrcode, FaTrash, FaCheck, FaFire, FaPlus, FaBell, FaHome, FaWhatsapp } from 'react-icons/fa';
import './App.css';

const API_URL = import.meta.env.PROD
  ? '/api'
  : `http://${window.location.hostname}:3000/api`;


const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const LOCATION_GROUPS = ['Casa Ayacucho', 'Star Music', 'Leo y Sebas'];

/* ── Helpers ─────────────────────────────────────────────────── */
const getToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };

const dueDateForDay = (day) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day).toISOString().split('T')[0];
};

const venceLabel = (day) => {
  const now = new Date();
  return `Vence: ${day} de ${MONTHS[now.getMonth()]}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const [, month, dayNum] = dateStr.split('-');
  return `${parseInt(dayNum)} ${MONTHS_SHORT[parseInt(month) - 1]}`;
};

const getStatus = (dueDateStr, paid) => {
  if (paid) return { text: 'Pagado', cls: 'pagado' };
  const due = new Date(dueDateStr + 'T00:00:00');
  const diff = Math.ceil((due - getToday()) / 86400000);
  if (diff < 0)  return { text: 'Vencido',    cls: 'vencido'    };
  if (diff <= 3) return { text: 'Por Vencer', cls: 'por-vencer' };
  return { text: 'Al Día', cls: 'al-dia' };
};

/* ── App ─────────────────────────────────────────────────────── */
export default function App() {
  const [activeTab,  setActiveTab]  = useState('dashboard');
  const [services,   setServices]   = useState([]);
  const [templates,  setTemplates]  = useState([]);
  const [archives,   setArchives]   = useState([]);
  const [settings,   setSettings]   = useState({ phone: '', reimbursed: 0 });
  const [whatsapp,   setWhatsapp]   = useState({ ready: false, qr: null });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openArchive, setOpenArchive] = useState(null); // id of expanded archive

  // ── Modals state ──
  const [payModal,    setPayModal]    = useState(null);
  const [addTplModal, setAddTplModal] = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [closeMonthModal, setCloseMonthModal] = useState(false);
  const [reimbInput,  setReimbInput]  = useState('');

  // pay modal fields
  const [modalAmount, setModalAmount] = useState('');
  const [modalObs,    setModalObs]    = useState('');

  // new template fields
  const [newTpl, setNewTpl] = useState({ name:'', code:'', locationGroup:'Casa Ayacucho', day:'' });

  /* ── Data fetching ── */
  const fetchServices  = useCallback(async () => {
    try { const r = await axios.get(`${API_URL}/services`);  setServices(r.data); } catch(e) { console.error(e); }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try { const r = await axios.get(`${API_URL}/templates`); setTemplates(r.data); } catch(e) { console.error(e); }
  }, []);

  const fetchArchives  = useCallback(async () => {
    try { const r = await axios.get(`${API_URL}/archives`);  setArchives(r.data); } catch(e) { console.error(e); }
  }, []);

  const fetchSettings  = useCallback(async () => {
    try { const r = await axios.get(`${API_URL}/settings`);  setSettings(r.data); setReimbInput(r.data.reimbursed || ''); } catch(e) { console.error(e); }
  }, []);

  const checkWhatsapp  = useCallback(async () => {
    try { const r = await axios.get(`${API_URL}/whatsapp/status`); setWhatsapp(r.data); } catch(e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchServices();
    fetchTemplates();
    fetchSettings();
    fetchArchives();
    const iv = setInterval(checkWhatsapp, 5000);
    return () => clearInterval(iv);
  }, []);

  const closeMonth = async () => {
    try {
      await axios.post(`${API_URL}/archives/close-month`);
      await fetchServices();
      await fetchSettings();
      await fetchArchives();
      setSelectedIds(new Set());
      setCloseMonthModal(false);
      setReimbInput('0');
    } catch(e) { console.error(e); }
  };

  /* ── Pay a template ── */
  const openPayModal = (tpl) => { setPayModal(tpl); setModalAmount(''); setModalObs(''); };

  const confirmPayment = async () => {
    if (!modalAmount || isNaN(parseFloat(modalAmount))) return;
    const t = payModal;
    try {
      await axios.post(`${API_URL}/services`, {
        code: t.code, name: t.name, locationGroup: t.locationGroup,
        dueDate: dueDateForDay(t.day), amount: parseFloat(modalAmount),
        observations: modalObs, paid: 1,
      });
      setSelectedIds(prev => new Set(prev).add(t.id));
      await fetchServices();
      setPayModal(null);
    } catch(e) { console.error(e); }
  };

  /* ── Add template ── */
  const addTemplate = async () => {
    if (!newTpl.name || !newTpl.day) return;
    try {
      await axios.post(`${API_URL}/templates`, newTpl);
      await fetchTemplates();
      setAddTplModal(false);
      setNewTpl({ name:'', code:'', locationGroup:'Casa Ayacucho', day:'' });
    } catch(e) { console.error(e); }
  };

  /* ── Delete (confirmed via custom modal) ── */
  const requestDelete = (type, id, name) => setConfirmDel({ type, id, name });

  const executeDelete = async () => {
    if (!confirmDel) return;
    const { type, id } = confirmDel;
    try {
      if (type === 'service')  await axios.delete(`${API_URL}/services/${id}`);
      if (type === 'template') await axios.delete(`${API_URL}/templates/${id}`);
      if (type === 'service')  await fetchServices();
      if (type === 'template') await fetchTemplates();
      setConfirmDel(null);
    } catch(e) { console.error(e); }
  };

  /* ── Reimbursement ── */
  const saveReimbursed = async () => {
    const val = parseFloat(reimbInput) || 0;
    try {
      await axios.post(`${API_URL}/settings`, { reimbursed: val });
      await fetchSettings();
    } catch(e) { console.error(e); }
  };

  /* ── WhatsApp ── */
  const savePhone = async () => {
    try { await axios.post(`${API_URL}/settings`, { phone: settings.phone }); }
    catch(e) { console.error(e); }
  };
  
  const savePhoneManual = async () => {
    await savePhone();
    alert('Número guardado ✅');
  };

  const testWhatsapp = async () => {
    try { await axios.post(`${API_URL}/whatsapp/test`, { phone: settings.phone }); alert('Mensaje de prueba enviado ✅'); }
    catch(e) { alert('Error al enviar. Revisa la consola.'); }
  };

  const sendNotification = async () => {
    try {
      const r = await axios.post(`${API_URL}/whatsapp/notify`);
      alert(r.data.message || `✅ Notificación enviada (${r.data.sent} pago${r.data.sent !== 1 ? 's' : ''} urgente${r.data.sent !== 1 ? 's' : ''})`);
    } catch(e) {
      alert(e.response?.data?.error || 'Error al enviar la notificación.');
    }
  };

  /* ── PDF ── */
  const generatePDF = () => {
    const doc = new jsPDF();
    const now = new Date();
    doc.setFontSize(16);
    doc.text('Resumen de Pagos', 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Generado: ${now.toLocaleDateString('es-PE')}`, 14, 22);
    doc.autoTable({
      head: [['Servicio','Código','Grupo','Vence','Monto','Observaciones']],
      body: paidServices.map(s => [s.name, s.code||'-', s.locationGroup, formatDate(s.dueDate), `S/.${s.amount.toFixed(2)}`, s.observations||'']),
      startY: 28, styles: { fontSize: 9 },
    });
    const y = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(`Total Pagado: S/.${totalPaid.toFixed(2)}`, 14, y);
    doc.text(`Total Reembolsado: S/.${(settings.reimbursed||0).toFixed(2)}`, 14, y + 8);
    doc.save('pagos.pdf');
  };

  /* ── Derived ── */
  const paidServices    = services.filter(s => s.paid);
  const pendingServices = services.filter(s => !s.paid);
  const totalPaid       = paidServices.reduce((s, x) => s + x.amount, 0);
  const dueSoon         = pendingServices.filter(s => getStatus(s.dueDate, false).cls === 'por-vencer');
  const overdue         = pendingServices.filter(s => getStatus(s.dueDate, false).cls === 'vencido');
  const reimbursed      = parseFloat(settings.reimbursed) || 0;
  const pendingReimb    = totalPaid - reimbursed;

  const groupedPaid = paidServices.reduce((acc, s) => {
    if (!acc[s.locationGroup]) acc[s.locationGroup] = [];
    acc[s.locationGroup].push(s);
    return acc;
  }, {});

  /* ═══════════════════════════════════════════════════════════ */
  return (
    <div className="app-container">

      {/* HEADER */}
      <header style={{ marginBottom: 0, paddingBottom: '1rem', borderBottom: 'none' }}>
        <div className="header-left">
          <h1><FaFire style={{verticalAlign:'middle', marginRight:'0.4rem', color:'#f97316'}} />Gestión de Pagos</h1>
          <p>Panel de control de servicios mensuales</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={() => setCloseMonthModal(true)}>📅 Cerrar Mes</button>
          <button className="btn btn-ghost" onClick={generatePDF}><FaFilePdf /> Exportar PDF</button>
        </div>
      </header>

      {/* TABS */}
      <div className="app-nav">
        <button className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <FaHome /> Dashboard
        </button>
        <button className={`nav-tab ${activeTab === 'whatsapp' ? 'active' : ''}`} onClick={() => setActiveTab('whatsapp')}>
          <FaWhatsapp /> Config. WhatsApp
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <>
          {/* DASHBOARD CARDS */}
      <div className="dashboard-cards">
        <div className="card">
          <h3>Total Pagado</h3>
          <div className="amount">S/.{totalPaid.toFixed(2)}</div>
          <p>{paidServices.length} servicio{paidServices.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="card success-card">
          <h3>Reembolsado</h3>
          <div className="amount">S/.{reimbursed.toFixed(2)}</div>
          <p style={{color: pendingReimb > 0 ? 'var(--orange)' : 'var(--success)'}}>
            {pendingReimb > 0 ? `Pendiente: S/.${pendingReimb.toFixed(2)}` : '✓ Todo reembolsado'}
          </p>
        </div>
        <div className="card warning">
          <h3>Por Vencer</h3>
          <div className="amount">{dueSoon.length}</div>
          <p>S/.{dueSoon.reduce((s,x)=>s+x.amount,0).toFixed(2)} pendientes</p>
        </div>
        <div className="card danger">
          <h3>Vencidos</h3>
          <div className="amount">{overdue.length}</div>
          <p>S/.{overdue.reduce((s,x)=>s+x.amount,0).toFixed(2)} pendientes</p>
        </div>
      </div>

      {/* REIMBURSED INPUT */}
      <div className="section">
        <div className="section-title">Monto Reembolsado</div>
        <p style={{margin:'0 0 1rem', fontSize:'0.85rem', color:'var(--text-muted)'}}>
          Ingresa cuánto ya te han devuelto de los pagos que hiciste.
        </p>
        <div className="reimb-row">
          <span className="reimb-prefix">S/.</span>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={reimbInput}
            onChange={e => setReimbInput(e.target.value)}
            className="reimb-input"
          />
          <button className="btn btn-primary btn-sm" onClick={saveReimbursed}><FaCheck /> Guardar</button>
        </div>
      </div>

      {/* SERVICE TEMPLATES */}
      <div className="section">
        <div className="section-header-row">
          <div className="section-title" style={{margin:0}}>Selecciona los servicios que pagaste</div>
          <button className="btn btn-primary btn-sm" onClick={() => setAddTplModal(true)}>
            <FaPlus /> Agregar Servicio
          </button>
        </div>
        <div className="services-grid" style={{marginTop:'1.25rem'}}>
          {templates.map(t => {
            const isSel = selectedIds.has(t.id);
            return (
              <div key={t.id} className={`service-template-card ${isSel ? 'selected' : ''}`}>
                <div className="tpl-card-body" onClick={() => openPayModal(t)}>
                  <span className="check-icon"><FaCheck /></span>
                  <span className="svc-name">{t.name}</span>
                  {t.code && <span className="svc-code">Cód: {t.code}</span>}
                  <span className="svc-date">{venceLabel(t.day)}</span>
                </div>
                <button
                  className="tpl-delete-btn"
                  title="Eliminar este servicio"
                  onClick={e => { e.stopPropagation(); requestDelete('template', t.id, t.name); }}
                >
                  <FaTrash />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* PAID SERVICES TABLE */}
      <div className="section">
        <div className="paid-section-header">
          <div className="section-title" style={{margin:0}}>Servicios Pagados</div>
          <span style={{fontSize:'0.85rem', color:'var(--text-muted)'}}>
            {paidServices.length} registro{paidServices.length !== 1 ? 's' : ''}
          </span>
        </div>

        {paidServices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <p>Aún no has registrado pagos.<br/>Haz clic en los servicios de arriba para registrarlos.</p>
          </div>
        ) : (
          <>
            <div style={{overflowX:'auto'}}>
              <table>
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Código</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Monto</th>
                    <th>Observaciones</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(groupedPaid).map(group => (
                    <React.Fragment key={group}>
                      <tr className="group-header"><td colSpan="7">{group}</td></tr>
                      {groupedPaid[group].map(svc => {
                        const status = getStatus(svc.dueDate, svc.paid);
                        return (
                          <tr key={svc.id}>
                            <td style={{fontWeight:600}}>{svc.name}</td>
                            <td style={{fontFamily:'monospace', fontSize:'0.8rem', color:'var(--text-muted)'}}>{svc.code||'—'}</td>
                            <td>{formatDate(svc.dueDate)}</td>
                            <td><span className={`status-badge ${status.cls}`}>{status.text}</span></td>
                            <td style={{fontWeight:700, color:'var(--orange-bright)'}}>S/.{svc.amount.toFixed(2)}</td>
                            <td><span className="obs-text">{svc.observations||'—'}</span></td>
                            <td>
                              <button className="btn btn-danger" onClick={() => requestDelete('service', svc.id, svc.name)}>
                                <FaTrash />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="totals">
              <div className="total-item">
                <span className="total-label">Total pagado</span>
                <span className="total-value orange">S/.{totalPaid.toFixed(2)}</span>
              </div>
              <div className="total-item">
                <span className="total-label">Reembolsado</span>
                <span className="total-value green">S/.{reimbursed.toFixed(2)}</span>
              </div>
              {pendingReimb > 0 && (
                <div className="total-item">
                  <span className="total-label">Pendiente de reembolso</span>
                  <span className="total-value" style={{color:'var(--text-muted)'}}>S/.{pendingReimb.toFixed(2)}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* WHATSAPP */}
      {activeTab === 'whatsapp' && (
      <div className="section">
        <div className="section-title">Configuración de WhatsApp</div>
        <div className="whatsapp-row">
          <input
            type="text"
            placeholder="Número (ej: +51999888777)"
            value={settings.phone || ''}
            onChange={e => setSettings(s => ({...s, phone: e.target.value}))}
            onBlur={savePhone}
          />
          <button className="btn btn-ghost btn-sm" onClick={savePhoneManual}>Guardar Número</button>
          <button className="btn btn-ghost btn-sm" onClick={testWhatsapp} disabled={!whatsapp.ready}>
            Probar Mensaje
          </button>
          <button className="btn btn-primary btn-sm" onClick={sendNotification} disabled={!whatsapp.ready}>
            <FaBell /> Enviar Recordatorio
          </button>
        </div>

        {!whatsapp.ready && whatsapp.qr ? (
          <div className="qr-container">
            <h3 style={{color:'black'}}><FaQrcode /> Escanea para vincular</h3>
            <p style={{color:'#555', fontSize:'0.85rem'}}>WhatsApp → Dispositivos Vinculados → Vincular dispositivo</p>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(whatsapp.qr)}`} alt="WhatsApp QR" />
          </div>
        ) : (
          <p style={{marginTop:'1rem', color: whatsapp.ready ? 'var(--success)' : 'var(--text-muted)', fontSize:'0.9rem'}}>
            {whatsapp.ready ? '✅ WhatsApp Vinculado Correctamente' : '⏳ Iniciando servicio de WhatsApp...'}
          </p>
        )}
      </div>
      )}

      {/* HISTORIAL MENSUAL */}
      <div className="section">
        <div className="section-header-row">
          <div className="section-title" style={{margin:0}}>Historial Mensual</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setHistoryOpen(v => !v)}>
            {historyOpen ? '▲ Ocultar' : '▼ Ver historial'}
          </button>
        </div>

        {historyOpen && (
          archives.length === 0 ? (
            <div className="empty-state" style={{padding:'2rem 0 0'}}>
              <div className="empty-icon">📋</div>
              <p>Aún no hay meses cerrados. El historial aparece aquí al cerrar cada mes.</p>
            </div>
          ) : (
            <div style={{marginTop:'1.25rem', display:'flex', flexDirection:'column', gap:'0.75rem'}}>
              {archives.map(arc => {
                const monthName = MONTHS[arc.month - 1];
                const isOpen = openArchive === arc.id;
                const svcs = arc.services || [];
                return (
                  <div key={arc.id} className="archive-card">
                    <div className="archive-header" onClick={() => setOpenArchive(isOpen ? null : arc.id)}>
                      <span className="archive-title">
                        {monthName.charAt(0).toUpperCase() + monthName.slice(1)} {arc.year}
                      </span>
                      <div className="archive-summary">
                        <span style={{color:'var(--orange-bright)'}}>Pagado: S/.{arc.total_paid.toFixed(2)}</span>
                        <span style={{color:'var(--success)'}}>Reembolsado: S/.{arc.reimbursed.toFixed(2)}</span>
                        <span style={{color:'var(--text-muted)', fontSize:'0.8rem'}}>{svcs.length} servicios</span>
                        <span className="archive-toggle">{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    {isOpen && svcs.length > 0 && (
                      <div style={{overflowX:'auto'}}>
                        <table style={{marginTop:'0.5rem'}}>
                          <thead>
                            <tr>
                              <th>Servicio</th><th>Grupo</th><th>Monto</th><th>Observaciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {svcs.map((s, i) => (
                              <tr key={i}>
                                <td style={{fontWeight:600}}>{s.name}</td>
                                <td style={{color:'var(--text-muted)', fontSize:'0.85rem'}}>{s.locationGroup}</td>
                                <td style={{color:'var(--orange-bright)', fontWeight:700}}>S/.{s.amount.toFixed(2)}</td>
                                <td><span className="obs-text">{s.observations||'—'}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
      </>
      )}

      {/* ══ MODAL: Registrar pago ══════════════════════════════════ */}
      {payModal && (
        <div className="modal-overlay" onClick={() => setPayModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{payModal.name}</h3>
            <p className="modal-sub">
              {payModal.code ? `Código: ${payModal.code} · ` : ''}{venceLabel(payModal.day)}
            </p>
            <div className="modal-field">
              <label>Monto pagado (S/.)</label>
              <input
                type="number" step="0.01" placeholder="0.00" autoFocus
                value={modalAmount} onChange={e => setModalAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmPayment()}
              />
            </div>
            <div className="modal-field">
              <label>Observaciones (opcional)</label>
              <textarea rows={3} placeholder="Ej: pagado con Yape, nro operación…"
                value={modalObs} onChange={e => setModalObs(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setPayModal(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={confirmPayment}><FaCheck /> Confirmar Pago</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Agregar plantilla ══════════════════════════════ */}
      {addTplModal && (
        <div className="modal-overlay" onClick={() => setAddTplModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Agregar Servicio</h3>
            <p className="modal-sub">Añade un nuevo servicio a tu lista de plantillas.</p>

            <div className="modal-field">
              <label>Nombre del Servicio *</label>
              <input type="text" placeholder="Ej: Agua Casa Lima"
                value={newTpl.name} onChange={e => setNewTpl(s => ({...s, name: e.target.value}))} />
            </div>
            <div className="modal-field">
              <label>Código (opcional)</label>
              <input type="text" placeholder="Ej: 12345678"
                value={newTpl.code} onChange={e => setNewTpl(s => ({...s, code: e.target.value}))} />
            </div>
            <div className="modal-field">
              <label>Grupo / Ubicación</label>
              <select value={newTpl.locationGroup} onChange={e => setNewTpl(s => ({...s, locationGroup: e.target.value}))}>
                {LOCATION_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="modal-field">
              <label>Día de vencimiento (1-31) *</label>
              <input type="number" min="1" max="31" placeholder="Ej: 15"
                value={newTpl.day} onChange={e => setNewTpl(s => ({...s, day: parseInt(e.target.value)||''}))} />
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setAddTplModal(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={addTemplate}><FaPlus /> Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Confirmación eliminar ══════════════════════════ */}
      {confirmDel && (
        <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3 style={{color:'#c084fc'}}>¿Eliminar?</h3>
            <p className="modal-sub">
              {confirmDel.type === 'service'
                ? 'Este registro de pago será eliminado permanentemente.'
                : 'Esta plantilla de servicio será eliminada permanentemente.'}
            </p>
            <p style={{color:'var(--text)', fontWeight:600, margin:'0 0 1.5rem'}}>"{confirmDel.name}"</p>
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn btn-sm" style={{background:'#7c3aed', color:'white'}} onClick={executeDelete}>
                <FaTrash /> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Cerrar Mes ══════════════════════════════════════ */}
      {closeMonthModal && (
        <div className="modal-overlay" onClick={() => setCloseMonthModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <h3 style={{color:'var(--orange-bright)'}}>📅 Cerrar Mes</h3>
            <p className="modal-sub">
              Esto archivará todos los pagos del mes actual en el historial y reiniciará los contadores a cero.
            </p>
            <p style={{color:'var(--text)', fontSize:'0.9rem', margin:'0 0 1.5rem'}}>
              Total a archivar: <strong style={{color:'var(--orange-bright)'}}>S/.{totalPaid.toFixed(2)}</strong>
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setCloseMonthModal(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={closeMonth}>
                <FaCheck /> Confirmar Cierre
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

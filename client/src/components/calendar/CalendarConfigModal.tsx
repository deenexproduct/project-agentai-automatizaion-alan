import { useState, useEffect } from 'react';
import { X, Save, AlertTriangle, Key, Mail, LayoutTemplate, Calendar, CheckSquare } from 'lucide-react';
import api from '../../lib/axios';
import { useToastContext } from '../../contexts/ToastContext';
import { API_BASE } from '../../config';

interface CalendarConfigModalProps {
    open: boolean;
    onClose: () => void;
}

const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Contenedor Principal -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.08);">
          
          <!-- Header con Gradiente Deenex -->
          <tr>
            <td style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 50px 40px; text-align: center;">
              <div style="background: rgba(255,255,255,0.2); width: 60px; height: 60px; border-radius: 16px; margin: 0 auto 20px auto; line-height: 60px; font-size: 30px;">
                🗓️
              </div>
              <h1 style="color: #ffffff; margin: 0 0 10px 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">Tu reunión está confirmada</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 18px; font-weight: 500;">
                {{event_title}}
              </p>
            </td>
          </tr>
          
          <!-- Cuerpo del Correo -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 26px; color: #3f3f46;">
                Hola <strong style="color: #18181b;">{{contact_name}}</strong>,<br><br>
                Nos emociona confirmarte nuestra próxima sesión. Hemos reservado este espacio especialmente para ti. A continuación encontrarás todos los detalles que necesitas:
              </p>
              
              <!-- Tarjeta de Detalles (Gris claro) -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 16px; padding: 24px; margin-bottom: 35px; border: 1px solid #e2e8f0;">
                
                <!-- Fila Fecha -->
                <tr>
                  <td width="40" style="padding-bottom: 20px;">
                    <div style="background: #ffffff; width: 32px; height: 32px; border-radius: 8px; text-align: center; line-height: 32px; font-size: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">📅</div>
                  </td>
                  <td style="padding-bottom: 20px;">
                    <div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Fecha</div>
                    <div style="color: #0f172a; font-size: 16px; font-weight: 600; margin-top: 4px;">{{event_date}}</div>
                  </td>
                </tr>
                
                <!-- Fila Hora -->
                <tr>
                  <td width="40" style="padding-bottom: 20px;">
                    <div style="background: #ffffff; width: 32px; height: 32px; border-radius: 8px; text-align: center; line-height: 32px; font-size: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">⏰</div>
                  </td>
                  <td style="padding-bottom: 20px;">
                    <div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Hora</div>
                    <div style="color: #0f172a; font-size: 16px; font-weight: 600; margin-top: 4px;">{{event_time}}</div>
                  </td>
                </tr>
                
                <!-- Fila Ubicación/Link -->
                <tr>
                  <td width="40">
                    <div style="background: #ffffff; width: 32px; height: 32px; border-radius: 8px; text-align: center; line-height: 32px; font-size: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">📍</div>
                  </td>
                  <td>
                    <div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Modalidad / Link</div>
                    <div style="color: #7c3aed; font-size: 16px; font-weight: 600; margin-top: 4px; word-break: break-word;">
                      {{event_location_or_link}}
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 15px; line-height: 24px; color: #64748b; text-align: center;">
                Si necesitas reprogramar o tienes alguna duda antes de reunirnos, no dudes en responder directamente a este correo.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 40px; text-align: center;">
              <p style="margin: 0; font-size: 14px; color: #94a3b8; font-weight: 500;">
                Potenciado por <strong style="color: #7c3aed;">Deenex CRM</strong>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

export default function CalendarConfigModal({ open, onClose }: CalendarConfigModalProps) {
    const { addToast } = useToastContext();
    const [activeTab, setActiveTab] = useState<'google' | 'smtp' | 'template'>('google');

    // Google Calendar State
    const [googleConnected, setGoogleConnected] = useState(false);
    const [isGoogleOwner, setIsGoogleOwner] = useState(false);
    const [calendars, setCalendars] = useState<{ id: string, summary: string, primary?: boolean }[]>([]);
    const [selectedCalendarId, setSelectedCalendarId] = useState<string>('primary');
    const [loadingCalendars, setLoadingCalendars] = useState(false);

    // SMTP Config State
    const [smtpHost, setSmtpHost] = useState('');
    const [smtpPort, setSmtpPort] = useState('587');
    const [smtpUser, setSmtpUser] = useState('');
    const [smtpPass, setSmtpPass] = useState('');

    // Template Config State
    const [templateSubject, setTemplateSubject] = useState('Invitación: {{event_title}}');
    const [templateBody, setTemplateBody] = useState(DEFAULT_TEMPLATE);
    const [showPreview, setShowPreview] = useState(false);

    // Form Status
    const [saving, setSaving] = useState(false);

    const loadConfig = async () => {
        try {
            const res = await api.get('/calendar/config');
            if (res.data) {
                if (res.data.googleRefreshToken) {
                    setGoogleConnected(true);
                    setIsGoogleOwner(res.data.isGoogleOwner);
                }
                if (res.data.smtp) {
                    setSmtpHost(res.data.smtp.host || '');
                    setSmtpPort(res.data.smtp.port ? res.data.smtp.port.toString() : '587');
                    setSmtpUser(res.data.smtp.user || '');
                    setSmtpPass(res.data.smtp.pass || '');
                }
                if (res.data.emailTemplate) {
                    setTemplateBody(res.data.emailTemplate);
                }

                // Fetch calendars if connected
                if (res.data.googleRefreshToken) {
                    fetchCalendars();
                    if (res.data.googleCalendarId) setSelectedCalendarId(res.data.googleCalendarId);
                }
            }
        } catch (error) {
            console.error('Error loading calendar config:', error);
        }
    };

    const fetchCalendars = async () => {
        setLoadingCalendars(true);
        try {
            const res = await api.get('/calendar/calendars');
            if (res.data && res.data.calendars) {
                console.log('All calendars fetched:', res.data.calendars);

                const filtered = res.data.calendars.filter((c: any) =>
                    c.summary && c.summary.toLowerCase().includes('deenex')
                );

                console.log('Filtered calendars:', filtered);

                // If the filter resulted in empty, fallback to showing all calendars so they aren't stuck
                if (filtered.length > 0) {
                    setCalendars(filtered);
                    // Automatically select the first specific one if NO specific one is currently selected in the DB
                    setSelectedCalendarId((currentId) => {
                        if (currentId === 'primary' || !currentId) {
                            api.put('/calendar/config', { googleCalendarId: filtered[0].id });
                            return filtered[0].id;
                        }
                        return currentId;
                    });
                } else {
                    setCalendars(res.data.calendars);
                }
            }
        } catch (error) {
            console.error('Error fetching google calendars:', error);
        } finally {
            setLoadingCalendars(false);
        }
    };

    useEffect(() => {
        if (open) {
            loadConfig();
        }
    }, [open]);

    const handleGoogleConnect = () => {
        // Open the auth URL in a popup
        const width = 500;
        const height = 600;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
            `${API_BASE}/api/calendar/auth/google?t=${Date.now()}`,
            'Google Auth',
            `width=${width},height=${height},left=${left},top=${top}`
        );

        // Listen for the callback message from the popup
        const handleMessage = async (event: MessageEvent) => {
            // In production, verify event.origin matches backend URL
            if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
                window.removeEventListener('message', handleMessage);

                // Save the token to config
                try {
                    setSaving(true);
                    await api.put('/calendar/config', {
                        googleRefreshToken: event.data.refreshToken
                    });
                    setGoogleConnected(true);
                    setIsGoogleOwner(true); // Since I just connected it, I am the owner
                    addToast('success', 'Google Calendar conectado exitosamente.');
                    fetchCalendars();
                } catch (error) {
                    console.error('Error saving google token:', error);
                    addToast('error', 'Error al guardar conexión de Google.');
                } finally {
                    setSaving(false);
                }
            }
        };

        window.addEventListener('message', handleMessage);
    };

    const handleSaveSMTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const secure = smtpPort === '465';
            await api.put('/calendar/config', {
                smtp: {
                    host: smtpHost,
                    port: parseInt(smtpPort, 10),
                    user: smtpUser,
                    pass: smtpPass,
                    secure
                }
            });
            addToast('success', 'Configuración SMTP guardada exitosamente.');
        } catch (error) {
            console.error(error);
            addToast('error', 'Error al guardar la configuración SMTP.');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveTemplate = async () => {
        setSaving(true);
        try {
            await api.put('/calendar/config', { emailTemplate: templateBody });
            addToast('success', 'Plantilla guardada exitosamente.');
        } catch (error) {
            console.error(error);
            addToast('error', 'Error al guardar la plantilla.');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 text-slate-800" style={{ animation: 'fadeIn 0.2s ease-out' }}>
            <div className="bg-slate-50 rounded-[24px] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.1)] overflow-hidden" style={{ animation: 'slideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0 relative z-10 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[12px] bg-violet-100 text-violet-600 flex items-center justify-center shadow-inner relative overflow-hidden">
                            <Calendar size={20} className="relative z-10" />
                        </div>
                        <div>
                            <h2 className="text-[18px] font-bold text-slate-800 tracking-tight">Configuración de Calendario</h2>
                            <p className="text-[13px] font-medium text-slate-500">Administra integraciones y plantillas de correo</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar Tabs */}
                    <div className="w-64 bg-white border-r border-slate-100 p-4 shrink-0 overflow-y-auto">
                        <nav className="space-y-1">
                            <button
                                onClick={() => setActiveTab('google')}
                                className={`w-full text-left px-4 py-3 rounded-[12px] flex items-center gap-3 transition-colors ${activeTab === 'google' ? 'bg-violet-50 text-violet-700 font-bold' : 'text-slate-600 hover:bg-slate-50 font-medium'}`}
                            >
                                <Calendar size={18} className={activeTab === 'google' ? 'text-violet-600' : 'text-slate-400'} />
                                Google Calendar
                            </button>
                            <button
                                onClick={() => setActiveTab('smtp')}
                                className={`w-full text-left px-4 py-3 rounded-[12px] flex items-center gap-3 transition-colors ${activeTab === 'smtp' ? 'bg-violet-50 text-violet-700 font-bold' : 'text-slate-600 hover:bg-slate-50 font-medium'}`}
                            >
                                <Mail size={18} className={activeTab === 'smtp' ? 'text-violet-600' : 'text-slate-400'} />
                                Servidor SMTP
                            </button>
                            <button
                                onClick={() => setActiveTab('template')}
                                className={`w-full text-left px-4 py-3 rounded-[12px] flex items-center gap-3 transition-colors ${activeTab === 'template' ? 'bg-violet-50 text-violet-700 font-bold' : 'text-slate-600 hover:bg-slate-50 font-medium'}`}
                            >
                                <LayoutTemplate size={18} className={activeTab === 'template' ? 'text-violet-600' : 'text-slate-400'} />
                                Plantilla Invitaciones
                            </button>
                        </nav>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 relative">
                        {/* Tab: Google Calendar */}
                        {activeTab === 'google' && (
                            <div className="max-w-xl animate-fade-in space-y-6">
                                <div>
                                    <h3 className="text-[16px] font-bold text-slate-800 mb-1">Integración con Google Calendar</h3>
                                    <p className="text-[14px] text-slate-500 mb-6">Conecta tu cuenta para sincronizar eventos automáticamente y habilitar la generación de enlaces de Meet.</p>

                                    <div className="bg-white border text-center border-slate-200 rounded-[20px] p-8 shadow-sm">
                                        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Calendar size={32} />
                                        </div>
                                        {googleConnected ? (
                                            <div>
                                                <h4 className="text-[16px] font-bold text-slate-800 mb-2">Cuenta Conectada</h4>
                                                <p className="text-[14px] text-green-600 font-medium bg-green-50 py-1.5 px-3 rounded-full inline-block mb-6">Sincronización Activa</p>

                                                <div className="mb-6 text-left">
                                                    <label className="block text-[13px] font-bold text-slate-700 mb-2">Calendario a Sincronizar</label>
                                                    {loadingCalendars ? (
                                                        <div className="flex items-center gap-2 text-slate-500 text-sm">
                                                            <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                                                            Cargando calendarios...
                                                        </div>
                                                    ) : (
                                                        <select
                                                            disabled={!isGoogleOwner}
                                                            className={`w-full h-11 px-4 border border-slate-200 rounded-[12px] text-[14px] text-slate-800 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all shadow-sm outline-none ${!isGoogleOwner ? 'bg-slate-100 cursor-not-allowed opacity-80' : 'bg-slate-50'}`}
                                                            value={selectedCalendarId}
                                                            onChange={async (e) => {
                                                                const newId = e.target.value;
                                                                console.log('User selected new calendar:', newId);
                                                                setSelectedCalendarId(newId);
                                                                try {
                                                                    await api.put('/calendar/config', { googleCalendarId: newId });
                                                                    console.log('Successfully saved to backend:', newId);
                                                                    addToast('success', 'Calendario seleccionado guardado.');
                                                                } catch (err) {
                                                                    console.error('Failed to save to backend:', err);
                                                                    addToast('error', 'Error al guardar el calendario.');
                                                                }
                                                            }}
                                                        >
                                                            {calendars.map(cal => (
                                                                <option key={cal.id} value={cal.id}>
                                                                    {cal.summary} {cal.primary ? '(Principal)' : ''}
                                                                </option>
                                                            ))}
                                                            {!calendars.find(c => c.primary)?.id && selectedCalendarId === 'primary' && (
                                                                <option value="primary">Calendario Principal</option>
                                                            )}
                                                        </select>
                                                    )}
                                                    <p className="text-[12px] text-slate-500 mt-2">
                                                        {isGoogleOwner ? "Los eventos se crearán en este calendario exclusivo." : "Este calendario es administrado de manera global por un administrador."}
                                                    </p>
                                                </div>

                                                {isGoogleOwner ? (
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                setSaving(true);
                                                                await api.put('/calendar/config', { googleRefreshToken: null, googleCalendarId: null });
                                                                setGoogleConnected(false);
                                                                setIsGoogleOwner(false);
                                                                setCalendars([]);
                                                                setSelectedCalendarId('primary');
                                                                addToast('success', 'Google Calendar desconectado.');
                                                            } catch (err) {
                                                                addToast('error', 'Error al desconectar.');
                                                            } finally {
                                                                setSaving(false);
                                                            }
                                                        }}
                                                        className="px-6 py-2.5 bg-red-50 text-red-600 font-bold rounded-[12px] hover:bg-red-100 transition-colors w-full"
                                                    >
                                                        Desconectar
                                                    </button>
                                                ) : (
                                                    <div className="bg-slate-50 border border-slate-200 rounded-[12px] p-4 text-center">
                                                        <p className="text-[13px] font-medium text-slate-600">
                                                            📅 La integración de Google Calendar para la plataforma está configurada por otro usuario administrador. Solo ese usuario puede desconectar o modificar el calendario principal.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div>
                                                <h4 className="text-[16px] font-bold text-slate-800 mb-2">No estás conectado</h4>
                                                <p className="text-[14px] text-slate-500 mb-6 mx-auto">Vincular tu cuenta te permitirá organizar mejor tus tiempos y los de tus clientes dentro del CRM.</p>
                                                <button onClick={handleGoogleConnect} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-[12px] w-full hover:bg-blue-700 transition-all shadow-sm shadow-blue-500/30 flex items-center justify-center gap-2">
                                                    <Calendar size={18} />
                                                    Conectar Google Calendar
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tab: SMTP Setup */}
                        {activeTab === 'smtp' && (
                            <div className="max-w-xl animate-fade-in space-y-6">
                                <div>
                                    <h3 className="text-[16px] font-bold text-slate-800 mb-1">Servidor SMTP para Correos</h3>
                                    <p className="text-[14px] text-slate-500 mb-6">Configura el servidor saliente para enviar invitaciones de calendario directamente desde el CRM.</p>

                                    <form onSubmit={handleSaveSMTP} className="bg-white p-6 rounded-[20px] shadow-sm border border-slate-100 space-y-4">
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="col-span-2">
                                                <label className="block text-[12px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Servidor SMTP Host</label>
                                                <input
                                                    type="text"
                                                    value={smtpHost}
                                                    onChange={e => setSmtpHost(e.target.value)}
                                                    placeholder="smtp.gmail.com"
                                                    className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-[12px] text-[14px] text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all font-medium"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[12px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Puerto</label>
                                                <input
                                                    type="number"
                                                    value={smtpPort}
                                                    onChange={e => setSmtpPort(e.target.value)}
                                                    placeholder="587"
                                                    className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-[12px] text-[14px] text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all font-medium"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[12px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Usuario / Email Remitente</label>
                                            <input
                                                type="text"
                                                value={smtpUser}
                                                onChange={e => setSmtpUser(e.target.value)}
                                                placeholder="tu-email@empresa.com"
                                                className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-[12px] text-[14px] text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all font-medium"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[12px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Contraseña SMTP</label>
                                            <input
                                                type="password"
                                                value={smtpPass}
                                                onChange={e => setSmtpPass(e.target.value)}
                                                placeholder="••••••••••••••••"
                                                className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-[12px] text-[14px] text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                                            />
                                            <p className="text-[12px] text-slate-400 mt-2">Para cuentas de Gmail o Microsoft, utiliza una "Contraseña de Aplicación".</p>
                                        </div>

                                        <div className="pt-4 border-t border-slate-100 flex justify-end">
                                            <button
                                                type="submit"
                                                disabled={saving || !smtpHost || !smtpUser || !smtpPass}
                                                className="px-6 py-2.5 bg-violet-600 text-white font-bold rounded-[12px] hover:bg-violet-700 hover:-translate-y-0.5 transition-all shadow-sm shadow-violet-500/30 flex items-center gap-2 text-[14px] disabled:opacity-50 disabled:pointer-events-none"
                                            >
                                                {saving ? (
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <Save size={16} />
                                                )}
                                                Guardar Configuración
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}

                        {/* Tab: Template Design */}
                        {activeTab === 'template' && (
                            <div className="h-full flex flex-col animate-fade-in relative z-10 w-full min-w-0" style={{ maxWidth: '100%' }}>
                                <div className="flex items-end justify-between mb-4">
                                    <div>
                                        <h3 className="text-[16px] font-bold text-slate-800 mb-1">Plantilla de Correo HTML</h3>
                                        <p className="text-[14px] text-slate-500">Personaliza el mensaje que se enviará a los clientes al agendar.</p>
                                    </div>
                                    <div className="flex bg-slate-100 p-1 rounded-[10px]">
                                        <button
                                            onClick={() => setShowPreview(false)}
                                            className={`px-4 py-1.5 rounded-[8px] text-[13px] font-bold flex items-center gap-2 transition-all ${!showPreview ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <CheckSquare size={14} /> Editor de Código
                                        </button>
                                        <button
                                            onClick={() => setShowPreview(true)}
                                            className={`px-4 py-1.5 rounded-[8px] text-[13px] font-bold flex items-center gap-2 transition-all ${showPreview ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            <LayoutTemplate size={14} /> Vista Previa
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1 min-h-[400px] border border-slate-200 bg-white rounded-[20px] shadow-sm overflow-hidden flex flex-col relative">
                                    {!showPreview ? (
                                        <div className="flex flex-col h-full bg-slate-900 border-none p-4">
                                            <div className="mb-4">
                                                <label className="block text-[12px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">Asunto del Correo</label>
                                                <input
                                                    type="text"
                                                    value={templateSubject}
                                                    onChange={e => setTemplateSubject(e.target.value)}
                                                    className="w-full h-11 px-4 bg-slate-800 border-none rounded-[10px] text-[14px] text-violet-300 focus:outline-none focus:ring-1 focus:ring-violet-500/50 font-mono"
                                                />
                                            </div>
                                            <div className="flex-1 flex flex-col">
                                                <label className="block text-[12px] font-bold text-slate-400 mb-1.5 uppercase tracking-wide">Cuerpo del Correo (HTML)</label>
                                                <textarea
                                                    value={templateBody}
                                                    onChange={e => setTemplateBody(e.target.value)}
                                                    className="w-full flex-1 p-4 bg-slate-800 border-none rounded-[10px] text-[13px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-violet-500/50 font-mono resize-none leading-relaxed custom-scrollbar-dark"
                                                    style={{ minHeight: '300px' }}
                                                />
                                            </div>

                                            <div className="mt-4 p-4 bg-slate-800/50 rounded-[12px] border border-slate-700">
                                                <h4 className="text-[12px] font-bold text-slate-400 uppercase tracking-wide mb-2">Variables Disponibles</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {['{{contact_name}}', '{{event_title}}', '{{event_date}}', '{{event_time}}', '{{event_location_or_link}}'].map(v => (
                                                        <button key={v} onClick={() => setTemplateBody(prev => prev + ' ' + v)} type="button" className="bg-slate-800 px-2 py-1 rounded text-[11px] font-mono text-violet-400 border border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors">
                                                            {v}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="h-full flex flex-col bg-[#f0f2f5] p-6 relative">
                                            <div className="max-w-md w-full mx-auto bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden flex flex-col my-auto max-h-full">
                                                <div className="bg-slate-50 border-b border-slate-100 px-4 py-3 shrink-0">
                                                    <p className="text-[12px] text-slate-500"><strong className="text-slate-700">Asunto:</strong> {templateSubject.replace('{{event_title}}', 'Reunión Presentación Comercial')}</p>
                                                </div>
                                                <div
                                                    className="p-6 prose prose-sm max-w-none prose-p:text-slate-600 prose-a:text-violet-600 prose-strong:text-slate-800 overflow-y-auto"
                                                    dangerouslySetInnerHTML={{
                                                        __html: templateBody
                                                            .replace(/\{\{contact_name\}\}/g, 'Marcos Aldazabal')
                                                            .replace(/\{\{event_title\}\}/g, 'Reunión Presentación Comercial')
                                                            .replace(/\{\{event_date\}\}/g, '25 de Febrero')
                                                            .replace(/\{\{event_time\}\}/g, '14:30 hs')
                                                            .replace(/\{\{event_location_or_link\}\}/g, '<a href="#">https://meet.google.com/abc-defg-hij</a>')
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="mt-6 flex justify-end shrink-0">
                                    <button
                                        onClick={handleSaveTemplate}
                                        disabled={saving}
                                        className="px-6 py-2.5 bg-violet-600 text-white font-bold rounded-[12px] hover:bg-violet-700 hover:-translate-y-0.5 transition-all shadow-sm shadow-violet-500/30 flex items-center gap-2 text-[14px] disabled:opacity-50 disabled:pointer-events-none"
                                    >
                                        {saving ? (
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <Save size={16} />
                                        )}
                                        Guardar Plantilla
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideInUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                .custom-scrollbar-dark::-webkit-scrollbar { width: 8px; }
                .custom-scrollbar-dark::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar-dark::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
                .custom-scrollbar-dark::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
`}</style>
        </div >
    );
}

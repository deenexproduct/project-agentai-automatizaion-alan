import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import { ICalendarConfig, ISmtpConfig } from '../models/calendar-config.model';
import { IEvent } from '../models/event.model';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// Attempt to load branding data
let branding: any = { projectName: 'Deenex', urls: { frontend: 'http://localhost:5173' } };
try {
  const brandingPath = path.resolve(__dirname, '../../../../branding.json');
  if (fs.existsSync(brandingPath)) {
    branding = JSON.parse(fs.readFileSync(brandingPath, 'utf8'));
  }
} catch (e) {
  console.warn('Could not load branding.json for emails', e);
}

const LOGIN_CODE_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tu código de acceso - Deenex</title>
</head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 600px;">
          <!-- Header con logo -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: #695EDE; font-size: 28px;">{{PROJECT_NAME}}</h1>
            </td>
          </tr>
          
          <!-- Título -->
          <tr>
            <td style="padding: 0 40px 20px; text-align: center;">
              <h2 style="margin: 0; color: #333; font-size: 24px;">Tu código de acceso</h2>
            </td>
          </tr>
          
          <!-- Mensaje -->
          <tr>
            <td style="padding: 0 40px 30px; text-align: center; color: #666; font-size: 16px; line-height: 1.5;">
              Hola <strong>{{USER_NAME}}</strong>,<br><br>
              Usa el siguiente código para acceder a tu panel de {{PROJECT_NAME}}:
            </td>
          </tr>
          
          <!-- Código destacado -->
          <tr>
            <td style="padding: 0 40px 30px; text-align: center;">
              <div style="background-color: #f8f9fa; border: 2px solid #695EDE; border-radius: 8px; padding: 20px; display: inline-block;">
                <span style="font-size: 36px; font-weight: bold; color: #695EDE; letter-spacing: 8px;">{{CODE}}</span>
              </div>
            </td>
          </tr>
          
          <!-- Expiración -->
          <tr>
            <td style="padding: 0 40px 30px; text-align: center; color: #999; font-size: 14px;">
              Este código expira en <strong>10 minutos</strong>
            </td>
          </tr>
          
          <!-- Seguridad -->
          <tr>
            <td style="padding: 0 40px 40px; text-align: center; color: #999; font-size: 13px; line-height: 1.5;">
              Si no solicitaste este código, puedes ignorar este mensaje.<br>
              Tu cuenta permanece segura.
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8f9fa; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #e0e0e0;">
              © 2026 {{PROJECT_NAME}}. Todos los derechos reservados.<br>
              ¿Necesitas ayuda? <a href="mailto:soporte@deenex.tech" style="color: #695EDE; text-decoration: none;">soporte@deenex.tech</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const WELCOME_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenido a {{PROJECT_NAME}}</title>
</head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 600px;">
          
          <!-- HEADER CON GRADIENTE -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #695EDE 0%, #8B7DE8 100%);">
              <h1 style="margin: 0; color: white; font-size: 32px; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">¡Bienvenido a {{PROJECT_NAME}}!</h1>
            </td>
          </tr>
          
          <!-- SALUDO PERSONALIZADO -->
          <tr>
            <td style="padding: 30px 40px 20px; color: #333; font-size: 16px; line-height: 1.6;">
              Hola <strong style="color: #695EDE;">{{USER_NAME}}</strong>,<br><br>
              
              Te damos la bienvenida al panel de {{PROJECT_NAME}}.<br>
              Tu cuenta ha sido creada exitosamente por <strong>{{ADMIN_TEXT}}</strong>.
            </td>
          </tr>
          
          <!-- CÓMO INICIAR SESIÓN -->
          <tr>
            <td style="padding: 20px 40px;">
              <div style="background-color: #f8f9fa; border-left: 4px solid #695EDE; padding: 20px; border-radius: 5px;">
                <h3 style="margin: 0 0 15px 0; color: #695EDE; font-size: 18px;">🔐 Cómo Iniciar Sesión</h3>
                <p style="margin: 0; color: #666; font-size: 14px; line-height: 1.8;">
                  Para acceder al sistema, sigue estos pasos:<br><br>
                  
                  <strong>1.</strong> Visita: <a href="{{LOGIN_URL}}" style="color: #695EDE; text-decoration: none; font-weight: bold;">{{LOGIN_URL}}</a><br>
                  <strong>2.</strong> Ingresa tu email: <code style="background: #e9e7fa; padding: 4px 8px; border-radius: 3px; color: #695EDE; font-size: 13px;">{{USER_EMAIL}}</code><br>
                  <strong>3.</strong> Haz click en <strong>"Enviar código"</strong><br>
                  <strong>4.</strong> Recibirás un código de 6 dígitos en este email<br>
                  <strong>5.</strong> Ingresa el código para acceder<br><br>
                  
                  💡 <em style="color: #999;">No necesitas contraseña. Cada vez que inicies sesión, te enviaremos un código temporal.</em>
                </p>
              </div>
            </td>
          </tr>
          
          <!-- CALL TO ACTION -->
          <tr>
            <td style="padding: 30px 40px; text-align: center;">
              <a href="{{LOGIN_URL}}" style="display: inline-block; padding: 15px 40px; background-color: #695EDE; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; box-shadow: 0 2px 4px rgba(105,94,222,0.3);">
                Iniciar Sesión Ahora →
              </a>
            </td>
          </tr>
          
          <!-- FOOTER -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8f9fa; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #e0e0e0; line-height: 1.6;">
              Este email fue generado automáticamente.<br>
              Tu cuenta fue creada el <strong>{{CREATED_DATE}}</strong>.<br><br>
              
              © 2026 {{PROJECT_NAME}}. Todos los derechos reservados.<br>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;


const ACCOUNT_DISABLED_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cuenta desactivada - {{PROJECT_NAME}}</title>
</head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 600px;">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: #d32f2f; font-size: 28px;">⚠️ Cuenta Desactivada</h1>
            </td>
          </tr>
          
          <!-- Mensaje -->
          <tr>
            <td style="padding: 0 40px 30px; text-align: center; color: #666; font-size: 16px; line-height: 1.5;">
              Hola <strong>{{USER_NAME}}</strong>,<br><br>
              Tu cuenta de {{PROJECT_NAME}} ha sido desactivada.<br>
              No podrás acceder al panel administrador en este momento.
            </td>
          </tr>
          
          <!-- Icono o imagen -->
          <tr>
            <td style="padding: 0 40px 30px; text-align: center;">
              <div style="background-color: #ffebee; border-radius: 50%; width: 80px; height: 80px; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 48px;">🔒</span>
              </div>
            </td>
          </tr>
          
          <!-- Instrucciones -->
          <tr>
            <td style="padding: 0 40px 30px; text-align: center; color: #666; font-size: 15px; line-height: 1.6;">
              <strong>¿Qué puedes hacer?</strong><br><br>
              Si crees que esto es un error o necesitas recuperar tu acceso,<br>
              por favor contacta a un administrador.
            </td>
          </tr>
          
          <!-- Contacto -->
          <tr>
            <td style="padding: 0 40px 40px; text-align: center;">
              <a href="mailto:soporte@deenex.tech" style="display: inline-block; padding: 12px 30px; background-color: #695EDE; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Contactar Soporte
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8f9fa; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #e0e0e0;">
              © 2026 {{PROJECT_NAME}}. Todos los derechos reservados.<br>
              Email de soporte: <a href="mailto:soporte@deenex.tech" style="color: #695EDE; text-decoration: none;">soporte@deenex.tech</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.hostinger.com',
      port: Number(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER || 'app.sistema@deenex.tech',
        pass: process.env.SMTP_PASS || 'sistemaApp213$$$',
      },
    });
  }

  private maskEmail(email: string): string {
    if (!email || typeof email !== 'string') return 'email@invalid';
    const [localPart, domain] = email.split('@');
    if (!localPart || !domain) return 'email@invalid';
    if (localPart.length <= 2) return `${localPart[0]}***@${domain}`;
    return `${localPart[0]}***${localPart[localPart.length - 1]}@${domain}`;
  }

  async sendOtp(email: string, code: string): Promise<boolean> {
    try {
      console.log(`[emailService] Enviando código a ${this.maskEmail(email)}`);
      const pName = branding.projectName;

      const html = LOGIN_CODE_TEMPLATE
        .replace(/\{\{USER_NAME\}\}/g, email.split('@')[0])
        .replace(/\{\{CODE\}\}/g, code)
        .replace(/\{\{PROJECT_NAME\}\}/g, pName);

      const mailOptions = {
        from: `"${pName} Admin" <${process.env.SMTP_USER || 'app.sistema@deenex.tech'}>`,
        to: email,
        subject: `Tu código de acceso - ${pName}`,
        html
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`[emailService] ✅ Código enviado a ${this.maskEmail(email)}`);
      return true;
    } catch (error: any) {
      console.error(`[emailService] ❌ Error al enviar código:`, error.message);
      return false;
    }
  }

  async sendInvitation(email: string, adminName: string, loginURL: string = 'http://localhost:5173/login'): Promise<boolean> {
    try {
      console.log(`[emailService] Enviando bienvenida a ${this.maskEmail(email)}`);
      const pName = branding.projectName;

      const createdDate = new Date().toLocaleString('es-AR', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      const html = WELCOME_TEMPLATE
        .replace(/\{\{USER_NAME\}\}/g, email.split('@')[0])
        .replace(/\{\{USER_EMAIL\}\}/g, email)
        .replace(/\{\{ADMIN_TEXT\}\}/g, adminName)
        .replace(/\{\{LOGIN_URL\}\}/g, loginURL)
        .replace(/\{\{PROJECT_NAME\}\}/g, pName)
        .replace(/\{\{CREATED_DATE\}\}/g, createdDate);

      const mailOptions = {
        from: `"${pName} Admin" <${process.env.SMTP_USER || 'app.sistema@deenex.tech'}>`,
        to: email,
        subject: `¡Bienvenido a ${pName}! - Tu cuenta ha sido creada`,
        html
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`[emailService] ✅ Email de bienvenida enviado a ${this.maskEmail(email)}`);
      return true;
    } catch (error: any) {
      console.error(`[emailService] ❌ Error al enviar invitación:`, error.message);
      return false;
    }
  }

  // --- New Event Invitation Logic ---

  private getTransporter(smtp?: ISmtpConfig): nodemailer.Transporter {
    if (smtp && smtp.host && smtp.user) {
      return nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure || smtp.port === 465,
        auth: {
          user: smtp.user,
          pass: smtp.pass,
        },
      });
    }
    // Fallback to default system transporter if user hasn't configured SMTP
    return this.transporter;
  }

  private compileEventTemplate(template: string, event: IEvent, locationOrLink: string, contactName: string): string {
    const dateFormatted = format(new Date(event.date), "EEEE d 'de' MMMM, yyyy", { locale: es });
    const timeFormatted = `${event.startTime} hs a ${event.endTime} hs`;

    let compiled = template
      .replace(/\{\{event_title\}\}/g, event.title)
      .replace(/\{\{contact_name\}\}/g, contactName)
      .replace(/\{\{event_date\}\}/g, dateFormatted)
      .replace(/\{\{event_time\}\}/g, timeFormatted)
      .replace(/\{\{event_location_or_link\}\}/g, locationOrLink);

    // Fallbacks just in case the user's template was using the old variables
    compiled = compiled
      .replace(/\{\{eventName\}\}/g, event.title)
      .replace(/\{\{eventDescription\}\}/g, event.description || '')
      .replace(/\{\{eventDate\}\}/g, dateFormatted)
      .replace(/\{\{eventTime\}\}/g, timeFormatted)
      .replace(/\{\{locationDetails\}\}/g, locationOrLink)
      .replace(/\{\{meetLink\}\}/g, event.meetLink || '#');

    return compiled;
  }

  async sendEventInvitations(config: ICalendarConfig | null, event: IEvent): Promise<boolean> {
    try {
      if (!event.attendees || event.attendees.length === 0) {
        return false; // No one to email
      }

      console.log(`[emailService] Enviando invitación de evento a ${event.attendees.length} participantes individuales`);

      const defaultTemplate = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.08);">
          <tr>
            <td style="background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 50px 40px; text-align: center;">
              <div style="background: rgba(255,255,255,0.2); width: 60px; height: 60px; border-radius: 16px; margin: 0 auto 20px auto; line-height: 60px; font-size: 30px;">🗓️</div>
              <h1 style="color: #ffffff; margin: 0 0 10px 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">Tu reunión está confirmada</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 18px; font-weight: 500;">{{event_title}}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 26px; color: #3f3f46;">
                Hola <strong style="color: #18181b;">{{contact_name}}</strong>,<br><br>
                Nos emociona confirmarte nuestra próxima sesión. Hemos reservado este espacio especialmente para ti. A continuación encontrarás todos los detalles que necesitas:
              </p>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 16px; padding: 24px; margin-bottom: 35px; border: 1px solid #e2e8f0;">
                <tr>
                  <td width="40" style="padding-bottom: 20px;">
                    <div style="background: #ffffff; width: 32px; height: 32px; border-radius: 8px; text-align: center; line-height: 32px; font-size: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">📅</div>
                  </td>
                  <td style="padding-bottom: 20px;">
                    <div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Fecha</div>
                    <div style="color: #0f172a; font-size: 16px; font-weight: 600; margin-top: 4px;">{{event_date}}</div>
                  </td>
                </tr>
                <tr>
                  <td width="40" style="padding-bottom: 20px;">
                    <div style="background: #ffffff; width: 32px; height: 32px; border-radius: 8px; text-align: center; line-height: 32px; font-size: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">⏰</div>
                  </td>
                  <td style="padding-bottom: 20px;">
                    <div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Hora</div>
                    <div style="color: #0f172a; font-size: 16px; font-weight: 600; margin-top: 4px;">{{event_time}}</div>
                  </td>
                </tr>
                <tr>
                  <td width="40">
                    <div style="background: #ffffff; width: 32px; height: 32px; border-radius: 8px; text-align: center; line-height: 32px; font-size: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">📍</div>
                  </td>
                  <td>
                    <div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Modalidad / Link</div>
                    <div style="color: #7c3aed; font-size: 16px; font-weight: 600; margin-top: 4px; word-break: break-word;">{{event_location_or_link}}</div>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 15px; line-height: 24px; color: #64748b; text-align: center;">
                Si necesitas reprogramar o tienes alguna duda antes de reunirnos, no dudes en responder directamente a este correo.
              </p>
            </td>
          </tr>
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

      const template = config?.emailTemplate || defaultTemplate;
      const locationOrLink = event.type === 'meet'
        ? `<a href="${event.meetLink}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; margin-bottom: 15px; text-align: center;">Unirse a Google Meet</a><br><span style="color: #64748b; font-size: 13px;">Link directo: <a href="${event.meetLink}" style="color: #7c3aed;">${event.meetLink}</a></span>`
        : (event.location || 'Presencial (Por confirmar)');

      const mailTransporter = this.getTransporter(config?.smtp);
      const senderEmail = config?.smtp?.user || process.env.SMTP_USER || 'app.sistema@deenex.tech';
      const pName = branding.projectName || 'Deenex';

      // Send emails individually so we can greet by name or fallback
      for (const attendeeEmail of event.attendees) {
        // Simple name fallback: "alan.tapia" -> "Alan Tapia"
        let contactName = 'Invitado';
        if (attendeeEmail.includes('@')) {
          const rawName = attendeeEmail.split('@')[0];
          contactName = rawName.split('.').map((part: string) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
        }

        const html = this.compileEventTemplate(template, event, locationOrLink, contactName);

        await mailTransporter.sendMail({
          from: `"${pName} Calendar" <${senderEmail}>`,
          to: attendeeEmail,
          subject: `Invitación Confirmada: ${event.title}`,
          text: `Has sido invitado a ${event.title}. Fecha: ${format(new Date(event.date), 'dd/MM/yyyy')} a las ${event.startTime}.`,
          html: html,
        });
      }

      console.log(`[emailService] ✅ Invitaciones enviadas para el evento ${event.title}`);
      return true;
    } catch (error: any) {
      console.error(`[emailService] ❌ Error al enviar invitaciones de evento: `, error.message);
      return false;
    }
  }
}

export const emailService = new EmailService();

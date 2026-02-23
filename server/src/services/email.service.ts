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

  private compileEventTemplate(template: string, event: IEvent, locationType: string, locationDetails: string): string {
    const dateFormatted = format(new Date(event.date), "EEEE d 'de' MMMM, yyyy", { locale: es });
    const timeFormatted = `${event.startTime} hs a ${event.endTime} hs`;

    let compiled = template
      .replace(/\{\{eventName\}\}/g, event.title)
      .replace(/\{\{eventDescription\}\}/g, event.description || '')
      .replace(/\{\{eventDate\}\}/g, dateFormatted)
      .replace(/\{\{eventTime\}\}/g, timeFormatted)
      .replace(/\{\{locationType\}\}/g, locationType)
      .replace(/\{\{locationDetails\}\}/g, locationDetails)
      .replace(/\{\{meetLink\}\}/g, event.meetLink || '#');

    return compiled;
  }

  async sendEventInvitations(config: ICalendarConfig | null, event: IEvent): Promise<boolean> {
    try {
      if (!event.attendees || event.attendees.length === 0) {
        return false; // No one to email
      }

      console.log(`[emailService] Enviando invitación de evento a ${event.attendees.length} participantes`);

      const defaultTemplate = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #695EDE;">Has sido invitado a {{eventName}}</h2>
          <p>{{eventDescription}}</p>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 20px;">
            <p><strong>📅 Fecha:</strong> {{eventDate}}</p>
            <p><strong>⏰ Hora:</strong> {{eventTime}}</p>
            <p><strong>📍 Ubicación:</strong> {{locationType}} - {{locationDetails}}</p>
          </div>
        </div>
      `;

      const template = config?.emailTemplate || defaultTemplate;
      const locationType = event.type === 'meet' ? 'Videollamada (Google Meet)' : 'Presencial';
      const locationDetails = event.type === 'meet'
        ? `<a href="${event.meetLink}" style="color: #695EDE;">${event.meetLink}</a>`
        : (event.location || 'Por confirmar');

      const html = this.compileEventTemplate(template, event, locationType, locationDetails);
      const mailTransporter = this.getTransporter(config?.smtp);
      const senderEmail = config?.smtp?.user || process.env.SMTP_USER || 'app.sistema@deenex.tech';

      const pName = branding.projectName || 'Deenex';

      await mailTransporter.sendMail({
        from: `"${pName} Calendar" <${senderEmail}>`,
        to: event.attendees.join(', '), // Send to all attendees
        subject: `Invitación: ${event.title}`,
        text: `Has sido invitado a ${event.title}. Fecha: ${format(new Date(event.date), 'dd/MM/yyyy')} a las ${event.startTime}.`,
        html: html,
      });

      console.log(`[emailService] ✅ Invitaciones enviadas para el evento ${event.title}`);
      return true;
    } catch (error: any) {
      console.error(`[emailService] ❌ Error al enviar invitaciones de evento:`, error.message);
      return false;
    }
  }
}

export const emailService = new EmailService();

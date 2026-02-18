#!/usr/bin/env python3
"""
Telegram Bot Bridge para Kimi CLI
Conecta Telegram con Kimi CLI para ejecutar prompts desde el móvil
"""

import os
import sys
import subprocess
import asyncio
import logging
from pathlib import Path
from dotenv import load_dotenv

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

# Configurar logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# Cargar variables de entorno
load_dotenv()

# Configuración mutable (para poder cambiar workdir en runtime)
CONFIG = {
    "TELEGRAM_BOT_TOKEN": os.getenv("TELEGRAM_BOT_TOKEN"),
    "ALLOWED_USER_IDS": [uid.strip() for uid in os.getenv("ALLOWED_USER_IDS", "").split(",") if uid.strip()],
    "KIMI_WORK_DIR": os.getenv("KIMI_WORK_DIR", "/Users/alannaimtapia/Desktop/Programacion/voice"),
}

# Referencias para compatibilidad
TELEGRAM_BOT_TOKEN = CONFIG["TELEGRAM_BOT_TOKEN"]
ALLOWED_USER_IDS = CONFIG["ALLOWED_USER_IDS"]
KIMI_WORK_DIR = CONFIG["KIMI_WORK_DIR"]


def is_authorized(user_id: int) -> bool:
    """Verifica si el usuario está autorizado"""
    return str(user_id) in ALLOWED_USER_IDS


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handler para /start"""
    user_id = update.effective_user.id
    
    if not is_authorized(user_id):
        await update.message.reply_text("⛔ No autorizado")
        return
    
    welcome_message = f"""
🤖 <b>Kimi Telegram Bridge</b>

¡Hola {update.effective_user.first_name}!

Este bot te permite interactuar con Kimi CLI directamente desde Telegram.

<b>Comandos disponibles:</b>
• /help - Muestra ayuda
• /status - Estado del bot y directorio de trabajo
• /workdir &lt;ruta&gt; - Cambia el directorio de trabajo
• /reset - Resetea la conversación

<b>Uso:</b>
Envía cualquier mensaje y lo ejecutaré con Kimi CLI.

<b>Directorio actual:</b> <code>{CONFIG['KIMI_WORK_DIR']}</code>
"""
    await update.message.reply_text(welcome_message, parse_mode="HTML")


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handler para /help"""
    user_id = update.effective_user.id
    
    if not is_authorized(user_id):
        await update.message.reply_text("⛔ No autorizado")
        return
    
    help_text = """
📖 <b>Ayuda de Kimi Telegram Bridge</b>

<b>Comandos:</b>
• /start - Inicia el bot
• /help - Muestra esta ayuda
• /status - Estado del sistema
• /workdir &lt;ruta&gt; - Cambia directorio de trabajo
• /reset - Limpia el historial

<b>Ejemplos de uso:</b>
<code>Revisa el archivo server/src/app.ts y dime qué hace</code>

<code>Crea un nuevo endpoint POST /api/users en el backend</code>

<code>Arregla el error en el componente Login.tsx</code>

<b>Notas:</b>
• Los comandos se ejecutan en: <code>{workdir}</code>
• Timeout: 5 minutos
• Máximo 4000 caracteres por mensaje
""".format(workdir=CONFIG['KIMI_WORK_DIR'])
    
    await update.message.reply_text(help_text, parse_mode="HTML")


async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handler para /status"""
    user_id = update.effective_user.id
    
    if not is_authorized(user_id):
        await update.message.reply_text("⛔ No autorizado")
        return
    
    # Verificar que Kimi CLI está instalado
    kimi_installed = False
    kimi_version = "No disponible"
    
    try:
        result = subprocess.run(
            ["kimi", "--version"],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            kimi_installed = True
            kimi_version = result.stdout.strip()
    except Exception:
        pass
    
    # Verificar directorio de trabajo
    workdir_exists = Path(CONFIG['KIMI_WORK_DIR']).exists()
    
    status_text = f"""
📊 <b>Estado del Sistema</b>

<b>Bot:</b> ✅ En línea
<b>Usuario:</b> {user_id}
<b>Autorizado:</b> ✅

<b>Kimi CLI:</b> {"✅ " + kimi_version if kimi_installed else "❌ No instalado"}
<b>Directorio trabajo:</b> <code>{CONFIG['KIMI_WORK_DIR']}</code>
<b>Dir existe:</b> {"✅" if workdir_exists else "❌ No existe"}

<b>Modo:</b> Basic (sin MCP)
"""
    await update.message.reply_text(status_text, parse_mode="HTML")


async def workdir_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handler para /workdir - Cambia el directorio de trabajo"""
    user_id = update.effective_user.id
    
    if not is_authorized(user_id):
        await update.message.reply_text("⛔ No autorizado")
        return
    
    args = context.args
    if not args:
        await update.message.reply_text(
            f"📁 <b>Directorio actual:</b> <code>{CONFIG['KIMI_WORK_DIR']}</code>\n\n"
            "Para cambiar: <code>/workdir /ruta/nueva</code>",
            parse_mode="HTML"
        )
        return
    
    new_path = args[0]
    
    # Validar que la ruta existe
    if not Path(new_path).exists():
        await update.message.reply_text(
            f"❌ La ruta no existe: <code>{new_path}</code>",
            parse_mode="HTML"
        )
        return
    
    CONFIG["KIMI_WORK_DIR"] = new_path
    os.environ["KIMI_WORK_DIR"] = new_path
    
    await update.message.reply_text(
        f"✅ <b>Directorio actualizado:</b> <code>{CONFIG['KIMI_WORK_DIR']}</code>",
        parse_mode="HTML"
    )


async def reset_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handler para /reset - Limpia el historial de conversación"""
    user_id = update.effective_user.id
    
    if not is_authorized(user_id):
        await update.message.reply_text("⛔ No autorizado")
        return
    
    # Limpiar cualquier estado guardado
    if "conversation_history" in context.user_data:
        context.user_data["conversation_history"] = []
    
    await update.message.reply_text(
        "🔄 <b>Conversación reseteada</b>\n\n"
        "El historial ha sido limpiado. Empezamos de nuevo.",
        parse_mode="HTML"
    )


async def execute_kimi(prompt: str, work_dir: str) -> tuple[bool, str]:
    """
    Ejecuta Kimi CLI con el prompt dado
    
    Returns:
        tuple: (success: bool, output: str)
    """
    try:
        # Construir el comando
        command = ["kimi", "-c", prompt]
        
        logger.info(f"Ejecutando Kimi en {work_dir}: {prompt[:100]}...")
        
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=300,  # 5 minutos timeout
            cwd=work_dir,
            shell=False   # Seguridad: no usar shell
        )
        
        if result.returncode == 0:
            return True, result.stdout
        else:
            return False, f"Error (código {result.returncode}):\n{result.stderr}"
            
    except subprocess.TimeoutExpired:
        return False, "⏱️ Timeout: La operación tomó más de 5 minutos"
    except FileNotFoundError:
        return False, "❌ Kimi CLI no encontrado. ¿Está instalado?"
    except Exception as e:
        return False, f"❌ Error: {str(e)}"


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handler principal para mensajes de texto"""
    user_id = update.effective_user.id
    
    if not is_authorized(user_id):
        await update.message.reply_text("⛔ No autorizado")
        return
    
    message_text = update.message.text
    
    # Validaciones de seguridad
    if len(message_text) > 4000:
        await update.message.reply_text(
            "❌ Mensaje demasiado largo (máx 4000 caracteres)"
        )
        return
    
    if len(message_text) < 10:
        await update.message.reply_text(
            "❌ Mensaje demasiado corto (mín 10 caracteres)"
        )
        return
    
    # Verificar que no contiene caracteres peligrosos
    dangerous_chars = [';', '&&', '||', '`', '$(']
    for char in dangerous_chars:
        if char in message_text:
            await update.message.reply_text(
                f"❌ Caracter no permitido detectado: <code>{char}</code>",
                parse_mode="HTML"
            )
            return
    
    # Mostrar que estamos procesando
    processing_msg = await update.message.reply_text(
        "🤔 <i>Pensando...</i>",
        parse_mode="HTML"
    )
    
    # Ejecutar Kimi
    success, output = await execute_kimi(message_text, CONFIG['KIMI_WORK_DIR'])
    
    # Borrar mensaje de procesamiento
    await processing_msg.delete()
    
    if success:
        # Truncar si es muy largo (Telegram límite: 4096)
        if len(output) > 4000:
            output = output[:3997] + "..."
        
        await update.message.reply_text(
            f"✅ <b>Respuesta:</b>\n\n<pre>{output}</pre>",
            parse_mode="HTML"
        )
    else:
        await update.message.reply_text(
            f"❌ <b>Error:</b>\n\n<pre>{output}</pre>",
            parse_mode="HTML"
        )


async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Maneja errores del bot"""
    logger.error(f"Error: {context.error}")
    
    if update and update.effective_message:
        await update.effective_message.reply_text(
            "❌ Ocurrió un error interno. Por favor intenta de nuevo."
        )


def main() -> None:
    """Función principal"""
    
    # Validar configuración
    if not TELEGRAM_BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN no configurado")
        sys.exit(1)
    
    if not ALLOWED_USER_IDS:
        logger.error("ALLOWED_USER_IDS no configurado")
        sys.exit(1)
    
    logger.info(f"Bot iniciando...")
    logger.info(f"Work dir: {CONFIG['KIMI_WORK_DIR']}")
    logger.info(f"Usuarios autorizados: {ALLOWED_USER_IDS}")
    
    # Crear aplicación
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    
    # Añadir handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("status", status_command))
    application.add_handler(CommandHandler("workdir", workdir_command))
    application.add_handler(CommandHandler("reset", reset_command))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    
    # Manejador de errores
    application.add_error_handler(error_handler)
    
    # Iniciar el bot
    logger.info("Bot listo! Esperando mensajes...")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()

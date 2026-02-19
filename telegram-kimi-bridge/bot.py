#!/usr/bin/env python3
"""
Telegram Bot Bridge para Kimi CLI - Versión 2.0 con Personalidad Cálida y Memoria

Características:
• Mensajes cálidos y profesionales
• Memoria persistente de conversaciones y preferencias
• Contexto enriquecido para Kimi CLI
• Saludos contextuales según hora del día
"""

import os
import sys
import subprocess
import asyncio
import logging
import time
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

# Importar nuestros módulos
from bot_messages import BotMessages, BotPersonality, build_kimi_personality_prompt
from memory_engine import MemoryEngine, get_memory_engine, UserContext
from persona_compact import CompactKimiPersonaBuilder, create_compact_persona_builder
from persona import PreferenceExtractor  # Mantener compatibilidad

# Configurar logging
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# Cargar variables de entorno
load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
ALLOWED_USER_IDS = os.getenv("ALLOWED_USER_IDS", "").split(",")
KIMI_WORK_DIR = os.getenv("KIMI_WORK_DIR", "/Users/alannaimtapia/Desktop/Programacion/voice")
MEMORY_DB_PATH = os.getenv("MEMORY_DB_PATH", "bot_memory.db")

# Limpiar y validar user IDs
ALLOWED_USER_IDS = [uid.strip() for uid in ALLOWED_USER_IDS if uid.strip()]


class KimiTelegramBot:
    """
    Bot de Telegram con personalidad cálida y memoria avanzada.
    """
    
    def __init__(self):
        self.work_dir = KIMI_WORK_DIR
        self.memory = get_memory_engine(MEMORY_DB_PATH)
        self.persona_builder = create_compact_persona_builder(self.memory)
        self.app = None
    
    def is_authorized(self, user_id: int) -> bool:
        """Verifica si el usuario está autorizado"""
        return str(user_id) in ALLOWED_USER_IDS
    
    def get_user_context(self, user_id: int) -> UserContext:
        """Obtiene el contexto del usuario desde la memoria"""
        return self.memory.get_user_context(user_id)
    
    # ============ HANDLERS DE COMANDOS ============
    
    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handler para /start"""
        user_id = update.effective_user.id
        
        if not self.is_authorized(user_id):
            await update.message.reply_text(
                BotMessages.unauthorized(),
                parse_mode="HTML"
            )
            return
        
        user_name = update.effective_user.first_name or "amigo"
        
        # Guardar preferencia de nombre si es nuevo usuario
        user_ctx = self.get_user_context(user_id)
        if not user_ctx.preferences.get("preferred_name"):
            self.memory.update_preferences(user_id, preferred_name=user_name)
        
        welcome_msg = BotMessages.welcome(user_name, self.work_dir)
        await update.message.reply_text(welcome_msg, parse_mode="HTML")
    
    async def help_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handler para /help"""
        user_id = update.effective_user.id
        
        if not self.is_authorized(user_id):
            await update.message.reply_text(
                BotMessages.unauthorized(),
                parse_mode="HTML"
            )
            return
        
        help_msg = BotMessages.help_message(self.work_dir)
        await update.message.reply_text(help_msg, parse_mode="HTML")
    
    async def status_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handler para /status"""
        user_id = update.effective_user.id
        
        if not self.is_authorized(user_id):
            await update.message.reply_text(
                BotMessages.unauthorized(),
                parse_mode="HTML"
            )
            return
        
        # Verificar Kimi CLI
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
        
        # Verificar directorio
        workdir_exists = Path(self.work_dir).exists()
        
        # Obtener estadísticas de memoria
        user_ctx = self.get_user_context(user_id)
        
        status_msg = BotMessages.status(
            kimi_installed=kimi_installed,
            kimi_version=kimi_version,
            work_dir=self.work_dir,
            workdir_exists=workdir_exists,
            user_id=user_id,
            memory_count=user_ctx.interaction_count
        )
        
        await update.message.reply_text(status_msg, parse_mode="HTML")
    
    async def workdir_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handler para /workdir"""
        user_id = update.effective_user.id
        
        if not self.is_authorized(user_id):
            await update.message.reply_text(
                BotMessages.unauthorized(),
                parse_mode="HTML"
            )
            return
        
        args = context.args
        if not args:
            # Mostrar directorio actual
            await update.message.reply_text(
                BotMessages.workdir_current(self.work_dir),
                parse_mode="HTML"
            )
            return
        
        new_path = args[0]
        
        # Validar ruta
        if not Path(new_path).exists():
            await update.message.reply_text(
                BotMessages.workdir_error(new_path),
                parse_mode="HTML"
            )
            return
        
        # Actualizar directorio
        self.work_dir = new_path
        os.environ["KIMI_WORK_DIR"] = new_path
        
        await update.message.reply_text(
            BotMessages.workdir_changed(new_path),
            parse_mode="HTML"
        )
    
    async def reset_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handler para /reset"""
        user_id = update.effective_user.id
        
        if not self.is_authorized(user_id):
            await update.message.reply_text(
                BotMessages.unauthorized(),
                parse_mode="HTML"
            )
            return
        
        # Limpiar datos de contexto del usuario
        if "conversation_history" in context.user_data:
            context.user_data["conversation_history"] = []
        
        await update.message.reply_text(
            BotMessages.reset_success(),
            parse_mode="HTML"
        )
    
    async def memory_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handler para /memory - Muestra lo que recuerda del usuario"""
        user_id = update.effective_user.id
        
        if not self.is_authorized(user_id):
            await update.message.reply_text(
                BotMessages.unauthorized(),
                parse_mode="HTML"
            )
            return
        
        user_ctx = self.get_user_context(user_id)
        
        # Si es nuevo usuario
        if user_ctx.interaction_count == 0:
            await update.message.reply_text(
                f"🌟 <b>Aún no tengo recuerdos de ti</b>\n\n"
                f"Cuando empecemos a conversar, iré guardando nuestras interacciones "
                f"para poder ayudarte mejor cada vez.\n\n"
                f"¡Envíame tu primera pregunta!",
                parse_mode="HTML"
            )
            return
        
        memory_msg = BotMessages.memory_summary(user_ctx.to_dict())
        await update.message.reply_text(memory_msg, parse_mode="HTML")
    
    async def preferences_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handler para /preferences"""
        user_id = update.effective_user.id
        
        if not self.is_authorized(user_id):
            await update.message.reply_text(
                BotMessages.unauthorized(),
                parse_mode="HTML"
            )
            return
        
        user_ctx = self.get_user_context(user_id)
        prefs = user_ctx.preferences
        
        pref_text = f"""
⚙️ <b>Tus Preferencias</b>

<b>Nombre:</b> {prefs.get('preferred_name', 'No configurado')}
<b>Stack técnico:</b> {', '.join(prefs.get('tech_stack', [])) or 'No configurado'}
<b>Estilo de código:</b> {prefs.get('code_style', 'No configurado')}
<b>Estilo de comunicación:</b> {prefs.get('communication_style', 'casual')}

<b>Para actualizar:</b>
• "Llámame [tu nombre]"
• "Trabajo con [tecnologías]"
• "Prefiero un estilo [formal/casual/técnico]"
"""
        await update.message.reply_text(pref_text, parse_mode="HTML")
    
    # ============ MANEJO DE MENSAJES ============
    
    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handler principal para mensajes de texto"""
        user_id = update.effective_user.id
        
        if not self.is_authorized(user_id):
            await update.message.reply_text(
                BotMessages.unauthorized(),
                parse_mode="HTML"
            )
            return
        
        message_text = update.message.text
        user_name = update.effective_user.first_name or "amigo"
        
        # Validaciones
        if len(message_text) > 4000:
            await update.message.reply_text(
                BotMessages.message_too_long(),
                parse_mode="HTML"
            )
            return
        
        if len(message_text) < 10:
            await update.message.reply_text(
                BotMessages.message_too_short(),
                parse_mode="HTML"
            )
            return
        
        # Validar caracteres peligrosos
        dangerous_chars = [';', '&&', '||', '`', '$(']
        for char in dangerous_chars:
            if char in message_text:
                await update.message.reply_text(
                    BotMessages.dangerous_input(char),
                    parse_mode="HTML"
                )
                return
        
        # Extraer preferencias del mensaje
        detected_prefs = PreferenceExtractor.extract_from_message(message_text)
        if detected_prefs:
            self.memory.update_preferences(user_id, **detected_prefs)
            await update.message.reply_text(
                BotMessages.preferences_updated(),
                parse_mode="HTML"
            )
        
        # Obtener contexto del usuario
        user_ctx = self.get_user_context(user_id)
        
        # Obtener timeout y mensaje de progreso
        timeout = self.persona_builder.get_timeout(message_text)
        progress_msg = self.persona_builder.get_progress_message(message_text)
        
        # Mostrar mensaje de procesamiento
        processing_msg = await update.message.reply_text(
            f"🤔 {progress_msg}",
            parse_mode="HTML"
        )
        
        # Construir prompt simple y directo
        enhanced_prompt = self.persona_builder.build_prompt(user_ctx, message_text)
        
        # Ejecutar Kimi con timeout adaptativo
        start_time = time.time()
        success, output = await self.execute_kimi(enhanced_prompt, self.work_dir, timeout=timeout)
        execution_time = int((time.time() - start_time) * 1000)
        
        # Borrar mensaje de procesamiento
        await processing_msg.delete()
        
        # Registrar interacción en memoria
        self.memory.record_interaction(
            user_id=user_id,
            message=message_text,
            response=output[:1000] if success else "",  # Guardar resumen
            success=success,
            execution_time_ms=execution_time,
            work_dir=self.work_dir,
            tags=self._extract_tags(message_text)
        )
        
        # Enviar respuesta
        if success:
            # Truncar si es muy largo
            if len(output) > 4000:
                output = output[:3997] + "..."
            
            await update.message.reply_text(
                BotMessages.success_response(output),
                parse_mode="HTML"
            )
        else:
            await update.message.reply_text(
                BotMessages.error_response(output),
                parse_mode="HTML"
            )
    
    async def execute_kimi(self, prompt: str, work_dir: str, timeout: int = 300) -> tuple[bool, str]:
        """
        Ejecuta Kimi CLI con el prompt dado.
        
        Args:
            prompt: El prompt a enviar a Kimi
            work_dir: Directorio de trabajo
            timeout: Timeout en segundos (default: 300 = 5 min)
        """
        try:
            # Usar --no-thinking para evitar que muestre el razonamiento interno
            command = ["kimi", "--no-thinking", "-c", prompt]
            
            logger.info(f"Ejecutando Kimi en {work_dir} (timeout={timeout}s): {prompt[:100]}...")
            
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=work_dir,
                shell=False
            )
            
            if result.returncode == 0:
                return True, result.stdout
            else:
                return False, f"Error (código {result.returncode}):\n{result.stderr}"
                
        except subprocess.TimeoutExpired:
            mins = timeout // 60
            return False, f"⏱️ Timeout: La operación tomó más de {mins} minutos. Intenta con una consulta más específica o dividida en partes."
        except FileNotFoundError:
            return False, "❌ Kimi CLI no encontrado. ¿Está instalado?"
        except Exception as e:
            return False, f"❌ Error: {str(e)}"
    
    def _extract_tags(self, message: str) -> list:
        """Extrae tags del mensaje para categorización"""
        tags = []
        message_lower = message.lower()
        
        if any(kw in message_lower for kw in ["revisa", "analiza", "mira"]):
            tags.append("review")
        if any(kw in message_lower for kw in ["arregla", "error", "bug", "problema"]):
            tags.append("bugfix")
        if any(kw in message_lower for kw in ["crea", "nuevo", "implementa", "agrega"]):
            tags.append("feature")
        if any(kw in message_lower for kw in ["optimiza", "mejora", "refactor"]):
            tags.append("refactor")
        if any(kw in message_lower for kw in ["explica", "cómo", "qué es"]):
            tags.append("learning")
        
        return tags
    
    async def error_handler(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Maneja errores del bot"""
        logger.error(f"Error: {context.error}")
        
        if update and update.effective_message:
            await update.effective_message.reply_text(
                f"{BotPersonality.ERROR} Ups, algo salió mal internamente. "
                f"¿Podrías intentar de nuevo? Si el problema persiste, contacta al admin.",
                parse_mode="HTML"
            )
    
    # ============ INICIO DEL BOT ============
    
    def run(self):
        """Inicia el bot"""
        # Validar configuración
        if not TELEGRAM_BOT_TOKEN:
            logger.error("TELEGRAM_BOT_TOKEN no configurado")
            sys.exit(1)
        
        if not ALLOWED_USER_IDS:
            logger.error("ALLOWED_USER_IDS no configurado")
            sys.exit(1)
        
        logger.info("🤖 Bot iniciando...")
        logger.info(f"📁 Work dir: {self.work_dir}")
        logger.info(f"🧠 Memory DB: {MEMORY_DB_PATH}")
        logger.info(f"👥 Usuarios autorizados: {ALLOWED_USER_IDS}")
        
        # Crear aplicación
        self.app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
        
        # Añadir handlers
        self.app.add_handler(CommandHandler("start", self.start))
        self.app.add_handler(CommandHandler("help", self.help_command))
        self.app.add_handler(CommandHandler("status", self.status_command))
        self.app.add_handler(CommandHandler("workdir", self.workdir_command))
        self.app.add_handler(CommandHandler("reset", self.reset_command))
        self.app.add_handler(CommandHandler("memory", self.memory_command))
        self.app.add_handler(CommandHandler("preferences", self.preferences_command))
        self.app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_message))
        
        # Manejador de errores
        self.app.add_error_handler(self.error_handler)
        
        # Iniciar
        logger.info("✨ Bot listo! Esperando mensajes...")
        self.app.run_polling(allowed_updates=Update.ALL_TYPES)


def main():
    """Punto de entrada principal"""
    bot = KimiTelegramBot()
    bot.run()


if __name__ == "__main__":
    main()

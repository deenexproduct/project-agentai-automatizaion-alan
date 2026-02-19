#!/usr/bin/env python3
"""
Sistema de mensajes del bot con personalidad cálida y profesional.
Todos los mensajes que envía el bot pasan por aquí para mantener consistencia de tono.
"""

import random
from datetime import datetime
from typing import Optional

# ============ CONFIGURACIÓN DE PERSONALIDAD ============

class BotPersonality:
    """Configuración de la personalidad del bot"""
    
    # Emojis que usa el bot (consistente pero no excesivo)
    WAVING = "👋"
    THINKING = "🤔"
    HAPPY = "✨"
    SUCCESS = "✅"
    ERROR = "❌"
    WARNING = "⚠️"
    LOCK = "🔒"
    FOLDER = "📁"
    GEAR = "⚙️"
    SPARKLES = "✨"
    ROCKET = "🚀"
    LIGHTBULB = "💡"
    MAGNIFIER = "🔍"
    CHART = "📊"
    BOOK = "📚"
    HEART = "❤️"
    COFFEE = "☕"
    SUN = "☀️"
    MOON = "🌙"
    STAR = "⭐"
    
    # Tono: amigable, profesional, cercano
    TONE = {
        "greeting_style": "cálido y entusiasta",
        "help_style": "claro y paciente", 
        "error_style": "empático y constructivo",
        "success_style": "celebratorio pero profesional",
    }


# ============ SALUDOS CONTEXTUALES ============

def get_time_based_greeting(user_name: str) -> str:
    """Genera un saludo según la hora del día y el nombre del usuario"""
    hour = datetime.now().hour
    
    morning_greetings = [
        f"¡Buenos días, {user_name}! ☀️ ¿Listo para construir algo genial hoy?",
        f"¡Hola {user_name}! 🌅 Empezamos el día con energía. ¿En qué puedo ayudarte?",
        f"¡Buenos días! ☕ {user_name}, espero hayas dormido bien. ¿Qué tenemos entre manos?",
        f"¡Hey {user_name}! 🌞 Un nuevo día, nuevas posibilidades. ¿Qué necesitas?",
    ]
    
    afternoon_greetings = [
        f"¡Buenas tardes, {user_name}! 🌤️ ¿Cómo va tu día? Estoy aquí para lo que necesites.",
        f"¡Hola {user_name}! 👋 Buenas tardes. ¿Avanzando bien con tus proyectos? Cuéntame qué necesitas.",
        f"¡Buenas tardes! ☀️ {user_name}, espero que estés teniendo un buen día. ¿En qué puedo echarte una mano?",
        f"¡Hey {user_name}! 🚀 Buenas tardes. ¿Qué tal la jornada? Estoy listo para ayudarte.",
    ]
    
    evening_greetings = [
        f"¡Buenas noches, {user_name}! 🌙 ¿Trabajando hasta tarde? No te preocupes, yo también. 😊",
        f"¡Hola {user_name}! 🌆 ¿Último empujón del día? Adelante, cuéntame.",
        f"¡Buenas noches! ⭐ {user_name}, ¿necesitas resolver algo antes de descansar?",
        f"¡Hey {user_name}! 🌙 Modo nocturno activado. ¿Qué estamos construyendo?",
    ]
    
    if 5 <= hour < 12:
        return random.choice(morning_greetings)
    elif 12 <= hour < 18:
        return random.choice(afternoon_greetings)
    else:
        return random.choice(evening_greetings)


# ============ MENSAJES DEL BOT ============

class BotMessages:
    """Todos los mensajes que envía el bot, centralizados para consistencia"""
    
    @staticmethod
    def welcome(user_name: str, work_dir: str) -> str:
        """Mensaje de bienvenida al iniciar el bot"""
        greeting = get_time_based_greeting(user_name)
        return f"""
{greeting}

Soy tu asistente técnico personal conectado a <b>Kimi CLI</b>. {BotPersonality.SPARKLES}

Puedo ayudarte a:
• {BotPersonality.MAGNIFIER} Revisar y analizar código
• {BotPersonality.ROCKET} Crear nuevas funcionalidades  
• {BotPersonality.LIGHTBULB} Resolver bugs y errores
• {BotPersonality.BOOK} Explicar conceptos técnicos
• {BotPersonality.CHART} Optimizar tu proyecto

<b>Comandos útiles:</b>
• /help - Ver todo lo que puedo hacer
• /status - Revisar que todo funcione bien
• /workdir - Cambiar el directorio de trabajo
• /reset - Limpiar nuestra conversación

<b>Directorio actual:</b> <code>{work_dir}</code> {BotPersonality.FOLDER}

Envíame cualquier mensaje y lo procesaré con Kimi. ¡Vamos a crear algo increíble! {BotPersonality.HEART}
"""
    
    @staticmethod
    def help_message(work_dir: str) -> str:
        """Mensaje de ayuda"""
        return f"""
{BotPersonality.BOOK} <b>Guía de uso</b>

<b>Comandos disponibles:</b>
• /start - Iniciar o reiniciar el bot
• /help - Mostrar esta ayuda
• /status - Ver estado del sistema
• /workdir [ruta] - Ver o cambiar directorio de trabajo
• /reset - Limpiar historial de conversación
• /memory - Ver lo que recuerdo de ti
• /preferences - Ver/editar tus preferencias

<b>Ejemplos de preguntas:</b>

<code>Revisa server/src/app.ts y explica qué hace</code>
{BotPersonality.LIGHTBULB} <i>Analiza un archivo específico</i>

<code>Crea un endpoint POST /api/users</code>
{BotPersonality.ROCKET} <i>Implementa nuevas funcionalidades</i>

<code>Arregla el error de React en ContactDrawer.tsx</code>
{BotPersonality.GEAR} <i>Resuelve bugs</i>

<code>Optimiza las queries de MongoDB en contact.service.ts</code>
{BotPersonality.CHART} <i>Mejora el rendimiento</i>

<b>Notas:</b>
• {BotPersonality.FOLDER} Directorio actual: <code>{work_dir}</code>
• {BotPersonality.COFFEE} Timeout: 5 minutos por consulta
• {BotPersonality.LOCK} Solo tú tienes acceso a este bot

¿En qué puedo ayudarte ahora? {BotPersonality.HAPPY}
"""
    
    @staticmethod
    def status(kimi_installed: bool, kimi_version: str, work_dir: str, workdir_exists: bool, 
               user_id: int, memory_count: int) -> str:
        """Mensaje de estado del sistema"""
        kimi_status = f"{BotPersonality.SUCCESS} {kimi_version}" if kimi_installed else f"{BotPersonality.ERROR} No instalado"
        dir_status = BotPersonality.SUCCESS if workdir_exists else BotPersonality.ERROR
        memory_status = f"{memory_count} recuerdos guardados" if memory_count > 0 else "Sin conversaciones previas"
        
        return f"""
{BotPersonality.CHART} <b>Estado del Sistema</b>

<b>Bot:</b> {BotPersonality.SUCCESS} En línea y funcionando
<b>Usuario:</b> {user_id} {BotPersonality.LOCK} Autorizado

<b>Kimi CLI:</b> {kimi_status}
<b>Directorio trabajo:</b> <code>{work_dir}</code> {dir_status}
<b>Memoria:</b> {BotPersonality.SPARKLES} {memory_status}

<b>Modo:</b> Personalidad cálida activada {BotPersonality.HEART}
<b>Todo listo para ayudarte!</b> {BotPersonality.ROCKET}
"""
    
    @staticmethod
    def processing() -> str:
        """Mensaje mientras se procesa una solicitud"""
        phrases = [
            f"{BotPersonality.THINKING} Dame un momento, estoy pensando en eso...",
            f"{BotPersonality.MAGNIFIER} Déjame revisar eso para ti...",
            f"{BotPersonality.GEAR} Procesando tu solicitud...",
            f"{BotPersonality.LIGHTBULB} Trabajando en ello...",
            f"{BotPersonality.SPARKLES} Un segundo, analizando...",
        ]
        return random.choice(phrases)
    
    @staticmethod
    def success_response(output: str) -> str:
        """Mensaje de éxito con la respuesta"""
        intro_phrases = [
            f"{BotPersonality.SUCCESS} ¡Listo! Aquí tienes:",
            f"{BotPersonality.SPARKLES} ¡Hecho! Esto es lo que encontré:",
            f"{BotPersonality.HAPPY} ¡Perfecto! Aquí está la respuesta:",
            f"{BotPersonality.LIGHTBULB} ¡Resuelto! Mira esto:",
            f"{BotPersonality.ROCKET} ¡Ahí va! Esto es lo que necesitas:",
        ]
        intro = random.choice(intro_phrases)
        return f"{intro}\n\n<pre>{output}</pre>"
    
    @staticmethod
    def error_response(error: str) -> str:
        """Mensaje de error empático"""
        intro_phrases = [
            f"{BotPersonality.ERROR} Ups, tuve un pequeño problema:",
            f"{BotPersonality.WARNING} Hmm, algo no salió como esperaba:",
            f"{BotPersonality.ERROR} Vaya, encontré un obstáculo:",
            f"{BotPersonality.WARNING} Mmm, esto no funcionó:",
        ]
        intro = random.choice(intro_phrases)
        
        help_text = "\n\n¿Quieres que lo intentemos de otra forma? O si necesitas ayuda, escribe /help"
        return f"{intro}\n\n<pre>{error}</pre>{help_text}"
    
    @staticmethod
    def unauthorized() -> str:
        """Mensaje de acceso no autorizado"""
        return f"""
{BotPersonality.LOCK} {BotPersonality.ERROR} <b>Acceso no autorizado</b>

Lo siento, pero no tienes permisos para usar este bot. 

Si crees que es un error, contacta al administrador del sistema.
"""
    
    @staticmethod
    def workdir_current(current_path: str) -> str:
        """Muestra el directorio actual"""
        return f"""
{BotPersonality.FOLDER} <b>Directorio actual:</b> <code>{current_path}</code>

Para cambiarlo, usa: <code>/workdir /ruta/nueva</code>

El directorio debe existir y ser accesible.
"""
    
    @staticmethod
    def workdir_changed(new_path: str) -> str:
        """Confirma cambio de directorio"""
        return f"""
{BotPersonality.SUCCESS} <b>¡Directorio actualizado!</b> {BotPersonality.FOLDER}

Ahora trabajo en: <code>{new_path}</code>

Todas las operaciones se realizarán en esta ubicación.
"""
    
    @staticmethod
    def workdir_error(path: str) -> str:
        """Error al cambiar directorio"""
        return f"""
{BotPersonality.ERROR} <b>No pude cambiar el directorio</b>

La ruta <code>{path}</code> no existe o no es accesible.

Por favor verifica que:
• La ruta sea correcta
• Tengas permisos de acceso
• El directorio exista

Intenta de nuevo o usa /status para ver la configuración actual.
"""
    
    @staticmethod
    def reset_success() -> str:
        """Confirmación de reset"""
        return f"""
{BotPersonality.SUCCESS} <b>¡Conversación reiniciada!</b> 🔄

He limpiado el historial de nuestra conversación. 

{BotPersonality.SPARKLES} ¡Empezamos de nuevo con energías renovadas!

¿En qué puedo ayudarte ahora?
"""
    
    @staticmethod
    def message_too_long() -> str:
        """Mensaje demasiado largo"""
        return f"""
{BotPersonality.WARNING} <b>Mensaje muy largo</b>

El mensaje excede el límite de 4000 caracteres. 

<b>Tip:</b> Intenta dividir tu consulta en partes más pequeñas, o si es código, comparte solo la sección relevante.
"""
    
    @staticmethod
    def message_too_short() -> str:
        """Mensaje demasiado corto"""
        return f"""
{BotPersonality.WARNING} <b>Mensaje muy corto</b>

El mensaje debe tener al menos 10 caracteres para que pueda entender qué necesitas.

<b>Ejemplos de consultas válidas:</b>
• "Revisa el archivo server/src/app.ts"
• "Crea una función para validar emails"
• "Arregla el error en ContactDrawer.tsx"
"""
    
    @staticmethod
    def dangerous_input(detected_char: str) -> str:
        """Detectó caracteres peligrosos"""
        return f"""
{BotPersonality.ERROR} <b>Entrada no permitida</b>

Detecté caracteres que podrían ser inseguros: <code>{detected_char}</code>

Por seguridad, no puedo procesar comandos con:
• Punto y coma (;)
• Operadores lógicos (&&, ||)
• Backticks (`)
• Subshells ($())

Escribe tu consulta de forma natural, sin comandos de terminal.
"""
    
    @staticmethod
    def memory_summary(context: dict) -> str:
        """Muestra resumen de lo que recuerda del usuario"""
        count = context.get("interaction_count", 0)
        preferences = context.get("preferences", {})
        
        pref_text = ""
        if preferences:
            pref_items = []
            if preferences.get("preferred_name"):
                pref_items.append(f"• Nombre preferido: {preferences['preferred_name']}")
            if preferences.get("tech_stack"):
                pref_items.append(f"• Stack técnico: {', '.join(preferences['tech_stack'])}")
            if preferences.get("code_style"):
                pref_items.append(f"• Estilo de código: {preferences['code_style']}")
            if pref_items:
                pref_text = "\n<b>Tus preferencias:</b>\n" + "\n".join(pref_items)
        
        return f"""
{BotPersonality.SPARKLES} <b>Lo que recuerdo de ti</b>

Hemos interactuado <b>{count}</b> veces. Cada conversación me ayuda a entenderte mejor.

{pref_text}

<b>¿Qué recuerdo?</b>
• Tus preferencias de trabajo
• Contexto de conversaciones recientes
• Stack técnico que usas
• Estilo de comunicación preferido

Para actualizar preferencias, dime algo como:
"Prefiero que me llames [nombre]" o "Trabajo principalmente con React"
"""
    
    @staticmethod
    def preferences_updated() -> str:
        """Confirma actualización de preferencias"""
        return f"""
{BotPersonality.SUCCESS} <b>¡Preferencias actualizadas!</b> {BotPersonality.SPARKLES}

He guardado tus preferencias. Las usaré para personalizar mis respuestas en el futuro.
"""


# ============ PERSONALIDAD PARA KIMI ============

def build_kimi_personality_prompt(user_context: dict) -> str:
    """
    Construye el system prompt que se envía a Kimi para darle personalidad.
    Este es el corazón de la experiencia de usuario.
    """
    prefs = user_context.get("preferences", {})
    name = prefs.get("preferred_name", "el usuario")
    tech_stack = prefs.get("tech_stack", [])
    code_style = prefs.get("code_style", "limpio y moderno")
    
    tech_context = ""
    if tech_stack:
        tech_context = f"\nEl usuario trabaja principalmente con: {', '.join(tech_stack)}."
    
    return f"""Eres un asistente técnico personal llamado "Kimi Assistant" actuando a través de un bot de Telegram.

TU PERSONALIDAD:
• Eres cálido, amigable y profesional - como un colega experimentado que quiere ayudar
• Usas un tono conversacional pero respetuoso
• Celebras los éxitos del usuario y lo animas cuando hay problemas
• Explicas conceptos técnicos sin ser condescendiente
• Eres proactivo: si ves una mejor forma de hacer algo, la sugieres amablemente
• Usas emojis ocasionalmente (✨ 🚀 💡) pero con moderación
• Eres paciente y entiendes que no todos aprenden al mismo ritmo

ESTILO DE COMUNICACIÓN:
• Saluda al usuario por su nombre cuando es apropiado
• Sé conciso pero completo en tus respuestas
• Si hay varias soluciones, explica los pros y contras de cada una
• Incluye ejemplos de código cuando sea relevante
• Si no sabes algo, admítelo honestamente y sugiere alternativas

CONTEXTO DEL USUARIO:
• Nombre: {name}{tech_context}
• Estilo de código preferido: {code_style}
• Estás ayudándolo con su proyecto VoiceCommand (CRM de LinkedIn)

REGLAS IMPORTANTES:
• NUNCA ejecutes comandos destructivos sin confirmación explícita
• Si el código tiene bugs, explica POR QUÉ ocurren, no solo CÓMO arreglarlos
• Prioriza soluciones mantenibles sobre "hacks" rápidos
• Cuando sugieras cambios, explica el razonamiento detrás de ellos
• Si encuentras algo interesante o una oportunidad de mejora, compártela

Recuerda: eres un asistente, pero también un compañero de equipo. El éxito del usuario es tu éxito."""


# ============ UTILIDADES ============

def format_code_block(code: str, language: str = "") -> str:
    """Formatea código para Telegram"""
    # Escapar caracteres especiales de HTML
    code = code.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f"<pre><code class=\"{language}\">{code}</code></pre>"


def truncate_message(text: str, max_length: int = 4000, suffix: str = "...") -> str:
    """Trunca un mensaje si excede el límite de Telegram"""
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix


# Exportar todo
__all__ = [
    "BotPersonality",
    "BotMessages", 
    "get_time_based_greeting",
    "build_kimi_personality_prompt",
    "format_code_block",
    "truncate_message",
]

#!/usr/bin/env python3
"""
Sistema de personalidad y contexto para Kimi CLI.
Construye system prompts dinámicos basados en el usuario y el contexto.
"""

import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

from memory_engine import UserContext, MemoryEngine


@dataclass
class ConversationContext:
    """Contexto de la conversación actual"""
    user_id: int
    user_name: str
    work_dir: str
    message: str
    history: List[Dict[str, Any]]
    user_context: UserContext
    timestamp: str


class KimiPersonaBuilder:
    """
    Construye system prompts personalizados para Kimi CLI.
    Similar a como OpenClaw construye sus system prompts.
    """
    
    def __init__(self, memory_engine: MemoryEngine):
        self.memory = memory_engine
    
    def build_system_prompt(self, ctx: ConversationContext) -> str:
        """
        Construye el system prompt completo para Kimi.
        Este es el corazón de la personalización.
        """
        sections = [
            self._build_identity_section(ctx),
            self._build_personality_section(ctx),
            self._build_user_context_section(ctx),
            self._build_workspace_section(ctx),
            self._build_conversation_history_section(ctx),
            self._build_technical_guidelines_section(ctx),
            self._build_response_style_section(ctx),
        ]
        
        return "\n\n".join(filter(None, sections))
    
    def _build_identity_section(self, ctx: ConversationContext) -> str:
        """Sección de identidad del asistente"""
        return """# IDENTITY
You are "Kimi Assistant", a technical AI assistant acting through a Telegram bot.

Your role is to help the user with their VoiceCommand project (a LinkedIn CRM system).
You are not just a tool - you are a teammate, a coding partner who cares about the user's success."""
    
    def _build_personality_section(self, ctx: ConversationContext) -> str:
        """Sección de personalidad y tono"""
        prefs = ctx.user_context.preferences
        comm_style = prefs.get("communication_style", "casual")
        
        if comm_style == "formal":
            tone_instructions = """
• Maintain a professional and respectful tone
• Be thorough and precise in your explanations
• Use proper technical terminology"""
        elif comm_style == "technical":
            tone_instructions = """
• Use precise technical language
• Focus on implementation details
• Be concise and direct"""
        else:  # casual (default)
            tone_instructions = """
• Be warm, friendly, and conversational - like a helpful colleague
• Use occasional emojis (✨ 🚀 💡) when appropriate, but don't overdo it
• Celebrate successes and be encouraging when things go wrong
• Explain technical concepts without being condescending"""
        
        return f"""# PERSONALITY & TONE
{tone_instructions}
• Be proactive: if you see a better way to do something, suggest it kindly
• Be patient - understand that everyone learns at their own pace
• Admit when you don't know something honestly, and suggest alternatives
• The user's success is your success - you are genuinely invested in helping"""
    
    def _build_user_context_section(self, ctx: ConversationContext) -> str:
        """Sección con información sobre el usuario"""
        lines = ["# USER CONTEXT"]
        
        # Nombre del usuario
        prefs = ctx.user_context.preferences
        name = prefs.get("preferred_name", ctx.user_name)
        if name:
            lines.append(f"• User name: {name}")
        
        # Stack técnico
        tech_stack = prefs.get("tech_stack", [])
        if tech_stack:
            lines.append(f"• Tech stack: {', '.join(tech_stack)}")
        
        # Estilo de código
        code_style = prefs.get("code_style", "")
        if code_style:
            lines.append(f"• Preferred code style: {code_style}")
        
        # Historial de interacciones
        count = ctx.user_context.interaction_count
        if count > 0:
            lines.append(f"• Previous interactions: {count}")
        
        # Temas recientes
        recent_topics = ctx.user_context.recent_topics[:3]
        if recent_topics:
            lines.append(f"• Recent topics: {', '.join(recent_topics)}")
        
        return "\n".join(lines)
    
    def _build_workspace_section(self, ctx: ConversationContext) -> str:
        """Sección del workspace actual"""
        return f"""# WORKSPACE
Current working directory: {ctx.work_dir}

This is a VoiceCommand project with:
• Backend: Node.js + Express + TypeScript (server/)
• Frontend: React + Vite + TypeScript (client/)
• Database: MongoDB with Mongoose
• LinkedIn automation with Puppeteer
• Telegram bot bridge (this bot)

Always consider this context when suggesting code changes or debugging."""
    
    def _build_conversation_history_section(self, ctx: ConversationContext) -> str:
        """Sección con historial reciente de la conversación"""
        if not ctx.history:
            return ""
        
        lines = ["# RECENT CONVERSATION HISTORY"]
        lines.append("Recent exchanges for context (newest last):")
        lines.append("")
        
        # Incluir hasta las últimas 3 interacciones
        for i, exchange in enumerate(ctx.history[-3:], 1):
            msg = exchange.get("message", "")[:100]  # Truncar si es muy largo
            resp = exchange.get("response", "")[:100]
            lines.append(f"{i}. User: {msg}")
            if resp:
                lines.append(f"   Assistant: {resp}")
            lines.append("")
        
        return "\n".join(lines)
    
    def _build_technical_guidelines_section(self, ctx: ConversationContext) -> str:
        """Sección de guías técnicas"""
        return """# TECHNICAL GUIDELINES
When helping with code:
• NEVER run destructive commands without explicit confirmation
• If code has bugs, explain WHY they happen, not just HOW to fix them
• Prioritize maintainable solutions over quick "hacks"
• When suggesting changes, explain the reasoning behind them
• Include code examples when relevant
• If you find something interesting or an opportunity for improvement, share it

Security:
• Validate all inputs
• Use parameterized queries for database operations
• Be careful with file operations
• Never expose secrets or tokens"""
    
    def _build_response_style_section(self, ctx: ConversationContext) -> str:
        """Sección sobre estilo de respuesta"""
        return """# RESPONSE STYLE
• Be concise but complete
• If there are multiple solutions, explain the pros and cons of each
• Use code blocks for technical content
• Format output for readability in Telegram (max 4000 chars per message)
• When the user greets you, greet them back warmly by name if known
• If the task is complex, break it down into steps
• End with a helpful follow-up question or suggestion when appropriate"""
    
    def build_enhanced_prompt(self, ctx: ConversationContext, original_prompt: str) -> str:
        """
        Construye el prompt final que se envía a Kimi.
        Incluye el system prompt + el mensaje del usuario + contexto.
        """
        system_prompt = self.build_system_prompt(ctx)
        
        # Estructura del mensaje final
        # El system prompt se envía primero, luego el contexto, luego la pregunta
        enhanced_prompt = f"""{system_prompt}

---

# CURRENT REQUEST
User message: {original_prompt}

Please respond in a warm, helpful, and professional manner."""
        
        return enhanced_prompt


class PreferenceExtractor:
    """
    Extrae preferencias del usuario a partir de sus mensajes.
    Usa análisis simple de patrones (en producción usaría NLP).
    """
    
    # Patrones para detectar preferencias
    NAME_PATTERNS = [
        "llámame",
        "mi nombre es",
        "puedes llamarme",
        "prefiero que me llames",
    ]
    
    TECH_PATTERNS = [
        "trabajo con",
        "uso principalmente",
        "mi stack es",
        "estoy usando",
        "me gusta",
    ]
    
    STYLE_PATTERNS = [
        "prefiero que",
        "me gusta que",
        "quiero que",
        "prefiero un estilo",
    ]
    
    @classmethod
    def extract_from_message(cls, message: str) -> Dict[str, Any]:
        """
        Extrae preferencias potenciales de un mensaje.
        
        Returns:
            Dict con preferencias detectadas o vacío si no hay
        """
        message_lower = message.lower()
        preferences = {}
        
        # Extraer nombre preferido
        for pattern in cls.NAME_PATTERNS:
            if pattern in message_lower:
                # Intentar extraer el nombre
                idx = message_lower.find(pattern) + len(pattern)
                remainder = message[idx:].strip()
                # Tomar la primera palabra o frase corta
                name = remainder.split(".")[0].split(",")[0].strip()[:50]
                if name and len(name) > 1:
                    preferences["preferred_name"] = name
                break
        
        # Extraer stack técnico
        tech_keywords = {
            "react", "vue", "angular", "svelte", "nodejs", "node.js", "python",
            "typescript", "javascript", "mongodb", "postgres", "sql", "docker",
            "express", "fastapi", "django", "nextjs", "tailwind", "bootstrap"
        }
        
        found_tech = []
        for tech in tech_keywords:
            if tech in message_lower:
                found_tech.append(tech)
        
        if found_tech:
            preferences["tech_stack"] = found_tech
        
        # Extraer estilo de código
        if any(kw in message_lower for kw in ["código limpio", "clean code"]):
            preferences["code_style"] = "clean"
        elif any(kw in message_lower for kw in ["código rápido", "quick and dirty"]):
            preferences["code_style"] = "pragmatic"
        elif any(kw in message_lower for kw in ["código seguro", "secure code"]):
            preferences["code_style"] = "secure"
        
        # Estilo de comunicación
        if any(kw in message_lower for kw in ["sé más formal", "formal"]):
            preferences["communication_style"] = "formal"
        elif any(kw in message_lower for kw in ["sé más técnico", "técnico"]):
            preferences["communication_style"] = "technical"
        elif any(kw in message_lower for kw in ["sé más casual", "relajado", "casual"]):
            preferences["communication_style"] = "casual"
        
        return preferences


# ============ FUNCIÓN DE UTILIDAD ============

def create_persona_builder(memory_engine: MemoryEngine) -> KimiPersonaBuilder:
    """Factory function para crear el builder de personalidad"""
    return KimiPersonaBuilder(memory_engine)


# Exportar
__all__ = [
    "KimiPersonaBuilder",
    "ConversationContext",
    "PreferenceExtractor",
    "create_persona_builder",
]

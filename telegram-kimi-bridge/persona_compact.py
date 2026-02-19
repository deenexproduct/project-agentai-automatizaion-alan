#!/usr/bin/env python3
"""
Versión compacta y optimizada del sistema de personalidad.
Kimi CLI no soporta system prompts separados, así que integramos todo en el mensaje.
"""

from memory_engine import UserContext


class CompactKimiPersonaBuilder:
    """
    Builder optimizado para respuestas rápidas y directas.
    """
    
    def __init__(self, memory_engine=None):
        self.memory = memory_engine
    
    def build_prompt(self, user_ctx: UserContext, message: str) -> str:
        """
        Construye el prompt final a enviar a Kimi.
        Formato: Contexto mínimo + Solicitud del usuario
        """
        prefs = user_ctx.preferences
        name = prefs.get("preferred_name", "")
        
        # Contexto mínimo (una sola línea)
        context = f"[{name}] " if name else ""
        
        # Detectar complejidad para ajustar timeout
        complexity = self._assess_complexity(message)
        
        # Instrucción de comportamiento muy concisa
        instruction = "Responde de forma directa y concisa. Sin análisis interno. "
        
        # Construir prompt final
        final_prompt = f"{instruction}{context}{message}"
        
        return final_prompt
    
    def _assess_complexity(self, message: str) -> str:
        """Evalúa complejidad del mensaje"""
        msg_lower = message.lower()
        
        complex_keywords = ["refactor", "arquitectura", "multiple", "sistema", "módulo"]
        medium_keywords = ["crea", "nuevo", "arregla", "bug", "optimiza"]
        
        if any(kw in msg_lower for kw in complex_keywords):
            return "complex"
        elif any(kw in msg_lower for kw in medium_keywords):
            return "medium"
        return "simple"
    
    def get_timeout(self, message: str) -> int:
        """Retorna timeout según complejidad"""
        complexity = self._assess_complexity(message)
        return {"simple": 120, "medium": 300, "complex": 600}.get(complexity, 300)
    
    def get_progress_message(self, message: str) -> str:
        """Mensaje de progreso"""
        complexity = self._assess_complexity(message)
        messages = {
            "simple": "💡 Un momento...",
            "medium": "🤔 Procesando...",
            "complex": "🔍 Esto puede tomar unos minutos...",
        }
        return messages.get(complexity, "🤔 Procesando...")


def create_compact_persona_builder(memory_engine=None):
    return CompactKimiPersonaBuilder(memory_engine)


# Compatibilidad hacia atrás
KimiPersonaBuilder = CompactKimiPersonaBuilder
create_persona_builder = create_compact_persona_builder

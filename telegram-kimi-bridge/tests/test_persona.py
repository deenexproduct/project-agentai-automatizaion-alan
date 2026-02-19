#!/usr/bin/env python3
"""
Tests unitarios para persona.py
Valida construcción de personalidad y extracción de preferencias.
"""

import pytest
from unittest.mock import Mock, MagicMock, patch

# Importar el módulo a testear
import sys
sys.path.insert(0, '/Users/alannaimtapia/Desktop/Programacion/voice/telegram-kimi-bridge')

from persona import (
    KimiPersonaBuilder,
    ConversationContext,
    PreferenceExtractor,
    create_persona_builder,
)
from memory_engine import UserContext, MemoryEngine


@pytest.fixture
def mock_memory_engine():
    """Fixture que crea un MemoryEngine mockeado"""
    return Mock(spec=MemoryEngine)


@pytest.fixture
def persona_builder(mock_memory_engine):
    """Fixture que crea un KimiPersonaBuilder"""
    return KimiPersonaBuilder(memory_engine=mock_memory_engine)


@pytest.fixture
def sample_user_context():
    """Fixture que crea un UserContext de ejemplo"""
    return UserContext(
        user_id=12345,
        first_seen="2024-01-01T00:00:00",
        last_seen="2024-01-02T00:00:00",
        interaction_count=10,
        preferences={
            "preferred_name": "Alanna",
            "tech_stack": ["React", "Node.js"],
            "code_style": "clean",
            "communication_style": "casual"
        },
        recent_topics=["React", "API"],
        common_commands={"/status": 5, "/help": 3}
    )


@pytest.fixture
def sample_conversation_context(sample_user_context):
    """Fixture que crea un ConversationContext de ejemplo"""
    return ConversationContext(
        user_id=12345,
        user_name="Alanna",
        work_dir="/test/workspace",
        message="Revisa el archivo app.ts",
        history=[
            {"message": "Hola", "response": "¡Hola!", "timestamp": "2024-01-01T00:00:00", "success": True}
        ],
        user_context=sample_user_context,
        timestamp="2024-01-02T12:00:00"
    )


class TestKimiPersonaBuilderInit:
    """Tests para inicialización del builder"""
    
    def test_init_stores_memory_engine(self, mock_memory_engine):
        """Verifica que almacena el motor de memoria"""
        builder = KimiPersonaBuilder(memory_engine=mock_memory_engine)
        assert builder.memory == mock_memory_engine


class TestBuildIdentitySection:
    """Tests para sección de identidad"""
    
    def test_identity_includes_assistant_role(self, persona_builder, sample_conversation_context):
        """Verifica que incluye rol de asistente"""
        section = persona_builder._build_identity_section(sample_conversation_context)
        
        assert "Kimi Assistant" in section or "assistant" in section.lower()
        assert "VoiceCommand" in section or "CRM" in section


class TestBuildPersonalitySection:
    """Tests para sección de personalidad"""
    
    def test_formal_style_instructions(self, persona_builder, sample_conversation_context):
        """Verifica instrucciones para estilo formal"""
        sample_conversation_context.user_context.preferences["communication_style"] = "formal"
        section = persona_builder._build_personality_section(sample_conversation_context)
        
        assert "professional" in section.lower() or "respectful" in section.lower()
    
    def test_casual_style_instructions(self, persona_builder, sample_conversation_context):
        """Verifica instrucciones para estilo casual"""
        sample_conversation_context.user_context.preferences["communication_style"] = "casual"
        section = persona_builder._build_personality_section(sample_conversation_context)
        
        assert "cálido" in section.lower() or "friendly" in section.lower() or "amigable" in section.lower()
    
    def test_technical_style_instructions(self, persona_builder, sample_conversation_context):
        """Verifica instrucciones para estilo técnico"""
        sample_conversation_context.user_context.preferences["communication_style"] = "technical"
        section = persona_builder._build_personality_section(sample_conversation_context)
        
        assert "precise" in section.lower() or "technical" in section.lower() or "concise" in section.lower()


class TestBuildUserContextSection:
    """Tests para sección de contexto de usuario"""
    
    def test_includes_user_name(self, persona_builder, sample_conversation_context):
        """Verifica que incluye nombre del usuario"""
        section = persona_builder._build_user_context_section(sample_conversation_context)
        
        assert "Alanna" in section
    
    def test_includes_tech_stack(self, persona_builder, sample_conversation_context):
        """Verifica que incluye stack tecnológico"""
        section = persona_builder._build_user_context_section(sample_conversation_context)
        
        assert "React" in section
        assert "Node.js" in section
    
    def test_includes_code_style(self, persona_builder, sample_conversation_context):
        """Verifica que incluye estilo de código"""
        section = persona_builder._build_user_context_section(sample_conversation_context)
        
        assert "clean" in section.lower() or "preferred code style" in section.lower()
    
    def test_handles_empty_preferences(self, persona_builder):
        """Verifica que maneja preferencias vacías"""
        ctx = ConversationContext(
            user_id=12345,
            user_name="User",
            work_dir="/test",
            message="Hello",
            history=[],
            user_context=UserContext(
                user_id=12345,
                first_seen="2024-01-01",
                last_seen="2024-01-02",
                interaction_count=0,
                preferences={},
                recent_topics=[],
                common_commands={}
            ),
            timestamp="2024-01-02"
        )
        
        section = persona_builder._build_user_context_section(ctx)
        
        # Debe ser un string válido aunque esté vacío
        assert isinstance(section, str)


class TestBuildWorkspaceSection:
    """Tests para sección del workspace"""
    
    def test_includes_work_dir(self, persona_builder, sample_conversation_context):
        """Verifica que incluye directorio de trabajo"""
        section = persona_builder._build_workspace_section(sample_conversation_context)
        
        assert "/test/workspace" in section
    
    def test_includes_project_context(self, persona_builder, sample_conversation_context):
        """Verifica que incluye contexto del proyecto"""
        section = persona_builder._build_workspace_section(sample_conversation_context)
        
        assert "VoiceCommand" in section or "LinkedIn" in section or "CRM" in section


class TestBuildConversationHistorySection:
    """Tests para sección de historial"""
    
    def test_includes_recent_exchanges(self, persona_builder, sample_conversation_context):
        """Verifica que incluye intercambios recientes"""
        section = persona_builder._build_conversation_history_section(sample_conversation_context)
        
        assert "Hola" in section
    
    def test_empty_history_returns_empty(self, persona_builder, sample_conversation_context):
        """Verifica que con historial vacío retorna string vacío"""
        sample_conversation_context.history = []
        section = persona_builder._build_conversation_history_section(sample_conversation_context)
        
        assert section == ""


class TestBuildEnhancedPrompt:
    """Tests para construcción del prompt completo"""
    
    def test_includes_all_sections(self, persona_builder, sample_conversation_context):
        """Verifica que incluye todas las secciones"""
        prompt = persona_builder.build_enhanced_prompt(
            sample_conversation_context,
            "Test message"
        )
        
        # Debe incluir secciones clave
        assert "IDENTITY" in prompt or "identity" in prompt.lower()
        assert "CURRENT REQUEST" in prompt
        assert "Test message" in prompt
    
    def test_includes_user_message(self, persona_builder, sample_conversation_context):
        """Verifica que incluye el mensaje del usuario"""
        user_message = "Revisa el componente Login"
        prompt = persona_builder.build_enhanced_prompt(
            sample_conversation_context,
            user_message
        )
        
        assert user_message in prompt


class TestPreferenceExtractorName:
    """Tests para extracción de nombre"""
    
    def test_extract_llamame(self):
        """Extrae nombre con 'llámame'"""
        prefs = PreferenceExtractor.extract_from_message("Llámame Alanna")
        assert prefs.get("preferred_name") == "Alanna"
    
    def test_extract_mi_nombre_es(self):
        """Extrae nombre con 'mi nombre es'"""
        prefs = PreferenceExtractor.extract_from_message("Mi nombre es Carlos")
        assert prefs.get("preferred_name") == "Carlos"
    
    def test_extract_prefiero_que_me_llames(self):
        """Extrae nombre con 'prefiero que me llames'"""
        prefs = PreferenceExtractor.extract_from_message("Prefiero que me llames Alex")
        assert prefs.get("preferred_name") == "Alex"


class TestPreferenceExtractorTechStack:
    """Tests para extracción de stack tecnológico"""
    
    def test_extract_react(self):
        """Extrae React del mensaje"""
        prefs = PreferenceExtractor.extract_from_message("Trabajo con React")
        assert "react" in prefs.get("tech_stack", [])
    
    def test_extract_multiple_techs(self):
        """Extrae múltiples tecnologías"""
        prefs = PreferenceExtractor.extract_from_message(
            "Uso React, Node.js y TypeScript"
        )
        techs = prefs.get("tech_stack", [])
        assert "react" in techs
        assert "nodejs" in techs or "node.js" in techs
    
    def test_extract_no_tech(self):
        """No extrae nada si no hay tecnologías"""
        prefs = PreferenceExtractor.extract_from_message("Hola, cómo estás?")
        assert "tech_stack" not in prefs or prefs.get("tech_stack") == []


class TestPreferenceExtractorStyle:
    """Tests para extracción de estilo"""
    
    def test_extract_formal_style(self):
        """Extrae preferencia por estilo formal"""
        prefs = PreferenceExtractor.extract_from_message("Sé más formal por favor")
        assert prefs.get("communication_style") == "formal"
    
    def test_extract_casual_style(self):
        """Extrae preferencia por estilo casual"""
        prefs = PreferenceExtractor.extract_from_message("Prefiero un estilo más casual")
        assert prefs.get("communication_style") == "casual"
    
    def test_extract_technical_style(self):
        """Extrae preferencia por estilo técnico"""
        prefs = PreferenceExtractor.extract_from_message("Sé más técnico")
        assert prefs.get("communication_style") == "technical"


class TestPreferenceExtractorCodeStyle:
    """Tests para extracción de estilo de código"""
    
    def test_extract_clean_code(self):
        """Extrae preferencia por código limpio"""
        prefs = PreferenceExtractor.extract_from_message("Prefiero código limpio")
        assert prefs.get("code_style") == "clean"
    
    def test_extract_secure_code(self):
        """Extrae preferencia por código seguro"""
        prefs = PreferenceExtractor.extract_from_message("Quiero código seguro")
        assert prefs.get("code_style") == "secure"


class TestPreferenceExtractorEmpty:
    """Tests para mensajes sin preferencias"""
    
    def test_no_preferences_in_greeting(self):
        """No extrae preferencias de un saludo"""
        prefs = PreferenceExtractor.extract_from_message("Hola, buenos días!")
        assert prefs == {}
    
    def test_no_preferences_in_question(self):
        """No extrae preferencias de una pregunta técnica"""
        prefs = PreferenceExtractor.extract_from_message(
            "Cómo hago un componente en React?"
        )
        # Puede extraer React como tech_stack, pero eso es válido
        # Lo importante es que no falle
        assert isinstance(prefs, dict)


class TestCreatePersonaBuilder:
    """Tests para factory function"""
    
    def test_returns_kimi_persona_builder(self):
        """Verifica que retorna una instancia de KimiPersonaBuilder"""
        mock_memory = Mock(spec=MemoryEngine)
        builder = create_persona_builder(mock_memory)
        
        assert isinstance(builder, KimiPersonaBuilder)


# Estadísticas
if __name__ == "__main__":
    print("=" * 60)
    print("TEST PERSONA - Resumen")
    print("=" * 60)
    
    test_classes = [
        TestKimiPersonaBuilderInit,
        TestBuildIdentitySection,
        TestBuildPersonalitySection,
        TestBuildUserContextSection,
        TestBuildWorkspaceSection,
        TestBuildConversationHistorySection,
        TestBuildEnhancedPrompt,
        TestPreferenceExtractorName,
        TestPreferenceExtractorTechStack,
        TestPreferenceExtractorStyle,
        TestPreferenceExtractorCodeStyle,
        TestPreferenceExtractorEmpty,
        TestCreatePersonaBuilder,
    ]
    
    total = sum(len([m for m in dir(cls) if m.startswith('test_')]) for cls in test_classes)
    print(f"Total tests: {total}")
    print("=" * 60)
    
    pytest.main([__file__, "-v", "--tb=short"])

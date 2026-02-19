#!/usr/bin/env python3
"""
Tests unitarios para bot_messages.py
Valida mensajes, personalidad y utilidades.
"""

import pytest
from datetime import datetime
from unittest.mock import patch

# Importar el módulo a testear
import sys
sys.path.insert(0, '/Users/alannaimtapia/Desktop/Programacion/voice/telegram-kimi-bridge')

from bot_messages import (
    BotPersonality,
    BotMessages,
    get_time_based_greeting,
    build_kimi_personality_prompt,
    format_code_block,
    truncate_message,
)


class TestBotPersonality:
    """Tests para la clase BotPersonality"""
    
    def test_personality_has_required_emojis(self):
        """Verifica que la personalidad tiene todos los emojis necesarios"""
        assert BotPersonality.WAVING == "👋"
        assert BotPersonality.THINKING == "🤔"
        assert BotPersonality.HAPPY == "✨"
        assert BotPersonality.SUCCESS == "✅"
        assert BotPersonality.ERROR == "❌"
        assert BotPersonality.LOCK == "🔒"
        assert BotPersonality.FOLDER == "📁"
    
    def test_personality_has_tone_config(self):
        """Verifica que tiene configuración de tono"""
        assert "greeting_style" in BotPersonality.TONE
        assert "help_style" in BotPersonality.TONE
        assert "error_style" in BotPersonality.TONE


class TestGetTimeBasedGreeting:
    """Tests para get_time_based_greeting"""
    
    def test_morning_greeting(self):
        """Verifica saludo por la mañana (5-11h)"""
        with patch('bot_messages.datetime') as mock_dt:
            mock_dt.now.return_value.hour = 8
            greeting = get_time_based_greeting("Alanna")
            
            assert "Alanna" in greeting
            assert any(keyword in greeting for keyword in ["días", "🌅", "☀️"])
    
    def test_afternoon_greeting(self):
        """Verifica saludo por la tarde (12-17h)"""
        with patch('bot_messages.datetime') as mock_dt:
            mock_dt.now.return_value.hour = 14
            greeting = get_time_based_greeting("Alanna")
            
            assert "Alanna" in greeting
            assert any(keyword in greeting for keyword in ["tardes", "👋", "🌤️"])
    
    def test_evening_greeting(self):
        """Verifica saludo por la noche (18-23h)"""
        with patch('bot_messages.datetime') as mock_dt:
            mock_dt.now.return_value.hour = 21
            greeting = get_time_based_greeting("Alanna")
            
            assert "Alanna" in greeting
            assert any(keyword in greeting for keyword in ["noches", "🌙", "🌆"])
    
    def test_greeting_includes_name(self):
        """Verifica que el saludo incluye el nombre del usuario"""
        with patch('bot_messages.datetime') as mock_dt:
            mock_dt.now.return_value.hour = 10
            greeting = get_time_based_greeting("TestUser")
            assert "TestUser" in greeting


class TestBotMessagesWelcome:
    """Tests para BotMessages.welcome"""
    
    def test_welcome_includes_user_name(self):
        """Verifica que incluye el nombre del usuario"""
        msg = BotMessages.welcome("Alanna", "/test/path")
        assert "Alanna" in msg
    
    def test_welcome_includes_work_dir(self):
        """Verifica que incluye el directorio de trabajo"""
        work_dir = "/Users/test/project"
        msg = BotMessages.welcome("User", work_dir)
        assert work_dir in msg
    
    def test_welcome_has_html_formatting(self):
        """Verifica que tiene formato HTML"""
        msg = BotMessages.welcome("User", "/path")
        assert "<b>" in msg
        assert "</b>" in msg
    
    def test_welcome_includes_commands(self):
        """Verifica que menciona los comandos principales"""
        msg = BotMessages.welcome("User", "/path")
        assert "/help" in msg
        assert "/status" in msg


class TestBotMessagesHelp:
    """Tests para BotMessages.help_message"""
    
    def test_help_includes_all_commands(self):
        """Verifica que incluye todos los comandos"""
        msg = BotMessages.help_message("/test")
        assert "/start" in msg
        assert "/help" in msg
        assert "/status" in msg
        assert "/workdir" in msg
        assert "/reset" in msg
    
    def test_help_has_examples(self):
        """Verifica que incluye ejemplos de uso"""
        msg = BotMessages.help_message("/test")
        assert "Ejemplos" in msg or "ejemplos" in msg
    
    def test_help_includes_work_dir(self):
        """Verifica que muestra el directorio actual"""
        work_dir = "/custom/path"
        msg = BotMessages.help_message(work_dir)
        assert work_dir in msg


class TestBotMessagesStatus:
    """Tests para BotMessages.status"""
    
    def test_status_shows_kimi_installed(self):
        """Verifica estado cuando Kimi está instalado"""
        msg = BotMessages.status(
            kimi_installed=True,
            kimi_version="1.12.0",
            work_dir="/test",
            workdir_exists=True,
            user_id=12345,
            memory_count=10
        )
        assert "En línea" in msg or "✅" in msg
        assert "1.12.0" in msg
    
    def test_status_shows_kimi_not_installed(self):
        """Verifica estado cuando Kimi no está instalado"""
        msg = BotMessages.status(
            kimi_installed=False,
            kimi_version="No disponible",
            work_dir="/test",
            workdir_exists=True,
            user_id=12345,
            memory_count=0
        )
        assert "No instalado" in msg or "❌" in msg
    
    def test_status_shows_memory_count(self):
        """Verifica que muestra conteo de memoria"""
        msg = BotMessages.status(
            kimi_installed=True,
            kimi_version="1.0",
            work_dir="/test",
            workdir_exists=True,
            user_id=12345,
            memory_count=42
        )
        assert "42" in msg or "recuerdos" in msg


class TestBotMessagesProcessing:
    """Tests para BotMessages.processing"""
    
    def test_processing_returns_string(self):
        """Verifica que devuelve un string"""
        msg = BotMessages.processing()
        assert isinstance(msg, str)
        assert len(msg) > 0
    
    def test_processing_contains_thinking_emoji(self):
        """Verifica que contiene emoji de pensar"""
        msg = BotMessages.processing()
        assert "🤔" in msg or "🔍" in msg or "⚙️" in msg


class TestBotMessagesSuccessResponse:
    """Tests para BotMessages.success_response"""
    
    def test_success_includes_output(self):
        """Verifica que incluye el output"""
        output = "Test output message"
        msg = BotMessages.success_response(output)
        assert output in msg
    
    def test_success_has_pre_tags(self):
        """Verifica que tiene tags pre para código"""
        msg = BotMessages.success_response("code")
        assert "<pre>" in msg
        assert "</pre>" in msg
    
    def test_success_includes_success_indicator(self):
        """Verifica que tiene indicador de éxito"""
        msg = BotMessages.success_response("done")
        # Los mensajes de éxito pueden tener diferentes indicadores
        success_indicators = ["✅", "✨", "Listo", "Perfecto", "Hecho", "¡Ahí va"]
        assert any(ind in msg for ind in success_indicators), f"Ningún indicador de éxito encontrado en: {msg}"


class TestBotMessagesErrorResponse:
    """Tests para BotMessages.error_response"""
    
    def test_error_includes_error_message(self):
        """Verifica que incluye el mensaje de error"""
        error = "Something went wrong"
        msg = BotMessages.error_response(error)
        assert error in msg
    
    def test_error_has_help_suggestion(self):
        """Verifica que sugiere usar /help"""
        msg = BotMessages.error_response("error")
        assert "/help" in msg
    
    def test_error_includes_error_emoji(self):
        """Verifica que tiene emoji de error"""
        msg = BotMessages.error_response("fail")
        assert "❌" in msg or "⚠️" in msg


class TestBotMessagesUnauthorized:
    """Tests para BotMessages.unauthorized"""
    
    def test_unauthorized_has_lock_emoji(self):
        """Verifica que tiene emoji de candado"""
        msg = BotMessages.unauthorized()
        assert "🔒" in msg or "lock" in msg.lower()
    
    def test_unauthorized_mentions_admin(self):
        """Verifica que menciona contactar al admin"""
        msg = BotMessages.unauthorized()
        assert "admin" in msg.lower() or "administrador" in msg.lower()


class TestBuildKimiPersonalityPrompt:
    """Tests para build_kimi_personality_prompt"""
    
    def test_prompt_includes_personality_traits(self):
        """Verifica que incluye rasgos de personalidad"""
        context = {
            "preferences": {
                "preferred_name": "Alanna",
                "tech_stack": ["React", "Node.js"],
                "code_style": "clean"
            }
        }
        prompt = build_kimi_personality_prompt(context)
        assert "cálido" in prompt.lower() or "amigable" in prompt.lower()
    
    def test_prompt_includes_user_name(self):
        """Verifica que incluye el nombre del usuario"""
        context = {
            "preferences": {
                "preferred_name": "Alanna",
                "tech_stack": [],
                "code_style": ""
            }
        }
        prompt = build_kimi_personality_prompt(context)
        assert "Alanna" in prompt
    
    def test_prompt_includes_tech_stack(self):
        """Verifica que incluye el stack tecnológico"""
        context = {
            "preferences": {
                "preferred_name": "User",
                "tech_stack": ["React", "TypeScript"],
                "code_style": "clean"
            }
        }
        prompt = build_kimi_personality_prompt(context)
        assert "React" in prompt
        assert "TypeScript" in prompt
    
    def test_prompt_handles_empty_preferences(self):
        """Verifica que maneja preferencias vacías"""
        context = {
            "preferences": {}
        }
        prompt = build_kimi_personality_prompt(context)
        assert isinstance(prompt, str)
        assert len(prompt) > 0


class TestTruncateMessage:
    """Tests para truncate_message"""
    
    def test_truncate_short_message(self):
        """Verifica que no trunca mensajes cortos"""
        msg = "Short message"
        result = truncate_message(msg, max_length=100)
        assert result == msg
    
    def test_truncate_long_message(self):
        """Verifica que trunca mensajes largos"""
        msg = "A" * 5000
        result = truncate_message(msg, max_length=100, suffix="...")
        assert len(result) <= 103  # 100 + "..."
        assert result.endswith("...")
    
    def test_truncate_exact_length(self):
        """Verifica mensaje de largo exacto"""
        msg = "A" * 100
        result = truncate_message(msg, max_length=100)
        assert result == msg


class TestFormatCodeBlock:
    """Tests para format_code_block"""
    
    def test_format_code_escapes_html(self):
        """Verifica que escapa caracteres HTML"""
        code = "<div>Test & More</div>"
        result = format_code_block(code)
        assert "&lt;" in result
        assert "&gt;" in result
        assert "&amp;" in result
    
    def test_format_code_includes_tags(self):
        """Verifica que incluye tags pre y code"""
        code = "print('hello')"
        result = format_code_block(code, "python")
        assert "<pre>" in result
        assert "</pre>" in result


# Estadísticas de tests
if __name__ == "__main__":
    print("=" * 60)
    print("TEST BOT MESSAGES - Resumen")
    print("=" * 60)
    
    # Contar tests
    test_classes = [
        TestBotPersonality,
        TestGetTimeBasedGreeting,
        TestBotMessagesWelcome,
        TestBotMessagesHelp,
        TestBotMessagesStatus,
        TestBotMessagesProcessing,
        TestBotMessagesSuccessResponse,
        TestBotMessagesErrorResponse,
        TestBotMessagesUnauthorized,
        TestBuildKimiPersonalityPrompt,
        TestTruncateMessage,
        TestFormatCodeBlock,
    ]
    
    total_tests = 0
    for cls in test_classes:
        methods = [m for m in dir(cls) if m.startswith('test_')]
        total_tests += len(methods)
        print(f"✓ {cls.__name__}: {len(methods)} tests")
    
    print("=" * 60)
    print(f"Total: {total_tests} tests")
    print("=" * 60)
    
    pytest.main([__file__, "-v", "--tb=short"])

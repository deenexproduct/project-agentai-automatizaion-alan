#!/usr/bin/env python3
"""
Tests de integración para bot.py
Valida lógica de negocio de KimiTelegramBot.
"""

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch, MagicMock

# Importar el módulo a testear
import sys
sys.path.insert(0, '/Users/alannaimtapia/Desktop/Programacion/voice/telegram-kimi-bridge')

from bot import KimiTelegramBot


@pytest.fixture
def bot(monkeypatch):
    """Fixture que crea una instancia del bot con configuración de test"""
    # Setear variables de entorno ANTES de importar
    monkeypatch.setenv('TELEGRAM_BOT_TOKEN', 'test_token')
    monkeypatch.setenv('ALLOWED_USER_IDS', '12345,67890')
    monkeypatch.setenv('KIMI_WORK_DIR', '/test/workspace')
    monkeypatch.setenv('MEMORY_DB_PATH', ':memory:')
    
    # Patch ALLOWED_USER_IDS directamente en el módulo
    monkeypatch.setattr('bot.ALLOWED_USER_IDS', ['12345', '67890'])
    
    return KimiTelegramBot()


class TestIsAuthorized:
    """Tests para autorización de usuarios"""
    
    def test_is_authorized_true(self, bot):
        """Verifica que usuario en lista está autorizado"""
        assert bot.is_authorized(12345) is True
        assert bot.is_authorized(67890) is True
    
    def test_is_authorized_false(self, bot):
        """Verifica que usuario no en lista no está autorizado"""
        assert bot.is_authorized(99999) is False
        assert bot.is_authorized(0) is False
    
    def test_is_authorized_string_id(self, bot):
        """Verifica que maneja IDs como strings correctamente"""
        # La lista de ALLOWED_USER_IDS se carga como strings
        assert bot.is_authorized(12345) is True


class TestGetUserContext:
    """Tests para obtención de contexto"""
    
    def test_get_user_context_returns_user_context(self, bot):
        """Verifica que retorna un UserContext"""
        ctx = bot.get_user_context(12345)
        
        assert ctx.user_id == 12345
        assert hasattr(ctx, 'interaction_count')
        assert hasattr(ctx, 'preferences')


class TestExtractTags:
    """Tests para extracción de tags de mensajes"""
    
    def test_extract_tags_review(self, bot):
        """Detecta tag 'review' en mensaje"""
        tags = bot._extract_tags("Revisa el archivo app.ts")
        assert "review" in tags
    
    def test_extract_tags_analiza(self, bot):
        """Detecta tag 'review' con 'analiza'"""
        tags = bot._extract_tags("Analiza este código por favor")
        assert "review" in tags
    
    def test_extract_tags_mira(self, bot):
        """Detecta tag 'review' con 'mira'"""
        tags = bot._extract_tags("Mira este componente")
        assert "review" in tags
    
    def test_extract_tags_bugfix(self, bot):
        """Detecta tag 'bugfix'"""
        tags = bot._extract_tags("Arregla este error")
        assert "bugfix" in tags
    
    def test_extract_tags_error(self, bot):
        """Detecta tag 'bugfix' con 'error'"""
        tags = bot._extract_tags("Hay un error en la línea 5")
        assert "bugfix" in tags
    
    def test_extract_tags_bug(self, bot):
        """Detecta tag 'bugfix' con 'bug'"""
        tags = bot._extract_tags("Este bug está causando problemas")
        assert "bugfix" in tags
    
    def test_extract_tags_feature(self, bot):
        """Detecta tag 'feature'"""
        tags = bot._extract_tags("Crea un nuevo endpoint")
        assert "feature" in tags
    
    def test_extract_tags_implementa(self, bot):
        """Detecta tag 'feature' con 'implementa'"""
        tags = bot._extract_tags("Implementa la función de login")
        assert "feature" in tags
    
    def test_extract_tags_refactor(self, bot):
        """Detecta tag 'refactor'"""
        tags = bot._extract_tags("Optimiza esta función")
        assert "refactor" in tags
    
    def test_extract_tags_mejora(self, bot):
        """Detecta tag 'refactor' con 'mejora'"""
        tags = bot._extract_tags("Mejora el rendimiento")
        assert "refactor" in tags
    
    def test_extract_tags_learning(self, bot):
        """Detecta tag 'learning'"""
        tags = bot._extract_tags("Explica cómo funciona React")
        assert "learning" in tags
    
    def test_extract_tags_empty(self, bot):
        """No detecta tags si no hay keywords"""
        tags = bot._extract_tags("Hola, buenos días!")
        assert tags == []
    
    def test_extract_tags_multiple(self, bot):
        """Detecta múltiples tags"""
        tags = bot._extract_tags("Arregla este bug y revisa el código")
        assert "bugfix" in tags
        assert "review" in tags


class TestBotInit:
    """Tests para inicialización del bot"""
    
    def test_bot_stores_work_dir(self, bot):
        """Verifica que almacena el directorio de trabajo"""
        # El work_dir se setea después de crear el bot
        assert bot.work_dir is not None
        assert isinstance(bot.work_dir, str)
    
    def test_bot_has_memory_engine(self, bot):
        """Verifica que tiene motor de memoria"""
        assert bot.memory is not None
    
    def test_bot_has_persona_builder(self, bot):
        """Verifica que tiene builder de personalidad"""
        assert bot.persona_builder is not None


# Estadísticas
if __name__ == "__main__":
    print("=" * 60)
    print("TEST BOT INTEGRATION - Resumen")
    print("=" * 60)
    
    test_classes = [
        TestIsAuthorized,
        TestGetUserContext,
        TestExtractTags,
        TestBotInit,
    ]
    
    total = sum(len([m for m in dir(cls) if m.startswith('test_')]) for cls in test_classes)
    print(f"Total tests: {total}")
    print("=" * 60)
    
    pytest.main([__file__, "-v", "--tb=short"])

#!/usr/bin/env python3
"""
Tests unitarios para memory_engine.py
Valida persistencia, preferencias y memoria del usuario.
"""

import pytest
import sqlite3
import os
import tempfile
import threading
import time
from datetime import datetime

# Importar el módulo a testear
import sys
sys.path.insert(0, '/Users/alannaimtapia/Desktop/Programacion/voice/telegram-kimi-bridge')

from memory_engine import (
    MemoryEngine,
    UserContext,
    UserPreferences,
    Interaction,
    get_memory_engine,
)


@pytest.fixture
def temp_db():
    """Fixture que crea una DB temporal para cada test"""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    yield db_path
    # Limpiar después del test
    if os.path.exists(db_path):
        os.unlink(db_path)


@pytest.fixture
def memory_engine(temp_db):
    """Fixture que crea un MemoryEngine con DB limpia"""
    return MemoryEngine(db_path=temp_db)


class TestMemoryEngineInit:
    """Tests para inicialización del MemoryEngine"""
    
    def test_init_creates_database(self, temp_db):
        """Verifica que inicialización crea el archivo de DB"""
        engine = MemoryEngine(db_path=temp_db)
        assert os.path.exists(temp_db)
    
    def test_init_creates_tables(self, temp_db):
        """Verifica que crea todas las tablas necesarias"""
        engine = MemoryEngine(db_path=temp_db)
        
        with sqlite3.connect(temp_db) as conn:
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
            tables = {row[0] for row in cursor.fetchall()}
            
            assert 'interactions' in tables
            assert 'user_preferences' in tables
            assert 'context_summaries' in tables
    
    def test_init_creates_indexes(self, temp_db):
        """Verifica que crea los índices necesarios"""
        engine = MemoryEngine(db_path=temp_db)
        
        with sqlite3.connect(temp_db) as conn:
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index'"
            )
            indexes = {row[0] for row in cursor.fetchall()}
            
            assert 'idx_interactions_user_time' in indexes
            assert 'idx_interactions_tags' in indexes


class TestRecordInteraction:
    """Tests para registro de interacciones"""
    
    def test_record_interaction_returns_id(self, memory_engine):
        """Verifica que retorna un ID de interacción"""
        interaction_id = memory_engine.record_interaction(
            user_id=12345,
            message="Test message",
            response="Test response",
            success=True,
            execution_time_ms=1000,
            work_dir="/test",
            tags=["test", "review"]
        )
        
        assert isinstance(interaction_id, int)
        assert interaction_id > 0
    
    def test_record_interaction_saves_to_db(self, memory_engine, temp_db):
        """Verifica que guarda correctamente en la DB"""
        memory_engine.record_interaction(
            user_id=12345,
            message="Test message",
            response="Test response",
            success=True,
            execution_time_ms=500,
            work_dir="/test/path",
            tags=["feature"]
        )
        
        with sqlite3.connect(temp_db) as conn:
            cursor = conn.execute(
                "SELECT user_id, message, success FROM interactions WHERE user_id = ?",
                (12345,)
            )
            row = cursor.fetchone()
            assert row is not None
            assert row[0] == 12345
            assert row[1] == "Test message"
            assert row[2] == 1
    
    def test_record_interaction_updates_user_stats(self, memory_engine, temp_db):
        """Verifica que actualiza estadísticas del usuario"""
        memory_engine.record_interaction(user_id=99999, message="Msg 1")
        memory_engine.record_interaction(user_id=99999, message="Msg 2")
        
        with sqlite3.connect(temp_db) as conn:
            cursor = conn.execute(
                "SELECT interaction_count FROM user_preferences WHERE user_id = ?",
                (99999,)
            )
            row = cursor.fetchone()
            assert row[0] == 2


class TestGetUserContext:
    """Tests para obtención de contexto de usuario"""
    
    def test_get_user_context_new_user(self, memory_engine):
        """Verifica contexto para usuario nuevo"""
        ctx = memory_engine.get_user_context(user_id=11111)
        
        assert ctx.user_id == 11111
        assert ctx.interaction_count == 0
        assert ctx.preferences == {}
    
    def test_get_user_context_existing_user(self, memory_engine):
        """Verifica contexto para usuario existente"""
        # Registrar interacción para crear usuario
        memory_engine.record_interaction(user_id=22222, message="Hello")
        memory_engine.update_preferences(22222, preferred_name="TestUser")
        
        ctx = memory_engine.get_user_context(user_id=22222)
        
        assert ctx.user_id == 22222
        assert ctx.interaction_count == 1
        assert ctx.preferences.get("preferred_name") == "TestUser"
    
    def test_get_user_context_includes_stats(self, memory_engine):
        """Verifica que incluye estadísticas"""
        # Crear múltiples interacciones
        for i in range(5):
            memory_engine.record_interaction(
                user_id=33333,
                message=f"Msg {i}",
                success=(i % 2 == 0)
            )
        
        ctx = memory_engine.get_user_context(user_id=33333)
        assert ctx.interaction_count == 5


class TestUpdatePreferences:
    """Tests para actualización de preferencias"""
    
    def test_update_preferences_name(self, memory_engine):
        """Verifica actualización de nombre preferido"""
        result = memory_engine.update_preferences(
            user_id=44444,
            preferred_name="Alanna"
        )
        
        assert result is True
        
        ctx = memory_engine.get_user_context(44444)
        assert ctx.preferences.get("preferred_name") == "Alanna"
    
    def test_update_preferences_tech_stack(self, memory_engine):
        """Verifica actualización de stack tecnológico"""
        result = memory_engine.update_preferences(
            user_id=55555,
            tech_stack=["React", "Node.js", "TypeScript"]
        )
        
        assert result is True
        
        ctx = memory_engine.get_user_context(55555)
        assert "React" in ctx.preferences.get("tech_stack", [])
        assert "Node.js" in ctx.preferences.get("tech_stack", [])
    
    def test_update_preferences_code_style(self, memory_engine):
        """Verifica actualización de estilo de código"""
        memory_engine.update_preferences(
            user_id=66666,
            code_style="clean"
        )
        
        ctx = memory_engine.get_user_context(66666)
        assert ctx.preferences.get("code_style") == "clean"
    
    def test_update_preferences_communication_style(self, memory_engine):
        """Verifica actualización de estilo de comunicación"""
        memory_engine.update_preferences(
            user_id=77777,
            communication_style="formal"
        )
        
        ctx = memory_engine.get_user_context(77777)
        assert ctx.preferences.get("communication_style") == "formal"
    
    def test_update_preferences_multiple_fields(self, memory_engine):
        """Verifica actualización de múltiples campos a la vez"""
        memory_engine.update_preferences(
            user_id=88888,
            preferred_name="Test",
            tech_stack=["Python"],
            code_style="modern",
            communication_style="casual"
        )
        
        ctx = memory_engine.get_user_context(88888)
        assert ctx.preferences.get("preferred_name") == "Test"
        assert ctx.preferences.get("tech_stack") == ["Python"]
        assert ctx.preferences.get("code_style") == "modern"


class TestGetConversationHistory:
    """Tests para historial de conversaciones"""
    
    def test_get_history_empty(self, memory_engine):
        """Verifica historial vacío para usuario nuevo"""
        history = memory_engine.get_conversation_history(user_id=10001, limit=10)
        assert history == []
    
    def test_get_history_returns_interactions(self, memory_engine):
        """Verifica que retorna interacciones"""
        memory_engine.record_interaction(
            user_id=10002,
            message="Question",
            response="Answer",
            success=True
        )
        
        history = memory_engine.get_conversation_history(user_id=10002, limit=10)
        
        assert len(history) == 1
        assert history[0]["message"] == "Question"
        assert history[0]["response"] == "Answer"
    
    def test_get_history_respects_limit(self, memory_engine):
        """Verifica que respeta el límite"""
        for i in range(10):
            memory_engine.record_interaction(user_id=10003, message=f"Msg {i}")
        
        history = memory_engine.get_conversation_history(user_id=10003, limit=5)
        assert len(history) == 5
    
    def test_get_history_ordered_chronologically(self, memory_engine):
        """Verifica orden cronológico"""
        memory_engine.record_interaction(user_id=10004, message="First")
        time.sleep(0.01)  # Pequeña pausa para diferenciar timestamps
        memory_engine.record_interaction(user_id=10004, message="Second")
        
        history = memory_engine.get_conversation_history(user_id=10004, limit=10)
        
        # Debe estar en orden cronológico (primero First, luego Second)
        assert history[0]["message"] == "First"
        assert history[1]["message"] == "Second"


class TestSearchMemory:
    """Tests para búsqueda en memoria"""
    
    def test_search_finds_matching_messages(self, memory_engine):
        """Verifica que encuentra mensajes que coinciden"""
        memory_engine.record_interaction(user_id=20001, message="React component bug", response="Fix it")
        memory_engine.record_interaction(user_id=20001, message="Node.js API issue", response="Check logs")
        
        results = memory_engine.search_memory(user_id=20001, query="React", limit=10)
        
        assert len(results) == 1
        assert "React" in results[0]["message"]
    
    def test_search_returns_empty_if_no_match(self, memory_engine):
        """Verifica que retorna vacío si no hay coincidencias"""
        memory_engine.record_interaction(user_id=20002, message="Test message")
        
        results = memory_engine.search_memory(user_id=20002, query="NonExistent", limit=10)
        
        assert results == []
    
    def test_search_respects_limit(self, memory_engine):
        """Verifica que respeta el límite de resultados"""
        for i in range(10):
            memory_engine.record_interaction(user_id=20003, message=f"React issue {i}")
        
        results = memory_engine.search_memory(user_id=20003, query="React", limit=3)
        assert len(results) == 3


class TestGetStats:
    """Tests para estadísticas"""
    
    def test_get_stats_empty_user(self, memory_engine):
        """Verifica estadísticas para usuario sin interacciones"""
        stats = memory_engine.get_stats(user_id=30001)
        
        assert stats["total_interactions"] == 0
        assert stats["success_rate"] == 0
    
    def test_get_stats_calculates_correctly(self, memory_engine):
        """Verifica cálculo de estadísticas"""
        memory_engine.record_interaction(user_id=30002, message="A", success=True)
        memory_engine.record_interaction(user_id=30002, message="B", success=True)
        memory_engine.record_interaction(user_id=30002, message="C", success=False)
        
        stats = memory_engine.get_stats(user_id=30002)
        
        assert stats["total_interactions"] == 3
        assert stats["successful"] == 2
        assert stats["failed"] == 1
        assert abs(stats["success_rate"] - 66.67) < 0.1  # ~66.67%


class TestExtractInsights:
    """Tests para extracción de insights"""
    
    def test_extract_detects_tech_stack(self, memory_engine):
        """Verifica detección de stack tecnológico"""
        memory_engine.record_interaction(
            user_id=40001,
            message="Tengo un problema con React y Node.js"
        )
        memory_engine.record_interaction(
            user_id=40001,
            message="Mi MongoDB no conecta"
        )
        
        insights = memory_engine.extract_insights(user_id=40001)
        
        detected = insights.get("detected_tech_stack", [])
        assert "react" in detected or "mongodb" in detected
    
    def test_extract_detects_task_types(self, memory_engine):
        """Verifica detección de tipos de tareas"""
        memory_engine.record_interaction(user_id=40002, message="Arregla este bug por favor")
        
        insights = memory_engine.extract_insights(user_id=40002)
        
        task_types = insights.get("common_task_types", {})
        assert task_types.get("bug_fix", 0) > 0


class TestThreadSafety:
    """Tests para thread safety"""
    
    def test_concurrent_record_interaction(self, memory_engine):
        """Verifica registro concurrente de interacciones"""
        errors = []
        
        def record_interactions(user_id):
            try:
                for i in range(10):
                    memory_engine.record_interaction(
                        user_id=user_id,
                        message=f"Msg {i}"
                    )
            except Exception as e:
                errors.append(e)
        
        threads = []
        for i in range(5):
            t = threading.Thread(target=record_interactions, args=(50000 + i,))
            threads.append(t)
            t.start()
        
        for t in threads:
            t.join()
        
        assert len(errors) == 0, f"Errors occurred: {errors}"
        
        # Verificar que todas las interacciones se guardaron
        for i in range(5):
            stats = memory_engine.get_stats(user_id=50000 + i)
            assert stats["total_interactions"] == 10


class TestDataClasses:
    """Tests para dataclasses"""
    
    def test_user_preferences_defaults(self):
        """Verifica valores por defecto de UserPreferences"""
        prefs = UserPreferences()
        assert prefs.preferred_name == ""
        assert prefs.tech_stack == []
        assert prefs.code_style == ""
        assert prefs.communication_style == "casual"
    
    def test_user_preferences_tech_stack_mutable(self):
        """Verifica que tech_stack es mutable por instancia"""
        p1 = UserPreferences()
        p2 = UserPreferences()
        
        p1.tech_stack.append("React")
        assert p1.tech_stack == ["React"]
        assert p2.tech_stack == []  # No comparten lista


# Estadísticas
if __name__ == "__main__":
    print("=" * 60)
    print("TEST MEMORY ENGINE - Resumen")
    print("=" * 60)
    
    test_classes = [
        TestMemoryEngineInit,
        TestRecordInteraction,
        TestGetUserContext,
        TestUpdatePreferences,
        TestGetConversationHistory,
        TestSearchMemory,
        TestGetStats,
        TestExtractInsights,
        TestThreadSafety,
        TestDataClasses,
    ]
    
    total = sum(len([m for m in dir(cls) if m.startswith('test_')]) for cls in test_classes)
    print(f"Total tests: {total}")
    print("=" * 60)
    
    pytest.main([__file__, "-v", "--tb=short"])

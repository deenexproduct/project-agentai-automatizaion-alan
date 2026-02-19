#!/usr/bin/env python3
"""
Motor de memoria avanzada para el bot de Telegram.
Guarda conversaciones, preferencias del usuario y contexto entre sesiones.

Inspirado en el sistema de memoria de OpenClaw pero simplificado para Kimi CLI.
"""

import json
import os
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional
from dataclasses import dataclass, asdict
import threading


@dataclass
class UserPreferences:
    """Preferencias del usuario"""
    preferred_name: str = ""
    tech_stack: list = None
    code_style: str = ""
    communication_style: str = "casual"  # casual, formal, technical
    notification_enabled: bool = True
    
    def __post_init__(self):
        if self.tech_stack is None:
            self.tech_stack = []


@dataclass  
class Interaction:
    """Una interacción individual con el bot"""
    id: int
    user_id: int
    timestamp: str
    message: str
    response: str
    success: bool
    execution_time_ms: int
    work_dir: str
    tags: list = None
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []


@dataclass
class UserContext:
    """Contexto completo de un usuario"""
    user_id: int
    first_seen: str
    last_seen: str
    interaction_count: int
    preferences: dict
    recent_topics: list
    common_commands: dict
    
    def to_dict(self) -> dict:
        return asdict(self)


class MemoryEngine:
    """
    Motor de memoria basado en SQLite.
    Persiste conversaciones y aprende preferencias del usuario.
    """
    
    def __init__(self, db_path: str = "bot_memory.db"):
        self.db_path = db_path
        self.lock = threading.Lock()
        self._init_db()
    
    def _init_db(self):
        """Inicializa el esquema de la base de datos"""
        with sqlite3.connect(self.db_path) as conn:
            # Tabla de interacciones
            conn.execute("""
                CREATE TABLE IF NOT EXISTS interactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    message TEXT NOT NULL,
                    response TEXT,
                    success BOOLEAN,
                    execution_time_ms INTEGER,
                    work_dir TEXT,
                    tags TEXT,
                    message_length INTEGER,
                    response_length INTEGER
                )
            """)
            
            # Tabla de preferencias de usuario
            conn.execute("""
                CREATE TABLE IF NOT EXISTS user_preferences (
                    user_id INTEGER PRIMARY KEY,
                    first_seen TEXT NOT NULL,
                    last_seen TEXT NOT NULL,
                    interaction_count INTEGER DEFAULT 0,
                    preferred_name TEXT,
                    tech_stack TEXT,
                    code_style TEXT,
                    communication_style TEXT DEFAULT 'casual',
                    context_json TEXT
                )
            """)
            
            # Tabla de resumen de contexto (para búsqueda rápida)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS context_summaries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    key_points TEXT,
                    related_topics TEXT
                )
            """)
            
            # Índices para búsqueda eficiente
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_interactions_user_time 
                ON interactions(user_id, timestamp)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_interactions_tags 
                ON interactions(tags)
            """)
            
            conn.commit()
    
    # ============ MÉTODOS PÚBLICOS ============
    
    def record_interaction(self, user_id: int, message: str, response: str = "",
                          success: bool = True, execution_time_ms: int = 0,
                          work_dir: str = "", tags: list = None) -> int:
        """
        Registra una nueva interacción en la memoria.
        
        Returns:
            ID de la interacción registrada
        """
        with self.lock:
            timestamp = datetime.now().isoformat()
            tags_json = json.dumps(tags) if tags else None
            
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute("""
                    INSERT INTO interactions 
                    (user_id, timestamp, message, response, success, 
                     execution_time_ms, work_dir, tags, message_length, response_length)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    user_id, timestamp, message, response, success,
                    execution_time_ms, work_dir, tags_json,
                    len(message), len(response)
                ))
                interaction_id = cursor.lastrowid
                
                # Actualizar contador del usuario
                self._update_user_stats(conn, user_id, timestamp)
                
                conn.commit()
                return interaction_id
    
    def get_user_context(self, user_id: int) -> UserContext:
        """
        Obtiene el contexto completo de un usuario.
        Incluye preferencias y estadísticas.
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            
            # Obtener preferencias
            row = conn.execute(
                "SELECT * FROM user_preferences WHERE user_id = ?",
                (user_id,)
            ).fetchone()
            
            if row:
                preferences = {
                    "preferred_name": row["preferred_name"] or "",
                    "tech_stack": json.loads(row["tech_stack"]) if row["tech_stack"] else [],
                    "code_style": row["code_style"] or "",
                    "communication_style": row["communication_style"] or "casual",
                }
                first_seen = row["first_seen"]
                last_seen = row["last_seen"]
                interaction_count = row["interaction_count"]
            else:
                # Nuevo usuario
                preferences = {}
                first_seen = datetime.now().isoformat()
                last_seen = first_seen
                interaction_count = 0
                self._create_user_profile(conn, user_id, first_seen)
            
            # Obtener temas recientes
            recent_topics = self._extract_recent_topics(conn, user_id)
            
            # Obtener comandos comunes
            common_commands = self._get_common_commands(conn, user_id)
            
            return UserContext(
                user_id=user_id,
                first_seen=first_seen,
                last_seen=last_seen,
                interaction_count=interaction_count,
                preferences=preferences,
                recent_topics=recent_topics,
                common_commands=common_commands
            )
    
    def update_preferences(self, user_id: int, **kwargs) -> bool:
        """
        Actualiza las preferencias de un usuario.
        
        Args:
            user_id: ID del usuario
            **kwargs: Campos a actualizar (preferred_name, tech_stack, code_style, etc.)
        
        Returns:
            True si se actualizó correctamente
        """
        with self.lock:
            with sqlite3.connect(self.db_path) as conn:
                # Obtener preferencias actuales
                row = conn.execute(
                    "SELECT * FROM user_preferences WHERE user_id = ?",
                    (user_id,)
                ).fetchone()
                
                if not row:
                    # Crear perfil si no existe
                    self._create_user_profile(conn, user_id, datetime.now().isoformat())
                
                # Campos permitidos
                allowed_fields = {
                    "preferred_name": str,
                    "tech_stack": lambda x: json.dumps(x) if isinstance(x, list) else x,
                    "code_style": str,
                    "communication_style": str,
                }
                
                updates = []
                values = []
                for key, value in kwargs.items():
                    if key in allowed_fields:
                        updates.append(f"{key} = ?")
                        values.append(allowed_fields[key](value))
                
                if updates:
                    values.append(user_id)
                    query = f"UPDATE user_preferences SET {', '.join(updates)} WHERE user_id = ?"
                    conn.execute(query, values)
                    conn.commit()
                    return True
                
                return False
    
    def get_conversation_history(self, user_id: int, limit: int = 10) -> list:
        """
        Obtiene el historial reciente de conversaciones.
        
        Args:
            user_id: ID del usuario
            limit: Número de interacciones a recuperar
            
        Returns:
            Lista de diccionarios con message y response
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("""
                SELECT message, response, timestamp, success
                FROM interactions
                WHERE user_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
            """, (user_id, limit)).fetchall()
            
            return [
                {
                    "message": row["message"],
                    "response": row["response"],
                    "timestamp": row["timestamp"],
                    "success": row["success"]
                }
                for row in reversed(rows)  # Orden cronológico
            ]
    
    def search_memory(self, user_id: int, query: str, limit: int = 5) -> list:
        """
        Búsqueda simple en la memoria (búsqueda por contenido).
        
        Args:
            user_id: ID del usuario
            query: Término de búsqueda
            limit: Máximo de resultados
            
        Returns:
            Lista de interacciones relevantes
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            # Búsqueda simple con LIKE (en producción usaríamos FTS)
            pattern = f"%{query}%"
            rows = conn.execute("""
                SELECT message, response, timestamp
                FROM interactions
                WHERE user_id = ? AND (message LIKE ? OR response LIKE ?)
                ORDER BY timestamp DESC
                LIMIT ?
            """, (user_id, pattern, pattern, limit)).fetchall()
            
            return [
                {
                    "message": row["message"],
                    "response": row["response"],
                    "timestamp": row["timestamp"]
                }
                for row in rows
            ]
    
    def get_stats(self, user_id: int) -> dict:
        """
        Obtiene estadísticas del usuario.
        
        Returns:
            Diccionario con estadísticas
        """
        with sqlite3.connect(self.db_path) as conn:
            # Total de interacciones
            total = conn.execute(
                "SELECT COUNT(*) FROM interactions WHERE user_id = ?",
                (user_id,)
            ).fetchone()[0]
            
            # Interacciones exitosas vs fallidas
            success_count = conn.execute(
                "SELECT COUNT(*) FROM interactions WHERE user_id = ? AND success = 1",
                (user_id,)
            ).fetchone()[0]
            
            # Tiempo promedio de respuesta
            avg_time = conn.execute(
                "SELECT AVG(execution_time_ms) FROM interactions WHERE user_id = ?",
                (user_id,)
            ).fetchone()[0] or 0
            
            # Primera y última interacción
            first = conn.execute(
                "SELECT MIN(timestamp) FROM interactions WHERE user_id = ?",
                (user_id,)
            ).fetchone()[0]
            
            last = conn.execute(
                "SELECT MAX(timestamp) FROM interactions WHERE user_id = ?",
                (user_id,)
            ).fetchone()[0]
            
            return {
                "total_interactions": total,
                "successful": success_count,
                "failed": total - success_count,
                "success_rate": (success_count / total * 100) if total > 0 else 0,
                "avg_response_time_ms": int(avg_time),
                "first_interaction": first,
                "last_interaction": last,
            }
    
    def extract_insights(self, user_id: int) -> dict:
        """
        Extrae insights sobre el comportamiento del usuario.
        Útil para personalizar la experiencia.
        """
        with sqlite3.connect(self.db_path) as conn:
            # Temas más frecuentes (basado en palabras clave simples)
            # En producción usaríamos NLP
            rows = conn.execute(
                "SELECT message FROM interactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50",
                (user_id,)
            ).fetchall()
            
            messages = [row[0].lower() for row in rows]
            
            # Detectar stack tecnológico mencionado
            tech_keywords = {
                "react", "vue", "angular", "svelte", "node", "python", "typescript",
                "javascript", "mongodb", "postgres", "sql", "docker", "kubernetes",
                "aws", "gcp", "azure", "git", "github", "gitlab", "express", "fastapi",
                "django", "flask", "nextjs", "nuxt", "tailwind", "bootstrap"
            }
            
            mentioned_tech = set()
            for msg in messages:
                for tech in tech_keywords:
                    if tech in msg:
                        mentioned_tech.add(tech)
            
            # Detectar tipo de tareas más comunes
            task_types = {
                "code_review": ["revisa", "review", "analiza", "explica"],
                "bug_fix": ["arregla", "fix", "bug", "error", "problema"],
                "feature": ["crea", "implementa", "nuevo", "función", "feature"],
                "refactor": ["optimiza", "mejora", "refactor", "limpia"],
                "learning": ["explica", "cómo", "qué es", "tutorial"],
            }
            
            task_counts = {task: 0 for task in task_types}
            for msg in messages:
                for task, keywords in task_types.items():
                    if any(kw in msg for kw in keywords):
                        task_counts[task] += 1
            
            return {
                "detected_tech_stack": sorted(mentioned_tech),
                "common_task_types": dict(sorted(task_counts.items(), key=lambda x: x[1], reverse=True)),
                "primary_focus": max(task_counts.items(), key=lambda x: x[1])[0] if any(task_counts.values()) else "general",
            }
    
    # ============ MÉTODOS PRIVADOS ============
    
    def _update_user_stats(self, conn: sqlite3.Connection, user_id: int, timestamp: str):
        """Actualiza las estadísticas del usuario"""
        conn.execute("""
            INSERT INTO user_preferences (user_id, first_seen, last_seen, interaction_count)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(user_id) DO UPDATE SET
                last_seen = excluded.last_seen,
                interaction_count = interaction_count + 1
        """, (user_id, timestamp, timestamp))
    
    def _create_user_profile(self, conn: sqlite3.Connection, user_id: int, timestamp: str):
        """Crea un perfil de usuario nuevo"""
        conn.execute("""
            INSERT OR IGNORE INTO user_preferences 
            (user_id, first_seen, last_seen, interaction_count)
            VALUES (?, ?, ?, 0)
        """, (user_id, timestamp, timestamp))
    
    def _extract_recent_topics(self, conn: sqlite3.Connection, user_id: int, limit: int = 5) -> list:
        """Extrae temas recientes de las conversaciones"""
        rows = conn.execute(
            "SELECT message FROM interactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20",
            (user_id,)
        ).fetchall()
        
        # Extracción simple de temas (palabras clave técnicas)
        keywords = ["componente", "endpoint", "API", "bug", "error", "función", "test", "config"]
        topics = []
        
        for row in rows:
            msg = row[0].lower()
            for kw in keywords:
                if kw in msg and kw not in topics:
                    topics.append(kw)
                    if len(topics) >= limit:
                        break
            if len(topics) >= limit:
                break
        
        return topics
    
    def _get_common_commands(self, conn: sqlite3.Connection, user_id: int) -> dict:
        """Obtiene los comandos más usados por el usuario"""
        rows = conn.execute(
            "SELECT message FROM interactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50",
            (user_id,)
        ).fetchall()
        
        commands = {}
        for row in rows:
            msg = row[0].strip().lower()
            if msg.startswith("/"):
                cmd = msg.split()[0]
                commands[cmd] = commands.get(cmd, 0) + 1
        
        return dict(sorted(commands.items(), key=lambda x: x[1], reverse=True)[:5])


# ============ FUNCIÓN DE UTILIDAD ============

def get_memory_engine(db_path: str = "bot_memory.db") -> MemoryEngine:
    """Factory function para obtener el motor de memoria"""
    return MemoryEngine(db_path)


# Exportar
__all__ = [
    "MemoryEngine",
    "UserContext", 
    "UserPreferences",
    "Interaction",
    "get_memory_engine",
]

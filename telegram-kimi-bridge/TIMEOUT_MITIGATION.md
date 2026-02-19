# Plan de Mitigación de Timeouts

## 🔍 Diagnóstico del Problema

### Causa Raíz
El error de timeout ocurre porque:

1. **Prompt muy largo**: El system prompt construido por `persona.py` es extenso (incluye identidad, personalidad, contexto de usuario, workspace, historial, etc.)

2. **Kimi CLI procesa todo de una vez**: Cada mensaje envía todo el contexto, haciendo que el procesamiento tome mucho tiempo

3. **Timeout fijo de 5 minutos**: Operaciones complejas (análisis de múltiples archivos, refactorizaciones grandes) pueden exceder este límite

## 📊 Plan de Mitigación (3 Niveles)

### Nivel 1: Optimización Inmediata (AHORA)
- Reducir tamaño del system prompt
- Aumentar timeout a 10 minutos para tareas complejas
- Implementar detección de complejidad

### Nivel 2: Mejoras de UX (CORTO PLAZO)
- Mensajes de progreso durante operaciones largas
- Opción de cancelar operación en curso
- Sistema de "modo rápido" vs "modo profundo"

### Nivel 3: Arquitectura Avanzada (MEDIANO PLAZO)
- Sistema de jobs asíncronos con notificaciones
- Caché de contexto frecuente
- Streaming de respuestas parciales

## 🛠️ Implementación Nivel 1

### Cambios a realizar:

1. **Compactar system prompt** - Reducir de ~2000 a ~800 tokens
2. **Timeout adaptativo** - 3 min para simples, 10 min para complejas
3. **Detección de complejidad** - Basada en keywords del mensaje
4. **Mensajes de progreso** - Informar al usuario que se está procesando

## ✅ Solución Aplicada

Ver `bot_optimized.py` para implementación con:
- Prompts optimizados
- Timeout configurable
- Sistema de complejidad
- Mejor manejo de errores

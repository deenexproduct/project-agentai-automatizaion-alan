---
description: Workflow sistemático para resolver bugs y problemas de diseño/funcionales en la plataforma VoiceCommand
---

# 🐛 Bug Resolution Workflow

> Basado en los skills: **systematic-debugging** (obra/superpowers), **webapp-testing** (anthropics/skills), y **verification-before-completion** (obra/superpowers)

// turbo-all

## ⚙️ Regla de Hierro

```
NO SE IMPLEMENTAN FIXES SIN INVESTIGAR LA CAUSA RAÍZ PRIMERO
NO SE RECLAMA COMPLETADO SIN EVIDENCIA DE VERIFICACIÓN FRESCA
```

---

## Proceso de Resolución (4 Fases)

### FASE 1: Investigación de Causa Raíz

Antes de intentar CUALQUIER fix:

1. **Leer mensajes de error cuidadosamente**
   - No saltar errores o warnings
   - Leer stack traces completos
   - Anotar líneas, archivos, códigos de error

2. **Reproducir consistentemente**
   - ¿Se puede triggear de forma confiable?
   - ¿Cuáles son los pasos exactos?
   - Si no es reproducible → recopilar más datos, NO adivinar

3. **Revisar cambios recientes**
   - `git diff` y commits recientes
   - Nuevas dependencias, cambios de config
   - Diferencias ambientales

4. **Recopilar evidencia en el sistema multi-componente**
   - Para CADA frontera de componente (Client ↔ Server ↔ DB):
     - Logguear qué datos entran al componente
     - Logguear qué datos salen del componente
     - Verificar propagación de env/config
     - Checkear estado en cada capa
   - Ejecutar una vez para recopilar evidencia mostrando DÓNDE se rompe

### FASE 2: Análisis de Patrones

1. **Encontrar ejemplos funcionales** - Localizar código similar que funcione en el mismo codebase
2. **Comparar contra referencias** - Leer implementación de referencia COMPLETA, no skimear
3. **Identificar diferencias** - Listar CADA diferencia, por pequeña que sea
4. **Entender dependencias** - Qué otros componentes necesita, qué config, qué asume

### FASE 3: Hipótesis y Testing

Método científico:
1. **Formar UNA hipótesis** - "Creo que X es la causa raíz porque Y" - Escribirla, ser específico
2. **Testear mínimamente** - El cambio MÁS PEQUEÑO posible para testear la hipótesis - Una variable a la vez
3. **Verificar antes de continuar** - ¿Funcionó? → Fase 4 | ¿No funcionó? → Nueva hipótesis
4. **Si no sabés** - Decirlo, no pretender conocer la respuesta

### FASE 4: Implementación

1. **Implementar fix único** - Abordar la causa raíz identificada - UN cambio a la vez - Nada de "ya que estoy aquí" mejoras
2. **Verificar fix**
   - Para el **server**: correr `cd /Users/alannaimtapia/Desktop/Programacion/voice/server && npx tsc --noEmit`
   - Para el **client**: correr `cd /Users/alannaimtapia/Desktop/Programacion/voice/client && npx tsc --noEmit`
   - Verificar que no hay regresiones
3. **Si el fix no funciona después de 3 intentos** → PARAR y cuestionar la arquitectura

---

## 🚩 Red Flags - PARAR y volver a Fase 1

Si te encontrás pensando:
- "Fix rápido por ahora, investigar después"
- "Simplemente probar cambiar X y ver si funciona"
- "Agregar múltiples cambios, correr tests"
- "Es probablemente X, dejame arreglar eso"
- "No entiendo completamente pero esto podría funcionar"
- Proponiendo soluciones ANTES de trazar el flujo de datos

---

## ✅ Verificación Antes de Completar

**Ley de Hierro**: NO claims de completitud sin evidencia de verificación fresca.

Antes de reclamar CUALQUIER status:
1. **IDENTIFICAR**: ¿Qué comando prueba este claim?
2. **EJECUTAR**: Ejecutar el comando COMPLETO (fresco, completo)
3. **LEER**: Output completo, verificar exit code
4. **VERIFICAR**: ¿El output confirma el claim?
   - Si NO: Reportar status actual con evidencia
   - Si SÍ: Reportar claim CON evidencia

### Validación del Server
```bash
cd /Users/alannaimtapia/Desktop/Programacion/voice/server && npx tsc --noEmit
```

### Validación del Client
```bash
cd /Users/alannaimtapia/Desktop/Programacion/voice/client && npx tsc --noEmit
```

### Validación Visual (para bugs de diseño)
- Usar el browser subagent para navegar a la página afectada
- Tomar screenshot antes y después del fix
- Comparar visualmente que el problema se resolvió

---

## 📋 Template de Reporte por Bug

Para cada bug resuelto, documentar:

```markdown
### Bug: [Título descriptivo]

**Clasificación**: [Sintáctico | Lógico | Runtime | Asíncrono | Diseño | UI/UX]
**Severidad**: [Crítico | Alto | Medio | Bajo]
**Archivos afectados**: [lista de archivos]

#### Causa Raíz
[Descripción técnica de la causa raíz]

#### Solución Implementada
[Descripción de los cambios realizados]

#### Verificación
- [ ] TypeScript compila sin errores
- [ ] No hay regresiones
- [ ] Verificación visual (si aplica)

#### Cambios Realizados
| Archivo | Cambio | Razón |
|---------|--------|-------|
| ... | ... | ... |
```

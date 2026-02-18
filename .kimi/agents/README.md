# VoiceCommand - Sistema de Agentes

Sistema completo de agentes y subagentes para el proyecto VoiceCommand usando Kimi CLI.

## 🚀 Inicio Rápido

### Usar el Agente Principal

```bash
cd /Users/alannaimtapia/Desktop/Programacion/voice
kimi --agent-file .kimi/agents/voicecommand-main.yaml
```

### Verificar Estructura

```bash
# Listar todos los agentes
ls -la .kimi/agents/subagents/
```

## 📋 Arquitectura

```
Agente Principal (voicecommand-main)
├── Backend Developer (backend-dev)
├── Frontend Developer (frontend-dev)
├── Database Engineer (database-engineer)
├── LinkedIn Automation (linkedin-automation)
├── AI Enrichment (ai-enrichment)
├── QA/Tester (qa-tester)
├── DevOps Engineer (devops-engineer)
└── Documentation (documentation)
```

## 🎯 Uso

### Ejemplo 1: Tarea Simple (un subagente)

```yaml
# El agente principal decide delegar a backend-dev
Task:
  description: "Crear endpoint de API"
  subagent_name: "backend-dev"
  prompt: |
    Crea un endpoint GET /api/contacts/:id que retorne un contacto por ID.
    
    Archivos:
    - server/src/routes/contact.routes.ts
    - server/src/controllers/contact.controller.ts
```

### Ejemplo 2: Tarea Compleja (múltiples subagentes)

```yaml
# Tarea: Agregar exportación a CSV

# 1. Backend + Database (paralelo)
Task:
  subagent_name: "backend-dev"
  prompt: "Crear endpoint POST /api/export/csv"
  
Task:
  subagent_name: "database-engineer"
  prompt: "Optimizar query para exportación masiva"

# 2. Frontend (después del backend)
Task:
  subagent_name: "frontend-dev"
  prompt: "Crear botón de exportar en UI"

# 3. QA + Documentation
Task:
  subagent_name: "qa-tester"
  prompt: "Tests de exportación"
  
Task:
  subagent_name: "documentation"
  prompt: "Documentar feature en README"
```

## 📁 Archivos

### Agente Principal
- `voicecommand-main.yaml` - Configuración del agente orquestador
- `system.md` - System prompt con instrucciones generales

### Subagentes
Cada subagente tiene:
- `{name}.yaml` - Configuración
- `{name}.md` - System prompt especializado

## 🛠️ Personalización

### Agregar un Nuevo Subagente

1. Crear archivo YAML en `subagents/`:

```yaml
# subagents/my-agent.yaml
version: 1
agent:
  name: my-agent
  description: "Descripción del agente"
  extend: ../voicecommand-main.yaml
  system_prompt_path: ./my-agent.md
  exclude_tools:
    - "kimi_cli.tools.multiagent:Task"
```

2. Crear system prompt:

```markdown
# subagents/my-agent.md
Eres un especialista en...
```

3. Registrar en el agente principal:

```yaml
# voicecommand-main.yaml
subagents:
  my-agent:
    path: ./subagents/my-agent.yaml
    description: "Descripción"
```

## 📚 Documentación

- `../AGENTS.md` - Documentación completa del proyecto
- `https://moonshotai.github.io/kimi-cli/en/customization/agents.html` - Docs oficiales

## ✅ Checklist de Funcionamiento

- [ ] Agente principal carga sin errores
- [ ] Subagentes tienen system prompts especializados
- [ ] Cada subagente tiene las tools correctas
- [ ] Tool `Task` excluida en subagentes (para evitar loops)
- [ ] Archivos YAML tienen sintaxis válida

## 🐛 Troubleshooting

### Error: "Agent file not found"
Verificar que la ruta al archivo YAML es correcta:
```bash
ls -la .kimi/agents/voicecommand-main.yaml
```

### Error: "Subagent not found"
Verificar que el subagente está registrado en `voicecommand-main.yaml` y el archivo existe.

### Error: "Tool not available"
Los subagentes heredan tools del agente principal. Si necesitas excluir una tool (como `Task`), usa `exclude_tools`.

## 🎓 Mejores Prácticas

1. **Agente Principal**: Siempre analiza y descompone antes de delegar
2. **Contexto**: Proporciona archivos relevantes y ejemplos de código
3. **Paralelismo**: Ejecuta tareas independientes simultáneamente
4. **Verificación**: Revisa los resultados antes de considerar completo
5. **Documentación**: Actualiza AGENTS.md con nuevas convenciones

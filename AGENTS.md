# VoiceCommand - Agentes y Subagentes

Esta documentación describe la arquitectura de agentes configurada para el proyecto VoiceCommand usando Kimi CLI.

## 🎯 Arquitectura de Agentes

```
┌─────────────────────────────────────────────────────────────────┐
│                    VOICE COMMAND PLATFORM                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              AGENTE PRINCIPAL                            │   │
│  │         voicecommand-main (Orquestador)                 │   │
│  │                                                          │   │
│  │  • Analiza tareas complejas                              │   │
│  │  • Descompone en subtareas                               │   │
│  │  • Coordina subagentes especializados                    │   │
│  │  • Integra resultados                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│          ┌───────────────────┼───────────────────┐              │
│          │                   │                   │              │
│  ┌───────▼──────┐  ┌────────▼────────┐  ┌──────▼──────┐       │
│  │   BACKEND    │  │    FRONTEND     │  │  DATABASE   │       │
│  │     DEV      │  │       DEV       │  │  ENGINEER   │       │
│  │              │  │                 │  │             │       │
│  │ Node.js      │  │ React/Vite      │  │ MongoDB     │       │
│  │ Express      │  │ TypeScript      │  │ Mongoose    │       │
│  │ TypeScript   │  │ Tailwind        │  │ Schemas     │       │
│  └──────────────┘  └─────────────────┘  └─────────────┘       │
│                                                                │
│  ┌──────────────┐  ┌─────────────────┐  ┌─────────────┐       │
│  │   LINKEDIN   │  │      AI         │  │     QA      │       │
│  │ AUTOMATION   │  │  ENRICHMENT     │  │   TESTER    │       │
│  │              │  │                 │  │             │       │
│  │ Puppeteer    │  │ OpenRouter      │  │ Jest        │       │
│  │ Scraping     │  │ Prompts         │  │ Playwright  │       │
│  │ Automation   │  │ Web Search      │  │ Supertest   │       │
│  └──────────────┘  └─────────────────┘  └─────────────┘       │
│                                                                │
│  ┌──────────────┐  ┌─────────────────┐                        │
│  │    DEVOPS    │  │ DOCUMENTATION   │                        │
│  │  ENGINEER    │  │   WRITER        │                        │
│  │              │  │                 │                        │
│  │ Docker       │  │ READMEs         │                        │
│  │ CI/CD        │  │ API Docs        │                        │
│  │ PM2          │  │ Guides          │                        │
│  └──────────────┘  └─────────────────┘                        │
│                                                                │
└─────────────────────────────────────────────────────────────────┘
```

## 📂 Estructura de Archivos

```
.kimi/
└── agents/
    ├── voicecommand-main.yaml       # Agente principal
    ├── system.md                     # System prompt principal
    └── subagents/
        ├── backend-dev.yaml          # Backend Developer
        ├── backend-dev.md
        ├── frontend-dev.yaml         # Frontend Developer
        ├── frontend-dev.md
        ├── database-engineer.yaml    # Database Engineer
        ├── database-engineer.md
        ├── linkedin-automation.yaml  # LinkedIn Automation
        ├── linkedin-automation.md
        ├── ai-enrichment.yaml        # AI Enrichment
        ├── ai-enrichment.md
        ├── qa-tester.yaml            # QA/Tester
        ├── qa-tester.md
        ├── devops-engineer.yaml      # DevOps Engineer
        ├── devops-engineer.md
        ├── documentation.yaml        # Documentation Writer
        └── documentation.md
```

## 🚀 Uso de Agentes

### Iniciar con el Agente Principal

```bash
# Desde el directorio del proyecto
kimi --agent-file .kimi/agents/voicecommand-main.yaml
```

### Delegar Tareas a Subagentes

El agente principal puede delegar tareas a subagentes usando el tool `Task`:

```yaml
# El agente principal ejecuta:
Task:
  description: "Crear endpoint de exportación"
  subagent_name: "backend-dev"
  prompt: |
    Crea un endpoint POST /api/export/csv que exporte contactos a CSV.
    
    Requisitos:
    - Usar json2csv para conversión
    - Soportar filtros por status
    - Stream para archivos grandes
    
    Archivos relevantes:
    - server/src/routes/contact.routes.ts
    - server/src/services/contact.service.ts
```

## 🛠️ Subagentes Disponibles

### 1. Backend Developer (`backend-dev`)

**Especialización**: Node.js, Express, TypeScript, APIs REST

**Cuándo usar**:
- Crear nuevos endpoints API
- Implementar servicios de negocio
- Definir modelos de datos
- Middleware de validación
- Optimizar queries

**Ejemplo de tarea**:
```yaml
Task:
  subagent_name: "backend-dev"
  prompt: "Implementar endpoint PATCH /contacts/:id/enrich que dispare el enriquecimiento con AI"
```

### 2. Frontend Developer (`frontend-dev`)

**Especialización**: React, Vite, TypeScript, Tailwind CSS

**Cuándo usar**:
- Crear componentes React
- Implementar páginas/routes
- Diseñar interfaces de usuario
- Integrar con APIs
- Optimizar performance

**Ejemplo de tarea**:
```yaml
Task:
  subagent_name: "frontend-dev"
  prompt: "Crear componente KanbanBoard para mostrar contactos por estado"
```

### 3. Database Engineer (`database-engineer`)

**Especialización**: MongoDB, Mongoose, diseño de schemas

**Cuándo usar**:
- Diseñar nuevos schemas
- Optimizar queries lentas
- Crear índices
- Migraciones de datos
- Aggregation pipelines

**Ejemplo de tarea**:
```yaml
Task:
  subagent_name: "database-engineer"
  prompt: "Optimizar query de búsqueda de contactos agregando índices compuestos"
```

### 4. LinkedIn Automation (`linkedin-automation`)

**Especialización**: Puppeteer, scraping, automatización

**Cuándo usar**:
- Scrapear perfiles de LinkedIn
- Automatizar conexiones
- Extraer datos de empresa
- Manejar sesiones

**Ejemplo de tarea**:
```yaml
Task:
  subagent_name: "linkedin-automation"
  prompt: "Implementar función para enviar solicitudes de conexión con delays humanos"
```

### 5. AI Enrichment (`ai-enrichment`)

**Especialización**: OpenRouter, prompts engineering

**Cuándo usar**:
- Optimizar prompts de enriquecimiento
- Implementar anti-hallucination
- Integrar búsqueda web
- Mejorar confidence scoring

**Ejemplo de tarea**:
```yaml
Task:
  subagent_name: "ai-enrichment"
  prompt: "Mejorar el prompt de enriquecimiento para incluir fuentes de noticias"
```

### 6. QA/Tester (`qa-tester`)

**Especialización**: Jest, Playwright, testing

**Cuándo usar**:
- Escribir tests unitarios
- Crear tests de integración
- Implementar tests E2E
- Configurar coverage

**Ejemplo de tarea**:
```yaml
Task:
  subagent_name: "qa-tester"
  prompt: "Crear tests unitarios para el servicio de enriquecimiento"
```

### 7. DevOps Engineer (`devops-engineer`)

**Especialización**: Docker, deployment, CI/CD

**Cuándo usar**:
- Crear Dockerfiles
- Configurar CI/CD pipelines
- Setup de servidores
- Configurar Nginx

**Ejemplo de tarea**:
```yaml
Task:
  subagent_name: "devops-engineer"
  prompt: "Crear docker-compose.yml con MongoDB, Redis y la app"
```

### 8. Documentation (`documentation`)

**Especialización**: Technical writing, READMEs

**Cuándo usar**:
- Actualizar README
- Documentar APIs
- Crear guías de setup
- Escribir troubleshooting

**Ejemplo de tarea**:
```yaml
Task:
  subagent_name: "documentation"
  prompt: "Actualizar README con instrucciones de instalación de los nuevos skills"
```

## 🔄 Flujo de Trabajo Típico

### Ejemplo: Agregar funcionalidad de exportar contactos

```
1. Agente Principal analiza la tarea
   └─ Descompone en subtareas

2. Backend Dev (paralelo con Database Engineer)
   ├─ Backend: Crear endpoint /api/export/csv
   └─ Database: Optimizar query para exportación

3. Frontend Dev (después de backend)
   └─ Crear botón de exportar en UI

4. QA Tester (después de frontend)
   └─ Tests de la funcionalidad

5. Documentation
   └─ Actualizar README con instrucciones
```

## 📝 Convenciones Importantes

### Para el Agente Principal

1. **Siempre descompón tareas complejas** en subtareas específicas
2. **Proporciona contexto completo** a los subagentes
3. **Especifica archivos relevantes** para cada tarea
4. **Usa paralelismo** cuando sea posible
5. **Verifica resultados** antes de considerar completo

### Para Subagentes

1. **Sigue las convenciones** del proyecto (TypeScript, estilos)
2. **Lee AGENTS.md** para entender el contexto
3. **Mantén consistencia** con el código existente
4. **Incluye tests** cuando aplica
5. **Documenta cambios** significativos

## 🎯 Ventajas de esta Arquitectura

1. **Especialización**: Cada subagente es experto en su dominio
2. **Paralelismo**: Múltiples tareas pueden ejecutarse simultáneamente
3. **Aislamiento**: Los subagentes no contaminan el contexto del principal
4. **Escalabilidad**: Fácil agregar nuevos subagentes
5. **Calidad**: Mejor código gracias a especialización

## 📚 Recursos Adicionales

- [Kimi CLI Agents Docs](https://moonshotai.github.io/kimi-cli/en/customization/agents.html)
- `work_agent/skills.sh` - Gestión de skills adicionales
- `work_agent/PLATFORM_STATUS_REPORT.md` - Estado del proyecto

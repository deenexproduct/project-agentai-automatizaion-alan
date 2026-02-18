# AI Enrichment Specialist - VoiceCommand

Eres un especialista en **OpenRouter**, **Prompts Engineering** y **Enriquecimiento de Datos con AI**.

## 🎯 Especialización

- **AI Models**: Kimi K2, GPT-4, Claude, Llama (via OpenRouter)
- **Prompts Engineering**: System prompts, few-shot, chain-of-thought
- **Data Enrichment**: Web search, data validation, entity extraction
- **Anti-hallucination**: Source attribution, confidence scoring
- **Rate Limiting**: API key rotation, request throttling

## 📁 Ubicación

```
server/src/services/enrichment.service.ts
server/src/services/openrouter.service.ts
server/src/services/web-search.service.ts
```

## 🛠️ Convenciones

### Prompts Structure

```typescript
// ✅ System prompt claro y específico
const ENRICHMENT_SYSTEM_PROMPT = `
Sos un investigador comercial B2B. Investigá personas y empresas usando búsqueda web.

## REGLAS IMPORTANTES
1. NUNCA inventes datos - si no hay fuente, poné "No verificado"
2. INDICÁ LA FUENTE de cada dato
3. Usá SOLO URLs de medios reconocidos

## FORMATO JSON
{
  "company": {
    "name": "...",
    "nameSource": "LinkedIn / Website",
    "category": "...",
    "categorySource": "Inferido del nombre"
  },
  "confidenceScore": 75
}
`;

// ✅ User prompt con contexto completo
const userMessage = `
Investigá a esta persona:
Nombre: ${contact.fullName}
Empresa: ${contact.currentCompany}
Cargo: ${contact.currentPosition}

Contexto de búsqueda:
${searchResults ? JSON.stringify(searchResults) : 'No disponible'}
`;
```

### Anti-Hallucination

```typescript
interface IEnrichmentData {
  company: {
    name: string;
    nameSource: string;  // ✅ Fuente obligatoria
    category: string;
    categorySource: string;
  };
  confidenceScore: number;  // ✅ Score 0-100
  dataQuality: 'verified' | 'partial' | 'insufficient';
}

// ✅ Normalización de datos
function normalizeEnrichmentData(data: any): IEnrichmentData {
  return {
    company: {
      name: data.company?.name || 'No verificado',
      nameSource: data.company?.nameSource || 'No verificado',
      // ...
    },
    confidenceScore: data.confidenceScore || 0,
    dataQuality: data.dataQuality || 'insufficient',
  };
}
```

### OpenRouter Multi-Account

```typescript
class OpenRouterService {
  private clients: OpenAI[] = [];
  private currentIndex = 0;

  constructor() {
    const keys = [
      process.env.OPENROUTER_API_KEY_1,
      process.env.OPENROUTER_API_KEY_2,
    ].filter(Boolean);

    this.clients = keys.map(key => new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: key,
    }));
  }

  async call(messages: any[]): Promise<string> {
    // Rotar entre cuentas para rate limiting
    const client = this.clients[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.clients.length;
    
    const response = await client.chat.completions.create({
      model: 'moonshotai/kimi-k2',
      messages,
      temperature: 0.2,
    });
    
    return response.choices[0].message.content;
  }
}
```

### Web Search Integration

```typescript
// ✅ Buscar datos reales antes de llamar AI
async function enrichWithAI(contact: IContact): Promise<IEnrichmentData> {
  // 1. Buscar datos web
  const searchResults = await webSearchService.searchCompany(
    contact.currentCompany
  );
  
  // 2. Construir prompt con resultados
  const messages = buildPrompt(contact, searchResults);
  
  // 3. Llamar AI
  const response = await openRouterService.call(messages);
  
  // 4. Parsear y normalizar
  const data = parseResponse(response);
  return normalizeEnrichmentData(data);
}
```

## 📋 Tareas Típicas

1. **Optimizar prompts de enriquecimiento**
2. **Implementar anti-hallucination**
3. **Agregar fuentes de búsqueda web**
4. **Mejorar confidence scoring**
5. **Implementar rate limiting**
6. **Crear validación de datos**

## ✅ Checklist

- [ ] System prompt claro y específico
- [ ] Fuentes obligatorias para cada dato
- [ ] Confidence score calculado
- [ ] Manejo de rate limiting
- [ ] Validación de respuestas
- [ ] Fallback para errores

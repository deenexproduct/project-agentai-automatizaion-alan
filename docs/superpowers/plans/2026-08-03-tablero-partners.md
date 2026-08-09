# Tablero de Partners — Plan de Implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para seguimiento.

**Objetivo:** Una lista de marcas que Alan quiere alcanzar y no tiene cómo, que sus partners ven desde un link secreto y donde levantan la mano; aceptar una mano asciende la marca a empresa del CRM con su deal.

**Arquitectura:** Una colección liviana (`marcas_buscadas`) fuera del CRM, para que cargar marcas deseadas no infle el pipeline. Dos routers separados: uno privado bajo el auth normal y otro **público montado sin authMiddleware**, cuyo alcance lo define el token del partner. El ascenso reutiliza el alta de empresa del CRM a través de un servicio compartido, extraído en la Tarea 2.

**Stack:** TypeScript · Express · Mongoose · Jest + ts-jest + mongodb-memory-server + supertest · React + Vite + Tailwind.

## Restricciones globales

- **Los tests se corren con heap ampliado:** `node --max-old-space-size=8192 node_modules/.bin/jest <ruta>`. Con `npm test` el proceso muere por OOM — problema preexistente del repo.
- **Todo test que importe `crm.routes.ts` debe mockear `../../services/linkedin.service`**, que arrastra puppeteer y revienta el heap.
- **El router público se monta SIN `authMiddleware` y NO se aplica auth a sí mismo por dentro.** El repo ya tiene una ruta declarada como "public, no auth required" (`ops.routes.ts:1885`) que está debajo de un `router.use(authMiddleware)` en la línea 28 y devuelve **401 en producción**: esa feature nunca funcionó.
- **El token define el alcance.** Del `Partner` se saca su `userId` y se devuelven sólo marcas de ese dueño. El `:id` de la marca se valida contra ese `userId` antes de cualquier escritura.
- **`levantadaEn` no se borra nunca.** Descartar una mano cambia su `estado`, no elimina el registro: es la única prueba disponible ante una discusión por comisiones.
- **Los errores de Mongoose se traducen con `sendValidationError`** (`server/src/utils/mongoose-errors.ts`), y el front muestra el motivo real con `mensajeDeError` (`client/src/lib/apiError.ts`). Prohibido `alert('Error al guardar')` genérico.
- Comentarios en el idioma que ya usa el archivo que se toca.

---

## Nota sobre el orden

El §12 del spec ordenaba por hitos de valor (modelo → pantalla de Alan → portal → ascenso). Este plan hace **todo el backend con sus tests primero** y después las dos pantallas, porque cada tarea tiene que terminar en algo verificable por sí solo y una pantalla sin API detrás no lo es. El valor llega igual: al terminar la Tarea 6 ya podés cargar marcas aunque nadie más entre.

## Estructura de archivos

```
server/src/models/marca-buscada.model.ts          CREAR  — colección liviana + manos embebidas
server/src/models/partner.model.ts                MODIF  — accessToken, accessTokenActivo, ultimoAccesoEn
server/src/services/company-creation.service.ts   CREAR  — alta de empresa + deal, compartida (Tarea 2)
server/src/services/ascenso-marca.service.ts      CREAR  — marca aceptada → empresa del CRM
server/src/routes/marcas-buscadas.routes.ts       CREAR  — API privada (lado Alan)
server/src/routes/partner-portal.routes.ts        CREAR  — API PÚBLICA (lado partner)
server/src/routes/crm.routes.ts                   MODIF  — POST /companies usa el servicio extraído
server/src/index.ts                               MODIF  — montar los dos routers nuevos

client/src/services/marcas-buscadas.service.ts    CREAR  — llamadas del lado Alan
client/src/services/portal.service.ts             CREAR  — llamadas del portal (sin token de auth)
client/src/components/crm/MarcasBuscadas.tsx      CREAR  — pantalla de Alan
client/src/components/public/PortalPartner.tsx    CREAR  — pantalla del partner
client/src/main.tsx                               MODIF  — ruta pública /partners/:token
client/src/components/linkedin/LinkedInApp.tsx    MODIF  — pestaña "Marcas Buscadas"
```

---

## Tarea 1: Modelo `MarcaBuscada` y token del partner

**Archivos:**
- Crear: `server/src/models/marca-buscada.model.ts`
- Modificar: `server/src/models/partner.model.ts`
- Test: `server/src/__tests__/marca-buscada.model.test.ts`

**Interfaces:**
- Produce: modelo `MarcaBuscada` con `nombre`, `nombreNormalizado`, `porQue`, `categoria`, `estado`, `manos[]`, `companyId`, `userId`; función `normalizarNombre(nombre: string): string`; campos `accessToken`, `accessTokenActivo`, `ultimoAccesoEn` en `Partner`.

- [ ] **Paso 1: Escribir el test que falla**

```typescript
// server/src/__tests__/marca-buscada.model.test.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { MarcaBuscada, normalizarNombre } from '../models/marca-buscada.model';

let mongo: MongoMemoryServer;
const USER_ID = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await MarcaBuscada.syncIndexes();
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => { await MarcaBuscada.deleteMany({}); });

const crear = (nombre: string) =>
    MarcaBuscada.create({ nombre, porQue: '180 locales', userId: USER_ID });

describe('normalizarNombre', () => {
    it('saca acentos, espacios de más y mayúsculas', () => {
        expect(normalizarNombre('  Café  Martínez ')).toBe('cafe martinez');
    });
});

describe('MarcaBuscada', () => {
    it('arranca en estado buscando y sin manos', async () => {
        const m = await crear('Havanna');
        expect(m.estado).toBe('buscando');
        expect(m.manos).toHaveLength(0);
    });

    it('deriva nombreNormalizado al guardar', async () => {
        const m = await crear('  Grido  ');
        expect(m.nombreNormalizado).toBe('grido');
    });

    it('no permite dos marcas con el mismo nombre para el mismo dueño', async () => {
        await crear('Havanna');
        await expect(crear('  havanna ')).rejects.toThrow();
    });

    it('otro dueño sí puede tener la misma marca', async () => {
        await crear('Havanna');
        const otra = MarcaBuscada.create({
            nombre: 'Havanna', porQue: 'x', userId: new mongoose.Types.ObjectId(),
        });
        await expect(otra).resolves.toBeTruthy();
    });

    it('rechaza un estado inventado', async () => {
        await expect(MarcaBuscada.create({
            nombre: 'X', userId: USER_ID, estado: 'raro',
        } as any)).rejects.toThrow();
    });

    it('guarda la mano con su fecha y estado inicial', async () => {
        const m = await crear('Havanna');
        m.manos.push({
            partnerId: new mongoose.Types.ObjectId(),
            partnerNombre: 'Marcos',
            comentario: 'mi cuñado es gerente de expansión',
            levantadaEn: new Date(),
        } as any);
        await m.save();

        const leida = await MarcaBuscada.findById(m._id);
        expect(leida!.manos[0].estado).toBe('ofrecida');
        expect(leida!.manos[0].levantadaEn).toBeInstanceOf(Date);
    });
});
```

- [ ] **Paso 2: Correr y verificar que falla**

Ejecutar: `cd server && node --max-old-space-size=8192 node_modules/.bin/jest src/__tests__/marca-buscada.model.test.ts`
Esperado: FAIL — "Cannot find module '../models/marca-buscada.model'".

- [ ] **Paso 3: Implementar el modelo**

```typescript
// server/src/models/marca-buscada.model.ts
import mongoose, { Schema, Document } from 'mongoose';

export const ESTADOS_MARCA = ['buscando', 'con_manos', 'ascendida', 'archivada'] as const;
export const ESTADOS_MANO = ['ofrecida', 'aceptada', 'descartada'] as const;

/** Derivado del nombre: sólo para dedup y orden. El `nombre` se guarda tal cual lo escribió el usuario. */
export function normalizarNombre(nombre: string): string {
    return String(nombre)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, ' ');
}

export interface IMano {
    partnerId: mongoose.Types.ObjectId;
    partnerNombre: string;
    comentario?: string;
    levantadaEn: Date;
    estado: typeof ESTADOS_MANO[number];
}

export interface IMarcaBuscada extends Document {
    nombre: string;
    nombreNormalizado: string;
    porQue?: string;
    categoria?: string;
    estado: typeof ESTADOS_MARCA[number];
    manos: IMano[];
    companyId?: mongoose.Types.ObjectId | null;
    userId: mongoose.Types.ObjectId;
}

const ManoSchema = new Schema<IMano>({
    partnerId: { type: Schema.Types.ObjectId, ref: 'Partner', required: true },
    // Denormalizado a propósito: el portal lo muestra sin hacer populate.
    partnerNombre: { type: String, required: true },
    comentario: { type: String, trim: true },
    // NO se borra nunca, ni al descartar la mano: es la prueba ante una
    // discusión por comisiones.
    levantadaEn: { type: Date, required: true, default: Date.now },
    estado: { type: String, enum: ESTADOS_MANO, default: 'ofrecida' },
}, { _id: true });

const MarcaBuscadaSchema = new Schema<IMarcaBuscada>({
    nombre: { type: String, required: true, trim: true },
    nombreNormalizado: { type: String, required: true, index: true },
    porQue: { type: String, trim: true },
    categoria: { type: String, trim: true },
    estado: { type: String, enum: ESTADOS_MARCA, default: 'buscando', index: true },
    manos: { type: [ManoSchema], default: [] },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true, collection: 'marcas_buscadas' });

// Sin este índice se repiten las marcas. Es el mismo agujero que dejó tres
// "Zamp" en la colección de empresas.
MarcaBuscadaSchema.index({ userId: 1, nombreNormalizado: 1 }, { unique: true });

MarcaBuscadaSchema.pre('save', function (next) {
    if (this.isModified('nombre')) this.nombreNormalizado = normalizarNombre(this.nombre);
    next();
});

export const MarcaBuscada = mongoose.model<IMarcaBuscada>('MarcaBuscada', MarcaBuscadaSchema);
```

- [ ] **Paso 4: Agregar el token al Partner**

En `server/src/models/partner.model.ts`, sumar a la interfaz y al schema:

```typescript
// interfaz
accessToken?: string;
accessTokenActivo: boolean;
ultimoAccesoEn?: Date;

// schema
accessToken: { type: String, index: true, sparse: true },
accessTokenActivo: { type: Boolean, default: true },
ultimoAccesoEn: { type: Date },
```

Los tres son opcionales, así que los 3 partners que ya existen siguen válidos.

- [ ] **Paso 5: Correr y verificar que pasa**

Ejecutar: `cd server && node --max-old-space-size=8192 node_modules/.bin/jest src/__tests__/marca-buscada.model.test.ts`
Esperado: PASS, 7 tests.

Si el test de unicidad falla de forma intermitente, es porque los índices no terminaron de construirse: ya está el `await MarcaBuscada.syncIndexes()` en el `beforeAll`.

- [ ] **Paso 6: Commit**

```bash
git add server/src/models/marca-buscada.model.ts server/src/models/partner.model.ts server/src/__tests__/marca-buscada.model.test.ts
git commit -m "feat(partners): modelo de marcas buscadas y token de acceso del partner"
```

---

## Tarea 2: Extraer el alta de empresa a un servicio compartido

**Por qué:** el ascenso (Tarea 5) tiene que crear la empresa con **el mismo dedup y las mismas validaciones** que el alta normal. Duplicar esa lógica la haría divergir; llamar a la propia API por HTTP desde el server es frágil. Se extrae a un servicio que usan los dos.

**Archivos:**
- Crear: `server/src/services/company-creation.service.ts`
- Modificar: `server/src/routes/crm.routes.ts` (el handler `POST /companies`)
- Test: los existentes `server/src/__tests__/integration/crm-create.integration.test.ts` son la red

**Interfaces:**
- Produce:

```typescript
export interface ResultadoAlta {
    empresa: any;
    dealId?: string;
    duplicada?: { _id: string; name: string };
}
export async function crearEmpresaConDeal(
    datos: Record<string, any>,
    userId: string
): Promise<ResultadoAlta>;
```
`duplicada` viene con valor cuando ya existe una empresa con ese nombre; en ese caso `empresa` es la existente y **no se crea nada**.

- [ ] **Paso 1: Correr los tests existentes para tener la línea de base**

Ejecutar: `cd server && node --max-old-space-size=8192 node_modules/.bin/jest src/__tests__/integration/crm-create.integration.test.ts`
Esperado: PASS, 10 tests. **Anotar el número: tiene que seguir igual al final.**

- [ ] **Paso 2: Escribir el servicio**

```typescript
// server/src/services/company-creation.service.ts
import { Company } from '../models/company.model';
import { Deal } from '../models/deal.model';
import { PipelineConfig } from '../models/pipeline-config.model';

export interface ResultadoAlta {
    empresa: any;
    dealId?: string;
    duplicada?: { _id: string; name: string };
}

/** Escapa un texto para usarlo dentro de un RegExp sin que rompa la búsqueda. */
function escaparRegex(texto: string): string {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Alta de empresa con su oportunidad automática.
 *
 * Es la ÚNICA puerta para crear empresas: la usan el alta manual del CRM y el
 * ascenso de una marca buscada. Si se duplica esta lógica, los dos caminos
 * divergen y uno de los dos se queda sin el dedup.
 */
export async function crearEmpresaConDeal(
    datos: Record<string, any>,
    userId: string
): Promise<ResultadoAlta> {
    const nombre = typeof datos?.name === 'string' ? datos.name.trim() : '';

    if (nombre) {
        const yaExiste = await Company.findOne({
            userId,
            name: new RegExp(`^${escaparRegex(nombre)}$`, 'i'),
        }).lean();
        if (yaExiste) {
            return {
                empresa: yaExiste,
                duplicada: { _id: String((yaExiste as any)._id), name: (yaExiste as any).name },
            };
        }
    }

    const empresa = await Company.create({
        ...datos,
        assignedTo: datos.assignedTo || userId,
        userId,
    });

    let dealId: string | undefined;
    try {
        const validKeys = await PipelineConfig.getStageKeys(userId.toString());
        const firstStage = validKeys[0] || 'lead';
        // Nunca negativo: el Deal exige `value >= 0` y si falla acá la empresa
        // queda creada pero SIN deal, o sea invisible en el pipeline.
        const dealValue = (empresa.localesCount && empresa.costPerLocation)
            ? Math.max(0, Math.round((empresa.localesCount * empresa.costPerLocation) * 100) / 100)
            : 0;

        const deal = await Deal.create({
            title: empresa.name,
            status: firstStage,
            company: empresa._id,
            value: dealValue,
            currency: 'USD',
            assignedTo: empresa.assignedTo || userId,
            userId,
        });
        dealId = String(deal._id);
    } catch (dealErr: any) {
        console.error(`⚠️ Auto-create Deal failed for company ${empresa._id}:`, dealErr.message);
    }

    return { empresa, dealId };
}
```

- [ ] **Paso 3: Usar el servicio en el handler existente**

En `server/src/routes/crm.routes.ts`, reemplazar el cuerpo de `POST /companies` por:

```typescript
router.post('/companies', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const { empresa, duplicada } = await crearEmpresaConDeal(req.body, userId);

        if (duplicada) {
            return res.status(409).json({
                error: `Ya existe una empresa llamada "${duplicada.name}"`,
                existingId: duplicada._id,
            });
        }

        res.status(201).json(empresa);
    } catch (err: any) {
        if (sendValidationError(res, err)) return;
        console.error('CRM create company error:', err.message);
        res.status(500).json({ error: 'Failed to create company' });
    }
});
```

Agregar el import: `import { crearEmpresaConDeal } from '../services/company-creation.service';`

- [ ] **Paso 4: Correr los tests existentes — la red del refactor**

Ejecutar: `cd server && node --max-old-space-size=8192 node_modules/.bin/jest src/__tests__/integration/crm-create.integration.test.ts`
Esperado: PASS, **los mismos 10 tests** del Paso 1. Si baja alguno, el refactor cambió comportamiento: revertir y revisar.

- [ ] **Paso 5: Commit**

```bash
git add server/src/services/company-creation.service.ts server/src/routes/crm.routes.ts
git commit -m "refactor(crm): extraer el alta de empresa a un servicio compartido"
```

---

## Tarea 3: API privada de marcas buscadas

**Archivos:**
- Crear: `server/src/routes/marcas-buscadas.routes.ts`
- Modificar: `server/src/index.ts`
- Test: `server/src/__tests__/integration/marcas-buscadas.integration.test.ts`

**Interfaces:**
- Consume: `MarcaBuscada`, `normalizarNombre` (Tarea 1); `sendValidationError`.
- Produce:
  - `GET /api/marcas-buscadas` → `{ marcas: IMarcaBuscada[] }`
  - `POST /api/marcas-buscadas` con `{ nombre, porQue?, categoria? }` → 201 con la marca, o 409 si ya existe
  - `PATCH /api/marcas-buscadas/:id` con `{ nombre?, porQue?, categoria?, estado? }`
  - `DELETE /api/marcas-buscadas/:id`

- [ ] **Paso 1: Escribir el test que falla**

```typescript
// server/src/__tests__/integration/marcas-buscadas.integration.test.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import marcasRoutes from '../../routes/marcas-buscadas.routes';
import { MarcaBuscada } from '../../models/marca-buscada.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER_ID = new mongoose.Types.ObjectId();
const OTRO_USER = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await MarcaBuscada.syncIndexes();
    app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as any).user = { _id: USER_ID };
        next();
    });
    app.use('/api/marcas-buscadas', marcasRoutes);
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => { await MarcaBuscada.deleteMany({}); });

describe('API privada de marcas buscadas', () => {
    it('crea una marca con lo mínimo: nombre y por qué', async () => {
        const res = await request(app).post('/api/marcas-buscadas')
            .send({ nombre: 'Havanna', porQue: '180 locales' });

        expect(res.status).toBe(201);
        expect(res.body.nombre).toBe('Havanna');
        expect(res.body.estado).toBe('buscando');
    });

    it('responde 400 (no 500) si falta el nombre', async () => {
        const res = await request(app).post('/api/marcas-buscadas').send({ porQue: 'x' });
        expect(res.status).toBe(400);
    });

    it('rechaza una marca repetida con 409 y dice cuál es', async () => {
        await request(app).post('/api/marcas-buscadas').send({ nombre: 'Havanna' });
        const res = await request(app).post('/api/marcas-buscadas').send({ nombre: ' havanna ' });

        expect(res.status).toBe(409);
        expect(String(res.body.error)).toMatch(/havanna/i);
    });

    it('lista sólo las marcas del dueño', async () => {
        await MarcaBuscada.create({ nombre: 'Mía', userId: USER_ID });
        await MarcaBuscada.create({ nombre: 'Ajena', userId: OTRO_USER });

        const res = await request(app).get('/api/marcas-buscadas');

        expect(res.body.marcas).toHaveLength(1);
        expect(res.body.marcas[0].nombre).toBe('Mía');
    });

    it('no deja editar la marca de otro dueño', async () => {
        const ajena = await MarcaBuscada.create({ nombre: 'Ajena', userId: OTRO_USER });
        const res = await request(app).patch(`/api/marcas-buscadas/${ajena._id}`)
            .send({ porQue: 'me la afano' });

        expect(res.status).toBe(404);
        const sinTocar = await MarcaBuscada.findById(ajena._id);
        expect(sinTocar!.porQue).toBeUndefined();
    });

    it('no deja borrar la marca de otro dueño', async () => {
        const ajena = await MarcaBuscada.create({ nombre: 'Ajena', userId: OTRO_USER });
        const res = await request(app).delete(`/api/marcas-buscadas/${ajena._id}`);

        expect(res.status).toBe(404);
        expect(await MarcaBuscada.countDocuments({ _id: ajena._id })).toBe(1);
    });

    it('archivar es un PATCH de estado', async () => {
        const m = await MarcaBuscada.create({ nombre: 'Vieja', userId: USER_ID });
        const res = await request(app).patch(`/api/marcas-buscadas/${m._id}`)
            .send({ estado: 'archivada' });

        expect(res.status).toBe(200);
        expect((await MarcaBuscada.findById(m._id))!.estado).toBe('archivada');
    });
});
```

- [ ] **Paso 2: Correr y verificar que falla**

Ejecutar: `cd server && node --max-old-space-size=8192 node_modules/.bin/jest src/__tests__/integration/marcas-buscadas.integration.test.ts`
Esperado: FAIL — módulo inexistente.

- [ ] **Paso 3: Implementar el router**

```typescript
// server/src/routes/marcas-buscadas.routes.ts
import { Router, Request, Response } from 'express';
import { MarcaBuscada, normalizarNombre } from '../models/marca-buscada.model';
import { sendValidationError } from '../utils/mongoose-errors';

const router = Router();

// Sólo estos campos se pueden escribir desde el cliente. Sin whitelist, un
// PATCH podría pisar `manos`, `companyId` o `userId`.
const CAMPOS_EDITABLES = ['nombre', 'porQue', 'categoria', 'estado'] as const;

router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const marcas = await MarcaBuscada.find({ userId }).sort({ createdAt: -1 }).lean();
        res.json({ marcas });
    } catch (err: any) {
        console.error('marcas-buscadas list error:', err.message);
        res.status(500).json({ error: 'No se pudieron traer las marcas' });
    }
});

router.post('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';

        if (nombre) {
            const yaExiste = await MarcaBuscada.findOne({
                userId, nombreNormalizado: normalizarNombre(nombre),
            }).lean();
            if (yaExiste) {
                return res.status(409).json({
                    error: `Ya tenés cargada la marca "${(yaExiste as any).nombre}"`,
                    existingId: String((yaExiste as any)._id),
                });
            }
        }

        const datos: Record<string, any> = { userId };
        for (const campo of CAMPOS_EDITABLES) {
            if (req.body?.[campo] !== undefined) datos[campo] = req.body[campo];
        }

        const marca = await MarcaBuscada.create(datos);
        res.status(201).json(marca);
    } catch (err: any) {
        if (sendValidationError(res, err)) return;
        console.error('marcas-buscadas create error:', err.message);
        res.status(500).json({ error: 'No se pudo crear la marca' });
    }
});

router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const marca = await MarcaBuscada.findOne({ _id: req.params.id, userId });
        if (!marca) return res.status(404).json({ error: 'Marca no encontrada' });

        for (const campo of CAMPOS_EDITABLES) {
            if (req.body?.[campo] !== undefined) (marca as any)[campo] = req.body[campo];
        }
        await marca.save();
        res.json(marca);
    } catch (err: any) {
        if (sendValidationError(res, err)) return;
        console.error('marcas-buscadas update error:', err.message);
        res.status(500).json({ error: 'No se pudo actualizar la marca' });
    }
});

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const r = await MarcaBuscada.deleteOne({ _id: req.params.id, userId });
        if (!r.deletedCount) return res.status(404).json({ error: 'Marca no encontrada' });
        res.json({ ok: true });
    } catch (err: any) {
        if (sendValidationError(res, err)) return;
        console.error('marcas-buscadas delete error:', err.message);
        res.status(500).json({ error: 'No se pudo borrar la marca' });
    }
});

export default router;
```

- [ ] **Paso 4: Montarlo**

En `server/src/index.ts`, junto a las demás rutas privadas:

```typescript
import marcasBuscadasRoutes from './routes/marcas-buscadas.routes';
app.use('/api/marcas-buscadas', authMiddleware, marcasBuscadasRoutes);
```

- [ ] **Paso 5: Correr y verificar que pasa**

Ejecutar: `cd server && node --max-old-space-size=8192 node_modules/.bin/jest src/__tests__/integration/marcas-buscadas.integration.test.ts`
Esperado: PASS, 7 tests.

- [ ] **Paso 6: Commit**

```bash
git add server/src/routes/marcas-buscadas.routes.ts server/src/index.ts server/src/__tests__/integration/marcas-buscadas.integration.test.ts
git commit -m "feat(partners): API privada de marcas buscadas"
```

---

## Tarea 4: API pública del portal

**Archivos:**
- Crear: `server/src/routes/partner-portal.routes.ts`
- Modificar: `server/src/index.ts`
- Test: `server/src/__tests__/integration/partner-portal.integration.test.ts`

**Interfaces:**
- Consume: `MarcaBuscada` (Tarea 1), `Partner` con `accessToken` (Tarea 1).
- Produce:
  - `GET /api/portal/:token` → `{ partner: { nombre }, marcas: [...] }`
  - `POST /api/portal/:token/marcas/:id/mano` con `{ comentario? }` → `{ ok: true }`

- [ ] **Paso 1: Escribir el test que falla**

El primer test es el más importante del plan: hace el request **sin ningún header de autenticación**.

```typescript
// server/src/__tests__/integration/partner-portal.integration.test.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import portalRoutes from '../../routes/partner-portal.routes';
import { MarcaBuscada } from '../../models/marca-buscada.model';
import { Partner } from '../../models/partner.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER_ID = new mongoose.Types.ObjectId();
const OTRO_USER = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    app = express();
    app.use(express.json());
    // Se monta SIN authMiddleware, igual que en index.ts.
    app.use('/api/portal', portalRoutes);
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => {
    await MarcaBuscada.deleteMany({});
    await Partner.deleteMany({});
});

const crearPartner = (token: string, userId = USER_ID, activo = true) =>
    Partner.create({ name: 'Marcos', accessToken: token, accessTokenActivo: activo, userId });

describe('portal del partner', () => {
    it('responde SIN credenciales de ningún tipo', async () => {
        await crearPartner('tok-123');
        await MarcaBuscada.create({ nombre: 'Havanna', porQue: '180 locales', userId: USER_ID });

        // Ni Authorization, ni cookie, ni nada.
        const res = await request(app).get('/api/portal/tok-123');

        expect(res.status).toBe(200);
        expect(res.body.partner.nombre).toBe('Marcos');
        expect(res.body.marcas).toHaveLength(1);
    });

    it('sólo muestra las marcas del dueño de ese partner', async () => {
        await crearPartner('tok-123');
        await MarcaBuscada.create({ nombre: 'Mía', userId: USER_ID });
        await MarcaBuscada.create({ nombre: 'Ajena', userId: OTRO_USER });

        const res = await request(app).get('/api/portal/tok-123');

        expect(res.body.marcas.map((m: any) => m.nombre)).toEqual(['Mía']);
    });

    it('no muestra las archivadas ni las ya ascendidas', async () => {
        await crearPartner('tok-123');
        await MarcaBuscada.create({ nombre: 'Activa', userId: USER_ID });
        await MarcaBuscada.create({ nombre: 'Guardada', userId: USER_ID, estado: 'archivada' });
        await MarcaBuscada.create({ nombre: 'Ya abrió', userId: USER_ID, estado: 'ascendida' });

        const res = await request(app).get('/api/portal/tok-123');

        expect(res.body.marcas.map((m: any) => m.nombre)).toEqual(['Activa']);
    });

    it('un token inexistente devuelve 404, sin decir por qué', async () => {
        const res = await request(app).get('/api/portal/no-existe');
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body)).not.toMatch(/revocad|inactiv|expirad/i);
    });

    it('un token revocado devuelve el MISMO 404 que uno inexistente', async () => {
        await crearPartner('tok-muerto', USER_ID, false);
        const res = await request(app).get('/api/portal/tok-muerto');
        expect(res.status).toBe(404);
    });

    it('levantar la mano la deja registrada con fecha', async () => {
        await crearPartner('tok-123');
        const m = await MarcaBuscada.create({ nombre: 'Havanna', userId: USER_ID });

        const res = await request(app)
            .post(`/api/portal/tok-123/marcas/${m._id}/mano`)
            .send({ comentario: 'mi cuñado es gerente' });

        expect(res.status).toBe(200);
        const leida = await MarcaBuscada.findById(m._id);
        expect(leida!.manos).toHaveLength(1);
        expect(leida!.manos[0].partnerNombre).toBe('Marcos');
        expect(leida!.manos[0].comentario).toBe('mi cuñado es gerente');
        expect(leida!.manos[0].levantadaEn).toBeInstanceOf(Date);
        expect(leida!.estado).toBe('con_manos');
    });

    it('levantar la mano dos veces actualiza el comentario, no duplica', async () => {
        await crearPartner('tok-123');
        const m = await MarcaBuscada.create({ nombre: 'Havanna', userId: USER_ID });

        await request(app).post(`/api/portal/tok-123/marcas/${m._id}/mano`).send({ comentario: 'uno' });
        await request(app).post(`/api/portal/tok-123/marcas/${m._id}/mano`).send({ comentario: 'dos' });

        const leida = await MarcaBuscada.findById(m._id);
        expect(leida!.manos).toHaveLength(1);
        expect(leida!.manos[0].comentario).toBe('dos');
    });

    it('un token NO puede levantar la mano en la marca de otro dueño', async () => {
        await crearPartner('tok-123');
        const ajena = await MarcaBuscada.create({ nombre: 'Ajena', userId: OTRO_USER });

        const res = await request(app)
            .post(`/api/portal/tok-123/marcas/${ajena._id}/mano`).send({});

        expect(res.status).toBe(404);
        expect((await MarcaBuscada.findById(ajena._id))!.manos).toHaveLength(0);
    });

    it('deja ver quién más levantó la mano', async () => {
        await crearPartner('tok-123');
        const m = await MarcaBuscada.create({
            nombre: 'Havanna', userId: USER_ID,
            manos: [{
                partnerId: new mongoose.Types.ObjectId(), partnerNombre: 'Gabriel',
                levantadaEn: new Date(), estado: 'ofrecida',
            }],
        } as any);

        const res = await request(app).get('/api/portal/tok-123');

        const marca = res.body.marcas.find((x: any) => String(x._id) === String(m._id));
        expect(marca.manos[0].partnerNombre).toBe('Gabriel');
    });
});
```

- [ ] **Paso 2: Correr y verificar que falla**

Ejecutar: `cd server && node --max-old-space-size=8192 node_modules/.bin/jest src/__tests__/integration/partner-portal.integration.test.ts`
Esperado: FAIL — módulo inexistente.

- [ ] **Paso 3: Implementar el router público**

```typescript
// server/src/routes/partner-portal.routes.ts
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { MarcaBuscada } from '../models/marca-buscada.model';
import { Partner } from '../models/partner.model';

/**
 * Portal del partner: se monta SIN authMiddleware y NO se aplica auth a sí
 * mismo. El token de la URL es la credencial y define TODO el alcance.
 *
 * Este router no debe llamar nunca a `router.use(authMiddleware)`: es
 * exactamente el error que tiene `ops.routes.ts` (la ruta declarada como
 * "public, no auth required" está debajo del auth de la línea 28 y devuelve
 * 401 en producción, así que esa feature nunca funcionó).
 */
const router = Router();

/** Resuelve el partner del token, o null. Un token revocado se trata igual que uno inexistente. */
async function partnerDelToken(token: string) {
    if (!token) return null;
    return Partner.findOne({ accessToken: token, accessTokenActivo: true });
}

/** Sólo estos campos de la mano salen al portal. `partnerId` no se expone. */
const manoPublica = (m: any) => ({
    partnerNombre: m.partnerNombre,
    comentario: m.comentario,
    levantadaEn: m.levantadaEn,
    estado: m.estado,
});

router.get('/:token', async (req: Request, res: Response) => {
    try {
        const partner = await partnerDelToken(req.params.token);
        // Mismo 404 para inexistente y revocado: no confirmamos que un token
        // haya sido válido alguna vez.
        if (!partner) return res.status(404).json({ error: 'No encontrado' });

        const marcas = await MarcaBuscada.find({
            userId: partner.userId,
            estado: { $in: ['buscando', 'con_manos'] },
        }).sort({ createdAt: -1 }).lean();

        await Partner.updateOne({ _id: partner._id }, { $set: { ultimoAccesoEn: new Date() } });

        res.json({
            partner: { nombre: partner.name },
            marcas: marcas.map((m: any) => ({
                _id: m._id,
                nombre: m.nombre,
                porQue: m.porQue,
                categoria: m.categoria,
                manos: (m.manos || []).filter((x: any) => x.estado !== 'descartada').map(manoPublica),
            })),
        });
    } catch (err: any) {
        console.error('portal get error:', err.message);
        res.status(500).json({ error: 'No se pudo cargar el tablero' });
    }
});

router.post('/:token/marcas/:id/mano', async (req: Request, res: Response) => {
    try {
        const partner = await partnerDelToken(req.params.token);
        if (!partner) return res.status(404).json({ error: 'No encontrado' });

        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ error: 'No encontrado' });
        }

        // El userId sale del PARTNER, nunca del request: sin esto, un token
        // podría levantar la mano en la marca de cualquier otro usuario con
        // sólo conocer su ObjectId.
        const marca = await MarcaBuscada.findOne({
            _id: req.params.id,
            userId: partner.userId,
            estado: { $in: ['buscando', 'con_manos'] },
        });
        if (!marca) return res.status(404).json({ error: 'No encontrado' });

        const comentario = typeof req.body?.comentario === 'string' ? req.body.comentario.trim() : '';
        const yaLevantada = marca.manos.find(
            (m) => String(m.partnerId) === String(partner._id) && m.estado !== 'descartada'
        );

        if (yaLevantada) {
            yaLevantada.comentario = comentario;
        } else {
            marca.manos.push({
                partnerId: partner._id as any,
                partnerNombre: partner.name,
                comentario,
                levantadaEn: new Date(),
                estado: 'ofrecida',
            } as any);
        }

        if (marca.estado === 'buscando') marca.estado = 'con_manos';
        await marca.save();

        res.json({ ok: true });
    } catch (err: any) {
        console.error('portal mano error:', err.message);
        res.status(500).json({ error: 'No se pudo registrar' });
    }
});

export default router;
```

- [ ] **Paso 4: Montarlo SIN auth**

En `server/src/index.ts`, **antes** de las rutas privadas y sin `authMiddleware`:

```typescript
import partnerPortalRoutes from './routes/partner-portal.routes';
// Público a propósito: el token de la URL es la credencial.
app.use('/api/portal', partnerPortalRoutes);
```

- [ ] **Paso 5: Correr y verificar que pasa**

Ejecutar: `cd server && node --max-old-space-size=8192 node_modules/.bin/jest src/__tests__/integration/partner-portal.integration.test.ts`
Esperado: PASS, 9 tests.

- [ ] **Paso 6: Verificar contra el server levantado que de verdad es público**

Levantar el server y ejecutar, **sin ningún header**:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3010/api/portal/no-existe
```

Esperado: **404**. Si devuelve **401**, el router quedó detrás del auth: es el bug de `ops.routes.ts` repetido.

- [ ] **Paso 7: Commit**

```bash
git add server/src/routes/partner-portal.routes.ts server/src/index.ts server/src/__tests__/integration/partner-portal.integration.test.ts
git commit -m "feat(partners): portal público por token, sin login"
```

---

## Tarea 5: El ascenso

**Archivos:**
- Crear: `server/src/services/ascenso-marca.service.ts`
- Modificar: `server/src/routes/marcas-buscadas.routes.ts`
- Test: `server/src/__tests__/integration/ascenso-marca.integration.test.ts`

**Interfaces:**
- Consume: `crearEmpresaConDeal` (Tarea 2), `MarcaBuscada` (Tarea 1).
- Produce:

```typescript
export interface ResultadoAscenso {
    companyId: string;
    dealId?: string;
    duplicada?: { _id: string; name: string };
}
export async function ascenderMarca(
    marcaId: string, manoId: string, userId: string
): Promise<ResultadoAscenso>;
```
Más los endpoints `POST /api/marcas-buscadas/:id/manos/:manoId/aceptar` y `.../descartar`.

- [ ] **Paso 1: Escribir el test que falla**

```typescript
// server/src/__tests__/integration/ascenso-marca.integration.test.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import marcasRoutes from '../../routes/marcas-buscadas.routes';
import { MarcaBuscada } from '../../models/marca-buscada.model';
import { Company } from '../../models/company.model';
import { Deal } from '../../models/deal.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER_ID = new mongoose.Types.ObjectId();
const PARTNER_A = new mongoose.Types.ObjectId();
const PARTNER_B = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as any).user = { _id: USER_ID };
        next();
    });
    app.use('/api/marcas-buscadas', marcasRoutes);
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
});

async function marcaConDosManos() {
    return MarcaBuscada.create({
        nombre: 'Havanna', porQue: '180 locales', userId: USER_ID, estado: 'con_manos',
        manos: [
            { partnerId: PARTNER_A, partnerNombre: 'Marcos', levantadaEn: new Date('2026-01-10'), estado: 'ofrecida' },
            { partnerId: PARTNER_B, partnerNombre: 'Gabriel', levantadaEn: new Date('2026-01-12'), estado: 'ofrecida' },
        ],
    } as any);
}

describe('aceptar una mano', () => {
    it('crea la empresa en el CRM con su deal', async () => {
        const m = await marcaConDosManos();
        const manoId = m.manos[0]._id;

        const res = await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${manoId}/aceptar`);

        expect(res.status).toBe(200);
        const empresa = await Company.findOne({ name: /havanna/i });
        expect(empresa).toBeTruthy();
        expect(await Deal.countDocuments({ company: empresa!._id })).toBe(1);
    });

    it('deja al partner asignado en la empresa', async () => {
        const m = await marcaConDosManos();
        await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${m.manos[0]._id}/aceptar`);

        const empresa = await Company.findOne({ name: /havanna/i });
        expect(String(empresa!.partner)).toBe(String(PARTNER_A));
    });

    it('la marca queda ascendida y apuntando a la empresa', async () => {
        const m = await marcaConDosManos();
        await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${m.manos[0]._id}/aceptar`);

        const leida = await MarcaBuscada.findById(m._id);
        const empresa = await Company.findOne({ name: /havanna/i });
        expect(leida!.estado).toBe('ascendida');
        expect(String(leida!.companyId)).toBe(String(empresa!._id));
    });

    it('las otras manos quedan descartadas PERO conservan su fecha', async () => {
        const m = await marcaConDosManos();
        await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${m.manos[0]._id}/aceptar`);

        const leida = await MarcaBuscada.findById(m._id);
        const otra = leida!.manos.find((x) => String(x.partnerId) === String(PARTNER_B))!;
        expect(otra.estado).toBe('descartada');
        expect(new Date(otra.levantadaEn).toISOString()).toBe(new Date('2026-01-12').toISOString());
    });

    it('aceptar dos veces devuelve 409 y no duplica la empresa', async () => {
        const m = await marcaConDosManos();
        const manoId = m.manos[0]._id;
        await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${manoId}/aceptar`);
        const segunda = await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${manoId}/aceptar`);

        expect(segunda.status).toBe(409);
        expect(await Company.countDocuments({ name: /havanna/i })).toBe(1);
    });

    it('si la empresa YA existe en el CRM devuelve 409 con su id', async () => {
        await Company.create({ name: 'Havanna', userId: USER_ID, assignedTo: USER_ID });
        const m = await marcaConDosManos();

        const res = await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${m.manos[0]._id}/aceptar`);

        expect(res.status).toBe(409);
        expect(res.body.existingId).toBeTruthy();
        expect((await MarcaBuscada.findById(m._id))!.estado).toBe('con_manos');
    });
});

describe('descartar una mano', () => {
    it('la marca vuelve a buscando si no quedan manos ofrecidas', async () => {
        const m = await MarcaBuscada.create({
            nombre: 'Sola', userId: USER_ID, estado: 'con_manos',
            manos: [{ partnerId: PARTNER_A, partnerNombre: 'Marcos', levantadaEn: new Date(), estado: 'ofrecida' }],
        } as any);

        await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${m.manos[0]._id}/descartar`);

        const leida = await MarcaBuscada.findById(m._id);
        expect(leida!.estado).toBe('buscando');
        expect(leida!.manos[0].estado).toBe('descartada');
        expect(leida!.manos[0].levantadaEn).toBeInstanceOf(Date);
    });
});
```

- [ ] **Paso 2: Correr y verificar que falla**

Ejecutar: `cd server && node --max-old-space-size=8192 node_modules/.bin/jest src/__tests__/integration/ascenso-marca.integration.test.ts`
Esperado: FAIL — las rutas de aceptar/descartar no existen (404).

- [ ] **Paso 3: Implementar el servicio**

```typescript
// server/src/services/ascenso-marca.service.ts
import { MarcaBuscada } from '../models/marca-buscada.model';
import { Company } from '../models/company.model';
import { crearEmpresaConDeal } from './company-creation.service';

export interface ResultadoAscenso {
    companyId: string;
    dealId?: string;
    duplicada?: { _id: string; name: string };
}

/**
 * Convierte una marca buscada en una oportunidad real del CRM.
 *
 * Es el momento en que la marca deja de ser un deseo: por eso recién acá entra
 * al pipeline y empieza a contar en las métricas.
 */
export async function ascenderMarca(
    marcaId: string, manoId: string, userId: string
): Promise<ResultadoAscenso> {
    const marca = await MarcaBuscada.findOne({ _id: marcaId, userId });
    if (!marca) throw Object.assign(new Error('Marca no encontrada'), { http: 404 });
    if (marca.estado === 'ascendida') {
        throw Object.assign(new Error('Esta marca ya fue ascendida'), { http: 409 });
    }

    const mano = marca.manos.find((m: any) => String(m._id) === String(manoId));
    if (!mano) throw Object.assign(new Error('Mano no encontrada'), { http: 404 });

    const { empresa, dealId, duplicada } = await crearEmpresaConDeal(
        { name: marca.nombre, description: marca.porQue, partner: mano.partnerId },
        userId
    );

    if (duplicada) {
        // No se toca la marca: el usuario decide si vincula a la existente.
        return { companyId: duplicada._id, duplicada };
    }

    await Company.updateOne({ _id: empresa._id }, { $set: { partner: mano.partnerId } });

    mano.estado = 'aceptada';
    for (const otra of marca.manos) {
        // `levantadaEn` NO se toca: es la prueba ante una discusión por comisiones.
        if (String((otra as any)._id) !== String(manoId) && otra.estado === 'ofrecida') {
            otra.estado = 'descartada';
        }
    }
    marca.estado = 'ascendida';
    marca.companyId = empresa._id;
    await marca.save();

    return { companyId: String(empresa._id), dealId };
}
```

- [ ] **Paso 4: Agregar los dos endpoints**

En `server/src/routes/marcas-buscadas.routes.ts`, antes del `export default`:

```typescript
router.post('/:id/manos/:manoId/aceptar', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const r = await ascenderMarca(req.params.id, req.params.manoId, userId);

        if (r.duplicada) {
            return res.status(409).json({
                error: `"${r.duplicada.name}" ya existe en tu CRM`,
                existingId: r.duplicada._id,
            });
        }
        res.json(r);
    } catch (err: any) {
        if (err.http) return res.status(err.http).json({ error: err.message });
        if (sendValidationError(res, err)) return;
        console.error('ascenso error:', err.message);
        res.status(500).json({ error: 'No se pudo ascender la marca' });
    }
});

router.post('/:id/manos/:manoId/descartar', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const marca = await MarcaBuscada.findOne({ _id: req.params.id, userId });
        if (!marca) return res.status(404).json({ error: 'Marca no encontrada' });

        const mano = marca.manos.find((m: any) => String(m._id) === String(req.params.manoId));
        if (!mano) return res.status(404).json({ error: 'Mano no encontrada' });

        // Cambia el estado, NO se borra el registro ni su fecha.
        mano.estado = 'descartada';
        if (!marca.manos.some((m) => m.estado === 'ofrecida') && marca.estado === 'con_manos') {
            marca.estado = 'buscando';
        }
        await marca.save();

        res.json({ ok: true });
    } catch (err: any) {
        if (sendValidationError(res, err)) return;
        console.error('descartar mano error:', err.message);
        res.status(500).json({ error: 'No se pudo descartar' });
    }
});
```

Agregar el import: `import { ascenderMarca } from '../services/ascenso-marca.service';`

- [ ] **Paso 5: Correr y verificar que pasa**

Ejecutar: `cd server && node --max-old-space-size=8192 node_modules/.bin/jest src/__tests__/integration/ascenso-marca.integration.test.ts`
Esperado: PASS, 7 tests.

- [ ] **Paso 6: Commit**

```bash
git add server/src/services/ascenso-marca.service.ts server/src/routes/marcas-buscadas.routes.ts server/src/__tests__/integration/ascenso-marca.integration.test.ts
git commit -m "feat(partners): ascender una marca aceptada a empresa del CRM"
```

---

## Tarea 6: Pantalla de Alan

**Archivos:**
- Crear: `client/src/services/marcas-buscadas.service.ts`
- Crear: `client/src/components/crm/MarcasBuscadas.tsx`
- Modificar: `client/src/components/linkedin/LinkedInApp.tsx`

**Interfaces:**
- Consume: la API privada de las Tareas 3 y 5.
- Produce: componente `<MarcasBuscadas />` y el tab `marcas-buscadas`.

- [ ] **Paso 1: Escribir el servicio del cliente**

```typescript
// client/src/services/marcas-buscadas.service.ts
import api from '../lib/axios';

export interface ManoData {
    _id: string;
    partnerNombre: string;
    comentario?: string;
    levantadaEn: string;
    estado: 'ofrecida' | 'aceptada' | 'descartada';
}

export interface MarcaBuscadaData {
    _id: string;
    nombre: string;
    porQue?: string;
    categoria?: string;
    estado: 'buscando' | 'con_manos' | 'ascendida' | 'archivada';
    manos: ManoData[];
    companyId?: string | null;
}

export const getMarcasBuscadas = async () =>
    (await api.get<{ marcas: MarcaBuscadaData[] }>('/marcas-buscadas')).data;
export const crearMarcaBuscada = async (datos: { nombre: string; porQue?: string; categoria?: string }) =>
    (await api.post<MarcaBuscadaData>('/marcas-buscadas', datos)).data;
export const archivarMarca = async (id: string) =>
    (await api.patch(`/marcas-buscadas/${id}`, { estado: 'archivada' })).data;
export const aceptarMano = async (marcaId: string, manoId: string) =>
    (await api.post(`/marcas-buscadas/${marcaId}/manos/${manoId}/aceptar`)).data;
export const descartarMano = async (marcaId: string, manoId: string) =>
    (await api.post(`/marcas-buscadas/${marcaId}/manos/${manoId}/descartar`)).data;
```

- [ ] **Paso 2: Crear la pantalla**

```tsx
// client/src/components/crm/MarcasBuscadas.tsx
import { useEffect, useState } from 'react';
import { Plus, Hand, Check, X } from 'lucide-react';
import {
    getMarcasBuscadas, crearMarcaBuscada, archivarMarca, aceptarMano, descartarMano,
    MarcaBuscadaData,
} from '../../services/marcas-buscadas.service';
import { mensajeDeError } from '../../lib/apiError';

export default function MarcasBuscadas() {
    const [marcas, setMarcas] = useState<MarcaBuscadaData[]>([]);
    const [cargando, setCargando] = useState(true);
    const [nombre, setNombre] = useState('');
    const [porQue, setPorQue] = useState('');

    const cargar = async () => {
        setCargando(true);
        try { setMarcas((await getMarcasBuscadas()).marcas); }
        finally { setCargando(false); }
    };
    useEffect(() => { cargar(); }, []);

    const agregar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nombre.trim()) return;
        try {
            await crearMarcaBuscada({ nombre: nombre.trim(), porQue: porQue.trim() || undefined });
            setNombre(''); setPorQue('');
            await cargar();
        } catch (err) { alert(mensajeDeError(err, 'No se pudo agregar la marca')); }
    };

    const accion = async (fn: () => Promise<unknown>, fallback: string) => {
        try { await fn(); await cargar(); }
        catch (err) { alert(mensajeDeError(err, fallback)); }
    };

    const visibles = marcas.filter(m => m.estado === 'buscando' || m.estado === 'con_manos');

    return (
        <div className="p-4 flex flex-col gap-5">
            <form onSubmit={agregar} className="bg-white rounded-[20px] p-5 border border-slate-100 flex flex-col gap-3">
                <h2 className="font-bold text-slate-800">Agregar una marca que querés alcanzar</h2>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input value={nombre} onChange={e => setNombre(e.target.value)}
                        placeholder="Havanna"
                        className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm" />
                    <input value={porQue} onChange={e => setPorQue(e.target.value)}
                        placeholder="Por qué la querés: 180 locales, delivery tercerizado"
                        className="flex-[2] px-4 py-2.5 rounded-xl border border-slate-200 text-sm" />
                    <button type="submit"
                        className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold flex items-center gap-2">
                        <Plus size={16} /> Agregar
                    </button>
                </div>
            </form>

            {cargando ? (
                <p className="text-slate-400 text-sm">Cargando…</p>
            ) : visibles.length === 0 ? (
                <p className="text-slate-400 text-sm">
                    Todavía no cargaste ninguna marca. Agregá la primera y compartí el link con tus partners.
                </p>
            ) : visibles.map(m => {
                const manos = m.manos.filter(x => x.estado === 'ofrecida');
                return (
                    <div key={m._id} className="bg-white rounded-[20px] p-5 border border-slate-100">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="font-bold text-slate-800">{m.nombre}</h3>
                                {m.porQue && <p className="text-sm text-slate-500 mt-1">{m.porQue}</p>}
                            </div>
                            <button onClick={() => accion(() => archivarMarca(m._id), 'No se pudo archivar')}
                                className="text-xs text-slate-400 hover:text-slate-600">Archivar</button>
                        </div>

                        {manos.length > 0 && (
                            <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
                                {manos.map(mano => (
                                    <div key={mano._id} className="flex items-start justify-between gap-3 text-sm">
                                        <div className="flex items-start gap-2">
                                            <Hand size={15} className="text-sky-500 mt-0.5 shrink-0" />
                                            <span>
                                                <strong>{mano.partnerNombre}</strong>
                                                {mano.comentario && <em className="text-slate-500"> — “{mano.comentario}”</em>}
                                                <span className="block text-[11px] text-slate-400">
                                                    {new Date(mano.levantadaEn).toLocaleDateString('es-AR')}
                                                </span>
                                            </span>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            <button title="Aceptar y pasar al CRM"
                                                onClick={() => accion(() => aceptarMano(m._id, mano._id), 'No se pudo aceptar')}
                                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700"><Check size={14} /></button>
                                            <button title="Descartar"
                                                onClick={() => accion(() => descartarMano(m._id, mano._id), 'No se pudo descartar')}
                                                className="p-1.5 rounded-lg bg-slate-50 text-slate-500"><X size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
```

- [ ] **Paso 3: Agregar la pestaña**

En `client/src/components/linkedin/LinkedInApp.tsx`, cuatro cambios puntuales:

```tsx
// 1. import, junto a los demás componentes del CRM
import MarcasBuscadas from '../crm/MarcasBuscadas';

// 2. en el type SidebarTab, sumar la opción
type SidebarTab =
  | "dashboard"
  | "pipeline"
  | "marcas-buscadas"
  // …el resto queda igual

// 3. en el array crmGroup, después de "pipeline"
{ id: "marcas-buscadas", Icon: Target, label: "Marcas Buscadas" },

// 4. junto a los otros renders condicionales del contenido
{activeTab === "marcas-buscadas" && <MarcasBuscadas />}
```

`Target` ya está importado de `lucide-react` en ese archivo.

- [ ] **Paso 4: Verificar tipos y ver la pantalla**

Ejecutar: `cd client && npx tsc --noEmit`
Esperado: sin errores.

Levantar el front, entrar a `/linkedin/marcas-buscadas`, cargar "Havanna" con un por qué, y verificar que aparece en la lista.

- [ ] **Paso 5: Commit**

```bash
git add client/src/services/marcas-buscadas.service.ts client/src/components/crm/MarcasBuscadas.tsx client/src/components/linkedin/LinkedInApp.tsx
git commit -m "feat(partners): pantalla de marcas buscadas"
```

---

## Tarea 7: Pantalla del partner

**Archivos:**
- Crear: `client/src/services/portal.service.ts`
- Crear: `client/src/components/public/PortalPartner.tsx`
- Modificar: `client/src/main.tsx`

**Interfaces:**
- Consume: la API pública de la Tarea 4.
- Produce: ruta `/partners/:token` fuera de `ProtectedRoute`.

- [ ] **Paso 1: Escribir el servicio del portal**

Usa `fetch` directo y **no** la instancia de axios: esa tiene un interceptor que adjunta el Bearer y otro que desloguea ante un 401, y en el portal no hay sesión que desloguear.

```typescript
// client/src/services/portal.service.ts
const BASE = import.meta.env.VITE_API_URL || '/api';

export interface ManoPublica {
    partnerNombre: string;
    comentario?: string;
    levantadaEn: string;
    estado: string;
}
export interface MarcaPublica {
    _id: string;
    nombre: string;
    porQue?: string;
    categoria?: string;
    manos: ManoPublica[];
}
export interface TableroPublico {
    partner: { nombre: string };
    marcas: MarcaPublica[];
}

export async function getTablero(token: string): Promise<TableroPublico> {
    const res = await fetch(`${BASE}/portal/${token}`);
    if (!res.ok) throw new Error('No encontrado');
    return res.json();
}

export async function levantarMano(token: string, marcaId: string, comentario: string) {
    const res = await fetch(`${BASE}/portal/${token}/marcas/${marcaId}/mano`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comentario }),
    });
    if (!res.ok) throw new Error('No se pudo registrar');
    return res.json();
}
```

- [ ] **Paso 2: Crear la pantalla**

```tsx
// client/src/components/public/PortalPartner.tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Hand } from 'lucide-react';
import { getTablero, levantarMano, TableroPublico } from '../../services/portal.service';

export default function PortalPartner() {
    const { token } = useParams<{ token: string }>();
    const [tablero, setTablero] = useState<TableroPublico | null>(null);
    const [error, setError] = useState(false);
    const [comentarios, setComentarios] = useState<Record<string, string>>({});

    const cargar = async () => {
        try { setTablero(await getTablero(token!)); }
        catch { setError(true); }
    };
    useEffect(() => { cargar(); }, [token]);

    const enviar = async (marcaId: string) => {
        try {
            await levantarMano(token!, marcaId, comentarios[marcaId] || '');
            setComentarios(prev => ({ ...prev, [marcaId]: '' }));
            await cargar();
        } catch { alert('No se pudo registrar. Probá de nuevo.'); }
    };

    if (error) return <div className="p-10 text-center text-slate-500">Este link no es válido.</div>;
    if (!tablero) return <div className="p-10 text-center text-slate-400">Cargando…</div>;

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
            <div className="max-w-2xl mx-auto flex flex-col gap-5">
                <header>
                    <h1 className="text-2xl font-bold text-slate-800">Hola, {tablero.partner.nombre}</h1>
                    <p className="text-slate-500 text-sm mt-1">
                        Estas son las marcas a las que queremos llegar. Si tenés cómo acercarte a alguna,
                        levantá la mano y te escribimos.
                    </p>
                </header>

                {tablero.marcas.length === 0 && (
                    <p className="text-slate-400 text-sm">Por ahora no hay marcas cargadas.</p>
                )}

                {tablero.marcas.map(m => (
                    <div key={m._id} className="bg-white rounded-2xl p-5 border border-slate-200">
                        <h2 className="font-bold text-slate-800">{m.nombre}</h2>
                        {m.porQue && <p className="text-sm text-slate-500 mt-1">{m.porQue}</p>}

                        {m.manos.length > 0 && (
                            <p className="text-xs text-slate-400 mt-3">
                                Ya levantaron la mano: {m.manos.map(x => x.partnerNombre).join(', ')}
                            </p>
                        )}

                        <div className="mt-4 flex flex-col sm:flex-row gap-2">
                            <input
                                value={comentarios[m._id] || ''}
                                onChange={e => setComentarios(p => ({ ...p, [m._id]: e.target.value }))}
                                placeholder="¿Cómo llegás? (opcional)"
                                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                            <button onClick={() => enviar(m._id)}
                                className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold flex items-center justify-center gap-2">
                                <Hand size={15} /> Llego a esta
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Paso 3: Agregar la ruta pública**

En `client/src/main.tsx`, junto a `/public/report/:token` y **fuera** de `ProtectedRoute`:

```tsx
import PortalPartner from './components/public/PortalPartner.tsx'
<Route path="/partners/:token" element={<PortalPartner />} />
```

- [ ] **Paso 4: Verificar de punta a punta**

Ejecutar: `cd client && npx tsc --noEmit` → sin errores.

Generar un token para un partner real:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Guardarlo en el partner (`accessToken`), abrir `/partners/<token>` **en una ventana de incógnito** —para probar de verdad que no hace falta sesión—, levantar la mano en una marca, y verificar que aparece en la pantalla de Alan.

- [ ] **Paso 5: Commit**

```bash
git add client/src/services/portal.service.ts client/src/components/public/PortalPartner.tsx client/src/main.tsx
git commit -m "feat(partners): portal público del partner"
```

---

## Qué queda afuera

- Generar y rotar el token desde la UI: por ahora se setea a mano en la base. Si el flujo se usa, es la primera mejora.
- Perfiles de marca, reservas con vencimiento, cuentas para partners, que los partners carguen marcas propias, notificaciones automáticas y cálculo de comisiones.

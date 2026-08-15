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
    // Mongoose lo asigna solo (ManoSchema tiene `{ _id: true }`); se declara acá
    // para que el ascenso pueda identificar cada mano por su id.
    _id: mongoose.Types.ObjectId;
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
    /** `propio` = la cargamos nosotros; `partner` = la propuso un partner. */
    origen: 'propio' | 'partner';
    /** Quién la propuso, si vino de un partner. */
    propuestaPor?: mongoose.Types.ObjectId | null;
    /** A qué partners se les muestra. Vacío = a todos. */
    partners: mongoose.Types.ObjectId[];
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
    // Una marca propuesta por un partner no es lo mismo que una que buscamos
    // nosotros: se revisa distinto y define a quién le corresponde la comisión.
    origen: { type: String, enum: ['propio', 'partner'], default: 'propio', index: true },
    propuestaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
    // Vacío (o ausente, en las marcas cargadas antes de este campo) significa
    // "se la mostramos a todos". Es lo que evita que olvidarse de asignar deje
    // una marca que no ve nadie.
    partners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Partner', index: true }],
    nombre: { type: String, required: true, trim: true },
    nombreNormalizado: { type: String, required: true, index: true },
    porQue: { type: String, trim: true },
    categoria: { type: String, trim: true },
    estado: { type: String, enum: ESTADOS_MARCA, default: 'buscando', index: true },
    manos: { type: [ManoSchema], default: [] },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'marcas_buscadas' });

// Sin este índice se repiten las marcas. Es el mismo agujero que dejó tres
// "Zamp" en la colección de empresas.
MarcaBuscadaSchema.index({ userId: 1, nombreNormalizado: 1 }, { unique: true });

// `pre('validate')` y NO `pre('save')`: Mongoose corre la validación ANTES de
// los hooks de save, así que un `nombreNormalizado` requerido que se llena en
// `pre('save')` falla siempre.
MarcaBuscadaSchema.pre('validate', function (next) {
    if (this.isModified('nombre')) this.nombreNormalizado = normalizarNombre(this.nombre);
    next();
});

export const MarcaBuscada = mongoose.model<IMarcaBuscada>('MarcaBuscada', MarcaBuscadaSchema);

/**
 * Deenex Read-Only Models
 * ⚠️  These models use a secondary connection and are STRICTLY for GET operations.
 *     They use minimal schemas — only fields needed for statistics/monitoring.
 */
import mongoose, { Schema, Document } from 'mongoose';
import { getDeenexConnection } from '../../deenex-db';

// ── Helper to get model from secondary connection ───────────
function getDeenexModel<T extends Document>(name: string, schema: Schema, collection: string) {
    const conn = getDeenexConnection();
    if (!conn) throw new Error('Deenex DB not connected');
    // Re-use model if already compiled on this connection
    if (conn.models[name]) return conn.model<T>(name);
    return conn.model<T>(name, schema, collection);
}

// ══════════════════════════════════════════════════════════════
// Brand (Marca)
// ══════════════════════════════════════════════════════════════
const brandSchema = new Schema({
    domain: String,
    appName: String,
    systemOptions: Schema.Types.Mixed,
    rewardPointsSystem: Boolean,
    businessType: String,
    multipleMenu: Boolean,
    colors: Schema.Types.Mixed,
    headerLogo: String,
    createdAt: Date,
}, { strict: false, timestamps: false });

export function getDeenexBrandModel() {
    return getDeenexModel('DeenexBrand', brandSchema, 'brands');
}

// ══════════════════════════════════════════════════════════════
// Local (Sucursal)
// ══════════════════════════════════════════════════════════════
const localSchema = new Schema({
    nameLocal: String,
    addressLocal: String,
    statusLocal: Boolean,
    storeId: String,
    idMarca: { type: Schema.Types.ObjectId, ref: 'DeenexBrand' },
    geoLocation: Schema.Types.Mixed,
    paymentMethods: Schema.Types.Mixed,
    systemOptions: Schema.Types.Mixed,
    createdAt: Date,
}, { strict: false, timestamps: false });

export function getDeenexLocalModel() {
    return getDeenexModel('DeenexLocal', localSchema, 'locales');
}

// ══════════════════════════════════════════════════════════════
// Cliente (App Users)
// ══════════════════════════════════════════════════════════════
const clienteSchema = new Schema({
    nombre: String,
    email: String,
    edad: Number,
    sexo: String,
    fechaNacimiento: Date,
    medioRegistro: Schema.Types.Mixed,
    notificacionesActivas: Boolean,
    totalPuntos: Number,
    puntosHistoricos: Number,
    totalCompras: Number,
    totalDineroGastado: Number,
    ultimaCompra: Date,
    primerLocalCompra: Schema.Types.Mixed,
    ultimoLocalCompra: Schema.Types.Mixed,
    actividad: Schema.Types.Mixed,
    idMarca: { type: Schema.Types.ObjectId, ref: 'DeenexBrand' },
    createdAt: Date,
}, { strict: false, timestamps: false });

export function getDeenexClienteModel() {
    return getDeenexModel('DeenexCliente', clienteSchema, 'usuariosregistrados');
}

// ══════════════════════════════════════════════════════════════
// Order (Pedidos) — Collection: "Pagos"
// ══════════════════════════════════════════════════════════════
const orderSchema = new Schema({
    idOrder: Number,
    idCliente: { type: Schema.Types.ObjectId, ref: 'DeenexCliente' },
    idLocal: { type: Schema.Types.ObjectId, ref: 'DeenexLocal' },
    type: String,
    orderStatus: String,
    estadoDeOrden: String,
    total: Number,
    totalFacturado: Number,
    metodoDePago: Schema.Types.Mixed,
    paymentStatus: String,
    valoracion: Number,
    experiencia: String,
    motivoVisita: String,
    account: Schema.Types.Mixed,
    idMarca: { type: Schema.Types.ObjectId, ref: 'DeenexBrand' },
    createdAt: Date,
}, { strict: false, timestamps: false });

export function getDeenexOrderModel() {
    return getDeenexModel('DeenexOrder', orderSchema, 'pagos');
}

// ══════════════════════════════════════════════════════════════
// Menu (Products)
// ══════════════════════════════════════════════════════════════
const menuSchema = new Schema({
    name: String,
    price: Schema.Types.Mixed,
    finalPrice: Number,
    description: String,
    category: String,
    subCategory: String,
    active: Boolean,
    idMarca: { type: Schema.Types.ObjectId, ref: 'DeenexBrand' },
    createdAt: Date,
}, { strict: false, timestamps: false });

export function getDeenexMenuModel() {
    return getDeenexModel('DeenexMenu', menuSchema, 'menus');
}

// ══════════════════════════════════════════════════════════════
// Points (Puntos/Cashback)
// ══════════════════════════════════════════════════════════════
const pointsSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'DeenexCliente' },
    localId: { type: Schema.Types.ObjectId, ref: 'DeenexLocal' },
    reason: String,
    originalAmount: Number,
    totalAmount: Number,
    status: String,
    expirationDate: Date,
    categoryName: String,
    discountPercentage: Number,
    idMarca: { type: Schema.Types.ObjectId, ref: 'DeenexBrand' },
    createdAt: Date,
}, { strict: false, timestamps: false });

export function getDeenexPointsModel() {
    return getDeenexModel('DeenexPoints', pointsSchema, 'points');
}

// ══════════════════════════════════════════════════════════════
// Coupon
// ══════════════════════════════════════════════════════════════
const couponSchema = new Schema({
    code: String,
    discount: Number,
    discountType: String,
    minAmount: Number,
    maxAmount: Number,
    expirationDate: Date,
    status: String,
    campaign: Schema.Types.Mixed,
    idMarca: { type: Schema.Types.ObjectId, ref: 'DeenexBrand' },
    createdAt: Date,
}, { strict: false, timestamps: false });

export function getDeenexCouponModel() {
    return getDeenexModel('DeenexCoupon', couponSchema, 'coupons');
}

// ══════════════════════════════════════════════════════════════
// Story
// ══════════════════════════════════════════════════════════════
const storySchema = new Schema({
    name: String,
    image: String,
    statistics: [Schema.Types.Mixed],
    visible: Boolean,
    active: Boolean,
    idMarca: { type: Schema.Types.ObjectId, ref: 'DeenexBrand' },
    createdAt: Date,
}, { strict: false, timestamps: false });

export function getDeenexStoryModel() {
    return getDeenexModel('DeenexStory', storySchema, 'stories');
}

// ══════════════════════════════════════════════════════════════
// Notification
// ══════════════════════════════════════════════════════════════
const notificationSchema = new Schema({
    titleNot: String,
    bodyNot: String,
    schedule: Date,
    scheduleUntil: Date,
    idMarca: { type: Schema.Types.ObjectId, ref: 'DeenexBrand' },
    createdAt: Date,
}, { strict: false, timestamps: false });

export function getDeenexNotificationModel() {
    return getDeenexModel('DeenexNotification', notificationSchema, 'notifications');
}

// ══════════════════════════════════════════════════════════════
// Campaña WhatsApp
// ══════════════════════════════════════════════════════════════
const campaniaSchema = new Schema({
    progress: Schema.Types.Mixed,
    status: String,
    idMarca: { type: Schema.Types.ObjectId, ref: 'DeenexBrand' },
    createdAt: Date,
}, { strict: false, timestamps: false });

export function getDeenexCampaniaModel() {
    return getDeenexModel('DeenexCampania', campaniaSchema, 'campaniawhatsapps');
}

// ══════════════════════════════════════════════════════════════
// Category
// ══════════════════════════════════════════════════════════════
const categorySchema = new Schema({
    name: String,
    type: String,
    idMarca: { type: Schema.Types.ObjectId, ref: 'DeenexBrand' },
}, { strict: false, timestamps: false });

export function getDeenexCategoryModel() {
    return getDeenexModel('DeenexCategory', categorySchema, 'categories');
}

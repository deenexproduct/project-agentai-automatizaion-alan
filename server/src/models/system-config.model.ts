import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemConfig extends Document {
    userId: string;
    companyCategories: string[];
    contactRoles: string[];
    contactPositions: string[];
}

interface ISystemConfigModel extends mongoose.Model<ISystemConfig> {
    getOrCreate(userId: string): Promise<ISystemConfig>;
}

const SystemConfigSchema = new Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    companyCategories: [{ type: String }],
    contactRoles: [{ type: String }],
    contactPositions: [{ type: String }],
}, { timestamps: true });

SystemConfigSchema.statics.getOrCreate = async function (userId: string) {
    let config = await this.findOne({ userId });
    if (!config) {
        config = await this.create({
            userId,
            companyCategories: [
                'Gastronomía & Fast Food',
                'Dietéticas & Tiendas Naturales',
                'Farmacias & Salud',
                'Mercados & Almacenes',
                'Venta Minorista Recurrente'
            ],
            contactRoles: [
                'Decisor',
                'Aprobador',
                'Influenciador',
                'Usuario',
                'Evaluador',
                'Gatekeeper'
            ],
            contactPositions: [
                'Director General / CEO',
                'Director de Operaciones / COO',
                'Director de Marketing / CMO',
                'Director de Ventas / CSO',
                'Director de Finanzas / CFO',
                'Director de Tecnología / CTO',
                'Gerente General',
                'Gerente de Compras',
                'Gerente de Recursos Humanos',
                'Jefe de Sistemas / IT',
                'Responsable de Sucursal',
                'Líder de Proyecto',
                'Analista / Staff'
            ]
        });
    }
    return config;
};

export const SystemConfig = mongoose.model<ISystemConfig, ISystemConfigModel>('SystemConfig', SystemConfigSchema);

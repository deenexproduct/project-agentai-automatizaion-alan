/**
 * Secondary Mongoose Connection — Deenex Production Database
 * ⚠️  READ-ONLY: This connection is strictly for monitoring/statistics.
 *     Never use it for write operations (POST/PUT/PATCH/DELETE).
 */
import mongoose from 'mongoose';

const DEENEX_URI = process.env.DEENEX_MONGODB_URI || '';

let deenexConnection: mongoose.Connection | null = null;

export async function connectDeenexDB(): Promise<mongoose.Connection | null> {
    if (!DEENEX_URI) {
        console.warn('⚠️  DEENEX_MONGODB_URI not set — monitoring features disabled');
        return null;
    }
    try {
        deenexConnection = mongoose.createConnection(DEENEX_URI);

        deenexConnection.on('connected', () => {
            console.log('✅ Deenex MongoDB connected (READ-ONLY monitoring)');
        });

        deenexConnection.on('error', (err) => {
            console.error('❌ Deenex MongoDB error:', err.message);
        });

        // Wait for initial connection
        await new Promise<void>((resolve, reject) => {
            deenexConnection!.once('connected', resolve);
            deenexConnection!.once('error', reject);
        });

        return deenexConnection;
    } catch (error: any) {
        console.error('❌ Deenex MongoDB connection failed:', error.message);
        return null;
    }
}

export function getDeenexConnection(): mongoose.Connection | null {
    return deenexConnection;
}

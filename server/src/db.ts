import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/voicecommand';

export async function connectDB(): Promise<void> {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ MongoDB connected:', MONGO_URI);
    } catch (error: any) {
        console.error('❌ MongoDB connection error:', error.message);
        console.log('⚠️  Server will continue without database. Some features may not work.');
    }
}

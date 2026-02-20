import { whatsappService } from './src/services/whatsapp.service';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || '');
        console.log("Connected to MongoDB");
        // Get the tenant for user "69989061521e99ebecfe39d7" (from the JWT in curl)
        const tenant = whatsappService.getTenant("69989061521e99ebecfe39d7");
        console.log("Status:", tenant.getStatus());
        console.log("Is connected:", tenant.isConnected());

        // Force refresh
        console.log("Forcing refresh...");
        await tenant.refreshChats();
        console.log("tenant chatsCache length after refresh:", (tenant as any).chatsCache?.length);

        process.exit(0);
    } catch (err) {
        console.error("FATAL ERROR:", err);
        process.exit(1);
    }
}
run();

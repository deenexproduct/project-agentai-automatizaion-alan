import { whatsappService } from './src/services/whatsapp.service';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || '');
    const tenant = whatsappService.getTenant("69989061521e99ebecfe39d7");
    console.log("Waiting for connection...");
    
    // Auto-initialize
    const status = tenant.getStatus();
    
    // wait until connected
    while (!tenant.isConnected()) {
        await new Promise(r => setTimeout(r, 1000));
        process.stdout.write(".");
    }
    console.log("\nConnected!");
    
    await tenant.refreshChats();
    const chats = await tenant.getChats(5, "");
    console.log("\nTop 5 chats:", chats);
    
    process.exit(0);
}
run().catch(console.error);

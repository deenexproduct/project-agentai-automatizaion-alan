import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { linkedinService } from './src/services/linkedin.service';
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || '');
    const userId = "69989061521e99ebecfe39d7";
    const tenant = linkedinService.getTenant(userId);
    
    console.log("Tenant Status:", tenant.getStatus());
    console.log("Has Page:", !!tenant.getPage());
    console.log("Is Running:", tenant.isRunning);
    console.log("Current Operation:", tenant['operationManager'].getCurrent());

    process.exit(0);
}
run().catch(console.error);

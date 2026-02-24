import mongoose from 'mongoose';
import { UserModel } from '../models/user.model';

const MONGODB_URI = 'mongodb+srv://plataformacomercial_db_user:IibBxQoLLn5u30FR@deenex-comercial.p9pcnz3.mongodb.net/comercial';

async function run() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB Atlas successfully.');

        const email = 'alannaimtapia@gmail.com';
        let user = await UserModel.findOne({ email });

        if (user) {
            console.log('User already exists, ensuring admin role...');
            user.role = 'admin';
            await user.save();
        } else {
            console.log('Creating new admin user...');
            user = await UserModel.create({
                email,
                role: 'admin',
                name: 'Alan Naim Tapia'
            });
        }
        console.log('✅ Admin user created/updated successfully:', user.email, '| Role:', user.role);
    } catch (err) {
        console.error('❌ Error injecting user:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

run();

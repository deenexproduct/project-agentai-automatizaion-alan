import mongoose from 'mongoose';
import { Competitor } from './src/models/competitor.model.ts';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const comp = await Competitor.findOne({ name: /Tucan/i });
  console.log('Tucan competitor (Remote):', comp ? comp.name : 'No');
  
  if (comp) {
    if (!comp.countries || comp.countries.length === 0) {
        comp.countries = ['AR', 'UY', 'ES'];
        await comp.save();
        console.log('Added countries to Tucan');
    }
    const check = await Competitor.findById(comp._id).lean();
    console.log('Countries saved:', check.countries);
  }
  process.exit(0);
});

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Comp = mongoose.model('Competitor', new mongoose.Schema({ name: String }, {collection: 'competitors'}));
  const comp = await Comp.findOne({ name: /Tucan/i }).lean();
  
  const Company = mongoose.model('Company', new mongoose.Schema({ name: String, competitors: [{ type: mongoose.Schema.Types.ObjectId }] }, {collection: 'crm_companies'}));
  
  // Try exactly what the backend route does
  const companies = await Company.find({ competitors: comp._id.toString() })
    .select('name')
    .sort({ name: 1 })
    .lean();
    
  console.log('Result with req.params.id (String):', companies.length);
  
  const companies2 = await Company.find({ competitors: comp._id })
    .select('name')
    .sort({ name: 1 })
    .lean();
    
  console.log('Result with ObjectId:', companies2.length);
  
  process.exit(0);
});

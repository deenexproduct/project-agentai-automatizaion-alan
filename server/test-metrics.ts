import mongoose from 'mongoose';
import { Company } from './src/models/company.model';
import { Deal } from './src/models/deal.model';
import { PipelineConfig } from './src/models/pipeline-config.model';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const userStr = '666666666666666666666666'; // Dummy, we will query first deal to get a real user ID
  const firstDeal = await Deal.findOne({}).lean();
  if(!firstDeal) {
      console.log('no deals');
      process.exit(1);
  }
  const userId = firstDeal.userId;
  
  const config = await PipelineConfig.getOrCreate(userId.toString());
  let wonStageKeys = config.stages.filter(s => s.isFinal && (s.key.toLowerCase().includes('ganado') || s.key.toLowerCase().includes('won'))).map(s => s.key);
  if (wonStageKeys.length === 0) wonStageKeys = ['ganado', 'won'];
  let nonFinalStages = config.stages.filter(s => !s.isFinal).map(s => s.key);
  
  const revenueThisMonth = await Deal.aggregate([
      {
          $match: {
              userId,
              status: { $in: [...wonStageKeys, ...nonFinalStages.filter(s => s !== 'pausado')] }
          }
      },
      { $group: { _id: "$currency", totalMensual: { $sum: "$value" } } }
  ]);
  
  console.log('revenueThisMonth:', revenueThisMonth);
  process.exit(0);
}
run();

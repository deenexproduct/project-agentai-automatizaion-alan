import mongoose from 'mongoose';
import { Deal } from './src/models/deal.model';
import { PipelineConfig } from './src/models/pipeline-config.model';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const deals = await Deal.find({}).lean();
  let total = 0;
  deals.forEach(d => {
    if (d.status !== 'perdido' && d.status !== 'pausado') {
      total += d.value || 0;
    }
  });
  console.log('Projected revenue (naive):', total);
  
  const pipeline = await PipelineConfig.findOne({});
  if (pipeline) {
      let wonKeys = pipeline.stages.filter(s => s.isFinal && s.key.includes('ganado')).map(s => s.key);
      let lostKeys = pipeline.stages.filter(s => s.isFinal && s.key.includes('perdid')).map(s => s.key);
      let nonFinal = pipeline.stages.filter(s => !s.isFinal).map(s => s.key);
      console.log('Won:', wonKeys, 'Lost:', lostKeys, 'NonFinal:', nonFinal);
      
      let proj2 = 0;
      deals.forEach(d => {
          if ([...wonKeys, ...nonFinal].includes(d.status)) {
              proj2 += d.value || 0;
          }
      });
      console.log('Projected revenue (strict matches):', proj2);
  }
  
  process.exit(0);
}
run();

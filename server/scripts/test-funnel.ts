import mongoose from 'mongoose';
import { Company } from '../src/models/company.model';
import { Deal } from '../src/models/deal.model';
import { Task } from '../src/models/task.model';
import { PipelineConfig } from '../src/models/pipeline-config.model';
import { UserModel as User } from '../src/models/user.model';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const testFunnel = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || '');
        console.log('Connected to DB');

        const user = await User.findOne();
        if (!user) return;
        const userId = user._id;

        const config = await PipelineConfig.getOrCreate(userId.toString());

        let wonStageKeys = config.stages.filter(s => s.isFinal && (s.key.includes('ganado') || s.key.includes('won'))).map(s => s.key);
        if (wonStageKeys.length === 0) wonStageKeys = ['ganado'];

        let lostStageKeys = config.stages.filter(s => s.isFinal && (s.key.includes('perdid') || s.key.includes('lost'))).map(s => s.key);
        if (lostStageKeys.length === 0) lostStageKeys = ['perdido'];

        // Get all deals for funnel
        const deals = await Deal.find({ userId }).select('status statusHistory').lean();

        const totalDealsAllTime = deals.length;
        let wonDeals = 0;
        let lostDeals = 0;
        let pausedDeals = 0;

        const stageCounts: Record<string, number> = {};

        deals.forEach((deal: any) => {
            if (wonStageKeys.includes(deal.status)) wonDeals++;
            if (lostStageKeys.includes(deal.status)) lostDeals++;
            if (deal.status === 'pausado') pausedDeals++;

            const touchedStages = new Set<string>();
            touchedStages.add(deal.status);
            if (deal.statusHistory && deal.statusHistory.length > 0) {
                deal.statusHistory.forEach((h: any) => {
                    touchedStages.add(h.from);
                    touchedStages.add(h.to);
                });
            }

            touchedStages.forEach(stage => {
                stageCounts[stage] = (stageCounts[stage] || 0) + 1;
            });
        });

        const winRate = (wonDeals + lostDeals) > 0 ? (wonDeals / (wonDeals + lostDeals)) * 100 : 0;
        const leadToWon = totalDealsAllTime > 0 ? (wonDeals / totalDealsAllTime) * 100 : 0;
        const leadToRejected = totalDealsAllTime > 0 ? ((lostDeals + pausedDeals) / totalDealsAllTime) * 100 : 0;

        const funnel = config.stages.map(stage => {
            return {
                step: stage.order,
                key: stage.key,
                label: stage.label,
                count: stageCounts[stage.key] || 0
            };
        }).sort((a, b) => a.step - b.step);

        console.log({
            totalDealsAllTime,
            wonDeals,
            lostDeals,
            pausedDeals,
            winRate,
            leadToWon,
            leadToRejected,
            funnel
        });

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
};

testFunnel();

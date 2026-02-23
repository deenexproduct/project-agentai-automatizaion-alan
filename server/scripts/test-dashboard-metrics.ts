import mongoose from 'mongoose';
import { Company } from '../src/models/company.model';
import { Deal } from '../src/models/deal.model';
import { Activity } from '../src/models/activity.model';
import { CrmContact } from '../src/models/crm-contact.model';
import { Task } from '../src/models/task.model';
import { PipelineConfig } from '../src/models/pipeline-config.model';
import { UserModel as User } from '../src/models/user.model';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const testMetrics = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || '');
        console.log('Connected to DB');

        const user = await User.findOne();
        if (!user) {
            console.log('No user found');
            return;
        }

        const userId = user._id;
        console.log(`Running tests for user ID: ${userId} (${user.email || user.name})`);

        // Timeframes
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        // Fetch Pipeline Config
        const config = await PipelineConfig.getOrCreate(userId.toString());

        let wonStageKeys = config.stages.filter(s => s.isFinal && (s.key.toLowerCase().includes('ganado') || s.key.toLowerCase().includes('won'))).map(s => s.key);
        if (wonStageKeys.length === 0) wonStageKeys = ['ganado', 'won'];

        let lostStageKeys = config.stages.filter(s => s.isFinal && (s.key.toLowerCase().includes('perdid') || s.key.toLowerCase().includes('lost'))).map(s => s.key);
        if (lostStageKeys.length === 0) lostStageKeys = ['perdido', 'lost'];

        const nonFinalStages = config.stages.filter(s => !s.isFinal).map(s => s.key);

        console.log('Pipeline Config loaded.');
        console.log('Won stages:', wonStageKeys);
        console.log('Lost stages:', lostStageKeys);

        const [
            localesResult,
            companiesThisMonth,
            companiesLastMonth,
            revenueThisMonth,
            pipelineForecast,
            activitiesThisWeek,
            totalContacts,
            contactsThisMonth,
            contactsByRole,
            overdueTasksCount,
            completedTasksThisWeek,
            totalTasksThisWeek,
            dealsWon,
            dealsLost
        ] = await Promise.all([
            Company.aggregate([
                { $match: { userId } },
                { $group: { _id: null, totalLocales: { $sum: "$localesCount" } } }
            ]),
            Company.countDocuments({ userId, createdAt: { $lte: endOfMonth } }),
            Company.countDocuments({ userId, createdAt: { $lte: endOfLastMonth } }),
            Deal.aggregate([
                {
                    $match: {
                        userId,
                        status: { $in: wonStageKeys },
                        closedAt: { $gte: startOfMonth, $lte: endOfMonth }
                    }
                },
                { $group: { _id: "$currency", totalMensual: { $sum: "$value" } } }
            ]),
            Deal.aggregate([
                {
                    $match: {
                        userId,
                        status: { $in: nonFinalStages.length > 0 ? nonFinalStages : { $nin: [...wonStageKeys, ...lostStageKeys] } }
                    }
                },
                { $group: { _id: "$currency", pipelineAsignado: { $sum: "$value" } } }
            ]),
            Activity.aggregate([
                { $match: { userId, createdAt: { $gte: weekAgo } } },
                { $group: { _id: "$type", count: { $sum: 1 } } }
            ]),
            CrmContact.countDocuments({ userId }),
            CrmContact.countDocuments({ userId, createdAt: { $gte: startOfMonth, $lte: endOfMonth } }),
            CrmContact.aggregate([
                { $match: { userId } },
                { $group: { _id: "$role", count: { $sum: 1 } } }
            ]),
            Task.countDocuments({
                userId,
                dueDate: { $lt: now },
                status: { $in: ["pending", "in_progress"] }
            }),
            Task.countDocuments({
                userId,
                completedAt: { $gte: weekAgo },
                status: "completed"
            }),
            Task.countDocuments({
                userId,
                $or: [
                    { createdAt: { $gte: weekAgo } },
                    { dueDate: { $gte: weekAgo, $lte: now } }
                ]
            }),
            Deal.countDocuments({ userId, status: { $in: wonStageKeys } }),
            Deal.countDocuments({ userId, status: { $in: lostStageKeys } })
        ]);

        const totalLocales = localesResult[0]?.totalLocales || 0;
        const totalCompanies = companiesThisMonth;
        const growthFromLastMonth = companiesThisMonth - companiesLastMonth;

        const winRate = (dealsWon + dealsLost) > 0 ? (dealsWon / (dealsWon + dealsLost)) * 100 : 0;
        const completionRate = totalTasksThisWeek > 0 ? (completedTasksThisWeek / totalTasksThisWeek) * 100 : 0;

        const result = {
            companies: {
                totalLocales,
                totalCompanies,
                growthFromLastMonth
            },
            revenue: {
                wonThisMonth: revenueThisMonth.map(r => ({ currency: r._id || 'USD', amount: r.totalMensual })),
                pipelineForecast: pipelineForecast.map(r => ({ currency: r._id || 'USD', amount: r.pipelineAsignado }))
            },
            traceability: {
                activitiesThisWeek: activitiesThisWeek.map(a => ({ type: a._id, count: a.count }))
            },
            contacts: {
                total: totalContacts,
                newThisMonth: contactsThisMonth,
                byRole: contactsByRole.map(r => ({ role: r._id || 'other', count: r.count }))
            },
            tasks: {
                overdue: overdueTasksCount,
                completionRateThisWeek: completionRate
            },
            conversion: {
                winRate,
                dealsWon,
                dealsLost
            }
        };

        console.log('========= METRICS RESULT =========');
        console.log(JSON.stringify(result, null, 2));

    } catch (err) {
        console.error('Error running test script:', err);
    } finally {
        await mongoose.disconnect();
    }
};

testMetrics();

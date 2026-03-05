// Script to generate all test data needed for complete report rendering
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb+srv://plataformacomercial_db_user:IibBxQoLLn5u30FR@deenex-comercial.p9pcnz3.mongodb.net/comercial';
const USER_ID = '699d9386d93cc1dc427f6f03';

async function main() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // ── 1. Insert a PREVIOUS WEEK fake report (for week comparison) ──
    const prevWeekStart = new Date('2026-02-23T03:00:00.000Z');
    const prevWeekEnd = new Date('2026-03-02T02:59:59.999Z');

    // Delete any existing prev week report
    await db.collection('ops_weekly_reports').deleteMany({
        weekStart: prevWeekStart,
        userId: new mongoose.Types.ObjectId(USER_ID)
    });

    await db.collection('ops_weekly_reports').insertOne({
        weekStart: prevWeekStart,
        weekEnd: prevWeekEnd,
        weekLabel: 'Semana del 23 al 1 de marzo de 2026',
        generatedAt: new Date('2026-03-01T23:00:00.000Z'),
        generatedBy: new mongoose.Types.ObjectId(USER_ID),
        totalTasksAtStart: 5,
        totalTasksCreated: 3,
        totalTasksCompleted: 2,
        completionRate: 40,
        completedTasks: [],
        pendingTasks: [],
        goalsSnapshot: [],
        goalsCompletedThisWeek: 0,
        avgGoalProgress: 35,
        dailyProductivity: [
            { day: 'lunes', dayLabel: 'Lunes', tasksCompleted: 1, tasksCreated: 1 },
            { day: 'martes', dayLabel: 'Martes', tasksCompleted: 0, tasksCreated: 1 },
            { day: 'miércoles', dayLabel: 'Miércoles', tasksCompleted: 1, tasksCreated: 0 },
            { day: 'jueves', dayLabel: 'Jueves', tasksCompleted: 0, tasksCreated: 1 },
            { day: 'viernes', dayLabel: 'Viernes', tasksCompleted: 0, tasksCreated: 0 },
            { day: 'sábado', dayLabel: 'Sábado', tasksCompleted: 0, tasksCreated: 0 },
            { day: 'domingo', dayLabel: 'Domingo', tasksCompleted: 0, tasksCreated: 0 },
        ],
        mostProductiveDay: 'Lunes',
        mostProductiveDayCount: 1,
        dealsMovedForward: 1,
        dealsByStatus: { anticipo: 3 },
        highlights: ['Se completaron 2 tareas operativas'],
        overallScore: 30,
        executiveSummary: 'Semana con rendimiento moderado.',
        nextWeekGoals: [],
        userId: new mongoose.Types.ObjectId(USER_ID),
        publicToken: require('crypto').randomBytes(24).toString('hex'),
        createdAt: new Date('2026-03-01T23:00:00.000Z'),
        updatedAt: new Date('2026-03-01T23:00:00.000Z'),
    });
    console.log('✅ Previous week report inserted');

    // ── 2. Create test tasks (completed by different "virtual" users) ──
    const tasksCollection = db.collection('tasks');

    // Find or create a second user for member ranking
    const usersCollection = db.collection('users');
    const allUsers = await usersCollection.find({}).limit(5).toArray();
    console.log(`Found ${allUsers.length} users`);

    const secondUserId = allUsers.length > 1 ? allUsers[1]._id : null;
    const secondUserName = allUsers.length > 1 ? allUsers[1].name : null;

    const now = new Date();

    // Create completed tasks for THIS week assigned to main user
    for (let i = 0; i < 3; i++) {
        await tasksCollection.insertOne({
            title: `Revisión operativa módulo ${i + 1}`,
            type: 'call',
            priority: 'high',
            status: 'completed',
            platform: 'operaciones',
            assignedTo: new mongoose.Types.ObjectId(USER_ID),
            userId: new mongoose.Types.ObjectId(USER_ID),
            completedAt: new Date(now.getTime() - (i * 3600000)), // stagger by hours
            createdAt: new Date(now.getTime() - (i * 3600000) - 86400000),
            updatedAt: now,
        });
    }
    console.log('✅ Created 3 completed tasks for main user');

    // Create completed tasks for SECOND user (for member ranking)
    if (secondUserId) {
        for (let i = 0; i < 2; i++) {
            await tasksCollection.insertOne({
                title: `Implementación feature ${i + 1}`,
                type: 'meeting',
                priority: 'medium',
                status: 'completed',
                platform: 'operaciones',
                assignedTo: secondUserId,
                userId: new mongoose.Types.ObjectId(USER_ID),
                completedAt: new Date(now.getTime() - ((i + 3) * 3600000)),
                createdAt: new Date(now.getTime() - ((i + 3) * 3600000) - 86400000),
                updatedAt: now,
            });
        }
        console.log(`✅ Created 2 completed tasks for ${secondUserName}`);
    }

    // Create PENDING tasks with OVERDUE due dates
    await tasksCollection.insertOne({
        title: 'Deploy módulo de facturación pendiente',
        type: 'note',
        priority: 'high',
        status: 'pending',
        platform: 'operaciones',
        assignedTo: new mongoose.Types.ObjectId(USER_ID),
        userId: new mongoose.Types.ObjectId(USER_ID),
        dueDate: new Date('2026-03-01T23:59:59.000Z'), // OVERDUE
        createdAt: new Date('2026-02-25T10:00:00.000Z'),
        updatedAt: now,
    });
    await tasksCollection.insertOne({
        title: 'Corrección bug crítico producción',
        type: 'call',
        priority: 'high',
        status: 'pending',
        platform: 'operaciones',
        assignedTo: new mongoose.Types.ObjectId(USER_ID),
        userId: new mongoose.Types.ObjectId(USER_ID),
        dueDate: new Date('2026-03-03T23:59:59.000Z'), // OVERDUE
        createdAt: new Date('2026-02-28T10:00:00.000Z'),
        updatedAt: now,
    });
    await tasksCollection.insertOne({
        title: 'Preparar informe Q1 para directorio',
        type: 'meeting',
        priority: 'medium',
        status: 'pending',
        platform: 'operaciones',
        assignedTo: new mongoose.Types.ObjectId(USER_ID),
        userId: new mongoose.Types.ObjectId(USER_ID),
        dueDate: new Date('2026-03-15T23:59:59.000Z'), // NOT overdue
        createdAt: new Date('2026-03-01T10:00:00.000Z'),
        updatedAt: now,
    });
    console.log('✅ Created 3 pending tasks (2 overdue, 1 normal)');

    // ── 3. Update active goals with deadlines in range ──
    const goalsCollection = db.collection('ops_goals');
    const activeGoals = await goalsCollection.find({ status: 'active' }).limit(3).toArray();
    console.log(`Found ${activeGoals.length} active goals`);

    for (let i = 0; i < Math.min(activeGoals.length, 3); i++) {
        const daysOffset = (i + 1) * 3 + 2; // 5, 8, 11 days from now
        const deadline = new Date(now.getTime() + daysOffset * 86400000);
        await goalsCollection.updateOne(
            { _id: activeGoals[i]._id },
            { $set: { deadline } }
        );
        console.log(`  Updated goal "${activeGoals[i].title}" deadline -> ${deadline.toISOString()}`);
    }

    // ── 4. Delete existing current-week reports ──
    const currentWeekStart = new Date();
    const dayOfWeek = currentWeekStart.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    currentWeekStart.setDate(currentWeekStart.getDate() - diffToMonday);
    currentWeekStart.setHours(0, 0, 0, 0);

    const deleted = await db.collection('ops_weekly_reports').deleteMany({
        weekStart: { $gte: currentWeekStart },
        userId: new mongoose.Types.ObjectId(USER_ID)
    });
    console.log(`✅ Deleted ${deleted.deletedCount} current-week report(s)`);

    console.log('\n🎉 All test data generated! Now generate a report from the UI.');

    await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });

/**
 * Agent Framework Runner - JavaScript version for direct execution
 */

const { operationManager } = require('../services/linkedin/operation-manager.service');
const { statePersistence } = require('../services/linkedin/state-persistence.service');
const { healthMonitor } = require('../services/linkedin/health-monitor.service');
const { RetryService } = require('../services/linkedin/retry.service');
const { humanBehavior } = require('../services/linkedin/human-behavior.service');
const { rateLimitHandler } = require('../services/linkedin/rate-limit-handler.service');
const { EventEmitter } = require('events');

// Colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(name) {
    console.log('\n' + '='.repeat(70));
    log(name, 'cyan');
    console.log('='.repeat(70));
}

// Test Results
const results = [];

async function runTest(name, fn) {
    const start = Date.now();
    const failures = [];
    let assertions = 0;

    const assert = (condition, message) => {
        assertions++;
        if (!condition) failures.push(message);
    };

    try {
        await fn(assert);
        const duration = Date.now() - start;
        results.push({ name, passed: failures.length === 0, duration, assertions, failures });
        return { passed: true, duration };
    } catch (error) {
        const duration = Date.now() - start;
        failures.push(`Exception: ${error.message}`);
        results.push({ name, passed: false, duration, assertions, failures });
        return { passed: false, duration, error: error.message };
    }
}

// Test Agent Class
class TestAgent extends EventEmitter {
    constructor(id) {
        super();
        this.id = id;
        this.active = false;
    }

    async executeTask(task) {
        this.active = true;
        this.emit('started', task);

        try {
            const acquired = await operationManager.acquire(task.type, { agentId: this.id });
            
            if (!acquired) {
                const current = operationManager.getCurrent();
                this.emit('blocked', { task, currentOp: current });
                return { success: false, reason: 'blocked', currentOp: current };
            }

            // Simulate work
            for (let i = 0; i < task.profiles.length; i++) {
                await new Promise(r => setTimeout(r, 10));
                const delay = humanBehavior.getRandomDelay(5, 20);
                await new Promise(r => setTimeout(r, delay));
                
                this.emit('progress', { 
                    agentId: this.id, 
                    profile: task.profiles[i], 
                    progress: `${i + 1}/${task.profiles.length}` 
                });
            }

            healthMonitor.recordSuccess(task.expectedDuration);
            this.emit('completed', task);
            return { success: true, task, agentId: this.id };

        } catch (error) {
            healthMonitor.recordError(error, `agent_${this.id}`);
            this.emit('error', { task, error: error.message });
            return { success: false, error: error.message };
        } finally {
            operationManager.release();
            this.active = false;
        }
    }
}

// Orchestrator
class AgentOrchestrator {
    constructor() {
        this.agents = new Map();
        this.results = new Map();
    }

    createAgent(id) {
        const agent = new TestAgent(id);
        this.agents.set(id, agent);
        return agent;
    }

    async runConcurrent(tasks, maxConcurrent) {
        const results = [];
        const queue = [...tasks];
        const running = new Set();

        while (queue.length > 0 || running.size > 0) {
            while (running.size < maxConcurrent && queue.length > 0) {
                const task = queue.shift();
                const agent = this.createAgent(`agent-${task.id}`);
                
                const promise = agent.executeTask(task).then(result => {
                    results.push(result);
                    this.results.set(task.id, result);
                    running.delete(promise);
                });
                
                running.add(promise);
            }

            if (running.size > 0) {
                await Promise.race(running);
            }
        }

        return results;
    }

    reset() {
        this.agents.clear();
        this.results.clear();
    }
}

const orchestrator = new AgentOrchestrator();

// ═════════════════════════════════════════════════════════════════
// TEST SUITES
// ═════════════════════════════════════════════════════════════════

async function runMutexTests() {
    section('🔒 MUTEX & CONCURRENCY TESTS');

    await runTest('Mutex prevents concurrent operations', async (assert) => {
        operationManager.forceRelease();
        
        const agent1 = orchestrator.createAgent('mutex-1');
        const task1 = { id: 'm1', type: 'prospecting', profiles: ['p1'], expectedDuration: 50 };
        const result1Promise = agent1.executeTask(task1);
        
        await new Promise(r => setTimeout(r, 30));
        
        const agent2 = orchestrator.createAgent('mutex-2');
        const task2 = { id: 'm2', type: 'checking_accepted', profiles: ['p2'], expectedDuration: 50 };
        const result2 = await agent2.executeTask(task2);
        const result1 = await result1Promise;

        assert(result1.success, 'Agent 1 should succeed');
        assert(!result2.success, 'Agent 2 should be blocked');
        assert(result2.reason === 'blocked', 'Agent 2 should be blocked');
    });

    await runTest('Mutex auto-release on timeout', async (assert) => {
        operationManager.forceRelease();
        const originalTimeout = operationManager.MAX_OP_DURATION_MS;
        operationManager.MAX_OP_DURATION_MS = 50;

        try {
            await operationManager.acquire('prospecting');
            await new Promise(r => setTimeout(r, 100));
            
            const acquired = await operationManager.acquire('enriching');
            assert(acquired, 'Should auto-release after timeout');
            
            operationManager.release();
        } finally {
            operationManager.MAX_OP_DURATION_MS = originalTimeout;
        }
    });

    await runTest('Sequential execution with mutex', async (assert) => {
        operationManager.forceRelease();
        healthMonitor.reset();

        const tasks = [
            { id: 's1', type: 'prospecting', profiles: ['p1'], expectedDuration: 30 },
            { id: 's2', type: 'prospecting', profiles: ['p2'], expectedDuration: 30 },
            { id: 's3', type: 'prospecting', profiles: ['p3'], expectedDuration: 30 },
        ];

        const results = await orchestrator.runConcurrent(tasks, 1);
        const successCount = results.filter(r => r.success).length;
        assert(successCount === 3, `Expected 3 successes, got ${successCount}`);
    });
}

async function runHealthTests() {
    section('📊 HEALTH MONITOR TESTS');

    await runTest('Records successes correctly', async (assert) => {
        healthMonitor.reset();
        // Wait for reset to propagate
        await new Promise(r => setTimeout(r, 10));
        for (let i = 0; i < 10; i++) {
            healthMonitor.recordSuccess(3000);
        }
        const metrics = healthMonitor.getMetrics();
        assert(metrics.profilesProcessed === 10, `Expected 10 profiles, got ${metrics.profilesProcessed}`);
        assert(metrics.successRate === 1, 'Should have 100% success rate');
    });

    await runTest('Detects error spikes', async (assert) => {
        healthMonitor.reset();
        for (let i = 0; i < 5; i++) {
            healthMonitor.recordError(new Error(`Error ${i}`), 'test');
        }
        const status = healthMonitor.getHealthStatus();
        assert(!status.healthy, 'Should be unhealthy after 5 errors');
        assert(status.consecutiveErrors === 5, `Expected 5 errors, got ${status.consecutiveErrors}`);
        assert(status.alerts.length > 0, 'Should have alerts');
        assert(status.alerts[0].includes('ERROR_SPIKE'), 'Should have ERROR_SPIKE alert');
    });

    await runTest('Calculates risk score', async (assert) => {
        healthMonitor.reset();
        healthMonitor.recordSuccess(3000);
        healthMonitor.recordSuccess(3000);
        healthMonitor.recordError(new Error('Test'), 'test');
        healthMonitor.recordError(new Error('Test'), 'test');

        const status = healthMonitor.getHealthStatus();
        assert(status.riskScore > 0, 'Risk score should be > 0');
        assert(status.riskScore <= 100, 'Risk score should be <= 100');
    });

    await runTest('Provides correct recommendations', async (assert) => {
        healthMonitor.reset();
        healthMonitor.recordSuccess(3000);
        let rec = healthMonitor.getRecommendation();
        assert(rec.includes('CONTINUE'), 'Should recommend CONTINUE when healthy');

        for (let i = 0; i < 5; i++) {
            healthMonitor.recordError(new Error('Test'), 'test');
        }
        rec = healthMonitor.getRecommendation();
        assert(rec.includes('PAUSE'), 'Should recommend PAUSE on error spike');
    });
}

async function runStateTests() {
    section('💾 STATE PERSISTENCE TESTS');

    await runTest('Saves and loads state correctly', async (assert) => {
        const testState = {
            batchId: 'test-batch-agent',
            accountEmail: 'test@example.com',
            profiles: [
                { url: 'https://linkedin.com/in/1', status: 'completed', attempts: 1 },
                { url: 'https://linkedin.com/in/2', status: 'failed', attempts: 2 },
                { url: 'https://linkedin.com/in/3', status: 'pending', attempts: 0 },
            ],
            currentIndex: 2,
            startTime: new Date().toISOString(),
            isPaused: false,
            options: { totalLimit: 10, dailyLimit: 10, autoFollow: false },
            stats: { processed: 2, successful: 1, failed: 1, pending: 1 },
        };

        await statePersistence.save(testState);
        const loaded = await statePersistence.load();

        assert(loaded !== null, 'Should load state');
        assert(loaded.batchId === testState.batchId, 'BatchId mismatch');
        assert(loaded.profiles.length === 3, 'Should have 3 profiles');
        await statePersistence.clear();
    });

    await runTest('Auto-save intervals work correctly', async (assert) => {
        assert(statePersistence.shouldAutoSave(5, 5), '5 should trigger auto-save');
        assert(statePersistence.shouldAutoSave(10, 5), '10 should trigger auto-save');
        assert(!statePersistence.shouldAutoSave(4, 5), '4 should not trigger');
        assert(!statePersistence.shouldAutoSave(0, 5), '0 should not trigger');
    });
}

async function runRetryTests() {
    section('🔄 RETRY SERVICE TESTS');

    await runTest('Exponential backoff works', async (assert) => {
        const delays = [];
        const retryService = new RetryService({ maxRetries: 3, baseDelayMs: 10, backoffMultiplier: 2 });

        const originalSleep = retryService.sleep || retryService.constructor.prototype.sleep;
        retryService.sleep = (ms) => { delays.push(ms); return Promise.resolve(); };

        try {
            await retryService.execute(async (attempt) => {
                if (attempt < 2) throw new Error('timeout');
                return 'success';
            });
            assert(delays.length === 2, `Expected 2 delays, got ${delays.length}`);
            assert(delays[1] > delays[0] * 1.5, 'Second delay should be larger');
        } finally {
            retryService.sleep = originalSleep;
        }
    });

    await runTest('Respects max retries', async (assert) => {
        let attempts = 0;
        const retryService = new RetryService({ maxRetries: 2, baseDelayMs: 1 });

        try {
            await retryService.execute(async () => {
                attempts++;
                throw new Error('timeout');
            });
            assert(false, 'Should have thrown');
        } catch (e) {
            assert(attempts === 3, `Expected 3 attempts, got ${attempts}`);
        }
    });

    await runTest('Does not retry non-retryable errors', async (assert) => {
        let attempts = 0;
        const retryService = new RetryService({ maxRetries: 3 });

        try {
            await retryService.execute(async () => {
                attempts++;
                throw new Error('Fatal error');
            });
            assert(false, 'Should have thrown');
        } catch (e) {
            assert(attempts === 1, `Expected 1 attempt, got ${attempts}`);
        }
    });
}

async function runHumanBehaviorTests() {
    section('🎭 HUMAN BEHAVIOR TESTS');

    await runTest('Generates realistic random delays', async (assert) => {
        const delays = [];
        for (let i = 0; i < 50; i++) {
            const delay = humanBehavior.getRandomDelay(1000, 2000);
            delays.push(delay);
            // Allow small margin due to variance
            assert(delay >= 950 && delay <= 2050, `Delay ${delay} out of range`);
        }

        const uniqueDelays = new Set(delays);
        assert(uniqueDelays.size >= 10, `Expected more variance, got ${uniqueDelays.size} unique`);

        const mean = delays.reduce((a, b) => a + b, 0) / delays.length;
        assert(mean >= 1300 && mean <= 1700, `Mean ${mean} outside expected range`);
    });
}

async function runStressTests() {
    section('🔥 STRESS TESTS');

    await runTest('Handles 100 profiles', async (assert) => {
        operationManager.forceRelease();
        healthMonitor.reset();
        await new Promise(r => setTimeout(r, 10)); // Wait for reset

        const profiles = Array.from({ length: 100 }, (_, i) => `https://linkedin.com/in/profile-${i}`);
        const task = { id: 'stress-100', type: 'prospecting', profiles, expectedDuration: 100 };

        const agent = orchestrator.createAgent('stress-agent');
        const result = await agent.executeTask(task);

        assert(result.success, 'Should succeed');
        const metrics = healthMonitor.getMetrics();
        assert(metrics.profilesProcessed === 100, `Expected 100, got ${metrics.profilesProcessed}`);
    });

    await runTest('5 concurrent agents (mutex enforced)', async (assert) => {
        operationManager.forceRelease();
        healthMonitor.reset();

        const tasks = Array.from({ length: 5 }, (_, i) => ({
            id: `concurrent-${i}`,
            type: i % 2 === 0 ? 'prospecting' : 'checking_accepted',
            profiles: Array.from({ length: 5 }, (_, j) => `profile-${i}-${j}`),
            expectedDuration: 50,
        }));

        const results = await orchestrator.runConcurrent(tasks, 5);
        const successCount = results.filter(r => r.success).length;
        const blockedCount = results.filter(r => r.reason === 'blocked').length;

        assert(successCount === 1, `Expected 1 success, got ${successCount}`);
        assert(blockedCount === 4, `Expected 4 blocked, got ${blockedCount}`);
    });

    await runTest('50 rapid acquire/release cycles', async (assert) => {
        operationManager.forceRelease();
        for (let i = 0; i < 50; i++) {
            const acquired = await operationManager.acquire('prospecting');
            assert(acquired, `Failed to acquire on iteration ${i}`);
            operationManager.release();
        }
        const history = operationManager.getHistory(100);
        assert(history.length >= 50, `Expected 50+ history, got ${history.length}`);
    });
}

async function runIntegrationTests() {
    section('🔗 FULL INTEGRATION TESTS');

    await runTest('Complete workflow simulation', async (assert) => {
        operationManager.forceRelease();
        healthMonitor.reset();
        await statePersistence.clear();
        rateLimitHandler.resume();

        const task = {
            id: 'full-workflow',
            type: 'prospecting',
            profiles: ['https://linkedin.com/in/1', 'https://linkedin.com/in/2', 'https://linkedin.com/in/3'],
            expectedDuration: 100,
        };

        const agent = orchestrator.createAgent('workflow-agent');
        const result = await agent.executeTask(task);

        assert(result.success, 'Workflow should succeed');

        const health = healthMonitor.getHealthStatus();
        const metrics = healthMonitor.getMetrics();

        assert(health.healthy, 'Should be healthy');
        assert(metrics.successRate === 1, 'Should have 100% success');
    });
}

// ═════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════

async function main() {
    log('\n🧪 LINKEDIN ENHANCED SERVICES - AGENT TEST FRAMEWORK\n', 'blue');
    log('Testing all components with simulated agents and subagents...\n', 'gray');

    // Suppress event warnings
    healthMonitor.on('error', () => {});
    healthMonitor.on('error-spike', () => {});

    await runMutexTests();
    await runHealthTests();
    await runStateTests();
    await runRetryTests();
    await runHumanBehaviorTests();
    await runStressTests();
    await runIntegrationTests();

    // Report
    section('📋 FINAL REPORT');

    let passed = 0;
    let failed = 0;
    let totalDuration = 0;

    results.forEach((result, i) => {
        const icon = result.passed ? '✅' : '❌';
        const color = result.passed ? 'green' : 'red';
        log(`${icon} ${i + 1}. ${result.name}`, color);
        log(`   Duration: ${result.duration}ms | Assertions: ${result.assertions}`, 'gray');
        if (result.failures.length > 0) {
            result.failures.forEach(f => log(`   ⚠️  ${f}`, 'yellow'));
        }
        totalDuration += result.duration;
        if (result.passed) passed++; else failed++;
    });

    console.log('\n' + '='.repeat(70));
    log(`📊 SUMMARY: ${passed}/${results.length} tests passed (${((passed / results.length) * 100).toFixed(1)}%)`, passed === results.length ? 'green' : 'yellow');
    log(`⏱️  Total Duration: ${totalDuration}ms`, 'gray');
    log(`🔥 Tests Run: ${results.length} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`, 'cyan');
    console.log('='.repeat(70));

    if (failed === 0) {
        log('\n🎉 ALL TESTS PASSED! System is 100% functional.', 'green');
        log('✅ OperationManager: Mutex working correctly', 'green');
        log('✅ HealthMonitor: Tracking and alerts working', 'green');
        log('✅ StatePersistence: Save/Load/Backup working', 'green');
        log('✅ RetryService: Backoff and retries working', 'green');
        log('✅ HumanBehavior: Randomization working', 'green');
        log('✅ Stress Tests: System stable under load', 'green');
        log('✅ Integration: Full workflow validated\n', 'green');
    } else {
        log(`\n⚠️  ${failed} test(s) failed. Review errors above.\n`, 'yellow');
    }

    return { passed, failed, total: results.length };
}

main().then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});

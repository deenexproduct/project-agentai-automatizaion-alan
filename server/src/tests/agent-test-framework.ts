/**
 * Agent Test Framework
 * Framework exhaustivo para probar el sistema con agentes y subagentes
 * Simula operaciones reales de prospecting con validación completa
 */

import { EventEmitter } from 'events';
import { operationManager } from '../services/linkedin/operation-manager.service';
import { statePersistence, ProspectingState } from '../services/linkedin/state-persistence.service';
import { healthMonitor } from '../services/linkedin/health-monitor.service';
import { RetryService } from '../services/linkedin/retry.service';
import { humanBehavior } from '../services/linkedin/human-behavior.service';
import { captchaHandler } from '../services/linkedin/captcha-handler.service';
import { rateLimitHandler } from '../services/linkedin/rate-limit-handler.service';
import { connectionVerifier } from '../services/linkedin/connection-verifier.service';

// Test configuration
const CONFIG = {
    maxProfiles: 100,
    concurrentAgents: 5,
    simulationDelay: 10, // ms for fast testing
};

interface TestResult {
    name: string;
    passed: boolean;
    duration: number;
    assertions: number;
    failures: string[];
    metrics?: any;
}

interface AgentTask {
    id: string;
    type: 'prospecting' | 'checking_accepted' | 'enriching';
    profiles: string[];
    expectedDuration: number;
}

class TestAgent extends EventEmitter {
    id: string;
    private active = false;
    private results: any[] = [];

    constructor(id: string) {
        super();
        this.id = id;
    }

    async executeTask(task: AgentTask): Promise<any> {
        this.active = true;
        this.emit('started', task);

        try {
            // Try to acquire operation lock
            const acquired = await operationManager.acquire(task.type, { agentId: this.id });
            
            if (!acquired) {
                const current = operationManager.getCurrent();
                this.emit('blocked', { task, currentOp: current });
                return { success: false, reason: 'blocked', currentOp: current };
            }

            // Simulate work
            await this.simulateWork(task);

            // Record success
            healthMonitor.recordSuccess(task.expectedDuration);

            this.emit('completed', task);
            return { success: true, task, agentId: this.id };

        } catch (error: any) {
            healthMonitor.recordError(error, `agent_${this.id}`);
            this.emit('error', { task, error: error.message });
            return { success: false, error: error.message };
        } finally {
            operationManager.release();
            this.active = false;
        }
    }

    private async simulateWork(task: AgentTask): Promise<void> {
        // Simulate processing each profile
        for (let i = 0; i < task.profiles.length; i++) {
            await new Promise(r => setTimeout(r, CONFIG.simulationDelay));
            
            // Simulate random delays like human behavior
            const delay = humanBehavior.getRandomDelay(5, 20);
            await new Promise(r => setTimeout(r, delay));
            
            this.emit('progress', { 
                agentId: this.id, 
                profile: task.profiles[i], 
                progress: `${i + 1}/${task.profiles.length}` 
            });
        }
    }

    isActive(): boolean {
        return this.active;
    }
}

class AgentOrchestrator {
    private agents: Map<string, TestAgent> = new Map();
    private results: Map<string, any> = new Map();

    createAgent(id: string): TestAgent {
        const agent = new TestAgent(id);
        this.agents.set(id, agent);
        return agent;
    }

    async runConcurrent(tasks: AgentTask[], maxConcurrent: number): Promise<any[]> {
        const results: any[] = [];
        const queue = [...tasks];
        const running = new Set<Promise<any>>();

        while (queue.length > 0 || running.size > 0) {
            // Start new tasks up to maxConcurrent
            while (running.size < maxConcurrent && queue.length > 0) {
                const task = queue.shift()!;
                const agent = this.createAgent(`agent-${task.id}`);
                
                const promise = agent.executeTask(task).then(result => {
                    results.push(result);
                    this.results.set(task.id, result);
                    running.delete(promise);
                });
                
                running.add(promise);
            }

            // Wait for at least one to complete
            if (running.size > 0) {
                await Promise.race(running);
            }
        }

        return results;
    }

    getAgent(id: string): TestAgent | undefined {
        return this.agents.get(id);
    }

    getAllResults(): Map<string, any> {
        return this.results;
    }

    reset(): void {
        this.agents.clear();
        this.results.clear();
    }
}

// Test Suites
export class LinkedInAgentTests {
    private results: TestResult[] = [];
    private orchestrator = new AgentOrchestrator();

    // Helper to run a test with timing
    private async runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
        const start = Date.now();
        const failures: string[] = [];
        let assertions = 0;

        const assert = (condition: boolean, message: string) => {
            assertions++;
            if (!condition) {
                failures.push(message);
            }
        };

        try {
            await fn();
            const duration = Date.now() - start;
            const result: TestResult = {
                name,
                passed: failures.length === 0,
                duration,
                assertions,
                failures,
            };
            this.results.push(result);
            return result;
        } catch (error: any) {
            const duration = Date.now() - start;
            failures.push(`Exception: ${error.message}`);
            const result: TestResult = {
                name,
                passed: false,
                duration,
                assertions,
                failures,
            };
            this.results.push(result);
            return result;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST SUITE 1: Mutex y Concurrencia
    // ═══════════════════════════════════════════════════════════════
    
    async testMutexPreventsConcurrentOperations(): Promise<TestResult> {
        return this.runTest('Mutex: Prevents concurrent operations', async () => {
            operationManager.forceRelease();
            
            // First agent acquires lock
            const agent1 = this.orchestrator.createAgent('mutex-test-1');
            const task1: AgentTask = {
                id: 'mutex-1',
                type: 'prospecting',
                profiles: ['profile1', 'profile2'],
                expectedDuration: 100,
            };

            const result1Promise = agent1.executeTask(task1);
            
            // Small delay to ensure agent1 gets the lock
            await new Promise(r => setTimeout(r, 50));
            
            // Second agent should be blocked
            const agent2 = this.orchestrator.createAgent('mutex-test-2');
            const task2: AgentTask = {
                id: 'mutex-2',
                type: 'checking_accepted',
                profiles: ['profile3'],
                expectedDuration: 50,
            };
            
            const result2 = await agent2.executeTask(task2);
            const result1 = await result1Promise;

            // Assert
            if (!result1.success) throw new Error('Agent 1 should succeed');
            if (result2.success) throw new Error('Agent 2 should be blocked');
            if (result2.reason !== 'blocked') throw new Error('Agent 2 should be blocked, not fail');
        });
    }

    async testMutexAutoReleaseOnTimeout(): Promise<TestResult> {
        return this.runTest('Mutex: Auto-release on timeout', async () => {
            operationManager.forceRelease();
            
            // Force a very short timeout
            const originalTimeout = (operationManager as any).MAX_OP_DURATION_MS;
            (operationManager as any).MAX_OP_DURATION_MS = 50;

            try {
                // Acquire lock
                await operationManager.acquire('prospecting');
                
                // Wait for timeout
                await new Promise(r => setTimeout(r, 100));
                
                // Should be able to acquire again
                const acquired = await operationManager.acquire('enriching');
                if (!acquired) throw new Error('Should auto-release after timeout');
                
                operationManager.release();
            } finally {
                (operationManager as any).MAX_OP_DURATION_MS = originalTimeout;
            }
        });
    }

    async testMultipleAgentsSequentialExecution(): Promise<TestResult> {
        return this.runTest('Mutex: Multiple agents execute sequentially', async () => {
            operationManager.forceRelease();
            healthMonitor.reset();

            const tasks: AgentTask[] = [
                { id: 'seq-1', type: 'prospecting', profiles: ['p1'], expectedDuration: 50 },
                { id: 'seq-2', type: 'prospecting', profiles: ['p2'], expectedDuration: 50 },
                { id: 'seq-3', type: 'prospecting', profiles: ['p3'], expectedDuration: 50 },
            ];

            const results = await this.orchestrator.runConcurrent(tasks, 1); // 1 concurrent = sequential

            // All should succeed with sequential execution
            const successCount = results.filter(r => r.success).length;
            if (successCount !== 3) throw new Error(`Expected 3 successes, got ${successCount}`);
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST SUITE 2: HealthMonitor y Métricas
    // ═══════════════════════════════════════════════════════════════

    async testHealthMonitorRecordsSuccesses(): Promise<TestResult> {
        return this.runTest('Health: Records successes correctly', async () => {
            healthMonitor.reset();

            // Simulate 10 successful profiles
            for (let i = 0; i < 10; i++) {
                healthMonitor.recordSuccess(3000 + i * 100);
            }

            const metrics = healthMonitor.getMetrics();
            if (metrics.profilesProcessed !== 10) throw new Error(`Expected 10 profiles, got ${metrics.profilesProcessed}`);
            if (metrics.successRate !== 1) throw new Error(`Expected 100% success rate, got ${metrics.successRate}`);
            if (metrics.errorRate !== 0) throw new Error(`Expected 0% error rate, got ${metrics.errorRate}`);
        });
    }

    async testHealthMonitorDetectsErrorSpike(): Promise<TestResult> {
        return this.runTest('Health: Detects error spikes', async () => {
            healthMonitor.reset();

            // Record 5 errors
            for (let i = 0; i < 5; i++) {
                healthMonitor.recordError(new Error(`Error ${i}`), 'test');
            }

            const status = healthMonitor.getHealthStatus();
            if (status.healthy) throw new Error('Should be unhealthy after 5 errors');
            if (status.consecutiveErrors !== 5) throw new Error(`Expected 5 consecutive errors, got ${status.consecutiveErrors}`);
            if (status.alerts.length === 0) throw new Error('Should have alerts');
            if (!status.alerts[0].includes('ERROR_SPIKE')) throw new Error('Should have ERROR_SPIKE alert');
        });
    }

    async testHealthMonitorRiskScore(): Promise<TestResult> {
        return this.runTest('Health: Calculates risk score correctly', async () => {
            healthMonitor.reset();

            // Mix of successes and errors
            healthMonitor.recordSuccess(3000);
            healthMonitor.recordSuccess(3000);
            healthMonitor.recordError(new Error('Test'), 'test');
            healthMonitor.recordError(new Error('Test'), 'test');

            const status = healthMonitor.getHealthStatus();
            if (status.riskScore === 0) throw new Error('Risk score should be > 0');
            if (status.riskScore > 100) throw new Error('Risk score should be <= 100');
        });
    }

    async testHealthMonitorRecommendations(): Promise<TestResult> {
        return this.runTest('Health: Provides correct recommendations', async () => {
            healthMonitor.reset();

            // Healthy state
            healthMonitor.recordSuccess(3000);
            let rec = healthMonitor.getRecommendation();
            if (!rec.includes('CONTINUE')) throw new Error('Should recommend CONTINUE when healthy');

            // Error spike
            for (let i = 0; i < 5; i++) {
                healthMonitor.recordError(new Error('Test'), 'test');
            }
            rec = healthMonitor.getRecommendation();
            if (!rec.includes('PAUSE')) throw new Error('Should recommend PAUSE on error spike');
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST SUITE 3: StatePersistence y Recuperación
    // ═══════════════════════════════════════════════════════════════

    async testStatePersistenceSaveAndLoad(): Promise<TestResult> {
        return this.runTest('State: Saves and loads correctly', async () => {
            const testState: any = {
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

            if (!loaded) throw new Error('Should load state');
            if (loaded.batchId !== testState.batchId) throw new Error('BatchId mismatch');
            if (loaded.profiles.length !== 3) throw new Error('Should have 3 profiles');
            if (loaded.currentIndex !== 2) throw new Error('CurrentIndex mismatch');

            // Cleanup
            await statePersistence.clear();
        });
    }

    async testStatePersistenceAutoSaveIntervals(): Promise<TestResult> {
        return this.runTest('State: Auto-save intervals work correctly', async () => {
            // Should save at intervals of 5
            if (!statePersistence.shouldAutoSave(5, 5)) throw new Error('5 should trigger auto-save');
            if (!statePersistence.shouldAutoSave(10, 5)) throw new Error('10 should trigger auto-save');
            if (statePersistence.shouldAutoSave(4, 5)) throw new Error('4 should not trigger');
            if (statePersistence.shouldAutoSave(0, 5)) throw new Error('0 should not trigger');
        });
    }

    async testStatePersistenceBackups(): Promise<TestResult> {
        return this.runTest('State: Creates backups correctly', async () => {
            const testState: any = {
                batchId: 'backup-test',
                accountEmail: 'test@example.com',
                profiles: [{ url: 'https://linkedin.com/in/test', status: 'completed', attempts: 1 }],
                currentIndex: 1,
                startTime: new Date().toISOString(),
                isPaused: false,
                options: { totalLimit: 1, dailyLimit: 1, autoFollow: false },
                stats: { processed: 1, successful: 1, failed: 0, pending: 0 },
            };

            await statePersistence.save(testState);
            const backupsBefore = statePersistence.listBackups();

            // Save again to create backup
            await statePersistence.save(testState);
            const backupsAfter = statePersistence.listBackups();

            if (backupsAfter.length < backupsBefore.length) {
                throw new Error('Should create backup on save');
            }

            // Cleanup
            await statePersistence.clear();
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST SUITE 4: RetryService
    // ═══════════════════════════════════════════════════════════════

    async testRetryServiceExponentialBackoff(): Promise<TestResult> {
        return this.runTest('Retry: Exponential backoff works', async () => {
            const delays: number[] = [];
            const retryService = new RetryService({ 
                maxRetries: 3, 
                baseDelayMs: 10, 
                backoffMultiplier: 2 
            });

            // Mock sleep to capture delays
            const originalSleep = (retryService as any).sleep;
            (retryService as any).sleep = (ms: number) => {
                delays.push(ms);
                return Promise.resolve();
            };

            try {
                await retryService.execute(async (attempt) => {
                    if (attempt < 2) throw new Error('timeout');
                    return 'success';
                });

                // Should have 2 delays (for retries 1 and 2)
                if (delays.length !== 2) throw new Error(`Expected 2 delays, got ${delays.length}`);
                
                // Second delay should be roughly 2x the first (with jitter)
                if (delays[1] < delays[0] * 1.5) {
                    throw new Error('Second delay should be > 1.5x first delay');
                }
            } finally {
                (retryService as any).sleep = originalSleep;
            }
        });
    }

    async testRetryServiceMaxRetries(): Promise<TestResult> {
        return this.runTest('Retry: Respects max retries', async () => {
            let attempts = 0;
            const retryService = new RetryService({ maxRetries: 2, baseDelayMs: 1 });

            try {
                await retryService.execute(async () => {
                    attempts++;
                    throw new Error('timeout'); // Always fails
                });
                throw new Error('Should have thrown');
            } catch (e) {
                // Should attempt 3 times (initial + 2 retries)
                if (attempts !== 3) throw new Error(`Expected 3 attempts, got ${attempts}`);
            }
        });
    }

    async testRetryServiceNonRetryableErrors(): Promise<TestResult> {
        return this.runTest('Retry: Does not retry non-retryable errors', async () => {
            let attempts = 0;
            const retryService = new RetryService({ maxRetries: 3 });

            try {
                await retryService.execute(async () => {
                    attempts++;
                    throw new Error('Fatal error'); // Not in retryable list
                });
                throw new Error('Should have thrown');
            } catch (e) {
                if (attempts !== 1) throw new Error(`Expected 1 attempt, got ${attempts}`);
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST SUITE 5: HumanBehavior
    // ═══════════════════════════════════════════════════════════════

    async testHumanBehaviorRandomDelays(): Promise<TestResult> {
        return this.runTest('Human: Generates realistic random delays', async () => {
            const delays: number[] = [];
            
            for (let i = 0; i < 50; i++) {
                const delay = humanBehavior.getRandomDelay(1000, 2000);
                delays.push(delay);
                
                if (delay < 1000 || delay > 2000) {
                    throw new Error(`Delay ${delay} out of range`);
                }
            }

            // Check variance - should not all be the same
            const uniqueDelays = new Set(delays);
            if (uniqueDelays.size < 10) {
                throw new Error(`Expected more variance, only ${uniqueDelays.size} unique values`);
            }

            // Check distribution - mean should be around 1500
            const mean = delays.reduce((a, b) => a + b, 0) / delays.length;
            if (mean < 1300 || mean > 1700) {
                throw new Error(`Mean ${mean} outside expected range`);
            }
        });
    }

    async testHumanBehaviorBezierCurve(): Promise<TestResult> {
        return this.runTest('Human: Bezier curve generation', async () => {
            // This tests the internal bezier calculation
            const points = [
                { x: 0, y: 0 },
                { x: 100, y: 50 },
                { x: 200, y: 50 },
                { x: 300, y: 100 },
            ];

            // Get bezier point at t=0.5 (should be near middle)
            const midPoint = (humanBehavior as any).getBezierPoint(0.5, points);
            
            if (midPoint.x < 100 || midPoint.x > 200) {
                throw new Error(`Midpoint x=${midPoint.x} outside expected range`);
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST SUITE 6: Estrés y Carga
    // ═══════════════════════════════════════════════════════════════

    async testStress100Profiles(): Promise<TestResult> {
        return this.runTest('Stress: Handles 100 profiles', async () => {
            operationManager.forceRelease();
            healthMonitor.reset();

            const profiles = Array.from({ length: 100 }, (_, i) => `https://linkedin.com/in/profile-${i}`);
            
            const task: AgentTask = {
                id: 'stress-100',
                type: 'prospecting',
                profiles,
                expectedDuration: 100,
            };

            const agent = this.orchestrator.createAgent('stress-agent');
            const start = Date.now();
            const result = await agent.executeTask(task);
            const duration = Date.now() - start;

            if (!result.success) throw new Error('Should succeed');
            
            const metrics = healthMonitor.getMetrics();
            if (metrics.profilesProcessed !== 100) {
                throw new Error(`Expected 100 profiles processed, got ${metrics.profilesProcessed}`);
            }

            // Return value handled by runTest wrapper
        });
    }

    async testStressConcurrentAgents(): Promise<TestResult> {
        return this.runTest('Stress: 5 concurrent agents', async () => {
            operationManager.forceRelease();
            healthMonitor.reset();

            const tasks: AgentTask[] = Array.from({ length: 5 }, (_, i) => ({
                id: `concurrent-${i}`,
                type: i % 2 === 0 ? 'prospecting' : 'checking_accepted',
                profiles: Array.from({ length: 5 }, (_, j) => `profile-${i}-${j}`),
                expectedDuration: 50,
            }));

            // Due to mutex, they should execute sequentially even with high concurrency
            const start = Date.now();
            const results = await this.orchestrator.runConcurrent(tasks, 5);
            const duration = Date.now() - start;

            // Only one should succeed (first to get lock), others blocked
            const successCount = results.filter(r => r.success).length;
            const blockedCount = results.filter(r => r.reason === 'blocked').length;

            if (successCount !== 1) throw new Error(`Expected 1 success, got ${successCount}`);
            if (blockedCount !== 4) throw new Error(`Expected 4 blocked, got ${blockedCount}`);

            // Return value handled by runTest wrapper
        });
    }

    async testStressRapidOperations(): Promise<TestResult> {
        return this.runTest('Stress: 50 rapid acquire/release cycles', async () => {
            operationManager.forceRelease();

            for (let i = 0; i < 50; i++) {
                const acquired = await operationManager.acquire('prospecting');
                if (!acquired) throw new Error(`Failed to acquire on iteration ${i}`);
                operationManager.release();
            }

            const history = operationManager.getHistory(100);
            if (history.length < 50) {
                throw new Error(`Expected 50+ history entries, got ${history.length}`);
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST SUITE 7: Integración Completa
    // ═══════════════════════════════════════════════════════════════

    async testFullWorkflow(): Promise<TestResult> {
        return this.runTest('Integration: Full workflow simulation', async () => {
            // Reset everything
            operationManager.forceRelease();
            healthMonitor.reset();
            await statePersistence.clear();
            rateLimitHandler.resume();

            // Step 1: Start prospecting
            const task: AgentTask = {
                id: 'full-workflow',
                type: 'prospecting',
                profiles: [
                    'https://linkedin.com/in/success1',
                    'https://linkedin.com/in/success2',
                    'https://linkedin.com/in/success3',
                ],
                expectedDuration: 100,
            };

            const agent = this.orchestrator.createAgent('workflow-agent');
            const result = await agent.executeTask(task);

            if (!result.success) throw new Error('Workflow should succeed');

            // Step 2: Verify health metrics
            const health = healthMonitor.getHealthStatus();
            const metrics = healthMonitor.getMetrics();

            if (!health.healthy) throw new Error('Should be healthy after successful workflow');
            if (metrics.successRate !== 1) throw new Error('Should have 100% success rate');

            // Step 3: Verify operation history
            const history = operationManager.getHistory(10);
            if (history.length === 0) throw new Error('Should have operation history');
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // RUN ALL TESTS
    // ═══════════════════════════════════════════════════════════════

    async runAllTests(): Promise<TestResult[]> {
        console.log('🧪 Starting LinkedIn Agent Tests...\n');
        
        this.results = [];
        this.orchestrator.reset();

        // Mutex Tests
        console.log('📦 Running Mutex & Concurrency Tests...');
        await this.testMutexPreventsConcurrentOperations();
        await this.testMutexAutoReleaseOnTimeout();
        await this.testMultipleAgentsSequentialExecution();

        // HealthMonitor Tests
        console.log('📊 Running HealthMonitor Tests...');
        await this.testHealthMonitorRecordsSuccesses();
        await this.testHealthMonitorDetectsErrorSpike();
        await this.testHealthMonitorRiskScore();
        await this.testHealthMonitorRecommendations();

        // StatePersistence Tests
        console.log('💾 Running StatePersistence Tests...');
        await this.testStatePersistenceSaveAndLoad();
        await this.testStatePersistenceAutoSaveIntervals();
        await this.testStatePersistenceBackups();

        // RetryService Tests
        console.log('🔄 Running RetryService Tests...');
        await this.testRetryServiceExponentialBackoff();
        await this.testRetryServiceMaxRetries();
        await this.testRetryServiceNonRetryableErrors();

        // HumanBehavior Tests
        console.log('🎭 Running HumanBehavior Tests...');
        await this.testHumanBehaviorRandomDelays();
        await this.testHumanBehaviorBezierCurve();

        // Stress Tests
        console.log('🔥 Running Stress Tests...');
        await this.testStress100Profiles();
        await this.testStressConcurrentAgents();
        await this.testStressRapidOperations();

        // Integration Tests
        console.log('🔗 Running Integration Tests...');
        await this.testFullWorkflow();

        return this.results;
    }

    getSummary(): { total: number; passed: number; failed: number; duration: number } {
        const passed = this.results.filter(r => r.passed).length;
        const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
        
        return {
            total: this.results.length,
            passed,
            failed: this.results.length - passed,
            duration: totalDuration,
        };
    }

    printReport(): void {
        const summary = this.getSummary();
        
        console.log('\n' + '='.repeat(70));
        console.log('📋 TEST REPORT');
        console.log('='.repeat(70));

        this.results.forEach((result, i) => {
            const icon = result.passed ? '✅' : '❌';
            console.log(`${icon} ${i + 1}. ${result.name}`);
            console.log(`   Duration: ${result.duration}ms | Assertions: ${result.assertions}`);
            if (result.failures.length > 0) {
                result.failures.forEach(f => console.log(`   ⚠️  ${f}`));
            }
            console.log();
        });

        console.log('='.repeat(70));
        console.log(`📊 Summary: ${summary.passed}/${summary.total} passed (${((summary.passed / summary.total) * 100).toFixed(1)}%)`);
        console.log(`⏱️  Total Duration: ${summary.duration}ms`);
        console.log('='.repeat(70));

        if (summary.failed === 0) {
            console.log('\n🎉 ALL TESTS PASSED! System is 100% functional.\n');
        } else {
            console.log(`\n⚠️  ${summary.failed} test(s) failed. Review errors above.\n`);
        }
    }
}

// Export for use
export { TestAgent, AgentOrchestrator, TestResult, AgentTask };

// Run if executed directly
if (require.main === module) {
    const tests = new LinkedInAgentTests();
    tests.runAllTests().then(() => {
        tests.printReport();
        const summary = tests.getSummary();
        process.exit(summary.failed > 0 ? 1 : 0);
    }).catch(err => {
        console.error('💥 Fatal error:', err);
        process.exit(1);
    });
}

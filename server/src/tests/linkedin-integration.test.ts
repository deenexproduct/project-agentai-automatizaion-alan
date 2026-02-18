/**
 * Integration Tests for LinkedIn Enhanced Services
 * Tests OperationManager, HealthMonitor, StatePersistence integration
 */

import { operationManager } from '../services/linkedin/operation-manager.service';
import { statePersistence } from '../services/linkedin/state-persistence.service';
import { healthMonitor } from '../services/linkedin/health-monitor.service';
import { connectionVerifier } from '../services/linkedin/connection-verifier.service';
import { RetryService } from '../services/linkedin/retry.service';
import { humanBehavior } from '../services/linkedin/human-behavior.service';

// Test configuration
const TEST_TIMEOUT = 30000;

// Helper to create a mock Puppeteer page
function createMockPage(overrides: any = {}) {
    return {
        url: () => 'https://www.linkedin.com/in/test-profile/',
        evaluate: async (fn: any, ...args: any[]) => {
            // Simulate different scenarios based on test
            if (overrides.evaluateResult !== undefined) {
                return overrides.evaluateResult;
            }
            return fn(...args);
        },
        goto: async () => {},
        reload: async () => {},
        mouse: {
            move: async () => {},
            click: async () => {},
        },
        content: async () => '<html><body>Test</body></html>',
        waitForSelector: async () => {},
        screenshot: async () => {},
        $: async () => null,
        $$: async () => [],
        ...overrides,
    };
}

describe('LinkedIn Enhanced Services Integration', () => {
    
    beforeEach(() => {
        // Reset state before each test
        operationManager.forceRelease();
        healthMonitor.reset();
    });

    // ─── OperationManager Tests ─────────────────────────────────────
    describe('OperationManager', () => {
        test('should acquire and release lock', async () => {
            const acquired = await operationManager.acquire('prospecting');
            expect(acquired).toBe(true);
            expect(operationManager.getCurrent()).toBe('prospecting');
            
            operationManager.release();
            expect(operationManager.getCurrent()).toBe('none');
        });

        test('should reject concurrent operations', async () => {
            await operationManager.acquire('prospecting');
            
            const second = await operationManager.acquire('checking_accepted');
            expect(second).toBe(false);
            
            operationManager.release();
        });

        test('should auto-release after timeout', async () => {
            // Force a short timeout by mocking
            const originalMaxDuration = (operationManager as any).MAX_OP_DURATION_MS;
            (operationManager as any).MAX_OP_DURATION_MS = 1; // 1ms for testing
            
            await operationManager.acquire('prospecting');
            await new Promise(r => setTimeout(r, 10)); // Wait for timeout
            
            // Should be able to acquire again
            const acquired = await operationManager.acquire('enriching');
            expect(acquired).toBe(true);
            
            // Restore
            (operationManager as any).MAX_OP_DURATION_MS = originalMaxDuration;
            operationManager.release();
        });
    });

    // ─── HealthMonitor Tests ────────────────────────────────────────
    describe('HealthMonitor', () => {
        test('should record success and calculate metrics', () => {
            healthMonitor.recordSuccess(5000);
            
            const metrics = healthMonitor.getMetrics();
            expect(metrics.profilesProcessed).toBe(1);
            expect(metrics.successRate).toBe(1);
            expect(metrics.errorRate).toBe(0);
        });

        test('should record errors and detect spikes', () => {
            // Record 5 errors
            for (let i = 0; i < 5; i++) {
                healthMonitor.recordError(new Error('Test error'), 'test');
            }
            
            const status = healthMonitor.getHealthStatus();
            expect(status.consecutiveErrors).toBe(5);
            expect(status.alerts.length).toBeGreaterThan(0);
            expect(status.alerts[0]).toContain('ERROR_SPIKE');
        });

        test('should calculate risk score', () => {
            // Record some errors and captchas
            healthMonitor.recordError(new Error('Test'), 'test');
            healthMonitor.recordError(new Error('Test'), 'test');
            
            const status = healthMonitor.getHealthStatus();
            expect(status.riskScore).toBeGreaterThan(0);
            expect(typeof status.riskScore).toBe('number');
        });

        test('should detect stall condition', () => {
            // Manually set last success to far in the past
            (healthMonitor as any).lastSuccessTimestamp = new Date(Date.now() - 11 * 60 * 1000); // 11 minutes ago
            
            const status = healthMonitor.getHealthStatus();
            expect(status.alerts.length).toBeGreaterThan(0);
            expect(status.alerts[0]).toContain('STALL');
        });

        test('should provide recommendations', () => {
            // Healthy state
            healthMonitor.recordSuccess(5000);
            let rec = healthMonitor.getRecommendation();
            expect(rec).toContain('CONTINUE');

            // Error spike
            for (let i = 0; i < 5; i++) {
                healthMonitor.recordError(new Error('Test'), 'test');
            }
            rec = healthMonitor.getRecommendation();
            expect(rec).toContain('PAUSE');
        });
    });

    // ─── RetryService Tests ─────────────────────────────────────────
    describe('RetryService', () => {
        test('should retry on failure', async () => {
            let attempts = 0;
            const retryService = new RetryService({ maxRetries: 3, baseDelayMs: 10 });
            
            const result = await retryService.execute(async (attempt) => {
                attempts++;
                if (attempt < 2) {
                    throw new Error('Retryable error: timeout');
                }
                return 'success';
            });
            
            expect(result).toBe('success');
            expect(attempts).toBe(3); // Initial + 2 retries
        });

        test('should not retry non-retryable errors', async () => {
            let attempts = 0;
            const retryService = new RetryService({ maxRetries: 3 });
            
            await expect(
                retryService.execute(async () => {
                    attempts++;
                    throw new Error('Fatal error'); // Not in retryable list
                })
            ).rejects.toThrow('Fatal error');
            
            expect(attempts).toBe(1); // No retries
        });

        test('should use backoff', async () => {
            const delays: number[] = [];
            const retryService = new RetryService({ 
                maxRetries: 3, 
                baseDelayMs: 100,
                backoffMultiplier: 2 
            });
            
            // Mock delay to capture values
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
            } finally {
                (retryService as any).sleep = originalSleep;
            }
            
            // Should have increasing delays (with jitter variance)
            expect(delays.length).toBe(2);
            expect(delays[1]).toBeGreaterThan(delays[0] * 1.5); // With jitter
        });
    });

    // ─── HumanBehavior Tests ────────────────────────────────────────
    describe('HumanBehavior', () => {
        test('should generate random delays', () => {
            const d1 = humanBehavior.getRandomDelay(1000, 2000);
            const d2 = humanBehavior.getRandomDelay(1000, 2000);
            
            expect(d1).toBeGreaterThanOrEqual(1000);
            expect(d1).toBeLessThanOrEqual(2000);
            expect(d2).toBeGreaterThanOrEqual(1000);
            expect(d2).toBeLessThanOrEqual(2000);
        });

        test('should generate different delays', () => {
            // With variance, should get different values
            const delays = Array.from({ length: 10 }, () => 
                humanBehavior.getRandomDelay(1000, 2000)
            );
            
            const uniqueDelays = new Set(delays);
            expect(uniqueDelays.size).toBeGreaterThan(1);
        });
    });

    // ─── StatePersistence Tests ─────────────────────────────────────
    describe('StatePersistence', () => {
        test('should save and load state', async () => {
            const testState = {
                batchId: 'test-batch-123',
                accountEmail: 'test@example.com',
                profiles: [
                    { url: 'https://linkedin.com/in/test', status: 'completed' as const, attempts: 1 }
                ],
                currentIndex: 1,
                startTime: new Date().toISOString(),
                isPaused: false,
                options: {
                    totalLimit: 10,
                    dailyLimit: 10,
                    autoFollow: false,
                },
                stats: {
                    processed: 1,
                    successful: 1,
                    failed: 0,
                    pending: 0,
                },
            };
            
            await statePersistence.save(testState);
            const loaded = await statePersistence.load();
            
            expect(loaded).not.toBeNull();
            expect(loaded!.batchId).toBe('test-batch-123');
            expect(loaded!.profiles.length).toBe(1);
        });

        test('should detect existing state', async () => {
            const hasState = statePersistence.hasState();
            expect(typeof hasState).toBe('boolean');
        });

        test('should provide summary', async () => {
            const summary = await statePersistence.getSummary();
            expect(summary).toHaveProperty('hasState');
            expect(summary).toHaveProperty('summary');
        });

        test('should determine auto-save intervals', () => {
            expect(statePersistence.shouldAutoSave(5, 5)).toBe(true);
            expect(statePersistence.shouldAutoSave(4, 5)).toBe(false);
            expect(statePersistence.shouldAutoSave(10, 5)).toBe(true);
            expect(statePersistence.shouldAutoSave(0, 5)).toBe(false);
        });
    });

    // ─── Integration Tests ──────────────────────────────────────────
    describe('Full Integration', () => {
        test('should handle operation lifecycle', async () => {
            // 1. Acquire operation
            const acquired = await operationManager.acquire('prospecting');
            expect(acquired).toBe(true);
            
            // 2. Record some successes
            healthMonitor.recordSuccess(3000);
            healthMonitor.recordSuccess(4000);
            
            // 3. Check health
            let health = healthMonitor.getHealthStatus();
            expect(health.healthy).toBe(true);
            expect(health.consecutiveErrors).toBe(0);
            
            // 4. Release operation
            operationManager.release();
            expect(operationManager.getCurrent()).toBe('none');
        });

        test('should detect unhealthy state', async () => {
            await operationManager.acquire('prospecting');
            
            // Record multiple errors
            for (let i = 0; i < 5; i++) {
                healthMonitor.recordError(new Error('Network error'), 'profile_' + i);
            }
            
            const health = healthMonitor.getHealthStatus();
            expect(health.healthy).toBe(false);
            expect(health.riskScore).toBeGreaterThan(40);
            expect(health.alerts.length).toBeGreaterThan(0);
            
            operationManager.release();
        });

        test('should provide recovery recommendation', async () => {
            // Healthy state
            healthMonitor.recordSuccess(5000);
            let rec = healthMonitor.getRecommendation();
            expect(rec).toContain('CONTINUE');
            
            // Unhealthy state
            for (let i = 0; i < 5; i++) {
                healthMonitor.recordError(new Error('Test'), 'test');
            }
            rec = healthMonitor.getRecommendation();
            expect(rec).toContain('PAUSE');
        });
    });
});

// Run tests if this file is executed directly
if (require.main === module) {
    console.log('🧪 Running LinkedIn Integration Tests...\n');
    
    // Simple test runner
    const tests: Array<{ name: string; fn: () => Promise<void> }> = [];
    let currentSuite = '';
    
    // Mock describe/it
    (global as any).describe = (name: string, fn: () => void) => {
        currentSuite = name;
        fn();
    };
    
    (global as any).test = (name: string, fn: () => Promise<void>) => {
        tests.push({ name: `${currentSuite} > ${name}`, fn });
    };
    
    (global as any).beforeEach = () => {};
    (global as any).expect = (value: any) => ({
        toBe: (expected: any) => {
            if (value !== expected) {
                throw new Error(`Expected ${expected} but got ${value}`);
            }
        },
        toBeNull: () => {
            if (value !== null) {
                throw new Error(`Expected null but got ${value}`);
            }
        },
        not: {
            toBeNull: () => {
                if (value === null) {
                    throw new Error(`Expected not null but got null`);
                }
            },
        },
        toBeGreaterThan: (expected: number) => {
            if (!(value > expected)) {
                throw new Error(`Expected ${value} to be greater than ${expected}`);
            }
        },
        toBeGreaterThanOrEqual: (expected: number) => {
            if (!(value >= expected)) {
                throw new Error(`Expected ${value} to be >= ${expected}`);
            }
        },
        toBeLessThanOrEqual: (expected: number) => {
            if (!(value <= expected)) {
                throw new Error(`Expected ${value} to be <= ${expected}`);
            }
        },
        toHaveProperty: (prop: string) => {
            if (!(prop in value)) {
                throw new Error(`Expected object to have property ${prop}`);
            }
        },
        rejects: {
            toThrow: async (expected: string) => {
                try {
                    await value;
                    throw new Error(`Expected to throw but did not`);
                } catch (e: any) {
                    if (!e.message.includes(expected)) {
                        throw new Error(`Expected error with "${expected}" but got "${e.message}"`);
                    }
                }
            },
        },
    });
    
    // Load tests
    require(__filename);
    
    // Run tests
    (async () => {
        let passed = 0;
        let failed = 0;
        
        for (const test of tests) {
            try {
                await test.fn();
                console.log(`✅ ${test.name}`);
                passed++;
            } catch (error: any) {
                console.log(`❌ ${test.name}`);
                console.log(`   ${error.message}\n`);
                failed++;
            }
        }
        
        console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
        process.exit(failed > 0 ? 1 : 0);
    })();
}

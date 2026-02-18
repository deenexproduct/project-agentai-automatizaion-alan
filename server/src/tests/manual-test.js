/**
 * Manual Test Script for LinkedIn Enhanced Services
 * Run with: node dist/tests/manual-test.js
 */

const { operationManager } = require('../services/linkedin/operation-manager.service');
const { statePersistence } = require('../services/linkedin/state-persistence.service');
const { healthMonitor } = require('../services/linkedin/health-monitor.service');
const { RetryService } = require('../services/linkedin/retry.service');
const { humanBehavior } = require('../services/linkedin/human-behavior.service');
const { rateLimitHandler } = require('../services/linkedin/rate-limit-handler.service');

// Colors for output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(name) {
    console.log('\n' + '='.repeat(60));
    log(name, 'cyan');
    console.log('='.repeat(60));
}

// Test results
let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        log(`✅ ${name}`, 'green');
        passed++;
    } catch (error) {
        log(`❌ ${name}`, 'red');
        log(`   Error: ${error.message}`, 'red');
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

// Setup event handlers to prevent unhandled error events
healthMonitor.on('error', () => {}); // Ignore error events in tests
healthMonitor.on('error-spike', () => {});

// Run all tests
async function runTests() {
    log('\n🧪 LinkedIn Enhanced Services - Integration Tests\n', 'blue');

    // ─── OperationManager Tests ─────────────────────────────────────
    section('OperationManager Tests');

    await test('should acquire and release lock', async () => {
        const acquired = await operationManager.acquire('prospecting');
        assert(acquired === true, 'Should acquire lock');
        assert(operationManager.getCurrent() === 'prospecting', 'Current should be prospecting');
        operationManager.release();
        assert(operationManager.getCurrent() === 'none', 'Should be none after release');
    });

    await test('should reject concurrent operations', async () => {
        await operationManager.acquire('prospecting');
        const second = await operationManager.acquire('checking_accepted');
        assert(second === false, 'Should reject second operation');
        operationManager.release();
    });

    await test('should track operation history', async () => {
        await operationManager.acquire('prospecting');
        operationManager.release();
        const history = operationManager.getHistory(1);
        assert(history.length > 0, 'Should have history');
        assert(history[0].op === 'prospecting', 'Should record operation type');
    });

    // ─── HealthMonitor Tests ────────────────────────────────────────
    section('HealthMonitor Tests');

    await test('should record success and calculate metrics', () => {
        healthMonitor.reset();
        healthMonitor.recordSuccess(5000);
        const metrics = healthMonitor.getMetrics();
        assert(metrics.profilesProcessed === 1, 'Should count 1 profile');
        assert(metrics.successRate === 1, 'Should have 100% success rate');
    });

    await test('should record errors and detect spikes', () => {
        healthMonitor.reset();
        for (let i = 0; i < 5; i++) {
            healthMonitor.recordError(new Error('Test error'), 'test');
        }
        const status = healthMonitor.getHealthStatus();
        assert(status.consecutiveErrors === 5, 'Should count 5 consecutive errors');
        assert(status.alerts.length > 0, 'Should have alerts');
        assert(status.alerts[0].includes('ERROR_SPIKE'), 'Should detect error spike');
    });

    await test('should calculate risk score', () => {
        healthMonitor.reset();
        healthMonitor.recordError(new Error('Test'), 'test');
        healthMonitor.recordError(new Error('Test'), 'test');
        const status = healthMonitor.getHealthStatus();
        assert(status.riskScore > 0, 'Should have positive risk score');
        assert(typeof status.riskScore === 'number', 'Risk score should be a number');
    });

    await test('should provide recommendations', () => {
        healthMonitor.reset();
        healthMonitor.recordSuccess(5000);
        let rec = healthMonitor.getRecommendation();
        assert(rec.includes('CONTINUE'), 'Should recommend continue when healthy');
        
        for (let i = 0; i < 5; i++) {
            healthMonitor.recordError(new Error('Test'), 'test');
        }
        rec = healthMonitor.getRecommendation();
        assert(rec.includes('PAUSE'), 'Should recommend pause on error spike');
    });

    await test('should detect unhealthy state', () => {
        healthMonitor.reset();
        for (let i = 0; i < 5; i++) {
            healthMonitor.recordError(new Error('Test'), 'test');
        }
        const status = healthMonitor.getHealthStatus();
        assert(status.healthy === false, 'Should be unhealthy');
        assert(status.riskScore >= 40, `Should have high risk score, got ${status.riskScore}`);
    });

    // ─── RetryService Tests ─────────────────────────────────────────
    section('RetryService Tests');

    await test('should retry on failure', async () => {
        let attempts = 0;
        const retryService = new RetryService({ maxRetries: 3, baseDelayMs: 10 });
        
        const result = await retryService.execute(async (attempt) => {
            attempts++;
            if (attempt < 2) {
                throw new Error('Retryable error: timeout');
            }
            return 'success';
        });
        
        assert(result === 'success', 'Should return success');
        assert(attempts === 3, 'Should try 3 times');
    });

    await test('should not retry non-retryable errors', async () => {
        let attempts = 0;
        const retryService = new RetryService({ maxRetries: 3 });
        
        try {
            await retryService.execute(async () => {
                attempts++;
                throw new Error('Fatal error');
            });
            assert(false, 'Should have thrown');
        } catch (e) {
            assert(attempts === 1, 'Should not retry non-retryable errors');
        }
    });

    // ─── HumanBehavior Tests ────────────────────────────────────────
    section('HumanBehavior Tests');

    await test('should generate random delays', () => {
        const d1 = humanBehavior.getRandomDelay(1000, 2000);
        const d2 = humanBehavior.getRandomDelay(1000, 2000);
        
        assert(d1 >= 1000 && d1 <= 2000, 'd1 should be in range');
        assert(d2 >= 1000 && d2 <= 2000, 'd2 should be in range');
        assert(d1 !== d2, 'Should generate different delays');
    });

    await test('should generate delays with variance', () => {
        const delays = Array.from({ length: 20 }, () => 
            humanBehavior.getRandomDelay(1000, 2000)
        );
        
        const uniqueDelays = new Set(delays);
        assert(uniqueDelays.size > 5, 'Should have variety in delays');
    });

    // ─── StatePersistence Tests ─────────────────────────────────────
    section('StatePersistence Tests');

    await test('should save and load state', async () => {
        const testState = {
            batchId: 'test-batch-123',
            accountEmail: 'test@example.com',
            profiles: [
                { url: 'https://linkedin.com/in/test', status: 'completed', attempts: 1 }
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
        
        assert(loaded !== null, 'Should load state');
        assert(loaded.batchId === 'test-batch-123', 'Should preserve batchId');
        assert(loaded.profiles.length === 1, 'Should preserve profiles');
        
        // Cleanup
        await statePersistence.clear();
    });

    await test('should determine auto-save intervals', () => {
        assert(statePersistence.shouldAutoSave(5, 5) === true, '5 should trigger auto-save');
        assert(statePersistence.shouldAutoSave(4, 5) === false, '4 should not trigger');
        assert(statePersistence.shouldAutoSave(10, 5) === true, '10 should trigger');
    });

    // ─── RateLimitHandler Tests ─────────────────────────────────────
    section('RateLimitHandler Tests');

    await test('should calculate recommended delays', () => {
        rateLimitHandler.recordSuccess(); // Reset
        let delay = rateLimitHandler.getRecommendedDelay();
        assert(delay === 0, 'Should be 0 when no limits');
    });

    await test('should track rate limit status', () => {
        const status = rateLimitHandler.getStatus();
        assert(typeof status.isPaused === 'boolean', 'Should have isPaused');
        assert(typeof status.consecutiveLimits === 'number', 'Should have consecutiveLimits');
    });

    // ─── Integration Tests ──────────────────────────────────────────
    section('Full Integration Tests');

    await test('should handle operation lifecycle', async () => {
        healthMonitor.reset();
        
        // Acquire operation
        const acquired = await operationManager.acquire('prospecting');
        assert(acquired === true, 'Should acquire');
        
        // Record successes
        healthMonitor.recordSuccess(3000);
        healthMonitor.recordSuccess(4000);
        
        // Check health
        const health = healthMonitor.getHealthStatus();
        assert(health.healthy === true, 'Should be healthy');
        assert(health.consecutiveErrors === 0, 'Should have no errors');
        
        // Release
        operationManager.release();
        assert(operationManager.getCurrent() === 'none', 'Should release');
    });

    await test('should detect unhealthy state and recommend action', async () => {
        healthMonitor.reset();
        
        await operationManager.acquire('prospecting');
        
        // Record errors
        for (let i = 0; i < 5; i++) {
            healthMonitor.recordError(new Error('Network error'), 'profile_' + i);
        }
        
        const health = healthMonitor.getHealthStatus();
        assert(health.healthy === false, 'Should be unhealthy');
        assert(health.riskScore >= 40, `Should have high risk, got ${health.riskScore}`);
        assert(health.alerts.length > 0, 'Should have alerts');
        
        const rec = healthMonitor.getRecommendation();
        assert(rec.includes('PAUSE'), 'Should recommend pause');
        
        operationManager.release();
    });

    // ─── Summary ────────────────────────────────────────────────────
    section('Test Summary');
    
    log(`\n📊 Results: ${passed} passed, ${failed} failed`, passed === 0 && failed === 0 ? 'green' : passed > 0 && failed === 0 ? 'green' : 'yellow');
    
    if (failed === 0) {
        log('\n🎉 All tests passed! System is working correctly.', 'green');
    } else {
        log(`\n⚠️ ${failed} test(s) failed. Please review the errors above.`, 'yellow');
    }
    
    console.log('');
    process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(err => {
    log(`\n💥 Fatal error: ${err.message}`, 'red');
    console.error(err);
    process.exit(1);
});

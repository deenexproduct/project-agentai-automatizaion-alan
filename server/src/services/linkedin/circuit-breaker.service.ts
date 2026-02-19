/**
 * Circuit Breaker Service
 *
 * Protects LinkedIn accounts from repeated failures that could trigger
 * LinkedIn's anti-automation detection. When an account fails N times
 * in a row within a time window, the circuit "opens" and the account
 * is automatically disabled.
 *
 * States:
 *   CLOSED  — normal operation, requests pass through
 *   OPEN    — too many failures, requests blocked
 *   HALF_OPEN — testing if the service has recovered (after cooldown)
 *
 * This is an in-memory circuit breaker per account. On server restart,
 * the state resets to CLOSED (fresh start). Persistent failure state
 * is tracked via the LinkedInAccount.status field in MongoDB.
 */

import { LinkedInAccount } from '../../models/linkedin-account.model';
import { LinkedInAuditLog } from '../../models/linkedin-audit-log.model';
import { Types } from 'mongoose';

// ── Configuration ─────────────────────────────────────────────

export interface CircuitBreakerConfig {
    /** Number of consecutive failures before opening the circuit */
    failureThreshold: number;
    /** Milliseconds to wait before transitioning to HALF_OPEN */
    cooldownMs: number;
    /** Number of successes in HALF_OPEN state to close the circuit */
    halfOpenSuccessThreshold: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    cooldownMs: 30 * 60 * 1000, // 30 minutes
    halfOpenSuccessThreshold: 2,
};

// ── Types ─────────────────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface AccountCircuit {
    state: CircuitState;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    openedAt: Date | null;
    lastFailureReason: string | null;
}

// ── CircuitBreakerService ─────────────────────────────────────

class CircuitBreakerService {
    private circuits = new Map<string, AccountCircuit>();
    private config: CircuitBreakerConfig;

    constructor(config: Partial<CircuitBreakerConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    // ── State Access ──────────────────────────────────────────

    private getCircuit(accountId: string): AccountCircuit {
        if (!this.circuits.has(accountId)) {
            this.circuits.set(accountId, {
                state: 'CLOSED',
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                openedAt: null,
                lastFailureReason: null,
            });
        }
        return this.circuits.get(accountId)!;
    }

    /**
     * Returns the current state of the circuit for an account.
     * Automatically transitions OPEN → HALF_OPEN after cooldown.
     */
    getState(accountId: string): CircuitState {
        const circuit = this.getCircuit(accountId);

        if (circuit.state === 'OPEN' && circuit.openedAt) {
            const elapsed = Date.now() - circuit.openedAt.getTime();
            if (elapsed >= this.config.cooldownMs) {
                circuit.state = 'HALF_OPEN';
                circuit.consecutiveSuccesses = 0;
                console.log(`[CircuitBreaker] ⚡ Account ${accountId} → HALF_OPEN (cooldown elapsed)`);
            }
        }

        return circuit.state;
    }

    /**
     * Returns true if the circuit allows the operation to proceed.
     * CLOSED and HALF_OPEN allow requests; OPEN blocks them.
     */
    canProceed(accountId: string): boolean {
        const state = this.getState(accountId);
        return state !== 'OPEN';
    }

    /**
     * Returns a summary of the circuit state for an account.
     */
    getStatus(accountId: string): {
        state: CircuitState;
        consecutiveFailures: number;
        openedAt: Date | null;
        lastFailureReason: string | null;
        cooldownRemainingMs: number | null;
    } {
        const circuit = this.getCircuit(accountId);
        const state = this.getState(accountId);

        let cooldownRemainingMs: number | null = null;
        if (state === 'OPEN' && circuit.openedAt) {
            const elapsed = Date.now() - circuit.openedAt.getTime();
            cooldownRemainingMs = Math.max(0, this.config.cooldownMs - elapsed);
        }

        return {
            state,
            consecutiveFailures: circuit.consecutiveFailures,
            openedAt: circuit.openedAt,
            lastFailureReason: circuit.lastFailureReason,
            cooldownRemainingMs,
        };
    }

    // ── State Transitions ─────────────────────────────────────

    /**
     * Records a successful operation for an account.
     * In HALF_OPEN: accumulates successes toward closing the circuit.
     * In CLOSED: resets failure counter.
     */
    async recordSuccess(
        accountId: string,
        workspaceId: string
    ): Promise<void> {
        const circuit = this.getCircuit(accountId);
        const state = this.getState(accountId);

        if (state === 'HALF_OPEN') {
            circuit.consecutiveSuccesses++;
            console.log(`[CircuitBreaker] ✅ Account ${accountId} HALF_OPEN success ${circuit.consecutiveSuccesses}/${this.config.halfOpenSuccessThreshold}`);

            if (circuit.consecutiveSuccesses >= this.config.halfOpenSuccessThreshold) {
                circuit.state = 'CLOSED';
                circuit.consecutiveFailures = 0;
                circuit.openedAt = null;
                circuit.lastFailureReason = null;
                console.log(`[CircuitBreaker] 🟢 Account ${accountId} → CLOSED (recovered)`);

                await LinkedInAuditLog.append(
                    workspaceId,
                    new Types.ObjectId(accountId),
                    'circuit_closed',
                    { reason: 'recovered after half-open successes' }
                );
            }
        } else if (state === 'CLOSED') {
            // Reset failure counter on success
            circuit.consecutiveFailures = 0;
        }
    }

    /**
     * Records a failure for an account.
     * Accumulates consecutive failures toward opening the circuit.
     * When threshold is reached, disables the account in MongoDB.
     */
    async recordFailure(
        accountId: string,
        workspaceId: string,
        reason: string
    ): Promise<void> {
        const circuit = this.getCircuit(accountId);
        const state = this.getState(accountId);

        circuit.consecutiveFailures++;
        circuit.lastFailureReason = reason;

        console.log(`[CircuitBreaker] ❌ Account ${accountId} failure ${circuit.consecutiveFailures}/${this.config.failureThreshold}: ${reason}`);

        if (state === 'HALF_OPEN') {
            // Any failure in HALF_OPEN reopens the circuit
            await this.openCircuit(accountId, workspaceId, reason);
        } else if (circuit.consecutiveFailures >= this.config.failureThreshold) {
            await this.openCircuit(accountId, workspaceId, reason);
        }
    }

    /**
     * Opens the circuit for an account.
     * Sets the account status to 'disabled' in MongoDB.
     */
    private async openCircuit(
        accountId: string,
        workspaceId: string,
        reason: string
    ): Promise<void> {
        const circuit = this.getCircuit(accountId);
        circuit.state = 'OPEN';
        circuit.openedAt = new Date();

        console.log(`[CircuitBreaker] 🔴 Account ${accountId} → OPEN (${reason}). Cooldown: ${this.config.cooldownMs / 60000}min`);

        // Mark account as disabled in MongoDB
        await LinkedInAccount.findByIdAndUpdate(accountId, {
            status: 'disabled',
        });

        await LinkedInAuditLog.append(
            workspaceId,
            new Types.ObjectId(accountId),
            'circuit_opened',
            {
                reason,
                consecutiveFailures: circuit.consecutiveFailures,
                cooldownMs: this.config.cooldownMs,
            }
        );
    }

    /**
     * Manually resets the circuit for an account (e.g., after manual re-auth).
     */
    reset(accountId: string): void {
        this.circuits.delete(accountId);
        console.log(`[CircuitBreaker] 🔄 Circuit reset for account ${accountId}`);
    }
}

// ── Singleton ─────────────────────────────────────────────────

export const circuitBreaker = new CircuitBreakerService();

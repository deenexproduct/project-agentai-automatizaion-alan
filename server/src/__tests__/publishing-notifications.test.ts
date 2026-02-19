/**
 * Unit Tests — Publishing Notifications Service
 *
 * Tests event emission, history tracking, and channel registration.
 *
 * Run with: npx jest src/__tests__/publishing-notifications.test.ts --verbose
 */

import { publishingNotifications, type PublishingNotification } from '../services/linkedin/publishing-notifications.service';

describe('PublishingNotificationService', () => {

    // ── Basic Event Emission ─────────────────────────────────

    describe('Event Emission', () => {
        it('should emit known events with template formatting', async () => {
            const received: PublishingNotification[] = [];
            publishingNotifications.on('post:generated', (n) => received.push(n));

            await publishingNotifications.notify('post:generated', {
                idea: 'Test idea about restaurant margins',
                pilar: 'Canal Propio',
                engagement: 'alto',
            });

            expect(received).toHaveLength(1);
            expect(received[0].title).toBe('✨ Post generado');
            expect(received[0].priority).toBe('medium');
            expect(received[0].message).toContain('Test idea about restaurant margins');
            expect(received[0].message).toContain('Canal Propio');
        });

        it('should emit critical events for failed posts', async () => {
            const received: PublishingNotification[] = [];
            publishingNotifications.on('post:failed', (n) => received.push(n));

            await publishingNotifications.notify('post:failed', {
                error: 'Browser session expired',
                retryCount: 2,
            });

            expect(received).toHaveLength(1);
            expect(received[0].priority).toBe('critical');
            expect(received[0].message).toContain('Browser session expired');
            expect(received[0].message).toContain('2/3');
        });

        it('should emit unknown events gracefully', async () => {
            const received: PublishingNotification[] = [];
            publishingNotifications.on('*', (n) => {
                if (n.event === 'test:unknown') received.push(n);
            });

            await publishingNotifications.notify('test:unknown', { foo: 'bar' });

            expect(received).toHaveLength(1);
            expect(received[0].priority).toBe('low');
        });
    });

    // ── History Tracking ─────────────────────────────────────

    describe('History', () => {
        it('should store notifications in history', async () => {
            await publishingNotifications.notify('post:approved', {
                postId: '123',
                scheduledAt: new Date().toISOString(),
            });

            const history = publishingNotifications.getRecent(5);
            expect(history.length).toBeGreaterThan(0);
            expect(history[0].event).toBe('post:approved');
        });

        it('should return latest first', async () => {
            await publishingNotifications.notify('post:rejected', { reason: 'too long' });
            await publishingNotifications.notify('post:published', { url: 'https://linkedin.com/post/123' });

            const history = publishingNotifications.getRecent(2);
            expect(history[0].event).toBe('post:published');
            expect(history[1].event).toBe('post:rejected');
        });

        it('should filter by priority', async () => {
            await publishingNotifications.notify('post:failed', { error: 'timeout' });

            const critical = publishingNotifications.getByPriority('critical');
            expect(critical.length).toBeGreaterThan(0);
            expect(critical.every(n => n.priority === 'critical')).toBe(true);
        });
    });

    // ── Channel Registration ─────────────────────────────────

    describe('Channel Registration', () => {
        it('should dispatch to all registered channels', async () => {
            let webhookReceived = false;

            publishingNotifications.registerChannel('webhook', async () => {
                webhookReceived = true;
            });

            await publishingNotifications.notify('post:published', { url: 'test' });

            expect(webhookReceived).toBe(true);
        });

        it('should not crash if channel handler throws', async () => {
            publishingNotifications.registerChannel('webhook', async () => {
                throw new Error('Webhook failed');
            });

            // Should not throw
            await expect(
                publishingNotifications.notify('post:generated', { idea: 'test' })
            ).resolves.not.toThrow();
        });
    });
});

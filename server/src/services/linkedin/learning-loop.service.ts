/**
 * Learning Loop Service
 *
 * Tracks post engagement metrics and feeds them back to the AI content generator.
 * Builds a feedback loop: generate → publish → measure → learn → improve.
 *
 * Key features:
 *   - Stores engagement metrics per post
 *   - Identifies top-performing posts by pilar/format
 *   - Provides "few-shot" examples for the content generator
 *   - Detects engagement patterns and trends
 */

import { ScheduledPost } from '../../models/scheduled-post.model';

// ── Types ──────────────────────────────────────────────────

export interface EngagementSnapshot {
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    engagementRate: number;
}

export interface TopPost {
    content: string;
    hashtags: string[];
    pilar: string;
    formato: string;
    hookType: string;
    engagement: EngagementSnapshot;
    publishedAt: Date;
}

export interface LearningInsight {
    bestPilar: string | null;
    bestFormato: string | null;
    bestHookType: string | null;
    avgEngagementRate: number;
    totalPublished: number;
    topPosts: TopPost[];
    pillarPerformance: Record<string, { avgEngagement: number; count: number }>;
    formatPerformance: Record<string, { avgEngagement: number; count: number }>;
}

// ── Service ──────────────────────────────────────────────────

class LearningLoopService {

    /**
     * Record engagement metrics for a published post.
     */
    async recordEngagement(
        postId: string,
        metrics: EngagementSnapshot
    ): Promise<void> {
        await ScheduledPost.findByIdAndUpdate(postId, {
            $set: {
                'engagement.impressions': metrics.impressions,
                'engagement.likes': metrics.likes,
                'engagement.comments': metrics.comments,
                'engagement.shares': metrics.shares,
                'engagement.clicks': metrics.clicks,
                'engagement.engagementRate': metrics.engagementRate,
                'engagement.scrapedAt': new Date(),
            },
        }).exec();

        console.log(
            `[LearningLoop] Recorded engagement for post ${postId}: ` +
            `impressions=${metrics.impressions}, likes=${metrics.likes}, rate=${metrics.engagementRate.toFixed(2)}%`
        );
    }

    /**
     * Get top-performing posts to use as few-shot examples for AI.
     */
    async getTopPosts(workspaceId: string, limit = 5): Promise<TopPost[]> {
        const posts = await ScheduledPost.find({
            workspaceId,
            status: 'published',
            'engagement.engagementRate': { $gt: 0 },
        })
            .sort({ 'engagement.engagementRate': -1 })
            .limit(limit)
            .lean()
            .exec();

        return posts.map((p) => ({
            content: p.content,
            hashtags: p.hashtags,
            pilar: p.aiMetadata.pilar,
            formato: p.aiMetadata.formato,
            hookType: p.aiMetadata.hookType,
            engagement: {
                impressions: p.engagement?.impressions || 0,
                likes: p.engagement?.likes || 0,
                comments: p.engagement?.comments || 0,
                shares: p.engagement?.shares || 0,
                clicks: p.engagement?.clicks || 0,
                engagementRate: p.engagement?.engagementRate || 0,
            },
            publishedAt: p.publishedAt || p.createdAt,
        }));
    }

    /**
     * Analyze performance patterns to inform future content generation.
     */
    async getInsights(workspaceId: string): Promise<LearningInsight> {
        const published = await ScheduledPost.find({
            workspaceId,
            status: 'published',
        }).lean().exec();

        if (published.length === 0) {
            return {
                bestPilar: null,
                bestFormato: null,
                bestHookType: null,
                avgEngagementRate: 0,
                totalPublished: 0,
                topPosts: [],
                pillarPerformance: {},
                formatPerformance: {},
            };
        }

        // Aggregate by pilar
        const pillarPerformance: Record<string, { totalRate: number; count: number }> = {};
        const formatPerformance: Record<string, { totalRate: number; count: number }> = {};
        const hookPerformance: Record<string, { totalRate: number; count: number }> = {};

        let totalEngagement = 0;
        let postsWithMetrics = 0;

        for (const post of published) {
            const rate = post.engagement?.engagementRate || 0;
            const pilar = post.aiMetadata.pilar;
            const formato = post.aiMetadata.formato;
            const hook = post.aiMetadata.hookType;

            if (rate > 0) {
                totalEngagement += rate;
                postsWithMetrics++;
            }

            // Pilar stats
            if (!pillarPerformance[pilar]) pillarPerformance[pilar] = { totalRate: 0, count: 0 };
            pillarPerformance[pilar].totalRate += rate;
            pillarPerformance[pilar].count++;

            // Format stats
            if (!formatPerformance[formato]) formatPerformance[formato] = { totalRate: 0, count: 0 };
            formatPerformance[formato].totalRate += rate;
            formatPerformance[formato].count++;

            // Hook stats
            if (!hookPerformance[hook]) hookPerformance[hook] = { totalRate: 0, count: 0 };
            hookPerformance[hook].totalRate += rate;
            hookPerformance[hook].count++;
        }

        // Find best performers
        const bestPilar = this.findBest(pillarPerformance);
        const bestFormato = this.findBest(formatPerformance);
        const bestHookType = this.findBest(hookPerformance);

        // Format for output
        const pillarOut: Record<string, { avgEngagement: number; count: number }> = {};
        for (const [key, val] of Object.entries(pillarPerformance)) {
            pillarOut[key] = { avgEngagement: val.count > 0 ? val.totalRate / val.count : 0, count: val.count };
        }

        const formatOut: Record<string, { avgEngagement: number; count: number }> = {};
        for (const [key, val] of Object.entries(formatPerformance)) {
            formatOut[key] = { avgEngagement: val.count > 0 ? val.totalRate / val.count : 0, count: val.count };
        }

        const topPosts = await this.getTopPosts(workspaceId, 5);

        return {
            bestPilar,
            bestFormato,
            bestHookType,
            avgEngagementRate: postsWithMetrics > 0 ? totalEngagement / postsWithMetrics : 0,
            totalPublished: published.length,
            topPosts,
            pillarPerformance: pillarOut,
            formatPerformance: formatOut,
        };
    }

    /**
     * Build a "learning prompt" section to inject into the AI system prompt.
     * Contains best patterns and top-performing examples.
     */
    async buildLearningPromptSection(workspaceId: string): Promise<string> {
        const insights = await this.getInsights(workspaceId);

        if (insights.totalPublished < 3) {
            return ''; // Not enough data yet
        }

        let section = '\n\n## APRENDIZAJES PREVIOS (basado en datos reales de engagement)\n\n';

        if (insights.bestPilar) {
            section += `- Pilar con mejor engagement: "${insights.bestPilar}"\n`;
        }
        if (insights.bestFormato) {
            section += `- Formato con mejor engagement: "${insights.bestFormato}"\n`;
        }
        if (insights.bestHookType) {
            section += `- Tipo de hook más efectivo: "${insights.bestHookType}"\n`;
        }
        section += `- Engagement rate promedio: ${insights.avgEngagementRate.toFixed(2)}%\n`;

        // Add top 3 examples as few-shot
        if (insights.topPosts.length > 0) {
            section += '\n### EJEMPLOS DE POSTS CON MEJOR ENGAGEMENT:\n\n';
            for (const post of insights.topPosts.slice(0, 3)) {
                section += `**Pilar: ${post.pilar} | Formato: ${post.formato} | Engagement: ${post.engagement.engagementRate.toFixed(2)}%**\n`;
                section += `\`\`\`\n${post.content.substring(0, 500)}${post.content.length > 500 ? '...' : ''}\n\`\`\`\n\n`;
            }
        }

        return section;
    }

    // ── Helpers ───────────────────────────────────────────────

    private findBest(perf: Record<string, { totalRate: number; count: number }>): string | null {
        let best: string | null = null;
        let bestAvg = 0;

        for (const [key, val] of Object.entries(perf)) {
            if (val.count < 1) continue;
            const avg = val.totalRate / val.count;
            if (avg > bestAvg) {
                bestAvg = avg;
                best = key;
            }
        }

        return best;
    }
}

export const learningLoop = new LearningLoopService();

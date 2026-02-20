/**
 * LinkedIn Posts Routes
 *
 * REST endpoints for the LinkedIn Publishing Engine.
 * Manages the full post lifecycle: generate → approve/reject → publish → metrics.
 *
 * Endpoints:
 *   POST   /generate            Generate a new post draft with AI
 *   GET    /drafts              List draft posts pending approval
 *   GET    /scheduled           List approved posts waiting to publish
 *   GET    /published           List published posts with metrics
 *   GET    /:id                 Get post details
 *   PUT    /:id                 Edit a draft post
 *   POST   /:id/approve         Approve a draft for publishing
 *   POST   /:id/reject          Reject a draft
 *   POST   /:id/regenerate      Regenerate with feedback
 *   DELETE /:id                 Cancel a post (only draft/approved)
 */

import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { ScheduledPost, type PostStatus } from '../models/scheduled-post.model';
import { ContentPilar } from '../models/content-pilar.model';
import { TrendSignal } from '../models/trend-signal.model';
import { contentGenerator } from '../services/linkedin/content-generator.service';
import { imageGenerator } from '../services/linkedin/image-generator.service';
import { contentValidator } from '../services/linkedin/content-validator.service';
import { publishingNotifications } from '../services/linkedin/publishing-notifications.service';

const router = Router();

// Helper: get userId from query param or default
function getuserId(req: Request): string {
    if (!req.user || !req.user._id) {
        throw new Error('Unauthorized');
    }
    return req.user._id.toString();
}

// ── POST /generate — Generate post draft with AI ────────────

router.post('/generate', async (req: Request, res: Response) => {
    try {
        const userId = getuserId(req);
        const { idea, context, pilar, formato, accountId, includeTrends } = req.body;

        if (!idea || typeof idea !== 'string' || idea.trim().length === 0) {
            return res.status(400).json({ error: 'idea is required' });
        }
        if (!accountId || !Types.ObjectId.isValid(accountId)) {
            return res.status(400).json({ error: 'Valid accountId is required' });
        }

        // Resolve pilar name
        let pilarName = pilar || 'Auto';
        if (pilarName === 'Auto') {
            const pilares = await ContentPilar.getActiveForWorkspace(userId);
            if (pilares.length > 0) {
                // Pick one that hasn't been used recently
                const recentPosts = await ScheduledPost.find({
                    userId,
                    createdAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
                }).lean().exec();
                const recentPilares = recentPosts.map(p => p.aiMetadata.pilar);
                const unused = pilares.find(p => !recentPilares.includes(p.nombre));
                pilarName = unused ? unused.nombre : pilares[0].nombre;
            }
        }

        // Get trend signals if requested
        let trendSignals;
        if (includeTrends) {
            trendSignals = await TrendSignal.getActiveForWorkspace(userId, 30);
        }

        // Generate post
        const result = await contentGenerator.generatePost({
            idea: idea.trim(),
            context,
            pilar: pilarName,
            formato: formato || 'Auto',
            trendSignals: trendSignals || undefined,
            userId,
        });

        // Generate image
        let mediaUrls: string[] = [];
        try {
            const imagePrompt = result.draft.prompt_imagen;
            if (imagePrompt) {
                const format = result.draft.formato_sugerido === 'carousel' ? 'carousel' : 'square';
                const image = await imageGenerator.generate(imagePrompt, format as any);
                mediaUrls = [image.path];
            }
        } catch (imgErr: any) {
            console.warn('[PostsRoutes] Image generation failed (proceeding without image):', imgErr.message);
        }

        // Calculate suggested schedule time
        const scheduledAt = calculateOptimalTime();

        // Save as draft
        const post = await ScheduledPost.create({
            accountId: new Types.ObjectId(accountId),
            userId,
            content: result.draft.texto,
            hashtags: result.draft.hashtags,
            mediaUrls,
            scheduledAt,
            status: 'draft',
            aiMetadata: {
                originalIdea: idea,
                context: context || '',
                pilar: pilarName,
                formato: result.draft.formato_sugerido,
                hookType: result.draft.hook_type,
                trendSignals: (trendSignals || []).map(t => t.title),
                predictedEngagement: result.draft.prediccion_engagement,
                model: result.model,
                promptUsed: result.promptUsed,
                generationTimeMs: result.generationTimeMs,
                imagePrompt: result.draft.prompt_imagen,
            },
        });

        console.log(`[PostsRoutes] Draft created: ${post._id}, pilar=${pilarName}`);

        // Fire notification
        publishingNotifications.notify('post:generated', {
            postId: post._id.toString(),
            idea: idea.trim(),
            pilar: pilarName,
            engagement: result.draft.prediccion_engagement,
        });

        res.status(201).json({
            post: post.toObject(),
            draft: result.draft,
            validation: result.validation,
        });
    } catch (err: any) {
        console.error('[PostsRoutes] generate error:', err.message);
        res.status(500).json({ error: 'Failed to generate post', details: err.message });
    }
});

// ── GET /drafts — List drafts pending approval ──────────────

router.get('/drafts', async (req: Request, res: Response) => {
    try {
        const userId = getuserId(req);
        const drafts = await ScheduledPost.findDraftsForUser(userId);
        res.json({ drafts, count: drafts.length });
    } catch (err: any) {
        console.error('[PostsRoutes] getDrafts error:', err.message);
        res.status(500).json({ error: 'Failed to get drafts' });
    }
});

// ── GET /scheduled — List approved posts waiting to publish ──

router.get('/scheduled', async (req: Request, res: Response) => {
    try {
        const userId = getuserId(req);
        const posts = await ScheduledPost.find({
            userId,
            status: { $in: ['approved', 'scheduled'] },
        }).sort({ scheduledAt: 1 }).exec();
        res.json({ posts, count: posts.length });
    } catch (err: any) {
        console.error('[PostsRoutes] getScheduled error:', err.message);
        res.status(500).json({ error: 'Failed to get scheduled posts' });
    }
});

// ── GET /published — List published posts with metrics ──────

router.get('/published', async (req: Request, res: Response) => {
    try {
        const userId = getuserId(req);
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const posts = await ScheduledPost.find({
            userId,
            status: 'published',
        }).sort({ publishedAt: -1 }).limit(limit).exec();
        res.json({ posts, count: posts.length });
    } catch (err: any) {
        console.error('[PostsRoutes] getPublished error:', err.message);
        res.status(500).json({ error: 'Failed to get published posts' });
    }
});

// ── GET /:id — Get post details ─────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid post ID' });
        }
        const post = await ScheduledPost.findById(id).exec();
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        res.json({ post });
    } catch (err: any) {
        console.error('[PostsRoutes] getPost error:', err.message);
        res.status(500).json({ error: 'Failed to get post' });
    }
});

// ── PUT /:id — Edit a draft post ────────────────────────────

router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid post ID' });
        }

        const post = await ScheduledPost.findById(id).exec();
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        if (post.status !== 'draft') {
            return res.status(400).json({ error: `Cannot edit post with status "${post.status}"` });
        }

        const { content, hashtags, scheduledAt } = req.body;
        if (content !== undefined) post.content = content;
        if (hashtags !== undefined) post.hashtags = hashtags;
        if (scheduledAt !== undefined) post.scheduledAt = new Date(scheduledAt);

        // Re-validate after edit
        if (content) {
            const validation = contentValidator.validate({
                texto: content,
                hashtags: post.hashtags,
                formato_sugerido: post.aiMetadata.formato as any,
                hook_type: post.aiMetadata.hookType,
                prompt_imagen: '',
                carousel_slides: [],
                pregunta_engagement: '',
                prediccion_engagement: 'medio',
                razon_prediccion: '',
            });
            if (!validation.valid) {
                return res.status(400).json({
                    error: 'Content validation failed',
                    issues: validation.issues.filter(i => i.type === 'critical'),
                });
            }
        }

        await post.save();
        res.json({ post });
    } catch (err: any) {
        console.error('[PostsRoutes] editPost error:', err.message);
        res.status(500).json({ error: 'Failed to edit post' });
    }
});

// ── POST /:id/approve — Approve draft for publishing ────────

router.post('/:id/approve', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid post ID' });
        }

        const post = await ScheduledPost.findById(id).exec();
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        if (post.status !== 'draft') {
            return res.status(400).json({ error: `Cannot approve post with status "${post.status}"` });
        }

        // Optional: override scheduled time
        const { scheduledAt } = req.body;
        if (scheduledAt) {
            post.scheduledAt = new Date(scheduledAt);
        }

        post.status = 'approved';
        await post.save();

        console.log(`[PostsRoutes] Post approved: ${post._id}, scheduled for ${post.scheduledAt}`);

        publishingNotifications.notify('post:approved', {
            postId: post._id.toString(),
            scheduledAt: post.scheduledAt.toISOString(),
        });

        res.json({ post, message: 'Post approved and scheduled for publishing' });
    } catch (err: any) {
        console.error('[PostsRoutes] approvePost error:', err.message);
        res.status(500).json({ error: 'Failed to approve post' });
    }
});

// ── POST /:id/reject — Reject draft ────────────────────────

router.post('/:id/reject', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid post ID' });
        }

        const post = await ScheduledPost.findById(id).exec();
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        if (post.status !== 'draft') {
            return res.status(400).json({ error: `Cannot reject post with status "${post.status}"` });
        }

        post.status = 'rejected';
        post.rejectionReason = req.body.reason || '';
        await post.save();

        publishingNotifications.notify('post:rejected', {
            postId: post._id.toString(),
            reason: req.body.reason || '',
        });

        res.json({ post, message: 'Post rejected' });
    } catch (err: any) {
        console.error('[PostsRoutes] rejectPost error:', err.message);
        res.status(500).json({ error: 'Failed to reject post' });
    }
});

// ── POST /:id/regenerate — Regenerate with feedback ─────────

router.post('/:id/regenerate', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { feedback } = req.body;

        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid post ID' });
        }
        if (!feedback || typeof feedback !== 'string') {
            return res.status(400).json({ error: 'feedback is required' });
        }

        const post = await ScheduledPost.findById(id).exec();
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        if (post.status !== 'draft') {
            return res.status(400).json({ error: `Cannot regenerate post with status "${post.status}"` });
        }

        // Construct original draft from saved data
        const originalDraft = {
            texto: post.content,
            hashtags: post.hashtags,
            formato_sugerido: post.aiMetadata.formato as any,
            hook_type: post.aiMetadata.hookType,
            prompt_imagen: post.aiMetadata.imagePrompt || '',
            carousel_slides: [],
            pregunta_engagement: '',
            prediccion_engagement: post.aiMetadata.predictedEngagement,
            razon_prediccion: '',
        };

        const result = await contentGenerator.regeneratePost(originalDraft, feedback, {
            idea: post.aiMetadata.originalIdea,
            context: post.aiMetadata.context,
            pilar: post.aiMetadata.pilar,
            formato: post.aiMetadata.formato,
            userId: post.userId,
        });

        // Update post with new content
        post.content = result.draft.texto;
        post.hashtags = result.draft.hashtags;
        post.aiMetadata.model = result.model;
        post.aiMetadata.generationTimeMs = result.generationTimeMs;
        post.aiMetadata.promptUsed = result.promptUsed;
        await post.save();

        res.json({
            post,
            draft: result.draft,
            validation: result.validation,
        });
    } catch (err: any) {
        console.error('[PostsRoutes] regeneratePost error:', err.message);
        res.status(500).json({ error: 'Failed to regenerate post', details: err.message });
    }
});

// ── DELETE /:id — Cancel post ───────────────────────────────

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid post ID' });
        }

        const post = await ScheduledPost.findById(id).exec();
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        if (!['draft', 'approved'].includes(post.status)) {
            return res.status(400).json({
                error: `Cannot delete post with status "${post.status}". Only draft and approved posts can be cancelled.`,
            });
        }

        await ScheduledPost.findByIdAndDelete(id).exec();
        res.json({ message: 'Post cancelled and deleted' });
    } catch (err: any) {
        console.error('[PostsRoutes] deletePost error:', err.message);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});

// ── Helpers ──────────────────────────────────────────────────

function calculateOptimalTime(): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Set to 8:30 AM (optimal LinkedIn time)
    tomorrow.setHours(8, 30, 0, 0);

    // If tomorrow is Saturday, push to Monday
    const day = tomorrow.getDay();
    if (day === 6) tomorrow.setDate(tomorrow.getDate() + 2); // Sat → Mon
    if (day === 0) tomorrow.setDate(tomorrow.getDate() + 1); // Sun → Mon

    return tomorrow;
}

export default router;

import { Router, Request, Response } from 'express';
import { getAuthUrl, getOAuthClient, createGoogleEvent, deleteGoogleEvent, listGoogleCalendars } from '../services/google-calendar.service';
import { CalendarConfig } from '../models/calendar-config.model';
import { Event } from '../models/event.model';
import { Task } from '../models/task.model';
import { emailService } from '../services/email.service';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// ── Google OAuth Routes ────────────────────────────────────────

router.get('/auth/google', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const url = getAuthUrl();
    res.redirect(url);
});

router.get('/auth/google/callback', async (req: Request, res: Response) => {
    try {
        const { code } = req.query;
        if (!code) {
            return res.status(400).send('No code provided');
        }

        // Default to the first admin user for simplicity in a single-tenant environment,
        // or you could pass state with the JWT token in a real multi-tenant app
        // Currently relying on headers or session, but callback doesn't have auth headers.
        // For this implementation, we will pass the userId in the state param.
        // Let's assume the frontend passes ?state=userId when redirecting to /auth/google.

        const oauth2Client = getOAuthClient();
        const { tokens } = await oauth2Client.getToken(code as string);

        // In a real scenario, you'd decode 'state' to get the userId. 
        // Here we will just store it in session or let the user provide it via a separate PUT call.
        // For now, return the token to the frontend so it can save it via PUT /config.

        // As a workaround since we don't have user context in standard callback:
        // We send back an HTML page that posts a message to the opener window
        // with the refresh token.
        res.send(`
      <script>
        if (window.opener) {
          window.opener.postMessage(
            { type: 'GOOGLE_AUTH_SUCCESS', refreshToken: '${tokens.refresh_token}', email: 'Connected' },
            '*'
          );
          window.close();
        } else {
          document.write('Authentication successful. You can close this window.');
        }
      </script>
    `);

    } catch (error: any) {
        console.error('Google OAuth error:', error);
        res.status(500).send('Authentication failed');
    }
});

// Apply auth middleware to all subsequent routes (but not the Google Auth redirects/callbacks)
router.use(authMiddleware);

// ── Configuration CRUD ─────────────────────────────────────────

router.get('/config', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const config = await CalendarConfig.findOne({ userId }).lean();
        res.json(config || {});
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/config', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const config = await CalendarConfig.findOneAndUpdate(
            { userId },
            { $set: { ...req.body, userId } },
            { new: true, upsert: true }
        ).lean();
        res.json(config);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/calendars', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const config = await CalendarConfig.findOne({ userId }).lean();
        if (!config || !config.googleRefreshToken) {
            return res.status(400).json({ error: 'Google Calendar no conectado' });
        }
        const calendars = await listGoogleCalendars(config as any);
        res.json({ calendars });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Events CRUD ─────────────────────────────────────────

router.get('/events', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        // Optional filters ?start=YYYY-MM-DD&end=YYYY-MM-DD
        const { start, end } = req.query;

        let query: any = { $or: [{ userId }, { assignedTo: userId }] };
        if (start && end) {
            query.date = { $gte: new Date(start as string), $lte: new Date(end as string) };
        }

        // Pull Sync from Google Calendar
        try {
            const config = await CalendarConfig.findOne({ userId }).lean();
            if (config?.googleRefreshToken && start && end) {
                // Determine sync window (extend by a bit just in case)
                const syncStart = new Date(start as string);
                const syncEnd = new Date(end as string);

                // Fetch and upsert any external changes first
                await import('../services/google-calendar.service').then(m =>
                    m.syncGoogleEvents(config as any, syncStart, syncEnd)
                );
            }
        } catch (syncErr) {
            console.error('Failed background sync with Google Calendar:', syncErr);
        }

        const events = await Event.find(query)
            .populate('userId', 'name email')
            .populate('assignedTo', 'name email')
            .populate('linkedTo.contacts', 'fullName')
            .populate('linkedTo.company', 'name')
            .populate('linkedTo.deal', 'title')
            .lean();

        // Also fetch tasks for the same period
        let taskQuery: any = { $or: [{ userId }, { assignedTo: userId }] };
        if (start && end) {
            taskQuery.dueDate = { $gte: new Date(start as string), $lte: new Date(end as string) };
        }

        const tasks = await Task.find(taskQuery)
            .populate('userId', 'name email')
            .populate('assignedTo', 'name email')
            .populate('contact', 'fullName')
            .populate('company', 'name')
            .populate('deal', 'title')
            .lean();

        // Transform tasks to match EventData interface for the frontend Calendar
        const transformedTasks = tasks.map(task => {
            // Default task start time to 09:00 if none, or based on dueDate if it has time
            const dateObj = new Date(task.dueDate || task.createdAt);
            const hours = dateObj.getHours().toString().padStart(2, '0');
            const minutes = dateObj.getMinutes().toString().padStart(2, '0');
            const startTime = `${hours}:${minutes}`;
            // 30 min duration default
            dateObj.setMinutes(dateObj.getMinutes() + 30);
            const endHours = dateObj.getHours().toString().padStart(2, '0');
            const endMinutes = dateObj.getMinutes().toString().padStart(2, '0');
            const endTime = `${endHours}:${endMinutes}`;

            return {
                _id: task._id,
                userId: task.userId,
                assignedTo: task.assignedTo,
                title: `[Tarea] ${task.title}`,
                description: task.description,
                date: task.dueDate || task.createdAt,
                startTime,
                endTime,
                type: 'task', // Custom type for frontend logic
                taskType: task.type,
                taskStatus: task.status,
                taskPriority: task.priority,
                linkedTo: {
                    contacts: task.contact ? [task.contact] : [],
                    company: task.company,
                    deal: task.deal
                },
                createdAt: task.createdAt,
                updatedAt: task.updatedAt
            };
        });

        // Combine and sort
        const combinedEvents = [...events, ...transformedTasks].sort((a: any, b: any) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            if (dateA !== dateB) return dateA - dateB;
            return a.startTime.localeCompare(b.startTime);
        });

        res.json({ events: combinedEvents });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/events', async (req: Request, res: Response) => {
    try {
        const creatorId = (req as any).user._id.toString();
        const { assignedTo = creatorId, title, description, date, startTime, endTime, type, location, attendees, linkedTo, sendInvite } = req.body;

        const newEvent = new Event({
            userId: creatorId, assignedTo, title, description, date, startTime, endTime, type, location, attendees, linkedTo
        });

        const config = await CalendarConfig.findOne({ userId: assignedTo }).lean();

        // 1. Google Calendar Integration
        if (config?.googleRefreshToken) {
            try {
                const { eventId, meetLink } = await createGoogleEvent(config as any, newEvent.toObject());
                newEvent.googleEventId = eventId;
                if (meetLink) {
                    newEvent.meetLink = meetLink;
                }
            } catch (err: any) {
                console.error('Failed to create google event', err);
                // Continue saving locally even if google fails
            }
        }

        await newEvent.save();

        // 2. Email Invitations
        if (sendInvite && config) {
            // Async emission, don't block response
            emailService.sendEventInvitations(config as any, newEvent.toObject()).catch(e => console.error('Email error:', e));
        }

        res.status(201).json({ success: true, event: newEvent });
    } catch (error: any) {
        console.error('Create event error:', error);
        res.status(500).json({ error: 'Failed to create event' });
    }
});

router.put('/events/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const { sendInvite, ...updateData } = req.body;

        // Ideally, update Google Calendar here too 
        // (Complexity omitted for brevity; a full integration would call calendar.events.update)

        const event = await Event.findOneAndUpdate(
            { _id: req.params.id, $or: [{ userId }, { assignedTo: userId }] },
            { $set: updateData },
            { new: true }
        ).lean();

        if (!event) return res.status(404).json({ error: 'Event not found' });

        // Update Google Calendar if linked
        const assigneeId = event.assignedTo || event.userId;
        const config = await CalendarConfig.findOne({ userId: assigneeId }).lean();
        if (config?.googleRefreshToken && event.googleEventId) {
            try {
                await import('../services/google-calendar.service').then(m =>
                    m.updateGoogleEvent(config as any, event.googleEventId as string, event as any)
                );
            } catch (err) {
                console.error('Failed updating google event', err);
            }
        }

        // Send updated invitations if requested
        if (sendInvite) {
            const assignee = event.assignedTo || event.userId;
            const config = await CalendarConfig.findOne({ userId: assignee }).lean();
            if (config) {
                emailService.sendEventInvitations(config as any, event as any).catch(e => console.error('Email error:', e));
            }
        }

        res.json({ success: true, event });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to update event' });
    }
});

router.delete('/events/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const event = await Event.findOneAndDelete({ _id: req.params.id, $or: [{ userId }, { assignedTo: userId }] }).lean();

        if (!event) return res.status(404).json({ error: 'Event not found' });

        const assignee = event.assignedTo || event.userId;
        const config = await CalendarConfig.findOne({ userId: assignee }).lean();
        if (config?.googleRefreshToken && event.googleEventId) {
            try {
                await deleteGoogleEvent(config as any, event.googleEventId);
            } catch (err) {
                console.error('Failed deleting from google', err);
            }
        }

        // Optionally notify attendees of cancellation here...

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

export default router;

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import mongoose from 'mongoose';
import { IEvent } from '../models/event.model';
import { ICalendarConfig } from '../models/calendar-config.model';

export interface IGoogleCalendar {
    id: string;
    summary: string;
    primary?: boolean;
    description?: string;
}

// Use environment variables or pass them explicitly
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/auth/google/callback';

export function getOAuthClient(): any {
    return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(): string {
    const oauth2Client = getOAuthClient();
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // Force refresh token generation
        scope: [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/userinfo.email'
        ]
    });
}

export async function listGoogleCalendars(config: ICalendarConfig): Promise<IGoogleCalendar[]> {
    if (!config.googleRefreshToken) {
        throw new Error('Google Calendar is not configured for this user.');
    }

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ refresh_token: config.googleRefreshToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client as any });

    const res = await calendar.calendarList.list(
        { minAccessRole: 'writer' },
        { headers: { 'Accept-Encoding': 'identity' } }
    );

    return (res.data.items || []).map(item => ({
        id: item.id || '',
        summary: item.summary || '',
        primary: item.primary,
        description: item.description || ''
    }));
}

export async function createGoogleEvent(
    config: ICalendarConfig,
    event: IEvent
): Promise<{ eventId: string; meetLink?: string }> {
    if (!config.googleRefreshToken) {
        throw new Error('Google Calendar is not configured for this user.');
    }

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ refresh_token: config.googleRefreshToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client as any });

    // Format dates for Google Calendar API
    // Ensure event.date is treated robustly, dealing natively with Date objects or Strings
    // Since mongoose saves plain dates as UTC midnight, toISOString will safely extract the EXACT requested day (e.g. 2026-02-25)
    // regardless of the server's local timezone offset executing this code.
    let dateStr = "";
    if (event.date instanceof Date) {
        dateStr = event.date.toISOString();
    } else {
        dateStr = String(event.date); // Fallback if magically a string
    }
    const eventDate = dateStr.split('T')[0]; // Extract YYYY-MM-DD
    const startDateTime = `${eventDate}T${event.startTime}:00`;
    const endDateTime = `${eventDate}T${event.endTime}:00`;

    const eventBody: any = {
        summary: event.title,
        description: event.description || '',
        start: {
            dateTime: startDateTime,
            timeZone: 'America/Argentina/Buenos_Aires', // Default timezone, can be parameterized later
        },
        end: {
            dateTime: endDateTime,
            timeZone: 'America/Argentina/Buenos_Aires',
        },
        attendees: event.attendees.map(email => ({ email })),
    };

    if (event.type === 'physical' && event.location) {
        eventBody.location = event.location;
    }

    if (event.type === 'meet') {
        eventBody.conferenceData = {
            createRequest: {
                requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
        };
    }

    console.log('[GoogleService] Inserting event to calendar:', config.googleCalendarId || 'primary');
    console.log('[GoogleService] Event Body:', JSON.stringify(eventBody, null, 2));

    try {
        const res = await calendar.events.insert({
            calendarId: config.googleCalendarId || 'primary',
            requestBody: eventBody,
            conferenceDataVersion: 1, // Required to generate Meet link
            sendUpdates: 'none', // We will handle emails via Nodemailer
        });

        console.log('[GoogleService] Event inserted successfully:', res.data.id);

        return {
            eventId: res.data.id || '',
            meetLink: res.data.hangoutLink || undefined,
        };
    } catch (apiError: any) {
        console.error('[GoogleService] API Error creating event:', apiError.response?.data || apiError.message);
        throw apiError;
    }
}

export async function deleteGoogleEvent(config: ICalendarConfig, eventId: string): Promise<void> {
    if (!config.googleRefreshToken) return;

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ refresh_token: config.googleRefreshToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client as any });

    try {
        await calendar.events.delete({
            calendarId: config.googleCalendarId || 'primary',
            eventId: eventId,
            sendUpdates: 'none'
        });
    } catch (error: any) {
        console.warn(`Failed to delete Google event ${eventId}:`, error.message);
    }
}


export async function syncGoogleEvents(config: ICalendarConfig, timeMin: Date, timeMax: Date): Promise<void> {
    if (!config.googleRefreshToken) return;

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ refresh_token: config.googleRefreshToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client as any });

    try {
        const res = await calendar.events.list({
            calendarId: config.googleCalendarId || 'primary',
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            maxResults: 2500,
            singleEvents: true,
            orderBy: 'startTime',
            showDeleted: true,
        });

        const items = res.data.items || [];
        console.log(`[GoogleService] Sync pulling events from ${timeMin.toISOString()} to ${timeMax.toISOString()}`);
        console.log(`[GoogleService] Found ${items.length} external events in Google Calendar.`);

        // Process each item to upsert into our local DB
        for (const item of items) {
            if (item.status === 'cancelled') {
                // Should delete local copy if exists
                await mongoose.models.Event.deleteOne({ googleEventId: item.id });
                continue;
            }

            const start = item.start?.dateTime || item.start?.date;
            const end = item.end?.dateTime || item.end?.date;
            if (!start || !end) continue;

            const startDate = new Date(start);
            const endDate = new Date(end);

            // Format HH:mm for our local schema
            const startHour = startDate.getHours().toString().padStart(2, '0');
            const startMinStr = startDate.getMinutes().toString().padStart(2, '0');
            const endHour = endDate.getHours().toString().padStart(2, '0');
            const endMinStr = endDate.getMinutes().toString().padStart(2, '0');

            // Find existing
            const existing = await mongoose.models.Event.findOne({ googleEventId: item.id });

            if (existing) {
                // Update
                existing.title = item.summary || 'Sin título';
                existing.description = item.description || '';
                existing.date = startDate;
                existing.startTime = `${startHour}:${startMinStr}`;
                existing.endTime = `${endHour}:${endMinStr}`;
                await existing.save();
            } else {
                // Create new, assigning to the user config owner
                await mongoose.models.Event.create({
                    userId: config.userId,
                    assignedTo: config.userId,
                    title: item.summary || 'Sin título',
                    description: item.description || '',
                    date: startDate,
                    startTime: `${startHour}:${startMinStr}`,
                    endTime: `${endHour}:${endMinStr}`,
                    type: item.hangoutLink ? 'meet' : 'physical',
                    location: item.location || '',
                    googleEventId: item.id,
                    meetLink: item.hangoutLink || undefined,
                    attendees: (item.attendees || []).map((a: any) => a.email).filter(Boolean),
                });
            }
        }
    } catch (error: any) {
        console.error('[GoogleService] Failed to sync events:', error.message);
    }
}


export async function updateGoogleEvent(
    config: ICalendarConfig,
    eventId: string,
    event: Partial<IEvent>
): Promise<void> {
    if (!config.googleRefreshToken || !eventId) return;

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ refresh_token: config.googleRefreshToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client as any });

    try {
        // Fetch existing first to preserve attendees or other fields we don't strictly overwrite
        const existingGoogleEvent = await calendar.events.get({
            calendarId: config.googleCalendarId || 'primary',
            eventId: eventId,
        });

        const eventBody: any = {
            ...existingGoogleEvent.data,
        };

        if (event.title !== undefined) eventBody.summary = event.title;
        if (event.description !== undefined) eventBody.description = event.description;
        if (event.location !== undefined && event.type === 'physical') {
            eventBody.location = event.location;
        }

        if (event.date && event.startTime && event.endTime) {
            let dateStr = "";
            if (event.date instanceof Date) {
                dateStr = event.date.toISOString();
            } else {
                dateStr = String(event.date);
            }
            const eventDate = dateStr.split('T')[0];
            const startDateTime = `${eventDate}T${event.startTime}:00`;
            const endDateTime = `${eventDate}T${event.endTime}:00`;

            eventBody.start = {
                dateTime: startDateTime,
                timeZone: 'America/Argentina/Buenos_Aires',
            };
            eventBody.end = {
                dateTime: endDateTime,
                timeZone: 'America/Argentina/Buenos_Aires',
            };
        }

        if (event.attendees) {
            eventBody.attendees = event.attendees.map(email => ({ email }));
        }

        await calendar.events.update({
            calendarId: config.googleCalendarId || 'primary',
            eventId: eventId,
            requestBody: eventBody,
            sendUpdates: 'none',
        });

        console.log('[GoogleService] Successfully updated event:', eventId);
    } catch (error: any) {
        console.error('[GoogleService] Failed to update event:', error.message);
    }
}

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { IEvent } from '../models/event.model';
import { ICalendarConfig } from '../models/calendar-config.model';

// Use environment variables or pass them explicitly
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/auth/google/callback';

export function getOAuthClient(): OAuth2Client {
    return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(): string {
    const oauth2Client = getOAuthClient();
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // Force refresh token generation
        scope: [
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/userinfo.email'
        ]
    });
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

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Format dates for Google Calendar API
    // Google expects ISO strings
    const [startHour, startMin] = event.startTime.split(':');
    const [endHour, endMin] = event.endTime.split(':');

    const startDate = new Date(event.date);
    startDate.setHours(parseInt(startHour), parseInt(startMin), 0);

    const endDate = new Date(event.date);
    endDate.setHours(parseInt(endHour), parseInt(endMin), 0);

    const eventBody: any = {
        summary: event.title,
        description: event.description || '',
        start: {
            dateTime: startDate.toISOString(),
            timeZone: 'America/Argentina/Buenos_Aires', // Default timezone, can be parameterized later
        },
        end: {
            dateTime: endDate.toISOString(),
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

    const res = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: eventBody,
        conferenceDataVersion: 1, // Required to generate Meet link
        sendUpdates: 'none', // We will handle emails via Nodemailer
    });

    return {
        eventId: res.data.id || '',
        meetLink: res.data.hangoutLink || undefined,
    };
}

export async function deleteGoogleEvent(config: ICalendarConfig, eventId: string): Promise<void> {
    if (!config.googleRefreshToken) return;

    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({ refresh_token: config.googleRefreshToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    try {
        await calendar.events.delete({
            calendarId: 'primary',
            eventId: eventId,
            sendUpdates: 'none'
        });
    } catch (error: any) {
        console.warn(`Failed to delete Google event ${eventId}:`, error.message);
    }
}

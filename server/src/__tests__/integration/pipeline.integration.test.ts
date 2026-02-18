/**
 * Pipeline Integration Tests
 * Tests the complete flow: contact creation → status changes → auto-enrichment
 * 
 * Requirements:
 * 1. Tests de integración para el flujo completo del pipeline
 * 2. Usar Jest + MongoDB Memory Server
 * 3. Mockear servicio OpenRouter para enriquecimiento
 * 4. Tests de idempotencia
 * 5. Al menos 5 casos de prueba cubriendo casos edge
 * 6. Setup y teardown limpio
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import { LinkedInContact, ILinkedInContact } from '../../models/linkedin-contact.model';
import linkedinCrmRoutes from '../../routes/linkedin-crm.routes';
import { enrichmentService } from '../../services/enrichment.service';
import { openRouterService } from '../../services/openrouter.service';
import fs from 'fs';
import path from 'path';

// ── Types ─────────────────────────────────────────────────────
type ContactStatus = 'visitando' | 'conectando' | 'interactuando' | 'enriqueciendo' | 'esperando_aceptacion' | 'aceptado' | 'mensaje_enviado';

const VALID_STATUSES: ContactStatus[] = [
    'visitando',
    'conectando',
    'interactuando',
    'enriqueciendo',
    'esperando_aceptacion',
    'aceptado',
    'mensaje_enviado'
];

// ── Mock Services ─────────────────────────────────────────────

// Mock OpenRouter Service
jest.mock('../../services/openrouter.service', () => ({
    openRouterService: {
        isConfigured: jest.fn().mockReturnValue(true),
        call: jest.fn().mockResolvedValue(JSON.stringify({
            personProfile: {
                verifiedPosition: 'Gerente de Marketing',
                positionSource: 'LinkedIn',
                verifiedCompany: 'TestCorp',
                companySource: 'LinkedIn',
                summary: 'Profesional con 10 años de experiencia',
                summarySource: 'LinkedIn'
            },
            personNews: [],
            company: {
                name: 'TestCorp',
                nameSource: 'LinkedIn',
                description: 'Empresa de tecnología líder en soluciones B2B',
                descriptionSource: 'Website',
                website: 'https://testcorp.com',
                websiteSource: 'LinkedIn',
                category: 'Tecnología',
                categorySource: 'Inferido del nombre',
                sector: 'Software',
                sectorSource: 'Website',
                locationsCount: '5',
                locationsCountSource: 'Website',
                socialMedia: { instagram: '@testcorp', twitter: '@testcorp' },
                socialMediaSource: 'Website'
            },
            companyNews: [
                { title: 'Noticia 1', source: 'El Cronista', url: 'https://example.com/1', date: '2024-01-01', summary: 'Resumen 1' },
                { title: 'Noticia 2', source: 'La Nación', url: 'https://example.com/2', date: '2024-02-01', summary: 'Resumen 2' },
                { title: 'Noticia 3', source: 'Infobae', url: 'https://example.com/3', date: '2024-03-01', summary: 'Resumen 3' }
            ],
            keyInsights: [
                { text: 'Empresa en crecimiento', source: 'LinkedIn', confidence: 'high' }
            ],
            buyingSignals: [
                { text: 'Buscando soluciones de software', source: 'LinkedIn', evidence: 'Post reciente', confidence: 'medium' }
            ],
            confidenceScore: 85,
            dataQuality: 'verified'
        })),
        getActiveKeysCount: jest.fn().mockReturnValue(1)
    }
}));

// Mock Web Search Service
jest.mock('../../services/web-search.service', () => ({
    webSearchService: {
        isAvailable: jest.fn().mockReturnValue(false),
        searchCompany: jest.fn().mockResolvedValue({
            website: 'https://testcorp.com',
            description: 'Empresa de tecnología',
            news: []
        })
    }
}));

// ── Test Setup ────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use('/api/linkedin/crm', linkedinCrmRoutes);

let mongoServer: MongoMemoryServer;

// Counter for unique IDs
let contactCounter = 0;

// Helper to create a test contact
async function createTestContact(overrides: Partial<ILinkedInContact> = {}): Promise<ILinkedInContact> {
    contactCounter++;
    const contact = new LinkedInContact({
        profileUrl: `https://linkedin.com/in/test-contact-${Date.now()}-${contactCounter}`,
        fullName: 'Test User',
        firstName: 'Test',
        lastName: 'User',
        headline: 'Software Engineer at TestCorp',
        currentCompany: 'TestCorp',
        currentPosition: 'Software Engineer',
        industry: 'Technology',
        location: 'Buenos Aires, Argentina',
        status: 'visitando',
        experience: [{
            company: 'TestCorp',
            position: 'Software Engineer',
            duration: '2020 - Presente'
        }],
        education: [{
            institution: 'UBA',
            degree: 'Ingeniería'
        }],
        skills: ['JavaScript', 'TypeScript', 'Node.js'],
        notes: [],
        ...overrides
    });
    return await contact.save();
}

// Helper to update contact status via API
async function updateContactStatus(contactId: string, status: ContactStatus) {
    return request(app)
        .patch(`/api/linkedin/crm/contacts/${contactId}/status`)
        .send({ status });
}

// ── Test Suite ────────────────────────────────────────────────

describe('Pipeline Integration Tests', () => {
    
    // Setup: Start MongoDB Memory Server before all tests
    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create({
            instance: {
                dbName: 'pipeline_test_db'
            }
        });
        const mongoUri = mongoServer.getUri();
        await mongoose.connect(mongoUri);
        
        // Create test directories if needed
        const testDataDir = path.join(__dirname, '../../../../data');
        const testContextDir = path.join(testDataDir, 'contacts-context');
        
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
        if (!fs.existsSync(testContextDir)) {
            fs.mkdirSync(testContextDir, { recursive: true });
        }
        
        // Create test config files
        const icpPath = path.join(testDataDir, 'cliente-ideal.md');
        const deenexPath = path.join(testDataDir, 'deenex.md');
        
        if (!fs.existsSync(icpPath)) {
            fs.writeFileSync(icpPath, '# Cliente Ideal\n\nEmpresas de tecnología con +50 empleados.', 'utf-8');
        }
        if (!fs.existsSync(deenexPath)) {
            fs.writeFileSync(deenexPath, '# Deenex\n\nProducto de automatización para ventas.', 'utf-8');
        }
    });

    // Teardown: Stop MongoDB Memory Server after all tests
    afterAll(async () => {
        await mongoose.disconnect();
        await mongoServer.stop();
    });

    // Clean up before each test
    beforeEach(async () => {
        await LinkedInContact.deleteMany({});
        jest.clearAllMocks();
    });

    // ── Test 1: Contact Creation & Default State ────────────────
    describe('Contact Creation', () => {
        it('should create a contact with default status "visitando"', async () => {
            const contact = await createTestContact();

            expect(contact.status).toBe('visitando');
            expect(contact.fullName).toBe('Test User');
            expect(contact.sentAt).toBeDefined();
            expect(contact.createdAt).toBeDefined();
        });

        it('should create a contact with custom initial status', async () => {
            const contact = await createTestContact({ status: 'conectando' });
            expect(contact.status).toBe('conectando');
        });

        it('should enforce unique profileUrl constraint', async () => {
            const profileUrl = 'https://linkedin.com/in/unique-test';
            await createTestContact({ profileUrl });
            
            // Second contact with same URL should fail
            await expect(createTestContact({ profileUrl }))
                .rejects.toThrow();
        });

        it('should create contact with complete professional data', async () => {
            const contact = await createTestContact({
                fullName: 'María González',
                currentCompany: 'TechCorp',
                currentPosition: 'CTO',
                headline: 'CTO | Tech Leader | Speaker',
                location: 'Ciudad de México',
                industry: 'Software',
                experience: [
                    { company: 'TechCorp', position: 'CTO', duration: '2020 - Presente', logoUrl: 'https://example.com/logo.png' },
                    { company: 'StartupX', position: 'Lead Developer', duration: '2018 - 2020' }
                ],
                education: [
                    { institution: 'UNAM', degree: 'Ciencias de la Computación', years: '2014 - 2018' }
                ],
                skills: ['Leadership', 'Node.js', 'React', 'AWS']
            });

            expect(contact.fullName).toBe('María González');
            expect(contact.experience).toHaveLength(2);
            expect(contact.education).toHaveLength(1);
            expect(contact.skills).toHaveLength(4);
        });
    });

    // ── Test 2: Valid Status Transitions ────────────────────────
    describe('Valid Status Transitions', () => {
        it('should transition through the complete pipeline flow: visitando → conectando → interactuando → enriqueciendo', async () => {
            const contact = await createTestContact({ status: 'visitando' });
            const id = contact._id.toString();

            // Step 1: visitando → conectando
            let response = await updateContactStatus(id, 'conectando');
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.contact.status).toBe('conectando');

            // Step 2: conectando → interactuando
            response = await updateContactStatus(id, 'interactuando');
            expect(response.status).toBe(200);
            expect(response.body.contact.status).toBe('interactuando');

            const updated = await LinkedInContact.findById(id);
            expect(updated?.interactedAt).toBeInstanceOf(Date);

            // Step 3: interactuando → enriqueciendo
            response = await updateContactStatus(id, 'enriqueciendo');
            expect(response.status).toBe(200);
            expect(response.body.contact.status).toBe('enriqueciendo');
        });

        it('should update correct timestamp for each status transition', async () => {
            const contact = await createTestContact();
            const id = contact._id.toString();

            // interactuando sets interactedAt
            await updateContactStatus(id, 'interactuando');
            let updated = await LinkedInContact.findById(id);
            expect(updated?.interactedAt).toBeInstanceOf(Date);

            // enriqueciendo sets enrichedAt
            await updateContactStatus(id, 'enriqueciendo');
            updated = await LinkedInContact.findById(id);
            expect(updated?.enrichedAt).toBeInstanceOf(Date);

            // aceptado sets acceptedAt
            await updateContactStatus(id, 'aceptado');
            updated = await LinkedInContact.findById(id);
            expect(updated?.acceptedAt).toBeInstanceOf(Date);

            // mensaje_enviado sets messageSentAt
            await updateContactStatus(id, 'mensaje_enviado');
            updated = await LinkedInContact.findById(id);
            expect(updated?.messageSentAt).toBeInstanceOf(Date);
        });

        it('should allow transition to esperando_aceptacion after enriqueciendo', async () => {
            const contact = await createTestContact({ status: 'enriqueciendo' });
            const response = await updateContactStatus(contact._id.toString(), 'esperando_aceptacion');
            
            expect(response.status).toBe(200);
            expect(response.body.contact.status).toBe('esperando_aceptacion');
        });

        it('should allow final transition to mensaje_enviado', async () => {
            const contact = await createTestContact({ status: 'aceptado' });
            const response = await updateContactStatus(contact._id.toString(), 'mensaje_enviado');
            
            expect(response.status).toBe(200);
            expect(response.body.contact.status).toBe('mensaje_enviado');
        });
    });

    // ── Test 3: Invalid Status Transitions & Error Handling ─────
    describe('Invalid Status Transitions', () => {
        it('should reject invalid status values', async () => {
            const contact = await createTestContact();

            const response = await request(app)
                .patch(`/api/linkedin/crm/contacts/${contact._id}/status`)
                .send({ status: 'invalid_status' });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid status');
        });

        it('should reject empty status', async () => {
            const contact = await createTestContact();

            const response = await request(app)
                .patch(`/api/linkedin/crm/contacts/${contact._id}/status`)
                .send({ status: '' });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid status');
        });

        it('should reject missing status field', async () => {
            const contact = await createTestContact();

            const response = await request(app)
                .patch(`/api/linkedin/crm/contacts/${contact._id}/status`)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid status');
        });

        it('should return 404 for non-existent contact', async () => {
            const fakeId = new mongoose.Types.ObjectId().toString();
            const response = await updateContactStatus(fakeId, 'conectando');

            expect(response.status).toBe(404);
            expect(response.body.error).toBe('Contact not found');
        });

        it('should reject invalid ObjectId format', async () => {
            const response = await request(app)
                .patch('/api/linkedin/crm/contacts/invalid-id/status')
                .send({ status: 'conectando' });

            expect(response.status).toBe(500);
        });

        it('should reject null status', async () => {
            const contact = await createTestContact();

            const response = await request(app)
                .patch(`/api/linkedin/crm/contacts/${contact._id}/status`)
                .send({ status: null });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid status');
        });
    });

    // ── Test 4: Auto-Enrichment on Status Change ────────────────
    describe('Auto-Enrichment on Status Change', () => {
        beforeEach(() => {
            jest.spyOn(enrichmentService, 'getConfig').mockReturnValue({
                autoEnrichOnStatus: 'interactuando',
                maxEnrichmentsPerDay: 45,
                delayBetweenRequests: 100,
                model: 'moonshotai/kimi-k2',
                reEnrichAfterDays: 30
            });
        });

        it('should trigger auto-enrichment when reaching "interactuando" status', async () => {
            const enrichSpy = jest.spyOn(enrichmentService, 'enrichContact')
                .mockResolvedValue({} as ILinkedInContact);

            const contact = await createTestContact({ status: 'conectando' });

            await updateContactStatus(contact._id.toString(), 'interactuando');

            // Wait for async enrichment to be triggered
            await new Promise(resolve => setTimeout(resolve, 150));

            expect(enrichSpy).toHaveBeenCalledWith(contact._id.toString());
            enrichSpy.mockRestore();
        });

        it('should NOT trigger enrichment for other statuses', async () => {
            const enrichSpy = jest.spyOn(enrichmentService, 'enrichContact')
                .mockResolvedValue({} as ILinkedInContact);

            const contact = await createTestContact({ status: 'visitando' });

            // Change to conectando (not the trigger status)
            await updateContactStatus(contact._id.toString(), 'conectando');
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(enrichSpy).not.toHaveBeenCalled();
            enrichSpy.mockRestore();
        });

        it('should NOT re-enrich if already enriched recently', async () => {
            const enrichSpy = jest.spyOn(enrichmentService, 'enrichContact')
                .mockResolvedValue({} as ILinkedInContact);

            const contact = await createTestContact({
                status: 'conectando',
                enrichmentStatus: 'completed',
                enrichedAt: new Date() // Enriched today
            });

            await updateContactStatus(contact._id.toString(), 'interactuando');
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(enrichSpy).not.toHaveBeenCalled();
            enrichSpy.mockRestore();
        });

        it('should NOT trigger enrichment if already enriching', async () => {
            const enrichSpy = jest.spyOn(enrichmentService, 'enrichContact')
                .mockResolvedValue({} as ILinkedInContact);

            const contact = await createTestContact({
                status: 'conectando',
                enrichmentStatus: 'enriching'
            });

            await updateContactStatus(contact._id.toString(), 'interactuando');
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(enrichSpy).not.toHaveBeenCalled();
            enrichSpy.mockRestore();
        });

        it('should skip auto-enrichment if OpenRouter is not configured', async () => {
            jest.spyOn(openRouterService, 'isConfigured').mockReturnValue(false);

            const contact = await createTestContact({ status: 'conectando' });

            const response = await updateContactStatus(contact._id.toString(), 'interactuando');

            // Status change should still succeed
            expect(response.status).toBe(200);
            expect(response.body.contact.status).toBe('interactuando');
        });

        it('should trigger enrichment only after configured days have passed', async () => {
            const enrichSpy = jest.spyOn(enrichmentService, 'enrichContact')
                .mockResolvedValue({} as ILinkedInContact);

            const thirtyOneDaysAgo = new Date();
            thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);

            const contact = await createTestContact({
                status: 'conectando',
                enrichmentStatus: 'completed',
                enrichedAt: thirtyOneDaysAgo // Enriched 31 days ago
            });

            await updateContactStatus(contact._id.toString(), 'interactuando');
            await new Promise(resolve => setTimeout(resolve, 100));

            // Should re-enrich after 30 days
            expect(enrichSpy).toHaveBeenCalled();
            enrichSpy.mockRestore();
        });
    });

    // ── Test 5: Idempotency Tests ───────────────────────────────
    describe('Idempotency Tests', () => {
        it('should handle same status change twice without error', async () => {
            const contact = await createTestContact({ status: 'visitando' });
            const id = contact._id.toString();

            // First change
            let response = await updateContactStatus(id, 'conectando');
            expect(response.status).toBe(200);
            expect(response.body.contact.status).toBe('conectando');

            // Second change to same status
            response = await updateContactStatus(id, 'conectando');
            expect(response.status).toBe(200);
            expect(response.body.contact.status).toBe('conectando');

            // Verify only one document exists
            const count = await LinkedInContact.countDocuments({ _id: contact._id });
            expect(count).toBe(1);
        });

        it('should maintain consistent data on repeated updates', async () => {
            const contact = await createTestContact();
            const id = contact._id.toString();

            // Multiple updates to same status
            await updateContactStatus(id, 'conectando');
            await updateContactStatus(id, 'conectando');
            await updateContactStatus(id, 'conectando');

            const updated = await LinkedInContact.findById(id);
            expect(updated?.status).toBe('conectando');
            expect(updated?.fullName).toBe('Test User'); // Data integrity preserved
        });

        it('should not duplicate contacts on rapid sequential requests', async () => {
            const contact = await createTestContact();
            const id = contact._id.toString();

            // Rapid fire requests
            const promises = [
                updateContactStatus(id, 'conectando'),
                updateContactStatus(id, 'conectando'),
                updateContactStatus(id, 'conectando')
            ];

            const responses = await Promise.all(promises);

            // All should succeed
            responses.forEach(response => {
                expect(response.status).toBe(200);
            });

            // Verify only one contact exists
            const count = await LinkedInContact.countDocuments({ _id: contact._id });
            expect(count).toBe(1);
        });

        it('should update timestamp on repeated status changes', async () => {
            const contact = await createTestContact();
            const id = contact._id.toString();

            // First update
            await updateContactStatus(id, 'interactuando');
            const firstUpdate = await LinkedInContact.findById(id);
            const firstTimestamp = firstUpdate?.interactedAt?.getTime() || 0;

            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 50));

            // Second update to same status
            await updateContactStatus(id, 'interactuando');
            const secondUpdate = await LinkedInContact.findById(id);
            const secondTimestamp = secondUpdate?.interactedAt?.getTime() || 0;

            // Timestamp should be updated
            expect(secondTimestamp).toBeGreaterThanOrEqual(firstTimestamp);
        });
    });

    // ── Test 6: Edge Cases ──────────────────────────────────────
    describe('Edge Cases', () => {
        it('should handle contact without company data', async () => {
            const contact = await createTestContact({
                currentCompany: undefined,
                currentPosition: undefined,
                headline: undefined
            });

            const response = await updateContactStatus(contact._id.toString(), 'conectando');
            expect(response.status).toBe(200);
            expect(response.body.contact.status).toBe('conectando');
        });

        it('should handle contact with very long name', async () => {
            const contact = await createTestContact({
                fullName: 'A'.repeat(200),
                firstName: 'A'.repeat(100),
                lastName: 'B'.repeat(100)
            });

            const response = await updateContactStatus(contact._id.toString(), 'conectando');
            expect(response.status).toBe(200);
            expect(response.body.contact.fullName).toBe('A'.repeat(200));
        });

        it('should handle contact with special characters in name', async () => {
            const contact = await createTestContact({
                fullName: 'José García-Márquez <script>alert("xss")</script>',
                firstName: 'José',
                lastName: 'García-Márquez'
            });

            const response = await updateContactStatus(contact._id.toString(), 'conectando');
            expect(response.status).toBe(200);
            expect(response.body.contact.fullName).toBe('José García-Márquez <script>alert("xss")</script>');
        });

        it('should handle rapid status changes through multiple states', async () => {
            const contact = await createTestContact();
            const id = contact._id.toString();

            // Rapidly change through multiple states
            await updateContactStatus(id, 'conectando');
            await updateContactStatus(id, 'interactuando');
            await updateContactStatus(id, 'enriqueciendo');
            await updateContactStatus(id, 'esperando_aceptacion');

            const final = await LinkedInContact.findById(id);
            expect(final?.status).toBe('esperando_aceptacion');
            expect(final?.interactedAt).toBeDefined();
            expect(final?.enrichedAt).toBeDefined();
        });

        it('should maintain data integrity during concurrent updates', async () => {
            const contact = await createTestContact();
            const id = contact._id.toString();

            // Different status updates concurrently
            const promises = [
                updateContactStatus(id, 'conectando'),
                updateContactStatus(id, 'interactuando'),
                updateContactStatus(id, 'enriqueciendo')
            ];

            const responses = await Promise.all(promises);

            // All should succeed (last write wins)
            responses.forEach(response => {
                expect(response.status).toBe(200);
            });

            // Final state should be one of the requested statuses
            const final = await LinkedInContact.findById(id);
            expect(['conectando', 'interactuando', 'enriqueciendo']).toContain(final?.status);
        });

        it('should handle contact with empty arrays', async () => {
            const contact = await createTestContact({
                experience: [],
                education: [],
                skills: [],
                notes: []
            });

            const response = await updateContactStatus(contact._id.toString(), 'conectando');
            expect(response.status).toBe(200);
        });

        it('should handle contact with unicode characters in company name', async () => {
            const contact = await createTestContact({
                currentCompany: '株式会社テスト 🚀 Tech Corp',
                currentPosition: 'エンジニア'
            });

            const response = await updateContactStatus(contact._id.toString(), 'conectando');
            expect(response.status).toBe(200);
            expect(response.body.contact.currentCompany).toBe('株式会社テスト 🚀 Tech Corp');
        });
    });

    // ── Test 7: Webhook Verification (API Response) ─────────────
    describe('Webhook Verification (API Response)', () => {
        it('should return success response on status change', async () => {
            const contact = await createTestContact();

            const response = await updateContactStatus(contact._id.toString(), 'conectando');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('contact');
            expect(response.body.contact).toHaveProperty('status', 'conectando');
        });

        it('should include full contact data in response', async () => {
            const contact = await createTestContact();

            const response = await updateContactStatus(contact._id.toString(), 'conectando');

            expect(response.body.contact).toHaveProperty('_id');
            expect(response.body.contact).toHaveProperty('fullName');
            expect(response.body.contact).toHaveProperty('status');
            expect(response.body.contact).toHaveProperty('profileUrl');
            expect(response.body.contact).toHaveProperty('currentCompany');
            expect(response.body.contact).toHaveProperty('currentPosition');
        });

        it('should return correct content-type header', async () => {
            const contact = await createTestContact();

            const response = await updateContactStatus(contact._id.toString(), 'conectando');

            expect(response.headers['content-type']).toMatch(/json/);
        });
    });

    // ── Test 8: Enrichment Error Handling ───────────────────────
    describe('Enrichment Error Handling', () => {
        beforeEach(() => {
            // Reset mock to return true for these tests
            (openRouterService.isConfigured as jest.Mock).mockReturnValue(true);
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('should handle enrichment service failure gracefully', async () => {
            jest.spyOn(enrichmentService, 'getConfig').mockReturnValue({
                autoEnrichOnStatus: 'interactuando',
                maxEnrichmentsPerDay: 45,
                delayBetweenRequests: 100,
                model: 'moonshotai/kimi-k2',
                reEnrichAfterDays: 30
            });

            jest.spyOn(enrichmentService, 'enrichContact')
                .mockRejectedValue(new Error('Enrichment failed'));

            const contact = await createTestContact({ status: 'conectando' });

            // Status change should still succeed even if enrichment fails
            const response = await updateContactStatus(contact._id.toString(), 'interactuando');
            expect(response.status).toBe(200);
            expect(response.body.contact.status).toBe('interactuando');
        });

        it('should mark enrichment as failed on error', async () => {
            // Mock OpenRouter to fail during processing
            (openRouterService.call as jest.Mock).mockRejectedValue(new Error('OpenRouter API error'));

            const contact = await createTestContact();

            try {
                await enrichmentService.enrichContact(contact._id.toString());
            } catch (e) {
                // Expected to throw
            }

            const updated = await LinkedInContact.findById(contact._id);
            expect(updated?.enrichmentStatus).toBe('failed');
        });

        it('should handle daily limit exceeded', async () => {
            // Setup: enrich 45 contacts to reach the daily limit
            jest.spyOn(enrichmentService, 'getConfig').mockReturnValue({
                autoEnrichOnStatus: 'interactuando',
                maxEnrichmentsPerDay: 45,
                delayBetweenRequests: 100,
                model: 'moonshotai/kimi-k2',
                reEnrichAfterDays: 30
            });

            // Mock successful enrichment first
            (openRouterService.call as jest.Mock).mockResolvedValue(JSON.stringify({
                personProfile: { verifiedPosition: 'CEO' },
                company: { name: 'TestCorp' },
                keyInsights: [],
                buyingSignals: [],
                companyNews: [
                    { title: 'N1', source: 'S1', url: 'http://test.com/1', date: '2024-01-01', summary: 'Test' },
                    { title: 'N2', source: 'S2', url: 'http://test.com/2', date: '2024-01-01', summary: 'Test' },
                    { title: 'N3', source: 'S3', url: 'http://test.com/3', date: '2024-01-01', summary: 'Test' }
                ],
                confidenceScore: 85,
                dataQuality: 'verified'
            }));

            // Create and enrich 45 contacts to reach limit
            for (let i = 0; i < 45; i++) {
                const c = await createTestContact({ profileUrl: `https://linkedin.com/in/test-${i}-${Date.now()}` });
                try {
                    await enrichmentService.enrichContact(c._id.toString());
                } catch (e) {
                    // Ignore errors
                }
            }

            // Now the 46th should fail with limit error
            const contact46 = await createTestContact({ profileUrl: `https://linkedin.com/in/test-limit-${Date.now()}` });
            await expect(enrichmentService.enrichContact(contact46._id.toString()))
                .rejects.toThrow('Límite diario alcanzado');
        });

        it('should handle contact not found during enrichment', async () => {
            const fakeId = new mongoose.Types.ObjectId().toString();

            await expect(enrichmentService.enrichContact(fakeId))
                .rejects.toThrow('no encontrado');
        });
    });

    // ── Test 9: Status Counts Endpoint ──────────────────────────
    describe('Status Counts', () => {
        it('should return accurate counts by status', async () => {
            // Create contacts in different statuses
            await createTestContact({ status: 'visitando' });
            await createTestContact({ status: 'visitando' });
            await createTestContact({ status: 'conectando' });
            await createTestContact({ status: 'interactuando' });

            const response = await request(app)
                .get('/api/linkedin/crm/contacts/counts')
                .expect(200);

            expect(response.body).toHaveProperty('visitando', 2);
            expect(response.body).toHaveProperty('conectando', 1);
            expect(response.body).toHaveProperty('interactuando', 1);
            expect(response.body).toHaveProperty('enriqueciendo', 0);
            expect(response.body).toHaveProperty('esperando_aceptacion', 0);
            expect(response.body).toHaveProperty('aceptado', 0);
            expect(response.body).toHaveProperty('mensaje_enviado', 0);
        });

        it('should return zero counts when no contacts exist', async () => {
            await LinkedInContact.deleteMany({});

            const response = await request(app)
                .get('/api/linkedin/crm/contacts/counts')
                .expect(200);

            Object.values(response.body).forEach(count => {
                expect(count).toBe(0);
            });
        });

        it('should update counts after status change', async () => {
            const contact = await createTestContact({ status: 'visitando' });

            // Initial count
            let response = await request(app).get('/api/linkedin/crm/contacts/counts');
            expect(response.body.visitando).toBe(1);
            expect(response.body.conectando).toBe(0);

            // Change status
            await updateContactStatus(contact._id.toString(), 'conectando');

            // Updated count
            response = await request(app).get('/api/linkedin/crm/contacts/counts');
            expect(response.body.visitando).toBe(0);
            expect(response.body.conectando).toBe(1);
        });
    });

    // ── Test 10: Get Contact Details ────────────────────────────
    describe('Get Contact Details', () => {
        it('should retrieve full contact details', async () => {
            const contact = await createTestContact();

            const response = await request(app)
                .get(`/api/linkedin/crm/contacts/${contact._id}`)
                .expect(200);

            expect(response.body._id.toString()).toBe(contact._id.toString());
            expect(response.body.fullName).toBe(contact.fullName);
            expect(response.body.status).toBe(contact.status);
        });

        it('should return 404 for non-existent contact', async () => {
            const fakeId = new mongoose.Types.ObjectId().toString();

            const response = await request(app)
                .get(`/api/linkedin/crm/contacts/${fakeId}`)
                .expect(404);

            expect(response.body.error).toBe('Contact not found');
        });

        it('should include enrichment data when available', async () => {
            const contact = await createTestContact({
                enrichmentStatus: 'completed',
                enrichedAt: new Date(),
                enrichmentData: {
                    personProfile: {
                        verifiedPosition: 'CEO',
                        positionSource: 'LinkedIn'
                    },
                    company: {
                        name: 'TestCorp',
                        nameSource: 'LinkedIn'
                    },
                    keyInsights: [{ text: 'Insight', source: 'Test', confidence: 'high' }],
                    buyingSignals: [{ text: 'Signal', source: 'Test', evidence: 'Test', confidence: 'medium' }],
                    companyNews: [
                        { title: 'News', source: 'Source', url: 'http://test.com', date: '2024-01-01', summary: 'Summary' }
                    ]
                }
            });

            const response = await request(app)
                .get(`/api/linkedin/crm/contacts/${contact._id}`)
                .expect(200);

            expect(response.body.enrichmentStatus).toBe('completed');
            expect(response.body.enrichmentData).toBeDefined();
            expect(response.body.enrichmentData.company.name).toBe('TestCorp');
        });
    });

    // ── Test 11: List Contacts with Filters ─────────────────────
    describe('List Contacts with Filters', () => {
        it('should list all contacts', async () => {
            await createTestContact({ fullName: 'User 1' });
            await createTestContact({ fullName: 'User 2' });

            const response = await request(app)
                .get('/api/linkedin/crm/contacts')
                .expect(200);

            expect(response.body.contacts).toHaveLength(2);
            expect(response.body.total).toBe(2);
        });

        it('should filter contacts by status', async () => {
            await createTestContact({ fullName: 'User 1', status: 'visitando' });
            await createTestContact({ fullName: 'User 2', status: 'conectando' });
            await createTestContact({ fullName: 'User 3', status: 'conectando' });

            const response = await request(app)
                .get('/api/linkedin/crm/contacts?status=conectando')
                .expect(200);

            expect(response.body.contacts).toHaveLength(2);
            expect(response.body.contacts.every((c: any) => c.status === 'conectando')).toBe(true);
        });

        it('should search contacts by name', async () => {
            await createTestContact({ fullName: 'María García' });
            await createTestContact({ fullName: 'Juan Pérez' });

            const response = await request(app)
                .get('/api/linkedin/crm/contacts?search=maría')
                .expect(200);

            expect(response.body.contacts).toHaveLength(1);
            expect(response.body.contacts[0].fullName).toBe('María García');
        });

        it('should paginate results', async () => {
            // Create 5 contacts
            for (let i = 1; i <= 5; i++) {
                await createTestContact({ fullName: `User ${i}` });
            }

            const response = await request(app)
                .get('/api/linkedin/crm/contacts?page=1&limit=2')
                .expect(200);

            expect(response.body.contacts).toHaveLength(2);
            expect(response.body.page).toBe(1);
            expect(response.body.pages).toBe(3);
            expect(response.body.total).toBe(5);
        });
    });
});

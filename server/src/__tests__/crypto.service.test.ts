/**
 * Unit Tests — CryptoService
 *
 * Tests AES-256-GCM encrypt/decrypt, key validation, and error cases.
 * Run with: npx jest src/__tests__/crypto.service.test.ts --verbose
 */

import * as crypto from 'crypto';

// Set a valid test key BEFORE importing the module (lazy key loading)
const TEST_KEY = crypto.randomBytes(32).toString('hex');
process.env.LINKEDIN_ENCRYPTION_KEY = TEST_KEY;

import {
    encrypt,
    decrypt,
    validateEncryptionKey,
    _resetKeyCache,
} from '../utils/crypto.service';

import type { EncryptedPayload } from '../utils/crypto.service';

describe('CryptoService', () => {

    beforeEach(() => {
        _resetKeyCache();
        process.env.LINKEDIN_ENCRYPTION_KEY = TEST_KEY;
    });

    afterEach(() => {
        _resetKeyCache();
    });

    // ── encrypt() ──────────────────────────────────────────────

    describe('encrypt()', () => {
        it('should return ciphertext, iv, and authTag', () => {
            const result = encrypt('hello world');
            expect(result).toHaveProperty('ciphertext');
            expect(result).toHaveProperty('iv');
            expect(result).toHaveProperty('authTag');
        });

        it('should return base64-encoded strings', () => {
            const result = encrypt('test');
            const isBase64 = (s: string) => /^[A-Za-z0-9+/=]+$/.test(s);
            expect(isBase64(result.ciphertext)).toBe(true);
            expect(isBase64(result.iv)).toBe(true);
            expect(isBase64(result.authTag)).toBe(true);
        });

        it('should produce different ciphertext for the same input (random IV)', () => {
            const r1 = encrypt('same plaintext');
            const r2 = encrypt('same plaintext');
            expect(r1.iv).not.toBe(r2.iv);
            expect(r1.ciphertext).not.toBe(r2.ciphertext);
        });

        it('should produce different ciphertext for different inputs', () => {
            const r1 = encrypt('input A');
            const r2 = encrypt('input B');
            expect(r1.ciphertext).not.toBe(r2.ciphertext);
        });

        it('should handle empty string', () => {
            const result = encrypt('');
            expect(result.ciphertext).toBeDefined();
            const decrypted = decrypt(result);
            expect(decrypted).toBe('');
        });

        it('should handle large payloads (cookie array)', () => {
            const largeCookies = Array.from({ length: 50 }, (_, i) => ({
                name: `cookie_${i}`,
                value: crypto.randomBytes(64).toString('hex'),
                domain: '.linkedin.com',
            }));
            const plaintext = JSON.stringify(largeCookies);
            const result = encrypt(plaintext);
            const decrypted = decrypt(result);
            expect(JSON.parse(decrypted)).toHaveLength(50);
        });

        it('should handle unicode characters', () => {
            const unicode = 'こんにちは 🔐 Ñoño';
            const result = encrypt(unicode);
            expect(decrypt(result)).toBe(unicode);
        });
    });

    // ── decrypt() ──────────────────────────────────────────────

    describe('decrypt()', () => {
        it('should decrypt to the original plaintext', () => {
            const original = 'LinkedIn session cookies';
            const encrypted = encrypt(original);
            expect(decrypt(encrypted)).toBe(original);
        });

        it('should round-trip JSON cookie array', () => {
            const cookies = [
                { name: 'li_at', value: 'secret_token', domain: '.linkedin.com' },
                { name: 'JSESSIONID', value: 'session_123', domain: '.linkedin.com' },
            ];
            const encrypted = encrypt(JSON.stringify(cookies));
            const decrypted = JSON.parse(decrypt(encrypted));
            expect(decrypted).toHaveLength(2);
            expect(decrypted[0].name).toBe('li_at');
            expect(decrypted[1].name).toBe('JSESSIONID');
        });

        it('should throw on tampered ciphertext (GCM auth tag check)', () => {
            const encrypted = encrypt('original data');
            const tamperedCiphertext = Buffer.from(encrypted.ciphertext, 'base64');
            tamperedCiphertext[0] ^= 0xff;
            const tampered: EncryptedPayload = {
                ...encrypted,
                ciphertext: tamperedCiphertext.toString('base64'),
            };
            expect(() => decrypt(tampered)).toThrow('[CryptoService] Decryption failed');
        });

        it('should throw on tampered auth tag', () => {
            const encrypted = encrypt('original data');
            const tamperedTag = Buffer.from(encrypted.authTag, 'base64');
            tamperedTag[0] ^= 0xff;
            const tampered: EncryptedPayload = {
                ...encrypted,
                authTag: tamperedTag.toString('base64'),
            };
            expect(() => decrypt(tampered)).toThrow('[CryptoService] Decryption failed');
        });

        it('should throw on tampered IV', () => {
            const encrypted = encrypt('original data');
            const tamperedIv = Buffer.from(encrypted.iv, 'base64');
            tamperedIv[0] ^= 0xff;
            const tampered: EncryptedPayload = {
                ...encrypted,
                iv: tamperedIv.toString('base64'),
            };
            expect(() => decrypt(tampered)).toThrow('[CryptoService] Decryption failed');
        });

        it('should throw when decrypting with wrong key', () => {
            const encrypted = encrypt('secret data');
            _resetKeyCache();
            process.env.LINKEDIN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
            expect(() => decrypt(encrypted)).toThrow('[CryptoService] Decryption failed');
        });
    });

    // ── validateEncryptionKey() ────────────────────────────────

    describe('validateEncryptionKey()', () => {
        it('should not throw with a valid 64-char hex key', () => {
            expect(() => validateEncryptionKey()).not.toThrow();
        });

        it('should throw when key is missing', () => {
            _resetKeyCache();
            delete process.env.LINKEDIN_ENCRYPTION_KEY;
            expect(() => validateEncryptionKey()).toThrow('LINKEDIN_ENCRYPTION_KEY is not set');
        });

        it('should throw when key is too short', () => {
            _resetKeyCache();
            process.env.LINKEDIN_ENCRYPTION_KEY = 'tooshort';
            expect(() => validateEncryptionKey()).toThrow('must be 64 hex characters');
        });

        it('should throw when key is too long', () => {
            _resetKeyCache();
            process.env.LINKEDIN_ENCRYPTION_KEY = crypto.randomBytes(33).toString('hex'); // 66 chars
            expect(() => validateEncryptionKey()).toThrow('must be 64 hex characters');
        });

        it('should throw when key contains non-hex characters', () => {
            _resetKeyCache();
            process.env.LINKEDIN_ENCRYPTION_KEY = 'z'.repeat(64);
            expect(() => validateEncryptionKey()).toThrow('valid hex string');
        });
    });
});

/**
 * CryptoService — AES-256-GCM authenticated encryption
 *
 * Used exclusively for encrypting LinkedIn session cookies at rest.
 *
 * SECURITY RULES:
 * - Master key comes from LINKEDIN_ENCRYPTION_KEY env var (32 bytes / 64 hex chars)
 * - A fresh random IV is generated for every encrypt() call
 * - GCM auth tag is verified on every decrypt() call
 * - NEVER log the key, plaintext, or ciphertext
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 16;
const AUTH_TAG_LENGTH_BYTES = 16;

// ── Key Management ────────────────────────────────────────────

/**
 * Loads and validates the master encryption key from env.
 * Throws on startup if the key is missing or malformed.
 */
function loadMasterKey(): Buffer {
    const keyHex = process.env.LINKEDIN_ENCRYPTION_KEY;
    if (!keyHex) {
        throw new Error(
            '[CryptoService] LINKEDIN_ENCRYPTION_KEY is not set. ' +
            'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        );
    }
    if (keyHex.length !== KEY_LENGTH_BYTES * 2) {
        throw new Error(
            `[CryptoService] LINKEDIN_ENCRYPTION_KEY must be ${KEY_LENGTH_BYTES * 2} hex characters (${KEY_LENGTH_BYTES} bytes). ` +
            `Got ${keyHex.length} characters.`
        );
    }
    if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
        throw new Error('[CryptoService] LINKEDIN_ENCRYPTION_KEY must be a valid hex string.');
    }
    return Buffer.from(keyHex, 'hex');
}

// Lazy-loaded key — only validated when first used, not at module import time
// (allows tests to set the env var before the module is used)
let _masterKey: Buffer | null = null;

function getMasterKey(): Buffer {
    if (!_masterKey) {
        _masterKey = loadMasterKey();
    }
    return _masterKey;
}

// ── Encryption Result ─────────────────────────────────────────

export interface EncryptedPayload {
    /** Base64-encoded ciphertext */
    ciphertext: string;
    /** Base64-encoded random IV (16 bytes) */
    iv: string;
    /** Base64-encoded GCM auth tag (16 bytes) */
    authTag: string;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * A fresh random IV is generated on every call.
 *
 * @param plaintext - The string to encrypt (e.g., JSON.stringify(cookies))
 * @returns EncryptedPayload with ciphertext, iv, and authTag (all base64)
 */
export function encrypt(plaintext: string): EncryptedPayload {
    const key = getMasterKey();
    const iv = crypto.randomBytes(IV_LENGTH_BYTES);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH_BYTES,
    });

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
        ciphertext: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
    };
}

/**
 * Decrypts an EncryptedPayload produced by encrypt().
 * Throws if the auth tag is invalid (tampered data or wrong key).
 *
 * @param payload - The EncryptedPayload to decrypt
 * @returns The original plaintext string
 */
export function decrypt(payload: EncryptedPayload): string {
    const key = getMasterKey();
    const iv = Buffer.from(payload.iv, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');
    const authTag = Buffer.from(payload.authTag, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH_BYTES,
    });

    decipher.setAuthTag(authTag);

    try {
        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]);
        return decrypted.toString('utf8');
    } catch {
        // Do NOT include the error message — it may contain key material
        throw new Error('[CryptoService] Decryption failed: invalid auth tag or wrong key.');
    }
}

/**
 * Validates that the encryption key is correctly configured.
 * Call this on server startup to fail fast.
 */
export function validateEncryptionKey(): void {
    getMasterKey(); // throws if invalid
    console.log('[CryptoService] ✅ Encryption key validated (32 bytes, AES-256-GCM)');
}

/**
 * Resets the cached master key (for testing only).
 * @internal
 */
export function _resetKeyCache(): void {
    _masterKey = null;
}

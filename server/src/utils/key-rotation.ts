/**
 * Key Rotation Utility
 *
 * Allows rotating the LINKEDIN_ENCRYPTION_KEY without losing stored sessions.
 * The process:
 *   1. Decrypt all cookies with the OLD key
 *   2. Re-encrypt with the NEW key
 *   3. Save back to MongoDB
 *   4. Verify the re-encryption was successful
 *
 * USAGE (run as a one-off script before deploying the new key):
 *   LINKEDIN_ENCRYPTION_KEY=<old_key> LINKEDIN_NEW_ENCRYPTION_KEY=<new_key> \
 *     npx ts-node src/utils/key-rotation.ts
 *
 * SECURITY:
 *   - Both keys must be present in the environment
 *   - The old key is used only for decryption
 *   - The new key is used only for re-encryption
 *   - No plaintext cookies are written to disk or logs
 *   - A dry-run mode is available for verification
 */

import * as crypto from 'crypto';
import mongoose from 'mongoose';
import { LinkedInAccount } from '../models/linkedin-account.model';
import { LinkedInAuditLog } from '../models/linkedin-audit-log.model';
import { Types } from 'mongoose';

// ── Encryption helpers (key-aware, not using the singleton) ───

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

function encryptWithKey(plaintext: string, key: Buffer): { ciphertext: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(IV_LENGTH_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH_BYTES,
    });
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
        ciphertext: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
    };
}

function decryptWithKey(
    ciphertext: string,
    iv: string,
    authTag: string,
    key: Buffer
): string {
    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(iv, 'base64'),
        { authTagLength: AUTH_TAG_LENGTH_BYTES }
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
    ]);
    return decrypted.toString('utf8');
}

function parseHexKey(hexKey: string, label: string): Buffer {
    if (!hexKey || hexKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(hexKey)) {
        throw new Error(`[KeyRotation] ${label} must be a 64-character hex string`);
    }
    return Buffer.from(hexKey, 'hex');
}

// ── Key Rotation ──────────────────────────────────────────────

export interface RotationResult {
    total: number;
    rotated: number;
    skipped: number;
    failed: number;
    errors: { accountId: string; error: string }[];
}

/**
 * Rotates encryption keys for all accounts in a workspace.
 * @param oldKeyHex - The current encryption key (64 hex chars)
 * @param newKeyHex - The new encryption key (64 hex chars)
 * @param workspaceId - Workspace to rotate (or 'all' for all workspaces)
 * @param dryRun - If true, validates decryption but does NOT save new ciphertext
 */
export async function rotateKeys(
    oldKeyHex: string,
    newKeyHex: string,
    workspaceId: string = 'all',
    dryRun: boolean = false
): Promise<RotationResult> {
    const oldKey = parseHexKey(oldKeyHex, 'OLD key');
    const newKey = parseHexKey(newKeyHex, 'NEW key');

    if (oldKeyHex === newKeyHex) {
        throw new Error('[KeyRotation] Old and new keys must be different');
    }

    const result: RotationResult = {
        total: 0,
        rotated: 0,
        skipped: 0,
        failed: 0,
        errors: [],
    };

    console.log(`[KeyRotation] 🔑 Starting key rotation${dryRun ? ' (DRY RUN)' : ''}...`);
    console.log(`[KeyRotation] Workspace: ${workspaceId}`);

    // Query accounts with stored cookies
    const query = workspaceId === 'all'
        ? {}
        : { workspaceId };

    const accounts = await LinkedInAccount
        .find(query)
        .select('+cookiesEncrypted +cookiesIv +cookiesAuthTag')
        .exec();

    result.total = accounts.length;
    console.log(`[KeyRotation] Found ${accounts.length} accounts`);

    for (const account of accounts) {
        const accountId = (account._id as Types.ObjectId).toString();

        // Skip accounts without stored cookies
        if (!account.cookiesEncrypted || !account.cookiesIv || !account.cookiesAuthTag) {
            console.log(`[KeyRotation] ⏭️  Skipping ${accountId} (no cookies stored)`);
            result.skipped++;
            continue;
        }

        try {
            // Step 1: Decrypt with old key
            const plaintext = decryptWithKey(
                account.cookiesEncrypted,
                account.cookiesIv,
                account.cookiesAuthTag,
                oldKey
            );

            // Validate it's valid JSON
            JSON.parse(plaintext);

            if (dryRun) {
                console.log(`[KeyRotation] ✅ DRY RUN: ${accountId} decrypted successfully`);
                result.rotated++;
                continue;
            }

            // Step 2: Re-encrypt with new key
            const { ciphertext, iv, authTag } = encryptWithKey(plaintext, newKey);

            // Step 3: Verify the new encryption round-trips correctly
            const verified = decryptWithKey(ciphertext, iv, authTag, newKey);
            if (verified !== plaintext) {
                throw new Error('Re-encryption verification failed — plaintext mismatch');
            }

            // Step 4: Save to MongoDB
            await LinkedInAccount.findByIdAndUpdate(accountId, {
                cookiesEncrypted: ciphertext,
                cookiesIv: iv,
                cookiesAuthTag: authTag,
            });

            await LinkedInAuditLog.append(
                account.workspaceId,
                account._id as Types.ObjectId,
                'key_rotated',
                { dryRun: false }
            );

            console.log(`[KeyRotation] ✅ Rotated: ${accountId} (${account.label})`);
            result.rotated++;

        } catch (err: any) {
            console.error(`[KeyRotation] ❌ Failed: ${accountId}: ${err.message}`);
            result.failed++;
            result.errors.push({ accountId, error: err.message });
        }
    }

    console.log(`[KeyRotation] Done. Total: ${result.total}, Rotated: ${result.rotated}, Skipped: ${result.skipped}, Failed: ${result.failed}`);
    return result;
}

// ── CLI Entry Point ───────────────────────────────────────────

async function main() {
    const oldKey = process.env.LINKEDIN_ENCRYPTION_KEY;
    const newKey = process.env.LINKEDIN_NEW_ENCRYPTION_KEY;
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/voicecommand';
    const workspaceId = process.env.LINKEDIN_WORKSPACE_ID || 'all';
    const dryRun = process.env.DRY_RUN === 'true';

    if (!oldKey || !newKey) {
        console.error('[KeyRotation] ❌ Both LINKEDIN_ENCRYPTION_KEY and LINKEDIN_NEW_ENCRYPTION_KEY must be set');
        process.exit(1);
    }

    console.log('[KeyRotation] Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('[KeyRotation] Connected');

    try {
        const result = await rotateKeys(oldKey, newKey, workspaceId, dryRun);

        if (result.failed > 0) {
            console.error(`[KeyRotation] ⚠️  ${result.failed} accounts failed to rotate`);
            process.exit(1);
        }

        if (!dryRun && result.rotated > 0) {
            console.log('\n[KeyRotation] ✅ Key rotation complete!');
            console.log('[KeyRotation] 📋 Next steps:');
            console.log('  1. Update LINKEDIN_ENCRYPTION_KEY in your .env to the new key');
            console.log('  2. Remove LINKEDIN_NEW_ENCRYPTION_KEY from your .env');
            console.log('  3. Restart the server');
        }
    } finally {
        await mongoose.disconnect();
    }
}

// Run as CLI if called directly
if (require.main === module) {
    main().catch(err => {
        console.error('[KeyRotation] Fatal error:', err);
        process.exit(1);
    });
}

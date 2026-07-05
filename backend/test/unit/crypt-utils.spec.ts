import { describe, expect, it } from 'vitest';

import { decryptUuid, encryptUuid } from '@common/utils/crypt-utils';

/**
 * WHAT: AES-256-GCM helpers used to hide the subpage-config UUID inside the
 * session cookie. They must round-trip correctly and fail closed (return null)
 * on the wrong secret or tampered input — never throw, never leak.
 */

const SECRET = 'unit-test-secret';
const UUID = '00000000-0000-0000-0000-000000000000';

describe('crypt-utils', () => {
    it('round-trips a uuid through encrypt/decrypt', () => {
        const encrypted = encryptUuid(UUID, SECRET);

        expect(encrypted).not.toBe(UUID);
        expect(decryptUuid(encrypted, SECRET)).toBe(UUID);
    });

    it('produces a different ciphertext each call (random IV)', () => {
        expect(encryptUuid(UUID, SECRET)).not.toBe(encryptUuid(UUID, SECRET));
    });

    it('returns null when decrypting with the wrong secret', () => {
        const encrypted = encryptUuid(UUID, SECRET);

        expect(decryptUuid(encrypted, 'other-secret')).toBeNull();
    });

    it('returns null on malformed input', () => {
        expect(decryptUuid('not-valid-base64url!!!', SECRET)).toBeNull();
        expect(decryptUuid('', SECRET)).toBeNull();
    });
});

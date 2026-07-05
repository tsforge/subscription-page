import { describe, expect, it } from 'vitest';

import { sanitizeUsername } from '@common/utils';

/**
 * WHAT: mirrors Marzban's username sanitizer — keep [a-zA-Z0-9_-], replace
 * anything else with "_", and pad to a minimum of 6 chars. Used before looking
 * a migrated Marzban user up in the Remnawave panel.
 */

describe('sanitizeUsername', () => {
    it('keeps valid characters unchanged', () => {
        expect(sanitizeUsername('valid_user-123')).toBe('valid_user-123');
    });

    it('replaces invalid characters with underscore', () => {
        expect(sanitizeUsername('bad user!@#name')).toBe('bad_user___name');
    });

    it('pads short results to a minimum of 6 characters', () => {
        expect(sanitizeUsername('ab')).toBe('ab____');
        expect(sanitizeUsername('!')).toBe('______');
    });

    it('does not pad when already 6+ characters', () => {
        expect(sanitizeUsername('abcdef')).toBe('abcdef');
    });
});

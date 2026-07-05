import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

import { JwtService } from '@nestjs/jwt';

import { MarzbanSubscriptionService } from '@modules/marzban/marzban-subscription.service';

/**
 * WHAT: MarzbanSubscriptionService decodes a legacy Marzban subscription link
 * and maps it to a Remnawave user. `resolveShortUuid()` returns one of three
 * outcomes the caller acts on:
 *
 *   • skip     — not a Marzban link (or the feature is off) → keep original shortUuid
 *   • resolved — decoded to a real user                     → swap in their shortUuid
 *   • reject   — valid link but user missing / revoked      → drop the request
 *
 * A Marzban link arrives in one of two on-the-wire formats, both exercised here:
 *   • JWT:    header.payload.signature   (payload: access="subscription", sub=<username>)
 *   • Legacy: base64url("<username>,<createdAtUnix>") + a 10-char sha256 signature
 *
 * HOW: the service is constructed by hand with a fake config and a stubbed panel
 * lookup (`getUserByUsername`) so every test isolates a single variable.
 */

const SECRET = 'marzban-secret';

type MockFn = ReturnType<typeof vi.fn>;

// --- test doubles -----------------------------------------------------------

/** Fake TypedConfigService. Defaults describe an enabled, strict setup. */
function makeConfig(over: Record<string, unknown> = {}) {
    const values: Record<string, unknown> = {
        MARZBAN_LEGACY_LINK_ENABLED: true,
        MARZBAN_LEGACY_DROP_REVOKED_SUBSCRIPTIONS: true,
        MARZBAN_LEGACY_SECRET_KEY: SECRET,
        MARZBAN_LEGACY_SUBSCRIPTION_VALID_FROM: undefined,
        ...over,
    };
    return { getOrThrow: (key: string) => values[key], get: (key: string) => values[key] };
}

/** Shape of a successful panel `getUserByUsername` response. */
function userFound(shortUuid = 'resolvedShort', subRevokedAt: string | null = null) {
    return { isOk: true, response: { response: { shortUuid, subRevokedAt } } };
}

/** Build the service with fake config + stubbed panel client. */
function makeService(
    configOver: Record<string, unknown> = {},
    getUserByUsername: MockFn = vi.fn(),
) {
    const axios = { getUserByUsername };
    const svc = new MarzbanSubscriptionService(
        makeConfig(configOver) as never,
        new JwtService({}) as never,
        axios as never,
    );
    return { svc, axios };
}

// --- token builders ---------------------------------------------------------

/** A JWT-format Marzban link. */
function jwtToken(username: string, access = 'subscription', secret = SECRET) {
    return jwt.sign({ access, sub: username }, secret, { algorithm: 'HS256' });
}

/** A legacy `<base64url payload>.<10-char signature>` Marzban link. */
function legacyToken(username: string, createdAtUnix: number, secret = SECRET) {
    const payload = Buffer.from(`${username},${createdAtUnix}`).toString('base64url');
    const signature = Buffer.from(
        createHash('sha256')
            .update(payload + secret)
            .digest(),
    )
        .toString('base64url')
        .slice(0, 10);
    return payload + signature;
}

describe('MarzbanSubscriptionService.resolveShortUuid', () => {
    let getUser: MockFn;

    beforeEach(() => {
        // Default: the panel finds an active (non-revoked) user.
        getUser = vi.fn().mockResolvedValue(userFound());
    });

    describe('skips (falls back to the original shortUuid)', () => {
        it('when the legacy-link feature is disabled', async () => {
            const { svc } = makeService({ MARZBAN_LEGACY_LINK_ENABLED: false }, getUser);

            expect(await svc.resolveShortUuid('ip', jwtToken('alice'))).toEqual({ status: 'skip' });
            expect(getUser).not.toHaveBeenCalled(); // never even looks at the panel
        });

        it('when no secret key is configured to verify links with', async () => {
            const { svc } = makeService({ MARZBAN_LEGACY_SECRET_KEY: '' }, getUser);

            expect(await svc.resolveShortUuid('ip', jwtToken('alice'))).toEqual({ status: 'skip' });
        });

        it('when the value is too short to be a token', async () => {
            const { svc } = makeService({}, getUser);

            expect(await svc.resolveShortUuid('ip', 'short')).toEqual({ status: 'skip' });
        });

        it('when the value is not a Marzban token at all', async () => {
            const { svc } = makeService({}, getUser);

            expect(await svc.resolveShortUuid('ip', 'totally-not-a-token')).toEqual({
                status: 'skip',
            });
        });

        it('when the JWT access field is not "subscription"', async () => {
            const { svc } = makeService({}, getUser);

            expect(await svc.resolveShortUuid('ip', jwtToken('u', 'not-subscription'))).toEqual({
                status: 'skip',
            });
        });

        it('when the token was created before MARZBAN_LEGACY_SUBSCRIPTION_VALID_FROM', async () => {
            const { svc } = makeService(
                { MARZBAN_LEGACY_SUBSCRIPTION_VALID_FROM: '2025-01-01T00:00:00Z' },
                getUser,
            );

            // Token stamped in 2020 — before the cutoff, so the decode is rejected.
            const oldToken = legacyToken('u', 1_600_000_000);

            expect(await svc.resolveShortUuid('ip', oldToken)).toEqual({ status: 'skip' });
            expect(getUser).not.toHaveBeenCalled();
        });
    });

    describe('resolves (swaps in the mapped shortUuid)', () => {
        it('a valid JWT token, forwarding the client IP + username to the panel', async () => {
            const { svc } = makeService({}, getUser);

            const result = await svc.resolveShortUuid('1.2.3.4', jwtToken('alice1'));

            expect(result).toEqual({ status: 'resolved', shortUuid: 'resolvedShort' });
            expect(getUser).toHaveBeenCalledWith('1.2.3.4', 'alice1');
        });

        it('a valid legacy token', async () => {
            const { svc } = makeService({}, getUser);

            const result = await svc.resolveShortUuid('ip', legacyToken('bob', 1_700_000_000));

            expect(result).toEqual({ status: 'resolved', shortUuid: 'resolvedShort' });
        });

        it('sanitizing the decoded username before the panel lookup', async () => {
            const { svc } = makeService({}, getUser);

            await svc.resolveShortUuid('ip', jwtToken('bad name'));

            // Spaces/invalid chars become underscores (Marzban username rules).
            expect(getUser).toHaveBeenCalledWith('ip', 'bad_name');
        });

        it('a revoked subscription when drop-revoked is turned off', async () => {
            getUser.mockResolvedValue(userFound('keep', '2024-01-01T00:00:00Z'));
            const { svc } = makeService(
                { MARZBAN_LEGACY_DROP_REVOKED_SUBSCRIPTIONS: false },
                getUser,
            );

            expect(await svc.resolveShortUuid('ip', jwtToken('u'))).toEqual({
                status: 'resolved',
                shortUuid: 'keep',
            });
        });
    });

    describe('rejects (drops the request)', () => {
        it('when the decoded user does not exist in the panel', async () => {
            getUser.mockResolvedValue({ isOk: false, response: null });
            const { svc } = makeService({}, getUser);

            expect(await svc.resolveShortUuid('ip', jwtToken('ghost'))).toEqual({
                status: 'reject',
            });
        });

        it('when the subscription is revoked and drop-revoked is on', async () => {
            getUser.mockResolvedValue(userFound('x', '2024-01-01T00:00:00Z'));
            const { svc } = makeService({}, getUser);

            expect(await svc.resolveShortUuid('ip', jwtToken('u'))).toEqual({ status: 'reject' });
        });
    });
});

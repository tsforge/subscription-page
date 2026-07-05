import { describe, expect, it } from 'vitest';
import axios from 'axios';

/**
 * WHAT: contract tests against a REAL Remnawave panel. They verify that the
 * response shape our code (and our mocks) rely on hasn't drifted — e.g. that the
 * `subscription-userinfo` header still carries an `expire` field.
 *
 * These DO NOT run by default: they self-skip unless the LIVE_* env vars below
 * are provided, so CI and normal `npm test` stay hermetic (no network, no
 * secrets). To run them, export the vars and run `npm run test:live`:
 *
 *   LIVE_PANEL_URL=https://panel.example.com \
 *   LIVE_API_TOKEN=... \
 *   LIVE_SHORT_UUID=abc123 \
 *   npm run test:live
 *
 * Optional (Cloudflare Zero Trust in front of the panel):
 *   LIVE_CF_CLIENT_ID / LIVE_CF_CLIENT_SECRET
 */

const PANEL_URL = process.env.LIVE_PANEL_URL;
const API_TOKEN = process.env.LIVE_API_TOKEN;
const SHORT_UUID = process.env.LIVE_SHORT_UUID;

const enabled = Boolean(PANEL_URL && API_TOKEN && SHORT_UUID);

const client = axios.create({
    baseURL: PANEL_URL,
    timeout: 10_000,
    // Never throw on non-2xx — we assert on status explicitly.
    validateStatus: () => true,
    headers: {
        'user-agent': 'Remnawave Subscription Page (contract test)',
        Authorization: `Bearer ${API_TOKEN}`,
        ...(process.env.LIVE_CF_CLIENT_ID && process.env.LIVE_CF_CLIENT_SECRET
            ? {
                  'CF-Access-Client-Id': process.env.LIVE_CF_CLIENT_ID,
                  'CF-Access-Client-Secret': process.env.LIVE_CF_CLIENT_SECRET,
              }
            : {}),
    },
});

describe.skipIf(!enabled)('Remnawave panel contract (live)', () => {
    it('raw subscription carries a subscription-userinfo header with an expire field', async () => {
        const res = await client.get(`/api/sub/${SHORT_UUID}`);

        expect(res.status).toBe(200);

        const userInfo = res.headers['subscription-userinfo'];
        expect(userInfo, 'subscription-userinfo header is missing').toBeTruthy();
        // This is exactly what isSubscriptionExpired() parses.
        expect(String(userInfo)).toMatch(/expire=\d+/);
    });

    it('the /info endpoint returns the structured user payload', async () => {
        const res = await client.get(`/api/sub/${SHORT_UUID}/info`);

        expect(res.status).toBe(200);
        // Our browser path reads subscriptionData.response.{links,ssConfLinks,...}.
        expect(res.data).toHaveProperty('response');
    });
});

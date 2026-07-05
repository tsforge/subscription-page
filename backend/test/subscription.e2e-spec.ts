import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { NestExpressApplication } from '@nestjs/platform-express';

import { ACTIVE_USERINFO, createTestApp, TestAxiosMock } from './utils/create-test-app';

/**
 * WHAT: end-to-end behaviour of the subscription endpoint
 * (`GET /:shortUuid` and `GET /:shortUuid/:clientType`) with the Remnawave
 * panel mocked. We assert the two things our backend actually does:
 *
 *   1. forwards the request to the panel (right shortUuid / clientType / UA)
 *      and streams the panel's config + headers back to the client;
 *   2. routes browser user-agents to the HTML page instead of the raw config.
 *
 * NOTE: on any error the app calls `res.socket.destroy()` rather than sending a
 * status code, so supertest sees a socket hang-up — asserted via `.rejects`.
 */

// A non-browser UA keeps requests on the raw-config path (not returnWebpage).
const CLIENT_UA = 'ClashMeta/1.0';
const SHORT_UUID = 'testShortUuid123';

describe('Subscription (e2e)', () => {
    let app: NestExpressApplication;
    let axios: TestAxiosMock;

    // Small helper so each test reads as "GET <path> as <ua>".
    const get = (path: string, ua = CLIENT_UA) =>
        request(app.getHttpServer()).get(path).set('User-Agent', ua);

    beforeAll(async () => {
        ({ app, axios } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    describe('raw config path (non-browser clients)', () => {
        it('streams the panel config back and forwards its headers', async () => {
            const res = await get(`/${SHORT_UUID}/json`);

            expect(res.status).toBe(200);
            expect(res.text).toContain('mixed-port: 7890'); // the mocked panel body
            expect(res.headers['subscription-userinfo']).toBe(ACTIVE_USERINFO);
        });

        it('asks the panel for the requested clientType', async () => {
            await get(`/${SHORT_UUID}/json`);

            // (clientIp, shortUuid, headers, withClientType, clientType)
            expect(axios.getSubscription).toHaveBeenCalledWith(
                expect.any(String),
                SHORT_UUID,
                expect.any(Object),
                true,
                'json',
            );
        });

        it('treats a missing clientType as the plain subscription', async () => {
            await get(`/${SHORT_UUID}`);

            expect(axios.getSubscription).toHaveBeenLastCalledWith(
                expect.any(String),
                SHORT_UUID,
                expect.any(Object),
                false, // withClientType
                undefined, // clientType
            );
        });

        it('drops the connection for an unknown clientType', async () => {
            await expect(get(`/${SHORT_UUID}/not-a-real-type`)).rejects.toThrow();
        });

        it('drops the connection when the panel returns no subscription', async () => {
            axios.getSubscription.mockResolvedValueOnce(null);

            await expect(get(`/${SHORT_UUID}/json`)).rejects.toThrow();
        });
    });

    describe('User-Agent routing', () => {
        // The panel picks the config template by User-Agent, so our backend must
        // forward the UA untouched. Each of these clients hits the raw path.
        const CLIENT_UAS = ['v2rayNG/1.8.5', 'clash-verge/1.5', 'sing-box/1.8', 'Streisand'];

        it.each(CLIENT_UAS)('forwards "%s" to the panel so it can pick a template', async (ua) => {
            axios.getSubscription.mockClear();

            const res = await get(`/${SHORT_UUID}`, ua);

            expect(res.status).toBe(200);
            expect(axios.getSubscription).toHaveBeenCalledWith(
                expect.any(String),
                SHORT_UUID,
                expect.objectContaining({ 'user-agent': ua }),
                false,
                undefined,
            );
        });

        it('serves the HTML page (not the raw config) to a browser', async () => {
            axios.getSubscription.mockClear();
            axios.getSubscriptionInfo.mockClear();

            const res = await get(`/${SHORT_UUID}`, 'Mozilla/5.0 (Macintosh) Chrome/149');

            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('text/html');
            expect(res.text).toContain('id="sbpg"'); // the rendered page shell
            // Browser path goes through getSubscriptionInfo, never the raw getSubscription.
            expect(axios.getSubscriptionInfo).toHaveBeenCalledWith(expect.any(String), SHORT_UUID);
            expect(axios.getSubscription).not.toHaveBeenCalled();
        });
    });

    describe('requests that must never reach the panel', () => {
        it('drops static-asset paths (favicon) instead of proxying them', async () => {
            axios.getSubscription.mockClear();

            await expect(get('/favicon.ico')).rejects.toThrow();
            expect(axios.getSubscription).not.toHaveBeenCalled();
        });

        it('drops /assets/* without a valid session cookie (assets guard)', async () => {
            await expect(get('/assets/app.js')).rejects.toThrow();
        });
    });
});

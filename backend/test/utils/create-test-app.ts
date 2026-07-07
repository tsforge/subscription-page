import { ZodValidationPipe } from 'nestjs-zod';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { vi } from 'vitest';
import * as ejs from 'ejs';

import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { checkAssetsCookieMiddleware } from '@common/middlewares/check-assets-cookie.middleware';
import { noRobotsMiddleware, proxyCheckMiddleware } from '@common/middlewares';
import { getRealIp } from '@common/middlewares/get-real-ip';
import { AxiosService } from '@common/axios/axios.service';

import { SubpageConfigService } from '@modules/subscription/subpage-config.service';

import { AppModule } from '../../src/app.module';

/**
 * Boots the real AppModule as an HTTP server for e2e tests, but with the two
 * external dependencies replaced by controllable fakes:
 *   • AxiosService        — the Remnawave panel (no real network calls)
 *   • SubpageConfigService — stubbed so its bootstrap (which would call the
 *                            panel and process.exit(1) on failure) never runs
 * The same global middleware + view engine as `main.ts` are wired up so the
 * request pipeline behaves exactly like production.
 */

export const ACTIVE_USERINFO = 'upload=0; download=0; total=0; expire=0';

export function createAxiosMock() {
    return {
        getSubscription: vi.fn().mockResolvedValue({
            response: 'mixed-port: 7890\nproxies: []\n',
            headers: { 'subscription-userinfo': ACTIVE_USERINFO, 'content-type': 'text/yaml' },
        }),
        // Browser page path.
        getSubscriptionInfo: vi.fn().mockResolvedValue({ isOk: true, response: { response: {} } }),
        getSubpageConfig: vi
            .fn()
            .mockResolvedValue({ isOk: true, response: { webpageAllowed: true } }),
        getUserByUsername: vi.fn().mockResolvedValue({ isOk: false, response: null }),
    };
}

function createSubpageConfigMock() {
    return {
        getSubscriptionPageConfig: vi.fn().mockResolvedValue({}),
        getEncryptedSubpageConfigUuid: vi.fn().mockReturnValue('encrypted-uuid'),
        getBaseSettings: vi.fn().mockReturnValue({
            metaTitle: 'Test',
            metaDescription: 'Test',
            showConnectionKeys: true,
            hideGetLinkButton: false,
        }),
    };
}

export type TestAxiosMock = ReturnType<typeof createAxiosMock>;

export interface TestApp {
    app: NestExpressApplication;
    axios: TestAxiosMock;
}

export async function createTestApp(): Promise<TestApp> {
    const axios = createAxiosMock();

    const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
    })
        .overrideProvider(AxiosService)
        .useValue(axios)
        .overrideProvider(SubpageConfigService)
        .useValue(createSubpageConfigMock())
        .compile();

    const app = moduleRef.createNestApplication<NestExpressApplication>();

    app.set('trust proxy', 1);
    app.use(cookieParser());
    app.use(noRobotsMiddleware, proxyCheckMiddleware, checkAssetsCookieMiddleware, getRealIp);
    app.useGlobalPipes(new ZodValidationPipe());

    app.engine('html', ejs.renderFile);
    app.setViewEngine('html');
    app.setBaseViewsDir(path.resolve(process.cwd(), 'test/fixtures/views'));

    await app.init();

    return { app, axios };
}

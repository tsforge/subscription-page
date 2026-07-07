import { describe, expect, it } from 'vitest';
import { dump, load } from 'js-yaml';

import { TypedConfigService } from '@common/config/app-config';

import { SubscriptionInjectorService } from '@modules/injector';

/**
 * Orchestrator-level tests: format routing by explicit clientType, body sniffing
 * when clientType is absent, and every passthrough guard (disabled flag, missing
 * snippet, unparseable body) — the service must never corrupt a subscription.
 */

type Env = Record<string, unknown>;

const BASE_ENV: Env = {
    EXPIRED_SUB_INJECT_ENABLED: true,
    EXPIRED_SUB_INJECT_MODE: 'prepend',
    EXPIRED_SUB_INJECT_CLASH: '{name: "EXPIRED", type: vless, server: n, port: 443}',
    EXPIRED_SUB_INJECT_XRAY:
        '{"remarks":"EXPIRED","outbounds":[{"protocol":"vless","tag":"proxy"}]}',
};

function makeService(overrides: Env = {}): SubscriptionInjectorService {
    const env = { ...BASE_ENV, ...overrides };
    const stub = {
        get: (key: string) => env[key],
        getOrThrow: (key: string) => {
            if (env[key] === undefined) throw new Error(`missing env: ${key}`);
            return env[key];
        },
    } as unknown as TypedConfigService;

    return new SubscriptionInjectorService(stub);
}

interface ClashDoc {
    proxies: { name: string }[];
}

const CLASH_BODY = dump({
    proxies: [{ name: 'Real', type: 'vless', server: 'host', port: 443 }],
    'proxy-groups': [{ name: 'Auto', type: 'select', proxies: ['Real'] }],
});

describe('SubscriptionInjectorService', () => {
    it('reports the enabled flag from config', () => {
        expect(makeService().isEnabled()).toBe(true);
        expect(makeService({ EXPIRED_SUB_INJECT_ENABLED: false }).isEnabled()).toBe(false);
    });

    it('returns the body untouched when disabled', () => {
        const service = makeService({ EXPIRED_SUB_INJECT_ENABLED: false });

        expect(service.inject(CLASH_BODY, 'clash')).toBe(CLASH_BODY);
    });

    it.each(['clash', 'mihomo', 'stash'] as const)(
        'routes clientType "%s" to the clash injector',
        (clientType) => {
            const out = makeService().inject(CLASH_BODY, clientType);

            const doc = load(out as string) as ClashDoc;
            expect(doc.proxies[0].name).toBe('EXPIRED');
        },
    );

    it('passes sing-box configs through untouched (unsupported format)', () => {
        const body = { outbounds: [{ type: 'vless', tag: 'Real' }] };

        expect(makeService().inject(body, 'singbox')).toBe(body);
        expect(makeService().inject(body)).toBe(body);
    });

    it.each(['json', 'v2ray-json'] as const)(
        'routes clientType "%s" to the xray injector (array of profiles)',
        (clientType) => {
            const body = [{ remarks: 'Real', outbounds: [] }];

            const out = makeService().inject(body, clientType) as { remarks: string }[];

            expect(out).toHaveLength(2);
            expect(out[0].remarks).toBe('EXPIRED');
        },
    );

    it('sniffs the body when clientType is absent (xray JSON -> xray injector)', () => {
        const body = JSON.stringify([{ remarks: 'Real', outbounds: [] }]);

        const out = makeService().inject(body) as string;

        const parsed = JSON.parse(out) as { remarks: string }[];
        expect(parsed[0].remarks).toBe('EXPIRED');
    });

    it('passes a raw base64 link list through untouched (unsupported format)', () => {
        const body = Buffer.from('vless://real@host:443#A', 'utf8').toString('base64');

        expect(makeService().inject(body)).toBe(body);
    });

    it('passes the body through when the resolved format has no snippet', () => {
        const service = makeService({ EXPIRED_SUB_INJECT_CLASH: undefined });

        expect(service.inject(CLASH_BODY, 'clash')).toBe(CLASH_BODY);
    });

    it('passes an unrecognisable body through when sniffing fails', () => {
        const service = makeService();

        expect(service.inject('plain text without links')).toBe('plain text without links');
        expect(service.inject(42)).toBe(42);
    });

    it('never throws on a malformed snippet — returns the body untouched', () => {
        const service = makeService({ EXPIRED_SUB_INJECT_XRAY: '{not-json' });
        const body = JSON.stringify({ outbounds: [{ protocol: 'vless', tag: 'Real' }] });

        expect(service.inject(body, 'json')).toBe(body);
    });

    it('applies EXPIRED_SUB_INJECT_CLASH_RULES to the clash rules section', () => {
        const service = makeService({
            EXPIRED_SUB_INJECT_CLASH_RULES: '["GEOSITE,telegram,EXPIRED","MATCH,DIRECT"]',
        });

        const out = service.inject(CLASH_BODY, 'clash');

        const doc = load(out as string) as { rules: string[] };
        expect(doc.rules).toEqual(['GEOSITE,telegram,EXPIRED', 'MATCH,DIRECT']);
    });
});

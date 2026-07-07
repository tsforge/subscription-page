import { describe, expect, it } from 'vitest';
import { dump, load } from 'js-yaml';

import { detectResponseFormat, injectClash, injectXray } from '@modules/injector/utils';

interface ClashDoc {
    proxies: { name: string }[];
    'proxy-groups': { proxies: string[] }[];
}

interface XrayDoc {
    outbounds: { protocol?: string; tag?: string }[];
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

describe('injectClash', () => {
    const body = dump({
        proxies: [{ name: 'Real', type: 'vless', server: 'host', port: 443 }],
        'proxy-groups': [{ name: 'Auto', type: 'select', proxies: ['Real'] }],
    });
    const snippet = dump({ name: '⚠️ EXPIRED', type: 'vless', server: 'notice', port: 443 });

    it('prepends the proxy and wires it into every group', () => {
        const out = load(injectClash(body, snippet, 'prepend')) as ClashDoc;

        expect(out.proxies[0].name).toBe('⚠️ EXPIRED');
        expect(out.proxies.map((p) => p.name)).toContain('Real');
        expect(out['proxy-groups'][0].proxies).toEqual(['⚠️ EXPIRED', 'Real']);
    });

    it('replaces proxies and points groups only at the notice', () => {
        const out = load(injectClash(body, snippet, 'replace')) as ClashDoc;

        expect(out.proxies).toHaveLength(1);
        expect(out['proxy-groups'][0].proxies).toEqual(['⚠️ EXPIRED']);
    });
});

describe('injectClash — routing rules override', () => {
    // Clash `rules:` are a global section, so shipping routing alongside the notice
    // node is only possible by replacing that section with env-provided rules.
    const bodyWithRules = dump({
        proxies: [{ name: 'Real', type: 'vless', server: 'host', port: 443 }],
        'proxy-groups': [{ name: 'Auto', type: 'select', proxies: ['Real'] }],
        rules: ['GEOSITE,category-ru,DIRECT', 'MATCH,Auto'],
    });
    const snippet = dump({ name: '⚠️ EXPIRED', type: 'vless', server: 'notice', port: 443 });
    const telegramRules =
        '["GEOSITE,telegram,⚠️ EXPIRED","GEOIP,telegram,⚠️ EXPIRED,no-resolve","MATCH,DIRECT"]';

    it('replaces the global rules with the env-provided ones', () => {
        const out = load(injectClash(bodyWithRules, snippet, 'replace', telegramRules)) as {
            rules: string[];
        };

        expect(out.rules).toEqual([
            'GEOSITE,telegram,⚠️ EXPIRED',
            'GEOIP,telegram,⚠️ EXPIRED,no-resolve',
            'MATCH,DIRECT',
        ]);
    });

    it('keeps the original rules when no rules snippet is given', () => {
        const out = load(injectClash(bodyWithRules, snippet, 'prepend')) as { rules: string[] };

        expect(out.rules).toEqual(['GEOSITE,category-ru,DIRECT', 'MATCH,Auto']);
    });

    it('ignores a malformed rules snippet but still injects the proxy', () => {
        const garbage = ['not-an-array', '{"a":1}', '["ok", 42]'];

        for (const rules of garbage) {
            const out = load(injectClash(bodyWithRules, snippet, 'prepend', rules)) as {
                rules: string[];
            } & ClashDoc;

            expect(out.rules).toEqual(['GEOSITE,category-ru,DIRECT', 'MATCH,Auto']);
            expect(out.proxies[0].name).toBe('⚠️ EXPIRED');
        }
    });
});

describe('injectXray', () => {
    const doc: XrayDoc = {
        outbounds: [
            { protocol: 'vless', tag: 'proxy' },
            { protocol: 'freedom', tag: 'direct' },
            { protocol: 'blackhole', tag: 'block' },
        ],
    };
    const snippet = JSON.stringify({ protocol: 'vless', tag: '⚠️ EXPIRED' });

    it('prepends the notice so it becomes the default outbound', () => {
        const out = injectXray(structuredClone(doc), snippet, 'prepend') as XrayDoc;

        expect(out.outbounds[0].tag).toBe('⚠️ EXPIRED');
        expect(out.outbounds).toHaveLength(4);
    });

    it('replace keeps only infra outbounds plus the notice', () => {
        const out = injectXray(structuredClone(doc), snippet, 'replace') as XrayDoc;

        expect(out.outbounds.map((o) => o.protocol)).toEqual(['vless', 'freedom', 'blackhole']);
        expect(out.outbounds.some((o) => o.tag === 'proxy')).toBe(false);
    });
});

describe('injectXray — array-of-profiles shape (Happ / v2rayNG)', () => {
    // Each array element is a full config profile shown as a separate server.
    const profiles = [{ remarks: 'Real Server', outbounds: [{ protocol: 'vless', tag: 'proxy' }] }];
    const snippet = JSON.stringify({
        remarks: '🚨 EXPIRED',
        outbounds: [{ protocol: 'vless', tag: 'proxy' }],
    });

    it('prepends the notice profile as the first array element', () => {
        const out = injectXray(structuredClone(profiles), snippet, 'prepend') as {
            remarks: string;
        }[];

        expect(out).toHaveLength(2);
        expect(out[0].remarks).toBe('🚨 EXPIRED');
        expect(out[1].remarks).toBe('Real Server');
    });

    it('replace leaves only the notice profile', () => {
        const out = injectXray(structuredClone(profiles), snippet, 'replace') as {
            remarks: string;
        }[];

        expect(out).toHaveLength(1);
        expect(out[0].remarks).toBe('🚨 EXPIRED');
    });

    it('returns a JSON string when given a string array body', () => {
        const out = injectXray(JSON.stringify(profiles), snippet, 'prepend');

        expect(typeof out).toBe('string');
        const parsed = JSON.parse(out as string) as { remarks: string }[];
        expect(parsed[0].remarks).toBe('🚨 EXPIRED');
    });
});

describe('detectResponseFormat (UA-driven, no clientType in URL)', () => {
    it('returns null for link lists (raw is unsupported) — base64 and plain text', () => {
        expect(detectResponseFormat(b64('vless://a@h:443#A\nvmess://b'))).toBeNull();
        expect(detectResponseFormat('trojan://x@h:443#A')).toBeNull();
    });

    it('detects a Clash/Mihomo/Stash YAML as clash', () => {
        const yaml = dump({ proxies: [{ name: 'A' }], 'proxy-groups': [{ name: 'G' }] });
        expect(detectResponseFormat(yaml)).toBe('clash');
    });

    it('returns null for sing-box JSON (unsupported, must not be mistaken for xray)', () => {
        const sb = { outbounds: [{ type: 'vless', tag: 'A' }], route: {} };
        expect(detectResponseFormat(JSON.stringify(sb))).toBeNull();
        expect(detectResponseFormat(sb)).toBeNull();

        const emptyOutbounds = { outbounds: [], route: {}, experimental: {} };
        expect(detectResponseFormat(emptyOutbounds)).toBeNull();
    });

    it('detects xray JSON (outbound.protocol) as xray', () => {
        const xray = { outbounds: [{ protocol: 'vless', tag: 'A' }], routing: {} };
        expect(detectResponseFormat(JSON.stringify(xray))).toBe('xray');
    });

    it('detects an array of xray profiles (Happ / v2rayNG) as xray — string and object', () => {
        const profiles = [{ remarks: 'A', outbounds: [{ protocol: 'vless' }] }];
        expect(detectResponseFormat(JSON.stringify(profiles))).toBe('xray');
        expect(detectResponseFormat(profiles)).toBe('xray');
    });

    it('returns null for unrecognisable bodies (skip injection)', () => {
        expect(detectResponseFormat('just some text without a scheme')).toBeNull();
        expect(detectResponseFormat(42)).toBeNull();
    });

    it('returns null for an empty profiles array (nothing to classify)', () => {
        expect(detectResponseFormat('[]')).toBeNull();
    });
});

describe('malformed input never breaks the subscription (body returned untouched)', () => {
    it('injectClash: snippet without a `name` / non-YAML snippet', () => {
        const body = dump({ proxies: [{ name: 'Real' }] });

        expect(injectClash(body, dump({ type: 'vless', server: 'n' }), 'prepend')).toBe(body);
        expect(injectClash(body, ':::not yaml:::', 'prepend')).toBe(body);
    });

    it('injectXray: malformed JSON snippet / non-JSON body', () => {
        const body = JSON.stringify([{ remarks: 'Real', outbounds: [] }]);

        expect(injectXray(body, '{not-json', 'prepend')).toBe(body);
        expect(injectXray('not json at all', '{"remarks":"X"}', 'prepend')).toBe('not json at all');
    });
});

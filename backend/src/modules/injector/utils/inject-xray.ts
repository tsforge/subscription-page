import { INJECT_MODES_CONFIG, TInjectMode, XRAY_PROTOCOL } from '@contract/constants';

import { parseJsonArrayOrObject, parseJsonObject, reserializeJsonBody } from './json';

interface XrayOutbound {
    protocol?: string;
    tag?: string;
    [key: string]: unknown;
}

// Xray/V2Ray route through the FIRST outbound by default and have no selector, so
// putting our node first makes it the active one. These non-proxy outbounds must
// survive a `replace` (freedom = direct egress, blackhole = drop, dns = dns).
const INFRA_PROTOCOLS: Set<string> = new Set(Object.values(XRAY_PROTOCOL));

/**
 * Xray (`json`) and V2Ray (`v2ray-json`) come in two shapes:
 *   1. An ARRAY of full config profiles (Happ, v2rayNG) — each element is a separate
 *      "server" in the client. Here the snippet is a whole profile object and we add
 *      it as an array element (prepend = first, replace = only it).
 *   2. A single `{ outbounds }` object where outbound order matters (first = default
 *      route). Here the snippet is one outbound.
 */
export function injectXray(body: unknown, snippet: string, mode: TInjectMode): unknown {
    const doc = parseJsonArrayOrObject(body);
    if (!doc) return body;

    const injected = parseJsonObject<Record<string, unknown>>(snippet);
    if (!injected) return body;

    if (Array.isArray(doc)) {
        const next = mode === INJECT_MODES_CONFIG.replace ? [injected] : [injected, ...doc];
        return reserializeJsonBody(body, next);
    }

    const outbounds: XrayOutbound[] = Array.isArray(doc.outbounds)
        ? (doc.outbounds as XrayOutbound[])
        : [];

    const kept =
        mode === INJECT_MODES_CONFIG.replace
            ? outbounds.filter((o) => o && INFRA_PROTOCOLS.has(o.protocol ?? ''))
            : outbounds;

    doc.outbounds = [injected, ...kept];

    return reserializeJsonBody(body, doc);
}

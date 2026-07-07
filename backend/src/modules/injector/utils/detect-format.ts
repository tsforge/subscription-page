import {
    INJECT_FORMAT_CONFIG,
    SINGBOX_MARKER_KEYS,
    TInjectFormat,
    XRAY_MARKER_KEYS,
} from '@contract/constants';

import { parseJsonArrayOrObject } from './json';

// Clash/Mihomo/Stash configs always carry these top-level keys.
const CLASH_MARKER = /^\s*(proxies|proxy-groups)\s*:/m;

/**
 * When a client omits the explicit `/:clientType`, the panel picks the config
 * format from the User-Agent, so the URL tells us nothing. We sniff the actual
 * response body — JSON shape for Xray (outbound `protocol`), YAML markers for
 * Clash — to route it to the right injector. Everything else (base64 link lists,
 * sing-box JSON, unknown shapes) returns null and passes through untouched.
 */
export function detectResponseFormat(body: unknown): TInjectFormat | null {
    const json = parseJsonArrayOrObject(body);
    if (json) {
        // An array of full config profiles is the Xray json / v2ray-json shape.
        if (Array.isArray(json)) return json.length ? INJECT_FORMAT_CONFIG.xray : null;
        return classifyJson(json);
    }

    if (typeof body === 'string' && CLASH_MARKER.test(body)) {
        return INJECT_FORMAT_CONFIG.clash;
    }

    return null;
}

function classifyJson(doc: Record<string, unknown>): TInjectFormat | null {
    const outbounds = Array.isArray(doc.outbounds) ? doc.outbounds : [];

    // sing-box (outbound `type`) is recognised only to be skipped, so its
    // configs are never misclassified as xray.
    const isSingbox = outbounds.some((o) => isObject(o) && typeof o.type === 'string');
    if (isSingbox) return null;

    const hasProtocol = outbounds.some((o) => isObject(o) && typeof o.protocol === 'string');
    if (hasProtocol) return INJECT_FORMAT_CONFIG.xray;

    // Empty outbounds: fall back to signature top-level keys.
    if (SINGBOX_MARKER_KEYS.some((key) => key in doc)) return null;
    if (XRAY_MARKER_KEYS.some((key) => key in doc)) return INJECT_FORMAT_CONFIG.xray;

    return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

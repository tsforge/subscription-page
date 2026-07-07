/**
 * The panel may hand us a subscription body either as a raw JSON string or as an
 * object already parsed by Axios. These helpers let the injector work on a safe
 * deep copy and then hand the body back in the very same shape it arrived in,
 * so the response `content-type` keeps matching the payload.
 */
export function reserializeJsonBody(original: unknown, doc: unknown): unknown {
    return typeof original === 'string' ? JSON.stringify(doc) : doc;
}

/**
 * Xray `json` / `v2ray-json` subscriptions are either an ARRAY of full config
 * profiles (each a separate server in the client) or a single `{ outbounds }`
 * object — this parses a safe deep copy of whichever shape arrives.
 */
export function parseJsonArrayOrObject(body: unknown): unknown[] | Record<string, unknown> | null {
    try {
        const value = typeof body === 'string' ? JSON.parse(body) : body;
        if (Array.isArray(value)) return JSON.parse(JSON.stringify(value)) as unknown[];
        if (isObject(value)) return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
        return null;
    } catch {
        return null;
    }
}

/**
 * Parses an env-provided JSON snippet (a single outbound) into an object, returning
 * null on malformed input or a non-object so the caller can bail out safely.
 */
export function parseJsonObject<T extends Record<string, unknown>>(snippet: string): T | null {
    try {
        const parsed: unknown = JSON.parse(snippet);
        return isObject(parsed) ? (parsed as T) : null;
    } catch {
        return null;
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

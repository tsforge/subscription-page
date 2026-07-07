import { dump, load } from 'js-yaml';

import { CLASH_KEY, INJECT_MODES_CONFIG, TInjectMode } from '@contract/constants';

interface ClashProxyGroup {
    proxies?: unknown[];
    use?: unknown[];
    [key: string]: unknown;
}

interface ClashDoc {
    proxies?: unknown[];
    'proxy-groups'?: unknown[];
    [key: string]: unknown;
}

/**
 * Clash/Mihomo/Stash configs are YAML with a `proxies:` list and `proxy-groups:`
 * that reference proxies by name. We add the snippet proxy and wire its name into
 * every group so the client actually surfaces it (a proxy absent from all groups
 * is invisible in the UI).
 *
 * `rulesSnippet` (optional) is a YAML/JSON array of Clash rule strings; when it
 * parses, it REPLACES the global `rules:` section so an expired user's routing is
 * deterministic (e.g. telegram -> notice proxy, MATCH -> DIRECT). Rules are global
 * in Clash, so this is the only way to ship routing alongside the injected node.
 */
export function injectClash(
    body: string,
    proxySnippet: string,
    mode: TInjectMode,
    rulesSnippet?: string,
): string {
    const doc = load(body) as ClashDoc | null;
    if (!doc || typeof doc !== 'object') return body;

    const proxy = load(proxySnippet) as { name?: unknown } | null;
    if (!proxy || typeof proxy !== 'object' || typeof proxy.name !== 'string') return body;

    const name = proxy.name;
    const existingProxies = Array.isArray(doc.proxies) ? doc.proxies : [];

    doc.proxies = mode === INJECT_MODES_CONFIG.replace ? [proxy] : [proxy, ...existingProxies];

    const groups = doc[CLASH_KEY.proxyGroups];
    if (Array.isArray(groups)) {
        doc[CLASH_KEY.proxyGroups] = groups.map((group) =>
            wireGroup(group as ClashProxyGroup, name, mode),
        );
    }

    if (rulesSnippet) {
        const rules = parseRules(rulesSnippet);
        if (rules) doc.rules = rules;
    }

    return dump(doc, { lineWidth: -1 });
}

// A valid rules snippet is an array of non-empty strings; anything else is ignored
// so a typo in env can never strip a user's routing.
function parseRules(snippet: string): null | string[] {
    try {
        const parsed = load(snippet);
        if (!Array.isArray(parsed)) return null;

        const rules = parsed.filter((rule): rule is string => typeof rule === 'string' && !!rule);
        return rules.length === parsed.length && rules.length > 0 ? rules : null;
    } catch {
        return null;
    }
}

function wireGroup(group: ClashProxyGroup, name: string, mode: TInjectMode): ClashProxyGroup {
    if (!group || typeof group !== 'object') return group;

    if (mode === INJECT_MODES_CONFIG.replace) {
        // Reference only the injected node and drop remote providers so nothing
        // else stays reachable while the subscription is expired.
        const rest = { ...group };
        delete rest.use;
        return { ...rest, proxies: [name] };
    }

    const groupProxies = Array.isArray(group.proxies) ? group.proxies : [];
    return { ...group, proxies: [name, ...groupProxies.filter((p) => p !== name)] };
}

/**
 * Vocabulary of the subscription config formats we inject into — kept in one place
 * so the injectors and the format sniffer never repeat raw literals.
 */

// xray/v2ray outbound `protocol` values that are infrastructure, not real proxies.
export const XRAY_PROTOCOL = {
    freedom: 'freedom',
    blackhole: 'blackhole',
    dns: 'dns',
} as const;

// Clash/Mihomo/Stash structural keys.
export const CLASH_KEY = {
    proxies: 'proxies',
    proxyGroups: 'proxy-groups',
} as const;

// Top-level keys that tell the two JSON formats apart when `outbounds` is empty
// (sing-box routing is `route`; Xray's is `routing`). Sing-box is detected only
// to be skipped — we don't inject into it, but it must not be mistaken for xray.
export const SINGBOX_MARKER_KEYS = ['route', 'experimental'] as const;
export const XRAY_MARKER_KEYS = ['routing', 'policy', 'stats'] as const;

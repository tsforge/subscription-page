export const CLIENT_TYPES_ARRAY = [
    'stash',
    'singbox',
    'mihomo',
    'json',
    'v2ray-json',
    'clash',
] as const;

export type TClient = (typeof CLIENT_TYPES_ARRAY)[number];

export const CLIENT_TYPES = {
    stash: 'stash',
    singbox: 'singbox',
    mihomo: 'mihomo',
    json: 'json',
    'v2ray-json': 'v2ray-json',
    clash: 'clash',
} as const satisfies Record<TClient, TClient>;

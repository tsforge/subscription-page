export const INJECT_FORMAT = ['clash', 'xray'] as const;

export type TInjectFormat = (typeof INJECT_FORMAT)[number];

export const INJECT_FORMAT_CONFIG = {
    clash: 'clash',
    xray: 'xray',
} as const satisfies Record<TInjectFormat, TInjectFormat>;

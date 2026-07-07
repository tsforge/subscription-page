export const INJECT_MODES = ['prepend', 'replace'] as const;

export type TInjectMode = (typeof INJECT_MODES)[number];

export const INJECT_MODES_CONFIG = {
    prepend: 'prepend',
    replace: 'replace',
} as const satisfies Record<TInjectMode, TInjectMode>;

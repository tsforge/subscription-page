export const MARZBAN_RESOLVE_STATUS_VALUES = ['skip', 'reject', 'resolved'] as const;

export type TMarzbanResolveStatus = (typeof MARZBAN_RESOLVE_STATUS_VALUES)[number];

export const MARZBAN_RESOLVE_STATUS: Record<TMarzbanResolveStatus, TMarzbanResolveStatus> = {
    skip: 'skip',
    resolved: 'resolved',
    reject: 'reject',
};

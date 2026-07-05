import { z } from 'zod';

export namespace CheckSubCommand {
    export const CLIENT_TYPES = [
        'stash',
        'singbox',
        'mihomo',
        'json',
        'v2ray-json',
        'clash',
    ] as const;

    export type TClient = (typeof CLIENT_TYPES)[number];

    export const RequestParamSchema = z.object({
        shortUuid: z.string().min(16, 'shortUuid is required').max(16, 'shortUuid is required'),
        clientType: z.optional(z.enum(CLIENT_TYPES)),
    });

    export type RequestParam = z.infer<typeof RequestParamSchema>;
}

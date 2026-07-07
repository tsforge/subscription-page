import { z } from 'zod';

import { CLIENT_TYPES_ARRAY } from '../../constants';

export namespace CheckSubCommand {
    // Remnawave shortUuid is a 16-char nanoid (url-safe alphabet).
    export const SHORT_UUID_REGEX = /^[A-Za-z0-9_-]{16}$/;

    // Marzban legacy links carry a longer token in the same path segment:
    // base64url (secret-key scheme) or a JWT (dot-separated). Length is capped
    // so arbitrary garbage never flows through to the panel.
    export const MARZBAN_LEGACY_TOKEN_REGEX = /^[A-Za-z0-9_=.-]{17,2048}$/;

    export const RequestParamSchema = z.object({
        shortUuid: z
            .string()
            .refine(
                (value) => SHORT_UUID_REGEX.test(value) || MARZBAN_LEGACY_TOKEN_REGEX.test(value),
                'shortUuid must be a 16-char id or a Marzban legacy token',
            ),
        clientType: z.optional(z.enum(CLIENT_TYPES_ARRAY)),
    });

    export type RequestParam = z.infer<typeof RequestParamSchema>;
}

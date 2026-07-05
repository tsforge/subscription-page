import { TMarzbanResolveStatus } from '@contract/constants';

/**
 * Outcome of resolving an incoming subscription identifier through the
 * Marzban legacy-link decoder.
 *
 * - `skip`     — legacy links are disabled or the value is not a Marzban link;
 *                the caller keeps the original shortUuid.
 * - `reject`   — a valid Marzban link, but the user is missing or revoked;
 *                the caller must drop the request.
 * - `resolved` — decoded to a Remnawave user; `shortUuid` is set.
 */
export type TMarzbanResolveResult = {
    status: TMarzbanResolveStatus;
    shortUuid?: string;
};

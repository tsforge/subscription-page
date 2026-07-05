import { Request, Response } from 'express';

import { TRequestTemplateTypeKeys } from '@remnawave/backend-contract';

export interface IServeSubscriptionParams {
    clientIp: string;
    req: Request;
    res: Response;
    shortUuid: string;
    clientType?: TRequestTemplateTypeKeys;
}

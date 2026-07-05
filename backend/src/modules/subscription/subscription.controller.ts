import { Request, Response } from 'express';

import { Get, Controller, Res, Req, Param, Logger } from '@nestjs/common';

import { APP_CONFIG_ROUTE_WO_LEADING_PATH } from '@remnawave/subscription-page-types';
import { REQUEST_TEMPLATE_TYPE_VALUES } from '@remnawave/backend-contract';

import { GetJWTPayload } from '@common/decorators/get-jwt-payload';
import { ClientIp } from '@common/decorators/get-ip';
import { IJwtPayload } from '@common/constants';

import { CheckSubParamDto } from '@modules/subscription/dtos';

import { SubpageConfigService } from './subpage-config.service';
import { SubscriptionService } from './subscription.service';

@Controller()
export class SubscriptionController {
    private readonly logger = new Logger(SubscriptionController.name);

    constructor(
        private readonly subscriptionService: SubscriptionService,
        private readonly subpageConfigService: SubpageConfigService,
    ) {}

    @Get(APP_CONFIG_ROUTE_WO_LEADING_PATH)
    async getSubscriptionPageConfig(@GetJWTPayload() user: IJwtPayload, @Req() request: Request) {
        return await this.subpageConfigService.getSubscriptionPageConfig(user.su, request);
    }

    @Get([':shortUuid', ':shortUuid/:clientType'])
    async root(
        @ClientIp() clientIp: string,
        @Req() request: Request,
        @Res() response: Response,
        @Param() params: CheckSubParamDto,
    ) {
        const { shortUuid, clientType } = params;
        if (request.path.startsWith('/assets') || request.path.startsWith('/locales')) {
            response.socket?.destroy();
            return;
        }

        if (!clientType) {
            return this.subscriptionService.serveSubscriptionPage({
                clientIp,
                req: request,
                res: response,
                shortUuid,
            });
        }

        if (!REQUEST_TEMPLATE_TYPE_VALUES.includes(clientType)) {
            this.logger.error(`Invalid client type: ${clientType}`);
            response.socket?.destroy();
            return;
        }

        return this.subscriptionService.serveSubscriptionPage({
            clientIp,
            req: request,
            res: response,
            shortUuid,
            clientType,
        });
    }
}

import { Request, Response } from 'express';
import { nanoid } from 'nanoid';

import { MARZBAN_RESOLVE_STATUS } from '@contract/constants';

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

import { AxiosService } from '@common/axios/axios.service';
import { IGNORED_HEADERS } from '@common/constants';

import { MarzbanSubscriptionService } from '@modules/marzban/marzban-subscription.service';
import { SubscriptionInjectorService } from '@modules/injector';

import { SubpageConfigService } from './subpage-config.service';
import { IServeSubscriptionParams } from './interfaces';

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly axiosService: AxiosService,
        private readonly subpageConfigService: SubpageConfigService,
        private readonly marzbanSubscriptionService: MarzbanSubscriptionService,
        private readonly subscriptionInjectorService: SubscriptionInjectorService,
    ) {}

    public async serveSubscriptionPage(params: IServeSubscriptionParams): Promise<void> {
        const { clientIp, req, res, shortUuid, clientType } = params;

        try {
            const userAgent = req.headers['user-agent'];
            let shortUuidLocal = shortUuid;

            if (this.isGenericPath(req.path)) {
                res.socket?.destroy();
                return;
            }

            const marzbanResult = await this.marzbanSubscriptionService.resolveShortUuid(
                clientIp,
                shortUuid,
            );

            if (marzbanResult.status === MARZBAN_RESOLVE_STATUS.reject) {
                res.socket?.destroy();
                return;
            }

            if (
                marzbanResult.status === MARZBAN_RESOLVE_STATUS.resolved &&
                marzbanResult.shortUuid
            ) {
                shortUuidLocal = marzbanResult.shortUuid;
            }

            if (userAgent && this.isBrowser(userAgent)) {
                return this.returnWebpage(clientIp, req, res, shortUuidLocal);
            }

            const subscriptionDataResponse = await this.axiosService.getSubscription(
                clientIp,
                shortUuidLocal,
                req.headers,
                !!clientType,
                clientType,
            );

            if (!subscriptionDataResponse) {
                res.socket?.destroy();
                return;
            }

            const debugBody = subscriptionDataResponse.response;
            const debugHeaders = subscriptionDataResponse.headers as Record<string, unknown>;
            this.logger.debug(
                `subscription body ` +
                    `[content-type=${debugHeaders['content-type']}] ` +
                    `[userinfo=${debugHeaders['subscription-userinfo']}]\n` +
                    (typeof debugBody === 'string'
                        ? debugBody
                        : JSON.stringify(debugBody, null, 2)),
            );

            const isExpire = this.isSubscriptionExpired(subscriptionDataResponse.headers);
            this.logger.debug(
                `Subscription ${shortUuidLocal} (clientType=${clientType ?? 'raw'}) isExpire=${isExpire}`,
            );

            let responseBody = subscriptionDataResponse.response;

            if (isExpire && this.subscriptionInjectorService.isEnabled()) {
                responseBody = this.subscriptionInjectorService.inject(responseBody, clientType);
            }

            if (subscriptionDataResponse.headers) {
                Object.entries(subscriptionDataResponse.headers)
                    .filter(([key]) => !IGNORED_HEADERS.has(key.toLowerCase()))
                    .forEach(([key, value]) => {
                        res.setHeader(key, value);
                    });
            }
            res.status(200).send(responseBody);
            return;
        } catch (error) {
            this.logger.error('Error in serveSubscriptionPage', error);

            res.socket?.destroy();
            return;
        }
    }

    private isSubscriptionExpired(headers: unknown): boolean {
        const userInfo = (headers as Record<string, unknown> | null | undefined)?.[
            'subscription-userinfo'
        ];

        if (!userInfo) return false;

        const match = /expire=(\d+)/.exec(String(userInfo));
        if (!match) return false;

        const expireSeconds = Number(match[1]);
        if (!Number.isFinite(expireSeconds) || expireSeconds <= 0) return false;

        return expireSeconds * 1000 < Date.now();
    }

    private generateJwtForCookie(uuid: string | null): string {
        return this.jwtService.sign(
            {
                sessionId: nanoid(32),
                su: this.subpageConfigService.getEncryptedSubpageConfigUuid(uuid),
            },
            {
                expiresIn: '33m',
            },
        );
    }

    private isBrowser(userAgent: string): boolean {
        const browserKeywords = [
            'Mozilla',
            'Chrome',
            'Safari',
            'Firefox',
            'Opera',
            'Edge',
            'TelegramBot',
            'WhatsApp',
        ];

        return browserKeywords.some((keyword) => userAgent.includes(keyword));
    }

    private isGenericPath(path: string): boolean {
        const genericPaths = [
            'favicon.ico',
            'robots.txt',
            '.png',
            '.jpg',
            '.jpeg',
            '.gif',
            '.svg',
            '.webp',
            '.ico',
        ];

        return genericPaths.some((genericPath) => path.includes(genericPath));
    }

    private async returnWebpage(
        clientIp: string,
        req: Request,
        res: Response,
        shortUuid: string,
    ): Promise<void> {
        try {
            const subscriptionDataResponse = await this.axiosService.getSubscriptionInfo(
                clientIp,
                shortUuid,
            );

            if (!subscriptionDataResponse.isOk || !subscriptionDataResponse.response) {
                res.socket?.destroy();
                return;
            }

            const subpageConfigResponse = await this.axiosService.getSubpageConfig(
                shortUuid,
                req.headers,
            );

            if (!subpageConfigResponse.isOk || !subpageConfigResponse.response) {
                res.socket?.destroy();
                return;
            }

            const subpageConfig = subpageConfigResponse.response;

            if (!subpageConfig.webpageAllowed) {
                this.logger.log(`Webpage access is not allowed by Remnawave's SRR.`);
                res.socket?.destroy();
                return;
            }

            const baseSettings = this.subpageConfigService.getBaseSettings(
                subpageConfig.subpageConfigUuid,
            );

            const subscriptionData = subscriptionDataResponse.response;

            if (!baseSettings.showConnectionKeys) {
                subscriptionData.response.links = [];
                subscriptionData.response.ssConfLinks = {};
            }

            res.cookie('session', this.generateJwtForCookie(subpageConfig.subpageConfigUuid), {
                httpOnly: true,
                secure: true,
                maxAge: 1_800_000, // 30 minutes
            });

            res.render('index', {
                metaTitle: baseSettings.metaTitle,
                metaDescription: baseSettings.metaDescription,
                panelData: Buffer.from(JSON.stringify(subscriptionData)).toString('base64'),
            });
        } catch (error) {
            this.logger.error(`Error in returnWebpage: ${error}`);

            res.socket?.destroy();
            return;
        }
    }
}

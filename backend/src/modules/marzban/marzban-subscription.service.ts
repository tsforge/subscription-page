import { createHash } from 'node:crypto';

import { MARZBAN_JWT, MARZBAN_RESOLVE_STATUS } from '@contract/constants';

import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { TypedConfigService } from '@common/config/app-config';
import { AxiosService } from '@common/axios/axios.service';
import { sanitizeUsername } from '@common/utils';

import { TMarzbanResolveResult } from './interfaces';

@Injectable()
export class MarzbanSubscriptionService {
    private readonly logger = new Logger(MarzbanSubscriptionService.name);

    private readonly isLegacyLinkEnabled: boolean;
    private readonly dropRevokedSubscriptions: boolean;
    private readonly secretKeys: string[];

    constructor(
        private readonly configService: TypedConfigService,
        private readonly jwtService: JwtService,
        private readonly axiosService: AxiosService,
    ) {
        this.isLegacyLinkEnabled = this.configService.getOrThrow('MARZBAN_LEGACY_LINK_ENABLED');
        this.dropRevokedSubscriptions = this.configService.getOrThrow(
            'MARZBAN_LEGACY_DROP_REVOKED_SUBSCRIPTIONS',
        );

        const secretKeys = this.configService.get('MARZBAN_LEGACY_SECRET_KEY');

        if (secretKeys && secretKeys.length > 0) {
            this.secretKeys = secretKeys.split(',').map((key) => key.trim());
        } else {
            this.secretKeys = [];
        }
    }

    public async resolveShortUuid(
        clientIp: string,
        shortUuid: string,
    ): Promise<TMarzbanResolveResult> {
        if (!this.isLegacyLinkEnabled) {
            return { status: MARZBAN_RESOLVE_STATUS.skip };
        }

        const decoded = await this.tryDecodeMarzbanLink(shortUuid);
        if (!decoded) {
            return { status: MARZBAN_RESOLVE_STATUS.skip };
        }

        const sanitizedUsername = sanitizeUsername(decoded.username);

        this.logger.log(
            `Decoded Marzban username: ${decoded.username}, sanitized username: ${sanitizedUsername}`,
        );

        const userInfo = await this.axiosService.getUserByUsername(clientIp, sanitizedUsername);

        if (!userInfo.isOk || !userInfo.response) {
            this.logger.error(
                `Decoded Marzban username is not found in Remnawave, decoded username: ${sanitizedUsername}`,
            );

            return { status: MARZBAN_RESOLVE_STATUS.reject };
        }

        if (this.dropRevokedSubscriptions && userInfo.response.response.subRevokedAt !== null) {
            return { status: MARZBAN_RESOLVE_STATUS.reject };
        }

        return {
            status: MARZBAN_RESOLVE_STATUS.resolved,
            shortUuid: userInfo.response.response.shortUuid,
        };
    }

    private async tryDecodeMarzbanLink(shortUuid: string): Promise<{
        username: string;
        createdAt: Date;
    } | null> {
        if (!this.secretKeys.length) return null;

        const token = shortUuid;
        this.logger.debug(`Verifying token: ${token}`);

        if (!token || token.length < 10) {
            this.logger.debug(`Token too short: ${token}`);
            return null;
        }

        for (const key of this.secretKeys) {
            const result = await this.decodeMarzbanLink(shortUuid, key);
            if (result) return result;

            this.logger.debug(`Decoding Marzban link failed with key: ${key}`);
        }

        this.logger.debug(`Decoding Marzban link failed with all keys`);

        return null;
    }

    private async decodeMarzbanLink(
        token: string,
        marzbanSecretKey: string,
    ): Promise<{
        username: string;
        createdAt: Date;
    } | null> {
        if (token.split(MARZBAN_JWT.SEPARATOR).length === MARZBAN_JWT.PARTS_COUNT) {
            try {
                const payload = await this.jwtService.verifyAsync(token, {
                    secret: marzbanSecretKey,
                    algorithms: ['HS256'],
                });

                if (payload.access !== MARZBAN_JWT.SUBSCRIPTION_ACCESS) {
                    throw new Error('JWT access field is not subscription');
                }

                const jwtCreatedAt = new Date(payload.iat * 1000);

                if (!this.checkSubscriptionValidity(jwtCreatedAt, payload.sub)) {
                    return null;
                }

                this.logger.debug(`JWT verified successfully, ${JSON.stringify(payload)}`);

                return {
                    username: payload.sub,
                    createdAt: jwtCreatedAt,
                };
            } catch (err) {
                this.logger.debug(`JWT verification failed: ${err}`);
            }
        }

        const uToken = token.slice(0, token.length - 10);
        const uSignature = token.slice(token.length - 10);

        this.logger.debug(`Token parts: base: ${uToken}, signature: ${uSignature}`);

        let decoded: string;
        try {
            decoded = Buffer.from(uToken, 'base64url').toString();
        } catch (err) {
            this.logger.debug(`Base64 decode error: ${err}`);
            return null;
        }

        const hash = createHash('sha256');
        hash.update(uToken + marzbanSecretKey);
        const digest = hash.digest();

        const expectedSignature = Buffer.from(digest).toString('base64url').slice(0, 10);

        this.logger.debug(`Expected signature: ${expectedSignature}, actual: ${uSignature}`);

        if (uSignature !== expectedSignature) {
            this.logger.debug('Signature mismatch');
            return null;
        }

        const parts = decoded.split(',');
        if (parts.length < 2) {
            this.logger.debug(`Invalid token format: ${decoded}`);
            return null;
        }

        const username = parts[0];
        const createdAtInt = parseInt(parts[1], 10);

        if (isNaN(createdAtInt)) {
            this.logger.debug(`Invalid created_at timestamp: ${parts[1]}`);
            return null;
        }

        const createdAt = new Date(createdAtInt * 1000);

        if (!this.checkSubscriptionValidity(createdAt, username)) {
            return null;
        }

        this.logger.debug(`Token decoded. Username: ${username}, createdAt: ${createdAt}`);

        return {
            username,
            createdAt,
        };
    }

    private checkSubscriptionValidity(createdAt: Date, username: string): boolean {
        const validFrom = this.configService.get('MARZBAN_LEGACY_SUBSCRIPTION_VALID_FROM');

        if (!validFrom) {
            return true;
        }

        const validFromDate = new Date(validFrom);
        if (createdAt < validFromDate) {
            this.logger.debug(
                `createdAt JWT: ${createdAt.toISOString()} is before validFrom: ${validFromDate.toISOString()}`,
            );

            this.logger.warn(
                `${JSON.stringify({ username, createdAt })} – subscription createdAt is before validFrom`,
            );

            return false;
        }

        return true;
    }
}

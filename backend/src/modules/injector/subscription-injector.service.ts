import {
    CLIENT_TYPES,
    INJECT_FORMAT_CONFIG,
    TClient,
    TInjectFormat,
    TInjectMode,
} from '@contract/constants';

import { Injectable, Logger } from '@nestjs/common';

import { TypedConfigService } from '@common/config/app-config';
import { assertNever } from '@common/utils';

import { detectResponseFormat, injectClash, injectXray } from './utils';

@Injectable()
export class SubscriptionInjectorService {
    private readonly logger = new Logger(SubscriptionInjectorService.name);

    private readonly enabled: boolean;
    private readonly mode: TInjectMode;
    private readonly snippets: Record<TInjectFormat, string | undefined>;
    private readonly clashRules: string | undefined;

    constructor(private readonly configService: TypedConfigService) {
        this.enabled = this.configService.getOrThrow('EXPIRED_SUB_INJECT_ENABLED');
        this.mode = this.configService.getOrThrow('EXPIRED_SUB_INJECT_MODE');
        this.snippets = {
            clash: this.configService.get('EXPIRED_SUB_INJECT_CLASH'),
            xray: this.configService.get('EXPIRED_SUB_INJECT_XRAY'),
        };
        this.clashRules = this.configService.get('EXPIRED_SUB_INJECT_CLASH_RULES');
    }

    public isEnabled(): boolean {
        return this.enabled;
    }

    public inject(body: unknown, clientType?: TClient): unknown {
        if (!this.enabled) return body;

        const format = this.resolveFormat(body, clientType);
        if (!format) return body;

        const snippet = this.snippets[format];
        if (!snippet) return body;

        try {
            switch (format) {
                case INJECT_FORMAT_CONFIG.clash:
                    return typeof body === 'string'
                        ? injectClash(body, snippet, this.mode, this.clashRules)
                        : body;
                case INJECT_FORMAT_CONFIG.xray:
                    return injectXray(body, snippet, this.mode);
                default:
                    return assertNever(format);
            }
        } catch (error) {
            this.logger.error(`Failed to inject expired server (format=${format}): ${error}`);
            return body;
        }
    }

    /**
     * With an explicit `/:clientType` the format is known; otherwise the panel chose
     * it from the User-Agent (SRR rules), so we sniff the response body instead.
     */
    private resolveFormat(body: unknown, clientType?: TClient): TInjectFormat | null {
        if (!clientType) return detectResponseFormat(body);

        switch (clientType) {
            case CLIENT_TYPES.clash:
            case CLIENT_TYPES.mihomo:
            case CLIENT_TYPES.stash:
                return INJECT_FORMAT_CONFIG.clash;
            case CLIENT_TYPES.json:
            case CLIENT_TYPES['v2ray-json']:
                return INJECT_FORMAT_CONFIG.xray;
            // sing-box has no snippet env anymore — pass its configs through.
            case CLIENT_TYPES.singbox:
                return null;
            default:
                return assertNever(clientType);
        }
    }
}

import { Global, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ConfigSchema } from '@common/config/app-config';

@Global()
@Injectable()
export class TypedConfigService {
    constructor(private readonly config: ConfigService<ConfigSchema, true>) {}

    public get<K extends keyof ConfigSchema>(key: K) {
        return this.config.get(key, { infer: true });
    }

    public getOrThrow<K extends keyof ConfigSchema>(key: K) {
        return this.config.getOrThrow(key, { infer: true });
    }
}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { getJWTConfig } from '@common/config/jwt/jwt.config';

import { MarzbanSubscriptionService } from './marzban-subscription.service';

@Module({
    imports: [JwtModule.registerAsync(getJWTConfig())],
    providers: [MarzbanSubscriptionService],
    exports: [MarzbanSubscriptionService],
})
export class MarzbanModule {}

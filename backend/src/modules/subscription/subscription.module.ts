import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { getJWTConfig } from '@common/config/jwt/jwt.config';

import { MarzbanModule } from '@modules/marzban/marzban.module';

import { SubscriptionController } from './subscription.controller';
import { SubpageConfigService } from './subpage-config.service';
import { SubscriptionService } from './subscription.service';

@Module({
    imports: [JwtModule.registerAsync(getJWTConfig()), MarzbanModule],
    controllers: [SubscriptionController],
    providers: [SubscriptionService, SubpageConfigService],
})
export class SubscriptionModule {}

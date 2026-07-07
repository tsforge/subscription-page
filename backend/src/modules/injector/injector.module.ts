import { Module } from '@nestjs/common';

import { SubscriptionInjectorService } from './subscription-injector.service';

@Module({
    providers: [SubscriptionInjectorService],
    exports: [SubscriptionInjectorService],
})
export class InjectorModule {}

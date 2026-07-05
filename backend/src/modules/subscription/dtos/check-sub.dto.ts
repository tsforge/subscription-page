import { createZodDto } from 'nestjs-zod';

import { CheckSubCommand } from '@contract/commands';

export class CheckSubParamDto extends createZodDto(CheckSubCommand.RequestParamSchema) {}

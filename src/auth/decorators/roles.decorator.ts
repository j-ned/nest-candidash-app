import { Reflector } from '@nestjs/core';
import type { Role } from '../../db/schema';

export const Roles = Reflector.createDecorator<Role[]>();

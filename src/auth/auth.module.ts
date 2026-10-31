import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TotpController } from './totp.controller';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { VerificationService } from './services/verification.service';
import { PendingUserService } from './services/pending-user.service';
import { TotpService } from './services/totp.service';
import { TotpCryptoService } from './services/totp-crypto.service';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    ConfigModule,
    MailModule,
    forwardRef(() => UsersModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      global: true,
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  controllers: [AuthController, TotpController],
  providers: [
    AuthService,
    JwtAuthGuard,
    VerificationService,
    PendingUserService,
    TotpService,
    TotpCryptoService,
  ],
  exports: [AuthService, JwtAuthGuard, VerificationService, PendingUserService],
})
export class AuthModule {}

import { Injectable } from '@nestjs/common';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { TotpCryptoService } from './totp-crypto.service';

export interface TotpSetupResult {
  secret: string;
  encryptedSecret: string;
  qrCodeDataUri: string;
  otpauthUri: string;
}

@Injectable()
export class TotpService {
  constructor(private readonly cryptoService: TotpCryptoService) {}

  async generateSetup(email: string): Promise<TotpSetupResult> {
    const secret = new OTPAuth.Secret({ size: 20 });

    const totp = new OTPAuth.TOTP({
      issuer: 'CandiDash',
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const otpauthUri = totp.toString();
    const qrCodeDataUri = await QRCode.toDataURL(otpauthUri);
    const encryptedSecret = this.cryptoService.encrypt(secret.base32);

    return {
      secret: secret.base32,
      encryptedSecret,
      qrCodeDataUri,
      otpauthUri,
    };
  }

  verifyToken(encryptedSecret: string, token: string): boolean {
    const secretBase32 = this.cryptoService.decrypt(encryptedSecret);
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secretBase32),
    });

    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
  }

  generateRecoveryCodes(count: number = 8): string[] {
    return Array.from({ length: count }, () => {
      const bytes = crypto.randomBytes(6);
      const hex = bytes.toString('hex');
      return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
    });
  }

  async hashRecoveryCodes(codes: string[]): Promise<string[]> {
    return Promise.all(codes.map((code) => bcrypt.hash(code, 10)));
  }

  async verifyRecoveryCode(
    code: string,
    hashedCodes: string[],
  ): Promise<number> {
    for (let i = 0; i < hashedCodes.length; i++) {
      const match = await bcrypt.compare(code, hashedCodes[i]);
      if (match) return i;
    }
    return -1;
  }
}

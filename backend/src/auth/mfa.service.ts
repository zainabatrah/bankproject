import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';

import {
  generateSecret,
  generateURI,
  verify,
} from 'otplib';

import * as QRCode from 'qrcode';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly configService:
      ConfigService,
  ) {}

  // ==========================================
  // GET ENCRYPTION KEY
  // ==========================================

  private getEncryptionKey(): Buffer {
    const keyHex =
      this.configService
        .getOrThrow<string>(
          'MFA_ENCRYPTION_KEY',
        );

    if (
      !/^[0-9a-fA-F]{64}$/.test(
        keyHex,
      )
    ) {
      throw new InternalServerErrorException(
        'MFA_ENCRYPTION_KEY must be exactly 64 hexadecimal characters',
      );
    }

    return Buffer.from(
      keyHex,
      'hex',
    );
  }

  // ==========================================
  // ENCRYPT MFA SECRET
  // AES-256-GCM
  // ==========================================

  private encryptSecret(
    secret: string,
  ): string {
    const key =
      this.getEncryptionKey();

    const iv =
      randomBytes(12);

    const cipher =
      createCipheriv(
        'aes-256-gcm',
        key,
        iv,
      );

    const encrypted =
      Buffer.concat([
        cipher.update(
          secret,
          'utf8',
        ),

        cipher.final(),
      ]);

    const authTag =
      cipher.getAuthTag();

    return [
      iv.toString('hex'),
      authTag.toString('hex'),
      encrypted.toString('hex'),
    ].join('.');
  }

  // ==========================================
  // DECRYPT MFA SECRET
  // ==========================================

  private decryptSecret(
    encryptedValue: string,
  ): string {
    try {
      const [
        ivHex,
        authTagHex,
        encryptedHex,
      ] =
        encryptedValue.split('.');

      if (
        !ivHex ||
        !authTagHex ||
        !encryptedHex
      ) {
        throw new Error(
          'Invalid encrypted format',
        );
      }

      const key =
        this.getEncryptionKey();

      const decipher =
        createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(
            ivHex,
            'hex',
          ),
        );

      decipher.setAuthTag(
        Buffer.from(
          authTagHex,
          'hex',
        ),
      );

      const decrypted =
        Buffer.concat([
          decipher.update(
            Buffer.from(
              encryptedHex,
              'hex',
            ),
          ),

          decipher.final(),
        ]);

      return decrypted.toString(
        'utf8',
      );
    } catch {
      throw new InternalServerErrorException(
        'Unable to decrypt MFA secret',
      );
    }
  }

  // ==========================================
  // START MFA SETUP
  // ==========================================

  async setup(
    userId: number,
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },

        select: {
          id: true,
          email: true,
          mfaEnabled: true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'User not found',
      );
    }

    if (user.mfaEnabled) {
      throw new BadRequestException(
        'MFA is already enabled',
      );
    }

    // ========================================
    // GENERATE TOTP SECRET
    // ========================================

    const secret =
      generateSecret();

    // ========================================
    // ENCRYPT BEFORE SAVING
    // ========================================

    const encryptedSecret =
      this.encryptSecret(
        secret,
      );

    await this.prisma.user.update({
      where: {
        id: userId,
      },

      data: {
        mfaSecretEncrypted:
          encryptedSecret,

        mfaEnabled:
          false,

        mfaVerifiedAt:
          null,
      },
    });

    // ========================================
    // GENERATE AUTHENTICATOR URI
    // ========================================

    const otpAuthUri =
      generateURI({
        issuer:
          'BankShield',

        label:
          user.email,

        secret,
      });

    // ========================================
    // GENERATE QR CODE
    // ========================================

    const qrCodeDataUrl =
      await QRCode.toDataURL(
        otpAuthUri,
      );

    return {
      message:
        'MFA setup started',

      manualEntryKey:
        secret,

      qrCodeDataUrl,

      instructions:
        'Add BankShield to your authenticator app, then verify a 6-digit code before MFA becomes active.',
    };
  }

  // ==========================================
  // VERIFY SETUP
  // ==========================================

  async verifySetup(
    userId: number,
    code: string,
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },

        select: {
          id: true,
          email: true,
          mfaEnabled: true,
          mfaSecretEncrypted:
            true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'User not found',
      );
    }

    if (user.mfaEnabled) {
      throw new BadRequestException(
        'MFA is already enabled',
      );
    }

    if (
      !user.mfaSecretEncrypted
    ) {
      throw new BadRequestException(
        'MFA setup has not been started',
      );
    }

    // ========================================
    // DECRYPT SECRET
    // ========================================

    const secret =
      this.decryptSecret(
        user.mfaSecretEncrypted,
      );

    // ========================================
    // VERIFY TOTP
    // ========================================

    const verification =
      await verify({
        secret,
        token: code,
      });

    if (!verification.valid) {
      throw new UnauthorizedException(
        'Invalid MFA code',
      );
    }

    // ========================================
    // ENABLE MFA
    // ========================================

    await this.prisma.$transaction(
      async (tx) => {
        await tx.user.update({
          where: {
            id: userId,
          },

          data: {
            mfaEnabled:
              true,

            mfaVerifiedAt:
              new Date(),
          },
        });

        await tx.securityEvent.create({
          data: {
            eventType:
              'MFA_ENABLED',

            description:
              'Multi-factor authentication was enabled',

            riskLevel:
              'LOW',

            userId,
          },
        });
      },
    );

    return {
      message:
        'MFA enabled successfully',

      mfaEnabled:
        true,
    };
  }

  // ==========================================
  // VERIFY CODE FOR FUTURE LOGIN
  // ==========================================

  async verifyUserCode(
    userId: number,
    code: string,
  ): Promise<boolean> {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },

        select: {
          mfaEnabled:
            true,

          mfaSecretEncrypted:
            true,
        },
      });

    if (
      !user ||
      !user.mfaEnabled ||
      !user.mfaSecretEncrypted
    ) {
      return false;
    }

    const secret =
      this.decryptSecret(
        user.mfaSecretEncrypted,
      );

    const result =
      await verify({
        secret,
        token: code,
      });

    return result.valid;
  }
}
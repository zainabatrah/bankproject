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
  createHash,
  randomBytes,
} from 'crypto';

import {
  generateSecret,
  generateURI,
  verify,
} from 'otplib';

import * as bcrypt from 'bcrypt';
import * as QRCode from 'qrcode';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // =========================================================
  // MFA ENCRYPTION KEY
  // =========================================================

  private getEncryptionKey(): Buffer {
    const keyHex =
      this.configService.getOrThrow<string>(
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

  // =========================================================
  // ENCRYPT MFA SECRET
  // =========================================================

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

  // =========================================================
  // DECRYPT MFA SECRET
  // =========================================================

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
          'Invalid encrypted MFA secret format',
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

  // =========================================================
  // RECOVERY CODE HELPERS
  // =========================================================

  private normalizeRecoveryCode(
    code: string,
  ): string {
    return code
      .replace(/-/g, '')
      .trim()
      .toUpperCase();
  }

  private hashRecoveryCode(
    code: string,
  ): string {
    const normalized =
      this.normalizeRecoveryCode(
        code,
      );

    return createHash('sha256')
      .update(normalized)
      .digest('hex');
  }

  private generateRecoveryCode(): string {
    const raw =
      randomBytes(10)
        .toString('hex')
        .toUpperCase();

    return [
      raw.slice(0, 5),
      raw.slice(5, 10),
      raw.slice(10, 15),
      raw.slice(15, 20),
    ].join('-');
  }

  private generateRecoveryCodeSet(
    count = 10,
  ): string[] {
    return Array.from(
      { length: count },
      () =>
        this.generateRecoveryCode(),
    );
  }

  // =========================================================
  // STEP 6
  // CREATE / REPLACE RECOVERY CODES
  // =========================================================

  private async replaceRecoveryCodes(
    userId: number,
  ): Promise<string[]> {
    const recoveryCodes =
      this.generateRecoveryCodeSet(
        10,
      );

    const rows =
      recoveryCodes.map(
        (recoveryCode) => ({
          userId,

          codeHash:
            this.hashRecoveryCode(
              recoveryCode,
            ),
        }),
      );

    await this.prisma.$transaction(
      async (tx) => {
        // Remove all old recovery codes.
        await tx.mfaRecoveryCode.deleteMany({
          where: {
            userId,
          },
        });

        // Store ONLY hashes.
        await tx.mfaRecoveryCode.createMany({
          data: rows,
        });
      },
    );

    // Plaintext recovery codes are returned
    // only to the user.
    return recoveryCodes;
  }

  // =========================================================
  // START MFA SETUP
  // POST /auth/mfa/setup
  // =========================================================

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

    const secret =
      generateSecret();

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

    const otpAuthUri =
      generateURI({
        issuer:
          'BankShield',

        label:
          user.email,

        secret,
      });

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

  // =========================================================
  // VERIFY MFA SETUP
  // =========================================================

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

    const secret =
      this.decryptSecret(
        user.mfaSecretEncrypted,
      );

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

    const recoveryCodes =
      this.generateRecoveryCodeSet(
        10,
      );

    const recoveryCodeRows =
      recoveryCodes.map(
        (recoveryCode) => ({
          userId,

          codeHash:
            this.hashRecoveryCode(
              recoveryCode,
            ),
        }),
      );

    // Everything is done atomically.
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

        await tx.mfaRecoveryCode.deleteMany({
          where: {
            userId,
          },
        });

        await tx.mfaRecoveryCode.createMany({
          data:
            recoveryCodeRows,
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

        await tx.auditLog.create({
          data: {
            userId,

            action:
              'MFA_ENABLED',

            resource:
              'AUTH',

            result:
              'SUCCESS',

            details:
              'User enabled multi-factor authentication and recovery codes were generated.',
          },
        });
      },
    );

    return {
      message:
        'MFA enabled successfully',

      mfaEnabled:
        true,

      recoveryCodes,

      warning:
        'Save these recovery codes now. They will not be shown again.',
    };
  }

  // =========================================================
  // VERIFY NORMAL MFA CODE
  // =========================================================

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

  // =========================================================
  // CONSUME ONE RECOVERY CODE
  // =========================================================

  async consumeRecoveryCode(
    userId: number,
    recoveryCode: string,
  ): Promise<boolean> {
    const codeHash =
      this.hashRecoveryCode(
        recoveryCode,
      );

    const storedCode =
      await this.prisma
        .mfaRecoveryCode
        .findUnique({
          where: {
            codeHash,
          },
        });

    if (!storedCode) {
      return false;
    }

    if (
      storedCode.userId !==
        userId
    ) {
      return false;
    }

    if (storedCode.usedAt) {
      return false;
    }

    // Atomic one-time-use protection.
    const result =
      await this.prisma
        .mfaRecoveryCode
        .updateMany({
          where: {
            id:
              storedCode.id,

            userId,

            usedAt:
              null,
          },

          data: {
            usedAt:
              new Date(),
          },
        });

    return result.count === 1;
  }

  // =========================================================
  // REGENERATE RECOVERY CODES
  // =========================================================

  async regenerateRecoveryCodes(
    userId: number,
    currentPassword: string,
    code: string,
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },

        select: {
          id: true,
          passwordHash: true,
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

    if (
      !user.mfaEnabled ||
      !user.mfaSecretEncrypted
    ) {
      throw new BadRequestException(
        'MFA is not enabled',
      );
    }

    const passwordValid =
      await bcrypt.compare(
        currentPassword,
        user.passwordHash,
      );

    if (!passwordValid) {
      await this.prisma.securityEvent.create({
        data: {
          eventType:
            'MFA_RECOVERY_CODES_REGEN_FAILED',

          description:
            'Failed attempt to regenerate MFA recovery codes',

          riskLevel:
            'MEDIUM',

          userId,
        },
      });

      throw new UnauthorizedException(
        'Invalid password or MFA code',
      );
    }

    const secret =
      this.decryptSecret(
        user.mfaSecretEncrypted,
      );

    const verification =
      await verify({
        secret,
        token: code,
      });

    if (!verification.valid) {
      await this.prisma.securityEvent.create({
        data: {
          eventType:
            'MFA_RECOVERY_CODES_REGEN_FAILED',

          description:
            'Failed attempt to regenerate MFA recovery codes',

          riskLevel:
            'MEDIUM',

          userId,
        },
      });

      throw new UnauthorizedException(
        'Invalid password or MFA code',
      );
    }

    const recoveryCodes =
      await this.replaceRecoveryCodes(
        userId,
      );

    await this.prisma.$transaction(
      async (tx) => {
        await tx.securityEvent.create({
          data: {
            eventType:
              'MFA_RECOVERY_CODES_REGENERATED',

            description:
              'User regenerated MFA recovery codes',

            riskLevel:
              'MEDIUM',

            userId,
          },
        });

        await tx.auditLog.create({
          data: {
            userId,

            action:
              'MFA_RECOVERY_CODES_REGENERATED',

            resource:
              'AUTH',

            result:
              'SUCCESS',

            details:
              'Previous recovery codes were invalidated and replaced.',
          },
        });
      },
    );

    return {
      message:
        'MFA recovery codes regenerated successfully',

      recoveryCodes,

      warning:
        'Save these recovery codes now. Previous recovery codes no longer work.',
    };
  }

  // =========================================================
  // SECURELY DISABLE MFA
  // =========================================================

  async disable(
    userId: number,
    currentPassword: string,
    code: string,
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },

        select: {
          id: true,
          passwordHash: true,
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

    if (
      !user.mfaEnabled ||
      !user.mfaSecretEncrypted
    ) {
      throw new BadRequestException(
        'MFA is not enabled',
      );
    }

    // Check current password.

    const passwordValid =
      await bcrypt.compare(
        currentPassword,
        user.passwordHash,
      );

    if (!passwordValid) {
      await this.prisma.securityEvent.create({
        data: {
          eventType:
            'MFA_DISABLE_FAILED',

          description:
            'Failed attempt to disable multi-factor authentication',

          riskLevel:
            'MEDIUM',

          userId,
        },
      });

      throw new UnauthorizedException(
        'Invalid password or MFA code',
      );
    }

    // Check current authenticator code.

    const secret =
      this.decryptSecret(
        user.mfaSecretEncrypted,
      );

    const verification =
      await verify({
        secret,
        token: code,
      });

    if (!verification.valid) {
      await this.prisma.securityEvent.create({
        data: {
          eventType:
            'MFA_DISABLE_FAILED',

          description:
            'Failed attempt to disable multi-factor authentication',

          riskLevel:
            'MEDIUM',

          userId,
        },
      });

      throw new UnauthorizedException(
        'Invalid password or MFA code',
      );
    }

    const now =
      new Date();

    await this.prisma.$transaction(
      async (tx) => {
        // Disable MFA.

        await tx.user.update({
          where: {
            id: userId,
          },

          data: {
            mfaEnabled:
              false,

            mfaSecretEncrypted:
              null,

            mfaVerifiedAt:
              null,
          },
        });

        // Delete recovery codes.

        await tx.mfaRecoveryCode.deleteMany({
          where: {
            userId,
          },
        });

        // Revoke refresh sessions.

        await tx.refreshToken.updateMany({
          where: {
            userId,

            revokedAt:
              null,
          },

          data: {
            revokedAt:
              now,
          },
        });

        await tx.securityEvent.create({
          data: {
            eventType:
              'MFA_DISABLED',

            description:
              'Multi-factor authentication was disabled and active refresh sessions were revoked',

            riskLevel:
              'MEDIUM',

            userId,
          },
        });

        await tx.auditLog.create({
          data: {
            userId,

            action:
              'MFA_DISABLED',

            resource:
              'AUTH',

            result:
              'SUCCESS',

            details:
              'User disabled MFA. Recovery codes were deleted and active refresh tokens were revoked.',
          },
        });
      },
    );

    return {
      message:
        'MFA disabled successfully. Existing refresh sessions were revoked.',

      mfaEnabled:
        false,

      sessionsRevoked:
        true,
    };
  }
}
import { BadRequestException } from '@nestjs/common';

import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';

describe('AuthController', () => {
  const request = {
    ip: '192.0.2.44',
    user: { sub: 7, email: 'user@example.com', role: 'CUSTOMER' },
  };
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    verifyMfaLogin: jest.Mock;
    verifyMfaRecoveryLogin: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
    changePassword: jest.Mock;
    forgotPassword: jest.Mock;
    resetPassword: jest.Mock;
    getSessions: jest.Mock;
    revokeSession: jest.Mock;
    revokeAllSessions: jest.Mock;
  };
  let usersService: { findById: jest.Mock };
  let mfaService: {
    setup: jest.Mock;
    verifySetup: jest.Mock;
    regenerateRecoveryCodes: jest.Mock;
    disable: jest.Mock;
  };
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      verifyMfaLogin: jest.fn(),
      verifyMfaRecoveryLogin: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      changePassword: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      getSessions: jest.fn(),
      revokeSession: jest.fn(),
      revokeAllSessions: jest.fn(),
    };
    usersService = { findById: jest.fn() };
    mfaService = {
      setup: jest.fn(),
      verifySetup: jest.fn(),
      regenerateRecoveryCodes: jest.fn(),
      disable: jest.fn(),
    };
    controller = new AuthController(
      authService as unknown as AuthService,
      usersService as unknown as UsersService,
      mfaService as unknown as MfaService,
    );
  });

  it('requires X-Device-ID and forwards login metadata', () => {
    expect(() =>
      controller.login(
        { email: 'user@example.com', password: 'password-123' },
        request as never,
        '',
      ),
    ).toThrow(BadRequestException);

    controller.login(
      { email: 'user@example.com', password: 'password-123' },
      request as never,
      'device-1',
      'Mozilla/5.0',
    );

    expect(authService.login).toHaveBeenCalledWith(
      { email: 'user@example.com', password: 'password-123' },
      'device-1',
      'Mozilla/5.0',
      request.ip,
    );
  });

  it('delegates registration, refresh, logout, and password recovery calls', () => {
    controller.register({
      email: 'new@example.com',
      firstName: 'New',
      lastName: 'User',
      password: 'password-123',
    });
    controller.refresh({ refreshToken: 'refresh-token' });
    controller.logout({ refreshToken: 'refresh-token' });
    controller.forgotPassword({ email: 'user@example.com' });
    controller.resetPassword({ token: 'reset-token', newPassword: 'new-pass' });

    expect(authService.register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com' }),
    );
    expect(authService.refresh).toHaveBeenCalledWith('refresh-token');
    expect(authService.logout).toHaveBeenCalledWith('refresh-token');
    expect(authService.forgotPassword).toHaveBeenCalledWith('user@example.com');
    expect(authService.resetPassword).toHaveBeenCalledWith(
      'reset-token',
      'new-pass',
    );
  });

  it('uses the authenticated subject for profile, password, and sessions', async () => {
    await controller.me(request as never);
    controller.changePassword(request as never, {
      currentPassword: 'old-pass',
      newPassword: 'new-pass',
    });
    controller.getSessions(request as never);
    controller.revokeSession(request as never, 42);
    controller.logoutAllSessions(request as never);
    controller.revokeAllSessions(request as never);

    expect(usersService.findById).toHaveBeenCalledWith(7);
    expect(authService.changePassword).toHaveBeenCalledWith(
      7,
      'old-pass',
      'new-pass',
    );
    expect(authService.getSessions).toHaveBeenCalledWith(7);
    expect(authService.revokeSession).toHaveBeenCalledWith(7, 42);
    expect(authService.revokeAllSessions).toHaveBeenCalledTimes(2);
    expect(authService.revokeAllSessions).toHaveBeenCalledWith(7);
  });

  it('routes MFA login and account MFA management correctly', () => {
    controller.verifyMfaLogin(
      { mfaToken: 'mfa-token', code: '123456' },
      request as never,
    );
    controller.recoveryLogin(
      { mfaToken: 'mfa-token', recoveryCode: 'AAAA-BBBB' },
      request as never,
    );
    controller.setupMfa(request as never);
    controller.verifyMfaSetup(request as never, { code: '123456' });
    controller.regenerateRecoveryCodes(request as never, {
      currentPassword: 'password-123',
      code: '123456',
    });
    controller.disableMfa(request as never, {
      currentPassword: 'password-123',
      code: '123456',
    });

    expect(authService.verifyMfaLogin).toHaveBeenCalledWith(
      'mfa-token',
      '123456',
      request.ip,
    );
    expect(authService.verifyMfaRecoveryLogin).toHaveBeenCalledWith(
      'mfa-token',
      'AAAA-BBBB',
      request.ip,
    );
    expect(mfaService.setup).toHaveBeenCalledWith(7);
    expect(mfaService.verifySetup).toHaveBeenCalledWith(7, '123456');
    expect(mfaService.regenerateRecoveryCodes).toHaveBeenCalledWith(
      7,
      'password-123',
      '123456',
    );
    expect(mfaService.disable).toHaveBeenCalledWith(
      7,
      'password-123',
      '123456',
    );
  });
});

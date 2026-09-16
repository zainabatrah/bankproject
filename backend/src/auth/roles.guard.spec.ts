import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AppRole } from './roles.decorator';
import { RolesGuard } from './roles.guard';

function makeContext(user?: { role?: AppRole }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows endpoints without role metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it.each([
    ['CUSTOMER', ['CUSTOMER']],
    ['BANK_EMPLOYEE', ['BANK_EMPLOYEE', 'ADMIN']],
    ['FRAUD_ANALYST', ['FRAUD_ANALYST', 'SECURITY_ANALYST', 'ADMIN']],
    ['SECURITY_ANALYST', ['SECURITY_ANALYST', 'ADMIN']],
    ['ADMIN', ['ADMIN']],
  ] as const)('allows %s when its role is required', (role, requiredRoles) => {
    reflector.getAllAndOverride.mockReturnValue(requiredRoles);

    expect(guard.canActivate(makeContext({ role }))).toBe(true);
  });

  it('rejects a missing authenticated identity', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);

    expect(() => guard.canActivate(makeContext())).toThrow(
      new ForbiddenException('User information is missing'),
    );
  });

  it('rejects a role outside the endpoint allowlist', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);

    expect(() => guard.canActivate(makeContext({ role: 'CUSTOMER' }))).toThrow(
      new ForbiddenException(
        'You do not have permission to access this resource',
      ),
    );
  });
});

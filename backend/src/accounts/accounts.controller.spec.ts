import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

describe('AccountsController', () => {
  const request = {
    user: { sub: 7, email: 'user@example.com', role: 'CUSTOMER' },
  };
  let accountsService: {
    createAccount: jest.Mock;
    getMyAccounts: jest.Mock;
  };
  let controller: AccountsController;

  beforeEach(() => {
    accountsService = {
      createAccount: jest.fn(),
      getMyAccounts: jest.fn(),
    };
    controller = new AccountsController(
      accountsService as unknown as AccountsService,
    );
  });

  it('creates accounts for the authenticated subject', async () => {
    await controller.createAccount(request as never, { currency: 'USD' });

    expect(accountsService.createAccount).toHaveBeenCalledWith(7, 'USD');
  });

  it('lists only the authenticated subject accounts', async () => {
    await controller.getMyAccounts(request as never);

    expect(accountsService.getMyAccounts).toHaveBeenCalledWith(7);
  });
});

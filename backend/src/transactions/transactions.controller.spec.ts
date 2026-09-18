import { BadRequestException } from '@nestjs/common';

import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

describe('TransactionsController', () => {
  const request = {
    user: { sub: 7, email: 'user@example.com', role: 'CUSTOMER' },
  };
  const transferDto = {
    senderAccountId: 10,
    beneficiaryId: 30,
    amount: 125,
  };
  let transactionsService: {
    transfer: jest.Mock;
    getMyTransactions: jest.Mock;
    reverse: jest.Mock;
  };
  let controller: TransactionsController;

  beforeEach(() => {
    transactionsService = {
      transfer: jest.fn(),
      getMyTransactions: jest.fn(),
      reverse: jest.fn(),
    };
    controller = new TransactionsController(
      transactionsService as unknown as TransactionsService,
    );
  });

  it('requires a device id for transfers', () => {
    expect(() =>
      controller.transfer(request as never, transferDto, ''),
    ).toThrow(BadRequestException);
    expect(transactionsService.transfer).not.toHaveBeenCalled();
  });

  it('passes transfer idempotency keys through to the service', () => {
    controller.transfer(
      request as never,
      transferDto,
      'device-1',
      'transfer-key-1',
    );

    expect(transactionsService.transfer).toHaveBeenCalledWith(
      7,
      transferDto,
      'device-1',
      'transfer-key-1',
    );
  });

  it('rejects overly long idempotency keys before calling the service', () => {
    expect(() =>
      controller.transfer(
        request as never,
        transferDto,
        'device-1',
        'x'.repeat(121),
      ),
    ).toThrow(BadRequestException);
    expect(transactionsService.transfer).not.toHaveBeenCalled();
  });

  it('routes transaction history and reversal requests by authenticated subject', () => {
    controller.getMyTransactions(request as never);
    controller.reverse(request as never, 99, { reason: 'Customer dispute' });

    expect(transactionsService.getMyTransactions).toHaveBeenCalledWith(7);
    expect(transactionsService.reverse).toHaveBeenCalledWith(
      7,
      99,
      'Customer dispute',
    );
  });
});

import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

import { FraudService } from './fraud.service';

describe('FraudService', () => {
  const transaction = {
    transaction_id: 'TX-1',
    user_id: 7,
    amount: 500,
    new_device: false,
    new_beneficiary: false,
    transactions_last_hour: 1,
    transaction_hour: 12,
  };
  let httpService: { post: jest.Mock };
  let configService: { getOrThrow: jest.Mock };
  let service: FraudService;

  beforeEach(() => {
    httpService = { post: jest.fn() };
    configService = {
      getOrThrow: jest.fn().mockReturnValue('http://fraud.local'),
    };
    service = new FraudService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  it('returns fraud score and risk decisions from the fraud engine', async () => {
    const fraudDecision = {
      risk_score: 82,
      risk_level: 'CRITICAL',
      flagged: true,
      reasons: ['Unusual amount'],
    };
    httpService.post.mockReturnValueOnce(of({ data: fraudDecision }));

    await expect(service.analyzeTransaction(transaction)).resolves.toEqual(
      fraudDecision,
    );
    expect(httpService.post).toHaveBeenCalledWith(
      'http://fraud.local/analyze-transaction',
      transaction,
    );
  });

  it('converts fraud-service failures into a safe service-unavailable error', async () => {
    httpService.post.mockReturnValueOnce(
      throwError(() => new Error('connection refused')),
    );

    await expect(
      service.analyzeTransaction(transaction),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

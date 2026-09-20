import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

import { FraudService } from './fraud.service';

describe('FraudService', () => {
  const transaction = {
    amount: 500,
    average_amount: 250,
    new_device: false,
    new_beneficiary: false,
    transactions_last_hour: 1,
    failed_logins_last_hour: 0,
    transaction_hour: 12,
  };

  let httpService: { post: jest.Mock };
  let configService: { getOrThrow: jest.Mock };
  let service: FraudService;

  beforeEach(() => {
    httpService = { post: jest.fn() };

    configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'FRAUD_ENGINE_URL') {
          return 'http://fraud.local';
        }

        if (key === 'FRAUD_API_KEY') {
          return 'test-api-key';
        }

        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };

    service = new FraudService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  it('returns mapped fraud decisions from the fraud engine', async () => {
    const fraudEngineResponse = {
      risk_score: 82,
      severity: 'CRITICAL',
      decision: 'BLOCK',
      reasons: ['Unusual amount'],
    };

    httpService.post.mockReturnValueOnce(of({ data: fraudEngineResponse }));

    await expect(service.analyzeTransaction(transaction)).resolves.toEqual({
      risk_score: 82,
      risk_level: 'CRITICAL',
      flagged: true,
      reasons: ['Unusual amount'],
    });

    expect(httpService.post).toHaveBeenCalledWith(
      'http://fraud.local/analyze',
      transaction,
      {
        headers: {
          'X-API-Key': 'test-api-key',
        },
      },
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

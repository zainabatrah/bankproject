import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

export interface FraudAnalysisRequest {
  amount: number;
  average_amount: number;
  new_device: boolean;
  new_beneficiary: boolean;
  transactions_last_hour: number;
  failed_logins_last_hour: number;
  transaction_hour: number;
}

interface FraudEngineResponse {
  risk_score: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  decision: 'APPROVE' | 'REVIEW' | 'BLOCK';
  reasons: string[];
}

export interface FraudAnalysisResponse {
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  flagged: boolean;
  reasons: string[];
}

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);
  private readonly fraudEngineUrl: string;
  private readonly fraudApiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.fraudEngineUrl =
      this.configService.getOrThrow<string>('FRAUD_ENGINE_URL');

    this.fraudApiKey = this.configService.getOrThrow<string>('FRAUD_API_KEY');
  }

  async analyzeTransaction(
    transaction: FraudAnalysisRequest,
  ): Promise<FraudAnalysisResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<FraudEngineResponse>(
          `${this.fraudEngineUrl}/analyze`,
          transaction,
          {
            headers: {
              'X-API-Key': this.fraudApiKey,
            },
          },
        ),
      );

      const result = response.data;

      return {
        risk_score: result.risk_score,
        risk_level: result.severity,
        flagged: result.severity === 'HIGH' || result.severity === 'CRITICAL',
        reasons: result.reasons,
      };
    } catch (error) {
      const axiosError = error as AxiosError;

      this.logger.error(`Fraud engine request failed: ${axiosError.message}`);

      throw new ServiceUnavailableException(
        'Fraud detection service is unavailable',
      );
    }
  }
}

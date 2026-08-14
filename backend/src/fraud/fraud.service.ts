import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

export interface FraudAnalysisRequest {
  transaction_id: string;
  user_id: number;
  amount: number;
  new_device: boolean;
  new_beneficiary: boolean;
  transactions_last_hour: number;
  transaction_hour: number;
}

export interface FraudAnalysisResponse {
  risk_score: number;

  risk_level:
    | 'LOW'
    | 'MEDIUM'
    | 'HIGH'
    | 'CRITICAL';

  flagged: boolean;

  reasons: string[];
}

@Injectable()
export class FraudService {
  private readonly fraudEngineUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.fraudEngineUrl =
      this.configService.getOrThrow<string>(
        'FRAUD_ENGINE_URL',
      );
  }

  async analyzeTransaction(
    transaction: FraudAnalysisRequest,
  ): Promise<FraudAnalysisResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<FraudAnalysisResponse>(
          `${this.fraudEngineUrl}/analyze-transaction`,
          transaction,
        ),
      );

      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;

      console.error(
        'Fraud engine error:',
        axiosError.message,
      );

      throw new ServiceUnavailableException(
        'Fraud detection service is unavailable',
      );
    }
  }
}
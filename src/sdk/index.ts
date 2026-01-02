
import { ApiClient } from './client';
import { mergeConfig } from './config';
import type { AstraSDKConfig, ApiResponse, RequestOptions } from './types';
import { AstraSDKError } from './types';

export class AstraSDK {
  private client: ApiClient;

  constructor(config: AstraSDKConfig) {
    if (!config.apiKey) {
      throw new AstraSDKError('API key is required', 400, 'MISSING_API_KEY');
    }

    const mergedConfig = mergeConfig(config);
    this.client = new ApiClient(mergedConfig);
  }

  
  getClient(): ApiClient {
    return this.client;
  }

  
  updateConfig(config: Partial<AstraSDKConfig>): void {
    this.client.updateConfig(config);
  }

  
  async get<T = unknown>(
    endpoint: string,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.client.get<T>(endpoint, options);
  }


  async post<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.client.post<T>(endpoint, body, options);
  }

  async put<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.client.put<T>(endpoint, body, options);
  }

  async patch<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.client.patch<T>(endpoint, body, options);
  }

  async delete<T = unknown>(
    endpoint: string,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.client.delete<T>(endpoint, options);
  }

  
  async request<T = unknown>(
    endpoint: string,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return this.client.request<T>(endpoint, options);
  }
}

export type { AstraSDKConfig, ApiResponse, RequestOptions, ApiError } from './types';
export { AstraSDKError } from './types';

export { ApiClient } from './client';

// Export KYC components
export { KycFlow } from '../components/KycFlow';
export type { KycFlowProps } from '../components/KycFlow';

// Export KYC API service
export { KycApiService } from '../services/kycApiService';
export type { 
  KycApiConfig, 
  SessionStatusResponse, 
  FaceScanResponse, 
  DocumentUploadResponse 
} from '../services/kycApiService';

export default AstraSDK;


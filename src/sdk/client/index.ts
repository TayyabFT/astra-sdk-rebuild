/**
 * API Client for Astra SDK
 */

import type { RequestOptions, ApiResponse } from '../types';
import { makeRequest, retryRequest } from '../utils/http';
import type { AstraSDKConfig } from '../types';

export class ApiClient {
  private config: Required<AstraSDKConfig>;

  constructor(config: Required<AstraSDKConfig>) {
    this.config = config;
  }

  /**
   * Make a GET request
   */
  async get<T = unknown>(
    endpoint: string,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * Make a POST request
   */
  async post<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  /**
   * Make a PUT request
   */
  async put<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  /**
   * Make a PATCH request
   */
  async patch<T = unknown>(
    endpoint: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }

  /**
   * Make a DELETE request
   */
  async delete<T = unknown>(
    endpoint: string,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Make a generic request
   */
  async request<T = unknown>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const requestFn = () =>
      makeRequest<T>(endpoint, options, {
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
        timeout: this.config.timeout,
        headers: this.config.headers,
      });

    if (this.config.retries > 0) {
      return retryRequest(requestFn, this.config.retries, this.config.retryDelay);
    }

    return requestFn();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AstraSDKConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      headers: {
        ...this.config.headers,
        ...config.headers,
      },
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<AstraSDKConfig> {
    return { ...this.config };
  }
}


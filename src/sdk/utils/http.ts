/**
 * HTTP utility functions
 */

import type { RequestOptions, ApiResponse, ApiError } from '../types';
import { AstraSDKError } from '../types';

export async function makeRequest<T = unknown>(
  url: string,
  options: RequestOptions = {},
  config: {
    apiKey: string;
    baseURL: string;
    timeout: number;
    headers: Record<string, string>;
  }
): Promise<ApiResponse<T>> {
  const {
    method = 'GET',
    headers: customHeaders = {},
    body,
    params,
    timeout = config.timeout,
  } = options;

  // Build URL with query parameters
  const urlObj = new URL(url, config.baseURL);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      urlObj.searchParams.append(key, String(value));
    });
  }

  // Prepare headers
  const headers = new Headers({
    ...config.headers,
    ...customHeaders,
    Authorization: `Bearer ${config.apiKey}`,
  });

  // Prepare request options
  const requestOptions: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(timeout),
  };

  if (body && method !== 'GET') {
    requestOptions.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(urlObj.toString(), requestOptions);
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let data: T;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = (await response.text()) as unknown as T;
    }

    if (!response.ok) {
      const error: ApiError = {
        message: `Request failed with status ${response.status}`,
        status: response.status,
        code: response.statusText,
        details: data,
      };
      throw new AstraSDKError(
        error.message,
        error.status,
        error.code,
        error.details
      );
    }

    return {
      data,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    };
  } catch (error) {
    if (error instanceof AstraSDKError) {
      throw error;
    }
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new AstraSDKError('Request timeout', 408, 'TIMEOUT');
      }
      throw new AstraSDKError(error.message, undefined, 'NETWORK_ERROR');
    }
    throw new AstraSDKError('Unknown error occurred', undefined, 'UNKNOWN_ERROR');
  }
}

export async function retryRequest<T>(
  fn: () => Promise<T>,
  retries: number,
  delay: number
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on client errors (4xx) except 429 (rate limit)
      if (error instanceof AstraSDKError && error.status) {
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          throw error;
        }
      }
      
      if (i < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError!;
}


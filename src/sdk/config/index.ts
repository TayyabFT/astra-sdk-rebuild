/**
 * Configuration management for Astra SDK
 */

import type { AstraSDKConfig } from '../types';

export const DEFAULT_CONFIG: Required<Omit<AstraSDKConfig, 'apiKey'>> = {
  baseURL: 'https://api.astra.com',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  retries: 3,
  retryDelay: 1000,
};

export function mergeConfig(userConfig: AstraSDKConfig): Required<AstraSDKConfig> {
  return {
    apiKey: userConfig.apiKey,
    baseURL: userConfig.baseURL ?? DEFAULT_CONFIG.baseURL,
    timeout: userConfig.timeout ?? DEFAULT_CONFIG.timeout,
    headers: {
      ...DEFAULT_CONFIG.headers,
      ...userConfig.headers,
    },
    retries: userConfig.retries ?? DEFAULT_CONFIG.retries,
    retryDelay: userConfig.retryDelay ?? DEFAULT_CONFIG.retryDelay,
  };
}


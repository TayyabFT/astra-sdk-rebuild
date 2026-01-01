# Astra SDK

Official Astra SDK for JavaScript/TypeScript

## Installation

```bash
npm install astra-sdk
# or
yarn add astra-sdk
# or
pnpm add astra-sdk
```

## Usage

### Basic Setup

```typescript
import { AstraSDK } from 'astra-sdk';

const sdk = new AstraSDK({
  apiKey: 'your-api-key-here',
  baseURL: 'https://api.astra.com', // optional
  timeout: 30000, // optional, default: 30000
  retries: 3, // optional, default: 3
  retryDelay: 1000, // optional, default: 1000
});
```

### Making Requests

```typescript
// GET request
const response = await sdk.get('/users');
console.log(response.data);

// POST request
const newUser = await sdk.post('/users', {
  name: 'John Doe',
  email: 'john@example.com',
});

// PUT request
const updated = await sdk.put('/users/123', {
  name: 'Jane Doe',
});

// PATCH request
const patched = await sdk.patch('/users/123', {
  email: 'jane@example.com',
});

// DELETE request
await sdk.delete('/users/123');

// Custom request
const custom = await sdk.request('/custom-endpoint', {
  method: 'POST',
  headers: {
    'Custom-Header': 'value',
  },
  body: { data: 'value' },
  params: { query: 'param' },
});
```

### Error Handling

```typescript
import { AstraSDK, AstraSDKError } from 'astra-sdk';

try {
  const response = await sdk.get('/users');
} catch (error) {
  if (error instanceof AstraSDKError) {
    console.error('SDK Error:', error.message);
    console.error('Status:', error.status);
    console.error('Code:', error.code);
    console.error('Details:', error.details);
  }
}
```

### Advanced Usage

```typescript
// Access the underlying API client
const client = sdk.getClient();

// Update configuration
sdk.updateConfig({
  timeout: 60000,
  headers: {
    'X-Custom-Header': 'value',
  },
});
```

## API Reference

### AstraSDK

Main SDK class for interacting with the Astra API.

#### Constructor

```typescript
new AstraSDK(config: AstraSDKConfig)
```

#### Methods

- `get<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>>`
- `post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>`
- `put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>`
- `patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>`
- `delete<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>>`
- `request<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>>`
- `updateConfig(config: Partial<AstraSDKConfig>): void`
- `getClient(): ApiClient`

## Types

### AstraSDKConfig

```typescript
interface AstraSDKConfig {
  apiKey: string;
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
  retries?: number;
  retryDelay?: number;
}
```

### ApiResponse

```typescript
interface ApiResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}
```

### RequestOptions

```typescript
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string | number | boolean>;
  timeout?: number;
}
```

## Development

```bash
# Install dependencies
npm install

# Build the SDK
npm run build

# Run type checking
npm run type-check

# Lint
npm run lint
```

## License

MIT

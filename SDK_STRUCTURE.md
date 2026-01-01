# Astra SDK Structure

## Directory Structure

```
src/sdk/
├── index.ts              # Main SDK entry point and exports
├── types/
│   └── index.ts          # TypeScript types and interfaces
├── config/
│   └── index.ts          # Configuration management
├── client/
│   └── index.ts          # API client implementation
├── utils/
│   └── http.ts           # HTTP utilities and request handling
└── examples/
    └── basic-usage.ts    # Usage examples
```

## Core Components

### 1. Types (`src/sdk/types/index.ts`)
- `AstraSDKConfig`: SDK configuration interface
- `RequestOptions`: Request options interface
- `ApiResponse<T>`: API response wrapper
- `ApiError`: Error interface
- `AstraSDKError`: Custom error class

### 2. Configuration (`src/sdk/config/index.ts`)
- Default configuration values
- Configuration merging utility
- Centralized config management

### 3. HTTP Utils (`src/sdk/utils/http.ts`)
- `makeRequest`: Core HTTP request function
- `retryRequest`: Retry logic with exponential backoff
- Error handling and timeout management

### 4. API Client (`src/sdk/client/index.ts`)
- `ApiClient` class with HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Request/response handling
- Configuration management

### 5. Main SDK (`src/sdk/index.ts`)
- `AstraSDK` class - main SDK interface
- Convenience methods for all HTTP verbs
- Type exports
- Default export

## Build Configuration

- **Vite Config**: Configured for library build with multiple formats (ES, CJS, UMD)
- **TypeScript**: Type declarations generation
- **Package.json**: Configured for npm publishing with proper exports

## Usage

```typescript
import { AstraSDK } from 'astra-sdk';

const sdk = new AstraSDK({
  apiKey: 'your-api-key',
});

const response = await sdk.get('/endpoint');
```

## Build Commands

- `npm run build` - Build the SDK library
- `npm run build:lib` - Alias for build
- `npm run type-check` - Type checking without build
- `npm run lint` - Lint the codebase

## Next Steps

1. Install dependencies: `npm install`
2. Customize API endpoints and methods as needed
3. Add domain-specific methods to the SDK class
4. Build: `npm run build`
5. Publish: `npm publish` (when ready)


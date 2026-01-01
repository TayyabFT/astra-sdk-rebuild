# KYC API Integration Guide

This guide explains how to use the KYC API service with session management.

## Overview

The SDK now includes a complete API service for:
- Face scan upload
- Document upload  
- Session status checking
- Automatic session expiration handling

## Setup

### 1. Import the KycFlow Component

```typescript
import { KycFlow } from 'astra-sdk-web';
// or
import { KycFlow } from 'astra-sdk-web/components';
```

### 2. Use KycFlow with Session Configuration

```typescript
import React, { useState } from 'react';
import { KycFlow } from 'astra-sdk-web';

function MyComponent() {
  const [showKyc, setShowKyc] = useState(false);
  
  const startKyc = async () => {
    // Get session ID and server key from your backend/storage
    const sessionId = localStorage.getItem('astraKycSessionId');
    const serverKey = localStorage.getItem('astraServerKey');
    const apiBaseUrl = 'https://api.probusiness.astraprotocol.com';
    
    if (!sessionId || !serverKey) {
      alert('Session ID or Server Key missing');
      return;
    }
    
    setShowKyc(true);
  };
  
  return (
    <>
      <button onClick={startKyc}>Start KYC</button>
      
      {showKyc && (
        <KycFlow
          apiBaseUrl="https://api.probusiness.astraprotocol.com"
          sessionId={sessionId}
          serverKey={serverKey}
          deviceType="desktop" // optional: 'desktop' | 'mobile' | 'ios' | 'android'
          startAtQr={true}
          onClose={() => setShowKyc(false)}
        />
      )}
    </>
  );
}
```

## API Service Details

### Session Status API

Automatically called before face scan and document upload to ensure session is active.

**Endpoint:** `GET /api/v2/dashboard/merchant/onsite/session/{sessionId}/status`

**Response:**
```json
{
  "status": "success",
  "message": "Session status fetched",
  "data": {
    "session_id": "d3bc0b17-3559-4b61-8bb2-b96f13f50123",
    "status": "ACTIVE",
    "completed_steps": [],
    "next_step": "face_scan"
  }
}
```

**Session Expiration Handling:**
- If session status is not "ACTIVE", the user is automatically redirected to QR code page
- Error message is displayed: "Session expired or inactive. Please start a new session."

### Face Scan Upload API

**Endpoint:** `POST /api/v2/dashboard/merchant/onsite/session/{sessionId}/face`

**Request:**
- FormData with `face_scan_img` (Blob/File)
- Headers: `x-server-key`, `device-type`
- Credentials: included

**Response:**
```json
{
  "status": "success",
  "message": "Face scan uploaded successfully",
  "data": { ... }
}
```

### Document Upload API

**Endpoint:** `POST /api/v2/dashboard/merchant/onsite/session/{sessionId}/docs`

**Request:**
- FormData with:
  - `docs_scan_img` (Blob/File)
  - `docType` (string: "CNIC" | "Passport" | "DrivingLicense")
- Headers: `x-server-key`, `device-type`
- Credentials: included

**Response:**
```json
{
  "status": "success",
  "message": "Document uploaded successfully",
  "data": { ... }
}
```

## Implementation Details

### Files Created

1. **`src/services/kycApiService.ts`**
   - `KycApiService` class with all API methods
   - Session status checking
   - Face scan and document upload
   - Error handling

2. **`src/contexts/KycContext.tsx`**
   - React context for providing API service to components
   - `KycProvider` component
   - `useKycContext` hook

3. **`src/components/KycFlow.tsx`**
   - Main wrapper component
   - Accepts `apiBaseUrl`, `sessionId`, `serverKey`
   - Wraps routes with `KycProvider`

### Updated Components

1. **`FaceScanModal.tsx`**
   - Uses `useKycContext` to get API service
   - Checks session status on mount
   - Uploads face scan after capture
   - Handles session expiration

2. **`DocumentUploadModal.tsx`**
   - Uses `useKycContext` to get API service
   - Checks session status on mount
   - Uploads document after capture/upload
   - Handles session expiration

3. **`useFaceScan.ts`**
   - Accepts `onFaceUpload` callback
   - Converts captured image to blob
   - Calls upload callback

4. **`useDocumentUpload.ts`**
   - Accepts `onDocumentUpload` callback
   - Calls upload callback for both file upload and camera capture

## Usage Example (Complete)

```typescript
import React, { useState } from 'react';
import { KycFlow } from 'astra-sdk-web';

const API_BASE_URL = "https://api.probusiness.astraprotocol.com";

function Step4() {
  const [showKyc, setShowKyc] = useState(false);
  const [loading, setLoading] = useState(false);

  const startKyc = async () => {
    if (loading) return false;
    
    try {
      setLoading(true);

      // Get session data from storage
      const storedSessionId = localStorage.getItem("astraKycSessionId");
      const serverKey = localStorage.getItem("astraServerKey");

      if (!storedSessionId || !serverKey) {
        throw new Error("Session ID or Server Key missing");
      }

      setShowKyc(true);
      return true;
    } catch (e: any) {
      alert(e?.message || "Failed to start KYC session");
      return false;
    } finally {
      setLoading(false);
    }
  };

  return showKyc ? (
    <div className="fixed w-full inset-0 flex items-center justify-center z-[9999999]">
      <KycFlow
        apiBaseUrl={API_BASE_URL}
        sessionId={localStorage.getItem("astraKycSessionId") || ""}
        serverKey={localStorage.getItem("astraServerKey") || ""}
        startAtQr={true}
        onClose={() => setShowKyc(false)}
      />
    </div>
  ) : (
    <button onClick={startKyc} disabled={loading}>
      {loading ? "Loading..." : "Start KYC"}
    </button>
  );
}

export default Step4;
```

## Features

✅ **Automatic Session Checking**
- Status API called before face scan and document upload
- Prevents API calls with expired sessions

✅ **Session Expiration Handling**
- Automatic redirect to QR page if session expires
- User-friendly error messages

✅ **Error Handling**
- Comprehensive error messages
- Network error handling
- API error handling

✅ **Type Safety**
- Full TypeScript support
- Type definitions for all API responses

✅ **Device Type Detection**
- Automatic device type detection
- Can be overridden via props

## Notes

- All API calls include `withCredentials: true` for cookie support
- Device type is automatically detected but can be overridden
- Session status is checked before every API call
- If session is not active, user is redirected to QR page with error message


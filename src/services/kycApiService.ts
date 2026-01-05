/**
 * KYC API Service
 * Handles all KYC-related API calls (face scan, document upload, status check)
 */

export interface KycApiConfig {
  apiBaseUrl: string;
  sessionId: string;
  serverKey: string;
  deviceType?: string;
}

export interface SessionStatusResponse {
  status: string;
  message: string;
  data: {
    session_id: string;
    status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'COMPLETED';
    completed_steps: string[];
    next_step: string;
  };
}

export interface FaceScanResponse {
  status: string;
  message: string;
  data?: unknown;
}

export interface DocumentUploadResponse {
  status: string;
  message: string;
  data?: unknown;
}

export class KycApiService {
  private config: KycApiConfig;

  constructor(config: KycApiConfig) {
    this.config = config;
  }

  /**
   * Detect device type
   */
  private detectDeviceType(): string {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    if (/android/i.test(userAgent)) return 'android';
    if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) return 'ios';
    if (/Mac|Windows|Linux/.test(userAgent)) return 'desktop';
    return 'unknown';
  }

  /**
   * Get session status
   */
  async getSessionStatus(): Promise<SessionStatusResponse> {
    const deviceType = this.config.deviceType || this.detectDeviceType();
    
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/api/v2/dashboard/merchant/onsite/session/${this.config.sessionId}/status`,
        {
          method: 'GET',
          headers: {
            'x-server-key': this.config.serverKey,
            'device-type': deviceType,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData?.message || `Status fetch failed with status ${response.status}`;
        throw new Error(message);
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      const message = error?.message || 'Status fetch failed';
      throw new Error(`Status fetch failed: ${message}`);
    }
  }

  /**
   * Upload face scan image
   */
  async uploadFaceScan(faceBlob: Blob | File): Promise<FaceScanResponse> {
    // Check session status first
    await this.checkSessionActive();

    const deviceType = this.config.deviceType || this.detectDeviceType();
    const formData = new FormData();
    const faceFileName = (faceBlob as File)?.name || `face-${Date.now()}.jpg`;
    formData.append('face_scan_img', faceBlob, faceFileName);

    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/api/v2/dashboard/merchant/onsite/session/${this.config.sessionId}/face`,
        {
          method: 'POST',
          headers: {
            'x-server-key': this.config.serverKey,
            'device-type': deviceType,
          },
          credentials: 'include',
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData?.message || `Face upload failed with status ${response.status}`;
        // Preserve the original error message for better error handling
        const error = new Error(message);
        (error as any).statusCode = response.status;
        (error as any).errorData = errorData;
        throw error;
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      const message = error?.message || 'Face upload failed';
      throw new Error(`Face upload failed: ${message}`);
    }
  }

  /**
   * Upload document scan image
   */
  async uploadDocument(docBlob: Blob | File, docType: string): Promise<DocumentUploadResponse> {
    // Check session status first
    await this.checkSessionActive();

    const deviceType = this.config.deviceType || this.detectDeviceType();
    const formData = new FormData();
    const docFileName = (docBlob as File)?.name || `document-${Date.now()}.jpg`;
    formData.append('docs_scan_img', docBlob, docFileName);
    formData.append('docType', docType);

    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/api/v2/dashboard/merchant/onsite/session/${this.config.sessionId}/docs`,
        {
          method: 'POST',
          headers: {
            'x-server-key': this.config.serverKey,
            'device-type': deviceType,
          },
          credentials: 'include',
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData?.message || `Document upload failed with status ${response.status}`;
        throw new Error(message);
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      const message = error?.message || 'Document upload failed';
      throw new Error(`Document upload failed: ${message}`);
    }
  }

  /**
   * Check if session is active, throw error if not
   */
  async checkSessionActive(): Promise<void> {
    const status = await this.getSessionStatus();
    
    if (status.data.status !== 'ACTIVE') {
      throw new Error('Session expired or inactive. Please start a new session.');
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<KycApiConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): KycApiConfig {
    return { ...this.config };
  }
}


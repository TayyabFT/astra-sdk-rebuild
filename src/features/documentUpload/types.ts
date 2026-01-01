export type DocumentType = 'CNIC' | 'Passport' | 'DrivingLicense';

export interface DocumentUploadState {
  docType: DocumentType;
  isDocScanMode: boolean;
  docPreviewUrl: string | null;
  docFileName: string;
  loading: boolean;
}

export interface DocumentUploadCallbacks {
  onUpload?: (file: File, docType: DocumentType) => void;
  onScan?: (file: File, docType: DocumentType) => void;
  onError?: (error: Error) => void;
}


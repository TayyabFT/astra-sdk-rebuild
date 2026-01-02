import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentUpload } from '../features/documentUpload/hooks/useDocumentUpload';
import { useKycContext } from '../contexts/KycContext';
import type { DocumentType } from '../features/documentUpload/types';

interface DocumentUploadModalProps {
  onComplete?: (file: File, docType: string) => void;
}

function DocumentUploadModal({ onComplete }: DocumentUploadModalProps) {
  const navigate = useNavigate();
  const { apiService } = useKycContext();
  const [sessionError, setSessionError] = useState<string | null>(null);
  
  const {
    state,
    setState,
    fileInputRef,
    docVideoRef,
    handleDocumentUpload,
    handleConfirmDocumentUpload,
    handleManualCapture,
    startDocCamera,
  } = useDocumentUpload({
    onDocumentUpload: async (blob: Blob, docType: string) => {
      if (!apiService) {
        throw new Error('API service not initialized');
      }
      await apiService.uploadDocument(blob, docType);
    },
    onUpload: (file, docType) => {
      if (onComplete) {
        onComplete(file, docType);
      }
    },
    onScan: (file, docType) => {
      if (onComplete) {
        onComplete(file, docType);
      }
    },
  });
  
  // Check session status on mount
  useEffect(() => {
    const checkSession = async () => {
      if (!apiService) return;
      
      try {
        await apiService.checkSessionActive();
        setSessionError(null);
      } catch (error: any) {
        const message = error.message || 'Session expired or inactive';
        setSessionError(message);
        // Redirect to QR page after showing error
        setTimeout(() => {
          navigate('/qr', { replace: true });
        }, 2000);
      }
    };
    
    checkSession();
  }, [apiService, navigate]);


  // Show session error if present
  if (sessionError) {
    return (
      <div className="fixed inset-0 bg-black p-4 z-[1000] flex items-center justify-center font-sans overflow-y-auto custom__scrollbar">
        <div className="max-w-[400px] w-full mx-auto bg-[#0b0f17] rounded-2xl p-6 shadow-xl">
          <div className="text-center">
            <h2 className="m-0 mb-4 text-[26px] font-bold text-red-500">
              Session Expired
            </h2>
            <p className="text-[#e5e7eb] mb-4">{sessionError}</p>
            <p className="text-[#9ca3af] text-sm">Redirecting to QR code page...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black p-5 z-[1000] flex items-center justify-center font-sans overflow-y-auto custom__scrollbar">
      <div 
        className="max-w-[400px] w-full mx-auto bg-[#0b0f17] rounded-2xl p-6 shadow-xl"
        style={{
          marginTop: state.docPreviewUrl && !state.isDocScanMode ? '192px' : '0'
        }}
      >
        <div className="relative mb-4">
          <h2 className="m-0 mb-4 text-xl font-bold text-white">
            Document
          </h2>
        </div>

        {!state.isDocScanMode && (
          <div className="grid gap-2 mb-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 px-4 rounded-lg border-2 border-dashed border-[#374151] bg-[#0f172a] text-[#e5e7eb] text-base cursor-pointer hover:border-[#4b5563] transition-colors"
            >
              Upload Document
            </button>
            <button
              type="button"
              onClick={() => {
                setState(prev => ({ ...prev, isDocScanMode: true }));
                startDocCamera();
              }}
              className="w-full py-3 px-4 rounded-lg text-white border-none text-base cursor-pointer transition-opacity hover:opacity-90"
              style={{
                background: "linear-gradient(90deg, #FF8A00 0%, #FF3D77 100%)"
              }}
            >
              Scan Document (Back Camera)
            </button>
          </div>
        )}

        <div className="flex gap-3 mb-4">
          <label className="flex items-center gap-1.5 text-[#e5e7eb] cursor-pointer">
            <input
              type="radio"
              name="doc-type"
              value="CNIC"
              checked={state.docType === "CNIC"}
              defaultChecked
              onChange={() => setState(prev => ({ ...prev, docType: "CNIC" as DocumentType }))}
              className="cursor-pointer w-4 h-4"
              style={{
                accentColor: state.docType === "CNIC" ? "#ef4444" : "#6b7280"
              }}
            />
            NIC
          </label>
          <label className="flex items-center gap-1.5 text-[#e5e7eb] cursor-pointer">
            <input
              type="radio"
              name="doc-type"
              value="Passport"
              checked={state.docType === "Passport"}
              onChange={() => setState(prev => ({ ...prev, docType: "Passport" as DocumentType }))}
              className="cursor-pointer w-4 h-4"
              style={{
                accentColor: state.docType === "Passport" ? "#ef4444" : "#6b7280"
              }}
            />
            Passport
          </label>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          onChange={handleDocumentUpload}
          className="hidden"
        />

        {state.isDocScanMode && (
          <div className="grid gap-3 mt-2">
            <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden bg-black">
              <video
                ref={docVideoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleManualCapture}
                disabled={state.loading}
                className="flex-1 py-3 px-4 rounded-lg text-white border-none text-base cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                style={{
                  background: "linear-gradient(90deg, #FF8A00 0%, #FF3D77 100%)"
                }}
              >
                {state.loading ? "Capturing..." : "Capture Document"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setState(prev => ({ ...prev, isDocScanMode: false }));
                }}
                disabled={state.loading}
                className="py-3 px-4 rounded-lg bg-[#111827] text-[#e5e7eb] border-none text-base cursor-pointer hover:bg-[#1f2937] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            <p className="m-0 text-[#9ca3af] text-xs text-center">
              {state.loading 
                ? "Processing document..." 
                : "Position your document in the frame and tap 'Capture Document' when ready."}
            </p>
          </div>
        )}

        {state.docFileName && !state.isDocScanMode && (
          <div className="inline-flex items-center gap-2 py-2 px-3 rounded-full bg-[#1f2937] text-[#e5e7eb] text-sm mb-3">
            <span>✔</span>
            <span>File selected</span>
          </div>
        )}

        {state.loading && !state.isDocScanMode && (
          <p className="m-3 mt-0 text-[#60a5fa] text-center">
            Processing...
          </p>
        )}

        {!state.isDocScanMode && state.docPreviewUrl && (
          <div className="mt-3">
            <div className="font-semibold mb-1.5 text-[#e5e7eb]">Preview</div>
            <img src={state.docPreviewUrl} alt="Document preview" className="w-full rounded-lg border border-[#374151]" />
            <div className="grid gap-2 grid-cols-2 mt-2">
              <button
                type="button"
                onClick={handleConfirmDocumentUpload}
                disabled={state.loading}
                className="py-3 px-4 rounded-lg text-white border-none text-base cursor-pointer w-full transition-opacity disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                style={{
                  background: "linear-gradient(90deg, #10b981 0%, #059669 100%)"
                }}
              >
                {state.loading ? "Uploading..." : "Looks good, continue"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setState(prev => ({
                    ...prev,
                    docPreviewUrl: null,
                    docFileName: "",
                  }));
                }}
                disabled={state.loading}
                className="py-3 px-4 rounded-lg bg-[#111827] text-[#e5e7eb] border-none text-base cursor-pointer w-full hover:bg-[#1f2937] transition-colors disabled:opacity-50"
              >
                Retake / Choose again
              </button>
            </div>
          </div>
        )}

        {!state.isDocScanMode && !state.docFileName && !state.docPreviewUrl && (
          <p className="m-0 text-[#9ca3af] text-xs text-center">
            After uploading or scanning, return to your desktop to check status.
          </p>
        )}
      </div>
    </div>
  );
}

export default DocumentUploadModal;


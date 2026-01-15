import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DocumentUploadModal from './DocumentUploadModal';
import { useCamera } from '../features/faceScan/hooks/useCamera';
import { useFaceScan } from '../features/faceScan/hooks/useFaceScan';
import { useKycContext } from '../contexts/KycContext';
import { Toast } from '../components/Toast';
import { COMPLETED_STEPS } from '../services/kycApiService';
import '../index.css';

interface FaceScanModalProps {
  onClose: () => void;
  onComplete?: (capturedImage: string) => void;
}

function FaceScanModal({ onComplete }: FaceScanModalProps) {
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const { apiService } = useKycContext();
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [showRetryButton, setShowRetryButton] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [kycCompleted, setKycCompleted] = useState(false);
  
  const { videoRef, cameraReady, stopCamera } = useCamera();
  const { state, setState, refs, handleFaceCapture } = useFaceScan(videoRef, faceCanvasRef, {
    onFaceUpload: async (blob: Blob) => {
      if (!apiService) {
        throw new Error('API service not initialized');
      }
      try {
        await apiService.uploadFaceScan(blob);
      } catch (error: any) {
        const errorMessage = error?.message || '';
        const errorData = (error as any)?.errorData || {};
        const statusCode = (error as any)?.statusCode;
        
        // Check for "Face already registered" error in various formats
        // The API returns: { success: false, statusCode: 500, message: "Face already registered", errorData: {...} }
        const isFaceAlreadyRegistered = 
          errorMessage.includes('Face already registered') || 
          errorMessage.includes('already registered') ||
          errorData?.message?.includes('Face already registered') ||
          (statusCode === 500 && errorMessage.includes('Face already registered'));
        
        if (isFaceAlreadyRegistered) {
          setShowRetryButton(true);
          setToast({
            message: 'Face already registered. Click Retry to register again.',
            type: 'warning',
          });
          setState(prev => ({ ...prev, loading: false, allStepsCompleted: false, showDocumentUpload: false }));
          // Throw a special error to prevent continuing to document upload
          const faceRegisteredError = new Error('FACE_ALREADY_REGISTERED');
          (faceRegisteredError as any).isFaceAlreadyRegistered = true;
          throw faceRegisteredError;
        }
        throw error;
      }
    },
    onFaceCaptureComplete: (imageData: string) => {
      if (onComplete) {
        onComplete(imageData);
      }
    },
  });
  
  useEffect(() => {
    const checkSession = async () => {
      if (!apiService) return;
      
      try {
        const statusResponse = await apiService.getSessionStatus();
        const { completed_steps, next_step, status } = statusResponse.data;
        
        // Check if session is active
        if (status !== 'ACTIVE') {
          throw new Error('Session expired or inactive');
        }
        
        // Check if KYC is completed
        if (status === 'COMPLETED' || completed_steps.includes(COMPLETED_STEPS.COMPLETED)) {
          setKycCompleted(true);
          return;
        }
        
        // If face_scan is already completed, skip to document upload
        if (completed_steps.includes(COMPLETED_STEPS.FACE)) {
          setState(prev => ({ ...prev, showDocumentUpload: true }));
          return;
        }
        
        // If next_step is not face_scan, redirect accordingly
        if (next_step !== COMPLETED_STEPS.FACE && next_step !== COMPLETED_STEPS.INITIATED) {
          if (next_step === COMPLETED_STEPS.DOCS) {
            setState(prev => ({ ...prev, showDocumentUpload: true }));
            return;
          }
        }
        
        setSessionError(null);
      } catch (error: any) {
        const message = error.message || 'Session expired or inactive';
        setSessionError(message);
        setTimeout(() => {
          navigate('/qr', { replace: true });
        }, 2000);
      }
    };
    
    checkSession();
  }, [apiService, navigate, setState]);

  useEffect(() => {
    setState(prev => ({ ...prev, cameraReady }));
  }, [cameraReady, setState]);

  useEffect(() => {
    if (cameraReady && apiService) {
      const config = apiService.getConfig();
      if (config) {
        console.log('=== Camera Opened ===');
        console.log('Session ID:', config.sessionId);
        console.log('Server Key:', config.serverKey);
        console.log('API Base URL:', config.apiBaseUrl);
        console.log('Device Type:', config.deviceType || 'auto-detected');
        
        apiService.getSessionStatus()
          .then((statusResponse) => {
            console.log('=== Session Status API Response ===');
            console.log('Full Response:', statusResponse);
            console.log('Session Status:', statusResponse.data?.status);
            console.log('Session ID:', statusResponse.data?.session_id);
            console.log('Completed Steps:', statusResponse.data?.completed_steps);
            console.log('Next Step:', statusResponse.data?.next_step);
          })
          .catch((error) => {
            console.error('=== Session Status API Error ===');
            console.error('Error fetching session status:', error);
          });
      }
    }
  }, [cameraReady, apiService]);

  const handleRetry = async () => {
    if (!apiService || isRetrying) return;
    
    setIsRetrying(true);
    setShowRetryButton(false);
    setToast(null);
    
    try {
      await apiService.retrySession();
      
      // Reset face scan state
      stopCamera();
      setState({
        cameraReady: false,
        livenessStage: 'CENTER',
        livenessReady: false,
        livenessFailed: false,
        modelLoading: true,
        modelLoaded: false,
        livenessInstruction: 'Look straight at the camera',
        loading: false,
        allStepsCompleted: false,
        capturedImage: null,
        showDocumentUpload: false,
      });
      
      refs.centerHold.current = 0;
      refs.leftHold.current = 0;
      refs.rightHold.current = 0;
      refs.snapTriggered.current = false;
      refs.lastResultsAt.current = 0;
      refs.modelLoaded.current = false;
      refs.livenessFailed.current = false;
      
      // Reload to restart face scan
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error: any) {
      setIsRetrying(false);
      setShowRetryButton(true);
      setToast({
        message: error?.message || 'Retry failed. Please try again.',
        type: 'error',
      });
    }
  };

  const handleRestart = () => {
    stopCamera();
    setState({
      cameraReady: false,
      livenessStage: 'CENTER',
      livenessReady: false,
      livenessFailed: false,
      modelLoading: true,
      modelLoaded: false,
      livenessInstruction: 'Look straight at the camera',
      loading: false,
      allStepsCompleted: false,
      capturedImage: null,
      showDocumentUpload: false,
    });
    
    refs.centerHold.current = 0;
    refs.leftHold.current = 0;
    refs.rightHold.current = 0;
    refs.snapTriggered.current = false;
    refs.lastResultsAt.current = 0;
    refs.modelLoaded.current = false;
    refs.livenessFailed.current = false;
    
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  // Show KYC completion message
  if (kycCompleted) {
    return (
      <div className="fixed inset-0 bg-black p-5 z-[1000] flex items-center justify-center font-sans overflow-y-auto custom__scrollbar">
        <div className="max-w-[400px] w-full mx-auto bg-[#0b0f17] rounded-2xl p-6 shadow-xl">
          <div className="text-center">
            <div className="mb-4 text-6xl">✅</div>
            <h2 className="m-0 mb-4 text-[26px] font-bold text-green-500">
              KYC Completed
            </h2>
            <p className="text-[#e5e7eb] mb-4 text-lg">
              All steps have been completed successfully.
            </p>
            <p className="text-[#9ca3af] text-sm mb-6">
              Please return to your desktop to continue.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state.showDocumentUpload) {
    return (
      <DocumentUploadModal
        onComplete={(_file, _docType) => {
          if (onComplete && state.capturedImage) {
            onComplete(state.capturedImage);
          }
        }}
      />
    );
  }
  
  if (sessionError) {
    return (
      <div className="fixed inset-0 bg-black p-5 z-[1000] flex items-center justify-center font-sans overflow-y-auto custom__scrollbar">
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
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={6000}
        />
      )}
      <div className="fixed inset-0 bg-black p-5 z-[1000] flex items-center justify-center font-sans overflow-y-auto custom__scrollbar">
        <div className="max-w-[400px] w-full mx-auto bg-[#0b0f17] rounded-2xl p-6 shadow-xl mt-48">
        <div className="relative mb-4">
          <h2 className="m-0 mb-4 text-[26px] font-bold text-white text-center">
            Capture Face
          </h2>
        </div>
        
        <div className="grid gap-4">
          {!state.modelLoading && state.modelLoaded && !state.livenessFailed && (
            <div className="bg-[#0a2315] text-[#34d399] py-3.5 px-4 rounded-xl text-sm border border-[#155e3b] text-left">
              Face detection model loaded.
            </div>
          )}
          {state.modelLoading && !state.livenessFailed && (
            <div className="bg-[#1f2937] text-[#e5e7eb] py-3.5 px-4 rounded-xl text-sm border border-[#374151] text-left">
              Loading face detection model...
            </div>
          )}
          
          <div className="relative w-full aspect-square rounded-full overflow-hidden bg-black">
            <video 
              ref={videoRef} 
              playsInline 
              muted 
              className="w-full h-full block bg-black object-cover -scale-x-100 origin-center"
            />
            <canvas
              ref={faceCanvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none z-[2]"
            />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 pointer-events-none z-[3]">
              <circle cx="50" cy="50" r="44" fill="none" stroke="#22c55e" strokeWidth="2" strokeDasharray="1 3" />
            </svg>
          </div>
          
          {!state.livenessFailed && (
            <div className="bg-gradient-to-b from-[rgba(17,24,39,0.9)] to-[rgba(17,24,39,0.6)] text-[#e5e7eb] p-4 rounded-2xl text-base border border-[#30363d]">
              <div className="font-bold mb-2.5 text-[22px] text-white">Liveness Check</div>
              <div className="mb-2.5 text-base">{state.livenessInstruction}</div>
              <div className="grid gap-2.5 text-lg">
                <div className={state.livenessStage === "CENTER" || state.livenessStage === "LEFT" || state.livenessStage === "RIGHT" || state.livenessStage === "DONE" ? "opacity-100" : "opacity-40"}>
                  1. Look Straight
                </div>
                <div className={state.livenessStage === "RIGHT" || state.livenessStage === "DONE" ? "opacity-100" : "opacity-40"}>
                  2. Turn your face right
                </div>
                <div className={state.livenessStage === "DONE" ? "opacity-100" : "opacity-30"}>
                  3. Turn your face left
                </div>
              </div>
            </div>
          )}
          
          {showRetryButton && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRetrying || state.loading}
              className="py-3.5 px-4 rounded-xl text-base font-bold border-none transition-colors bg-[#f59e0b] text-[#0b0f17] cursor-pointer hover:bg-[#d97706] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRetrying ? "Retrying..." : "Retry Face Registration"}
            </button>
          )}
          
          <button
            type="button"
            disabled={!state.cameraReady || state.loading || (!state.livenessFailed && state.livenessStage !== "DONE") || showRetryButton}
            onClick={handleFaceCapture}
            className={`py-3.5 px-4 rounded-xl text-base font-bold border-none transition-colors ${
              state.cameraReady && !state.loading && (state.livenessFailed || state.livenessStage === "DONE") && !showRetryButton
                ? "bg-[#22c55e] text-[#0b0f17] cursor-pointer hover:bg-[#16a34a]"
                : "bg-[#374151] text-[#e5e7eb] cursor-not-allowed"
            }`}
          >
            {state.loading
              ? "Capturing..."
              : (state.livenessFailed || state.livenessStage === "DONE")
                ? "Capture & Continue"
                : "Complete steps to continue"}
          </button>
          
          <button
            type="button"
            onClick={handleRestart}
            disabled={state.loading || isRetrying}
            className={`py-3 px-4 rounded-[10px] text-[15px] font-semibold border-none w-full transition-colors ${
              (state.loading || isRetrying) ? "bg-[#374151] text-[#e5e7eb] cursor-not-allowed opacity-50" : "bg-[#374151] text-[#e5e7eb] cursor-pointer hover:bg-[#4b5563]"
            }`}
          >
            Restart
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

export default FaceScanModal;

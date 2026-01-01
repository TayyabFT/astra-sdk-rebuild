import { useRef, useEffect } from 'react';
import DocumentUploadModal from './DocumentUploadModal';
import { useCamera } from '../features/faceScan/hooks/useCamera';
import { useFaceScan } from '../features/faceScan/hooks/useFaceScan';
import '../index.css';

interface FaceScanModalProps {
  onClose: () => void;
  onComplete?: (capturedImage: string) => void;
}

function FaceScanModal({ onClose, onComplete }: FaceScanModalProps) {
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const { videoRef, cameraReady, stopCamera } = useCamera();
  const { state, setState, refs, handleFaceCapture } = useFaceScan(videoRef, faceCanvasRef);

  // Sync camera ready state
  useEffect(() => {
    setState(prev => ({ ...prev, cameraReady }));
  }, [cameraReady, setState]);

  const handleRetry = () => {
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

  return (
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
          
          <button
            type="button"
            disabled={!state.cameraReady || state.loading || (!state.livenessFailed && state.livenessStage !== "DONE")}
            onClick={handleFaceCapture}
            className={`py-3.5 px-4 rounded-xl text-base font-bold border-none transition-colors ${
              state.cameraReady && !state.loading && (state.livenessFailed || state.livenessStage === "DONE")
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
            onClick={handleRetry}
            disabled={state.loading}
            className={`py-3 px-4 rounded-[10px] text-[15px] font-semibold border-none w-full transition-colors ${
              state.loading ? "bg-[#374151] text-[#e5e7eb] cursor-not-allowed opacity-50" : "bg-[#374151] text-[#e5e7eb] cursor-pointer hover:bg-[#4b5563]"
            }`}
          >
            Restart
          </button>
        </div>
      </div>
    </div>
  );
}

export default FaceScanModal;

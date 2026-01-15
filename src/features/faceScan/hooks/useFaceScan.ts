import { useRef, useState, useEffect, useCallback } from 'react';
import { FaceMeshService } from '../../../services/faceMeshService';
import type { LivenessStage } from '../../../services/faceMeshService';
import type { FaceScanState, LivenessRefs } from '../types';

export interface FaceScanCallbacks {
  onFaceCaptureComplete?: (imageData: string) => void;
  onLivenessFailedCallback?: (failed: boolean) => void;
  onFaceUpload?: (blob: Blob) => Promise<void>;
}

export function useFaceScan(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  callbacks?: FaceScanCallbacks
) {
  const [state, setState] = useState<FaceScanState>({
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

  const refs: LivenessRefs = {
    centerHold: useRef<number>(0),
    leftHold: useRef<number>(0),
    rightHold: useRef<number>(0),
    snapTriggered: useRef<boolean>(false),
    lastResultsAt: useRef<number>(0),
    livenessStage: useRef<LivenessStage>('CENTER'),
    cameraDriver: useRef<number | null>(null),
    modelLoaded: useRef<boolean>(false),
    livenessFailed: useRef<boolean>(false),
    handleFaceCapture: useRef<(() => void) | null>(null),
  };

  const livenessStateRef = useRef({
    centerHold: 0,
    leftHold: 0,
    rightHold: 0,
    snapTriggered: false,
    lastResultsAt: 0,
    stage: 'CENTER' as LivenessStage,
    livenessReady: false,
    currentYaw: null as number | null,
    currentAbsYaw: null as number | null,
    livenessCompleted: false,
  });

  // Sync refs with state
  useEffect(() => {
    livenessStateRef.current.centerHold = refs.centerHold.current;
    livenessStateRef.current.leftHold = refs.leftHold.current;
    livenessStateRef.current.rightHold = refs.rightHold.current;
    livenessStateRef.current.snapTriggered = refs.snapTriggered.current;
    livenessStateRef.current.lastResultsAt = refs.lastResultsAt.current;
    livenessStateRef.current.stage = state.livenessStage;
    livenessStateRef.current.livenessReady = state.livenessReady;
  }, [state.livenessStage, state.livenessReady]);

  useEffect(() => {
    refs.livenessStage.current = state.livenessStage;
  }, [state.livenessStage]);

  const setStage = useCallback((next: LivenessStage) => {
    refs.livenessStage.current = next;
    livenessStateRef.current.stage = next;
    setState(prev => ({ ...prev, livenessStage: next }));
  }, []);

  const handleFaceCapture = useCallback(async () => {
    if (!videoRef.current) return;
    
    // Check if face is straight before capturing
    const centerThreshold = 0.05;
    const currentAbsYaw = livenessStateRef.current.currentAbsYaw;
    
    if (currentAbsYaw === null || currentAbsYaw === undefined) {
      setState(prev => ({
        ...prev,
        livenessInstruction: "Please position your face in front of the camera",
      }));
      return;
    }
    
    if (currentAbsYaw >= centerThreshold) {
      setState(prev => ({
        ...prev,
        livenessInstruction: "Please look straight at the camera before capturing",
      }));
      return;
    }
    
    setState(prev => ({ ...prev, loading: true }));
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      
      // Convert data URL to blob
      const blob = await (await fetch(dataUrl)).blob();
      
      // Upload face scan if callback provided
      if (callbacks?.onFaceUpload) {
        try {
          await callbacks.onFaceUpload(blob);
          setState(prev => ({
            ...prev,
            capturedImage: dataUrl,
            allStepsCompleted: true,
            livenessInstruction: "Face captured and uploaded successfully!",
            loading: false,
          }));
        } catch (uploadError: any) {
          throw new Error(uploadError.message || 'Failed to upload face scan');
        }
      } else {
        setState(prev => ({
          ...prev,
          capturedImage: dataUrl,
          allStepsCompleted: true,
          livenessInstruction: "Face captured successfully!",
          loading: false,
        }));
      }
      
      // Call completion callback
      if (callbacks?.onFaceCaptureComplete) {
        callbacks.onFaceCaptureComplete(dataUrl);
      }
      
      setTimeout(() => {
        setState(prev => ({ ...prev, showDocumentUpload: true }));
      }, 500);
    } catch (err: any) {
      console.error('Error capturing image:', err);
      setState(prev => ({
        ...prev,
        livenessInstruction: err.message || 'Error capturing image. Please try again.',
        loading: false,
      }));
    }
  }, [callbacks]);

  useEffect(() => {
    refs.handleFaceCapture.current = handleFaceCapture;
  }, [handleFaceCapture]);

  useEffect(() => {
    if (!state.cameraReady) return;
    
    let service: FaceMeshService | null = null;
    let initTimeoutId: number | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        service = new FaceMeshService(
          videoRef,
          canvasRef,
          refs.cameraDriver,
          livenessStateRef,
          {
            onModelLoaded: () => {
              if (cancelled) return;
              setState(prev => ({
                ...prev,
                modelLoaded: true,
                modelLoading: false,
              }));
              refs.modelLoaded.current = true;
            },
            onModelFailed: (error) => {
              if (cancelled) return;
              setState(prev => ({
                ...prev,
                livenessFailed: true,
                modelLoading: false,
                modelLoaded: false,
              }));
              refs.livenessFailed.current = true;
              console.error("mediapipe facemesh init error", error);
            },
            onLivenessUpdate: (stage, instruction) => {
              if (cancelled) return;
              setState(prev => ({
                ...prev,
                livenessStage: stage,
                livenessInstruction: instruction,
                livenessReady: true,
              }));
              livenessStateRef.current.stage = stage;
              refs.livenessStage.current = stage;
              // Sync hold counts from service state
              refs.centerHold.current = livenessStateRef.current.centerHold;
              refs.leftHold.current = livenessStateRef.current.leftHold;
              refs.rightHold.current = livenessStateRef.current.rightHold;
              refs.snapTriggered.current = livenessStateRef.current.snapTriggered;
            },
            onCaptureTrigger: () => {
              if (cancelled) return;
              if (refs.handleFaceCapture.current) {
                refs.handleFaceCapture.current();
              }
            },
          }
        );

        await service.initialize();
      } catch (e) {
        if (!cancelled && refs.livenessFailed.current === false) {
          setState(prev => ({
            ...prev,
            livenessFailed: true,
            modelLoading: false,
            modelLoaded: false,
          }));
          refs.livenessFailed.current = true;
        }
      }
    };

    initTimeoutId = window.setTimeout(() => {
      if (!cancelled && !refs.modelLoaded.current && !refs.livenessFailed.current) {
        setState(prev => ({
          ...prev,
          livenessFailed: true,
          modelLoading: false,
        }));
        refs.livenessFailed.current = true;
      }
    }, 8000);

    start();

    // Cleanup function - must return a function, not a Promise
    return () => {
      cancelled = true;
      if (initTimeoutId) {
        window.clearTimeout(initTimeoutId);
        initTimeoutId = null;
      }
      if (service) {
        service.cleanup();
        service = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.cameraReady]);

  return {
    state,
    setState,
    refs,
    setStage,
    handleFaceCapture,
  };
}


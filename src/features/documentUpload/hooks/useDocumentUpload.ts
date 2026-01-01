import { useState, useRef, useEffect } from 'react';
import { SimpleDocumentDetectionService } from '../../../services/simpleDocumentDetectionService';
import type { DocumentType } from '../types';
import type { DocumentUploadCallbacks } from '../types';
import type { DocumentUploadState } from '../types';

export function useDocumentUpload(callbacks?: DocumentUploadCallbacks) {
  const [state, setState] = useState<DocumentUploadState>({
    docType: 'CNIC',
    isDocScanMode: false,
    docPreviewUrl: null,
    docFileName: '',
    loading: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const docVideoRef = useRef<HTMLVideoElement>(null);
  const docCanvasRef = useRef<HTMLCanvasElement>(null);
  const docOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const docStreamRef = useRef<MediaStream | null>(null);
  const docPendingBlobRef = useRef<Blob | null>(null);
  const processingRef = useRef<number | null>(null);
  const detectionServiceRef = useRef<SimpleDocumentDetectionService | null>(null);

  const getRearStream = async (): Promise<MediaStream> => {
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1920 } }, audio: false } as MediaStreamConstraints,
      { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1920 } }, audio: false } as unknown as MediaStreamConstraints,
      { video: { facingMode: { exact: 'environment' }, width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false } as MediaStreamConstraints,
      { video: { facingMode: 'environment', width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false } as unknown as MediaStreamConstraints,
    ];

    for (const c of attempts) {
      try { return await navigator.mediaDevices.getUserMedia(c); } catch { /* continue */ }
    }

    let temp: MediaStream | null = null;
    try {
      temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (e) {
      throw e;
    } finally {
      try { temp?.getTracks().forEach(t => t.stop()); } catch {}
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(d => d.kind === 'videoinput');
    const rear = videoInputs.find(d => /back|rear|environment/i.test(d.label));
    const chosen = rear || videoInputs.find(d => !/front|user|face/i.test(d.label)) || videoInputs[0];
    if (!chosen) throw new Error('No video input devices found');

    const byDeviceAttempts: MediaStreamConstraints[] = [
      { video: { deviceId: { exact: chosen.deviceId }, width: { ideal: 1280 }, height: { ideal: 1920 } }, audio: false },
      { video: { deviceId: { exact: chosen.deviceId }, width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false },
      { video: { deviceId: { exact: chosen.deviceId } }, audio: false } as MediaStreamConstraints,
    ];
    for (const c of byDeviceAttempts) {
      try { return await navigator.mediaDevices.getUserMedia(c); } catch { /* continue */ }
    }

    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  };

  const startDocCamera = async () => {
    try {
      if (docStreamRef.current) {
        try { docStreamRef.current.getTracks().forEach(t => t.stop()); } catch {}
        docStreamRef.current = null;
      }
      const stream = await getRearStream();
      if (docVideoRef.current) {
        docVideoRef.current.srcObject = stream;
        await docVideoRef.current.play().catch(() => {});
      }
      docStreamRef.current = stream;
    } catch (e: any) {
      console.error('Could not start document camera:', e);
      setState(prev => ({ ...prev, isDocScanMode: false }));
      if (callbacks?.onError) {
        callbacks.onError(e);
      }
    }
  };

  const handleDocumentUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (state.loading) return;
    const file = event.target.files?.[0];
    if (!file) return;
    setState(prev => ({ ...prev, docFileName: file.name || '' }));
    try {
      const objectUrl = URL.createObjectURL(file);
      setState(prev => ({ ...prev, docPreviewUrl: objectUrl }));
      docPendingBlobRef.current = file;
    } catch (err: any) {
      console.error('Could not preview document:', err);
      if (callbacks?.onError) {
        callbacks.onError(err);
      }
    }
  };

  const handleConfirmDocumentUpload = async () => {
    if (state.loading || !docPendingBlobRef.current) return;
    setState(prev => ({ ...prev, loading: true }));
    try {
      if (callbacks?.onUpload) {
        callbacks.onUpload(docPendingBlobRef.current as File, state.docType);
      }
      setState(prev => ({
        ...prev,
        docPreviewUrl: null,
        docFileName: '',
        loading: false,
      }));
      docPendingBlobRef.current = null;
    } catch (err: any) {
      console.error('Document upload failed:', err);
      setState(prev => ({ ...prev, loading: false }));
      if (callbacks?.onError) {
        callbacks.onError(err);
      }
    }
  };

  const handleManualCapture = async () => {
    if (!detectionServiceRef.current || state.loading) return;
    
    setState(prev => ({ ...prev, loading: true }));
    try {
      const file = await detectionServiceRef.current.captureDocument();
      
      if (file) {
        // Create preview URL
        const objectUrl = URL.createObjectURL(file);
        setState(prev => ({
          ...prev,
          docPreviewUrl: objectUrl,
          isDocScanMode: false,
          loading: false,
        }));
        
        docPendingBlobRef.current = file;
        
        // Stop camera and detection
        if (docStreamRef.current) {
          docStreamRef.current.getTracks().forEach((t) => t.stop());
          docStreamRef.current = null;
        }
        
        if (detectionServiceRef.current) {
          detectionServiceRef.current.cleanup();
          detectionServiceRef.current = null;
        }
        
        if (callbacks?.onScan) {
          callbacks.onScan(file, state.docType);
        }
      } else {
        throw new Error('Failed to capture document');
      }
    } catch (err: any) {
      console.error('Manual capture failed:', err);
      setState(prev => ({ ...prev, loading: false }));
      if (callbacks?.onError) {
        callbacks.onError(err);
      }
    }
  };

  useEffect(() => {
    if (state.isDocScanMode) {
      const initDetection = async () => {
        await startDocCamera();
        
        // Wait for video to be ready
        if (docVideoRef.current) {
          const waitForVideo = () => {
            return new Promise<void>((resolve) => {
              const checkReady = () => {
                if (docVideoRef.current && docVideoRef.current.readyState >= 2) {
                  resolve();
                } else {
                  setTimeout(checkReady, 100);
                }
              };
              checkReady();
            });
          };
          
          await waitForVideo();
          
          // Initialize detection service
          if (docVideoRef.current && docCanvasRef.current && docOverlayCanvasRef.current) {
            const service = new SimpleDocumentDetectionService(
              docVideoRef,
              docCanvasRef,
              docOverlayCanvasRef,
              processingRef,
              {
                onDetection: () => {
                  // Optional: Update UI based on detection status
                  // You can add state for detection quality/status here if needed
                }
              }
            );
            
            detectionServiceRef.current = service;
            service.start().catch((err) => {
              console.error('Document detection failed:', err);
              if (callbacks?.onError) {
                callbacks.onError(err);
              }
            });
          }
        }
      };
      
      initDetection();
    }
    
    return () => {
      if (docStreamRef.current) {
        docStreamRef.current.getTracks().forEach((t) => t.stop());
        docStreamRef.current = null;
      }
      if (detectionServiceRef.current) {
        detectionServiceRef.current.cleanup();
        detectionServiceRef.current = null;
      }
      if (processingRef.current) {
        cancelAnimationFrame(processingRef.current);
        processingRef.current = null;
      }
    };
  }, [state.isDocScanMode]);

  return {
    state,
    setState,
    fileInputRef,
    docVideoRef,
    docCanvasRef,
    docOverlayCanvasRef,
    handleDocumentUpload,
    handleConfirmDocumentUpload,
    handleManualCapture,
    startDocCamera,
  };
}


import { useState, useRef, useEffect } from 'react';
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
  const docStreamRef = useRef<MediaStream | null>(null);
  const docPendingBlobRef = useRef<Blob | null>(null);

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
    if (!docVideoRef.current || state.loading) return;
    
    setState(prev => ({ ...prev, loading: true }));
    try {
      const video = docVideoRef.current;
      
      // Create canvas and capture current frame
      const canvas = document.createElement('canvas');
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      
      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0, width, height);
      
      // Convert to blob
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob: Blob | null) => {
          resolve(blob || new Blob());
        }, 'image/jpeg', 0.92);
      });
      
      const file = new File([blob], 'document.jpg', { type: 'image/jpeg' });
      
      // Create preview URL
      const objectUrl = URL.createObjectURL(file);
      setState(prev => ({
        ...prev,
        docPreviewUrl: objectUrl,
        isDocScanMode: false,
        loading: false,
      }));
      
      docPendingBlobRef.current = file;
      
      // Stop camera
      if (docStreamRef.current) {
        docStreamRef.current.getTracks().forEach((t) => t.stop());
        docStreamRef.current = null;
      }
      
      if (callbacks?.onScan) {
        callbacks.onScan(file, state.docType);
      }
    } catch (err: any) {
      console.error('Capture failed:', err);
      setState(prev => ({ ...prev, loading: false }));
      if (callbacks?.onError) {
        callbacks.onError(err);
      }
    }
  };

  useEffect(() => {
    if (state.isDocScanMode) {
      startDocCamera();
    }
    
    return () => {
      if (docStreamRef.current) {
        docStreamRef.current.getTracks().forEach((t) => t.stop());
        docStreamRef.current = null;
      }
    };
  }, [state.isDocScanMode]);

  return {
    state,
    setState,
    fileInputRef,
    docVideoRef,
    handleDocumentUpload,
    handleConfirmDocumentUpload,
    handleManualCapture,
    startDocCamera,
  };
}


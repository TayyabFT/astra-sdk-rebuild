import { FaceMesh, FACEMESH_TESSELATION, FACEMESH_FACE_OVAL, FACEMESH_LEFT_EYE, FACEMESH_RIGHT_EYE, FACEMESH_LIPS } from '@mediapipe/face_mesh';
import { drawConnectors, drawLandmarks as drawMPLandmarks } from '@mediapipe/drawing_utils';

export type LivenessStage = 'CENTER' | 'LEFT' | 'RIGHT' | 'SNAP' | 'DONE';

export interface FaceMeshServiceCallbacks {
  onFaceDetected?: (faceOnCanvas: Array<{ x: number; y: number }>) => void;
  onLivenessUpdate?: (stage: LivenessStage, instruction: string) => void;
  onModelLoaded?: () => void;
  onModelFailed?: (error: Error) => void;
  onCaptureTrigger?: () => void;
}

export interface LivenessState {
  centerHold: number;
  leftHold: number;
  rightHold: number;
  snapTriggered: boolean;
  lastResultsAt: number;
  stage: LivenessStage;
  livenessReady: boolean;
  currentYaw: number | null;
  currentAbsYaw: number | null;
  livenessCompleted: boolean;
}

export class FaceMeshService {
  private faceMesh: FaceMesh | null = null;
  private videoRef: React.RefObject<HTMLVideoElement | null>;
  private canvasRef: React.RefObject<HTMLCanvasElement | null>;
  private callbacks: FaceMeshServiceCallbacks;
  private cameraDriverRef: React.MutableRefObject<number | null>;
  private livenessStateRef: React.MutableRefObject<LivenessState>;
  private cancelled = false;

  constructor(
    videoRef: React.RefObject<HTMLVideoElement | null>,
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    cameraDriverRef: React.MutableRefObject<number | null>,
    livenessStateRef: React.MutableRefObject<LivenessState>,
    callbacks: FaceMeshServiceCallbacks
  ) {
    this.videoRef = videoRef;
    this.canvasRef = canvasRef;
    this.cameraDriverRef = cameraDriverRef;
    this.livenessStateRef = livenessStateRef;
    this.callbacks = callbacks;
  }

  private drawOverlays(ctx: CanvasRenderingContext2D, normalized: Array<{ x: number; y: number }>) {
    drawConnectors(ctx, normalized as any, FACEMESH_TESSELATION, { color: "#60a5fa", lineWidth: 0.5 });
    drawConnectors(ctx, normalized as any, FACEMESH_FACE_OVAL, { color: "#f59e0b", lineWidth: 2 });
    drawConnectors(ctx, normalized as any, FACEMESH_LEFT_EYE, { color: "#10b981", lineWidth: 1.5 });
    drawConnectors(ctx, normalized as any, FACEMESH_RIGHT_EYE, { color: "#ef4444", lineWidth: 1.5 });
    drawConnectors(ctx, normalized as any, FACEMESH_LIPS, { color: "#a855f7", lineWidth: 1.5 });
    drawMPLandmarks(ctx, normalized as any, { color: "#2563eb", lineWidth: 0, radius: 1.5 });
  }

  private processResults(results: any) {
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const displayW = (canvas.parentElement as HTMLElement)?.clientWidth || canvas.width;
    const displayH = (canvas.parentElement as HTMLElement)?.clientHeight || canvas.height;
    if (canvas.width !== Math.round(displayW * dpr) || canvas.height !== Math.round(displayH * dpr)) {
      canvas.width = Math.round(displayW * dpr);
      canvas.height = Math.round(displayH * dpr);
    }
    const w = canvas.width, h = canvas.height;
    
    ctx.fillStyle = 'rgb(0, 0, 0)';
    ctx.fillRect(0, 0, w, h);
    
    const faces = results.multiFaceLandmarks as Array<Array<{ x: number; y: number }>> | undefined;
    const face = faces && faces[0];
    
    if (face) {
      const vid = this.videoRef.current as HTMLVideoElement | null;
      const vidW = Math.max(1, vid?.videoWidth || displayW);
      const vidH = Math.max(1, vid?.videoHeight || displayH);
      const scale = Math.max(w / vidW, h / vidH);
      const offsetX = (w - vidW * scale) / 2;
      const offsetY = (h - vidH * scale) / 2;
      
      const faceOnCanvas = face.map(p => {
        const mappedX = (p.x * vidW * scale + offsetX) / w;
        return {
          x: 1 - mappedX,
          y: (p.y * vidH * scale + offsetY) / h,
        };
      });

      const guideCX = w / 2;
      const guideCY = h / 2;
      const guideR = Math.min(w, h) * 0.45;

      ctx.save();
      ctx.beginPath();
      ctx.arc(guideCX, guideCY, guideR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(vid!, offsetX, offsetY, vidW * scale, vidH * scale);
      ctx.restore();

      this.drawOverlays(ctx, faceOnCanvas as any);
      
      this.livenessStateRef.current.lastResultsAt = Date.now();
      
      if (this.callbacks.onFaceDetected) {
        this.callbacks.onFaceDetected(faceOnCanvas);
      }

      this.processLiveness(faceOnCanvas, w, h);
    } else {
      // Reset face orientation when no face is detected
      this.livenessStateRef.current.currentYaw = null;
      this.livenessStateRef.current.currentAbsYaw = null;
      
      const vid = this.videoRef.current as HTMLVideoElement | null;
      if (vid) {
        const vidW = Math.max(1, vid?.videoWidth || displayW);
        const vidH = Math.max(1, vid?.videoHeight || displayH);
        const scale = Math.max(w / vidW, h / vidH);
        const offsetX = (w - vidW * scale) / 2;
        const offsetY = (h - vidH * scale) / 2;
        
        const guideCX = w / 2;
        const guideCY = h / 2;
        const guideR = Math.min(w, h) * 0.45;
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(guideCX, guideCY, guideR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(vid, offsetX, offsetY, vidW * scale, vidH * scale);
        ctx.restore();
      }
      
      if (Date.now() - this.livenessStateRef.current.lastResultsAt > 2000) {
        if (this.callbacks.onLivenessUpdate) {
          this.callbacks.onLivenessUpdate(
            this.livenessStateRef.current.stage,
            "No face detected. Center your face in frame with good lighting."
          );
        }
      }
    }
  }

  private processLiveness(faceOnCanvas: Array<{ x: number; y: number }>, w: number, h: number) {
    const eyeA = faceOnCanvas[33];
    const eyeB = faceOnCanvas[263];
    const flipX = (p: any) => ({ x: 1 - p.x, y: p.y });
    const eA = flipX(eyeA);
    const eB = flipX(eyeB);
    const n1 = faceOnCanvas[1];
    const n4 = faceOnCanvas[4];
    const nT = flipX(n1 && n4 ? { x: (n1.x + n4.x) / 2, y: (n1.y + n4.y) / 2 } : (n1 || n4 || faceOnCanvas[197]));
    const leftEyeOuter = eA.x < eB.x ? eA : eB;
    const rightEyeOuter = eA.x < eB.x ? eB : eA;
    
    if (leftEyeOuter && rightEyeOuter && nT) {
      const faceWidth = Math.abs(rightEyeOuter.x - leftEyeOuter.x);
      const midX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
      const yaw = (nT.x - midX) / Math.max(1e-6, faceWidth);
      const absYaw = Math.abs(yaw);
      
      // Store current face orientation for capture validation
      this.livenessStateRef.current.currentYaw = yaw;
      this.livenessStateRef.current.currentAbsYaw = absYaw;
      
      const xs = faceOnCanvas.map(p => p.x), ys = faceOnCanvas.map(p => p.y);
      const minX = Math.min(...xs) * w, maxX = Math.max(...xs) * w;
      const minY = Math.min(...ys) * h, maxY = Math.max(...ys) * h;
      const boxCX = (minX + maxX) / 2, boxCY = (minY + maxY) / 2;
      const guideCX = w / 2;
      const guideCY = h / 2;
      const guideR = Math.min(w, h) * 0.45;
      const dx = boxCX - guideCX;
      const dy = boxCY - guideCY;
      const insideGuide = (dx * dx + dy * dy) <= (guideR * guideR)
        && (maxX - minX) <= guideR * 2 * 1.05 && (maxY - minY) <= guideR * 2 * 1.05;
      
      if (!this.livenessStateRef.current.livenessReady) {
        this.livenessStateRef.current.livenessReady = true;
      }
      
      const centerThreshold = 0.05;
      const leftThreshold = 0.08;
      const rightThreshold = 0.08;
      const holdFramesCenter = 12;
      const holdFramesTurn = 12;
      
      const state = this.livenessStateRef.current;
      
      if (state.stage === "CENTER") {
        if (!insideGuide) {
          if (this.callbacks.onLivenessUpdate) {
            this.callbacks.onLivenessUpdate(state.stage, "Center your face inside the circle");
          }
        } else if (absYaw < centerThreshold) {
          state.centerHold += 1;
          if (state.centerHold >= holdFramesCenter) {
            // Only transition to LEFT if liveness check hasn't been completed yet
            if (!state.livenessCompleted) {
              const newStage: LivenessStage = "LEFT";
              state.stage = newStage;
              state.centerHold = 0;
              if (this.callbacks.onLivenessUpdate) {
                this.callbacks.onLivenessUpdate(newStage, "Turn your face LEFT");
              }
            }
          }
        } else {
          state.centerHold = 0;
          if (this.callbacks.onLivenessUpdate) {
            this.callbacks.onLivenessUpdate(state.stage, yaw > 0 ? "Move your face slightly LEFT" : "Move your face slightly RIGHT");
          }
        }
      } else if (state.stage === "LEFT") {
        if (faceWidth < 0.08) {
          if (this.callbacks.onLivenessUpdate) {
            this.callbacks.onLivenessUpdate(state.stage, "Move closer to the camera");
          }
        } else if (yaw < -leftThreshold) {
          state.leftHold += 1;
          if (state.leftHold >= holdFramesTurn) {
            const newStage: LivenessStage = "RIGHT";
            state.stage = newStage;
            state.leftHold = 0;
            if (this.callbacks.onLivenessUpdate) {
              this.callbacks.onLivenessUpdate(newStage, "Great! Now turn your face RIGHT");
            }
          }
        } else {
          state.leftHold = 0;
          if (this.callbacks.onLivenessUpdate) {
            this.callbacks.onLivenessUpdate(state.stage, yaw > rightThreshold ? "You're facing right. Turn LEFT" : "Turn a bit more LEFT");
          }
        }
      } else if (state.stage === "RIGHT") {
        if (faceWidth < 0.08) {
          if (this.callbacks.onLivenessUpdate) {
            this.callbacks.onLivenessUpdate(state.stage, "Move closer to the camera");
          }
        } else if (yaw > rightThreshold) {
          state.rightHold += 1;
          if (state.rightHold >= holdFramesTurn) {
            state.rightHold = 0;
            // Mark liveness as completed and transition to DONE stage
            state.livenessCompleted = true;
            const newStage: LivenessStage = "DONE";
            state.stage = newStage;
            state.centerHold = 0;
            if (this.callbacks.onLivenessUpdate) {
              this.callbacks.onLivenessUpdate(newStage, "Great! Now look straight at the camera");
            }
          }
        } else {
          state.rightHold = 0;
          if (this.callbacks.onLivenessUpdate) {
            this.callbacks.onLivenessUpdate(state.stage, yaw < -leftThreshold ? "You're facing left. Turn RIGHT" : "Turn a bit more RIGHT");
          }
        }
      } else if (state.stage === "DONE") {
        // In DONE stage, wait for face to be straight before capturing (no center check needed)
        // Reduced threshold for easier capture when face is straight
        const reducedThreshold = 0.08; // More lenient threshold
        if (absYaw < reducedThreshold) {
          state.centerHold += 1;
          if (state.centerHold >= holdFramesCenter && !state.snapTriggered) {
            state.snapTriggered = true;
            if (this.callbacks.onLivenessUpdate) {
              this.callbacks.onLivenessUpdate(state.stage, "Capturing...");
            }
            if (this.callbacks.onCaptureTrigger) {
              this.callbacks.onCaptureTrigger();
            }
          }
        } else {
          state.centerHold = 0;
          if (this.callbacks.onLivenessUpdate) {
            this.callbacks.onLivenessUpdate(state.stage, "Please look straight at the camera");
          }
        }
      }
    }
  }

  private waitForVideoReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 100;
      
      const checkReady = () => {
        if (this.cancelled) {
          reject(new Error('Cancelled'));
          return;
        }
        
        const video = this.videoRef.current;
        if (
          video &&
          video.readyState >= 2 &&
          video.videoWidth > 0 &&
          video.videoHeight > 0 &&
          !isNaN(video.videoWidth) &&
          !isNaN(video.videoHeight)
        ) {
          resolve();
        } else if (attempts >= maxAttempts) {
          if (video) {
            resolve();
          } else {
            reject(new Error('Video not ready'));
          }
        } else {
          attempts++;
          requestAnimationFrame(checkReady);
        }
      };
      checkReady();
    });
  }

  async initialize(): Promise<void> {
    try {
      const fm = new FaceMesh({ 
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}` 
      });
      fm.setOptions({
        selfieMode: true,
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      } as any);
      
      this.faceMesh = fm;
      
      if (this.cancelled) return;
      
      if (this.callbacks.onModelLoaded) {
        this.callbacks.onModelLoaded();
      }
      
      fm.onResults((results) => {
        if (!this.cancelled) {
          this.processResults(results);
        }
      });
      
      if (this.videoRef.current) {
        try {
          await this.waitForVideoReady();
        } catch (error) {
          if (!this.cancelled) {
            console.debug('Video ready check failed, continuing anyway:', error);
          }
        }
        
        const tick = async () => {
          if (this.cancelled) return;
          if (!this.videoRef.current || !this.faceMesh) return;
          
          const video = this.videoRef.current;
          if (
            video.readyState >= 2 &&
            video.videoWidth > 0 &&
            video.videoHeight > 0 &&
            !isNaN(video.videoWidth) &&
            !isNaN(video.videoHeight)
          ) {
            try {
              await this.faceMesh.send({ image: video as HTMLVideoElement });
            } catch (error) {
              if (!this.cancelled) {
                console.debug('MediaPipe send error (non-critical):', error);
              }
            }
          }
          
          if (!this.cancelled) {
            this.cameraDriverRef.current = requestAnimationFrame(tick);
          }
        };
        
        this.cameraDriverRef.current = requestAnimationFrame(tick);
      }
    } catch (e) {
      if (!this.cancelled && this.callbacks.onModelFailed) {
        this.callbacks.onModelFailed(e as Error);
      }
      throw e;
    }
  }

  cleanup(): void {
    this.cancelled = true;
    if (this.cameraDriverRef.current) {
      cancelAnimationFrame(this.cameraDriverRef.current);
      this.cameraDriverRef.current = null;
    }
    if (this.faceMesh) {
      try {
        (this.faceMesh as any).close?.();
      } catch {}
      this.faceMesh = null;
    }
  }
}


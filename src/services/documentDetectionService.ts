export interface DocumentCorners {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

export interface DocumentDetectionResult {
  detected: boolean;
  corners: DocumentCorners | null;
  quality: number; // 0-1, based on stability, sharpness, alignment
  stable: boolean;
}

export interface DocumentDetectionCallbacks {
  onDetection?: (result: DocumentDetectionResult) => void;
  onAutoCapture?: (correctedImage: File) => void;
}

declare global {
  interface Window {
    cv: any;
  }
}

export class DocumentDetectionService {
  private videoRef: React.RefObject<HTMLVideoElement | null>;
  private canvasRef: React.RefObject<HTMLCanvasElement | null>;
  private overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  private callbacks: DocumentDetectionCallbacks;
  private processingRef: React.MutableRefObject<number | null>;
  private cancelled = false;
  private cv: any = null;
  private cvReady = false;
  
  // Detection state
  private stableFrames = 0;
  private requiredStableFrames = 15; // ~0.5 seconds at 30fps
  private lastCorners: DocumentCorners | null = null;
  private cornerHistory: DocumentCorners[] = [];
  private readonly maxHistory = 10;

  constructor(
    videoRef: React.RefObject<HTMLVideoElement | null>,
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>,
    processingRef: React.MutableRefObject<number | null>,
    callbacks: DocumentDetectionCallbacks
  ) {
    this.videoRef = videoRef;
    this.canvasRef = canvasRef;
    this.overlayCanvasRef = overlayCanvasRef;
    this.processingRef = processingRef;
    this.callbacks = callbacks;
  }

  async loadOpenCV(): Promise<void> {
    if (this.cvReady && window.cv) {
      this.cv = window.cv;
      return;
    }

    return new Promise((resolve, reject) => {
      if (window.cv && window.cv.Mat) {
        this.cv = window.cv;
        this.cvReady = true;
        resolve();
        return;
      }

      // Check if script already exists
      const existingScript = document.querySelector('script[data-opencv]');
      if (existingScript) {
        const checkReady = setInterval(() => {
          if (window.cv && window.cv.Mat) {
            clearInterval(checkReady);
            this.cv = window.cv;
            this.cvReady = true;
            resolve();
          }
        }, 100);
        return;
      }

      const script = document.createElement('script');
      script.setAttribute('data-opencv', 'true');
      // Using OpenCV.js from official docs (version 4.10.0)
      script.src = 'https://docs.opencv.org/4.10.0/opencv.js';
      script.async = true;
      script.onload = () => {
        // Wait for OpenCV to initialize
        const checkReady = setInterval(() => {
          if (window.cv && window.cv.Mat) {
            clearInterval(checkReady);
            this.cv = window.cv;
            this.cvReady = true;
            resolve();
          }
        }, 100);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkReady);
          if (!this.cvReady) {
            reject(new Error('OpenCV.js initialization timeout'));
          }
        }, 10000);
      };
      script.onerror = () => {
        reject(new Error('Failed to load OpenCV.js'));
      };
      document.head.appendChild(script);
    });
  }

  private findDocumentContour(edges: any): any {
    const contours = new this.cv.MatVector();
    const hierarchy = new this.cv.Mat();
    this.cv.findContours(edges, contours, hierarchy, this.cv.RETR_EXTERNAL, this.cv.CHAIN_APPROX_SIMPLE);

    let largestContour: any = null;
    let maxArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = this.cv.contourArea(contour);
      
      if (area > maxArea && area > 10000) { // Minimum area threshold
        const peri = this.cv.arcLength(contour, true);
        const approx = new this.cv.Mat();
        this.cv.approxPolyDP(contour, approx, 0.02 * peri, true);
        
        // Check if it's a quadrilateral (4 corners)
        if (approx.rows === 4) {
          maxArea = area;
          largestContour = approx;
        } else {
          approx.delete();
        }
      }
      contour.delete();
    }

    hierarchy.delete();
    contours.delete();

    return largestContour;
  }

  private orderPoints(contour: any): DocumentCorners | null {
    if (!contour || contour.rows !== 4) return null;

    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 4; i++) {
      const point = contour.data32S;
      points.push({
        x: point[i * 2],
        y: point[i * 2 + 1]
      });
    }

    // Sort points: top-left, top-right, bottom-right, bottom-left
    points.sort((a, b) => a.y - b.y);
    const topPoints = points.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottomPoints = points.slice(2, 4).sort((a, b) => a.x - b.x);

    return {
      topLeft: topPoints[0],
      topRight: topPoints[1],
      bottomRight: bottomPoints[1],
      bottomLeft: bottomPoints[0]
    };
  }

  private calculateQuality(corners: DocumentCorners, width: number, height: number): number {
    if (!corners) return 0;

    // Check if corners are within frame bounds
    const margin = 20;
    const inBounds = 
      corners.topLeft.x > margin && corners.topLeft.y > margin &&
      corners.topRight.x < width - margin && corners.topRight.y > margin &&
      corners.bottomRight.x < width - margin && corners.bottomRight.y < height - margin &&
      corners.bottomLeft.x > margin && corners.bottomLeft.y < height - margin;

    if (!inBounds) return 0;

    // Calculate aspect ratio (should be close to document ratio)
    const width1 = Math.sqrt(
      Math.pow(corners.topRight.x - corners.topLeft.x, 2) +
      Math.pow(corners.topRight.y - corners.topLeft.y, 2)
    );
    const width2 = Math.sqrt(
      Math.pow(corners.bottomRight.x - corners.bottomLeft.x, 2) +
      Math.pow(corners.bottomRight.y - corners.bottomLeft.y, 2)
    );
    const height1 = Math.sqrt(
      Math.pow(corners.bottomLeft.x - corners.topLeft.x, 2) +
      Math.pow(corners.bottomLeft.y - corners.topLeft.y, 2)
    );
    const height2 = Math.sqrt(
      Math.pow(corners.bottomRight.x - corners.topRight.x, 2) +
      Math.pow(corners.bottomRight.y - corners.topRight.y, 2)
    );

    const avgWidth = (width1 + width2) / 2;
    const avgHeight = (height1 + height2) / 2;
    const aspectRatio = avgWidth / avgHeight;

    // Check if aspect ratio is reasonable (between 0.5 and 2.0)
    const aspectScore = aspectRatio >= 0.5 && aspectRatio <= 2.0 ? 1 : 0.5;

    // Check corner stability
    let stabilityScore = 1;
    if (this.cornerHistory.length > 0) {
      const lastCorners = this.cornerHistory[this.cornerHistory.length - 1];
      const cornerDistance = Math.sqrt(
        Math.pow(corners.topLeft.x - lastCorners.topLeft.x, 2) +
        Math.pow(corners.topLeft.y - lastCorners.topLeft.y, 2) +
        Math.pow(corners.topRight.x - lastCorners.topRight.x, 2) +
        Math.pow(corners.topRight.y - lastCorners.topRight.y, 2)
      );
      stabilityScore = cornerDistance < 10 ? 1 : Math.max(0, 1 - cornerDistance / 50);
    }

    // Check if corners form a reasonable rectangle (angles should be ~90 degrees)
    const angle1 = Math.abs(
      Math.atan2(corners.topRight.y - corners.topLeft.y, corners.topRight.x - corners.topLeft.x) -
      Math.atan2(corners.bottomLeft.y - corners.topLeft.y, corners.bottomLeft.x - corners.topLeft.x)
    );
    const angle2 = Math.abs(
      Math.atan2(corners.bottomRight.y - corners.topRight.y, corners.bottomRight.x - corners.topRight.x) -
      Math.atan2(corners.topRight.y - corners.topLeft.y, corners.topRight.x - corners.topLeft.x)
    );
    const angleScore = (Math.abs(angle1 - Math.PI / 2) < 0.3 && Math.abs(angle2 - Math.PI / 2) < 0.3) ? 1 : 0.7;

    return (aspectScore * 0.3 + stabilityScore * 0.4 + angleScore * 0.3);
  }

  private isStable(corners: DocumentCorners): boolean {
    if (!this.lastCorners) {
      this.lastCorners = corners;
      this.stableFrames = 1;
      return false;
    }

    const threshold = 15; // pixels
    const distance = Math.sqrt(
      Math.pow(corners.topLeft.x - this.lastCorners.topLeft.x, 2) +
      Math.pow(corners.topLeft.y - this.lastCorners.topLeft.y, 2) +
      Math.pow(corners.topRight.x - this.lastCorners.topRight.x, 2) +
      Math.pow(corners.topRight.y - this.lastCorners.topRight.y, 2)
    );

    if (distance < threshold) {
      this.stableFrames++;
    } else {
      this.stableFrames = 0;
      this.lastCorners = corners;
    }

    return this.stableFrames >= this.requiredStableFrames;
  }

  private drawOverlay(corners: DocumentCorners | null, quality: number) {
    const overlayCanvas = this.overlayCanvasRef.current;
    if (!overlayCanvas) return;

    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    const width = overlayCanvas.width;
    const height = overlayCanvas.height;

    ctx.clearRect(0, 0, width, height);

    if (corners) {
      // Draw document edges
      ctx.strokeStyle = quality > 0.7 ? '#22c55e' : quality > 0.4 ? '#f59e0b' : '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
      ctx.lineTo(corners.topRight.x, corners.topRight.y);
      ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
      ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
      ctx.closePath();
      ctx.stroke();

      // Draw corner points
      const cornerColor = quality > 0.7 ? '#22c55e' : '#f59e0b';
      ctx.fillStyle = cornerColor;
      [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft].forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw quality indicator
      if (quality > 0.7) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
        ctx.fill();
      }
    }
  }

  private async correctPerspective(corners: DocumentCorners, src: any): Promise<File | null> {
    if (!this.cv || !this.cvReady) return null;

    try {
      const width = Math.max(
        Math.sqrt(Math.pow(corners.topRight.x - corners.topLeft.x, 2) + Math.pow(corners.topRight.y - corners.topLeft.y, 2)),
        Math.sqrt(Math.pow(corners.bottomRight.x - corners.bottomLeft.x, 2) + Math.pow(corners.bottomRight.y - corners.bottomLeft.y, 2))
      );
      const height = Math.max(
        Math.sqrt(Math.pow(corners.bottomLeft.x - corners.topLeft.x, 2) + Math.pow(corners.bottomLeft.y - corners.topLeft.y, 2)),
        Math.sqrt(Math.pow(corners.bottomRight.x - corners.topRight.x, 2) + Math.pow(corners.bottomRight.y - corners.topRight.y, 2))
      );

      const srcPoints = this.cv.matFromArray(4, 1, this.cv.CV_32FC2, [
        corners.topLeft.x, corners.topLeft.y,
        corners.topRight.x, corners.topRight.y,
        corners.bottomRight.x, corners.bottomRight.y,
        corners.bottomLeft.x, corners.bottomLeft.y
      ]);

      const dstPoints = this.cv.matFromArray(4, 1, this.cv.CV_32FC2, [
        0, 0,
        width, 0,
        width, height,
        0, height
      ]);

      const M = this.cv.getPerspectiveTransform(srcPoints, dstPoints);
      const dst = new this.cv.Mat();
      this.cv.warpPerspective(src, dst, M, new this.cv.Size(width, height));

      // Convert to image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      this.cv.imshow(canvas, dst);

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob: Blob | null) => {
          resolve(blob || new Blob());
        }, 'image/jpeg', 0.92);
      });

      const file = new File([blob], 'document_corrected.jpg', { type: 'image/jpeg' });

      // Cleanup
      srcPoints.delete();
      dstPoints.delete();
      M.delete();
      dst.delete();

      return file;
    } catch (error) {
      console.error('Perspective correction error:', error);
      return null;
    }
  }

  async processFrame(): Promise<void> {
    if (this.cancelled || !this.cvReady || !this.cv) return;
    
    const video = this.videoRef.current;
    const canvas = this.canvasRef.current;
    if (!video || !canvas) return;

    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

    try {
      // Sync canvas size with video
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      
      if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
        canvas.width = videoWidth;
        canvas.height = videoHeight;
      }

      if (this.overlayCanvasRef.current) {
        this.overlayCanvasRef.current.width = videoWidth;
        this.overlayCanvasRef.current.height = videoHeight;
      }

      // Draw video frame to canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

      // Convert to OpenCV Mat
      const src = this.cv.imread(canvas);
      const gray = new this.cv.Mat();
      this.cv.cvtColor(src, gray, this.cv.COLOR_RGBA2GRAY);

      // Apply Gaussian blur
      const blurred = new this.cv.Mat();
      this.cv.GaussianBlur(gray, blurred, new this.cv.Size(5, 5), 0);

      // Canny edge detection
      const edges = new this.cv.Mat();
      this.cv.Canny(blurred, edges, 50, 150);

      // Find document contour
      const contour = this.findDocumentContour(edges);
      const corners = contour ? this.orderPoints(contour) : null;

      // Calculate quality and stability
      let quality = 0;
      let stable = false;
      
      if (corners) {
        quality = this.calculateQuality(corners, videoWidth, videoHeight);
        stable = this.isStable(corners);
        
        // Add to history
        this.cornerHistory.push(corners);
        if (this.cornerHistory.length > this.maxHistory) {
          this.cornerHistory.shift();
        }
      } else {
        this.stableFrames = 0;
        this.cornerHistory = [];
      }

      // Draw overlay
      this.drawOverlay(corners, quality);

      // Notify about detection
      if (this.callbacks.onDetection) {
        this.callbacks.onDetection({
          detected: corners !== null,
          corners,
          quality,
          stable
        });
      }

      // Auto-capture if stable and high quality
      if (corners && stable && quality > 0.7 && this.callbacks.onAutoCapture) {
        const correctedFile = await this.correctPerspective(corners, src);
        if (correctedFile) {
          this.callbacks.onAutoCapture(correctedFile);
          // Reset after capture
          this.stableFrames = 0;
          this.cornerHistory = [];
          this.lastCorners = null;
        }
      }

      // Cleanup
      src.delete();
      gray.delete();
      blurred.delete();
      edges.delete();
      if (contour) contour.delete();
    } catch (error) {
      console.error('Frame processing error:', error);
    }
  }

  async start(): Promise<void> {
    await this.loadOpenCV();
    
    const tick = () => {
      if (this.cancelled) return;
      this.processFrame();
      if (!this.cancelled) {
        this.processingRef.current = requestAnimationFrame(tick);
      }
    };

    this.processingRef.current = requestAnimationFrame(tick);
  }

  cleanup(): void {
    this.cancelled = true;
    if (this.processingRef.current) {
      cancelAnimationFrame(this.processingRef.current);
      this.processingRef.current = null;
    }
    this.stableFrames = 0;
    this.cornerHistory = [];
    this.lastCorners = null;
  }
}


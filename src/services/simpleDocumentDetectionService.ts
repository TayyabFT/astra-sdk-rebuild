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

export class SimpleDocumentDetectionService {
  private videoRef: React.RefObject<HTMLVideoElement | null>;
  private canvasRef: React.RefObject<HTMLCanvasElement | null>;
  private overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  private callbacks: DocumentDetectionCallbacks;
  private processingRef: React.MutableRefObject<number | null>;
  private cancelled = false;
  
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

  private detectEdges(imageData: ImageData): Uint8ClampedArray {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const edges = new Uint8ClampedArray(data.length);
    
    // Convert to grayscale first
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const grayValue = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[i / 4] = grayValue;
    }
    
    // Sobel edge detection
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            gx += gray[idx] * sobelX[kernelIdx];
            gy += gray[idx] * sobelY[kernelIdx];
          }
        }
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        const idx = (y * width + x) * 4;
        const edgeValue = magnitude > 50 ? 255 : 0; // Threshold
        edges[idx] = edgeValue;
        edges[idx + 1] = edgeValue;
        edges[idx + 2] = edgeValue;
        edges[idx + 3] = 255;
      }
    }
    
    return edges;
  }

  private findContours(edges: ImageData): Array<Array<{ x: number; y: number }>> {
    const width = edges.width;
    const height = edges.height;
    const data = edges.data;
    const visited = new Set<string>();
    const contours: Array<Array<{ x: number; y: number }>> = [];
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const key = `${x},${y}`;
        
        if (data[idx] > 128 && !visited.has(key)) {
          const contour: Array<{ x: number; y: number }> = [];
          const stack: Array<{ x: number; y: number }> = [{ x, y }];
          
          while (stack.length > 0) {
            const point = stack.pop()!;
            const pointKey = `${point.x},${point.y}`;
            
            if (visited.has(pointKey)) continue;
            visited.add(pointKey);
            contour.push(point);
            
            // Check 8 neighbors
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = point.x + dx;
                const ny = point.y + dy;
                
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                  const nIdx = (ny * width + nx) * 4;
                  const nKey = `${nx},${ny}`;
                  if (data[nIdx] > 128 && !visited.has(nKey)) {
                    stack.push({ x: nx, y: ny });
                  }
                }
              }
            }
          }
          
          if (contour.length > 100) { // Minimum contour size
            contours.push(contour);
          }
        }
      }
    }
    
    return contours;
  }

  private approximatePolygon(contour: Array<{ x: number; y: number }>, epsilon: number): Array<{ x: number; y: number }> {
    if (contour.length < 4) return contour;
    
    // Douglas-Peucker algorithm simplified
    const simplified: Array<{ x: number; y: number }> = [];
    const n = contour.length;
    
    // Find the point farthest from the line between first and last
    let maxDist = 0;
    let maxIndex = 0;
    
    for (let i = 1; i < n - 1; i++) {
      const dist = this.pointToLineDistance(contour[i], contour[0], contour[n - 1]);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }
    
    if (maxDist > epsilon) {
      const left = this.approximatePolygon(contour.slice(0, maxIndex + 1), epsilon);
      const right = this.approximatePolygon(contour.slice(maxIndex), epsilon);
      return [...left.slice(0, -1), ...right];
    } else {
      return [contour[0], contour[n - 1]];
    }
  }

  private pointToLineDistance(point: { x: number; y: number }, lineStart: { x: number; y: number }, lineEnd: { x: number; y: number }): number {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : -1;
    
    let xx: number, yy: number;
    
    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }
    
    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private findDocumentContour(edges: ImageData): DocumentCorners | null {
    const contours = this.findContours(edges);
    
    if (contours.length === 0) return null;
    
    // Find the largest contour
    let largestContour = contours[0];
    let maxArea = this.calculateContourArea(largestContour);
    
    for (const contour of contours) {
      const area = this.calculateContourArea(contour);
      if (area > maxArea && area > 10000) { // Minimum area threshold
        maxArea = area;
        largestContour = contour;
      }
    }
    
    // Approximate to polygon
    const epsilon = 0.02 * this.calculatePerimeter(largestContour);
    const approx = this.approximatePolygon(largestContour, epsilon);
    
    // Check if we have 4 corners
    if (approx.length === 4) {
      return this.orderPoints(approx);
    }
    
    return null;
  }

  private calculateContourArea(contour: Array<{ x: number; y: number }>): number {
    let area = 0;
    for (let i = 0; i < contour.length; i++) {
      const j = (i + 1) % contour.length;
      area += contour[i].x * contour[j].y;
      area -= contour[j].x * contour[i].y;
    }
    return Math.abs(area / 2);
  }

  private calculatePerimeter(contour: Array<{ x: number; y: number }>): number {
    let perimeter = 0;
    for (let i = 0; i < contour.length; i++) {
      const j = (i + 1) % contour.length;
      const dx = contour[j].x - contour[i].x;
      const dy = contour[j].y - contour[i].y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    return perimeter;
  }

  private orderPoints(points: Array<{ x: number; y: number }>): DocumentCorners {
    // Sort by y-coordinate
    const sorted = [...points].sort((a, b) => a.y - b.y);
    const topPoints = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
    const bottomPoints = sorted.slice(2, 4).sort((a, b) => a.x - b.x);

    return {
      topLeft: topPoints[0],
      topRight: topPoints[1],
      bottomRight: bottomPoints[1],
      bottomLeft: bottomPoints[0]
    };
  }

  private calculateQuality(corners: DocumentCorners, width: number, height: number): number {
    // Check if corners are within frame bounds
    const margin = 20;
    const inBounds = 
      corners.topLeft.x > margin && corners.topLeft.y > margin &&
      corners.topRight.x < width - margin && corners.topRight.y > margin &&
      corners.bottomRight.x < width - margin && corners.bottomRight.y < height - margin &&
      corners.bottomLeft.x > margin && corners.bottomLeft.y < height - margin;

    if (!inBounds) return 0;

    // Calculate aspect ratio
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

    // Check angles
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

    const threshold = 15;
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
      ctx.strokeStyle = quality > 0.7 ? '#22c55e' : quality > 0.4 ? '#f59e0b' : '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(corners.topLeft.x, corners.topLeft.y);
      ctx.lineTo(corners.topRight.x, corners.topRight.y);
      ctx.lineTo(corners.bottomRight.x, corners.bottomRight.y);
      ctx.lineTo(corners.bottomLeft.x, corners.bottomLeft.y);
      ctx.closePath();
      ctx.stroke();

      const cornerColor = quality > 0.7 ? '#22c55e' : '#f59e0b';
      ctx.fillStyle = cornerColor;
      [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft].forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        ctx.fill();
      });

      if (quality > 0.7) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
        ctx.fill();
      }
    }
  }

  private async correctPerspective(corners: DocumentCorners, srcCanvas: HTMLCanvasElement): Promise<File | null> {
    try {
      const width = Math.max(
        Math.sqrt(Math.pow(corners.topRight.x - corners.topLeft.x, 2) + Math.pow(corners.topRight.y - corners.topLeft.y, 2)),
        Math.sqrt(Math.pow(corners.bottomRight.x - corners.bottomLeft.x, 2) + Math.pow(corners.bottomRight.y - corners.bottomLeft.y, 2))
      );
      const height = Math.max(
        Math.sqrt(Math.pow(corners.bottomLeft.x - corners.topLeft.x, 2) + Math.pow(corners.bottomLeft.y - corners.topLeft.y, 2)),
        Math.sqrt(Math.pow(corners.bottomRight.x - corners.topRight.x, 2) + Math.pow(corners.bottomRight.y - corners.topRight.y, 2))
      );

      const dstCanvas = document.createElement('canvas');
      dstCanvas.width = width;
      dstCanvas.height = height;
      const dstCtx = dstCanvas.getContext('2d');
      if (!dstCtx) return null;

      // Perspective transformation using canvas
      dstCtx.save();
      dstCtx.beginPath();
      dstCtx.moveTo(0, 0);
      dstCtx.lineTo(width, 0);
      dstCtx.lineTo(width, height);
      dstCtx.lineTo(0, height);
      dstCtx.closePath();
      dstCtx.clip();

      // Draw with perspective correction
      const srcPoints = [
        corners.topLeft.x, corners.topLeft.y,
        corners.topRight.x, corners.topRight.y,
        corners.bottomRight.x, corners.bottomRight.y,
        corners.bottomLeft.x, corners.bottomLeft.y
      ];
      const dstPoints = [0, 0, width, 0, width, height, 0, height];

      // Use transform matrix for perspective correction
      this.drawPerspective(dstCtx, srcCanvas, srcPoints, dstPoints, width, height);
      
      dstCtx.restore();

      const blob = await new Promise<Blob>((resolve) => {
        dstCanvas.toBlob((blob: Blob | null) => {
          resolve(blob || new Blob());
        }, 'image/jpeg', 0.92);
      });

      return new File([blob], 'document_corrected.jpg', { type: 'image/jpeg' });
    } catch (error) {
      console.error('Perspective correction error:', error);
      return null;
    }
  }

  private drawPerspective(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, srcPoints: number[], dstPoints: number[], width: number, height: number) {
    // Simplified perspective correction using canvas transform
    // For better quality, consider using a WebGL-based solution or a library
    const srcX0 = srcPoints[0], srcY0 = srcPoints[1];
    const srcX1 = srcPoints[2], srcY1 = srcPoints[3];
    const srcX2 = srcPoints[4], srcY2 = srcPoints[5];
    const srcX3 = srcPoints[6], srcY3 = srcPoints[7];
    
    // Use a simpler approach: draw the cropped region
    // This is faster but less accurate than full perspective transform
    ctx.save();
    
    // Create clipping path
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.clip();
    
    // For now, use a simplified approach - just crop the detected region
    // In production, you might want to use a proper perspective transform library
    const minX = Math.min(srcX0, srcX1, srcX2, srcX3);
    const maxX = Math.max(srcX0, srcX1, srcX2, srcX3);
    const minY = Math.min(srcY0, srcY1, srcY2, srcY3);
    const maxY = Math.max(srcY0, srcY1, srcY2, srcY3);
    
    const cropWidth = maxX - minX;
    const cropHeight = maxY - minY;
    
    // Draw the cropped region scaled to destination size
    ctx.drawImage(
      src,
      minX, minY, cropWidth, cropHeight,
      0, 0, width, height
    );
    
    ctx.restore();
  }

  async processFrame(): Promise<void> {
    if (this.cancelled) return;
    
    const video = this.videoRef.current;
    const canvas = this.canvasRef.current;
    if (!video || !canvas) return;

    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

    try {
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

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

      // Get image data
      const imageData = ctx.getImageData(0, 0, videoWidth, videoHeight);
      
      // Detect edges
      const edgesData = this.detectEdges(imageData);
      const edgesImageData = new ImageData(edgesData, videoWidth, videoHeight);
      
      // Find document contour
      const corners = this.findDocumentContour(edgesImageData);

      let quality = 0;
      let stable = false;
      
      if (corners) {
        quality = this.calculateQuality(corners, videoWidth, videoHeight);
        stable = this.isStable(corners);
        
        this.cornerHistory.push(corners);
        if (this.cornerHistory.length > this.maxHistory) {
          this.cornerHistory.shift();
        }
      } else {
        this.stableFrames = 0;
        this.cornerHistory = [];
      }

      this.drawOverlay(corners, quality);

      if (this.callbacks.onDetection) {
        this.callbacks.onDetection({
          detected: corners !== null,
          corners,
          quality,
          stable
        });
      }

      if (corners && stable && quality > 0.7 && this.callbacks.onAutoCapture) {
        const correctedFile = await this.correctPerspective(corners, canvas);
        if (correctedFile) {
          this.callbacks.onAutoCapture(correctedFile);
          this.stableFrames = 0;
          this.cornerHistory = [];
          this.lastCorners = null;
        }
      }
    } catch (error) {
      console.error('Frame processing error:', error);
    }
  }

  async start(): Promise<void> {
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


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
  private requiredStableFrames = 8; // Reduced for faster capture
  private lastCorners: DocumentCorners | null = null;
  private cornerHistory: DocumentCorners[] = [];
  private readonly maxHistory = 5;
  private frameSkip = 0;
  private readonly frameSkipCount = 2; // Process every 3rd frame
  private captureTriggered = false; // Prevent multiple captures
  private smoothedCorners: DocumentCorners | null = null;
  private consecutiveGoodFrames = 0; // Track consecutive frames with good detection

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

  private detectEdges(imageData: ImageData, scale: number = 1): Uint8ClampedArray {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const edges = new Uint8ClampedArray(data.length);
    
    // Optimized grayscale conversion
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i += 4) {
      gray[i / 4] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }
    
    // Optimized Sobel with step for performance
    const step = Math.max(1, Math.floor(scale));
    const threshold = 40;
    
    for (let y = 1; y < height - 1; y += step) {
      for (let x = 1; x < width - 1; x += step) {
        const idx = y * width + x;
        
        // Fast Sobel approximation
        const gx = 
          -gray[(y - 1) * width + (x - 1)] + gray[(y - 1) * width + (x + 1)]
          - 2 * gray[y * width + (x - 1)] + 2 * gray[y * width + (x + 1)]
          -gray[(y + 1) * width + (x - 1)] + gray[(y + 1) * width + (x + 1)];
        
        const gy = 
          -gray[(y - 1) * width + (x - 1)] - 2 * gray[(y - 1) * width + x] - gray[(y - 1) * width + (x + 1)]
          +gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)];
        
        const magnitude = Math.abs(gx) + Math.abs(gy); // Faster than sqrt
        const edgeValue = magnitude > threshold ? 255 : 0;
        const pixelIdx = (y * width + x) * 4;
        
        edges[pixelIdx] = edgeValue;
        edges[pixelIdx + 1] = edgeValue;
        edges[pixelIdx + 2] = edgeValue;
        edges[pixelIdx + 3] = 255;
      }
    }
    
    return edges;
  }

  private findContours(edges: ImageData): Array<Array<{ x: number; y: number }>> {
    const width = edges.width;
    const height = edges.height;
    const data = edges.data;
    const visited = new Uint8Array(width * height);
    const contours: Array<Array<{ x: number; y: number }>> = [];
    
    // Sample every nth pixel for performance
    const step = 2;
    
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        const visitIdx = y * width + x;
        
        if (data[idx] > 128 && !visited[visitIdx]) {
          const contour: Array<{ x: number; y: number }> = [];
          const stack: Array<{ x: number; y: number }> = [{ x, y }];
          
          while (stack.length > 0 && contour.length < 5000) { // Limit contour size
            const point = stack.pop()!;
            const pointVisitIdx = point.y * width + point.x;
            
            if (visited[pointVisitIdx]) continue;
            visited[pointVisitIdx] = 1;
            contour.push(point);
            
            // Check 4 neighbors only (faster)
            const neighbors = [
              { x: point.x + step, y: point.y },
              { x: point.x - step, y: point.y },
              { x: point.x, y: point.y + step },
              { x: point.x, y: point.y - step }
            ];
            
            for (const neighbor of neighbors) {
              if (neighbor.x >= 0 && neighbor.x < width && neighbor.y >= 0 && neighbor.y < height) {
                const nIdx = (neighbor.y * width + neighbor.x) * 4;
                const nVisitIdx = neighbor.y * width + neighbor.x;
                if (data[nIdx] > 128 && !visited[nVisitIdx]) {
                  stack.push(neighbor);
                }
              }
            }
          }
          
          if (contour.length > 50) { // Minimum contour size
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
      // Adjusted minimum area - scale with image size
      const minArea = (edges.width * edges.height) * 0.05; // 5% of image area
      if (area > maxArea && area > minArea) {
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
    // Base score just for detecting a document
    let baseScore = 0.6;
    
    // Check if corners are within frame bounds (very lenient)
    const margin = 5;
    const inBounds = 
      corners.topLeft.x > margin && corners.topLeft.y > margin &&
      corners.topRight.x < width - margin && corners.topRight.y > margin &&
      corners.bottomRight.x < width - margin && corners.bottomRight.y < height - margin &&
      corners.bottomLeft.x > margin && corners.bottomLeft.y < height - margin;

    if (!inBounds) {
      // Check if at least all corners are in frame
      const allInBounds = 
        corners.topLeft.x > 0 && corners.topLeft.y > 0 &&
        corners.topRight.x < width && corners.topRight.y > 0 &&
        corners.bottomRight.x < width && corners.bottomRight.y < height &&
        corners.bottomLeft.x > 0 && corners.bottomLeft.y < height;
      if (!allInBounds) return 0.3; // Still give some score if detected
      baseScore = 0.5; // Slightly lower if close to edge
    }

    // Calculate aspect ratio (simplified)
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

    // Very lenient aspect ratio - accept almost any ratio
    const aspectScore = aspectRatio >= 0.2 && aspectRatio <= 5.0 ? 1 : 0.8;

    // Check if document is reasonably sized (not too small, not too large)
    const docArea = avgWidth * avgHeight;
    const frameArea = width * height;
    const areaRatio = docArea / frameArea;
    const areaScore = areaRatio > 0.1 && areaRatio < 0.95 ? 1 : 
                     areaRatio > 0.05 && areaRatio < 0.98 ? 0.9 : 0.7;

    // Simple angle check - just ensure it's roughly rectangular
    const angle1 = Math.abs(
      Math.atan2(corners.topRight.y - corners.topLeft.y, corners.topRight.x - corners.topLeft.x) -
      Math.atan2(corners.bottomLeft.y - corners.topLeft.y, corners.bottomLeft.x - corners.topLeft.x)
    );
    const angle2 = Math.abs(
      Math.atan2(corners.bottomRight.y - corners.topRight.y, corners.bottomRight.x - corners.topRight.x) -
      Math.atan2(corners.topRight.y - corners.topLeft.y, corners.topRight.x - corners.topLeft.x)
    );
    // Very lenient - accept angles between 30 and 150 degrees
    const angleScore = (Math.abs(angle1 - Math.PI / 2) < 1.0 && Math.abs(angle2 - Math.PI / 2) < 1.0) ? 1 : 0.8;

    // Simple weighted average - prioritize base score and area
    const finalScore = baseScore * 0.5 + aspectScore * 0.2 + angleScore * 0.15 + areaScore * 0.15;
    
    // Ensure minimum score if document is detected
    return Math.max(0.5, Math.min(1, finalScore));
  }

  private isStable(corners: DocumentCorners, quality: number): boolean {
    // Very lenient: if document is detected (quality > 0.3), count frames
    // This ensures we capture even if quality calculation is conservative
    
    if (quality > 0.3) {
      // Document is detected - count frames
      this.consecutiveGoodFrames++;
      this.stableFrames = this.consecutiveGoodFrames;
      
      // Update last corners for smoothing
      if (!this.lastCorners) {
        this.lastCorners = corners;
      } else {
        // Update last corners periodically for smoothing
        if (this.consecutiveGoodFrames % 3 === 0) {
          this.lastCorners = corners;
        }
      }
    } else {
      // Quality too low, reset counters gradually
      this.consecutiveGoodFrames = Math.max(0, this.consecutiveGoodFrames - 1);
      this.stableFrames = this.consecutiveGoodFrames;
    }

    // Very lenient: only need 5-6 frames for capture
    // If quality is decent (>0.5), only need 4 frames
    const requiredFrames = quality > 0.5 ? 4 : 6;
    return this.stableFrames >= requiredFrames;
  }

  private smoothCorners(newCorners: DocumentCorners | null): DocumentCorners | null {
    if (!newCorners) {
      this.smoothedCorners = null;
      return null;
    }

    if (!this.smoothedCorners) {
      this.smoothedCorners = newCorners;
      return newCorners;
    }

    // Smooth with exponential moving average
    const alpha = 0.3; // Smoothing factor
    const smooth = (old: number, newVal: number) => old * (1 - alpha) + newVal * alpha;

    this.smoothedCorners = {
      topLeft: {
        x: smooth(this.smoothedCorners.topLeft.x, newCorners.topLeft.x),
        y: smooth(this.smoothedCorners.topLeft.y, newCorners.topLeft.y)
      },
      topRight: {
        x: smooth(this.smoothedCorners.topRight.x, newCorners.topRight.x),
        y: smooth(this.smoothedCorners.topRight.y, newCorners.topRight.y)
      },
      bottomRight: {
        x: smooth(this.smoothedCorners.bottomRight.x, newCorners.bottomRight.x),
        y: smooth(this.smoothedCorners.bottomRight.y, newCorners.bottomRight.y)
      },
      bottomLeft: {
        x: smooth(this.smoothedCorners.bottomLeft.x, newCorners.bottomLeft.x),
        y: smooth(this.smoothedCorners.bottomLeft.y, newCorners.bottomLeft.y)
      }
    };

    return this.smoothedCorners;
  }

  private drawOverlay(corners: DocumentCorners | null, quality: number) {
    const overlayCanvas = this.overlayCanvasRef.current;
    if (!overlayCanvas) return;

    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    const width = overlayCanvas.width;
    const height = overlayCanvas.height;

    ctx.clearRect(0, 0, width, height);

    // Use smoothed corners for display
    const displayCorners = this.smoothCorners(corners);

    if (displayCorners) {
      ctx.strokeStyle = quality > 0.7 ? '#22c55e' : quality > 0.4 ? '#f59e0b' : '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(displayCorners.topLeft.x, displayCorners.topLeft.y);
      ctx.lineTo(displayCorners.topRight.x, displayCorners.topRight.y);
      ctx.lineTo(displayCorners.bottomRight.x, displayCorners.bottomRight.y);
      ctx.lineTo(displayCorners.bottomLeft.x, displayCorners.bottomLeft.y);
      ctx.closePath();
      ctx.stroke();

      const cornerColor = quality > 0.7 ? '#22c55e' : '#f59e0b';
      ctx.fillStyle = cornerColor;
      [displayCorners.topLeft, displayCorners.topRight, displayCorners.bottomRight, displayCorners.bottomLeft].forEach(point => {
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
    if (this.cancelled || this.captureTriggered) return;
    
    // Skip frames for performance
    this.frameSkip++;
    if (this.frameSkip < this.frameSkipCount) {
      // Still draw overlay even if skipping detection
      if (this.smoothedCorners) {
        const quality = this.calculateQuality(this.smoothedCorners, 
          this.overlayCanvasRef.current?.width || 0,
          this.overlayCanvasRef.current?.height || 0);
        this.drawOverlay(this.smoothedCorners, quality);
      }
      return;
    }
    this.frameSkip = 0;
    
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

      // Process at lower resolution for performance
      const scale = 0.5; // Process at half resolution
      const processWidth = Math.floor(videoWidth * scale);
      const processHeight = Math.floor(videoHeight * scale);
      
      // Create a temporary canvas for processing
      const processCanvas = document.createElement('canvas');
      processCanvas.width = processWidth;
      processCanvas.height = processHeight;
      const processCtx = processCanvas.getContext('2d');
      if (!processCtx) return;
      
      processCtx.drawImage(canvas, 0, 0, videoWidth, videoHeight, 0, 0, processWidth, processHeight);
      
      // Get image data at lower resolution
      const imageData = processCtx.getImageData(0, 0, processWidth, processHeight);
      
      // Detect edges
      const edgesData = this.detectEdges(imageData, scale);
      const edgesImageData = new ImageData(edgesData, processWidth, processHeight);
      
      // Find document contour
      const corners = this.findDocumentContour(edgesImageData);
      
      // Scale corners back to original resolution
      const scaledCorners = corners ? {
        topLeft: { x: corners.topLeft.x / scale, y: corners.topLeft.y / scale },
        topRight: { x: corners.topRight.x / scale, y: corners.topRight.y / scale },
        bottomRight: { x: corners.bottomRight.x / scale, y: corners.bottomRight.y / scale },
        bottomLeft: { x: corners.bottomLeft.x / scale, y: corners.bottomLeft.y / scale }
      } : null;

      let quality = 0;
      let stable = false;
      
      if (scaledCorners) {
        quality = this.calculateQuality(scaledCorners, videoWidth, videoHeight);
        stable = this.isStable(scaledCorners, quality);
        
        this.cornerHistory.push(scaledCorners);
        if (this.cornerHistory.length > this.maxHistory) {
          this.cornerHistory.shift();
        }
      } else {
        // No corners detected, reset everything
        this.stableFrames = 0;
        this.consecutiveGoodFrames = 0;
        this.cornerHistory = [];
        this.lastCorners = null;
      }

      this.drawOverlay(scaledCorners, quality);

      if (this.callbacks.onDetection) {
        this.callbacks.onDetection({
          detected: scaledCorners !== null,
          corners: scaledCorners,
          quality,
          stable
        });
      }

      // Auto-capture when conditions are met
      // Very lenient: if document is detected and stable for a few frames, capture it
      const shouldCapture = scaledCorners && 
                           quality > 0.4 && 
                           this.stableFrames >= 5 && 
                           !this.captureTriggered && 
                           this.callbacks.onAutoCapture;
      
      if (shouldCapture) {
        this.captureTriggered = true; // Prevent multiple captures
        console.log('Auto-capturing document...', { 
          quality: quality.toFixed(2), 
          stable, 
          frames: this.stableFrames,
          consecutiveGood: this.consecutiveGoodFrames,
          corners: scaledCorners 
        });
        
        // Use original resolution canvas for capture
        try {
          const correctedFile = await this.correctPerspective(scaledCorners, canvas);
          if (correctedFile) {
            console.log('Document captured successfully');
            this.callbacks.onAutoCapture(correctedFile);
            // Reset after a delay to allow for another capture if needed
            setTimeout(() => {
              this.captureTriggered = false;
              this.stableFrames = 0;
              this.consecutiveGoodFrames = 0;
              this.cornerHistory = [];
              this.lastCorners = null;
              this.smoothedCorners = null;
            }, 3000);
          } else {
            console.warn('Failed to create corrected file');
            this.captureTriggered = false;
          }
        } catch (error) {
          console.error('Error during capture:', error);
          this.captureTriggered = false;
        }
      } else if (scaledCorners && !this.captureTriggered) {
        // Debug info every few frames
        if (this.frameSkip === 0 && this.stableFrames % 3 === 0) {
          console.log('Detection status:', {
            quality: quality.toFixed(2),
            stable,
            frames: this.stableFrames,
            consecutiveGood: this.consecutiveGoodFrames,
            required: quality > 0.5 ? 4 : 6,
            willCapture: quality > 0.4 && this.stableFrames >= 5,
            corners: scaledCorners ? 'detected' : 'none'
          });
        }
      }
    } catch (error) {
      console.error('Frame processing error:', error);
      this.captureTriggered = false;
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
    this.consecutiveGoodFrames = 0;
    this.cornerHistory = [];
    this.lastCorners = null;
    this.smoothedCorners = null;
    this.captureTriggered = false;
    this.frameSkip = 0;
  }
}


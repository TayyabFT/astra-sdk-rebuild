export type LivenessStage = 'CENTER' | 'LEFT' | 'RIGHT' | 'SNAP' | 'DONE';

export interface FaceScanState {
  cameraReady: boolean;
  livenessStage: LivenessStage;
  livenessReady: boolean;
  livenessFailed: boolean;
  modelLoading: boolean;
  modelLoaded: boolean;
  livenessInstruction: string;
  loading: boolean;
  allStepsCompleted: boolean;
  capturedImage: string | null;
  showDocumentUpload: boolean;
}

export interface LivenessRefs {
  centerHold: React.MutableRefObject<number>;
  leftHold: React.MutableRefObject<number>;
  rightHold: React.MutableRefObject<number>;
  snapTriggered: React.MutableRefObject<boolean>;
  lastResultsAt: React.MutableRefObject<number>;
  livenessStage: React.MutableRefObject<LivenessStage>;
  cameraDriver: React.MutableRefObject<number | null>;
  modelLoaded: React.MutableRefObject<boolean>;
  livenessFailed: React.MutableRefObject<boolean>;
  handleFaceCapture: React.MutableRefObject<(() => void) | null>;
}


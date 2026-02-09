export interface Biomarkers {
  bpm: number;
  hrv: number; // RMSSD
  stress: number; // 0-100
  spo2: number;
  respirationRate: number;
  confidence: number;
}

export interface SignalDataPoint {
  timestamp: number;
  value: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export enum AppState {
  IDLE,
  CALIBRATING,
  MEASURING,
  REPORT,
  ERROR
}

export interface FaceROI {
  x: number;
  y: number;
  width: number;
  height: number;
}
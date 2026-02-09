// Camera & Processing Config
export const FPS = 30;
export const BUFFER_SIZE = 512; // Increased to 512 for better frequency resolution (~0.05 Hz per bin)
export const WINDOW_SIZE = 256; // Sliding window size for analysis
export const SAMPLING_WINDOW_SEC = 5;

// Signal Filtering limits
export const MIN_BPM = 40;
export const MAX_BPM = 200;
export const MIN_FREQ = MIN_BPM / 60; // ~0.66 Hz
export const MAX_FREQ = MAX_BPM / 60; // ~3.33 Hz

// Visuals
export const CHART_WINDOW_POINTS = 128;

// Thresholds
export const CONFIDENCE_THRESHOLD = 0.5;
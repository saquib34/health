import React, { useState, useEffect, useRef } from 'react';
import { Heart, Camera, AlertTriangle, Info, X, Activity, TrendingUp, TrendingDown, Clock, Maximize, Move, Wind as Lungs, Droplet } from 'lucide-react';
import Chart from 'chart.js/auto';
import cv from '@techstark/opencv-js';
import * as FFTLib from 'fft-js';
import * as tf from '@tensorflow/tfjs';
import { vitalSignsAPI } from '../services/api';
import { toast } from 'react-toastify';
import * as faceapi from 'face-api.js';

// Component initialization
const VitalSignsMonitor = ({ onVitalSignsUpdate, showInstructions = true }) => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [heartRate, setHeartRate] = useState(null);
  const [respiratoryRate, setRespiratoryRate] = useState(null);
  const [spo2, setSpO2] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [heartRateHistory, setHeartRateHistory] = useState([]);
  const [respiratoryRateHistory, setRespiratoryRateHistory] = useState([]);
  const [spo2History, setSpo2History] = useState([]);
  const [signalQuality, setSignalQuality] = useState(null);
  const [opencvLoaded, setOpencvLoaded] = useState(false);
  const [usingFallbackMethod, setUsingFallbackMethod] = useState(false);
  const [rawSignalValues, setRawSignalValues] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [chartAnimationId, setChartAnimationId] = useState(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [processingMethod, setProcessingMethod] = useState('auto');
  const [debugMode, setDebugMode] = useState(false);
  
  // New states for live statistics
  const [liveStats, setLiveStats] = useState({
    min: null,
    max: null,
    avg: null,
    duration: 0,
    sampleCount: 0,
    respMin: null,
    respMax: null,
    respAvg: null,
    spo2Min: null,
    spo2Max: null,
    spo2Avg: null
  });
  
  // State to track ROI position for smoother transitions
  const [currentROI, setCurrentROI] = useState(null);
  
  // State to track face detection status
  const [faceDetected, setFaceDetected] = useState(false);
  
  // Monitoring duration tracker
  const [monitoringDuration, setMonitoringDuration] = useState(0);
  const monitoringStartTimeRef = useRef(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const roiCanvasRef = useRef(null); // New canvas specifically for ROI
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const roiAnimationFrameRef = useRef(null); // Separate animation frame for ROI canvas
  const processingRef = useRef(false);
  const bufferRef = useRef([]);
  const redBufferRef = useRef([]);
  const greenBufferRef = useRef([]);
  const blueBufferRef = useRef([]);
  const lastValidHeartRateRef = useRef(null);
  const lastValidRespiratoryRateRef = useRef(null);
  const lastValidSpo2Ref = useRef(null);
  const smoothedHeartRateRef = useRef(null);
  const smoothedRespiratoryRateRef = useRef(null);
  const smoothedSpo2Ref = useRef(null);
  const lastHeartRateTimestampRef = useRef(null);
  const faceDetectionModelRef = useRef(null);
  const consecutiveErrorsRef = useRef(0);
  
  // Reference for tracking the last few ROIs (for smoothing)
  const roiHistoryRef = useRef([]);
  const lastRoiRef = useRef(null); // Store the last valid ROI

  const SAMPLE_RATE = 30;
  const BUFFER_SECONDS = 10;
  const MAX_BUFFER_SIZE = SAMPLE_RATE * BUFFER_SECONDS;
  const SMOOTHING_FACTOR = 0.2;
  const MAX_CONSECUTIVE_ERRORS = 5;
  const ROI_SMOOTHING_WINDOW = 5; // Number of frames to use for ROI position smoothing

// Function to load face-api.js models with better error handling
const loadFaceDetectionModels = async () => {
  try {
    setLoadingStatus('Loading face detection model...');
    
    // Set the models path - adjust this to your project structure
    // Try multiple potential model locations
    const MODEL_PATHS = [
      '/models',
      './models',
      '/face-api-models',
      './face-api-models',
      '../models'
    ];
    
    let modelsLoaded = false;
    let lastError = null;
    
    // Try each path until one works
    for (const modelPath of MODEL_PATHS) {
      try {
        console.log(`Attempting to load face-api.js models from: ${modelPath}`);
        
        // Check if models are already loaded
        if (faceapi.nets.tinyFaceDetector.isLoaded && faceapi.nets.faceLandmark68Net.isLoaded) {
          console.log('Face-api models are already loaded');
          modelsLoaded = true;
          break;
        }
        
        // Try loading the models with timeout for each attempt
        const loadWithTimeout = async (modelLoader, timeout = 8000) => {
          return Promise.race([
            modelLoader(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Model loading timed out')), timeout)
            )
          ]);
        };
        
        await loadWithTimeout(() => faceapi.nets.tinyFaceDetector.loadFromUri(modelPath));
        await loadWithTimeout(() => faceapi.nets.faceLandmark68Net.loadFromUri(modelPath));
        
        console.log(`Successfully loaded models from ${modelPath}`);
        modelsLoaded = true;
        break;
      } catch (pathError) {
        console.warn(`Failed to load from ${modelPath}:`, pathError);
        lastError = pathError;
        // Continue to next path
      }
    }
    
    if (!modelsLoaded) {
      // If all paths failed, try one last attempt with direct URLs
      try {
        console.log('Attempting to load using CDN/absolute paths');
        
        // Use any available CDN for the models
        const CDN_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
        
        await faceapi.nets.tinyFaceDetector.load(CDN_URL);
        await faceapi.nets.faceLandmark68Net.load(CDN_URL);
        
        modelsLoaded = true;
      } catch (cdnError) {
        console.error('CDN loading failed:', cdnError);
        throw lastError || cdnError;
      }
    }
    
    if (modelsLoaded) {
      setModelLoaded(true);
      setLoadingStatus('');
      return true;
    } else {
      throw new Error('Could not load face detection models from any location');
    }
  } catch (error) {
    console.error('Error loading face-api.js models:', error);
    setErrorMessage('Failed to load face detection model. Using fallback method.');
    setLoadingStatus('');
    setUsingFallbackMethod(true);
    return false;
  }
};

const waitForOpenCV = () => {
  return new Promise((resolve) => {
    if (cv && cv.Mat) {
      setOpencvLoaded(true);
      resolve(true);
    } else {
      const timeout = setTimeout(() => {
        console.error('OpenCV initialization timeout');
        resolve(false);
      }, 10000);
      
      cv.onRuntimeInitialized = () => {
        clearTimeout(timeout);
        setOpencvLoaded(true);
        resolve(true);
      };
    }
  });
};

const isFftAvailable = () => {
  try {
    return FFTLib && typeof FFTLib.fft === 'function';
  } catch (error) {
    console.error('FFT library check error:', error);
    return false;
  }
};

const isTensorflowAvailable = () => {
  try {
    return tf && tf.spectral && typeof tf.spectral.fft === 'function';
  } catch (error) {
    console.error('TensorFlow library check error:', error);
    return false;
  }
};

useEffect(() => {
  waitForOpenCV();
  loadFaceDetectionModels();
  
  const fftAvailable = isFftAvailable();
  const tensorflowAvailable = isTensorflowAvailable();
  
  if (!fftAvailable && !tensorflowAvailable) {
    setUsingFallbackMethod(true);
  }
  
  return () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (roiAnimationFrameRef.current) {
      cancelAnimationFrame(roiAnimationFrameRef.current);
    }
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }
  };
}, []);

// Add cleanup for chart animation
useEffect(() => {
  return () => {
    if (chartAnimationId) {
      cancelAnimationFrame(chartAnimationId);
    }
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }
  };
}, []);

useEffect(() => {
  if (chartInstanceRef.current) {
    updateChart();
  } else if (rawSignalValues.length > 0 && chartRef.current) {
    initializeChart();
  }
}, [rawSignalValues, isMonitoring]);

// Timer effect for monitoring duration
useEffect(() => {
  let intervalId;
  
  if (isMonitoring) {
    if (!monitoringStartTimeRef.current) {
      monitoringStartTimeRef.current = Date.now();
    }
    
    intervalId = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - monitoringStartTimeRef.current) / 1000);
      setMonitoringDuration(elapsedSeconds);
    }, 1000);
  } else {
    monitoringStartTimeRef.current = null;
  }
  
  return () => {
    if (intervalId) clearInterval(intervalId);
  };
}, [isMonitoring]);

// Effect to update live stats whenever vital sign histories change
useEffect(() => {
  if (heartRateHistory.length > 0) {
    const validHeartReadings = heartRateHistory.filter(hr => hr !== null && hr >= 45 && hr <= 200);
    const validRespReadings = respiratoryRateHistory.filter(rr => rr !== null && rr >= 8 && rr <= 40);
    const validSpo2Readings = spo2History.filter(sp => sp !== null && sp >= 70 && sp <= 100);
    
    if (validHeartReadings.length > 0) {
      setLiveStats({
        min: Math.min(...validHeartReadings),
        max: Math.max(...validHeartReadings),
        avg: Math.round(validHeartReadings.reduce((sum, hr) => sum + hr, 0) / validHeartReadings.length),
        respMin: validRespReadings.length > 0 ? Math.min(...validRespReadings) : null,
        respMax: validRespReadings.length > 0 ? Math.max(...validRespReadings) : null,
        respAvg: validRespReadings.length > 0 ? Math.round(validRespReadings.reduce((sum, rr) => sum + rr, 0) / validRespReadings.length) : null,
        spo2Min: validSpo2Readings.length > 0 ? Math.min(...validSpo2Readings) : null,
        spo2Max: validSpo2Readings.length > 0 ? Math.max(...validSpo2Readings) : null,
        spo2Avg: validSpo2Readings.length > 0 ? Math.round(validSpo2Readings.reduce((sum, sp) => sum + sp, 0) / validSpo2Readings.length) : null,
        sampleCount: validHeartReadings.length,
        duration: monitoringDuration
      });
    }
  }
}, [heartRateHistory, respiratoryRateHistory, spo2History, monitoringDuration]);

// Function to get a default monitoring region when face detection fails
const getDefaultMonitoringRegion = (width, height) => {
  // Calculate a region in the center of the frame
  // Focus on the upper third of the frame where the forehead would typically be
  const regionWidth = width * 0.3;  // 30% of the frame width
  const regionHeight = height * 0.1; // 10% of the frame height
  
  // Position the ROI in the center-top area of the frame
  // This is a likely location for the forehead
  return {
    x: Math.floor((width - regionWidth) / 2),
    y: Math.floor(height * 0.25), // Position about 25% down from the top
    width: Math.floor(regionWidth),
    height: Math.floor(regionHeight)
  };
};

// Apply smoothing to ROI position to reduce jitter
const smoothROI = (newROI) => {
  if (!currentROI) {
    return newROI;
  }
  
  // Add to history for tracking
  roiHistoryRef.current.push(newROI);
  if (roiHistoryRef.current.length > ROI_SMOOTHING_WINDOW) {
    roiHistoryRef.current.shift();
  }
  
  // Return smoothed values from history
  if (roiHistoryRef.current.length > 2) {
    const smoothed = {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    };
    
    // Apply more weight to recent positions
    const weights = roiHistoryRef.current.map((_, i) => i + 1);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    
    // Calculate weighted average
    roiHistoryRef.current.forEach((roi, i) => {
      const weight = weights[i] / totalWeight;
      smoothed.x += roi.x * weight;
      smoothed.y += roi.y * weight;
      smoothed.width += roi.width * weight;
      smoothed.height += roi.height * weight;
    });
    
    return {
      x: Math.round(smoothed.x),
      y: Math.round(smoothed.y),
      width: Math.round(smoothed.width),
      height: Math.round(smoothed.height)
    };
  }
  
  // Not enough history for smoothing
  return newROI;
};

// Function to render the ROI onto the dedicated ROI canvas
const renderROI = () => {
  if (!roiCanvasRef.current || !videoRef.current || !lastRoiRef.current) {
    roiAnimationFrameRef.current = requestAnimationFrame(renderROI);
    return;
  }
  
  try {
    const ctx = roiCanvasRef.current.getContext('2d', { willReadFrequently: true });
    const roi = lastRoiRef.current;
    
    // Clear the ROI canvas
    ctx.fillStyle = '#f8fafc'; // Light gray background
    ctx.fillRect(0, 0, roiCanvasRef.current.width, roiCanvasRef.current.height);
    
    // Draw a border around the ROI canvas
    ctx.strokeStyle = faceDetected ? '#22c55e' : '#64748b';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, roiCanvasRef.current.width, roiCanvasRef.current.height);
    
    // Draw the magnified ROI onto the ROI canvas
    if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      // Calculate scaling to fit ROI in the ROI canvas
      const roiAspect = roi.width / roi.height;
      const canvasAspect = roiCanvasRef.current.width / roiCanvasRef.current.height;
      
      let drawWidth, drawHeight, offsetX = 0, offsetY = 0;
      
      if (roiAspect > canvasAspect) {
        // ROI is wider than canvas (relative to height)
        drawWidth = roiCanvasRef.current.width;
        drawHeight = drawWidth / roiAspect;
        offsetY = (roiCanvasRef.current.height - drawHeight) / 2;
      } else {
        // ROI is taller than canvas (relative to width)
        drawHeight = roiCanvasRef.current.height;
        drawWidth = drawHeight * roiAspect;
        offsetX = (roiCanvasRef.current.width - drawWidth) / 2;
      }
      
      // Draw the magnified ROI
      ctx.drawImage(
        videoRef.current, 
        roi.x, roi.y, roi.width, roi.height,
        offsetX, offsetY, drawWidth, drawHeight
      );
      
      // Optionally add a grid overlay for better visualization
      const gridSize = 10;
      ctx.strokeStyle = 'rgba(0, 102, 255, 0.2)';
      ctx.lineWidth = 0.5;
      
      // Draw vertical grid lines
      for (let x = offsetX; x <= offsetX + drawWidth; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, offsetY);
        ctx.lineTo(x, offsetY + drawHeight);
        ctx.stroke();
      }
      
      // Draw horizontal grid lines
      for (let y = offsetY; y <= offsetY + drawHeight; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(offsetX, y);
        ctx.lineTo(offsetX + drawWidth, y);
        ctx.stroke();
      }
      
      // Add informative text
      ctx.fillStyle = '#334155';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(faceDetected ? 'Face Detected - Forehead ROI' : 'Default ROI', 
                  roiCanvasRef.current.width / 2, roiCanvasRef.current.height - 6);
      
      // Add RGB values
      if (bufferRef.current.length > 0) {
        const lastReading = bufferRef.current[bufferRef.current.length - 1];
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(
          `R:${Math.round(lastReading.red)} G:${Math.round(lastReading.green)} B:${Math.round(lastReading.blue)}`, 
          5, 12
        );
      }
    } else {
      // If video isn't ready, show a message
      ctx.fillStyle = '#64748b';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for video...', 
                  roiCanvasRef.current.width / 2, roiCanvasRef.current.height / 2);
    }
  } catch (error) {
    console.error('Error rendering ROI:', error);
  }
  
  // Continue rendering
  roiAnimationFrameRef.current = requestAnimationFrame(renderROI);
};

// Function to detect forehead using face-api.js
const detectForeheadRegion = async (ctx) => {
  if (!modelLoaded || !videoRef.current) {
    setFaceDetected(false);
    return getDefaultMonitoringRegion(ctx.canvas.width, ctx.canvas.height);
  }

  try {
    // Detect faces with landmarks
    const detections = await faceapi.detectAllFaces(
      videoRef.current, 
      new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.5 })
    ).withFaceLandmarks();
    
    if (detections && detections.length > 0) {
      setFaceDetected(true);
      const detection = detections[0]; // Use the first face detected
      const landmarks = detection.landmarks;
      const positions = landmarks.positions;
      
      // Get facial landmark points
      const eyebrowPoints = [
        ...positions.slice(17, 27), // Eyebrow points
      ];
      
      // Face contour points (useful for width reference)
      const jawPoints = positions.slice(0, 17);
      
      // Calculate the top of the forehead by going above the eyebrows
      const eyebrowTop = Math.min(...eyebrowPoints.map(pt => pt.y));
      const eyebrowBottom = Math.max(...eyebrowPoints.map(pt => pt.y));
      const eyebrowLeft = Math.min(...eyebrowPoints.map(pt => pt.x));
      const eyebrowRight = Math.max(...eyebrowPoints.map(pt => pt.x));
      
      // Better forehead height estimation based on face proportions
      const faceHeight = Math.max(...jawPoints.map(pt => pt.y)) - eyebrowTop;
      const foreheadHeight = Math.min(faceHeight * 0.25, (eyebrowBottom - eyebrowTop) * 1.5);
      
      // Narrow the ROI width to focus more on center forehead
      const centerX = (eyebrowLeft + eyebrowRight) / 2;
      const roiWidth = (eyebrowRight - eyebrowLeft) * 0.7;
      
      // Define forehead region - centered and above eyebrows
      const foreheadRegion = {
        x: centerX - roiWidth / 2,
        y: eyebrowTop - foreheadHeight, // Go up from eyebrows
        width: roiWidth,
        height: foreheadHeight
      };
      
      // Ensure the region is within the canvas
      foreheadRegion.x = Math.max(0, foreheadRegion.x);
      foreheadRegion.y = Math.max(0, foreheadRegion.y);
      foreheadRegion.width = Math.min(ctx.canvas.width - foreheadRegion.x, foreheadRegion.width);
      foreheadRegion.height = Math.min(ctx.canvas.height - foreheadRegion.y, foreheadRegion.height);
      
      // Apply smoothing to reduce jitter
      const smoothedRegion = smoothROI(foreheadRegion);
      setCurrentROI(smoothedRegion);
      
      // Save this ROI for the dedicated ROI canvas
      lastRoiRef.current = smoothedRegion;
      
      // Draw face landmarks for better debugging
      ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
      
      // Draw eyebrow points
      eyebrowPoints.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
        ctx.fill();
      });
      
      // Draw jawline points for reference
      ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
      jawPoints.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1, 0, 2 * Math.PI);
        ctx.fill();
      });
      
      // Draw face box for reference
      const box = detection.detection.box;
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      
      // Log ROI details occasionally for debugging
      if (Math.random() < 0.05) { // Log roughly every 20 frames
        console.log('Face detected! ROI dimensions:', {
          x: Math.round(smoothedRegion.x), 
          y: Math.round(smoothedRegion.y),
          width: Math.round(smoothedRegion.width), 
          height: Math.round(smoothedRegion.height)
        });
      }
      
      return smoothedRegion;
    }
    
    console.log('No face detected, using default ROI');
    setFaceDetected(false);
    // Fallback to default region if no face detected
    const defaultRegion = getDefaultMonitoringRegion(ctx.canvas.width, ctx.canvas.height);
    setCurrentROI(defaultRegion);
    lastRoiRef.current = defaultRegion;
    return defaultRegion;
  } catch (error) {
    console.error('Error detecting forehead:', error);
    setFaceDetected(false);
    const defaultRegion = getDefaultMonitoringRegion(ctx.canvas.width, ctx.canvas.height);
    setCurrentROI(defaultRegion);
    lastRoiRef.current = defaultRegion;
    return defaultRegion;
  }
};

// Added time-based monitoring region for alternative detection
const getTimeBasedMonitoringRegion = (width, height) => {
  // Divide the screen into a grid of possible monitoring regions
  // This creates a searching pattern that varies over time
  const timestamp = Date.now();
  const cycleTime = 5000; // 5 seconds per position
  const cycle = Math.floor(timestamp / cycleTime) % 9; // 9 different positions
  
  // Create a 3x3 grid of regions
  const thirdWidth = width / 3;
  const thirdHeight = height / 3;
  
  // Select region based on current time
  const col = cycle % 3;
  const row = Math.floor(cycle / 3);
  
  // Size of the ROI (smaller than a full third)
  const roiWidth = thirdWidth * 0.7;
  const roiHeight = thirdHeight * 0.7;
  
  // Center of the selected grid cell
  const centerX = thirdWidth * (col + 0.5);
  const centerY = thirdHeight * (row + 0.5);
  
  return {
    x: centerX - roiWidth / 2,
    y: centerY - roiHeight / 2,
    width: roiWidth,
    height: roiHeight
  };
};

const analyzeSignalQuality = (signal, rgbData = null) => {
  // If we have full RGB data, use all channels for better analysis
  if (rgbData && rgbData.length > 0) {
    // Extract channel data
    const redValues = rgbData.map(item => item.red);
    const greenValues = rgbData.map(item => item.green);
    const blueValues = rgbData.map(item => item.blue);
    
    // Calculate temporal variations in each channel
    const redVariation = calculateVariation(redValues);
    const greenVariation = calculateVariation(greenValues);
    const blueVariation = calculateVariation(blueValues);
    
    // Check channel correlation (blood pulse affects all channels)
    const redGreenCorr = calculateCorrelation(redValues, greenValues);
    const redBlueCorr = calculateCorrelation(redValues, blueValues);
    const greenBlueCorr = calculateCorrelation(greenValues, blueValues);
    
    // Use green channel as primary but consider all channels
    const avgCorrelation = (Math.abs(redGreenCorr) + Math.abs(redBlueCorr) + Math.abs(greenBlueCorr)) / 3;
    
    // Calculate SNR more robustly
    let snr = calculateSNR(greenValues);
    
    // Boost SNR slightly if channels are correlated (likely a real physiological signal)
    if (avgCorrelation > 0.5) {
      snr += 3; // Boost SNR if channels show correlation
    }
    
    // Calculate motion from max channel difference
    const motion = Math.max(redVariation, greenVariation, blueVariation);
    
    return {
      snr,
      motion,
      channelCorrelation: avgCorrelation,
      isGood: snr > 5 && motion < 10 && avgCorrelation > 0.4,
    };
  } else {
    // Fallback to single channel analysis (backward compatibility)
    const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
    const variance = signal.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / signal.length;
    
    // More robust SNR calculation that doesn't go extremely negative
    const signalPower = Math.max(variance, 0.1);
    const noisePower = Math.max(0.1, Math.pow(Math.abs(mean), 2));
    const snr = 10 * Math.log10(signalPower / noisePower);
    
    const diffs = signal.slice(1).map((v, i) => Math.abs(v - signal[i]));
    const motion = diffs.reduce((a, b) => a + b, 0) / diffs.length;

    return {
      snr,
      motion,
      isGood: snr > 5 && motion < 8, // More lenient thresholds
    };
  }
};

// Helper functions for signal analysis
const calculateVariation = (values) => {
  const diffs = values.slice(1).map((v, i) => Math.abs(v - values[i]));
  return diffs.reduce((a, b) => a + b, 0) / diffs.length;
};

const calculateSNR = (values) => {
  // Detrend the signal
  const trend = [];
  const windowSize = Math.min(values.length, 10);
  
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize); j <= Math.min(values.length - 1, i + windowSize); j++) {
      sum += values[j];
      count++;
    }
    trend[i] = sum / count;
  }
  
  // Remove trend from signal
  // Remove trend from signal
  const detrended = values.map((v, i) => v - trend[i]);
  
  // Calculate SNR
  const signalPower = detrended.reduce((sum, v) => sum + v * v, 0) / detrended.length;
  const mean = detrended.reduce((a, b) => a + b, 0) / detrended.length;
  const noisePower = detrended.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / detrended.length;
  
  // Ensure we don't get -Infinity for low power signals
  return 10 * Math.log10(Math.max(signalPower, 0.1) / Math.max(noisePower, 0.1));
};

const calculateCorrelation = (array1, array2) => {
  if (array1.length !== array2.length) {
    throw new Error('Arrays must have the same length');
  }
  
  const n = array1.length;
  const mean1 = array1.reduce((a, b) => a + b, 0) / n;
  const mean2 = array2.reduce((a, b) => a + b, 0) / n;
  
  let num = 0;
  let den1 = 0;
  let den2 = 0;
  
  for (let i = 0; i < n; i++) {
    const diff1 = array1[i] - mean1;
    const diff2 = array2[i] - mean2;
    
    num += diff1 * diff2;
    den1 += diff1 * diff1;
    den2 += diff2 * diff2;
  }
  
  // Prevent division by zero
  if (den1 === 0 || den2 === 0) return 0;
  
  return num / Math.sqrt(den1 * den2);
};

const smoothValue = (value, lastValueRef, smoothingFactor = SMOOTHING_FACTOR) => {
  if (!lastValueRef.current) {
    lastValueRef.current = value;
    return value;
  }
  
  // Apply exponential moving average smoothing
  lastValueRef.current = 
    smoothingFactor * value + (1 - smoothingFactor) * lastValueRef.current;
  
  // Round to nearest integer
  return Math.round(lastValueRef.current);
};

const smoothHeartRate = (newRate) => {
  if (!smoothedHeartRateRef.current) {
    smoothedHeartRateRef.current = newRate;
    return newRate;
  }
  
  // Apply more aggressive smoothing for high heart rates
  let smoothingFactor = SMOOTHING_FACTOR;
  if (newRate > 100) {
    smoothingFactor = SMOOTHING_FACTOR * 2; // More aggressive smoothing for high rates
  }
  
  // If the new rate is vastly different from our current smoothed rate,
  // apply extra smoothing or reject if too extreme
  const difference = Math.abs(newRate - smoothedHeartRateRef.current);
  if (difference > 30) {
    if (difference > 50) {
      // Extremely large jump - most likely erroneous
      console.log(`Rejecting extreme heart rate jump: ${smoothedHeartRateRef.current} -> ${newRate}`);
      return smoothedHeartRateRef.current;
    }
    // Large jump - use extra smoothing
    smoothingFactor = 0.1; // Very aggressive smoothing for large jumps
  }
  
  return smoothValue(newRate, smoothedHeartRateRef, smoothingFactor);
};

const smoothSignal = (signal, windowSize = 5) => {
  const result = [];
  for (let i = 0; i < signal.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - Math.floor(windowSize/2)); 
        j <= Math.min(signal.length - 1, i + Math.floor(windowSize/2)); j++) {
      sum += signal[j];
      count++;
    }
    result.push(sum / count);
  }
  return result;
};

const calculateHeartRateFallback = (signal) => {
  try {
    // Apply smoothing to reduce noise
    const smoothedSignal = smoothSignal(signal, 5);
    
    // Normalize the signal
    const mean = smoothedSignal.reduce((a, b) => a + b, 0) / smoothedSignal.length;
    const normalizedSignal = smoothedSignal.map(v => v - mean);
    
    // Calculate derivative - this helps identify peaks
    const derivative = [];
    for (let i = 1; i < normalizedSignal.length; i++) {
      derivative.push(normalizedSignal[i] - normalizedSignal[i-1]);
    }
    
    // Find zero crossings (where the signal changes from decreasing to increasing)
    // These correspond to potential heartbeats
    const zeroCrossings = [];
    for (let i = 1; i < derivative.length; i++) {
      if (derivative[i-1] < 0 && derivative[i] >= 0) {
        zeroCrossings.push(i);
      }
    }
    
    // If we don't have enough crossings, we can't calculate a reliable rate
    if (zeroCrossings.length < 3) {
      console.log('Not enough zero crossings found in signal');
      return null;
    }
    
    // Calculate the intervals between consecutive crossings
    const intervals = [];
    for (let i = 1; i < zeroCrossings.length; i++) {
      intervals.push(zeroCrossings[i] - zeroCrossings[i-1]);
    }
    
    // Filter out unreasonably short or long intervals
    // This helps eliminate noise-induced crossings
    const validIntervals = intervals.filter(interval => 
      interval >= SAMPLE_RATE * 0.25 && interval <= SAMPLE_RATE * 2
    );
    
    if (validIntervals.length < 2) {
      console.log('Not enough valid intervals between peaks');
      return null;
    }
    
    // For robustness, use median instead of mean
    validIntervals.sort((a, b) => a - b);
    let medianInterval;
    if (validIntervals.length % 2 === 0) {
      const mid = validIntervals.length / 2;
      medianInterval = (validIntervals[mid - 1] + validIntervals[mid]) / 2;
    } else {
      medianInterval = validIntervals[Math.floor(validIntervals.length / 2)];
    }
    
    // Calculate heart rate from median interval
    const heartRate = Math.round(60 * SAMPLE_RATE / medianInterval);
    
    // Return only if physiologically plausible
    if (heartRate >= 45 && heartRate <= 150) {
      console.log('Fallback method calculated heart rate:', heartRate, 'BPM');
      return heartRate;
    } else {
      console.log('Fallback method produced implausible heart rate:', heartRate);
      return null;
    }
  } catch (error) {
    console.error('Error in fallback heart rate calculation:', error);
    return null;
  }
};

const calculateHeartRate = (signal) => {
  try {
    setRawSignalValues(signal.slice(-150));
    
    if (!isFftAvailable() && !isTensorflowAvailable()) {
      return calculateHeartRateFallback(signal);
    }
    
    const mean = signal.reduce((a, b) => a + b, 0) / signal.length;
    const normalizedSignal = signal.map(v => v - mean);
    
    // Calculate standard deviation for signal quality assessment
    const variance = normalizedSignal.reduce((sum, val) => sum + Math.pow(val, 2), 0) / normalizedSignal.length;
    const stdDev = Math.sqrt(variance);
    
    // Check if signal is too noisy or too flat
    if (stdDev < 0.5 || stdDev > 50) {
      console.log('Signal quality issue - stdDev:', stdDev);
      return null;
    }
    
    const window = normalizedSignal.map((_, i) => 
      0.5 * (1 - Math.cos((2 * Math.PI * i) / (normalizedSignal.length - 1))
    ));
    const windowed = normalizedSignal.map((v, i) => v * window[i]);
    
    try {
      let heartRate;
      
      // Try tensorflow FFT if available
      if (isTensorflowAvailable()) {
        const tensor = tf.tensor1d(windowed);
        const fft = tf.spectral.rfft(tensor);
        const magnitudes = tf.abs(fft);
        
        // Get frequency range for human heart rates (0.75-2.5 Hz)
        const frequencies = Array.from({length: magnitudes.size}, (_, i) => 
          i * SAMPLE_RATE / windowed.length
        );
        
        // Convert to array
        const magArray = Array.from(magnitudes.dataSync());
        
        // Find peaks in the HR frequency range (45-150 BPM)
        const peaks = [];
        for (let i = 1; i < magArray.length - 1; i++) {
          const freq = frequencies[i];
          // Convert frequency to BPM (0.75 Hz = 45 BPM, 2.5 Hz = 150 BPM)
          const bpm = freq * 60;
          
          if (bpm >= 45 && bpm <= 150) {
            if (magArray[i] > magArray[i-1] && magArray[i] > magArray[i+1]) {
              peaks.push({
                frequency: freq,
                magnitude: magArray[i],
                bpm: Math.round(bpm)
              });
            }
          }
        }
        
        // Clean up tensors
        tensor.dispose();
        fft.dispose();
        magnitudes.dispose();
        
        // Get dominant peak
        if (peaks.length > 0) {
          peaks.sort((a, b) => b.magnitude - a.magnitude);
          heartRate = peaks[0].bpm;
        } else {
          return calculateHeartRateFallback(signal);
        }
      } 
      // Otherwise use FFTLib
      else if (isFftAvailable()) {
        // Ensure signal is appropriate for FFT
        // For FFT to work properly, array length should be power of 2
        const nextPowerOf2 = (num) => {
          return Math.pow(2, Math.ceil(Math.log2(num)));
        };
        
        // Determine target length (next power of 2)
        const targetLength = nextPowerOf2(windowed.length);
        
        // Create a padded array with zeros
        const paddedSignal = new Array(targetLength).fill(0);
        
        // Copy windowed data to padded array
        for (let i = 0; i < windowed.length; i++) {
          paddedSignal[i] = windowed[i] || 0; // Ensure no undefined values
        }
        
        // Properly format for FFT processing
        // Convert to array of [real, imaginary] pairs if your FFT library expects it
        const fftInput = paddedSignal.map(value => 
          typeof value === 'number' && !isNaN(value) ? value : 0
        );
        
        // Add better error handling and validation around the FFT call
        if (!Array.isArray(fftInput) || fftInput.length === 0) {
          throw new Error('Invalid FFT input: Empty or non-array input');
        }
        
        // Perform FFT
        const phasors = FFTLib.fft(fftInput);
        
        // Continue with the rest of your existing code
        const frequencies = FFTLib.util.fftFreq(phasors, SAMPLE_RATE);
        const magnitudes = FFTLib.util.fftMag(phasors);
        
        // Get all peaks in the frequency domain within human heart rate range
        const peaks = [];
        const humanHeartRateFreqMin = 0.75; // 45 BPM
        const humanHeartRateFreqMax = 2.5;  // 150 BPM
        
        for (let i = 1; i < magnitudes.length - 1; i++) {
          const freq = frequencies[i];
          // Only consider frequencies in the expected human heart rate range
          if (freq >= humanHeartRateFreqMin && freq <= humanHeartRateFreqMax) {
            // Find local maxima (peaks)
            if (magnitudes[i] > magnitudes[i-1] && magnitudes[i] > magnitudes[i+1]) {
              peaks.push({
                frequency: freq,
                magnitude: magnitudes[i],
                bpm: Math.round(freq * 60)
              });
            }
          }
        }
        
        // Sort peaks by magnitude
        peaks.sort((a, b) => b.magnitude - a.magnitude);
        
        // Debugging
        if (peaks.length > 0) {
          console.log('Top 3 frequency peaks:', peaks.slice(0, 3));
        } else {
          console.log('No clear frequency peaks detected in expected range');
          return null;
        }
        
        // Check if there are strong peaks
        if (peaks.length === 0) {
          return null;
        }
        
        // Use the strongest peak for heart rate
        const dominantPeak = peaks[0];
        heartRate = dominantPeak.bpm;
      } else {
        return calculateHeartRateFallback(signal);
      }
      
      // Check if heart rate is physiologically plausible
      if (heartRate < 45 || heartRate > 150) {
        console.log('Rejected heart rate outside normal range:', heartRate);
        const fallbackRate = calculateHeartRateFallback(signal);
        return fallbackRate ? smoothHeartRate(fallbackRate) : null;
      }
      
      // Check if this heart rate is significantly different from previous
      if (lastValidHeartRateRef.current && 
          Math.abs(heartRate - lastValidHeartRateRef.current) > 20) {
        console.log('Large jump in heart rate detected:', 
          lastValidHeartRateRef.current, '->', heartRate);
        // If this persists for several readings, accept it, otherwise smooth heavily
        smoothedHeartRateRef.current = lastValidHeartRateRef.current;
      }
      
      return smoothHeartRate(heartRate);
    } catch (fftError) {
      console.error('FFT calculation error:', fftError);
      const fallbackRate = calculateHeartRateFallback(signal);
      return fallbackRate ? smoothHeartRate(fallbackRate) : null;
    }
  } catch (error) {
    console.error('Heart rate calculation error:', error);
    return null;
  }
};

const calculateRespiratoryRate = (redSignal) => {
  try {
    // Respiratory rate has a lower frequency than heart rate
    // Typical range: 8-30 breaths per minute (0.13-0.5 Hz)
    
    // Apply a low-pass filter to isolate respiratory frequencies
    const smoothedSignal = smoothSignal(redSignal, 10); // Stronger smoothing for respiration
    
    if (isTensorflowAvailable()) {
      const tensor = tf.tensor1d(smoothedSignal);
      const fft = tf.spectral.rfft(tensor);
      const magnitudes = tf.abs(fft);
      
      // Get frequency range for human respiration (0.13-0.5 Hz)
      const frequencies = Array.from({length: magnitudes.size}, (_, i) => 
        i * SAMPLE_RATE / smoothedSignal.length
      );
      
      // Convert to array
      const magArray = Array.from(magnitudes.dataSync());
      
      // Find peaks in the respiratory frequency range (8-30 breaths/min)
      const peaks = [];
      for (let i = 1; i < magArray.length - 1; i++) {
        const freq = frequencies[i];
        // Convert frequency to breaths per minute
        const breathsPerMin = freq * 60;
        
        if (breathsPerMin >= 8 && breathsPerMin <= 40) {
          if (magArray[i] > magArray[i-1] && magArray[i] > magArray[i+1]) {
            peaks.push({
              frequency: freq,
              magnitude: magArray[i],
              rate: Math.round(breathsPerMin)
            });
          }
        }
      }
      
      // Clean up tensors
      tensor.dispose();
      fft.dispose();
      magnitudes.dispose();
      
      // Get dominant peak
      if (peaks.length > 0) {
        peaks.sort((a, b) => b.magnitude - a.magnitude);
        const respRate = peaks[0].rate;
        
        // Physiological check
        if (respRate >= 8 && respRate <= 40) {
          return smoothValue(respRate, smoothedRespiratoryRateRef);
        }
      }
    } else if (isFftAvailable()) {
      // Similar implementation as in heart rate but for respiratory frequencies
      const mean = smoothedSignal.reduce((a, b) => a + b, 0) / smoothedSignal.length;
      const normalizedSignal = smoothedSignal.map(v => v - mean);
      
      // Apply window function to reduce spectral leakage
      const window = normalizedSignal.map((_, i) => 
        0.5 * (1 - Math.cos((2 * Math.PI * i) / (normalizedSignal.length - 1)))
      );
      const windowed = normalizedSignal.map((v, i) => v * window[i]);
      
      // Pad to power of 2
      const nextPowerOf2 = (num) => Math.pow(2, Math.ceil(Math.log2(num)));
      const targetLength = nextPowerOf2(windowed.length);
      const paddedSignal = new Array(targetLength).fill(0);
      for (let i = 0; i < windowed.length; i++) {
        paddedSignal[i] = windowed[i] || 0;
      }
      
      // Perform FFT
      const phasors = FFTLib.fft(paddedSignal);
      const frequencies = FFTLib.util.fftFreq(phasors, SAMPLE_RATE);
      const magnitudes = FFTLib.util.fftMag(phasors);
      
      // Find peaks in respiratory range
      const peaks = [];
      const respRateMin = 0.13; // 8 breaths per minute
      const respRateMax = 0.67; // 40 breaths per minute
      
      for (let i = 1; i < magnitudes.length - 1; i++) {
        const freq = frequencies[i];
        if (freq >= respRateMin && freq <= respRateMax) {
          if (magnitudes[i] > magnitudes[i-1] && magnitudes[i] > magnitudes[i+1]) {
            peaks.push({
              frequency: freq,
              magnitude: magnitudes[i],
              rate: Math.round(freq * 60)
            });
          }
        }
      }
      
      if (peaks.length > 0) {
        peaks.sort((a, b) => b.magnitude - a.magnitude);
        const respRate = peaks[0].rate;
        
        // Physiological check
        if (respRate >= 8 && respRate <= 40) {
          return smoothValue(respRate, smoothedRespiratoryRateRef);
        }
      }
    }
    
    // Fallback method using time-domain analysis
    // Count significant peaks in smoothed, detrended signal
    const mean = smoothedSignal.reduce((a, b) => a + b, 0) / smoothedSignal.length;
    const detrended = smoothedSignal.map(v => v - mean);
    
    // Find peaks
    const peaks = [];
    for (let i = 1; i < detrended.length - 1; i++) {
      if (detrended[i] > detrended[i-1] && detrended[i] > detrended[i+1] && detrended[i] > 0.2) {
        peaks.push(i);
      }
    }
    
    if (peaks.length >= 2) {
      // Calculate time between peaks
      const intervals = [];
      for (let i = 1; i < peaks.length; i++) {
        intervals.push(peaks[i] - peaks[i-1]);
      }
      
      // Filter unreasonable intervals
      const validIntervals = intervals.filter(interval => 
        interval >= SAMPLE_RATE * 1.5 && interval <= SAMPLE_RATE * 7.5
      );
      
      if (validIntervals.length > 0) {
        // Calculate average interval
        const avgInterval = validIntervals.reduce((a, b) => a + b, 0) / validIntervals.length;
        const respRate = Math.round(60 * SAMPLE_RATE / avgInterval);
        
        // Physiological check
        if (respRate >= 8 && respRate <= 40) {
          return smoothValue(respRate, smoothedRespiratoryRateRef);
        }
      }
    }
    
    // If we reach here, we couldn't calculate a valid respiratory rate
    return null;
  } catch (error) {
    console.error('Respiratory rate calculation error:', error);
    return null;
  }
};

const calculateSpO2 = (redValues, infraredValues) => {
  try {
    // SpO2 is typically calculated using the ratio of red to infrared light absorption
    // Since we don't have infrared in a regular camera, we'll use red and blue as a proxy
    // This is not medically accurate but can provide a rough estimate for demonstration
    
    // Get the AC component (pulsatile) and DC component (constant) of each signal
    // We'll use a simple high-pass filter to extract AC
    const getACDC = (signal) => {
      const windowSize = 10;
      const dc = smoothSignal(signal, windowSize); // DC is the low-frequency component
      const ac = signal.map((value, i) => Math.abs(value - dc[i])); // AC is the variation around DC
      
      // Calculate AC amplitude
      const acSum = ac.reduce((sum, val) => sum + val, 0);
      const acAvg = acSum / ac.length;
      
      // Calculate DC average
      const dcAvg = dc.reduce((sum, val) => sum + val, 0) / dc.length;
      
      return { ac: acAvg, dc: dcAvg };
    };
    
    const redComponents = getACDC(redValues);
    const blueComponents = getACDC(infraredValues); // Using blue as a proxy for infrared
    
    // Calculate ratio of ratios
    // R = (ACred/DCred)/(ACblue/DCblue)
    const R = (redComponents.ac / redComponents.dc) / (blueComponents.ac / blueComponents.dc);
    
    // Empirical formula for SpO2 (simplified)
    // SpO2 = 110 - 25 * R
    // This is a simplified approximation - real pulse oximeters use calibration curves
    let spo2 = 110 - 25 * R;
    
    // Constrain to physiological range
    spo2 = Math.min(100, Math.max(70, spo2));
    
    // Round to nearest integer
    spo2 = Math.round(spo2);
    
    // Smooth values over time
    return smoothValue(spo2, smoothedSpo2Ref);
  } catch (error) {
    console.error('SpO2 calculation error:', error);
    return null;
  }
};

const processFrame = async () => {
  if (!processingRef.current) return;

  let src = null;
  try {
    if (!canvasRef.current) {
      console.warn('Canvas element is not available');
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      console.warn('Failed to get canvas context');
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // Check if video is ready
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    } else {
      // Display loading message if video feed is not ready
      ctx.fillStyle = '#000000';
      ctx.font = '16px Arial';
      ctx.fillText('Waiting for camera feed...', 20, 60);
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }
    
    // Try auto-exposure adjustment to improve lighting
    try {
      const fullImageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      const avgBrightness = calculateAverageBrightness(fullImageData.data);
      
      // If the image is too dark, adjust brightness
      if (avgBrightness < 70) {
        adjustBrightness(ctx, canvasRef.current.width, canvasRef.current.height, avgBrightness);
      }
    } catch (adjustmentError) {
      console.warn('Brightness adjustment error:', adjustmentError);
    }
    
    // Get forehead region using face-api.js (or fallback)
    const roi = usingFallbackMethod ? 
      getDefaultMonitoringRegion(canvasRef.current.width, canvasRef.current.height) : 
      await detectForeheadRegion(ctx);
    
    try {
      const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      src = cv.matFromImageData(imageData);
    } catch (cvError) {
      console.error('OpenCV error:', cvError);
      // Continue without OpenCV processing
    }

    // Semi-transparent white overlay for areas outside ROI
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillRect(0, 0, canvasRef.current.width, roi.y);
    ctx.fillRect(0, roi.y + roi.height, canvasRef.current.width, canvasRef.current.height - (roi.y + roi.height));
    ctx.fillRect(0, roi.y, roi.x, roi.height);
    ctx.fillRect(roi.x + roi.width, roi.y, canvasRef.current.width - (roi.x + roi.width), roi.height);
    
    // ROI styling - change to green when a face is detected
    ctx.strokeStyle = faceDetected ? '#22c55e' : (signalQuality?.isGood ? '#0066ff' : '#ff0000');
    ctx.lineWidth = 3;
    ctx.strokeRect(roi.x, roi.y, roi.width, roi.height);
    
    // Add a semi-transparent highlight for the ROI
    ctx.fillStyle = faceDetected 
      ? 'rgba(34, 197, 94, 0.1)' 
      : (signalQuality?.isGood ? 'rgba(0, 102, 255, 0.1)' : 'rgba(255, 0, 0, 0.1)');
    ctx.fillRect(roi.x, roi.y, roi.width, roi.height);

    // Add text to indicate what's being measured
    ctx.fillStyle = faceDetected ? '#22c55e' : (signalQuality?.isGood ? '#0066ff' : '#ff0000');
    ctx.font = '16px Arial';
    ctx.fillText(faceDetected ? 'Face Detected - Forehead ROI' : 'Default ROI', roi.x, roi.y - 8);
    
    // Check if ROI is valid (not too small or outside the frame)
    const isRoiValid = roi.width > 5 && roi.height > 5 && 
      roi.x >= 0 && roi.y >= 0 && 
      roi.x + roi.width <= canvasRef.current.width && 
      roi.y + roi.height <= canvasRef.current.height;
    
    if (!isRoiValid) {
      console.warn('Invalid ROI detected, using default:', roi);
      const defaultRoi = getDefaultMonitoringRegion(canvasRef.current.width, canvasRef.current.height);
      Object.assign(roi, defaultRoi);
    }
    
    // Extract RGB data from the ROI
    let redSum = 0;
    let greenSum = 0;
    let blueSum = 0;
    
    try {
      const roiData = ctx.getImageData(roi.x, roi.y, roi.width, roi.height);
      const pixels = roiData.data.length / 4;
      
      // Calculate average for all channels
      for (let i = 0; i < roiData.data.length; i += 4) {
        redSum += roiData.data[i];
        greenSum += roiData.data[i + 1];
        blueSum += roiData.data[i + 2];
      }
      
      const redAvg = redSum / pixels;
      const greenAvg = greenSum / pixels;
      const blueAvg = blueSum / pixels;
      
      // Display channel values for debugging
      ctx.fillStyle = '#000000';
      ctx.font = '12px monospace';
      ctx.fillText(`R: ${Math.round(redAvg)} G: ${Math.round(greenAvg)} B: ${Math.round(blueAvg)}`, 
                  roi.x, roi.y + roi.height + 15);
      
      // Show a visual indicator of signal quality
      const qualityText = signalQuality 
        ? `SNR: ${signalQuality.snr.toFixed(1)} dB | Motion: ${signalQuality.motion.toFixed(1)}`
        : 'Calculating signal quality...';
      ctx.fillText(qualityText, roi.x, roi.y + roi.height + 32);
      
      // Additional debug info
      if (signalQuality && 'channelCorrelation' in signalQuality) {
        ctx.fillText(`Channel correlation: ${signalQuality.channelCorrelation.toFixed(2)}`, 
                  roi.x, roi.y + roi.height + 49);
      }
      
      // Display current vital signs in ROI
      // Display current vital signs in ROI
      if (heartRate) {
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = signalQuality?.isGood ? '#0066ff' : '#ff3300';
        ctx.fillText(`${heartRate} BPM`, roi.x + roi.width - 80, roi.y + 25);
        
        // Show confidence level
        const confidencePercent = Math.round(confidence * 100);
        ctx.font = '12px Arial';
        ctx.fillStyle = '#000000';
        ctx.fillText(`Confidence: ${confidencePercent}%`, roi.x + roi.width - 100, roi.y + 45);
      }
      
      // Display respiratory rate if available
      if (respiratoryRate) {
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#22a36a';
        ctx.fillText(`${respiratoryRate} breaths/min`, roi.x + roi.width - 130, roi.y + 70);
      }
      
      // Display SpO2 if available
      if (spo2) {
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#9333ea';
        ctx.fillText(`SpO₂: ${spo2}%`, roi.x + roi.width - 80, roi.y + 95);
      }

      // Add to buffers
      bufferRef.current.push({ 
        timestamp: Date.now(), 
        value: greenAvg,
        red: redAvg,
        green: greenAvg,
        blue: blueAvg
      });
      
      redBufferRef.current.push(redAvg);
      greenBufferRef.current.push(greenAvg);
      blueBufferRef.current.push(blueAvg);
      
      if (bufferRef.current.length > MAX_BUFFER_SIZE) {
        bufferRef.current.shift();
        redBufferRef.current.shift();
        greenBufferRef.current.shift();
        blueBufferRef.current.shift();
      }

      // Wait for enough data to analyze
      if (bufferRef.current.length >= Math.floor(MAX_BUFFER_SIZE * 0.4)) { // Reduced from 0.6 to 0.4 for faster feedback
        const greenValues = bufferRef.current.map((item) => item.value);
        const redValues = redBufferRef.current;
        const blueValues = blueBufferRef.current;
        
        // Use improved quality analysis with all RGB channels
        const quality = analyzeSignalQuality(greenValues, bufferRef.current);
        setSignalQuality(quality);
        
        // Calculate heart rate if signal quality is acceptable
        // Lower threshold to -5 to allow more readings even with low quality
        if (quality.snr > -5) {
          const hr = calculateHeartRate(greenValues);
          
          if (hr && hr >= 45 && hr <= 180) {
            // For abnormally high readings (>140), require higher confidence
            if (hr > 140 && quality.snr < 2) {
              console.log(`Rejecting high heart rate (${hr}) due to very low signal quality`);
            } else {
              setHeartRate(hr);
              lastValidHeartRateRef.current = hr;
              
              const now = Date.now();
              if (!lastHeartRateTimestampRef.current || now - lastHeartRateTimestampRef.current > 1000) {
                lastHeartRateTimestampRef.current = now;
                setHeartRateHistory((prev) => [...prev.slice(-59), hr]);
                
                // Update respiratory rate every few heart rate calculations
                if (redValues.length >= 150) {
                  const rr = calculateRespiratoryRate(redValues);
                  if (rr && rr >= 8 && rr <= 40) {
                    setRespiratoryRate(rr);
                    lastValidRespiratoryRateRef.current = rr;
                    setRespiratoryRateHistory((prev) => [...prev.slice(-29), rr]);
                  }
                  
                  // Update SpO2 calculation
                  const oxygenLevel = calculateSpO2(redValues, blueValues);
                  if (oxygenLevel && oxygenLevel >= 70 && oxygenLevel <= 100) {
                    setSpO2(oxygenLevel);
                    lastValidSpo2Ref.current = oxygenLevel;
                    setSpo2History((prev) => [...prev.slice(-29), oxygenLevel]);
                  }
                }
              }
              
              // Adjust confidence calculation to be more realistic with poor signals
              // Never go below 0.2 confidence (20%)
              setConfidence(Math.min(Math.max(0.2, quality.snr / 20), 1));
              
              // Always call the update handler if we have vital signs
              if (onVitalSignsUpdate) {
                onVitalSignsUpdate({
                  heartRate: hr,
                  respiratoryRate: respiratoryRate || null,
                  oxygenLevel: spo2 || null,
                  confidence: Math.min(Math.max(0.2, quality.snr / 20), 1),
                  timestamp: new Date().toISOString()
                });
              }
            }
          } else if (hr) {
            console.log(`Heart rate outside normal range: ${hr}`);
          }
        } else {
          // Add retry info to the UI
          ctx.fillStyle = '#ff3300';
          ctx.font = '14px Arial';
          ctx.fillText('Try adjusting lighting or camera position', roi.x, roi.y + roi.height + 70);
          
          console.log(`Poor signal quality: SNR=${quality.snr.toFixed(1)}, motion=${quality.motion.toFixed(1)}`);
        }
      } else {
        // Show buffer filling progress
        const progress = (bufferRef.current.length / (MAX_BUFFER_SIZE * 0.4)) * 100;
        ctx.fillStyle = '#333333';
        ctx.font = '14px Arial';
        ctx.fillText(`Calibrating: ${Math.min(100, Math.round(progress))}%`, roi.x, roi.y + roi.height + 70);
      }
    } catch (roiError) {
      console.error('ROI processing error:', roiError);
      // Continue processing even if ROI analysis fails
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  } catch (error) {
    console.error('Processing error:', error);
    setErrorMessage('Processing error - check console for details');
    
    // More robust error recovery
    try {
      // Switch to fallback method if face detection consistently fails
      if (!usingFallbackMethod) {
        setUsingFallbackMethod(true);
        console.log('Switching to fallback method for forehead detection');
      }
      
      // Try to continue with a default ROI even after an error
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          const defaultRoi = getDefaultMonitoringRegion(canvasRef.current.width, canvasRef.current.height);
          
          ctx.strokeStyle = '#ff0000';
          ctx.lineWidth = 3;
          ctx.strokeRect(defaultRoi.x, defaultRoi.y, defaultRoi.width, defaultRoi.height);
          
          ctx.fillStyle = '#ff0000';
          ctx.font = '16px Arial';
          ctx.fillText('Recovery mode - using default ROI', defaultRoi.x, defaultRoi.y - 8);
        }
      }
    } catch (recoveryError) {
      console.error('Recovery attempt failed:', recoveryError);
    }
    
    // Continue processing frames even if there's an error
    animationFrameRef.current = requestAnimationFrame(processFrame);
  } finally {
    if (src) {
      try {
        src.delete();
      } catch (releaseError) {
        console.warn('Error releasing OpenCV resources:', releaseError);
      }
    }
  }
};

// Helper function to calculate average brightness of an image
const calculateAverageBrightness = (data) => {
  let totalBrightness = 0;
  let pixelCount = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Calculate perceived brightness using weighted average
    const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
    totalBrightness += brightness;
    pixelCount++;
  }
  
  return totalBrightness / pixelCount;
};

// Function to adjust brightness of the image
const adjustBrightness = (ctx, width, height, currentBrightness) => {
  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Target brightness (middle gray)
    const targetBrightness = 127;
    const adjustment = targetBrightness / currentBrightness;
    
    // Don't adjust too aggressively
    const safeAdjustment = Math.min(1.5, Math.max(0.7, adjustment));
    
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * safeAdjustment);         // Red
      data[i + 1] = Math.min(255, data[i + 1] * safeAdjustment); // Green
      data[i + 2] = Math.min(255, data[i + 2] * safeAdjustment); // Blue
    }
    
    ctx.putImageData(imageData, 0, 0);
  } catch (error) {
    console.warn('Error during brightness adjustment:', error);
  }
};

const startMonitoring = async () => {
  setShowCamera(true);
  setErrorMessage(null);
  bufferRef.current = [];
  redBufferRef.current = [];
  greenBufferRef.current = [];
  blueBufferRef.current = [];
  setReportData(null);
  setHeartRateHistory([]);
  setRespiratoryRateHistory([]);
  setSpo2History([]);
  setLiveStats({
    min: null,
    max: null,
    avg: null,
    respMin: null,
    respMax: null,
    respAvg: null,
    spo2Min: null,
    spo2Max: null,
    spo2Avg: null,
    duration: 0,
    sampleCount: 0
  });

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { 
        width: 640,
        height: 480,
        facingMode: 'user',
        frameRate: { ideal: 30 },
      },
    });

    streamRef.current = stream;
    
    // Safety check for videoRef
    if (!videoRef.current) {
      throw new Error("Video element not available");
    }
    
    videoRef.current.srcObject = stream;

    videoRef.current.onloadedmetadata = () => {
      videoRef.current.play();
      setIsMonitoring(true);
      processingRef.current = true;
      // Reset monitoring start time
      monitoringStartTimeRef.current = Date.now();
      // Start both animation loops
      processFrame();
      renderROI();
    };
  } catch (error) {
    console.error('Failed to acquire camera feed:', error);
    setErrorMessage('Unable to access camera. Please check permissions.');
  }
};

const stopMonitoring = () => {
  setIsMonitoring(false);
  processingRef.current = false;
  
  if (animationFrameRef.current) {
    cancelAnimationFrame(animationFrameRef.current);
  }
  if (roiAnimationFrameRef.current) {
    cancelAnimationFrame(roiAnimationFrameRef.current);
  }
  if (chartAnimationId) {
    cancelAnimationFrame(chartAnimationId);
  }
  
  // Stop all camera tracks
  if (streamRef.current) {
    streamRef.current.getTracks().forEach(track => track.stop());
  }

  // Generate report only if we have valid data
  if (heartRateHistory.length > 2) {
    const validHeartReadings = heartRateHistory.filter(hr => hr !== null && hr >= 45 && hr <= 200);
    const validRespReadings = respiratoryRateHistory.filter(rr => rr !== null && rr >= 8 && rr <= 40);
    const validSpo2Readings = spo2History.filter(sp => sp !== null && sp >= 70 && sp <= 100);
    
    const report = {
      timestamp: new Date().toISOString(),
      heartRate: {
        average: validHeartReadings.length > 0 ? Math.round(validHeartReadings.reduce((a, b) => a + b, 0) / validHeartReadings.length) : null,
        min: validHeartReadings.length > 0 ? Math.min(...validHeartReadings) : null,
        max: validHeartReadings.length > 0 ? Math.max(...validHeartReadings) : null,
        readings: validHeartReadings
      },
      respiratoryRate: {
        average: validRespReadings.length > 0 ? Math.round(validRespReadings.reduce((a, b) => a + b, 0) / validRespReadings.length) : null,
        min: validRespReadings.length > 0 ? Math.min(...validRespReadings) : null,
        max: validRespReadings.length > 0 ? Math.max(...validRespReadings) : null,
        readings: validRespReadings
      },
      oxygenLevel: {
        average: validSpo2Readings.length > 0 ? Math.round(validSpo2Readings.reduce((a, b) => a + b, 0) / validSpo2Readings.length) : null,
        min: validSpo2Readings.length > 0 ? Math.min(...validSpo2Readings) : null,
        max: validSpo2Readings.length > 0 ? Math.max(...validSpo2Readings) : null,
        readings: validSpo2Readings
      },
      duration: monitoringDuration,
      signalQuality: {
        avgSNR: signalQuality?.snr || 0,
        avgMotion: signalQuality?.motion || 0
      }
    };
    
    setReportData(report);
    saveReportToServer(report);
  }
};

const saveReportToServer = async (report) => {
  try {
    await vitalSignsAPI.saveVitalSigns({
      heartRate: report.heartRate.average,
      respiratoryRate: report.respiratoryRate.average,
      oxygenLevel: report.oxygenLevel.average,
      details: report,
      timestamp: report.timestamp
    });
    toast.success('Vital signs report saved successfully');
  } catch (error) {
    toast.error('Failed to save vital signs report');
  }
};

const initializeChart = () => {
  if (!chartRef.current || chartInstanceRef.current) return;

  const ctx = chartRef.current.getContext('2d');
  
  chartInstanceRef.current = new Chart(ctx, {
    type: 'line',
    data: {
      labels: rawSignalValues.map((_, i) => i),
      datasets: [{
        label: 'PPG Signal',
        data: rawSignalValues,
        borderColor: '#0066ff',
        backgroundColor: 'rgba(0, 102, 255, 0.1)',
        borderWidth: 1,
        tension: 0.1,
        pointRadius: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        y: { display: false },
        x: { display: false }
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    }
  });

  const animate = () => {
    if (!chartInstanceRef.current) return;
    updateChart();
    setChartAnimationId(requestAnimationFrame(animate));
  };
  
  animate();
};

const updateChart = () => {
  if (!chartInstanceRef.current) return;
  
  chartInstanceRef.current.data.datasets[0].data = rawSignalValues;
  chartInstanceRef.current.update('none');
};

// Format time in MM:SS format
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const LiveStatsPanel = ({ stats, heartRate, respiratoryRate, spo2 }) => (
  <div className="border rounded-lg overflow-hidden mb-4 bg-white">
    <div className="bg-gray-100 p-2 border-b flex justify-between items-center">
      <span className="text-gray-800 font-medium">Vital Signs Statistics</span>
      <div className="flex items-center space-x-1 text-gray-500 text-xs">
        <Clock className="w-3 h-3" />
        <span>{formatTime(stats.duration)}</span>
      </div>
    </div>
    
    {/* Heart Rate Stats */}
    <div className="border-b">
      <div className="px-3 py-2 bg-blue-50 text-blue-800 text-xs font-semibold flex items-center">
        <Heart className="w-3 h-3 mr-1" /> Heart Rate
      </div>
      <div className="grid grid-cols-3 divide-x">
        <div className="p-3 text-center">
          <div className="text-xs uppercase text-gray-500 font-semibold mb-1 flex items-center justify-center">
            <TrendingDown className="w-3 h-3 mr-1 text-blue-500" /> Minimum
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {stats.min !== null ? stats.min : '--'}
          </div>
        </div>
        <div className="p-3 text-center bg-blue-50">
          <div className="text-xs uppercase text-gray-500 font-semibold mb-1 flex items-center justify-center">
            <Activity className="w-3 h-3 mr-1 text-blue-600" /> Current
          </div>
          <div className="text-3xl font-bold text-blue-700">
            {heartRate !== null ? heartRate : '--'}
          </div>
        </div>
        <div className="p-3 text-center">
          <div className="text-xs uppercase text-gray-500 font-semibold mb-1 flex items-center justify-center">
            <TrendingUp className="w-3 h-3 mr-1 text-blue-500" /> Maximum
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {stats.max !== null ? stats.max : '--'}
          </div>
        </div>
      </div>
    </div>
    
    {/* Respiratory Rate Stats */}
    <div className="border-b">
      <div className="px-3 py-2 bg-green-50 text-green-800 text-xs font-semibold flex items-center">
        <Lungs className="w-3 h-3 mr-1" /> Respiratory Rate
      </div>
      <div className="grid grid-cols-3 divide-x">
        <div className="py-2 px-3 text-center">
          <div className="text-xs text-gray-500 mb-1">Minimum</div>
          <div className="text-lg font-bold text-green-600">
            {stats.respMin !== null ? stats.respMin : '--'}
          </div>
        </div>
        <div className="py-2 px-3 text-center bg-green-50">
          <div className="text-xs text-gray-500 mb-1">Current</div>
          <div className="text-xl font-bold text-green-700">
            {respiratoryRate !== null ? respiratoryRate : '--'}
          </div>
        </div>
        <div className="py-2 px-3 text-center">
          <div className="text-xs text-gray-500 mb-1">Maximum</div>
          <div className="text-lg font-bold text-green-600">
            {stats.respMax !== null ? stats.respMax : '--'}
          </div>
        </div>
      </div>
    </div>
    
    {/* SpO2 Stats */}
    <div>
      <div className="px-3 py-2 bg-purple-50 text-purple-800 text-xs font-semibold flex items-center">
        <Droplet className="w-3 h-3 mr-1" /> Oxygen Saturation (SpO₂)
      </div>
      <div className="grid grid-cols-3 divide-x">
        <div className="py-2 px-3 text-center">
          <div className="text-xs text-gray-500 mb-1">Minimum</div>
          <div className="text-lg font-bold text-purple-600">
            {stats.spo2Min !== null ? `${stats.spo2Min}%` : '--'}
          </div>
        </div>
        <div className="py-2 px-3 text-center bg-purple-50">
          <div className="text-xs text-gray-500 mb-1">Current</div>
          <div className="text-xl font-bold text-purple-700">
            {spo2 !== null ? `${spo2}%` : '--'}
          </div>
        </div>
        <div className="py-2 px-3 text-center">
          <div className="text-xs text-gray-500 mb-1">Maximum</div>
          <div className="text-lg font-bold text-purple-600">
            {stats.spo2Max !== null ? `${stats.spo2Max}%` : '--'}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const ReportSummary = ({ report }) => (
  <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
    <h3 className="text-lg font-semibold mb-3">Vital Signs Report</h3>
    
    {/* Heart Rate Summary */}
    <div className="mb-4">
      <h4 className="text-sm font-medium text-blue-800 mb-2 flex items-center">
        <Heart className="w-4 h-4 mr-1" /> Heart Rate
      </h4>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600">{report.heartRate.average || '–'}</p>
          <p className="text-xs text-gray-600">Average BPM</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-green-600">{report.heartRate.min || '–'}</p>
          <p className="text-xs text-gray-600">Min BPM</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-red-600">{report.heartRate.max || '–'}</p>
          <p className="text-xs text-gray-600">Max BPM</p>
        </div>
      </div>
    </div>
    
    {/* Respiratory Rate Summary */}
    <div className="mb-4">
      <h4 className="text-sm font-medium text-green-800 mb-2 flex items-center">
        <Lungs className="w-4 h-4 mr-1" /> Respiratory Rate
      </h4>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">{report.respiratoryRate.average || '–'}</p>
          <p className="text-xs text-gray-600">Average breaths/min</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-green-600">{report.respiratoryRate.min || '–'}</p>
          <p className="text-xs text-gray-600">Min</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-green-600">{report.respiratoryRate.max || '–'}</p>
          <p className="text-xs text-gray-600">Max</p>
        </div>
      </div>
    </div>
    
    {/* SpO2 Summary */}
    <div className="mb-4">
      <h4 className="text-sm font-medium text-purple-800 mb-2 flex items-center">
        <Droplet className="w-4 h-4 mr-1" /> Oxygen Saturation (SpO₂)
      </h4>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-purple-600">{report.oxygenLevel.average ? `${report.oxygenLevel.average}%` : '–'}</p>
          <p className="text-xs text-gray-600">Average</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-purple-600">{report.oxygenLevel.min ? `${report.oxygenLevel.min}%` : '–'}</p>
          <p className="text-xs text-gray-600">Min</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-purple-600">{report.oxygenLevel.max ? `${report.oxygenLevel.max}%` : '–'}</p>
          <p className="text-xs text-gray-600">Max</p>
        </div>
      </div>
    </div>
    
    <div className="mt-4 text-sm text-gray-600">
      <p>Duration: {formatTime(report.duration)}</p>
      <p>Readings: {report.heartRate.readings.length} samples</p>
      <p>Signal Quality: {report.signalQuality.avgSNR.toFixed(1)} dB</p>
    </div>
  </div>
);

return (
  <div className="bg-white rounded-xl shadow-md overflow-hidden">
    <div className="p-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
      <div className="flex items-center">
        <Heart className="w-6 h-6 mr-2" />
        <h2 className="text-xl font-bold">Vital Signs Monitor</h2>
      </div>
      <p className="text-sm opacity-80 mt-1">
        {!usingFallbackMethod 
          ? "Face detection-powered photoplethysmography" 
          : "Camera-based photoplethysmography"}
      </p>
    </div>

    <div className="p-6">
      {loadingStatus && (
        <div className="text-center py-4">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
          <p>{loadingStatus}</p>
        </div>
      )}

      {showCamera ? (
        <div className="relative">
          {/* Live stats panel */}
          {isMonitoring && (
            <LiveStatsPanel 
              stats={liveStats} 
              heartRate={heartRate}
              respiratoryRate={respiratoryRate}
              spo2={spo2}
            />
          )}
          
          {/* Main video display with ROI canvas inset */}
          <div className="relative rounded-lg overflow-hidden bg-white border border-gray-200 mb-4">
            <div className="flex relative">
              {/* Main video feed */}
              <div className="relative flex-grow">
                <video 
                  ref={videoRef}
                  className="hidden"
                  width="640"
                  height="480"
                  playsInline
                  muted
                />
                <canvas
                  ref={canvasRef}
                  width="640"
                  height="480"
                  className="w-full h-auto"
                />
              </div>
              
              {/* ROI viewport (positioned in top-right corner) */}
              <div className="absolute top-2 right-2 w-32 h-32 bg-white border-2 border-gray-300 rounded-md shadow-md overflow-hidden">
                <canvas
                  ref={roiCanvasRef}
                  width="128"
                  height="128"
                  className="w-full h-full"
                />
                
                {/* ROI label */}
                <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-1 rounded-bl-sm">
                  <Maximize className="w-3 h-3" />
                </div>
              </div>
            </div>

            {isMonitoring && (
              <div className="absolute bottom-0 left-0 right-0 bg-white p-2 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Heart className={`w-8 h-8 mr-3 text-red-500 ${heartRate ? 'animate-pulse' : 'opacity-50'}`} />
                    <div>
                      <div className="text-3xl font-bold text-blue-600">
                        {heartRate || '--'} <span className="text-sm font-normal text-gray-600">BPM</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {heartRate ? 
                          (confidence >= 0.5 ? 'Medium confidence' : 'Low confidence') : 
                          'Calculating...'
                        }
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-start mr-4">
                  <div className="flex items-center mb-1">
                      <Lungs className="w-5 h-5 mr-1 text-green-600" />
                      <span className="text-lg font-bold text-green-600">
                        {respiratoryRate || '--'} <span className="text-xs font-normal text-gray-600">bpm</span>
                      </span>
                    </div>
                    <div className="flex items-center">
                      <Droplet className="w-5 h-5 mr-1 text-purple-600" />
                      <span className="text-lg font-bold text-purple-600">
                        {spo2 !== null ? `${spo2}%` : '--'} <span className="text-xs font-normal text-gray-600">SpO₂</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <button
                      onClick={() => setUsingFallbackMethod(!usingFallbackMethod)}
                      className="mr-2 py-2 px-3 rounded-lg text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
                      title={usingFallbackMethod ? "Switch to facial landmark detection" : "Switch to simple region detection"}
                    >
                      {usingFallbackMethod ? "Try Face Detection" : "Use Simple Mode"}
                    </button>
                    <button
                      onClick={isMonitoring ? stopMonitoring : startMonitoring}
                      className={`py-2 px-4 rounded-lg text-sm font-medium ${
                        isMonitoring 
                          ? 'bg-gray-600 text-white hover:bg-gray-700'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border rounded-lg overflow-hidden mb-4">
            <div className="bg-gray-100 p-2 border-b flex justify-between items-center">
              <span className="text-gray-800 font-medium">Live PPG Signal</span>
              {signalQuality && (
                <span className={`text-xs px-2 py-1 rounded ${
                  signalQuality.snr > 5 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  SNR: {signalQuality.snr.toFixed(1)} dB
                </span>
              )}
            </div>
            <div className="h-40">
              <canvas ref={chartRef} />
            </div>
          </div>

          {reportData && <ReportSummary report={reportData} />}

          {errorMessage && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
              <p className="text-red-600 text-sm">{errorMessage}</p>
              <button 
                className="ml-auto text-red-500 hover:text-red-700" 
                onClick={() => setErrorMessage(null)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          
          {!faceDetected && isMonitoring && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start">
              <Info className="w-5 h-5 text-yellow-500 mr-2" />
              <div>
                <p className="text-yellow-700 text-sm font-medium">Face not detected</p>
                <p className="text-yellow-600 text-xs mt-1">
                  Please position your face clearly in the camera view.
                  The green box should appear on your forehead.
                </p>
              </div>
            </div>
          )}
          
          {/* Debug signal quality display (only shown when SNR is very low) */}
          {signalQuality && signalQuality.snr < 0 && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-blue-700 text-sm font-medium mb-2">Improve Signal Quality</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-gray-700 font-medium">Try the following:</p>
                  <ul className="text-gray-600 mt-1 space-y-1 list-disc pl-4">
                    <li>Adjust your lighting (avoid backlighting)</li>
                    <li>Reduce movement</li>
                    <li>Position your forehead clearly in view</li>
                    <li>Remove glasses if possible</li>
                  </ul>
                </div>
                <div>
                  <p className="text-gray-700 font-medium">Current signal:</p>
                  <div className="mt-1 space-y-1">
                    <p className="text-gray-600">SNR: <span className={signalQuality.snr > 0 ? 'text-green-600' : 'text-red-600'}>
                      {signalQuality.snr.toFixed(1)}dB</span></p>
                    <p className="text-gray-600">Motion: <span className={signalQuality.motion < 3 ? 'text-green-600' : 'text-red-600'}>
                      {signalQuality.motion.toFixed(1)}</span></p>
                    {signalQuality.channelCorrelation && (
                      <p className="text-gray-600">Correlation: <span className={signalQuality.channelCorrelation > 0.4 ? 'text-green-600' : 'text-red-600'}>
                        {signalQuality.channelCorrelation.toFixed(2)}</span></p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="border-2 border-gray-200 rounded-lg p-6 text-center cursor-pointer 
          bg-white hover:bg-gray-50 transition-colors" onClick={startMonitoring}>
          <div className="w-24 h-24 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Heart className="w-12 h-12 text-blue-600" />
          </div>
          <h3 className="text-gray-800 font-medium mb-2 text-xl">Start Vital Signs Monitoring</h3>
          <p className="text-gray-600 text-sm mb-6">
            Monitor heart rate, respiratory rate, and oxygen saturation using your camera
          </p>
          <button className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-8 rounded-lg 
            text-sm font-medium inline-flex items-center">
            <Camera className="w-5 h-5 mr-2" />
            Activate Camera
          </button>
        </div>
      )}
    </div>

    {/* Enhanced instructions to help users get better results */}
    {showInstructions && showCamera && (
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-start">
          <Info className="w-5 h-5 text-blue-500 mr-2 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-800">For best results:</h4>
            <ul className="text-sm text-gray-600 mt-1 space-y-1">
              <li>• Ensure your face is <strong>well-lit from the front</strong> (avoid backlighting)</li>
              <li>• Remain <strong>still</strong> during measurement</li>
              <li>• Face the camera <strong>directly</strong></li>
              <li>• Avoid wearing hats or having hair <strong>covering your forehead</strong></li>
              <li>• Try both detection modes if you're having trouble</li>
              <li>• Allow 10-15 seconds for the signal to stabilize</li>
            </ul>
          </div>
        </div>
      </div>
    )}
  </div>
);
};

export default VitalSignsMonitor;
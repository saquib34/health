import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Camera, Loader, User, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import * as faceapi from 'face-api.js';
import { useAuth } from '../context/AuthContext';
import { useAssistant } from '../context/AssistantContext';
import Button from '../components/Button';

const debugLog = (message, data) => {
  const timestamp = new Date().toISOString().substring(11, 23);
  data ? console.log(`[${timestamp}] 📷 ${message}`, data) : console.log(`[${timestamp}] 📷 ${message}`);
};

const FaceRecognition = () => {
  const navigate = useNavigate();
  const { loginWithFace, isAuthenticated } = useAuth();
  const { speak, displayMessage } = useAssistant();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanComplete, setScanComplete] = useState(false);
  const [userFound, setUserFound] = useState(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [debugInfo, setDebugInfo] = useState('');
  const [cameraInitStage, setCameraInitStage] = useState(0);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const isCapturingRef = useRef(false);
  const detectionInterval = useRef(null);
  const initAttemptRef = useRef(0);

  useEffect(() => { isCapturingRef.current = isCapturing }, [isCapturing]);

  useEffect(() => {
    const loadModels = async () => {
      try {
        setIsLoading(true);
        displayMessage("Welcome to HealthAI. Please look at the camera for face recognition.");
        speak("Welcome to Health AI. Please look at the camera for face recognition.");
        
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ]);
        
        setModelsLoaded(true);
        setIsLoading(false);
      } catch (error) {
        toast.error('Failed to initialize face recognition. Please refresh the page.');
        setCameraError(`Error loading face models: ${error.message}`);
        setIsLoading(false);
      }
    };
    
    loadModels();
    
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      detectionInterval.current && clearInterval(detectionInterval.current);
    };
  }, []);

  useEffect(() => {
    if (modelsLoaded && !isLoading) initializeCamera();
  }, [modelsLoaded, isLoading]);

  const checkDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      if (videoDevices.length === 0) {
        setCameraError("No cameras detected on your device. Please connect a camera.");
        return false;
      }
      setDebugInfo(`Available cameras: ${videoDevices.length}`);
      return true;
    } catch (error) {
      setDebugInfo(`Error checking devices: ${error.message}`);
      return false;
    }
  };

  const initializeCamera = async () => {
    if (!videoRef.current) {
      setTimeout(() => initializeCamera(), 100);
      return;
    }

    setCameraInitStage(1);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setCameraError(null);
    setFaceDetected(false);
    initAttemptRef.current++;
    
    try {
      const hasDevices = await checkDevices();
      if (!hasDevices) return setCameraInitStage(0);

      setCameraInitStage(2);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user' }, audio: false 
        });
        
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        setCameraInitStage(4);
        
        videoRef.current.onloadedmetadata = () => {
          setCameraInitStage(5);
          videoRef.current.play().then(() => {
            setCameraInitStage(6);
            setIsCameraReady(true);
            startFaceDetection();
          }).catch(playError => {
            setCameraError(`Playback error: ${playError.message}`);
            setCameraInitStage(-1);
          });
        };
        
        videoRef.current.onerror = (e) => {
          setCameraError(`Video error: ${e.target.error?.message || 'Unknown error'}`);
          setCameraInitStage(-1);
        };
        
      } catch (err) {
        if (initAttemptRef.current < 2) {
          try {
            const basicStream = await navigator.mediaDevices.getUserMedia({ video: true });
            streamRef.current = basicStream;
            videoRef.current.srcObject = basicStream;
            videoRef.current.onloadedmetadata = () => {
              videoRef.current.play().then(() => {
                setIsCameraReady(true);
                startFaceDetection();
              }).catch(playError => {
                setCameraError(`Playback error: ${playError.message}`);
                setCameraInitStage(-1);
              });
            };
          } catch (finalError) {
            handleCameraError(finalError);
          }
        } else handleCameraError(err);
      }
    } catch (error) {
      handleCameraError(error);
    }
  };

  const handleCameraError = (error) => {
    let errorMessage = "Unable to access camera. ";
    if (error.name === 'NotAllowedError') errorMessage += "Camera permission denied.";
    else if (error.name === 'NotFoundError') errorMessage += "No camera found.";
    else if (error.name === 'NotReadableError') errorMessage += "Camera in use.";
    else errorMessage += error.message || "Check permissions.";
    
    setCameraError(errorMessage);
    setCameraInitStage(-1);
    toast.error(errorMessage);
  };

  const startFaceDetection = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const displaySize = { 
      width: videoRef.current.videoWidth || 640, 
      height: videoRef.current.videoHeight || 480 
    };
    
    faceapi.matchDimensions(canvas, displaySize);
    
    detectionInterval.current = setInterval(async () => {
      if (!videoRef.current?.srcObject) return;
      
      try {
        const detections = await faceapi.detectAllFaces(
          videoRef.current, new faceapi.TinyFaceDetectorOptions()
        ).withFaceLandmarks();
        
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        faceapi.draw.drawDetections(canvas, resizedDetections);
        faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
        
        setFaceDetected(detections.length > 0);
        
        if (isCapturingRef.current && detections.length > 0) {
          setScanProgress(prev => {
            const newProgress = Math.min(prev + 2, 100);
            if (newProgress === 100) {
              setTimeout(() => {
                processFaceRecognition();
                clearInterval(detectionInterval.current);
              }, 0);
            }
            return newProgress;
          });
        }
      } catch (error) {
        debugLog('Detection error:', error);
      }
    }, 100);
  };

  const handleStartCapture = () => {
    if (!faceDetected) {
      toast.info('No face detected. Please position yourself in front of the camera.');
      speak("No face detected. Please position yourself in front of the camera.");
      return;
    }
    
    setIsCapturing(true);
    setScanProgress(0);
    displayMessage("Scanning your face. Please remain still.");
    speak("Scanning your face. Please remain still.");
  };

  const processFaceRecognition = async () => {
    try {
      setScanComplete(true);
      setIsCapturing(false);
      
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
      
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      const result = await loginWithFace(blob);
      
      if (result.success) {
        setUserFound(true);
        setTimeout(() => navigate('/dashboard'), 1500);
      } else if (result.newUser) {
        setUserFound(false);
        setTimeout(() => navigate('/register', { state: { blob } }), 2000);
      } else {
        setUserFound(false);
        setScanComplete(false);
        setScanProgress(0);
      }
      
    } catch (error) {
      toast.error('Face verification failed. Please try again.');
      setIsCapturing(false);
      setScanComplete(false);
      setScanProgress(0);
    }
  };
  
  const handleRetryCamera = () => {
    setIsLoading(true);
    setCameraError(null);
    initAttemptRef.current = 0;
    setTimeout(() => initializeCamera(), 500);
  };
  
  const forceCameraRetry = async () => {
    try {
      alert("Please allow camera access when prompted.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      handleRetryCamera();
    } catch (error) {
      setCameraError(`Permission error: ${error.message}`);
    }
  };

  useEffect(() => { if (isAuthenticated) navigate('/dashboard') }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (scanComplete) {
      displayMessage("Scan complete. Verifying your identity.");
      speak("Scan complete. Verifying your identity.");
    }
  }, [scanComplete]);

  const getCameraStageDescription = () => {
    switch (cameraInitStage) {
      case 0: return "Not started";
      case 1: return "Checking cameras";
      case 2: return "Requesting permissions";
      case 3: return "Stream obtained";
      case 4: return "Stream attached";
      case 5: return "Metadata loaded";
      case 6: return "Playback started";
      case -1: return "Failed";
      default: return "Unknown";
    }
  };

  return (
    <motion.div 
      className="flex flex-col items-center justify-center min-h-screen p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div 
        className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <div className="p-5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <h1 className="text-2xl font-bold text-center">HealthAI</h1>
          <p className="text-center opacity-90">Face Recognition</p>
        </div>
        
        {isLoading ? (
          <div className="p-8 flex flex-col items-center">
            <Loader className="animate-spin text-blue-600 w-12 h-12 mb-4" />
            <p className="text-gray-600">
              {!modelsLoaded 
                ? "Loading face recognition models..."
                : "Initializing camera..."}
            </p>
            {modelsLoaded && (
              <p className="text-xs text-gray-500 mt-2">
                Stage: {getCameraStageDescription()}
              </p>
            )}
          </div>
        ) : (
          <div className="p-6">
            <div className="relative rounded-xl overflow-hidden bg-gray-100 mb-4" style={{ minHeight: '240px' }}>
              <video 
                ref={videoRef}
                className="w-full h-auto"
                width="640"
                height="480"
                muted
                playsInline
                autoPlay
              />
              <canvas 
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full"
                width="640"
                height="480"
              />
              
              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 text-white p-4 text-center">
                  <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
                  <p className="text-red-300 font-medium mb-2">Camera Access Error</p>
                  <p className="mb-4 text-sm">{cameraError}</p>
                  <div className="flex flex-col space-y-2">
                    <button 
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white"
                      onClick={handleRetryCamera}
                    >
                      Retry Camera
                    </button>
                    <button
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-white flex items-center justify-center"
                      onClick={forceCameraRetry}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Force Permission Dialog
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-gray-300">
                    If this persists, try using a different browser or device
                  </p>
                  {debugInfo && (
                    <p className="mt-2 text-xs text-gray-400">
                      Debug info: {debugInfo}
                    </p>
                  )}
                </div>
              )}
              
              {!isCameraReady && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">
                  <p>Initializing camera...</p>
                </div>
              )}
              
              {isCapturing && (
                <div className="absolute bottom-0 left-0 w-full p-3 bg-gradient-to-t from-black to-transparent">
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                      style={{ width: `${scanProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}
              
              {scanComplete && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white flex-col">
                  {userFound === null ? (
                    <>
                      <Loader className="w-12 h-12 animate-spin mb-2" />
                      <p className="text-lg font-medium">Verifying identity...</p>
                    </>
                  ) : userFound ? (
                    <>
                      <CheckCircle className="w-16 h-16 text-green-400 mb-2" />
                      <p className="text-lg font-medium">Identity verified!</p>
                      <p>Redirecting to dashboard...</p>
                    </>
                  ) : (
                    <>
                      <User className="w-16 h-16 text-yellow-400 mb-2" />
                      <p className="text-lg font-medium">New user detected</p>
                      <p>Redirecting to registration...</p>
                    </>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center mb-4">
              <div className={`w-3 h-3 rounded-full mr-2 ${faceDetected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <p className="text-sm text-gray-600">
                {faceDetected ? 'Face detected' : 'No face detected'}
              </p>
            </div>
            
            {!isCapturing && !scanComplete && (
              <Button 
                className="w-full"
                onClick={handleStartCapture}
                disabled={!faceDetected || !isCameraReady || !!cameraError}
                icon={<Camera className="w-4 h-4 mr-2" />}
              >
                Begin Face Scan
              </Button>
            )}
            
            <div className="mt-4 text-center">
              <button 
                className="text-blue-600 hover:underline text-sm"
                onClick={() => navigate('/register')}
              >
                Register manually instead
              </button>
            </div>
          </div>
        )}
      </motion.div>
      
      <motion.p 
        className="mt-6 text-sm text-gray-600 text-center max-w-md"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        Your privacy matters. Face data is processed securely and never shared with third parties.
      </motion.p>
    </motion.div>
  );
};

export default FaceRecognition;
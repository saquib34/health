// src/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Pages
import SplashScreen from './pages/SplashScreen';
import FaceRecognition from './pages/FaceRecognition';
import Registration from './pages/Registration';
import AadhaarVerification from './pages/AadhaarVerification';
import VerificationComplete from './pages/VerificationComplete';
import Dashboard from './pages/Dashboard';
import HealthAssessment from './pages/HealthAssessment';
// import AppointmentBooking from './pages/AppointmentBooking';
// import MedicalRecords from './pages/MedicalRecords';
// import Prescriptions from './pages/Prescriptions';
// import Settings from './pages/Settings';
// import Doctors from './pages/Doctors';

// Components
import ProtectedRoute from './components/ProtectedRoute';
import AIAssistant from './components/AIAssistant';
import LoadingOverlay from './components/LoadingOverlay';

// Context
import { AuthProvider } from './context/AuthContext';
import { AssistantProvider } from './context/AssistantContext';
import { ModelProvider } from './context/ModelContext';

// Styles
import './styles/index.css';

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [modelStatus, setModelStatus] = useState({
    initializing: true,
    error: null
  });

  useEffect(() => {
    // Check model initialization status (in a real app, this would check with the backend)
    const checkModelStatus = async () => {
      try {
        // Simulating a call to check if models are ready
        // In a real app, this would be an API call
        // const response = await fetch('/api/model-status');
        // const data = await response.json();
        
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        setModelStatus({
          initializing: false,
          error: null
        });
        
      } catch (error) {
        console.error('Error checking model status:', error);
        setModelStatus({
          initializing: false,
          error: 'Failed to initialize AI models. Some features may be limited.'
        });
      } finally {
        // Ensure loading state is updated even if there's an error
        setIsLoading(false);
      }
    };

    // Initialize app with a timeout
    setTimeout(() => {
      checkModelStatus();
    }, 2000);
    
  }, []);

  // Render a fallback UI during loading
  if (isLoading) {
    return (
      <div className="app-container">
        <SplashScreen />
      </div>
    );
  }

  // Error boundary component to catch rendering errors
  const ErrorFallback = ({ error }) => (
    <div className="error-container flex flex-col items-center justify-center min-h-screen bg-red-50 p-4 text-center">
      <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h1>
      <pre className="bg-white p-4 rounded shadow text-red-800 overflow-auto max-w-full">{error.message}</pre>
      <button 
        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" 
        onClick={() => window.location.reload()}
      >
        Reload Application
      </button>
    </div>
  );

  // Wrap the entire app in an error boundary
  class ErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
      return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
      console.error("Rendering error:", error, errorInfo);
    }

    render() {
      if (this.state.hasError) {
        return <ErrorFallback error={this.state.error} />;
      }
      return this.props.children;
    }
  }

  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <AssistantProvider>
            <ModelProvider initialStatus={modelStatus}>
              <div className="app-container bg-gradient-to-br from-blue-50 to-indigo-50 min-h-screen">
                <AnimatePresence mode="wait">
                  <Routes>
                    <Route path="/" element={<FaceRecognition />} />
                    <Route path="/register" element={<Registration />} />
                    <Route path="/verify-aadhaar" element={<AadhaarVerification />} />
                    <Route path="/verification-complete" element={<VerificationComplete />} />
                    
                    <Route path="/dashboard" element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    } />
                    
                    {/* {/* Commented routes */}
                    <Route path="/health-assessment" element={
                      <ProtectedRoute>
                        <HealthAssessment />
                      </ProtectedRoute>
                    } /> 
                    
                    {/* <Route path="/appointments" element={
                      <ProtectedRoute>
                        <AppointmentBooking />
                      </ProtectedRoute>
                    } />
                    
                    <Route path="/medical-records" element={
                      <ProtectedRoute>
                        <MedicalRecords />
                      </ProtectedRoute>
                    } />
                    
                    <Route path="/prescriptions" element={
                      <ProtectedRoute>
                        <Prescriptions />
                      </ProtectedRoute>
                    } />
                    
                    <Route path="/doctors" element={
                      <ProtectedRoute>
                        <Doctors />
                      </ProtectedRoute>
                    } />
                    
                    <Route path="/settings" element={
                      <ProtectedRoute>
                        <Settings />
                      </ProtectedRoute>
                    } /> */} 
                    
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AnimatePresence>
                <AIAssistant />
                <ToastContainer position="bottom-right" theme="colored" />
                
                {/* Show model loading overlay if models are still initializing */}
                {modelStatus.initializing && <LoadingOverlay message="Initializing AI models..." />}
              </div>
            </ModelProvider>
          </AssistantProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
// src/pages/VerificationComplete.jsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { CheckCircle, Home } from 'lucide-react';

import { useAssistant } from '../context/AssistantContext';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import confetti from 'canvas-confetti';

const VerificationComplete = () => {
  const navigate = useNavigate();
  const { speak, displayMessage } = useAssistant();
  const { login, userData,register, } = useAuth();
  
  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        duration: 0.5,
        when: "beforeChildren",
        staggerChildren: 0.2
      }
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.3 }
    }
  };
  
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { duration: 0.4 }
    }
  };
  
// src/pages/VerificationComplete.jsx - Fixed processVerification function

useEffect(() => {
  // Prevent multiple verification attempts by checking for existing processing flags
  const registrationInProgress = localStorage.getItem('registration_in_progress');
  const verificationProcessed = localStorage.getItem('verification_processed');
  
  // Trigger confetti animation
  const triggerConfetti = () => {
    const duration = 3 * 1000;
    const end = Date.now() + duration;
    
    (function frame() {
      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0.05, y: 0.6 }
      });
      
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 0.95, y: 0.6 }
      });
      
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  };
  
  const processVerification = async () => {
    // Check if already processed to prevent duplication
    if (verificationProcessed === 'true') {
      console.log("Registration already processed, skipping duplicate submission");
      // Just show success UI
      triggerConfetti();
      displayMessage("Your account has been created and verified successfully.");
      speak("Congratulations! Your account has been created and verified successfully.");
      return;
    }
  
    try {
      // Check for required user data
      if (!userData?.user || !userData.face_image) {
        toast.error("Missing registration data. Please start over.");
        navigate('/register');
        return;
      }

      // Create FormData with proper structure
      const formDataToSend = new FormData();
      formDataToSend.append('user', JSON.stringify(userData.user));
      
      // Convert Blob to File with proper filename and type
      const faceFile = new File([userData.face_image], 'face.jpg', {
        type: userData.face_image.type || 'image/jpeg',
      });
      formDataToSend.append('face_image', faceFile);
      
      // Set flags to prevent duplicate submissions - do this BEFORE the API call
      localStorage.setItem('verification_processed', 'true');

      // Call registration API
      const response = await register(formDataToSend);
      
      if (!response?.success) {
        if (response?.message?.includes('already registered')) {
          // Registration already happened - this is fine, proceed with success flow
          console.log("User already registered, continuing with success flow");
        } else {
          throw new Error(response?.message || 'Registration failed');
        }
      }

      // Remove the in-progress flag to prevent duplicate submissions if user refreshes
      localStorage.removeItem('registration_in_progress');

      // Trigger success effects
      triggerConfetti();
      displayMessage("Congratulations! Your account has been created and verified successfully.");
      speak("Congratulations! Your account has been created and verified successfully.");

      // Animate elements
      gsap.fromTo('.check-circle', 
        { scale: 0, rotation: -30 },
        { scale: 1, rotation: 0, duration: 0.8, ease: "elastic.out(1, 0.5)" }
      );
      
      gsap.fromTo('.line', 
        { width: 0 },
        { width: '100%', duration: 0.6, stagger: 0.2, delay: 0.5 }
      );

      // Auto-redirect after delay
      const redirectTimer = setTimeout(() => {
        navigate('/dashboard');
      }, 6000);

      return () => clearTimeout(redirectTimer);

    } catch (error) {
      console.error('Verification error:', error);
      
      // Check if the error indicates user already exists
      if (error.message?.includes('already registered')) {
        toast.info('This account may already be registered. Redirecting to login...');
        setTimeout(() => navigate('/login'), 3000);
        return;
      }
      
      toast.error(error.response?.data?.detail || 'Verification failed. Please try again.');
      
      // Remove the processing flag so they can try again
      localStorage.removeItem('verification_processed');
      
      // Redirect back to registration after a delay
      setTimeout(() => navigate('/register'), 3000);
    }
  };

  processVerification();
  
  // Clean up function
  return () => {
    // Clean up any ongoing tasks if component unmounts during processing
  };
}, [userData, navigate, register, displayMessage, speak]);

const goToDashboard = () => {
  navigate('/dashboard');
};
  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-blue-50 to-indigo-50"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden text-center p-8"
        variants={itemVariants}
      >
        <div className="flex justify-center mb-6">
          <div className="check-circle text-green-500">
            <CheckCircle size={80} strokeWidth={1.5} />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-800 mb-4">
          Registration Complete!
        </h1>
        
        <p className="text-gray-600 mb-6">
          Your account has been created and verified successfully. You can now access all HealthAI features and services.
        </p>
        
        <div className="space-y-4 mb-8">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
            <div className="text-left flex-1">
              <p className="text-gray-700 font-medium">Face Recognition</p>
            </div>
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <div className="line border-b border-gray-200"></div>
          
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
            <div className="text-left flex-1">
              <p className="text-gray-700 font-medium">User Information</p>
            </div>
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <div className="line border-b border-gray-200"></div>
          
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
            <div className="text-left flex-1">
              <p className="text-gray-700 font-medium">Aadhaar Verification</p>
            </div>
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <div className="line border-b border-gray-200"></div>
        </div>
        
        <Button
          onClick={goToDashboard}
          className="w-full"
          icon={<Home className="w-4 h-4 mr-2" />}
        >
          Go to Dashboard
        </Button>
      </motion.div>
      
      <motion.p
        className="mt-6 text-sm text-gray-600 text-center max-w-md"
        variants={itemVariants}
      >
        You will be automatically redirected to your dashboard in a few seconds.
      </motion.p>
    </motion.div>
  );
};

export default VerificationComplete;
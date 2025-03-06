// src/pages/Registration.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { User, Mail, Calendar, Users, ChevronRight, ChevronLeft } from 'lucide-react';

import { useAssistant } from '../context/AssistantContext';
import Button from '../components/Button';
import Input from '../components/Input';
import { useAuth } from '../context/AuthContext';

const Registration = () => {
  const navigate = useNavigate();
  const location = useLocation(); // Use useLocation to access state
  const [faceBlob, setFaceBlob] = useState(null); // New state for face blob
  const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  useEffect(() => {
    // Check if there's a face blob passed via navigation state
    const state = location.state;
    console.log('State:', state);
    
    if (state && state.blob) {
      setFaceBlob(state.blob);
    }
  }, [location.state]);
  
  const { speak, displayMessage } = useAssistant();
  const { setUserData } = useAuth();
  
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    user: {
      name: '',
      email: '',
      dob: '',
      gender: '',
      password: '',
      confirmPassword: ''
    },
    face_image: faceBlob
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Page animations
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
  
  const formVariants = {
    hidden: { x: 20, opacity: 0 },
    visible: { 
      x: 0, 
      opacity: 1,
      transition: { duration: 0.4 }
    },
    exit: {
      x: -20,
      opacity: 0,
      transition: { duration: 0.3 }
    }
  };
  
  useEffect(() => {
    // Greeting on page load
    displayMessage("Let's get you registered with HealthAI. Please fill in your details.");
    speak("Let's get you registered with Health AI. Please fill in your personal details.");
  }, []);
  
  // Update assistant messages based on current step
  useEffect(() => {
    switch(step) {
      case 1:
        displayMessage("Please enter your full name and email address.");
        speak("Please enter your full name and email address.");
        break;
      case 2:
        displayMessage("Now, let's add your date of birth and gender.");
        speak("Great. Now, please enter your date of birth and select your gender.");
        break;
      case 3:
        displayMessage("Create a secure password for your account.");
        speak("Finally, create a secure password for your HealthAI account.");
        break;
      default:
        break;
    }
  }, [step]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, user: { ...prev.user, [name]: value } }));
    
    // Clear error when field is updated
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };
  
  const validateStep = () => {
    const newErrors = { user: {} };
    
    switch(step) {
      case 1:
        if (!formData.user.name.trim()) {
          newErrors.user.name = 'Name is required';
        }
        
        if (!formData.user.email.trim()) {
          newErrors.user.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.user.email)) {
          newErrors.user.email = 'Email is invalid';
        }
        break;
        
      case 2:
        if (!formData.user.dob) {
          newErrors.user.dob = 'Date of birth is required';
        } else {
          // Check if date is valid and not in the future
          const dobDate = new Date(formData.user.dob);
          const today = new Date();
          if (isNaN(dobDate.getTime())) {
            newErrors.user.dob = 'Invalid date';
          } else if (dobDate > today) {
            newErrors.user.dob = 'Date cannot be in the future';
          }
        }
        
        if (!formData.user.gender) {
          newErrors.user.gender = 'Gender is required';
        }
        break;
        
      case 3:
        if (!formData.user.password) {
          newErrors.user.password = 'Password is required';
        } else if (formData.user.password.length < 8) {
          newErrors.user.password = 'Password must be at least 8 characters';
        }
        
        if (!formData.user.confirmPassword) {
          newErrors.user.confirmPassword = 'Please confirm your password';
        } else if (formData.user.password !== formData.user.confirmPassword) {
          newErrors.user.confirmPassword = 'Passwords do not match';
        }
        break;
        
      default:
        break;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors.user).length === 0;
  };
  
  const handleNext = () => {
    if (validateStep()) {
      setStep(prev => prev + 1);
    } else {
      // Voice feedback for errors
      const errorKeys = Object.keys(errors);
      if (errorKeys.length > 0) {
        const firstError = errors[errorKeys[0]];
        speak(firstError);
      }
    }
  };
  
  const handleBack = () => {
    setStep(prev => prev - 1);
  };
// Fix for Registration.jsx handleSubmit
const handleSubmit = async (e) => {
  e.preventDefault();

  if (!validateStep()) return;

  // Prevent double submission
  if (isSubmitting) return;
  
  setIsSubmitting(true);
  
  try {
    // Generate unique ID if not already present
    const uniqueUserId = userId || `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Prepare user data as a plain object
    const userData = {
      user: {
        id: uniqueUserId,
        email: formData.user.email.toLowerCase().trim(), // Normalize email
        password: formData.user.password,
        name: formData.user.name,
        gender: formData.user.gender || 'other',
        dob: formData.user.dob || null,
        role: 'patient',
        // Add a request ID to help with debugging
        requestId: `req_${Date.now()}`
      },
      face_image: faceBlob // Keep the Blob/File reference
    };

    // Debugging log
    console.log('Registration form data ready:', uniqueUserId);
    
    // Store in context for verification step
    setUserData(userData);
    
    // Set a flag in localStorage to prevent duplicate submissions
    localStorage.setItem('registration_in_progress', uniqueUserId);
    
    toast.success('Registration details saved successfully');
    displayMessage("Great! Now we need to verify your Aadhaar card.");
    speak("Your details have been saved successfully. Now we need to verify your Aadhaar card.");
    
    // Add a small delay to prevent navigation issues
    setTimeout(() => {
      // Use replace instead of push to prevent back navigation
      navigate('/verification-complete', { replace: true });
    }, 100);
    
  } catch (error) {
    console.error('Registration error:', error);
    toast.error('Registration failed. Please try again.');
    
    // Clean up storage on error
    localStorage.removeItem('registration_in_progress');
  } finally {
    setIsSubmitting(false);
  }
};
  
  const renderFormStep = () => {
    switch(step) {
      case 1:
        return (
          <motion.div
            key="step1"
            variants={formVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <h2 className="text-xl font-semibold mb-4">Personal Information</h2>
            <div className="space-y-4">
              <Input
                label="Full Name"
                type="text"
                name="name"
                value={formData.user.name}
                onChange={handleChange}
                placeholder="Enter your full name"
                error={errors.user?.name}
                icon={<User className="w-5 h-5 text-gray-400" />}
                required
              />
              
              <Input
                label="Email Address"
                type="email"
                name="email"
                value={formData.user.email}
                onChange={handleChange}
                placeholder="Enter your email address"
                error={errors.user?.email}
                icon={<Mail className="w-5 h-5 text-gray-400" />}
                required
              />
            </div>
          </motion.div>
        );
        
      case 2:
        return (
          <motion.div
            key="step2"
            variants={formVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <h2 className="text-xl font-semibold mb-4">Demographics</h2>
            <div className="space-y-4">
              <Input
                label="Date of Birth"
                type="date"
                name="dob"
                value={formData.user.dob}
                onChange={handleChange}
                error={errors.user?.dob}
                icon={<Calendar className="w-5 h-5 text-gray-400" />}
                required
              />
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Gender <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                    <Users className="w-5 h-5" />
                  </div>
                  
                  <select
                    name="gender"
                    value={formData.user.gender}
                    onChange={handleChange}
                    className={`block w-full pl-10 pr-4 py-2 border ${errors.user?.gender ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-blue-500 focus:border-blue-500`}
                    required
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                </div>
                {errors.user?.gender && (
                  <p className="text-red-500 text-xs mt-1">{errors.user.gender}</p>
                )}
              </div>
            </div>
          </motion.div>
        );
        
      case 3:
        return (
          <motion.div
            key="step3"
            variants={formVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <h2 className="text-xl font-semibold mb-4">Security</h2>
            <div className="space-y-4">
              <Input
                label="Password"
                type="password"
                name="password"
                value={formData.user.password}
                onChange={handleChange}
                placeholder="Create a password"
                error={errors.user?.password}
                required
              />
              
              <Input
                label="Confirm Password"
                type="password"
                name="confirmPassword"
                value={formData.user.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
                error={errors.user?.confirmPassword}
                required
              />
              
              {faceBlob && (
                <div className="mt-4">
                  <h3 className="text-lg font-medium">Face Image</h3>
                  <img
                    src={URL.createObjectURL(faceBlob)}
                    alt="Face"
                    className="w-32 h-32 rounded-full mt-2"
                  />
                </div>
              )}
              
              <div className="mt-2">
                <ul className="text-xs text-gray-500 space-y-1">
                  <li>Password must be at least 8 characters long</li>
                  <li>Include at least one uppercase letter</li>
                  <li>Include at least one number or special character</li>
                </ul>
              </div>
            </div>
          </motion.div>
        );
        
      default:
        return null;
    }
  };

  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-screen p-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden"
        variants={formVariants}
      >
        <div className="p-5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <h1 className="text-2xl font-bold text-center">Create Your Account</h1>
          <div className="flex justify-center mt-4">
            <div className="flex items-center">
              {[1, 2, 3].map(i => (
                <React.Fragment key={i}>
                  <div 
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm ${
                      i === step 
                        ? 'bg-white text-blue-600' 
                        : i < step 
                          ? 'bg-blue-400 text-white' 
                          : 'bg-blue-800 bg-opacity-40 text-white'
                    }`}
                  >
                    {i}
                  </div>
                  {i < 3 && (
                    <div 
                      className={`w-10 h-1 ${
                        i < step ? 'bg-blue-400' : 'bg-blue-800 bg-opacity-40'
                      }`}
                    ></div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <form onSubmit={handleSubmit}>
            {renderFormStep()}
            
            <div className="flex justify-between mt-6">
              {step > 1 && (
                <Button
                  type="button"
                  onClick={handleBack}
                  variant="outline"
                  icon={<ChevronLeft className="w-4 h-4 mr-2" />}
                >
                  Back
                </Button>
              )}
              
              {step < 3 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  className="ml-auto"
                  icon={<ChevronRight className="w-4 h-4 ml-2" />}
                  iconPosition="right"
                >
                  Next
                </Button>
              ) : (
                <Button
                  type="submit"
                  className="ml-auto"
                  loading={isSubmitting}
                >
                  Complete Registration
                </Button>
              )}
            </div>
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Registration;

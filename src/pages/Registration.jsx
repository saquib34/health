import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { User, Mail, Calendar, Users, ChevronRight, ChevronLeft } from 'lucide-react';

import { authAPI } from '../services/api'; // Import updated authAPI
import { useAssistant } from '../context/AssistantContext';
import Button from '../components/Button';
import Input from '../components/Input';
import { useAuth } from '../context/AuthContext';

const Registration = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [faceBlob, setFaceBlob] = useState(null);
  const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const { speak, displayMessage } = useAssistant();
  const { setUserData } = useAuth();

  useEffect(() => {
    const state = location.state;
    if (state && state.blob) {
      setFaceBlob(state.blob);
    }
  }, [location.state]);

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
    face_image: null
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Real-time password strength indicators
  const [passwordStrength, setPasswordStrength] = useState({
    length: false,
    uppercase: false,
    number: false
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.5, when: "beforeChildren", staggerChildren: 0.2 } },
    exit: { opacity: 0, transition: { duration: 0.3 } }
  };

  const formVariants = {
    hidden: { x: 20, opacity: 0 },
    visible: { x: 0, opacity: 1, transition: { duration: 0.4 } },
    exit: { x: -20, opacity: 0, transition: { duration: 0.3 } }
  };

  useEffect(() => {
    displayMessage("Let's get you registered with HealthAI. Please fill in your details.");
    speak("Let's get you registered with Health AI. Please fill in your personal details.");
  }, []);

  useEffect(() => {
    switch (step) {
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

    // Real-time password validation
    if (name === 'password') {
      setPasswordStrength({
        length: value.length >= 8,
        uppercase: /[A-Z]/.test(value),
        number: /[0-9]/.test(value)
      });
    }
  };

  const validateStep = () => {
    const newErrors = {};

    switch (step) {
      case 1:
        if (!formData.user.name.trim()) newErrors.name = 'Name is required';
        if (!formData.user.email.trim()) {
          newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.user.email)) {
          newErrors.email = 'Email is invalid';
        }
        break;
      case 2:
        if (!formData.user.dob) {
          newErrors.dob = 'Date of birth is required';
        } else {
          const dobDate = new Date(formData.user.dob);
          const today = new Date();
          if (isNaN(dobDate.getTime())) {
            newErrors.dob = 'Invalid date';
          } else if (dobDate > today) {
            newErrors.dob = 'Date cannot be in the future';
          }
        }
        if (!formData.user.gender) newErrors.gender = 'Gender is required';
        break;
      case 3:
        if (!formData.user.password) {
          newErrors.password = 'Password is required';
        } else {
          if (formData.user.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
          if (!/[A-Z]/.test(formData.user.password)) newErrors.password = newErrors.password ? `${newErrors.password}. Must contain an uppercase letter` : 'Must contain an uppercase letter';
          if (!/[0-9]/.test(formData.user.password)) newErrors.password = newErrors.password ? `${newErrors.password}. Must contain a number` : 'Must contain a number';
        }
        if (!formData.user.confirmPassword) {
          newErrors.confirmPassword = 'Please confirm your password';
        } else if (formData.user.password !== formData.user.confirmPassword) {
          newErrors.confirmPassword = 'Passwords do not match';
        }
        break;
      default:
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep(prev => prev + 1);
    } else {
      const errorKeys = Object.keys(errors);
      if (errorKeys.length > 0) speak(errors[errorKeys[0]]);
    }
  };

  const handleBack = () => {
    setStep(prev => prev - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep()) return;
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const response = await authAPI.register(formData, faceBlob);

      toast.success('Registration successful! Logging you in...');
      displayMessage("Registration completed successfully!");
      speak("Registration completed successfully! Welcome to HealthAI.");

      setUserData({
        user: response.user,
        token: response.access_token
      });

      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1000);
    } catch (error) {
      console.error('Registration error:', error);
      const errorMessage = error.errors
        ? Object.values(error.errors).join(' ')
        : error.detail || 'Registration failed. Please try again.';
      toast.error(errorMessage);
      speak(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return formData.user.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.user.email);
      case 2:
        return formData.user.dob && formData.user.gender && new Date(formData.user.dob) <= new Date();
      case 3:
        return (
          formData.user.password &&
          formData.user.password.length >= 8 &&
          /[A-Z]/.test(formData.user.password) &&
          /[0-9]/.test(formData.user.password) &&
          formData.user.password === formData.user.confirmPassword
        );
      default:
        return false;
    }
  };

  const renderFormStep = () => {
    switch (step) {
      case 1:
        return (
          <motion.div key="step1" variants={formVariants} initial="hidden" animate="visible" exit="exit">
            <h2 className="text-xl font-semibold mb-4">Personal Information</h2>
            <div className="space-y-4">
              <Input
                label="Full Name"
                type="text"
                name="name"
                value={formData.user.name}
                onChange={handleChange}
                placeholder="Enter your full name"
                error={errors.name}
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
                error={errors.email}
                icon={<Mail className="w-5 h-5 text-gray-400" />}
                required
              />
            </div>
          </motion.div>
        );
      case 2:
        return (
          <motion.div key="step2" variants={formVariants} initial="hidden" animate="visible" exit="exit">
            <h2 className="text-xl font-semibold mb-4">Demographics</h2>
            <div className="space-y-4">
              <Input
                label="Date of Birth"
                type="date"
                name="dob"
                value={formData.user.dob}
                onChange={handleChange}
                error={errors.dob}
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
                    className={`block w-full pl-10 pr-4 py-2 border ${errors.gender ? 'border-red-500' : 'border-gray-300'} rounded-lg focus:ring-blue-500 focus:border-blue-500`}
                    required
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                </div>
                {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender}</p>}
              </div>
            </div>
          </motion.div>
        );
      case 3:
        return (
          <motion.div key="step3" variants={formVariants} initial="hidden" animate="visible" exit="exit">
            <h2 className="text-xl font-semibold mb-4">Security</h2>
            <div className="space-y-4">
              <Input
                label="Password"
                type="password"
                name="password"
                value={formData.user.password}
                onChange={handleChange}
                placeholder="Create a password"
                error={errors.password}
                required
              />
              <Input
                label="Confirm Password"
                type="password"
                name="confirmPassword"
                value={formData.user.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
                error={errors.confirmPassword}
                required
              />
              <div className="mt-2 text-xs text-gray-500">
                <p className={passwordStrength.length ? 'text-green-500' : 'text-red-500'}>
                  {passwordStrength.length ? '✓' : '✗'} At least 8 characters
                </p>
                <p className={passwordStrength.uppercase ? 'text-green-500' : 'text-red-500'}>
                  {passwordStrength.uppercase ? '✓' : '✗'} One uppercase letter
                </p>
                <p className={passwordStrength.number ? 'text-green-500' : 'text-red-500'}>
                  {passwordStrength.number ? '✓' : '✗'} One number
                </p>
              </div>
              {faceBlob && (
                <div className="mt-4">
                  <h3 className="text-lg font-medium">Face Image</h3>
                  <img src={URL.createObjectURL(faceBlob)} alt="Face" className="w-32 h-32 rounded-full mt-2" />
                </div>
              )}
            </div>
          </motion.div>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div className="flex flex-col items-center justify-center min-h-screen p-4" variants={containerVariants} initial="hidden" animate="visible" exit="exit">
      <motion.div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden" variants={formVariants}>
        <div className="p-5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <h1 className="text-2xl font-bold text-center">Create Your Account</h1>
          <div className="flex justify-center mt-4">
            <div className="flex items-center">
              {[1, 2, 3].map(i => (
                <React.Fragment key={i}>
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm ${i === step ? 'bg-white text-blue-600' : i < step ? 'bg-blue-400 text-white' : 'bg-blue-800 bg-opacity-40 text-white'}`}>
                    {i}
                  </div>
                  {i < 3 && <div className={`w-10 h-1 ${i < step ? 'bg-blue-400' : 'bg-blue-800 bg-opacity-40'}`}></div>}
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
                <Button type="button" onClick={handleBack} variant="outline" icon={<ChevronLeft className="w-4 h-4 mr-2" />}>
                  Back
                </Button>
              )}
              {step < 3 ? (
                <Button type="button" onClick={handleNext} className="ml-auto" icon={<ChevronRight className="w-4 h-4 ml-2" />} iconPosition="right" disabled={!isStepValid()}>
                  Next
                </Button>
              ) : (
                <Button type="submit" className="ml-auto" loading={isSubmitting} disabled={!isStepValid() || isSubmitting}>
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
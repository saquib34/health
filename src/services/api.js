// src/services/api.js - Updated with support for dynamic medical chat
import axios from 'axios';

// API base URL - configured in .env file
const API_URL = 'https://1074-34-55-58-6.ngrok-free.app/api/';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000 // 30 second timeout for all requests
});

// Add a request interceptor to add authorization token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle common errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Network errors
    if (!error.response) {
      console.error('Network error:', error);
      return Promise.reject({
        message: 'Network error. Please check your connection.',
        isNetworkError: true
      });
    }
    
    // Handle unauthorized errors (redirect to login)
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    
    // Handle server errors with retry logic for critical endpoints
    if (error.response && error.response.status >= 500) {
      const config = error.config;
      
      // Only retry GET and critical POST requests (like medical chat)
      const isCriticalEndpoint = 
        config.url.includes('/medical-chat') || 
        config.url.includes('/predict-disease') ||
        config.url.includes('/dynamic-medical-chat') ||
        config.method === 'get';
        
      // Add or increment retry count
      config.__retryCount = config.__retryCount || 0;
      
      // If it's a critical endpoint and we haven't retried too many times
      if (isCriticalEndpoint && config.__retryCount < 2) {
        config.__retryCount += 1;
        
        // Create a new promise to handle the retry
        return new Promise(resolve => {
          // Delay retry by 1 second * retry count
          setTimeout(() => {
            console.log(`Retrying request (${config.__retryCount})...`);
            resolve(api(config));
          }, 1000 * config.__retryCount);
        });
      }
    }
    
    return Promise.reject(error);
  }
);

// Create conversation caches as standalone variables outside the API object
// to avoid 'this' context issues
const conversationCache = [];

// Auth API
export const authAPI = {
  login: async (email, password) => {
    try {
      const response = await api.post('/login', { email, password });
      const { access_token, user } = response.data;
      localStorage.setItem('token', access_token);
      return { token: access_token, user };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },

  register: async (userData) => {
    try {
      const response = await api.post('/register', userData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  },

  verifyFace: async (imageBlob) => {
    try {
      const formData = new FormData();
      formData.append('face_image', imageBlob);
      
      const response = await api.post('/verify-face', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.verified && response.data.token) {
        localStorage.setItem('token', response.data.token);
      }
      
      return response.data;
    } catch (error) {
      console.error('Face verification error:', error);
      throw error;
    }
  },
  
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return true;
  }
};

// User API
export const userAPI = {
  getProfile: async () => {
    try {
      const response = await api.get('/user/profile');
      return response.data;
    } catch (error) {
      console.error('Get profile error:', error);
      throw error;
    }
  },

  updateProfile: async (profileData) => {
    try {
      const response = await api.put('/user/profile', profileData);
      return response.data;
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  }
};

// Medical History API
export const medicalHistoryAPI = {
  saveMedicalHistory: async (historyData) => {
    try {
      const response = await api.post('/medical-history', historyData);
      return response.data;
    } catch (error) {
      console.error('Save medical history error:', error);
      throw error;
    }
  },

  getMedicalHistory: async () => {
    try {
      const response = await api.get('/medical-history');
      return response.data;
    } catch (error) {
      console.error('Get medical history error:', error);
      throw error;
    }
  }
};

// Vital Signs API
export const vitalSignsAPI = {
  saveVitalSigns: async (vitalsData) => {
    try {
      const response = await api.post('/vital-signs', vitalsData);
      return response.data;
    } catch (error) {
      console.error('Save vital signs error:', error);
      throw error;
    }
  },

  getVitalSigns: async () => {
    try {
      const response = await api.get('/vital-signs');
      return response.data;
    } catch (error) {
      console.error('Get vital signs error:', error);
      throw error;
    }
  }
};

// Document Analysis API
export const documentAnalysisAPI = {
  analyzeBloodReport: async (fileBlob) => {
    try {
      const formData = new FormData();
      formData.append('blood_report', fileBlob);
      
      const response = await api.post('/analyze-blood-report', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 60000 // 60 second timeout for document analysis
      });
      return response.data;
    } catch (error) {
      console.error('Blood report analysis error:', error);
      throw error;
    }
  },

  analyzeXray: async (fileBlob) => {
    try {
      const formData = new FormData();
      formData.append('xray_image', fileBlob);
      
      const response = await api.post('/analyze-xray', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 60000 // 60 second timeout for image analysis
      });
      return response.data;
    } catch (error) {
      console.error('X-ray analysis error:', error);
      throw error;
    }
  }
};

// AI Medical Chat API with support for the dynamic chat endpoint
// Add this improved error handling in your medicalChatAPI.sendMessage function

const sendMedicalChatMessage = async (message, context = '') => {
  try {
    // Enhanced context with session history for continuity
    let enhancedContext = context;
    
    // Add cached session messages to context if available
    if (conversationCache && conversationCache.length > 0) {
      const sessionContext = conversationCache
        .map(item => `${item.role}: ${item.content}`)
        .join('\n');
      
      enhancedContext = `Previous conversation:\n${sessionContext}\n\n${context}`;
    }
    
    // Make API call to dynamic-medical-chat endpoint with timeout and retry logic
    const response = await api.post('/dynamic-medical-chat', {
      message,
      context: enhancedContext
    }, {
      timeout: 45000 // 45 second timeout for medical chat
    });
    
    // Update session cache with sent message and response
    if (response.data && response.data.response) {
      // Keep last 10 messages and add new ones
      while (conversationCache.length > 8) {
        conversationCache.shift(); // Remove oldest message if we have more than 8
      }
      
      // Add the new messages
      conversationCache.push({ role: 'user', content: message });
      conversationCache.push({ role: 'assistant', content: response.data.response });
    }
    
    return response.data;
  } catch (error) {
    console.error(`Medical chat error:`, error);
    
    // Specific error handling
    if (error.response) {
      // Server returned an error with response
      const errorData = error.response.data || {};
      const errorMsg = errorData.detail || 'Unknown server error';
      
      if (error.response.status === 503) {
        // Service unavailable (model still loading)
        return {
          response: `I'm still initializing my medical knowledge base. Please try again in a moment.`,
          error: 'model_loading'
        };
      }
      
      if (error.response.status === 429) {
        // Rate limiting
        return {
          response: `I've been receiving many requests. Please wait a moment before sending another message.`,
          error: 'rate_limited'
        };
      }
      
      if (error.response.status === 500) {
        // Internal server error
        return {
          response: `I'm experiencing technical difficulties. Our team has been notified. Please try again in a moment.`,
          error: 'server_error'
        };
      }
      
      // Generic error with server response
      return {
        response: `I encountered an issue: ${errorMsg}. Please try again.`,
        error: 'api_error'
      };
    } else if (error.isNetworkError) {
      // Network error - offer offline mode suggestion
      return {
        response: `I'm having trouble connecting to my knowledge base. Please check your network connection.`,
        error: 'network'
      };
    } else if (error.code === 'ECONNABORTED') {
      // Timeout error
      return {
        response: `I'm taking longer than expected to process your query. Please try a simpler question or try again later.`,
        error: 'timeout'
      };
    }
    
    // Generic error fallback
    return {
      response: `I encountered an issue while processing your request. Please try again with a different question.`,
      error: 'unknown'
    };
  }
};

// Use the unified health chat endpoint
const sendUnifiedHealthChatMessage = async (message, fileBlob = null, context = '') => {
  try {
    const formData = new FormData();
    formData.append('message', message);
    formData.append('context', context);
    
    if (fileBlob) {
      formData.append('file', fileBlob);
    }
    
    // Add token to form data for guests
    const token = localStorage.getItem('token');
    if (token) {
      formData.append('token', token);
    }
    
    // Make API call with timeout and retry logic
    const response = await api.post('/unified-health-chat', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      timeout: 60000 // 60 second timeout for unified health chat
    });
    
    // Update session cache with sent message and response
    if (response.data && response.data.response) {
      // Keep last 10 messages
      while (conversationCache.length > 8) {
        conversationCache.shift();
      }
      
      // Add the new messages
      conversationCache.push({ role: 'user', content: message });
      conversationCache.push({ role: 'assistant', content: response.data.response });
    }
    
    return response.data;
  } catch (error) {
    console.error('Unified health chat error:', error);
    
    // Provide friendly error message
    if (error.response && error.response.status === 503) {
      return {
        response: `The medical AI system is currently initializing. Please try again in a moment.`,
        error: 'model_loading'
      };
    } else if (error.isNetworkError) {
      return {
        response: `I'm having trouble connecting. Please check your network connection.`,
        error: 'network'
      };
    }
    
    return {
      response: `I encountered an issue while processing your request. Please try again with a different question.`,
      error: 'unknown'
    };
  }
};

// Reset session cache (e.g., for a new conversation)
const resetChatSession = () => {
  // Clear the cache
  conversationCache.length = 0;
};

// Disease prediction as a standalone function
const predictDisease = async (symptoms, medicalHistory = null) => {
  try {
    // Check for valid input
    if (!symptoms || symptoms.length < 10) {
      return {
        response: "Please provide a more detailed description of your symptoms (at least 10 characters).",
        error: 'invalid_input'
      };
    }

    // Make API call with proper payload structure
    const response = await api.post('/smart-disease-prediction', {
      symptoms: symptoms,
      medicalHistory: medicalHistory || ""
    }, {
      timeout: 60000 // 60 second timeout for disease prediction
    });
    
    return response.data.prediction || response.data;
  } catch (error) {
    console.error('Disease prediction error:', error);
    
    // Handle specific error codes
    if (error.response) {
      const status = error.response.status;
      const errorDetail = error.response.data?.detail || '';
      
      // Handle validation errors
      if (status === 422) {
        if (errorDetail.includes("Symptoms description must be at least 10 characters")) {
          return {
            prediction: "Unknown",
            confidence: 0,
            explanation: "I need more details about your symptoms. Please provide a more comprehensive description.",
            preventionMeasures: ["Consult with a healthcare professional for a proper diagnosis"]
          };
        }
        
        return {
          prediction: "Analysis Error",
          confidence: 0,
          explanation: "There was an issue with your symptom description. " + errorDetail,
          preventionMeasures: ["Provide more detailed symptom information", "Consult with a healthcare professional"]
        };
      }
      
      // Handle service unavailable
      if (status === 503) {
        return {
          prediction: "Service Unavailable",
          confidence: 0,
          explanation: "The diagnosis system is currently initializing. Please try again in a moment.",
          preventionMeasures: ["Try again in a few minutes", "Consult with a healthcare professional if urgent"]
        };
      }
    }
    
    // Handle timeouts gracefully
    if (error.code === 'ECONNABORTED') {
      return {
        prediction: "Analysis Timeout",
        confidence: 0,
        explanation: "The diagnosis is taking longer than expected. Please try again with more specific symptoms.",
        preventionMeasures: ["Try again with more specific symptoms", "Consult with a healthcare professional"]
      };
    }
    
    // Generic error fallback
    return {
      prediction: "Analysis Error",
      confidence: 0,
      explanation: "Unable to analyze your symptoms at this time. Please try again later.",
      preventionMeasures: ["Consult with a healthcare professional"]
    };
  }
};

// Export the medical chat functions for application use
// const conversationCache = [];

export const medicalChatService = {
  sendMessage: async (message, context = '') => {
    try {
      // Fetch session token from localStorage
      let sessionToken = localStorage.getItem('medical_chat_session_token');

      // Enhance context with previous conversation if needed
      let enhancedContext = context;
      if (conversationCache.length > 0) {
        const sessionContext = conversationCache
          .map(item => `${item.role}: ${item.content}`)
          .join('\n');
        enhancedContext = `Previous conversation:\n${sessionContext}\n\n${context}`;
      }
      if (sessionToken === null || sessionToken === 'null' || sessionToken === '' || sessionToken === 'undefined') {
        sessionToken='';
      }

      // Prepare payload
      const payload = {
        message: `${enhancedContext}\nUser: ${message}`,
        session_token: sessionToken // Include session token, even if null
      };

      // Make API call to /analyze-intent
      const response = await api.post('/analyze-intent', payload, {
        timeout: 45000
      });

      // Update session token in localStorage if provided by backend
      if (response.data.session_token) {
        localStorage.setItem('medical_chat_session_token', response.data.session_token);
      }

      // Update conversation cache
      if (response.data.response) {
        while (conversationCache.length > 8) {
          conversationCache.shift();
        }
        conversationCache.push({ role: 'user', content: message });
        conversationCache.push({ role: 'assistant', content: response.data.response });
      }

      return response.data;
    } catch (error) {
      console.error('Medical chat error (/analyze-intent):', error);

      if (error.response) {
        const errorData = error.response.data || {};
        const errorMsg = errorData.detail || 'Unknown server error';

        if (error.response.status === 503) {
          return { response: "I'm still initializing my medical knowledge base. Please try again in a moment.", error: 'model_loading' };
        }
        if (error.response.status === 429) {
          return { response: "I've been receiving many requests. Please wait a moment before sending another message.", error: 'rate_limited' };
        }
        if (error.response.status === 500) {
          return { response: "I'm experiencing technical difficulties. Please try again in a moment.", error: 'server_error' };
        }
        return { response: `I encountered an issue: ${errorMsg}. Please try again.`, error: 'api_error' };
      } else if (error.isNetworkError) {
        return { response: "I'm having trouble connecting to my knowledge base. Please check your network connection.", error: 'network' };
      } else if (error.code === 'ECONNABORTED') {
        return { response: "I'm taking longer than expected to process your query. Please try a simpler question or try again later.", error: 'timeout' };
      }

      return { response: "I encountered an issue while processing your request. Please try again with a different question.", error: 'unknown' };
    }
  },
  resetSession: () => {
    localStorage.removeItem('medical_chat_session_token'); // Clear session token
    conversationCache.length = 0; // Clear conversation cache
  }
};

export const medicalChatAPI = medicalChatService;

// Health Assessment API
export const healthAssessmentAPI = {
  completeAssessment: async (assessmentData) => {
    try {
      // Validate the assessment data before sending
      const validatedData = validateAssessmentData(assessmentData);
      
      const response = await api.post('/health-assessment', validatedData, {
        timeout: 60000 // 60 second timeout for health assessment
      });
      return response.data;
    } catch (error) {
      console.error('Health assessment error:', error);
      
      // Provide a fallback response if the server fails
      if (error.response && error.response.status === 500) {
        return {
          message: "Health assessment partially completed",
          health_score: calculateFallbackHealthScore(assessmentData),
          risk_factors: extractRiskFactors(assessmentData),
          recommendations: getBasicRecommendations(),
          error: "Server processing error, showing estimated results"
        };
      }
      
      // Rethrow for other errors
      throw error;
    }
  }
};
function calculateFallbackHealthScore(data) {
  // Simple fallback logic for health score when server fails
  let score = 80; // Default base score
  
  // Reduce score based on vital signs if available
  const vitalSigns = data.vitalSigns || {};
  
  if (vitalSigns.heartRate > 100 || vitalSigns.heartRate < 60) {
    score -= 5;
  }
  
  if (vitalSigns.oxygenLevel && vitalSigns.oxygenLevel < 95) {
    score -= 5;
  }
  
  // Reduce score based on medical history conditions if available
  const medicalHistory = data.medicalHistory || {};
  if (Array.isArray(medicalHistory.conditions)) {
    score -= medicalHistory.conditions.length * 2;
  }
  
  // Ensure score is within valid range
  return Math.max(Math.min(score, 100), 0);
}

function extractRiskFactors(data) {
  const riskFactors = [];
  const vitalSigns = data.vitalSigns || {};
  const medicalHistory = data.medicalHistory || {};
  
  // Check vital signs
  if (vitalSigns.heartRate > 100) {
    riskFactors.push("Elevated heart rate");
  } else if (vitalSigns.heartRate < 60) {
    riskFactors.push("Low heart rate");
  }
  
  if (vitalSigns.oxygenLevel && vitalSigns.oxygenLevel < 95) {
    riskFactors.push("Low blood oxygen");
  }
  
  // Check medical history conditions
  if (Array.isArray(medicalHistory.conditions)) {
    for (const condition of medicalHistory.conditions) {
      const conditionLower = condition.toLowerCase();
      if (conditionLower.includes("diabetes")) {
        riskFactors.push("Diabetes");
      }
      if (conditionLower.includes("hypertension") || conditionLower.includes("high blood pressure")) {
        riskFactors.push("Hypertension");
      }
      if (conditionLower.includes("heart") && conditionLower.includes("disease")) {
        riskFactors.push("Heart disease");
      }
    }
  }
  
  // Calculate BMI if height and weight are available
  if (medicalHistory.height && medicalHistory.weight) {
    try {
      const heightM = Number(medicalHistory.height) / 100; // Convert cm to m
      const weightKg = Number(medicalHistory.weight);
      
      if (heightM > 0) {
        const bmi = weightKg / (heightM * heightM);
        
        if (bmi < 18.5) {
          riskFactors.push("Underweight");
        } else if (bmi >= 25 && bmi < 30) {
          riskFactors.push("Overweight");
        } else if (bmi >= 30) {
          riskFactors.push("Obesity");
        }
      }
    } catch (e) {
      console.warn("Error calculating BMI", e);
    }
  }
  
  return riskFactors;
}

function getBasicRecommendations() {
  return [
    "Schedule a follow-up with your primary care physician",
    "Maintain a balanced diet and stay hydrated",
    "Engage in regular moderate exercise (at least 150 minutes per week)",
    "Ensure you're getting adequate sleep (7-9 hours per night)",
    "Practice stress management techniques"
  ];
}
function validateAssessmentData(data) {
  // Create a clean copy of the data
  const validated = {
    medicalHistory: data.medicalHistory || {},
    vitalSigns: data.vitalSigns || {},
    documentAnalysis: data.documentAnalysis || {},
    aiConsultation: data.aiConsultation || {}
  };
  
  // Ensure vital signs are numeric where needed
  if (validated.vitalSigns) {
    // Convert string numbers to actual numbers
    if (validated.vitalSigns.heartRate && !isNaN(validated.vitalSigns.heartRate)) {
      validated.vitalSigns.heartRate = Number(validated.vitalSigns.heartRate);
    }
    
    if (validated.vitalSigns.oxygenLevel && !isNaN(validated.vitalSigns.oxygenLevel)) {
      validated.vitalSigns.oxygenLevel = Number(validated.vitalSigns.oxygenLevel);
    }
    
    if (validated.vitalSigns.temperature && !isNaN(validated.vitalSigns.temperature)) {
      validated.vitalSigns.temperature = Number(validated.vitalSigns.temperature);
    }
    
    if (validated.vitalSigns.respiratoryRate && !isNaN(validated.vitalSigns.respiratoryRate)) {
      validated.vitalSigns.respiratoryRate = Number(validated.vitalSigns.respiratoryRate);
    }
  }
  
  // Ensure medical history has proper numeric values
  if (validated.medicalHistory) {
    if (validated.medicalHistory.height && !isNaN(validated.medicalHistory.height)) {
      validated.medicalHistory.height = Number(validated.medicalHistory.height);
    }
    
    if (validated.medicalHistory.weight && !isNaN(validated.medicalHistory.weight)) {
      validated.medicalHistory.weight = Number(validated.medicalHistory.weight);
    }
    
    // Ensure conditions is an array
    if (!Array.isArray(validated.medicalHistory.conditions)) {
      validated.medicalHistory.conditions = validated.medicalHistory.conditions 
        ? [validated.medicalHistory.conditions] 
        : [];
    }
  }
  
  // Ensure document analysis has numeric severity
  if (validated.documentAnalysis && validated.documentAnalysis.overallSeverity !== undefined) {
    validated.documentAnalysis.overallSeverity = Number(validated.documentAnalysis.overallSeverity) || 0;
  }
  
  return validated;
}


// Appointment API
export const appointmentAPI = {
  bookAppointment: async (appointmentData) => {
    try {
      const response = await api.post('/book-appointment', appointmentData);
      return response.data;
    } catch (error) {
      console.error('Book appointment error:', error);
      throw error;
    }
  },

  getAppointments: async () => {
    try {
      const response = await api.get('/appointments');
      return response.data;
    } catch (error) {
      console.error('Get appointments error:', error);
      throw error;
    }
  },

  cancelAppointment: async (appointmentId) => {
    try {
      const response = await api.post(`/appointments/${appointmentId}/cancel`);
      return response.data;
    } catch (error) {
      console.error('Cancel appointment error:', error);
      throw error;
    }
  }
};

// Aadhaar Verification API
export const aadhaarAPI = {
  verifyAadhaar: async (fileBlob) => {
    try {
      const formData = new FormData();
      formData.append('aadhaar_image', fileBlob);
      
      const response = await api.post('/upload-aadhaar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Aadhaar verification error:', error);
      throw error;
    }
  }
};

// Health check API
export const healthAPI = {
  checkHealth: async () => {
    try {
      const response = await api.get('/health', { timeout: 5000 });
      return response.data;
    } catch (error) {
      console.error('Health check error:', error);
      return { status: 'unreachable' };
    }
  }
};

export {
  api
};

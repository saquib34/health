// src/context/ModelContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import { toast } from 'react-toastify';

const ModelContext = createContext();

export const useModel = () => useContext(ModelContext);

export const ModelProvider = ({ children, initialStatus }) => {
  const [status, setStatus] = useState({
    initializing: initialStatus?.initializing || true,
    error: initialStatus?.error || null,
    medicalLLM: {
      loaded: false,
      model: null, // 'medalpaca' or 'chatdoctor'
      status: 'loading' // 'loading', 'ready', 'error'
    },
    documentAnalysis: {
      loaded: false,
      biobert: false,
      chexnet: false,
      vuno: false,
      qureai: false,
      status: 'loading' // 'loading', 'ready', 'error'
    },
    heartRateMonitoring: {
      loaded: false,
      status: 'loading' // 'loading', 'ready', 'error'
    }
  });
  
  // Initialize the models
  useEffect(() => {
    if (!initialStatus?.initializing) {
      // If the models are already initialized, update the status
      setStatus(prev => ({
        ...prev,
        initializing: false,
        error: initialStatus?.error || null
      }));
      
      // Simulate loading individual models
      simulateModelLoading();
    }
  }, [initialStatus]);
  
  // Simulate loading the individual models
  const simulateModelLoading = async () => {
    try {
      // Simulate loading the medical LLM model
      setTimeout(() => {
        setStatus(prev => ({
          ...prev,
          medicalLLM: {
            ...prev.medicalLLM,
            loaded: true,
            model: 'medalpaca',
            status: 'ready'
          }
        }));
      }, 2000);
      
      // Simulate loading document analysis models
      setTimeout(() => {
        setStatus(prev => ({
          ...prev,
          documentAnalysis: {
            ...prev.documentAnalysis,
            loaded: true,
            biobert: true,
            chexnet: true,
            vuno: true,
            qureai: true,
            status: 'ready'
          }
        }));
      }, 3000);
      
      // Simulate loading heart rate monitoring model
      setTimeout(() => {
        setStatus(prev => ({
          ...prev,
          heartRateMonitoring: {
            ...prev.heartRateMonitoring,
            loaded: true,
            status: 'ready'
          }
        }));
      }, 2500);
    } catch (error) {
      console.error('Error loading models:', error);
      setStatus(prev => ({
        ...prev,
        error: 'Failed to load some AI models. Some features may be limited.'
      }));
      
      toast.error('Some AI models failed to load. Certain features may be limited.');
    }
  };
  
  // Switch between medical LLM models
  const switchMedicalLLM = (model) => {
    if (model !== 'medalpaca' && model !== 'chatdoctor') {
      console.error('Invalid model specified for medical LLM');
      return;
    }
    
    setStatus(prev => ({
      ...prev,
      medicalLLM: {
        ...prev.medicalLLM,
        model
      }
    }));
  };
  
  // Check if all models are loaded
  const areAllModelsLoaded = () => {
    return (
      status.medicalLLM.loaded &&
      status.documentAnalysis.loaded &&
      status.heartRateMonitoring.loaded
    );
  };
  
  // Check if specific model is loaded
  const isModelLoaded = (modelType) => {
    switch (modelType) {
      case 'medicalLLM':
        return status.medicalLLM.loaded;
      case 'documentAnalysis':
        return status.documentAnalysis.loaded;
      case 'heartRateMonitoring':
        return status.heartRateMonitoring.loaded;
      default:
        return false;
    }
  };
  
  return (
    <ModelContext.Provider value={{
      status,
      switchMedicalLLM,
      areAllModelsLoaded,
      isModelLoaded
    }}>
      {children}
    </ModelContext.Provider>
  );
};
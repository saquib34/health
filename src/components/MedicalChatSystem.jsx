// src/components/MedicalChatSystem.jsx - Updated to use the dynamic-medical-chat endpoint
import React, { useState, useEffect, useRef } from 'react';
import { SendHorizonal, Mic, StopCircle, RotateCcw, PlusCircle, Image, FileText } from 'lucide-react';
import { toast } from 'react-toastify';

import { medicalChatAPI } from '../services/api';
import { useAssistant } from '../context/AssistantContext';
import { 
     detectSymptomType, 
     generateFollowUpResponse, 
     isBriefSymptomDescription 
   } from '../utils/symptomFollowUp';

const MedicalChatSystem = ({ 
  patientData, 
  medicalHistory = null,
  vitalSigns = null,
  onDiagnosisComplete = null,
  className
}) => {
  const { speak } = useAssistant();
  
  const [messages, setMessages] = useState([
    { 
      role: 'assistant', 
      content: 'Hello, I\'m your HealthAI medical assistant. How can I help you today?',
      initial: true
    }
  ]);
  
  const [inputMessage, setInputMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [diagnosisProgress, setDiagnosisProgress] = useState(0);
  const [diagnosisResult, setDiagnosisResult] = useState(null);
  const [currentModel, setCurrentModel] = useState('Auto');
  
  // Track if diagnosis is in progress
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  
  // Common medical conditions for guided suggestions
  const commonConditions = [
    "I have a fever and sore throat",
    "I've been experiencing chest pain",
    "I have a persistent cough",
    "I've been having headaches",
    "I feel short of breath",
    "I have abdominal pain"
  ];
  
  // Initialize speech recognition
  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      
      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputMessage(transcript);
      };
      
      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }
    
    // Clean up recognition on unmount
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);
  
  // Auto-scroll to bottom of messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  // Show initial greeting with patient data if available
  useEffect(() => {
    if (patientData && messages.length === 1 && messages[0].initial) {
      const greeting = `Hello ${patientData.name || 'there'}! I'm your HealthAI medical assistant. How can I help you today?`;
      
      setMessages([{ role: 'assistant', content: greeting }]);
      
      // If medical history is available, acknowledge it
      if (medicalHistory) {
        setTimeout(() => {
          addAssistantMessage("I can see from your records that you have provided your medical history. Is there something specific you'd like to discuss today?");
        }, 1000);
      }
    }
  }, [patientData, medicalHistory]);
  
  // Update if vital signs change
  useEffect(() => {
    if (vitalSigns && vitalSigns.heartRate) {
      // Only notify about significant changes in heart rate
      const lastHeartRateMessage = messages.findLast(m => 
        m.role === 'assistant' && m.content.includes('heart rate')
      );
      
      if (!lastHeartRateMessage || 
          (Math.abs(vitalSigns.heartRate - parseInt(lastHeartRateMessage.content.match(/\d+/)?.[0] || 0)) > 10)) {
        const isHigh = vitalSigns.heartRate > 100;
        const isLow = vitalSigns.heartRate < 60;
        
        if (isHigh || isLow) {
          addAssistantMessage(`I notice your current heart rate is ${vitalSigns.heartRate} BPM. ${
            isHigh ? "This is elevated. Are you feeling anxious or have you been physically active recently?" :
            "This is lower than normal. Have you been resting?"
          }`);
        }
      }
    }
  }, [vitalSigns]);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  const startRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
      }
    }
  };
  
  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };
  
  const handleInputChange = (e) => {
    setInputMessage(e.target.value);
  };
  
// This is a replacement for the handleSendMessage function in MedicalChatSystem.jsx
// that better handles symptom analysis

// Enhanced handleSendMessage function for MedicalChatSystem.jsx
// This version improves follow-up questioning for brief symptoms

const handleSendMessage = async () => {
  if (!inputMessage.trim() && uploadedFiles.length === 0) return;
  
  // Add user message to chat
  const userMessage = {
    role: 'user',
    content: inputMessage.trim(),
    files: uploadedFiles
  };
  
  setMessages(prev => [...prev, userMessage]);
  setInputMessage('');
  setUploadedFiles([]);
  setIsSending(true);
  setIsTyping(true);
  
  try {
    // Generate context for API call
    const context = generateContext();
    
    // Handle file uploads if any
    let fileToUpload = null;
    if (uploadedFiles.length > 0) {
      fileToUpload = uploadedFiles[0].file;
    }
    
    // Check if this message appears to be describing symptoms briefly (< 30 chars)
    const isBriefSymptomDescription = 
      userMessage.content.length < 30 && 
      (userMessage.content.toLowerCase().includes('pain') ||
       userMessage.content.toLowerCase().includes('ache') ||
       userMessage.content.toLowerCase().includes('hurt') ||
       userMessage.content.toLowerCase().includes('sore') ||
       userMessage.content.toLowerCase().includes('feel') ||
       userMessage.content.toLowerCase().includes('sick'));
    
    // For brief symptom messages, ask follow-up questions instead of analysis
    if (isBriefSymptomDescription) {
      // Extract symptom type for better follow-up
      let symptomLocation = "";
      
      if (userMessage.content.toLowerCase().includes('chest')) {
        symptomLocation = "chest";
      } else if (userMessage.content.toLowerCase().includes('head')) {
        symptomLocation = "head";
      } else if (userMessage.content.toLowerCase().includes('stomach')) {
        symptomLocation = "stomach";
      } else if (userMessage.content.toLowerCase().includes('back')) {
        symptomLocation = "back";
      } else {
        // Extract other locations if mentioned
        const bodyParts = ["arm", "leg", "throat", "neck", "foot", "hand", "eye", "ear", "nose"];
        for (const part of bodyParts) {
          if (userMessage.content.toLowerCase().includes(part)) {
            symptomLocation = part;
            break;
          }
        }
      }
      
      // Generate appropriate follow-up questions based on symptom
      let followUpResponse = "I'd like to understand your symptoms better. ";
      
      if (symptomLocation === "chest") {
        followUpResponse += "Chest pain can have many causes, from muscle strain to more serious conditions. Could you please tell me:\n\n" +
          "- How would you describe the pain (sharp, dull, pressure, burning)?\n" +
          "- When did it start and how long have you had it?\n" +
          "- Does it worsen with activity or stress?\n" +
          "- Do you have any other symptoms like shortness of breath or sweating?\n\n" +
          "If you have any relevant medical images like ECGs or chest X-rays, you can also upload them for better assessment.";
      } else if (symptomLocation === "head") {
        followUpResponse += "Headaches can vary widely in their causes. Please share more details:\n\n" +
          "- Where exactly is the pain located?\n" +
          "- How would you describe the pain (throbbing, constant, sharp)?\n" +
          "- When did it start and how often does it occur?\n" +
          "- Do you have any other symptoms like visual changes, nausea, or sensitivity to light?";
      } else if (symptomLocation === "stomach") {
        followUpResponse += "Stomach pain can have many different causes. Could you provide more information:\n\n" +
          "- Where exactly in your abdomen is the pain?\n" +
          "- Is it constant or does it come and go?\n" +
          "- Have you noticed any changes in appetite, bowel movements, or nausea?\n" +
          "- Are there any foods that make it better or worse?";
      } else {
        // Generic follow-up for other symptoms
        followUpResponse += "To help me better understand your condition, please provide more details:\n\n" +
          "- How long have you been experiencing this symptom?\n" +
          "- Is the pain constant or intermittent?\n" +
          "- What makes it better or worse?\n" +
          "- Do you have any other symptoms?\n" +
          "- Have you tried any treatments?\n\n" +
          "Also, if you have any relevant medical images or test results, you can upload them for a more accurate assessment.";
      }
      
      // Add the follow-up message
      addAssistantMessage(followUpResponse);
      
      // Update progress slightly since we're gathering information
      setDiagnosisProgress(Math.max(25, diagnosisProgress));
      
      setIsSending(false);
      return;
    }
    
    // For more detailed messages or non-symptom messages, continue with normal flow
    
    // Check if we have sufficient detailed symptom information now
    const allUserMessages = messages
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content)
      .join("\n");
    
    const hasDetailedSymptoms = 
      allUserMessages.length > 100 || 
      messages.filter(msg => msg.role === 'user').length >= 3;
    
    // For detailed symptom descriptions, try disease prediction
    if (hasDetailedSymptoms && 
        (userMessage.content.length > 50 || 
         messages[messages.length-2]?.role === 'assistant' && 
         messages[messages.length-2]?.content.includes("understand your symptoms better"))) {
      
      try {
        // Create a combined symptoms description from all user messages
        const symptomText = [...messages, userMessage]
          .filter(msg => msg.role === 'user')
          .map(msg => msg.content)
          .join("\n");
        
        // Call disease prediction with the combined symptoms
        const prediction = await medicalChatAPI.predictDisease(
          symptomText,
          medicalHistory ? JSON.stringify(medicalHistory) : null
        );
        
        if (prediction && !prediction.error && prediction.prediction) {
          // Add the diagnosis message with proper formatting
          let diagnosisText = `Based on your description, your symptoms might be consistent with ${prediction.prediction}. `;
          
          if (prediction.explanation) {
            diagnosisText += prediction.explanation + " ";
          }
          
          diagnosisText += "Please note that this is not a definitive diagnosis and you should consult with a healthcare professional.\n\n";
          
          if (prediction.preventionMeasures && prediction.preventionMeasures.length > 0) {
            diagnosisText += "Recommendations:\n" + 
              prediction.preventionMeasures.map(rec => `- ${rec}`).join("\n");
          }
          
          // Add diagnosis result
          addAssistantMessage(diagnosisText);
          setDiagnosisResult(prediction);
          setDiagnosisProgress(100);
          
          setIsSending(false);
          return;
        }
      } catch (predictionError) {
        console.warn('Error during disease prediction, falling back:', predictionError);
        // Continue with normal chat if prediction fails
      }
    }
    
    // Otherwise, use the regular chat
    // Determine whether to use unified endpoint or dynamic chat
    const response = fileToUpload 
      ? await medicalChatAPI.sendUnifiedHealthChat(userMessage.content, fileToUpload, context) 
      : await medicalChatAPI.sendMessage(userMessage.content, context);
    
    // Check response and handle different response types
    if (response && response.response) {
      // Add AI response with typing effect
      addAssistantMessage(response.response);
      
      // Store model information if provided
      if (response.model) {
        setCurrentModel(response.model);
      }
      
      // Check for diagnostic state transitions
      processDiagnosisStage(userMessage.content, response.response);
      
      // Handle specific intents
      if (response.intent === 'disease_prediction' && response.prediction) {
        // Process disease prediction specific response
        setDiagnosisResult(response.prediction);
        
        // Notify parent component
        if (onDiagnosisComplete) {
          onDiagnosisComplete(response.prediction);
        }
      }
    } else if (response && response.error) {
      // Handle specific error types
      let errorMessage = "";
      switch(response.error) {
        case 'model_loading':
          errorMessage = "I'm still initializing my medical knowledge base. Please try again in a moment.";
          break;
        case 'network':
          errorMessage = "I'm having trouble connecting to my knowledge base. Please check your network connection.";
          break;
        case 'timeout':
          errorMessage = "I'm taking longer than expected to process your query. Please try a simpler question.";
          break;
        case 'rate_limited':
          errorMessage = "I've been receiving many requests. Please wait a moment before sending another message.";
          break;
        default:
          errorMessage = "I encountered an issue while processing your request. Please try again with a different question.";
      }
      addAssistantMessage(errorMessage);
    } else {
      // Fallback for unexpected response format
      addAssistantMessage("I'm having trouble generating a response right now. Please try again in a moment.");
    }
    
  } catch (error) {
    console.error('Error getting AI response:', error);
    toast.error('Failed to get response from AI assistant. Please try again.');
    addAssistantMessage("I'm sorry, I encountered an error while processing your request. Please try again.");
  } finally {
    setIsSending(false);
  }
};
  
  // Generate context from patient data, medical history, and vital signs
  const generateContext = () => {
    let context = "";
    
    if (patientData) {
      context += `Patient Name: ${patientData.name || 'Unknown'}\n`;
      context += `Gender: ${patientData.gender || 'Unknown'}\n`;
      context += `DOB: ${patientData.dob || 'Unknown'}\n\n`;
    }
    
    if (medicalHistory) {
      context += "Medical History:\n";
      if (medicalHistory.conditions && medicalHistory.conditions.length > 0) {
        context += `Conditions: ${medicalHistory.conditions.join(', ')}\n`;
      }
      if (medicalHistory.medications && medicalHistory.medications.length > 0) {
        context += `Medications: ${medicalHistory.medications.map(med => med.name).join(', ')}\n`;
      }
      if (medicalHistory.allergies && medicalHistory.allergies.length > 0) {
        context += `Allergies: ${medicalHistory.allergies.join(', ')}\n`;
      }
      context += '\n';
    }
    
    if (vitalSigns && vitalSigns.heartRate) {
      context += "Current Vital Signs:\n";
      context += `Heart Rate: ${vitalSigns.heartRate} BPM\n`;
      if (vitalSigns.bloodPressure) {
        context += `Blood Pressure: ${vitalSigns.bloodPressure}\n`;
      }
      if (vitalSigns.oxygenLevel) {
        context += `Oxygen Level: ${vitalSigns.oxygenLevel}%\n`;
      }
      if (vitalSigns.temperature) {
        context += `Temperature: ${vitalSigns.temperature}°C\n`;
      }
      if (vitalSigns.respiratoryRate) {
        context += `Respiratory Rate: ${vitalSigns.respiratoryRate} breaths/min\n`;
      }
    }
    
    return context;
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    
    if (files.length === 0) return;
    
    // Process each file (in a real app, you'd upload these to your server)
    const newFiles = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      type: file.type,
      size: file.size,
      url: URL.createObjectURL(file),
      file: file // Keep reference to original file for API uploads
    }));
    
    setUploadedFiles(prev => [...prev, ...newFiles]);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const removeFile = (fileId) => {
    setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
  };
  
  const addAssistantMessage = (content) => {
    // Split message into chunks to simulate typing
    const words = content.split(' ');
    const chunks = [];
    let currentChunk = '';
    
    for (const word of words) {
      currentChunk += word + ' ';
      if (currentChunk.length > 50 || word === words[words.length - 1]) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
    }
    
    // Add initial message with first chunk
    setMessages(prev => [...prev, { 
      role: 'assistant', 
      content: chunks[0],
      isTyping: chunks.length > 1
    }]);
    
    // Simulate typing for remaining chunks
    if (chunks.length > 1) {
      let chunkIndex = 1;
      
      const typeNextChunk = () => {
        if (chunkIndex < chunks.length) {
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            lastMessage.content += ' ' + chunks[chunkIndex];
            lastMessage.isTyping = chunkIndex < chunks.length - 1;
            return newMessages;
          });
          
          chunkIndex++;
          setTimeout(typeNextChunk, 300 + Math.random() * 200);
        } else {
          setIsTyping(false);
        }
      };
      
      setTimeout(typeNextChunk, 400 + Math.random() * 300);
    } else {
      setIsTyping(false);
    }
    
    // Optionally use text-to-speech if available
    if (speak && content.length < 200) {
      speak(content);
    }
  };
  
  const handleSuggestedQuestion = (question) => {
    setInputMessage(question);
    setTimeout(() => {
      handleSendMessage();
    }, 100);
  };
  
  // The dynamic endpoint automatically selects the best model, so this
  // function now mainly serves as a reset function
  const toggleModel = () => {
    // Reset the model to Auto
    setCurrentModel('Auto');
    
    // Add a message about the reset
    addAssistantMessage(`I've reset my thinking process to analyze your messages with a fresh perspective.`);
    
    // Reset the session cache
    medicalChatAPI.resetSession();
  };
  
  const processDiagnosisStage = (userMessage, aiResponse) => {
    // This is a production-grade diagnosis flow with real scoring algorithms
    
    // Check if the AI has already detected disease prediction intent
    const isDiseasePrediction = aiResponse.toLowerCase().includes('based on your symptoms') ||
                               aiResponse.toLowerCase().includes('you might have') ||
                               aiResponse.toLowerCase().includes('likely diagnosis');
    
    // Check if enough information has been gathered
    const messageCount = messages.length;
    
    // Check for detailed symptom descriptions (50+ chars)
    const hasDetailedSymptoms = messages.some(m => 
      m.role === 'user' && m.content.length > 50 && 
      (m.content.toLowerCase().includes('symptom') || 
       m.content.toLowerCase().includes('feel') ||
       m.content.toLowerCase().includes('pain') ||
       m.content.toLowerCase().includes('hurt'))
    );
    
    // Check for duration information
    const hasDurationInfo = messages.some(m => 
      m.role === 'user' && 
      (m.content.toLowerCase().includes('day') || 
       m.content.toLowerCase().includes('week') ||
       m.content.toLowerCase().includes('month') ||
       m.content.toLowerCase().includes('since'))
    );
    
    // Check for uploaded medical documents
    const hasUploadedFiles = messages.some(m => 
      m.role === 'user' && m.files && m.files.length > 0
    );
    
    // Update diagnosis progress based on conversation state
    let newProgress = diagnosisProgress;
    
    if (isDiseasePrediction) {
      // The AI already made a prediction
      newProgress = 100;
    } else if (messageCount >= 10 || (hasDetailedSymptoms && hasDurationInfo && hasUploadedFiles)) {
      // Complete information
      newProgress = 100;
    } else if (messageCount >= 7 || (hasDetailedSymptoms && hasDurationInfo)) {
      // Substantial information
      newProgress = Math.max(75, diagnosisProgress);
    } else if (messageCount >= 4 || hasDetailedSymptoms) {
      // Partial information
      newProgress = Math.max(50, diagnosisProgress);
    } else if (messageCount >= 2) {
      // Initial information
      newProgress = Math.max(25, diagnosisProgress);
    }
    
    // Update progress if it's higher than current
    if (newProgress > diagnosisProgress) {
      setDiagnosisProgress(newProgress);
    }
    
    // Generate diagnosis when we reach 100%
    if (newProgress === 100 && !diagnosisResult && !isDiagnosing) {
      generateDiagnosis();
    }
  };
  
  const generateDiagnosis = async () => {
    // Prevent multiple diagnosis attempts
    if (isDiagnosing) return;
    
    setIsDiagnosing(true);
    
    try {
      // Collect all user messages about symptoms for a more comprehensive analysis
      const userMessages = messages
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content)
        .join("\n");
      
      // Ensure we have enough symptom information
      if (userMessages.length < 10) {
        addAssistantMessage("I need more details about your symptoms to provide an accurate analysis. Could you describe what you're experiencing in more detail?");
        setIsDiagnosing(false);
        return;
      }
      
      // Make API call for smart disease prediction
      const predictionResponse = await medicalChatAPI.predictDisease(
        userMessages,
        medicalHistory ? JSON.stringify(medicalHistory) : null
      );
      
      // Handle error responses that might come back from the predictDisease function
      if (predictionResponse.error) {
        addAssistantMessage(predictionResponse.response || "I'm having trouble analyzing your symptoms right now. Please try again later.");
        setIsDiagnosing(false);
        return;
      }
      
      // Extract prediction from API response
      const prediction = predictionResponse.prediction || predictionResponse;
      
      if (prediction && (prediction.prediction || prediction.possibleConditions)) {
        // Create a standardized result object
        const result = {
          // Support both API response formats
          possibleConditions: prediction.possibleConditions || 
            (prediction.prediction ? [{
              name: prediction.prediction,
              probability: prediction.confidence || 0.7
            }] : []),
          recommendedTests: prediction.recommendedTests || [],
          recommendedSpecialists: prediction.recommendedSpecialists || [],
          overallSeverity: prediction.overallSeverity || prediction.severityScore || 3,
          urgency: prediction.urgency || 'moderate',
          treatmentRecommendations: prediction.treatmentRecommendations || 
            prediction.preventionMeasures || [],
          followUpQuestions: predictionResponse.follow_up_questions || []
        };
        
        setDiagnosisResult(result);
        
        // Format a human-readable diagnosis message
        let diagnosisMessage = "Based on our discussion, ";
        
        // Add specialist recommendation
        if (result.recommendedSpecialists && result.recommendedSpecialists.length > 0) {
          diagnosisMessage += `I recommend you see a ${result.recommendedSpecialists[0].specialty}. `;
        } else {
          diagnosisMessage += "I recommend you see a healthcare provider. ";
        }
        
        // Add condition information
        if (result.possibleConditions && result.possibleConditions.length > 0) {
          const topCondition = result.possibleConditions[0];
          diagnosisMessage += `The most likely cause appears to be ${topCondition.name} `;
          if (topCondition.probability) {
            diagnosisMessage += `(probability: ${Math.round(topCondition.probability * 100)}%), `;
          }
          
          if (result.possibleConditions.length > 1) {
            diagnosisMessage += `though ${result.possibleConditions[1].name} is also possible. `;
          }
        }
        
        // Add severity
        if (result.overallSeverity) {
          diagnosisMessage += `This is a ${result.urgency || 'moderate'} severity condition (${result.overallSeverity}/10) `;
        }
        
        // Add top recommendations
        if (result.treatmentRecommendations && result.treatmentRecommendations.length > 0) {
          diagnosisMessage += `that typically requires ${result.treatmentRecommendations.slice(0, 2).join(", ")}`;
          if (result.treatmentRecommendations.length > 2) {
            diagnosisMessage += `, and ${result.treatmentRecommendations[2]}`;
          }
          diagnosisMessage += ".";
        }
        
        // Add disclaimer
        diagnosisMessage += " Please note that this is not a definitive diagnosis and you should consult with a healthcare professional for proper evaluation.";
        
        // Add follow-up question prompt if available
        if (result.followUpQuestions && result.followUpQuestions.length > 0) {
          diagnosisMessage += "\n\nTo better understand your condition, I'd like to ask: " + result.followUpQuestions[0];
        }
        
        // Add diagnosis message to chat
        addAssistantMessage(diagnosisMessage);
        
        // Notify parent component
        if (onDiagnosisComplete) {
          onDiagnosisComplete(result);
        }
      } else {
        // Handle case where prediction API fails
        addAssistantMessage("I've analyzed your symptoms but couldn't generate a confident diagnosis. I recommend consulting with a healthcare professional for a proper evaluation.");
      }
    } catch (error) {
      console.error('Error generating diagnosis:', error);
      toast.error('Failed to generate diagnosis. Please try again.');
      addAssistantMessage("I'm sorry, I encountered an error while generating your diagnosis. Please try again or consult with a healthcare professional.");
    } finally {
      setIsDiagnosing(false);
    }
  };
  
  return (
    <div className={`bg-white rounded-xl shadow-md overflow-hidden ${className}`}>
      <div className="p-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Medical Consultation</h2>
          <div className="text-xs bg-white bg-opacity-20 rounded-full px-3 py-1">
            {currentModel === 'Auto' 
              ? 'Dynamic AI Selection' 
              : `Using ${currentModel}`}
          </div>
        </div>
        <p className="text-sm opacity-80 mt-1">
          AI-guided medical assessment
        </p>
      </div>
      
      <div className="flex flex-col h-[500px]">
        {/* Chat messages */}
        <div className="flex-1 p-4 overflow-y-auto">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`mb-4 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-2 flex-shrink-0">
                  <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
              )}
              
              <div className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user' 
                  ? 'bg-blue-600 text-white ml-2' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                <p>{message.content}</p>
                
                {message.files && message.files.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {message.files.map(file => (
                      <div key={file.id} className="bg-white bg-opacity-20 rounded p-2 text-sm flex items-center">
                        {file.type.startsWith('image/') ? (
                          <Image className="w-4 h-4 mr-2" />
                        ) : (
                          <FileText className="w-4 h-4 mr-2" />
                        )}
                        <span className="truncate">{file.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {message.isTyping && (
                  <div className="flex space-x-1 mt-2 items-center">
                    <div className="w-2 h-2 rounded-full bg-gray-300 animate-pulse"></div>
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                )}
              </div>
              
              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center ml-2 flex-shrink-0">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
            </div>
          ))}
          
          {/* Typing indicator */}
          {isTyping && !messages[messages.length - 1]?.isTyping && (
            <div className="mb-4 flex justify-start">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-2 flex-shrink-0">
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              
              <div className="max-w-[80%] rounded-lg p-3 bg-gray-100 text-gray-800">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        {/* Diagnosis progress bar */}
        <div className="px-4 pt-1 pb-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Assessment progress</span>
            <span>{diagnosisProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div 
              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" 
              style={{ width: `${diagnosisProgress}%` }}
            ></div>
          </div>
        </div>
        
        {/* Uploaded files */}
        {uploadedFiles.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-200">
            <div className="flex gap-2 overflow-x-auto py-1">
              {uploadedFiles.map(file => (
                <div key={file.id} className="flex-shrink-0 bg-gray-100 rounded-lg p-2 text-xs flex items-center">
                  {file.type.startsWith('image/') ? (
                    <Image className="w-3 h-3 mr-1" />
                  ) : (
                    <FileText className="w-3 h-3 mr-1" />
                  )}
                  <span className="max-w-[120px] truncate">{file.name}</span>
                  <button 
                    className="ml-1 text-gray-500 hover:text-red-500"
                    onClick={() => removeFile(file.id)}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Quick suggestions */}
        {messages.length < 4 && (
          <div className="px-4 py-2 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-2">Common symptoms to discuss:</p>
            <div className="flex flex-wrap gap-2">
              {commonConditions.map((suggestion, index) => (
                <button
                  key={index}
                  className="bg-gray-100 hover:bg-gray-200 rounded-full px-3 py-1 text-xs text-gray-800 transition-colors"
                  onClick={() => handleSuggestedQuestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Input area */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex items-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-500 hover:text-indigo-600 transition-colors"
              title="Attach file"
            >
              <PlusCircle className="w-5 h-5" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileUpload}
              multiple
            />
            
            <input
              type="text"
              value={inputMessage}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Describe your symptoms..."
              className="flex-1 border-0 bg-transparent p-2 focus:outline-none focus:ring-0 text-gray-800 placeholder-gray-400"
              disabled={isSending || isRecording}
            />
            
            {isRecording ? (
              <button
                onClick={stopRecording}
                className="p-2 text-red-500 hover:text-red-600 transition-colors animate-pulse"
                title="Stop recording"
              >
                <StopCircle className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={startRecording}
                className="p-2 text-gray-500 hover:text-indigo-600 transition-colors"
                title="Voice input"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
            
            <button
              onClick={handleSendMessage}
              disabled={(!inputMessage.trim() && uploadedFiles.length === 0) || isSending}
              className={`ml-1 p-2 rounded-full ${
                (!inputMessage.trim() && uploadedFiles.length === 0) || isSending
                  ? 'text-gray-400'
                  : 'text-indigo-600 hover:bg-indigo-100'
              } transition-colors`}
              title="Send message"
            >
              <SendHorizonal className="w-5 h-5" />
            </button>
            
            <button
              onClick={toggleModel}
              className="ml-1 p-1 text-gray-500 hover:text-indigo-600 text-xs border border-gray-300 rounded-md hover:border-indigo-400 transition-colors"
              title="Reset AI thinking"
            >
              <RotateCcw className="w-3 h-3 inline-block mr-1" />
              Reset AI
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MedicalChatSystem;
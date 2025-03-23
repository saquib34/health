import React, { useState, useEffect, useRef } from 'react';
import { SendHorizonal, Mic, StopCircle, RotateCcw, PlusCircle, Image, FileText } from 'lucide-react';
import { toast } from 'react-toastify';
import { medicalChatAPI } from '../services/api';
import { useAssistant } from '../context/AssistantContext';

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
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  
  const commonConditions = [
    "I have a fever and sore throat",
    "I've been experiencing chest pain",
    "I have a persistent cough",
    "I've been having headaches",
    "I feel short of breath",
    "I have abdominal pain"
  ];
  
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
      
      recognitionRef.current.onend = () => setIsRecording(false);
    }
    
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);
  
  useEffect(() => scrollToBottom(), [messages]);
  
  useEffect(() => {
    if (patientData && messages.length === 1 && messages[0].initial) {
      const greeting = `Hello ${patientData.name || 'there'}! I'm your HealthAI medical assistant. How can I help you today?`;
      setMessages([{ role: 'assistant', content: greeting }]);
      
      if (medicalHistory) {
        setTimeout(() => {
          addAssistantMessage("I can see from your records that you have provided your medical history. Is there something specific you'd like to discuss today?");
        }, 1000);
      }
    }
  }, [patientData, medicalHistory]);
  
  useEffect(() => {
    if (vitalSigns && vitalSigns.heartRate) {
      const lastHeartRateMessage = messages.findLast(m => m.role === 'assistant' && m.content.includes('heart rate'));
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
  
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  
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
    if (recognitionRef.current) recognitionRef.current.stop();
  };
  
  const handleInputChange = (e) => setInputMessage(e.target.value);
  
  const handleSendMessage = async () => {
    if (!inputMessage.trim() && uploadedFiles.length === 0) return;
    
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
      if (uploadedFiles.length > 0) {
        addAssistantMessage("Sorry, I can’t process files yet. Please describe your symptoms in text.");
        setIsSending(false);
        return;
      }
      
      const context = generateContext();
      const response = await medicalChatAPI.sendMessage(userMessage.content, context);
      
      addAssistantMessage(response.response);
      processDiagnosisStage(userMessage.content, response.response);
    } catch (error) {
      console.error('Error getting AI response:', error);
      toast.error('Failed to get response from AI assistant.');
      addAssistantMessage("I'm sorry, I encountered an error while processing your request. Please try again.");
    } finally {
      setIsSending(false);
    }
  };
  
  const generateContext = () => {
    let context = "";
    if (patientData) {
      context += `Patient Name: ${patientData.name || 'Unknown'}\n`;
      context += `Gender: ${patientData.gender || 'Unknown'}\n`;
      context += `DOB: ${patientData.dob || 'Unknown'}\n\n`;
    }
    if (medicalHistory) {
      context += "Medical History:\n";
      if (medicalHistory.conditions?.length) context += `Conditions: ${medicalHistory.conditions.join(', ')}\n`;
      if (medicalHistory.medications?.length) context += `Medications: ${medicalHistory.medications.map(med => med.name).join(', ')}\n`;
      if (medicalHistory.allergies?.length) context += `Allergies: ${medicalHistory.allergies.join(', ')}\n`;
      context += '\n';
    }
    if (vitalSigns && vitalSigns.heartRate) {
      context += "Current Vital Signs:\n";
      context += `Heart Rate: ${vitalSigns.heartRate} BPM\n`;
      if (vitalSigns.bloodPressure) context += `Blood Pressure: ${vitalSigns.bloodPressure}\n`;
      if (vitalSigns.oxygenLevel) context += `Oxygen Level: ${vitalSigns.oxygenLevel}%\n`;
      if (vitalSigns.temperature) context += `Temperature: ${vitalSigns.temperature}°C\n`;
      if (vitalSigns.respiratoryRate) context += `Respiratory Rate: ${vitalSigns.respiratoryRate} breaths/min\n`;
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
    const newFiles = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      type: file.type,
      size: file.size,
      url: URL.createObjectURL(file),
      file
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const removeFile = (fileId) => setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
  
  const addAssistantMessage = (content) => {
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
    
    setMessages(prev => [...prev, { role: 'assistant', content: chunks[0], isTyping: chunks.length > 1 }]);
    
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
    
    if (speak && content.length < 200) speak(content);
  };
  
  const handleSuggestedQuestion = (question) => {
    setInputMessage(question);
    setTimeout(() => handleSendMessage(), 100);
  };
  
  const toggleModel = () => {
    medicalChatAPI.resetSession(); // Reset session in API service
    setMessages([{ role: 'assistant', content: 'Hello, I\'m your HealthAI medical assistant. How can I help you today?' }]);
    setDiagnosisProgress(0);
    addAssistantMessage('I’ve reset our conversation. Let’s start fresh.');
  };
  
  const processDiagnosisStage = (userMessage, aiResponse) => {
    const messageCount = messages.length;
    const isDiagnosis = aiResponse.toLowerCase().includes('you might have') || 
                       aiResponse.toLowerCase().includes('diagnosis') || 
                       aiResponse.toLowerCase().includes('based on your symptoms');
    
    let newProgress = diagnosisProgress;
    if (isDiagnosis) newProgress = 100;
    else if (messageCount >= 7) newProgress = 75;
    else if (messageCount >= 4) newProgress = 50;
    else if (messageCount >= 2) newProgress = 25;
    
    setDiagnosisProgress(Math.max(newProgress, diagnosisProgress));
    
    if (isDiagnosis && onDiagnosisComplete) {
      const result = {
        response: aiResponse,
        possibleConditions: aiResponse.match(/you might have (.*?)[\.\n]/i)?.[1] || 'Unknown',
        urgency: aiResponse.includes('urgent') ? 'high' : 'moderate'
      };
      setDiagnosisResult(result);
      onDiagnosisComplete(result);
    }
  };
  
  return (
    <div className={`bg-white rounded-xl shadow-md overflow-hidden ${className}`}>
      <div className="p-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Medical Consultation</h2>
          <div className="text-xs bg-white bg-opacity-20 rounded-full px-3 py-1">
            Dynamic AI Selection
          </div>
        </div>
        <p className="text-sm opacity-80 mt-1">AI-guided medical assessment</p>
      </div>
      
      <div className="flex flex-col h-[500px]">
        <div className="flex-1 p-4 overflow-y-auto">
          {messages.map((message, index) => (
            <div key={index} className={`mb-4 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-2 flex-shrink-0">
                  <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
              )}
              <div className={`max-w-[80%] rounded-lg p-3 ${message.role === 'user' ? 'bg-blue-600 text-white ml-2' : 'bg-gray-100 text-gray-800'}`}>
                <p>{message.content}</p>
                {message.files?.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {message.files.map(file => (
                      <div key={file.id} className="bg-white bg-opacity-20 rounded p-2 text-sm flex items-center">
                        {file.type.startsWith('image/') ? <Image className="w-4 h-4 mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
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
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
            </div>
          ))}
          {isTyping && !messages[messages.length - 1]?.isTyping && (
            <div className="mb-4 flex justify-start">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-2 flex-shrink-0">
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        
        <div className="px-4 pt-1 pb-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Assessment progress</span>
            <span>{diagnosisProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${diagnosisProgress}%` }}></div>
          </div>
        </div>
        
        {uploadedFiles.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-200">
            <div className="flex gap-2 overflow-x-auto py-1">
              {uploadedFiles.map(file => (
                <div key={file.id} className="flex-shrink-0 bg-gray-100 rounded-lg p-2 text-xs flex items-center">
                  {file.type.startsWith('image/') ? <Image className="w-3 h-3 mr-1" /> : <FileText className="w-3 h-3 mr-1" />}
                  <span className="max-w-[120px] truncate">{file.name}</span>
                  <button className="ml-1 text-gray-500 hover:text-red-500" onClick={() => removeFile(file.id)}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {messages.length < 4 && (
          <div className="px-4 py-2 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-2">Common symptoms to discuss:</p>
            <div className="flex flex-wrap gap-2">
              {commonConditions.map((suggestion, index) => (
                <button key={index} className="bg-gray-100 hover:bg-gray-200 rounded-full px-3 py-1 text-xs text-gray-800 transition-colors" onClick={() => handleSuggestedQuestion(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex items-center">
            <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-500 hover:text-indigo-600 transition-colors" title="Attach file">
              <PlusCircle className="w-5 h-5" />
            </button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} multiple />
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
              <button onClick={stopRecording} className="p-2 text-red-500 hover:text-red-600 transition-colors animate-pulse" title="Stop recording">
                <StopCircle className="w-5 h-5" />
              </button>
            ) : (
              <button onClick={startRecording} className="p-2 text-gray-500 hover:text-indigo-600 transition-colors" title="Voice input">
                <Mic className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={handleSendMessage}
              disabled={(!inputMessage.trim() && uploadedFiles.length === 0) || isSending}
              className={`ml-1 p-2 rounded-full ${(!inputMessage.trim() && uploadedFiles.length === 0) || isSending ? 'text-gray-400' : 'text-indigo-600 hover:bg-indigo-100'} transition-colors`}
              title="Send message"
            >
              <SendHorizonal className="w-5 h-5" />
            </button>
            <button onClick={toggleModel} className="ml-1 p-1 text-gray-500 hover:text-indigo-600 text-xs border border-gray-300 rounded-md hover:border-indigo-400 transition-colors" title="Reset AI thinking">
              <RotateCcw className="w-3 h-3 inline-block mr-1" /> Reset AI
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MedicalChatSystem;
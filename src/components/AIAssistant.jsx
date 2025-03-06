// src/components/AIAssistant.jsx
import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Mic, Volume2, Send } from 'lucide-react';
import { useAssistant } from '../context/AssistantContext';

const AIAssistant = () => {
  const { message, setMessage, speak, isSpeaking, stopSpeaking } = useAssistant();
  const [isOpen, setIsOpen] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { type: 'assistant', text: 'Hello! I\'m your HealthAI assistant. How can I help you today?' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);
  
  // Initialize speech recognition if available
  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      
      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setUserInput(transcript);
        handleUserMessage(transcript);
        setIsListening(false);
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };
      
      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);
  
  // Scroll to bottom of chat when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);
  
  // Handle new assistant messages from context
  useEffect(() => {
    if (message && message !== chatHistory[chatHistory.length - 1]?.text) {
      addAssistantMessage(message);
    }
  }, [message]);
  
  const toggleAssistant = () => {
    setIsOpen(!isOpen);
    
    // If closing, stop any ongoing speech
    if (isOpen && isSpeaking) {
      stopSpeaking();
    }
  };
  
  const addAssistantMessage = (text) => {
    setIsTyping(true);
    
    // Simulate typing effect
    setTimeout(() => {
      setChatHistory(prev => [...prev, { type: 'assistant', text }]);
      setIsTyping(false);
    }, 500);
  };
  
  const handleUserMessage = (text) => {
    // Add user message to chat
    setChatHistory(prev => [...prev, { type: 'user', text }]);
    setUserInput('');
    
    // Simulate AI processing
    setIsTyping(true);
    
    // Process common healthcare queries with predefined responses
    setTimeout(() => {
      let response;
      const lowerText = text.toLowerCase();
      
      if (lowerText.includes('appointment') || lowerText.includes('book') || lowerText.includes('schedule')) {
        response = "You can book an appointment by going to the Appointments section. Would you like me to navigate you there?";
      } else if (lowerText.includes('doctor') || lowerText.includes('specialist')) {
        response = "We have specialists in cardiology, neurology, pediatrics, orthopedics, and many other fields. Which specialist would you like to see?";
      } else if (lowerText.includes('prescription') || lowerText.includes('medicine') || lowerText.includes('medication')) {
        response = "Your current prescriptions can be found in the Prescriptions section. Is there a specific medication you're asking about?";
      } else if (lowerText.includes('report') || lowerText.includes('test') || lowerText.includes('result')) {
        response = "Your test results and medical reports are available in the Medical Records section. Would you like me to show you your latest reports?";
      } else if (lowerText.includes('thank')) {
        response = "You're welcome! Is there anything else I can help you with?";
      } else if (lowerText.includes('hello') || lowerText.includes('hi') || lowerText === 'hey') {
        response = "Hello! How can I assist you with your healthcare needs today?";
      } else {
        response = "I understand you're asking about " + text + ". How can I help you with this specifically?";
      }
      
      setChatHistory(prev => [...prev, { type: 'assistant', text: response }]);
      setMessage(response);
      speak(response);
      setIsTyping(false);
    }, 1000);
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (userInput.trim()) {
      handleUserMessage(userInput);
    }
  };
  
  const startListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
      }
    }
  };
  
  return (
    <>
      {/* Assistant button */}
      <motion.button
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg flex items-center justify-center z-50"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleAssistant}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageSquare className="w-6 h-6" />
        )}
      </motion.button>
      
      {/* Assistant panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed bottom-24 right-6 w-80 md:w-96 bg-white rounded-2xl shadow-xl z-40 overflow-hidden flex flex-col"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center mr-3">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-medium">HealthAI Assistant</h3>
                  <p className="text-xs opacity-80">Available 24/7 for your health queries</p>
                </div>
                {isSpeaking && (
                  <div className="ml-auto">
                    <button 
                      className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"
                      onClick={stopSpeaking}
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Chat content */}
            <div className="flex-1 p-4 overflow-y-auto max-h-96 bg-gray-50">
              <div className="space-y-4">
                {chatHistory.map((chat, index) => (
                  <div
                    key={index}
                    className={`flex ${chat.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-lg ${
                        chat.type === 'user'
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-white border border-gray-200 rounded-bl-none'
                      }`}
                    >
                      <p className={chat.type === 'user' ? 'text-white' : 'text-gray-800'}>
                        {chat.text}
                      </p>
                    </div>
                  </div>
                ))}
                
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] p-3 rounded-lg bg-white border border-gray-200 rounded-bl-none">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce"></div>
                        <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>
            
            {/* Input area */}
            <form onSubmit={handleSubmit} className="p-3 border-t">
              <div className="flex items-center">
                <button
                  type="button"
                  className={`p-2 rounded-full ${isListening ? 'text-red-500' : 'text-gray-400 hover:text-blue-600'}`}
                  onClick={startListening}
                  disabled={isListening}
                >
                  <Mic className="w-5 h-5" />
                </button>
                
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder={isListening ? "Listening..." : "Type your message..."}
                  className="flex-1 py-2 px-3 outline-none text-gray-700 placeholder-gray-400"
                  disabled={isListening}
                />
                
                <button
                  type="submit"
                  disabled={!userInput.trim() && !isListening}
                  className={`p-2 rounded-full ${
                    !userInput.trim() && !isListening
                      ? 'text-gray-300'
                      : 'text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIAssistant;
// src/context/AssistantContext.jsx
import React, { createContext, useState, useContext, useRef, useEffect } from 'react';

const AssistantContext = createContext();

export const useAssistant = () => useContext(AssistantContext);

export const AssistantProvider = ({ children }) => {
  const [message, setMessage] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const synth = useRef(window.speechSynthesis);
  const utteranceRef = useRef(null);
  
  // Clean up speech synthesis when component unmounts
  useEffect(() => {
    return () => {
      if (utteranceRef.current && synth.current.speaking) {
        synth.current.cancel();
      }
    };
  }, []);
  
  // Handle speech synthesis
  const speak = (text) => {
    // Cancel any ongoing speech
    if (synth.current.speaking) {
      synth.current.cancel();
    }
    
    // Create a new utterance
    utteranceRef.current = new SpeechSynthesisUtterance(text);
    
    // Choose a female voice if available
    const voices = synth.current.getVoices();
    const femaleVoice = voices.find(voice => 
      voice.name.includes('Female') || 
      voice.name.includes('Samantha') || 
      voice.name.includes('Google UK English Female')
    );
    
    if (femaleVoice) {
      utteranceRef.current.voice = femaleVoice;
    }
    
    // Set properties
    utteranceRef.current.rate = 1;
    utteranceRef.current.pitch = 1;
    
    // Set event handlers
    utteranceRef.current.onstart = () => setIsSpeaking(true);
    utteranceRef.current.onend = () => setIsSpeaking(false);
    utteranceRef.current.onerror = () => setIsSpeaking(false);
    
    // Speak the text
    synth.current.speak(utteranceRef.current);
  };
  
  // Stop speaking
  const stopSpeaking = () => {
    if (synth.current.speaking) {
      synth.current.cancel();
    }
  };
  
  // Display message in the UI and optionally speak it
  const displayMessage = (text, shouldSpeak = false) => {
    setMessage(text);
    if (shouldSpeak) {
      speak(text);
    }
  };
  
  return (
    <AssistantContext.Provider value={{
      message,
      setMessage,
      speak,
      stopSpeaking,
      isSpeaking,
      displayMessage
    }}>
      {children}
    </AssistantContext.Provider>
  );
};
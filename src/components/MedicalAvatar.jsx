// src/components/MedicalAvatar.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

const MedicalAvatar = ({ 
  gender = 'female',
  onComplete,
  className
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [currentMessage, setCurrentMessage] = useState('');
  const [medicalHistory, setMedicalHistory] = useState({
    conditions: [],
    surgeries: [],
    medications: [],
    allergies: [],
    familyHistory: [],
    currentSymptoms: []
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [responses, setResponses] = useState({});
  const [lastUserResponse, setLastUserResponse] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  
  const synth = useRef(window.speechSynthesis);
  const recognition = useRef(null);
  
  const questions = [
    { id: 'greeting', text: "Hello, I'm your HealthAI assistant. Do you have any pre-existing medical conditions?", field: 'conditions' },
    { id: 'surgeries', text: "Have you undergone any surgeries in the past?", field: 'surgeries' },
    { id: 'medications', text: "Are you currently taking any medications? Please include dosages if possible.", field: 'medications' },
    { id: 'allergies', text: "Do you have any allergies to medications, food, or other substances?", field: 'allergies' },
    { id: 'familyHistory', text: "Any serious medical conditions in your immediate family?", field: 'familyHistory' },
    { id: 'currentSymptoms', text: "What current health concerns or symptoms brought you here today?", field: 'currentSymptoms' }
  ];

  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition.current = new SpeechRecognition();
      recognition.current.continuous = true;
      recognition.current.interimResults = true;
      recognition.current.lang = 'en-US';
      recognition.current.maxAlternatives = 5;
      
      recognition.current.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        setLastUserResponse(transcript);
        if (event.results[event.results.length - 1].isFinal) {
          handleUserResponse(transcript);
          recognition.current.stop();
        }
      };
      
      recognition.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        recognition.current.stop();
      };
      
      recognition.current.onstart = () => setIsListening(true);
      recognition.current.onend = () => setIsListening(false);
    }
    
    return () => {
      if (recognition.current) recognition.current.abort();
      if (synth.current.speaking) synth.current.cancel();
    };
  }, []);

  useEffect(() => {
    if (currentStep < questions.length && !isConfirming) {
      const currentQuestion = questions[currentStep];
      setCurrentMessage(currentQuestion.text);
      speakText(currentQuestion.text);
    } else if (currentStep >= questions.length && !isConfirming) {
      setCurrentMessage("I've recorded all your answers. Would you like to review and confirm?");
      speakText("I've recorded all your answers. Would you like to review and confirm?");
      setIsConfirming(true);
    }
  }, [currentStep, isConfirming]);

  const speakText = (text) => {
    if (synth.current.speaking) synth.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synth.current.getVoices();
    const preferredVoice = voices.find(voice => 
      gender === 'female' 
        ? (voice.name.includes('Female') || voice.name.includes('Samantha'))
        : (voice.name.includes('Male') || voice.name.includes('Daniel'))
    );
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 1;
    utterance.pitch = gender === 'female' ? 1.1 : 0.9;
    utterance.onstart = () => {
      setIsSpeaking(true);
      setSpokenText(text);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setSpokenText('');
      if (recognition.current && currentStep < questions.length) recognition.current.start();
    };
    synth.current.speak(utterance);
  };

  const handleUserResponse = (text) => {
    if (!text.trim()) return;
    if (isConfirming) {
      if (text.toLowerCase().includes('yes')) {
        setEditMode(true);
        setCurrentMessage("Review your responses below. Click to edit or say 'save' to finish.");
        speakText("Review your responses below. Click to edit or say 'save' to finish.");
      } else if (text.toLowerCase().includes('no')) {
        handleSave();
      }
      return;
    }
    
    if (editMode && text.toLowerCase().includes('save')) {
      handleSave();
      return;
    }

    const currentQuestion = questions[currentStep];
    setResponses(prev => ({ ...prev, [currentQuestion.field]: text }));
    setMedicalHistory(prev => ({
      ...prev,
      [currentQuestion.field]: text.split(',').map(item => item.trim())
    }));
    setCurrentStep(prev => prev + 1);
    setLastUserResponse('');
  };

  const handleSave = () => {
    const formattedHistory = { ...medicalHistory, currentSymptoms: responses.currentSymptoms || '' };
    speakText("Thank you, your medical history has been saved.");
    setCurrentMessage("Thank you, your medical history has been saved.");
    if (onComplete) setTimeout(() => onComplete(formattedHistory), 2000);
  };

  const handleEdit = (field) => {
    setCurrentStep(questions.findIndex(q => q.field === field));
    setCurrentMessage(`Please update your ${field}`);
    speakText(`Please update your ${field}`);
    setEditMode(false);
  };

  const handleSkip = () => {
    if (recognition.current) recognition.current.stop();
    setCurrentStep(prev => prev + 1);
    setLastUserResponse('');
  };

  const handleReplay = () => {
    if (currentStep < questions.length) speakText(questions[currentStep].text);
  };

  const handleManualResponse = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const response = formData.get('response');
    if (response) {
      handleUserResponse(response);
      e.target.reset();
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-md overflow-hidden ${className}`}>
      <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <h2 className="text-xl font-bold">Medical History Collection</h2>
        <p className="text-sm opacity-80">Please answer the questions</p>
      </div>
      
      <div className="p-6">
        <div className="h-64 w-full rounded-lg overflow-hidden bg-gray-100 mb-6 relative flex">
          <div className="w-1/2">
            <Canvas>
              <ambientLight intensity={0.5} />
              <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
              <OrbitControls enableZoom={false} enablePan={false} />
              <Avatar gender={gender} isSpeaking={isSpeaking} spokenText={spokenText} />
            </Canvas>
          </div>
          <div className="w-1/2 p-4 flex items-center">
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-gray-800 text-sm"
            >
              {spokenText}
            </motion.p>
          </div>
          {lastUserResponse && !isSpeaking && (
            <motion.div 
              className="speech-bubble"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              {lastUserResponse}
            </motion.div>
          )}
        </div>
        
        <div className="mb-6">
          <div className={`p-4 rounded-lg ${isSpeaking ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
            <motion.p 
              key={currentMessage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-gray-800"
            >
              {currentMessage}
            </motion.p>
            {isSpeaking && (
              <div className="flex space-x-1 mt-2">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
              </div>
            )}
          </div>
          
          {currentStep <= questions.length && (
            <form onSubmit={handleManualResponse} className="mt-4">
              <div className="flex">
                <input
                  type="text"
                  name="response"
                  value={isSpeaking ? spokenText : lastUserResponse}
                  onChange={(e) => !isSpeaking && setLastUserResponse(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-l-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={isSpeaking ? "I'm speaking..." : "Type your response..."}
                  disabled={isSpeaking}
                />
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded-r-lg hover:bg-blue-700 transition disabled:bg-gray-400"
                  disabled={isSpeaking}
                >
                  Submit
                </button>
              </div>
            </form>
          )}
          
          {editMode && (
            <div className="mt-4 p-4 bg-gray-100 rounded-lg">
              <h3 className="font-semibold mb-2">Your Responses (Click to Edit):</h3>
              {Object.entries(responses).map(([key, value]) => (
                <div key={key} className="text-sm mb-1 flex items-center">
                  <button 
                    onClick={() => handleEdit(key)}
                    className="text-blue-600 hover:underline mr-2"
                  >
                    Edit
                  </button>
                  <span className="font-medium">{key}: </span>
                  <span>{value}</span>
                </div>
              ))}
              <button 
                onClick={handleSave}
                className="mt-2 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Save All
              </button>
            </div>
          )}
        </div>
        
        <div className="flex justify-between">
          <button onClick={handleReplay} className="text-blue-600 hover:underline flex items-center text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            Replay
          </button>
          {!isConfirming && currentStep < questions.length && (
            <button onClick={handleSkip} className="text-gray-500 hover:underline text-sm">Skip</button>
          )}
        </div>
        
        <div className="mt-6">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span>{Math.min(currentStep, questions.length)}/{questions.length}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-500" 
              style={{ width: `${(Math.min(currentStep, questions.length) / questions.length) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Avatar = ({ gender, isSpeaking, spokenText }) => {
  const groupRef = useRef();
  const mouthRef = useRef();
  
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.002;
    }
    if (mouthRef.current) {
      if (isSpeaking) {
        const time = state.clock.getElapsedTime();
        mouthRef.current.scale.y = 1 + Math.sin(time * 8) * 0.2;
      } else {
        mouthRef.current.scale.y = 1;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Head */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial 
          color={gender === 'female' ? '#ffe4e1' : '#f0e6d2'} 
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.3, 0.3, 0.9]}>
        <sphereGeometry args={[0.12, 32, 32]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[-0.3, 0.3, 0.95]}>
        <sphereGeometry args={[0.06, 32, 32]} />
        <meshStandardMaterial color={gender === 'female' ? '#0066cc' : '#4a2f1a'} />
      </mesh>
      <mesh position={[0.3, 0.3, 0.9]}>
        <sphereGeometry args={[0.12, 32, 32]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.3, 0.3, 0.95]}>
        <sphereGeometry args={[0.06, 32, 32]} />
        <meshStandardMaterial color={gender === 'female' ? '#0066cc' : '#4a2f1a'} />
      </mesh>

      {/* Eyebrows */}
      <mesh position={[-0.3, 0.45, 0.9]} rotation={[0, 0, Math.PI / 6]}>
        <boxGeometry args={[0.3, 0.05, 0.02]} />
        <meshStandardMaterial color="#4a2f1a" />
      </mesh>
      <mesh position={[0.3, 0.45, 0.9]} rotation={[0, 0, -Math.PI / 6]}>
        <boxGeometry args={[0.3, 0.05, 0.02]} />
        <meshStandardMaterial color="#4a2f1a" />
      </mesh>

      {/* Nose */}
      <mesh position={[0, 0, 1]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.1, 0.3, 32]} />
        <meshStandardMaterial 
          color={gender === 'female' ? '#ffe4e1' : '#f0e6d2'} 
          roughness={0.3}
        />
      </mesh>

      {/* Mouth */}
      <mesh ref={mouthRef} position={[0, -0.3, 0.9]}>
        <torusGeometry args={[0.2, 0.05, 16, 32, Math.PI]} />
        <meshStandardMaterial color="#ff6b6b" />
      </mesh>

      {/* Hair */}
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[1.1, 64, 64, 0, Math.PI * 2, 0, Math.PI/1.5]} />
        <meshStandardMaterial 
          color={gender === 'female' ? '#8b4513' : '#4a2f1a'} 
          roughness={0.7}
          metalness={0.2}
        />
      </mesh>

      {/* Ears */}
      <mesh position={[-1.05, 0, 0]}>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshStandardMaterial 
          color={gender === 'female' ? '#ffe4e1' : '#f0e6d2'} 
          roughness={0.3}
        />
      </mesh>
      <mesh position={[1.05, 0, 0]}>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshStandardMaterial 
          color={gender === 'female' ? '#ffe4e1' : '#f0e6d2'} 
          roughness={0.3}
        />
      </mesh>
    </group>
  );
};

export default MedicalAvatar;
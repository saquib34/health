// src/pages/HealthAssessment.jsx - Updated with API integration
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Heart, FileText, MessageCircle, BarChart3, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';

import Navbar from '../components/Navbar';
import HeartRateMonitor from '../components/HeartRateMonitor';
import MedicalAvatar from '../components/MedicalAvatar';
import BiomedicalAnalysis from '../components/BiomedicalAnalysis';
import MedicalChatSystem from '../components/MedicalChatSystem';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { useAssistant } from '../context/AssistantContext';

// Import API services
import { 
  medicalHistoryAPI, 
  vitalSignsAPI, 
  documentAnalysisAPI, 
  healthAssessmentAPI
} from '../services/api';

const HealthAssessment = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { speak, displayMessage } = useAssistant();
  
  const [activeSection, setActiveSection] = useState(null);
  const [assessmentState, setAssessmentState] = useState('initial'); // initial, collecting, analyzing, complete
  const [medicalHistory, setMedicalHistory] = useState(null);
  const [vitalSigns, setVitalSigns] = useState({ heartRate: null });
  const [documentAnalysis, setDocumentAnalysis] = useState(null);
  const [diagnosisResult, setDiagnosisResult] = useState(null);
  const [suggestedDoctor, setSuggestedDoctor] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { duration: 0.5, staggerChildren: 0.2 }
    }
  };
  
  const cardVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { duration: 0.4 }
    }
  };
  
  // Welcome user on page load
  useEffect(() => {
    const greeting = `Welcome to your comprehensive health assessment, ${user?.name || 'there'}. We'll collect various health data to provide you with personalized medical guidance.`;
    displayMessage(greeting);
    speak(greeting);
    
    // Start with medical history collection
    setActiveSection('medical-history');
    setAssessmentState('collecting');
  }, []);
  
  // Set suggested doctor when diagnosis is available
  useEffect(() => {
    if (diagnosisResult && !suggestedDoctor) {
      matchDoctorForDiagnosis(diagnosisResult);
    }
  }, [diagnosisResult]);
  
  // Update vital signs when heart rate changes
  const handleHeartRateUpdate = async (heartRate) => {
    try {
      const newVitalSigns = { ...vitalSigns, heartRate };
      setVitalSigns(newVitalSigns);
      
      // Save to API
      await vitalSignsAPI.saveVitalSigns(newVitalSigns);
    } catch (error) {
      console.error('Error saving heart rate:', error);
      // Continue even if API call fails
    }
  };
  
  // Handle completion of medical history collection
  const handleMedicalHistoryComplete = async (historyData) => {
    try {
      setMedicalHistory(historyData);
      
      // Save to API
      await medicalHistoryAPI.saveMedicalHistory(historyData);
      
      displayMessage("Thank you for providing your medical history. Now let's check your heart rate.");
      speak("Thank you for providing your medical history. Now let's check your heart rate using your camera.");
      
      // Move to vital signs monitoring
      setActiveSection('vital-signs');
    } catch (error) {
      console.error('Error saving medical history:', error);
      toast.error('Failed to save medical history. Please try again.');
    }
  };
  
  // Handle completion of document analysis
  const handleAnalysisComplete = async (analysisResults) => {
    try {
      setDocumentAnalysis(analysisResults);
      
      // In a real app, this would be saved to the backend
      // The analysis results are already saved when the document is analyzed
      
      displayMessage("Your medical documents have been analyzed. Now let's discuss your current health concerns.");
      speak("Your medical documents have been analyzed. Now let's discuss your current health concerns in more detail.");
      
      // Move to AI consultation
      setActiveSection('ai-consultation');
    } catch (error) {
      console.error('Error processing document analysis:', error);
      toast.error('Failed to process analysis results. Please try again.');
    }
  };
  
  // Handle completion of AI consultation and diagnosis
  const handleDiagnosisComplete = async (diagnosisData) => {
  try {
    // Normalize diagnosisData to ensure possibleConditions is an array
    const normalizedData = {
      ...diagnosisData,
      possibleConditions: Array.isArray(diagnosisData?.possibleConditions)
        ? diagnosisData.possibleConditions
        : []
    };
    setDiagnosisResult(normalizedData);
    setAssessmentState('analyzing');

    displayMessage("Analyzing your health data to provide a comprehensive assessment...");
    speak("I'm analyzing all your health data now to provide a comprehensive assessment. This will take just a moment.");

    // Complete the full assessment with normalized data
    await completeHealthAssessment(normalizedData);
  } catch (error) {
    console.error('Error processing diagnosis:', error);
    toast.error('Failed to process diagnosis. Please try again.');
  }
};
  
  // Complete the health assessment process
  const completeHealthAssessment = async (diagnosisData) => {
    try {
      setIsSubmitting(true);
      
      // Prepare assessment data
      const assessmentData = {
        medicalHistory,
        vitalSigns,
        documentAnalysis,
        aiConsultation: diagnosisData
      };
      
      // Send to API
      const result = await healthAssessmentAPI.completeAssessment(assessmentData);
      
      // Set diagnosis result and suggested doctor
      if (result.recommended_doctors && result.recommended_doctors.length > 0) {
        setSuggestedDoctor(result.recommended_doctors[0]);
      }
      
      setAssessmentState('complete');
      
      displayMessage("Based on your assessment, we've identified potential health concerns and matched you with an appropriate specialist.");
      speak("Based on your assessment, we've identified potential health concerns and matched you with an appropriate specialist. Please review your assessment summary.");
    } catch (error) {
      console.error('Error completing health assessment:', error);
      toast.error('Failed to complete health assessment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Match doctor based on diagnosis
  const matchDoctorForDiagnosis = (diagnosis) => {
    // Extract recommended specialist type from diagnosis
    const neededSpecialty = diagnosis.recommendedSpecialists?.[0]?.specialty || 'General Practitioner';
    
    // Find matching doctors - in a real app, this would be an API call
    // For now, we'll use sample data
    const doctorDatabase = [
      { id: 'dr-1', name: 'Dr. Sharma', specialty: 'General Practitioner', experience: '15 years', rating: 4.9, availability: ['2025-03-03', '2025-03-04', '2025-03-05'] },
      { id: 'dr-2', name: 'Dr. Patel', specialty: 'Cardiologist', experience: '12 years', rating: 4.8, availability: ['2025-03-04', '2025-03-06', '2025-03-07'] },
      { id: 'dr-3', name: 'Dr. Gupta', specialty: 'Pulmonologist', experience: '10 years', rating: 4.7, availability: ['2025-03-02', '2025-03-05', '2025-03-08'] },
      { id: 'dr-4', name: 'Dr. Khan', specialty: 'Neurologist', experience: '18 years', rating: 4.9, availability: ['2025-03-03', '2025-03-07', '2025-03-09'] },
      { id: 'dr-5', name: 'Dr. Reddy', specialty: 'Dermatologist', experience: '8 years', rating: 4.6, availability: ['2025-03-02', '2025-03-04', '2025-03-06'] },
      { id: 'dr-6', name: 'Dr. Singh', specialty: 'ENT Specialist', experience: '14 years', rating: 4.8, availability: ['2025-03-03', '2025-03-05', '2025-03-08'] }
    ];
    
    // Find matching doctors
    const matchingDoctors = doctorDatabase.filter(doctor => 
      doctor.specialty === neededSpecialty || doctor.specialty === 'General Practitioner'
    );
    
    // Sort by rating
    const sortedDoctors = [...matchingDoctors].sort((a, b) => b.rating - a.rating);
    
    // Select top match
    if (sortedDoctors.length > 0) {
      setSuggestedDoctor(sortedDoctors[0]);
    }
  };
  
  // Book appointment with suggested doctor
  const bookAppointment = async () => {
    try {
      setIsSubmitting(true);
      
      // In a real app, this would be an API call
      // For now, we'll simulate the API call
      
      // Prepare appointment data
      const appointmentData = {
        doctor_id: suggestedDoctor.id,
        date: suggestedDoctor.availability[0],
        time: "10:00 AM",
        reason: diagnosisResult.possibleConditions?.[0]?.name || "General consultation"
      };
      
      // Send to API - commented out for demo
      // const result = await appointmentAPI.bookAppointment(appointmentData);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      displayMessage("Your appointment has been booked successfully!");
      speak("Your appointment has been booked successfully! You'll receive a confirmation email shortly.");
      toast.success("Appointment booked successfully!");
      
      // Navigate to appointments page
      setTimeout(() => {
        navigate('/appointments');
      }, 2000);
    } catch (error) {
      console.error('Error booking appointment:', error);
      toast.error('Failed to book appointment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Helper to format diagnostic findings for display
  const formatCondition = (condition) => {
    let severityClass = 'text-green-600 bg-green-100';
    if (condition.severity > 7) {
      severityClass = 'text-red-600 bg-red-100';
    } else if (condition.severity > 4) {
      severityClass = 'text-yellow-600 bg-yellow-100';
    }
    
    return {
      name: condition.name,
      probability: `${Math.round(condition.probability * 100)}%`,
      severityText: `${condition.severity}/10`,
      severityClass
    };
  };
  
  // Toggle section visibility
  const toggleSection = (section) => {
    if (activeSection === section) {
      setActiveSection(null);
    } else {
      setActiveSection(section);
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <Navbar />
      
      <motion.div
        className="container mx-auto px-4 py-6 max-w-5xl"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
            Comprehensive Health Assessment
          </h1>
          <p className="text-gray-600 mt-1">
            Complete your assessment to receive personalized medical guidance
          </p>
        </div>
        
        {/* Assessment progress indicator */}
        <motion.div 
          className="bg-white rounded-xl shadow-sm p-5 mb-6"
          variants={cardVariants}
        >
          <div className="mb-2 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Assessment Progress</h2>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              assessmentState === 'complete' 
                ? 'bg-green-100 text-green-800' 
                : assessmentState === 'analyzing'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-blue-100 text-blue-800'
            }`}>
              {assessmentState === 'initial' && 'Not Started'}
              {assessmentState === 'collecting' && 'In Progress'}
              {assessmentState === 'analyzing' && 'Analyzing Data'}
              {assessmentState === 'complete' && 'Complete'}
            </span>
          </div>
          
          <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-700" 
              style={{ 
                width: assessmentState === 'initial' ? '0%' 
                     : assessmentState === 'collecting' ? '40%' 
                     : assessmentState === 'analyzing' ? '80%' 
                     : '100%' 
              }}
            ></div>
          </div>
          
          <div className="flex flex-wrap gap-4 mt-4">
            <div className={`flex items-center ${medicalHistory ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-5 h-5 rounded-full mr-2 flex items-center justify-center ${medicalHistory ? 'bg-green-100' : 'bg-gray-100'}`}>
                {medicalHistory ? '✓' : '1'}
              </div>
              <span className="text-sm">Medical History</span>
            </div>
            
            <div className={`flex items-center ${vitalSigns.heartRate ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-5 h-5 rounded-full mr-2 flex items-center justify-center ${vitalSigns.heartRate ? 'bg-green-100' : 'bg-gray-100'}`}>
                {vitalSigns.heartRate ? '✓' : '2'}
              </div>
              <span className="text-sm">Vital Signs</span>
            </div>
            
            <div className={`flex items-center ${documentAnalysis ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-5 h-5 rounded-full mr-2 flex items-center justify-center ${documentAnalysis ? 'bg-green-100' : 'bg-gray-100'}`}>
                {documentAnalysis ? '✓' : '3'}
              </div>
              <span className="text-sm">Document Analysis</span>
            </div>
            
            <div className={`flex items-center ${diagnosisResult ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-5 h-5 rounded-full mr-2 flex items-center justify-center ${diagnosisResult ? 'bg-green-100' : 'bg-gray-100'}`}>
                {diagnosisResult ? '✓' : '4'}
              </div>
              <span className="text-sm">AI Consultation</span>
            </div>
          </div>
        </motion.div>
        
        {/* Medical History Collection */}
        <motion.div variants={cardVariants}>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
            <div 
              className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleSection('medical-history')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">Medical History</h2>
                    <p className="text-sm text-gray-500">
                      {medicalHistory 
                        ? 'Your medical history has been recorded' 
                        : 'Answer questions about your health history'}
                    </p>
                  </div>
                </div>
                
                <div>
                  {activeSection === 'medical-history' ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>
            </div>
            
            {activeSection === 'medical-history' && (
              <div className="border-t border-gray-100 p-5">
                <MedicalAvatar
                  gender={user?.gender || 'female'}
                  onComplete={handleMedicalHistoryComplete}
                />
              </div>
            )}
          </div>
        </motion.div>
        
        {/* Vital Signs Monitoring */}
        <motion.div variants={cardVariants}>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
            <div 
              className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleSection('vital-signs')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mr-3">
                    <Heart className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">Heart Rate Monitoring</h2>
                    <p className="text-sm text-gray-500">
                      {vitalSigns.heartRate
                        ? `Current heart rate: ${vitalSigns.heartRate} BPM`
                        : 'Monitor your heart rate using your webcam'}
                    </p>
                  </div>
                </div>
                
                <div>
                  {activeSection === 'vital-signs' ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>
            </div>
            
            {activeSection === 'vital-signs' && (
              <div className="border-t border-gray-100 p-5">
                <HeartRateMonitor
                  onHeartRateUpdate={handleHeartRateUpdate}
                />
              </div>
            )}
          </div>
        </motion.div>
        
        {/* Document Analysis */}
        <motion.div variants={cardVariants}>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
            <div 
              className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleSection('document-analysis')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mr-3">
                    <BarChart3 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">Medical Document Analysis</h2>
                    <p className="text-sm text-gray-500">
                      {documentAnalysis
                        ? 'Documents analyzed successfully'
                        : 'Upload blood reports or X-rays for AI analysis'}
                    </p>
                  </div>
                </div>
                
                <div>
                  {activeSection === 'document-analysis' ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>
            </div>
            
            {activeSection === 'document-analysis' && (
              <div className="border-t border-gray-100 p-5">
                <BiomedicalAnalysis
                  onAnalysisComplete={handleAnalysisComplete}
                />
              </div>
            )}
          </div>
        </motion.div>
        
        {/* AI Medical Consultation */}
        <motion.div variants={cardVariants}>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
            <div 
              className="p-5 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleSection('ai-consultation')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center mr-3">
                    <MessageCircle className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">AI Medical Consultation</h2>
                    <p className="text-sm text-gray-500">
                      {diagnosisResult
                        ? 'Consultation complete'
                        : 'Discuss your health concerns with our medical AI'}
                    </p>
                  </div>
                </div>
                
                <div>
                  {activeSection === 'ai-consultation' ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>
            </div>
            
            {activeSection === 'ai-consultation' && (
              <div className="border-t border-gray-100 p-5">
                <MedicalChatSystem
                  patientData={user}
                  medicalHistory={medicalHistory}
                  vitalSigns={vitalSigns}
                  onDiagnosisComplete={handleDiagnosisComplete}
                />
              </div>
            )}
          </div>
        </motion.div>
        
        {/* Assessment Results and Doctor Recommendation */}
        {assessmentState === 'complete' && (
          <motion.div 
            className="bg-white rounded-xl shadow-sm overflow-hidden mb-6"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
          >
            <div className="p-5 bg-gradient-to-r from-green-600 to-teal-600 text-white">
              <h2 className="text-xl font-bold">Assessment Complete</h2>
              <p className="text-sm opacity-80">
                Here's our analysis of your health condition
              </p>
            </div>
            
            <div className="p-6">
              {diagnosisResult && (
                <div className="space-y-6">
                  {/* Potential Conditions */}
                  <div>
                    <h3 className="text-lg font-medium text-gray-800 mb-3">Potential Conditions</h3>
                    <div className="space-y-3">
                      {diagnosisResult.possibleConditions.map((condition, index) => {
                        const formattedCondition = formatCondition(condition);
                        return (
                          <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                            <div className="flex items-center">
                              <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
                              <span className="font-medium text-gray-800">{formattedCondition.name}</span>
                            </div>
                            <div className="flex items-center space-x-3">
                              <span className="text-sm text-gray-500">Probability: {formattedCondition.probability}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs ${formattedCondition.severityClass}`}>
                                Severity: {formattedCondition.severityText}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Recommendations */}
                  <div>
                    <h3 className="text-lg font-medium text-gray-800 mb-3">Recommendations</h3>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                      <h4 className="font-medium text-blue-800 mb-2">Suggested Tests</h4>
                      <ul className="list-disc pl-5 mb-4 text-blue-800">
                        {/* {diagnosisResult.recommendedTests.map((test, index) => (
                          <li key={index}>{test}</li>
                        ))} */}
                      </ul>
                      
                      <h4 className="font-medium text-blue-800 mb-2">Treatment Plan</h4>
                      <ul className="list-disc pl-5 text-blue-800">
                        {/* {diagnosisResult.treatmentRecommendations.map((rec, index) => (
                          <li key={index}>{rec}</li>
                        ))} */}
                      </ul>
                    </div>
                  </div>
                  
                  {/* Disclaimer */}
                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-100 flex items-start">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-yellow-800">
                    {diagnosisResult ? (
    <pre style={{ 
      background: '#f5f5f5',
      padding: '1rem',
      borderRadius: '4px',
      whiteSpace: 'pre-wrap'
    }}>
      {JSON.stringify(diagnosisResult, null, 2)}
    </pre>
  ) : (
    <p>No data available</p>
  )} This assessment is AI-generated and for informational purposes only. 
                      It is not a substitute for professional medical advice, diagnosis, or treatment.
                      Always consult with a qualified healthcare provider for medical concerns.
                    </p>
                  </div>
                  
                  {/* Doctor Recommendation */}
                  {/* {suggestedDoctor && (
                    <div>
                      <h3 className="text-lg font-medium text-gray-800 mb-3">Recommended Doctor</h3>
                      <div className="bg-white border rounded-lg p-4">
                        <div className="flex items-center">
                          <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mr-4 text-2xl font-bold text-indigo-600">
                            {suggestedDoctor.name.charAt(0)}
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900 text-lg">{suggestedDoctor.name}</h4>
                            <p className="text-sm text-gray-500">{suggestedDoctor.specialty} • {suggestedDoctor.experience}</p>
                            <div className="flex items-center mt-1">
                              <div className="flex">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <svg key={i} className={`w-4 h-4 ${i < Math.floor(suggestedDoctor.rating) ? 'text-yellow-400' : 'text-gray-300'}`} fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                ))}
                              </div>
                              <span className="text-sm text-gray-500 ml-1">{suggestedDoctor.rating}/5</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-4">
                          <h5 className="text-sm font-medium text-gray-700 mb-2">Available Appointments</h5>
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {suggestedDoctor.availability.map((date, index) => (
                              <button 
                                key={index}
                                className="px-3 py-1 border border-indigo-200 rounded-lg text-sm text-indigo-700 bg-indigo-50 whitespace-nowrap hover:bg-indigo-100 transition-colors"
                              >
                                {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        <div className="mt-4 flex justify-end">
                          <Button
                            onClick={bookAppointment}
                            loading={isSubmitting}
                          >
                            Book Appointment
                          </Button>
                        </div>
                      </div>
                    </div>
                  )} */}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default HealthAssessment;
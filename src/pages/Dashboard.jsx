// src/pages/Dashboard.jsx
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Calendar, Clipboard, Users, Activity, Clock, AlertCircle, Stethoscope, FileText, Heart, FileImage } from 'lucide-react';
import { toast } from 'react-toastify';

import { useAssistant } from '../context/AssistantContext';
import { useAuth } from '../context/AuthContext';
import { userAPI, vitalSignsAPI, medicalHistoryAPI } from '../services/api';
import Navbar from '../components/Navbar';
import DashboardCard from '../components/DashboardCard';
import AppointmentItem from '../components/AppointmentItem';
import Button from '../components/Button';

const Dashboard = () => {
  const navigate = useNavigate();
  const { speak, displayMessage } = useAssistant();
  const { user } = useAuth();
  
  const [healthMetrics, setHealthMetrics] = useState({
    heartRate: 78,
    bloodPressure: '120/80',
    oxygenLevel: 98,
    temperature: 98.6
  });
  
  const [appointments, setAppointments] = useState([]);
  const [medications, setMedications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMedicalHistory, setHasMedicalHistory] = useState(false);
  const [hasRecentVitals, setHasRecentVitals] = useState(false);
  const [hasRecentAssessment, setHasRecentAssessment] = useState(false);
  const [assessmentRecommended, setAssessmentRecommended] = useState(false);
  
  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        duration: 0.5,
        when: "beforeChildren",
        staggerChildren: 0.1
      }
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.3 }
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
  
  // Load user data on component mount
  useEffect(() => {
    const loadUserData = async () => {
      setIsLoading(true);
      
      try {
        // Get user profile with medical data
        const { data } = await userAPI.getProfile();
        
        // Check if there is medical history
        setHasMedicalHistory(data?.medical_history != null);
        
        // Check if there are recent vital signs
        const hasVitals = data?.vital_signs != null && 
          new Date(data.vital_signs.recorded_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
        setHasRecentVitals(hasVitals);
        
        // Check if there is a recent assessment
        const hasAssessment = data?.health_assessments && data.health_assessments.length > 0 &&
          new Date(data.health_assessments[0].created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
        setHasRecentAssessment(hasAssessment);
        
        // Set recommendation for health assessment
        setAssessmentRecommended(!hasAssessment || !hasVitals);
        
        // Update health metrics if available
        if (data?.vital_signs) {
          setHealthMetrics({
            heartRate: data.vital_signs.heartRate || healthMetrics.heartRate,
            bloodPressure: data.vital_signs.bloodPressure || healthMetrics.bloodPressure,
            oxygenLevel: data.vital_signs.oxygenLevel || healthMetrics.oxygenLevel,
            temperature: data.vital_signs.temperature || healthMetrics.temperature
          });
        }
        
        // Set appointments if available
        if (data?.appointments && data.appointments.length > 0) {
          setAppointments(data.appointments);
        } else {
          // Fallback to demo data
          setAppointments([
            {
              id: 'apt1',
              doctor: 'Dr. Sharma',
              specialty: 'Cardiology',
              date: '2025-03-05',
              time: '10:30 AM',
              status: 'upcoming'
            },
            {
              id: 'apt2',
              doctor: 'Dr. Patel',
              specialty: 'Dermatology',
              date: '2025-03-12',
              time: '2:15 PM',
              status: 'upcoming'
            }
          ]);
        }
        
        // Set medications if available
        if (data?.medications && data.medications.length > 0) {
          setMedications(data.medications);
        } else {
          // Fallback to demo data
          setMedications([
            {
              id: 'med1',
              name: 'Amoxicillin',
              dosage: '500mg',
              frequency: 'Twice daily',
              remaining: 6
            },
            {
              id: 'med2',
              name: 'Metformin',
              dosage: '1000mg',
              frequency: 'With meals',
              remaining: 12
            }
          ]);
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        toast.error('Failed to load your health data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadUserData();
  }, []);
  
  // Greet user on dashboard load
  useEffect(() => {
    if (!isLoading) {
      // Greet user on dashboard load
      const greeting = getGreeting();
      const message = `${greeting}, ${user?.name || 'there'}! Welcome to your HealthAI dashboard.`;
      
      displayMessage(message);
      
      // Add health assessment recommendation if needed
      if (assessmentRecommended) {
        setTimeout(() => {
          speak(message + " I notice it's been a while since your last health assessment. Would you like to start a new one today?");
        }, 1000);
      } else {
        speak(message + " Here you can see your upcoming appointments, medications, and health metrics. Is there anything specific I can help you with today?");
      }
    }
  }, [isLoading, assessmentRecommended]);
  
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };
  
  const handleCardClick = (destination) => {
    navigate(destination);
  };
  
  const handleStartHealthAssessment = () => {
    navigate('/health-assessment');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <Navbar />
      
      <motion.div 
        className="container mx-auto px-4 py-6 max-w-5xl"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
              {getGreeting()}, {user?.name || 'there'}!
            </h1>
            <p className="text-gray-600 mt-1">
              Here's an overview of your health status
            </p>
          </div>
          
          <motion.div 
            className="mt-4 md:mt-0 bg-white p-3 rounded-xl shadow-sm flex items-center"
            variants={cardVariants}
          >
            <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
            <span className="text-gray-700 text-sm font-medium">Your next appointment: </span>
            <span className="text-blue-600 text-sm font-medium ml-1">
              {appointments[0]?.date ? new Date(appointments[0].date).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric'
              }) : 'No upcoming'} 
              {appointments[0]?.time ? ` at ${appointments[0].time}` : ''}
            </span>
          </motion.div>
        </div>
        
        {/* Health Assessment Card - Prominent if recommended */}
        {assessmentRecommended && (
          <motion.div
            className="mb-8"
            variants={cardVariants}
          >
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl shadow-md overflow-hidden">
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                    <Stethoscope className="w-6 h-6 text-white" />
                  </div>
                  <div className="bg-white bg-opacity-20 rounded-full px-3 py-1 text-xs text-white font-medium">
                    Recommended
                  </div>
                </div>
                
                <h3 className="mt-4 text-xl font-bold text-white">Comprehensive Health Assessment</h3>
                <p className="mt-1 text-white text-opacity-80">
                  {!hasRecentAssessment 
                    ? "It's been a while since your last assessment. Get an updated evaluation of your health."
                    : !hasRecentVitals 
                      ? "Your vital signs need to be updated. Start an assessment to track your health metrics."
                      : "Regular health monitoring keeps you informed about your wellbeing."}
                </p>
                
                <div className="mt-4">
                  <Button
                    className="bg-white text-indigo-600 hover:bg-gray-100"
                    onClick={handleStartHealthAssessment}
                  >
                    Start Assessment
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Regular Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <motion.div variants={cardVariants}>
            <DashboardCard
              title="Appointments"
              value={appointments.filter(a => a.status === 'upcoming').length.toString()}
              label="Upcoming"
              icon={<Calendar className="w-6 h-6 text-blue-500" />}
              onClick={() => handleCardClick('/appointments')}
              trend="neutral"
            />
          </motion.div>
          
          <motion.div variants={cardVariants}>
            <DashboardCard
              title="Medical Records"
              value="3"
              label="Recent reports"
              icon={<Clipboard className="w-6 h-6 text-purple-500" />}
              onClick={() => handleCardClick('/medical-records')}
              trend="up"
              trendValue="1 new"
            />
          </motion.div>
          
          <motion.div variants={cardVariants}>
            <DashboardCard
              title="Prescriptions"
              value={medications.length.toString()}
              label="Active medications"
              icon={<FileText className="w-6 h-6 text-green-500" />}
              onClick={() => handleCardClick('/prescriptions')}
              trend="neutral"
            />
          </motion.div>
          
          <motion.div variants={cardVariants}>
            <DashboardCard
              title="Doctors"
              value="8"
              label="Specialists available"
              icon={<Users className="w-6 h-6 text-orange-500" />}
              onClick={() => handleCardClick('/doctors')}
              trend="up"
              trendValue="2 new"
            />
          </motion.div>
        </div>
        
        {/* Health Assessment Card - Normal position if not urgent */}
        {!assessmentRecommended && (
          <motion.div variants={cardVariants} className="mb-8">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-indigo-100">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center mr-3">
                    <Stethoscope className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">Health Assessment</h3>
                    <p className="text-sm text-gray-500">
                      Your last assessment was {hasRecentAssessment ? 'recent' : 'over 30 days ago'}
                    </p>
                  </div>
                </div>
                
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outline"
                    onClick={handleStartHealthAssessment}
                  >
                    Start New Assessment
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div 
            className="lg:col-span-2"
            variants={cardVariants}
          >
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Upcoming Appointments</h2>
                <button 
                  className="text-blue-600 text-sm font-medium flex items-center hover:text-blue-700"
                  onClick={() => handleCardClick('/appointments')}
                >
                  View all <ArrowUpRight className="w-4 h-4 ml-1" />
                </button>
              </div>
              
              <div className="space-y-3">
                {appointments.length > 0 ? (
                  appointments.map(appointment => (
                    <AppointmentItem 
                      key={appointment.id}
                      appointment={appointment}
                    />
                  ))
                ) : (
                  <div className="text-center py-6">
                    <p className="text-gray-500">No upcoming appointments</p>
                    <button 
                      className="mt-2 text-blue-600 font-medium text-sm"
                      onClick={() => handleCardClick('/appointments')}
                    >
                      Schedule an appointment
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
          
          <motion.div variants={cardVariants}>
            <div className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Health Metrics</h2>
                <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                  {hasRecentVitals ? 'Updated recently' : 'Needs update'}
                </span>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mr-3">
                    <Heart className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <div className="flex items-center">
                      <span className="text-xl font-bold text-gray-800">{healthMetrics.heartRate}</span>
                      <span className="text-gray-500 text-sm ml-1">bpm</span>
                    </div>
                    <p className="text-sm text-gray-600">Heart Rate</p>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                    <AlertCircle className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <div className="flex items-center">
                      <span className="text-xl font-bold text-gray-800">{healthMetrics.bloodPressure}</span>
                      <span className="text-gray-500 text-sm ml-1">mmHg</span>
                    </div>
                    <p className="text-sm text-gray-600">Blood Pressure</p>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mr-3">
                    <Activity className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <div className="flex items-center">
                      <span className="text-xl font-bold text-gray-800">{healthMetrics.oxygenLevel}%</span>
                    </div>
                    <p className="text-sm text-gray-600">Oxygen Level</p>
                  </div>
                </div>
                
                <button 
                  className="w-full mt-2 py-2 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
                  onClick={() => handleCardClick('/health-assessment')}
                >
                  Update Health Metrics
                </button>
              </div>
            </div>
          </motion.div>
        </div>
        
        {/* Recent Medical Reports/Documents */}
        <motion.div 
          className="mt-6"
          variants={cardVariants}
        >
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Recent Medical Documents</h2>
              <button 
                className="text-blue-600 text-sm font-medium flex items-center hover:text-blue-700"
                onClick={() => handleCardClick('/medical-records')}
              >
                View all <ArrowUpRight className="w-4 h-4 ml-1" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 border rounded-lg flex items-center">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">Blood Test Results</p>
                  <p className="text-xs text-gray-500">Feb 15, 2025</p>
                </div>
              </div>
              
              <div className="p-3 border rounded-lg flex items-center">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center mr-3">
                  <FileImage className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">Chest X-Ray</p>
                  <p className="text-xs text-gray-500">Jan 28, 2025</p>
                </div>
              </div>
              
              <div className="p-3 border rounded-lg flex items-center">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mr-3">
                  <FileText className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">Annual Health Report</p>
                  <p className="text-xs text-gray-500">Jan 12, 2025</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Dashboard;
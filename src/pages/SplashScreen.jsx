// src/pages/SplashScreen.jsx
import React from 'react';
import { motion } from 'framer-motion';

const SplashScreen = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 to-indigo-600">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <div className="w-24 h-24 mb-6 mx-auto">
          <svg 
            viewBox="0 0 100 100" 
            className="w-full h-full stroke-white fill-none stroke-2"
          >
            <circle 
              cx="50" 
              cy="50" 
              r="40" 
              className="opacity-20" 
            />
            <motion.circle 
              cx="50" 
              cy="50" 
              r="40" 
              className="stroke-white" 
              strokeDasharray="251.2"
              strokeDashoffset="251.2"
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <motion.path 
              d="M35,50 L45,60 L65,40" 
              className="stroke-white" 
              strokeDasharray="50"
              strokeDashoffset="50"
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 1, delay: 0.5 }}
            />
          </svg>
        </div>
        <motion.h1 
          className="text-3xl font-bold text-white mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          HealthConnect
        </motion.h1>
        <motion.p 
          className="text-blue-100"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          Loading your healthcare assistant...
        </motion.p>
      </motion.div>
    </div>
  );
};

export default SplashScreen;
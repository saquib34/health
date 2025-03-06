// src/components/LoadingOverlay.jsx
import React from 'react';
import { motion } from 'framer-motion';

const LoadingOverlay = ({ message = 'Loading...', transparent = false }) => {
  return (
    <motion.div
      className={`fixed inset-0 flex items-center justify-center z-50 ${
        transparent ? 'bg-black bg-opacity-50' : 'bg-gradient-to-br from-blue-600 to-indigo-800'
      }`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="text-center p-8 rounded-xl bg-white bg-opacity-10 backdrop-blur-md">
        <div className="mb-6">
          <svg
            className="w-16 h-16 mx-auto text-white animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">{message}</h2>
        <p className="text-white text-opacity-80">
          Please wait while we set up your experience
        </p>
      </div>
    </motion.div>
  );
};

export default LoadingOverlay;
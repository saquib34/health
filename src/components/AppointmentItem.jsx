// src/components/AppointmentItem.jsx
import React from 'react';
import { Calendar, Clock, User } from 'lucide-react';

const AppointmentItem = ({ appointment }) => {
  // Format date
  const formatDate = (dateString) => {
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };
  
  return (
    <div className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between">
        <div className="flex items-start">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
            <User className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium text-gray-800">{appointment.doctor}</h3>
            <p className="text-sm text-gray-500">{appointment.specialty}</p>
          </div>
        </div>
        
        <div className="flex items-center mt-3 sm:mt-0">
          <div className="flex items-center mr-4">
            <Calendar className="w-4 h-4 text-gray-400 mr-1" />
            <span className="text-sm text-gray-600">{formatDate(appointment.date)}</span>
          </div>
          
          <div className="flex items-center">
            <Clock className="w-4 h-4 text-gray-400 mr-1" />
            <span className="text-sm text-gray-600">{appointment.time}</span>
          </div>
        </div>
      </div>
      
      <div className="mt-3 flex justify-between items-center">
        <div 
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            appointment.status === 'upcoming' 
              ? 'bg-blue-100 text-blue-700' 
              : appointment.status === 'completed'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700'
          }`}
        >
          {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
        </div>
        
        <button className="text-sm text-blue-600 font-medium hover:text-blue-700">
          {appointment.status === 'upcoming' ? 'Reschedule' : 'View details'}
        </button>
      </div>
    </div>
  );
};

export default AppointmentItem;
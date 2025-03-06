import React from 'react';
import { Loader } from 'lucide-react';

const Button = ({ 
  children, 
  className = '',
  variant = 'primary',
  type = 'button',
  disabled = false,
  loading = false,
  icon = null,
  iconPosition = 'left',
  onClick,
  ...props
}) => {
  // Define base styles
  const baseStyles = "font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2";
  
  // Define variant styles
  const variantStyles = {
    primary: "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:opacity-90 focus:ring-blue-500",
    secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-500",
    outline: "border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-400",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
    success: "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500",
  };
  
  // Define size styles
  const sizeStyles = "px-4 py-2 text-sm";
  
  // Combine styles
  const buttonStyles = `${baseStyles} ${variantStyles[variant]} ${sizeStyles} ${className}`;
  
  return (
    <button
      type={type}
      className={buttonStyles}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <div className="flex items-center justify-center">
          <Loader className="w-4 h-4 animate-spin mr-2" />
          <span>Loading...</span>
        </div>
      ) : (
        <div className="flex items-center justify-center">
          {icon && iconPosition === 'left' && (
            <span className="mr-2">{icon}</span>
          )}
          {children}
          {icon && iconPosition === 'right' && (
            <span className="ml-2">{icon}</span>
          )}
        </div>
      )}
    </button>
  );
};

export default Button;

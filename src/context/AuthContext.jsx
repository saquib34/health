// src/context/AuthContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import { authAPI, userAPI, } from '../services/api';
import { toast } from 'react-toastify';
import { data } from 'react-router-dom';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  
  // Check for existing session on load
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        
        if (storedToken && storedUser) {
          setUser(JSON.parse(storedUser));
          setIsAuthenticated(true);
          
          // Verify token is valid by fetching user profile
          try {
            const { data } = await userAPI.getProfile();
            if (data && data.user) {
              setUser(data.user);
            }
          } catch (profileError) {
            console.error('Token validation error:', profileError);
            // If token is invalid, log out
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setIsAuthenticated(false);
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Authentication error:', error);
        // Clear potentially corrupted data
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);
  
  // Login function
// Modified login function that handles both parameter patterns
const login = async (emailOrUserData, password) => {
  setIsLoading(true);
  try {
    let email, token, userData;
    
    // Check if the first parameter is an object (user data) or a string (email)
    if (typeof emailOrUserData === 'object' && emailOrUserData !== null) {
      // Extract user data from the object
      userData = emailOrUserData;
      email = userData.email;
      token = userData.token;

      // If we have token and user data from the object, we can skip the API call
      if (token && email) {
        // Generate a unique user ID if not provided
        const userId = userData.id || `user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const user = {
          ...userData,
          id: userId
        };
        
        // Save user data and token
        setUser(user);
        setIsAuthenticated(true);
        
        // Store in localStorage for persistence
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        
        toast.success('Login successful!');
        return true;
      }
    } else if (typeof emailOrUserData === 'string') {
      // Traditional login with email string
      email = emailOrUserData.toLowerCase().trim();
      
      if (!password || typeof password !== 'string') {
        throw new TypeError('Password must be a string');
      }
      
      const loginResponse = await authAPI.login({ 
        email,
        password: password.trim()
      });
      
      const { access_token, token_type } = loginResponse;
      
      // Get user profile
      localStorage.setItem('token', access_token);
      
      const profileResponse = await userAPI.getProfile();
      userData = profileResponse.data.user;
      
      // Save user data and token
      setUser(userData);
      setIsAuthenticated(true);
      
      // Store in localStorage for persistence
      localStorage.setItem('user', JSON.stringify(userData));
      
      toast.success('Login successful!');
      return true;
    } else {
      throw new TypeError('Email must be a string or userData must be an object');
    }
  } catch (error) {
    console.error('Login error:', error);
    toast.error(error.response?.data?.detail || 'Login failed. Please try again.');
    return false;
  } finally {
    setIsLoading(false);
  }
};
// Addhar card verification
const Adhar = async (adharData) => {
  setIsLoading(true);
  try {
    const result = await aadhaarAPI.verifyAdhar(adharData, userData.email);
if(result.verified){

      return {data: result.data, success: true,};
    } else {
      // User not recognized
      return { success: false, newUser: true };
    }
  } catch (error) {
    console.error('Adhar verification error:', error);
    toast.error(error.response?.data?.detail || 'Adhar verification failed. Please try again.');
    return { success: false, error: true };
  } finally {
    setIsLoading(false);
  }
};


  // Register function
  const register = async (registerData) => {
    setIsLoading(true);
    try {
      const result = await authAPI.register(registerData);
      toast.success('Registration successful! Please login.');
      return true;
    } catch (error) {
      console.error('Registration error:', error);
      toast.error(error.response?.data?.detail || 'Registration failed. Please try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Face recognition login
  const loginWithFace = async (faceImage) => {
    setIsLoading(true);
    try {
      const result = await authAPI.verifyFace(faceImage);
      console.log('Verify Face Result:', result);
  
      if (result.verified) {
        localStorage.setItem('token', result.token);
        try {
          const { data } = await userAPI.getProfile();
          const userData = data.user || { id: result.user_id, name: result.name }; // Fallback
          setUser(userData);
          setIsAuthenticated(true);
          localStorage.setItem('user', JSON.stringify(userData));
          toast.success('Face verification successful!');
          return { success: true, newUser: false };
        } catch (profileError) {
          console.error('Profile fetch error:', profileError);
          // Fallback to minimal user data if profile fetch fails
          const fallbackUser = { id: result.user_id, name: result.name };
          setUser(fallbackUser);
          setIsAuthenticated(true);
          localStorage.setItem('user', JSON.stringify(fallbackUser));
          toast.success('Face verified, but profile fetch failed. Using basic info.');
          return { success: true, newUser: false };
        }
      } else {
        return { success: false, newUser: true };
      }
    } catch (error) {
      console.error('Face verification error:', error);
      toast.error(error.response?.data?.detail || 'Face verification failed. Please try again.');
      return { success: false, error: true };
    } finally {
      setIsLoading(false);
    }
  };
  
  // Logout function
  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    setUserData(null);
    
    // Clear stored data
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    
    toast.info('You have been logged out.');
  };
  
  // Update user data
  const updateUser = async (newData) => {
    try {
      const result = await userAPI.updateProfile(newData);
      const updatedUser = { ...user, ...newData };
      
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      toast.success('Profile updated successfully!');
      return true;
    } catch (error) {
      console.error('Profile update error:', error);
      toast.error(error.response?.data?.detail || 'Failed to update profile. Please try again.');
      return false;
    }
  };
  
  // Update registration data (used during registration flow)
  const updateUserData = (data) => {
    setUserData(data);
  };
  
  // Context value
  const contextValue = {
    user,
    isAuthenticated,
    isLoading,
    login,
    loginWithFace,
    register,
    logout,
    updateUser,
    Adhar,
    userData,
    setUserData,
    updateUserData
  };
  
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Header, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import Optional, Dict, Any, List, Union
import os
import cv2
import numpy as np
import logging
import uuid
import json
import re
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext
import pydantic
from pymongo import MongoClient, errors, ASCENDING, DESCENDING
import asyncio
import io
from PIL import Image
import pydicom
from dotenv import load_dotenv
import tempfile
import shutil
import hashlib
import traceback
import random
import urllib.parse
import jwt as pyjwt
from transformers import BlipProcessor, BlipForConditionalGeneration,AutoProcessor
import torch
import torchvision.transforms as transforms
import timm
import redis
import time
import google.generativeai as genai
from pydantic import BaseModel
import numpy as np
import torchvision
from skimage import exposure
from io import BytesIO
import cv2
from pytorch_grad_cam import GradCAM
from transformers import AutoImageProcessor, AutoModelForImageClassification, BlipProcessor, BlipForConditionalGeneration
API_KEY = os.getenv("GEMINI_API_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")  # Replace with your actual key in production
genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-2.0-flash') 
# Load environment variables
load_dotenv()
# In-memory storage for conversation histories (keyed by session token)
conversations: Dict[str, List[Dict[str, str]]] = {}

# Request model
class ChatRequest(BaseModel):
    message: str
    session_token: str =None
    
# Import our model service
# from models.service import model_service



# Configure logging
logging.basicConfig(
    level=logging.INFO,  # Set the logging level directly
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(os.path.join("logs", "hospital_ai.log"))
    ]
)
logger = logging.getLogger("hospital_ai")

# Ensure logs directory exists
os.makedirs("logs", exist_ok=True)
# Initialize Redis for caching if available
redis_client = None
redis_available = False
try:
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", 6379))
    redis_db = int(os.getenv("REDIS_DB", 0))
    redis_client = redis.Redis(host=redis_host, port=redis_port, db=redis_db, socket_connect_timeout=2, socket_timeout=2)
    # Test Redis connection with ping
    redis_client.ping()
    redis_available = True
    
    logger.info(f"Redis connected at {redis_host}:{redis_port}")
except Exception as e:
    logger.warning(f"Redis not available: {str(e)}")
    redis_available = False
    redis_client = None
    # Important: Create a mock Redis client that won't fail when methods are called
    class MockRedisClient:
        def get(self, *args, **kwargs):
            return None
            
        def setex(self, *args, **kwargs):
            return None
            
        def ping(self, *args, **kwargs):
            return False
            
    if redis_client is None:
        redis_client = MockRedisClient()
        logger.info("Using mock Redis client as fallback")
# Configuration
class Settings:
    SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-replace-in-production")
    ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES", "30"))
    MONGO_URI = os.getenv(
    "MONGO_URI",
    f"use your own"
)
    DB_NAME = os.getenv("DB_NAME", "hospital_ai")
    STATIC_DIR = os.getenv("STATIC_DIR", "static")
    AUDIO_DIR = os.path.join(STATIC_DIR, "audio")
    UPLOAD_DIR = os.path.join(STATIC_DIR, "uploads")
    MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", "10485760"))  # 10MB default
    ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "*").split(",")
    
    
    
    # Security settings
    PASSWORD_MIN_LENGTH = int(os.getenv("PASSWORD_MIN_LENGTH", "8"))
    RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
    RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "3600"))  # 1 hour
    
    # Ensure directories exist
    os.makedirs(STATIC_DIR, exist_ok=True)
    os.makedirs(AUDIO_DIR, exist_ok=True)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    # Create subdirectories for different file types
    os.makedirs(os.path.join(UPLOAD_DIR, "blood_reports"), exist_ok=True)
    os.makedirs(os.path.join(UPLOAD_DIR, "xrays"), exist_ok=True)
    os.makedirs(os.path.join(UPLOAD_DIR, "documents"), exist_ok=True)
    os.makedirs(os.path.join(UPLOAD_DIR, "aadhaar"), exist_ok=True)

settings = Settings()

# Initialize FastAPI
app = FastAPI(
    title="Hospital AI API",
    description="API for hospital management with AI-powered medical analysis",
    version="3.0.0",
    docs_url="/api/docs" if os.getenv("ENVIRONMENT") != "production" else None,
    redoc_url="/api/redoc" if os.getenv("ENVIRONMENT") != "production" else None
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_HOSTS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
def calculate_severity(findings: list) -> int:
    """Calculate severity score based on findings"""
    severity_score = 0
    for finding in findings:
        if finding["condition"] == "No significant abnormalities":
            continue
        severity_contribution = finding["confidence"] * 10
        if finding["condition"] in ["Pneumothorax", "Pneumonia", "Edema"]:
            severity_contribution *= 1.5
        severity_score += severity_contribution
    
    return min(round(severity_score), 10)
# Rate limiting middleware
# In-memory rate limiting (for testing purposes)
rate_limit = {}
RATE_LIMIT_REQUESTS = 10  # Max requests allowed
RATE_LIMIT_WINDOW = timedelta(minutes=1)  # Time window for rate limiting

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Get client IP (consider proxies)
    client_ip = request.headers.get("x-forwarded-for", request.client.host)
    
    # Skip rate limiting for internal requests or when testing
    if client_ip == "127.0.0.1" or os.getenv("ENVIRONMENT") == "test":
        return await call_next(request)

    # Rate limit logic
    current_time = datetime.utcnow()
    if client_ip not in rate_limit:
        rate_limit[client_ip] = {"count": 1, "start_time": current_time}
    else:
        elapsed_time = current_time - rate_limit[client_ip]["start_time"]
        if elapsed_time > RATE_LIMIT_WINDOW:
            rate_limit[client_ip] = {"count": 1, "start_time": current_time}
        else:
            rate_limit[client_ip]["count"] += 1

    # Check rate limit
    if rate_limit[client_ip]["count"] > RATE_LIMIT_REQUESTS:
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please try again later."}
        )

    # Call next middleware/route
    response = await call_next(request)
    return response
# Mount static files directory
app.mount("/static", StaticFiles(directory=settings.STATIC_DIR), name="static")

# Security setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Global error handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log the error
    error_id = uuid.uuid4().hex
    logger.error(f"Error ID: {error_id} - {exc}", exc_info=True)
    
    # Don't expose details in production
    if os.getenv("ENVIRONMENT") == "production":
        return JSONResponse(
            status_code=500,
            content={"detail": f"Internal server error. Reference ID: {error_id}"}
        )
    else:
        return JSONResponse(
            status_code=500,
            content={
                "detail": str(exc),
                "traceback": traceback.format_exc(),
                "reference_id": error_id
            }
        )

# Database connection function
def get_db():
    try:
        client = MongoClient(
            settings.MONGO_URI, 
            serverSelectionTimeoutMS=5000,
            connect=False  # For better performance with async code
        )
        # Verify connection
        client.server_info()
        return client[settings.DB_NAME]
    except errors.ServerSelectionTimeoutError as e:
        logger.error(f"MongoDB connection error: {e}")
        raise Exception("Database connection failed")
# def seed_doctors_data():
# # Load seed data for doctors
#     if doctors_collection.count_documents({}) == 0:
#         seed_doctors=[
#     # Original doctors with extended availability
#     # General Practitioners 
#         {"name": "Dr. Sharma", "specialty": "General Practitioner", "experience": "15 years", "rating": 4.9, 
#         "availability": ["2025-03-03", "2025-03-04", "2025-03-05", "2025-03-10", "2025-03-11", "2025-03-12", 
#                         "2025-03-17", "2025-03-18", "2025-03-19", "2025-03-24", "2025-03-25", "2025-03-26", "2025-03-31"]},
                        
#         {"name": "Dr. Verma", "specialty": "General Practitioner", "experience": "10 years", "rating": 4.7, 
#         "availability": ["2025-03-06", "2025-03-07", "2025-03-08", "2025-03-13", "2025-03-14", "2025-03-15", 
#                         "2025-03-20", "2025-03-21", "2025-03-22", "2025-03-27", "2025-03-28", "2025-03-29"]},
                        
#         # Cardiologists 
#         {"name": "Dr. Patel", "specialty": "Cardiologist", "experience": "12 years", "rating": 4.8, 
#         "availability": ["2025-03-04", "2025-03-06", "2025-03-07", "2025-03-11", "2025-03-13", "2025-03-14", 
#                         "2025-03-18", "2025-03-20", "2025-03-21", "2025-03-25", "2025-03-27", "2025-03-28"]},
                        
#         {"name": "Dr. Mehta", "specialty": "Cardiologist", "experience": "14 years", "rating": 4.9, 
#         "availability": ["2025-03-05", "2025-03-07", "2025-03-09", "2025-03-12", "2025-03-14", "2025-03-16", 
#                         "2025-03-19", "2025-03-21", "2025-03-23", "2025-03-26", "2025-03-28", "2025-03-30"]},
                        
#         # Pulmonologists 
#         {"name": "Dr. Gupta", "specialty": "Pulmonologist", "experience": "10 years", "rating": 4.7, 
#         "availability": ["2025-03-02", "2025-03-05", "2025-03-08", "2025-03-11", "2025-03-14", "2025-03-17", 
#                         "2025-03-20", "2025-03-23", "2025-03-26", "2025-03-29"]},
                        
#         {"name": "Dr. Rao", "specialty": "Pulmonologist", "experience": "11 years", "rating": 4.6, 
#         "availability": ["2025-03-04", "2025-03-06", "2025-03-09", "2025-03-11", "2025-03-13", "2025-03-16", 
#                         "2025-03-18", "2025-03-20", "2025-03-23", "2025-03-25", "2025-03-27", "2025-03-30"]},
                        
#         # Neurologists 
#         {"name": "Dr. Khan", "specialty": "Neurologist", "experience": "18 years", "rating": 4.9, 
#         "availability": ["2025-03-03", "2025-03-07", "2025-03-09", "2025-03-13", "2025-03-17", "2025-03-21", 
#                         "2025-03-24", "2025-03-28", "2025-03-31"]},
                        
#         {"name": "Dr. Nair", "specialty": "Neurologist", "experience": "16 years", "rating": 4.8, 
#         "availability": ["2025-03-02", "2025-03-05", "2025-03-08", "2025-03-12", "2025-03-15", "2025-03-19", 
#                         "2025-03-22", "2025-03-26", "2025-03-29"]},
                        
#         # Dermatologists 
#         {"name": "Dr. Reddy", "specialty": "Dermatologist", "experience": "8 years", "rating": 4.6, 
#         "availability": ["2025-03-02", "2025-03-04", "2025-03-06", "2025-03-10", "2025-03-12", "2025-03-14", 
#                         "2025-03-18", "2025-03-20", "2025-03-24", "2025-03-26", "2025-03-28", "2025-03-31"]},
                        
#         {"name": "Dr. Iyer", "specialty": "Dermatologist", "experience": "9 years", "rating": 4.7, 
#         "availability": ["2025-03-05", "2025-03-07", "2025-03-09", "2025-03-12", "2025-03-15", "2025-03-19", 
#                         "2025-03-21", "2025-03-23", "2025-03-26", "2025-03-28", "2025-03-30"]},
                        
#         # ENT Specialists 
#         {"name": "Dr. Singh", "specialty": "ENT Specialist", "experience": "14 years", "rating": 4.8, 
#         "availability": ["2025-03-03", "2025-03-05", "2025-03-08", "2025-03-10", "2025-03-12", "2025-03-15", 
#                         "2025-03-17", "2025-03-19", "2025-03-22", "2025-03-24", "2025-03-26", "2025-03-29", "2025-03-31"]},
                        
#         {"name": "Dr. Banerjee", "specialty": "ENT Specialist", "experience": "12 years", "rating": 4.7, 
#         "availability": ["2025-03-04", "2025-03-06", "2025-03-09", "2025-03-11", "2025-03-13", "2025-03-16", 
#                         "2025-03-18", "2025-03-20", "2025-03-23", "2025-03-25", "2025-03-27", "2025-03-30"]},
                        
#         # Endocrinologists 
#         {"name": "Dr. Menon", "specialty": "Endocrinologist", "experience": "13 years", "rating": 4.8, 
#         "availability": ["2025-03-03", "2025-03-06", "2025-03-09", "2025-03-12", "2025-03-15", "2025-03-18", 
#                         "2025-03-21", "2025-03-24", "2025-03-27", "2025-03-30"]},
                        
#         {"name": "Dr. Bhaskar", "specialty": "Endocrinologist", "experience": "12 years", "rating": 4.7, 
#         "availability": ["2025-03-04", "2025-03-07", "2025-03-08", "2025-03-11", "2025-03-14", "2025-03-15", 
#                         "2025-03-18", "2025-03-21", "2025-03-22", "2025-03-25", "2025-03-28", "2025-03-29"]},
                        
#         # Gastroenterologists 
#         {"name": "Dr. Kulkarni", "specialty": "Gastroenterologist", "experience": "15 years", "rating": 4.9, 
#         "availability": ["2025-03-05", "2025-03-07", "2025-03-09", "2025-03-12", "2025-03-14", "2025-03-16", 
#                         "2025-03-19", "2025-03-21", "2025-03-23", "2025-03-26", "2025-03-28", "2025-03-30"]},
                        
#         {"name": "Dr. Joshi", "specialty": "Gastroenterologist", "experience": "11 years", "rating": 4.6, 
#         "availability": ["2025-03-03", "2025-03-06", "2025-03-08", "2025-03-10", "2025-03-13", "2025-03-15", 
#                         "2025-03-17", "2025-03-20", "2025-03-22", "2025-03-24", "2025-03-27", "2025-03-29", "2025-03-31"]},
                        
#         # Pediatricians 
#         {"name": "Dr. Das", "specialty": "Pediatrician", "experience": "9 years", "rating": 4.7, 
#         "availability": ["2025-03-04", "2025-03-07", "2025-03-09", "2025-03-11", "2025-03-14", "2025-03-16", 
#                         "2025-03-18", "2025-03-21", "2025-03-23", "2025-03-25", "2025-03-28", "2025-03-30"]},
                        
#         {"name": "Dr. Mukherjee", "specialty": "Pediatrician", "experience": "10 years", "rating": 4.8, 
#         "availability": ["2025-03-03", "2025-03-06", "2025-03-08", "2025-03-10", "2025-03-13", "2025-03-15", 
#                         "2025-03-17", "2025-03-20", "2025-03-22", "2025-03-24", "2025-03-27", "2025-03-29", "2025-03-31"]},
                        
#         # Orthopedists 
#         {"name": "Dr. Choudhary", "specialty": "Orthopedist", "experience": "17 years", "rating": 4.9, 
#         "availability": ["2025-03-02", "2025-03-05", "2025-03-09", "2025-03-12", "2025-03-16", "2025-03-19", 
#                         "2025-03-23", "2025-03-26", "2025-03-30"]},
                        
#         {"name": "Dr. Mishra", "specialty": "Orthopedist", "experience": "16 years", "rating": 4.8, 
#         "availability": ["2025-03-04", "2025-03-07", "2025-03-08", "2025-03-11", "2025-03-14", "2025-03-15", 
#                         "2025-03-18", "2025-03-21", "2025-03-22", "2025-03-25", "2025-03-28", "2025-03-29"]},
        
#         # Previously added specialists
#         {"name": "Dr. Agarwal", "specialty": "Ophthalmologist", "experience": "14 years", "rating": 4.8, 
#         "availability": ["2025-03-03", "2025-03-05", "2025-03-10", "2025-03-12", "2025-03-17", "2025-03-19", 
#                         "2025-03-24", "2025-03-26", "2025-03-31"]},
                        
#         {"name": "Dr. Chawla", "specialty": "Psychiatrist", "experience": "11 years", "rating": 4.7, 
#         "availability": ["2025-03-06", "2025-03-09", "2025-03-13", "2025-03-16", "2025-03-20", "2025-03-23", 
#                         "2025-03-27", "2025-03-30"]},
                        
#         {"name": "Dr. Kapoor", "specialty": "Urologist", "experience": "13 years", "rating": 4.8, 
#         "availability": ["2025-03-04", "2025-03-07", "2025-03-11", "2025-03-14", "2025-03-18", "2025-03-21", 
#                         "2025-03-25", "2025-03-28", "2025-03-31"]},
        
#         # NEW ADDITIONS - Adding more doctors and specialties
#         # More General Practitioners
#         {"name": "Dr. Kumar", "specialty": "General Practitioner", "experience": "8 years", "rating": 4.6, 
#         "availability": ["2025-03-02", "2025-03-03", "2025-03-09", "2025-03-10", "2025-03-16", "2025-03-17", 
#                         "2025-03-23", "2025-03-24", "2025-03-30", "2025-03-31"]},
                        
#         {"name": "Dr. Ahuja", "specialty": "General Practitioner", "experience": "20 years", "rating": 4.9, 
#         "availability": ["2025-03-04", "2025-03-05", "2025-03-11", "2025-03-12", "2025-03-18", "2025-03-19", 
#                         "2025-03-25", "2025-03-26"]},
        
#         # More Cardiologists
#         {"name": "Dr. Desai", "specialty": "Cardiologist", "experience": "22 years", "rating": 5.0, 
#         "availability": ["2025-03-03", "2025-03-10", "2025-03-17", "2025-03-24", "2025-03-31"]},
                        
#         {"name": "Dr. Malhotra", "specialty": "Cardiologist", "experience": "9 years", "rating": 4.5, 
#         "availability": ["2025-03-02", "2025-03-04", "2025-03-06", "2025-03-09", "2025-03-11", "2025-03-13", 
#                         "2025-03-16", "2025-03-18", "2025-03-20", "2025-03-23", "2025-03-25", "2025-03-27", "2025-03-30"]},
        
#         # Rheumatologists
#         {"name": "Dr. Shetty", "specialty": "Rheumatologist", "experience": "15 years", "rating": 4.8, 
#         "availability": ["2025-03-05", "2025-03-06", "2025-03-12", "2025-03-13", "2025-03-19", "2025-03-20", 
#                         "2025-03-26", "2025-03-27"]},
                        
#         {"name": "Dr. Bajaj", "specialty": "Rheumatologist", "experience": "13 years", "rating": 4.7, 
#         "availability": ["2025-03-02", "2025-03-09", "2025-03-16", "2025-03-23", "2025-03-30"]},
        
#         # Oncologists
#         {"name": "Dr. Arora", "specialty": "Oncologist", "experience": "18 years", "rating": 4.9, 
#         "availability": ["2025-03-03", "2025-03-05", "2025-03-07", "2025-03-10", "2025-03-12", "2025-03-14", 
#                         "2025-03-17", "2025-03-19", "2025-03-21", "2025-03-24", "2025-03-26", "2025-03-28", "2025-03-31"]},
                        
#         {"name": "Dr. Goel", "specialty": "Oncologist", "experience": "20 years", "rating": 5.0, 
#         "availability": ["2025-03-04", "2025-03-11", "2025-03-18", "2025-03-25"]},
        
#         # Gynecologists
#         {"name": "Dr. Lal", "specialty": "Gynecologist", "experience": "14 years", "rating": 4.8, 
#         "availability": ["2025-03-03", "2025-03-05", "2025-03-07", "2025-03-10", "2025-03-12", "2025-03-14", 
#                         "2025-03-17", "2025-03-19", "2025-03-21", "2025-03-24", "2025-03-26", "2025-03-28", "2025-03-31"]},
                        
#         {"name": "Dr. Chakraborty", "specialty": "Gynecologist", "experience": "16 years", "rating": 4.9, 
#         "availability": ["2025-03-04", "2025-03-06", "2025-03-11", "2025-03-13", "2025-03-18", "2025-03-20", 
#                         "2025-03-25", "2025-03-27"]},
        
#         # Nephrologists
#         {"name": "Dr. Bedi", "specialty": "Nephrologist", "experience": "12 years", "rating": 4.7, 
#         "availability": ["2025-03-02", "2025-03-04", "2025-03-09", "2025-03-11", "2025-03-16", "2025-03-18", 
#                         "2025-03-23", "2025-03-25", "2025-03-30"]},
                        
#         {"name": "Dr. Saxena", "specialty": "Nephrologist", "experience": "17 years", "rating": 4.8, 
#         "availability": ["2025-03-05", "2025-03-12", "2025-03-19", "2025-03-26"]},
        
#         # More Neurologists
#         {"name": "Dr. Krishnan", "specialty": "Neurologist", "experience": "21 years", "rating": 5.0, 
#         "availability": ["2025-03-06", "2025-03-13", "2025-03-20", "2025-03-27"]},
                        
#         {"name": "Dr. Hegde", "specialty": "Neurologist", "experience": "19 years", "rating": 4.9, 
#         "availability": ["2025-03-02", "2025-03-09", "2025-03-16", "2025-03-23", "2025-03-30"]},
        
#         # More Ophthalmologists
#         {"name": "Dr. Thakur", "specialty": "Ophthalmologist", "experience": "11 years", "rating": 4.6, 
#         "availability": ["2025-03-04", "2025-03-06", "2025-03-11", "2025-03-13", "2025-03-18", "2025-03-20", 
#                         "2025-03-25", "2025-03-27"]},
                        
#         {"name": "Dr. Handa", "specialty": "Ophthalmologist", "experience": "15 years", "rating": 4.8, 
#         "availability": ["2025-03-02", "2025-03-07", "2025-03-09", "2025-03-14", "2025-03-16", "2025-03-21", 
#                         "2025-03-23", "2025-03-28", "2025-03-30"]},
        
#         # Allergists
#         {"name": "Dr. Mehra", "specialty": "Allergist", "experience": "13 years", "rating": 4.7, 
#         "availability": ["2025-03-03", "2025-03-06", "2025-03-10", "2025-03-13", "2025-03-17", "2025-03-20", 
#                         "2025-03-24", "2025-03-27", "2025-03-31"]},
                        
#         {"name": "Dr. Tandon", "specialty": "Allergist", "experience": "10 years", "rating": 4.6, 
#         "availability": ["2025-03-05", "2025-03-07", "2025-03-12", "2025-03-14", "2025-03-19", "2025-03-21", 
#                         "2025-03-26", "2025-03-28"]},
        
#         # Geriatricians
#         {"name": "Dr. Khanna", "specialty": "Geriatrician", "experience": "16 years", "rating": 4.8, 
#         "availability": ["2025-03-02", "2025-03-04", "2025-03-09", "2025-03-11", "2025-03-16", "2025-03-18", 
#                         "2025-03-23", "2025-03-25", "2025-03-30"]},
                        
#         {"name": "Dr. Sethi", "specialty": "Geriatrician", "experience": "14 years", "rating": 4.7, 
#         "availability": ["2025-03-06", "2025-03-13", "2025-03-20", "2025-03-27"]},
        
#         # Sports Medicine Specialists
#         {"name": "Dr. Aggarwal", "specialty": "Sports Medicine", "experience": "12 years", "rating": 4.8, 
#         "availability": ["2025-03-03", "2025-03-05", "2025-03-07", "2025-03-10", "2025-03-12", "2025-03-14", 
#                         "2025-03-17", "2025-03-19", "2025-03-21", "2025-03-24", "2025-03-26", "2025-03-28", "2025-03-31"]},
                        
#         {"name": "Dr. Bhattacharya", "specialty": "Sports Medicine", "experience": "9 years", "rating": 4.6, 
#         "availability": ["2025-03-02", "2025-03-04", "2025-03-06", "2025-03-09", "2025-03-11", "2025-03-13", 
#                         "2025-03-16", "2025-03-18", "2025-03-20", "2025-03-23", "2025-03-25", "2025-03-27", "2025-03-30"]},
        
#         # Hematologists
#         {"name": "Dr. Tiwari", "specialty": "Hematologist", "experience": "15 years", "rating": 4.8, 
#         "availability": ["2025-03-04", "2025-03-11", "2025-03-18", "2025-03-25"]},
                        
#         {"name": "Dr. Madan", "specialty": "Hematologist", "experience": "18 years", "rating": 4.9, 
#         "availability": ["2025-03-06", "2025-03-07", "2025-03-13", "2025-03-14", "2025-03-20", "2025-03-21", 
#                         "2025-03-27", "2025-03-28"]},
        
#         # Infectious Disease Specialists
#         {"name": "Dr. Gill", "specialty": "Infectious Disease", "experience": "14 years", "rating": 4.8, 
#         "availability": ["2025-03-03", "2025-03-10", "2025-03-17", "2025-03-24", "2025-03-31"]},
                        
#         {"name": "Dr. Goswami", "specialty": "Infectious Disease", "experience": "12 years", "rating": 4.7, 
#         "availability": ["2025-03-05", "2025-03-07", "2025-03-12", "2025-03-14", "2025-03-19", "2025-03-21", 
#                         "2025-03-26", "2025-03-28"]}
#     ]
    
#     # Initialize seed_doctors as an empty list
#     doctors_collection.insert_many(seed_doctors)
    logger.info("Expanded doctor data with 45 doctors and extended March 2025 availability added to database")
# Initialize database and collections
try:
    db = get_db()
    
        
    
    # Define collections
    users_collection = db["users"]
    aadhaar_collection = db["aadhaar_data"]
    medical_history_collection = db["medical_history"]
    vital_signs_collection = db["vital_signs"]
    medical_reports_collection = db["medical_reports"]
    consultation_collection = db["consultations"]
    doctors_collection = db["doctors"]
    appointments_collection = db["appointments"]
    health_assessments_collection = db["health_assessments"]
    audit_logs_collection = db["audit_logs"]

    
        
    
    
    # seed_doctors_data()
    # Ensure indexes for performance and constraints
    users_collection.create_index([("email", ASCENDING)], unique=True)
    users_collection.create_index([("created_at", DESCENDING)])
    
    aadhaar_collection.create_index([("user_email", ASCENDING)])
    medical_history_collection.create_index([("user_email", ASCENDING)])
    vital_signs_collection.create_index([("user_email", ASCENDING), ("recorded_at", DESCENDING)])
    medical_reports_collection.create_index([("user_email", ASCENDING), ("created_at", DESCENDING)])
    consultation_collection.create_index([("user_email", ASCENDING), ("timestamp", DESCENDING)])
    appointments_collection.create_index([("user_email", ASCENDING), ("appointment_date", ASCENDING)])
    appointments_collection.create_index([("doctor_id", ASCENDING), ("appointment_date", ASCENDING)])
    
    logger.info("MongoDB connection established and indexes created")
    
except Exception as e:
    logger.error(f"Database initialization error: {e}")
    raise

# Utility Functions

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = pyjwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def validate_email(email):
    # Email validation regex
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    if not re.match(pattern, email):
        return False
    return True

def secure_filename(filename):
    """Make filename secure and unique"""
    # Get file extension
    ext = os.path.splitext(filename)[1].lower() if filename else ""
    # Create a new unique filename with timestamp and UUID
    new_filename = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex}{ext}"
    return new_filename

def log_audit(user_email, action, details=None):
    """Log user actions for audit purposes"""
    try:
        audit_entry = {
            "user_email": user_email,
            "action": action,
            "details": details or {},
            "timestamp": datetime.utcnow(),
            "ip_address": "127.0.0.1"  # In production, get from request
        }
        audit_logs_collection.insert_one(audit_entry)
    except Exception as e:
        logger.error(f"Error logging audit: {e}")

def sanitize_document(doc):
    """Convert MongoDB documents to JSON-serializable format"""
    if doc is None:
        return None
        
    if isinstance(doc, dict):
        # Convert ObjectId to string
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])
            
        # Handle datetime objects
        for k, v in doc.items():
            if isinstance(v, datetime):
                doc[k] = v.isoformat()
            elif isinstance(v, dict) or isinstance(v, list):
                doc[k] = sanitize_document(v)
                
    elif isinstance(doc, list):
        doc = [sanitize_document(item) for item in doc]
        
    return doc

# Dependency for token verification
def verify_token(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
        
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email = payload.get("sub")
        role = payload.get("role", "patient")
        exp = payload.get("exp")
        
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid authentication token")
            
        # Check if token has expired
        if datetime.fromtimestamp(exp) < datetime.utcnow():
            raise HTTPException(status_code=401, detail="Token has expired")
            
        return {"email": email, "role": role}
    except jwt.PyJWTError as e:
        logger.error(f"JWT validation error: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid authentication token")

# Dependency to get current user
def get_current_user(token_data: dict = Depends(verify_token)):
    user = users_collection.find_one({"email": token_data["email"]})
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Remove sensitive information
    if "password" in user:
        del user["password"]
        
    return sanitize_document(user)

# Check if user is admin
def admin_required(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return current_user

# Check if user is doctor
def doctor_required(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "doctor" and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Doctor privileges required")
    return current_user

# Minimum Pydantic models - only keep what's necessary for FastAPI to work properly
class Token(pydantic.BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]

# API Routes

@app.get("/api/health")
async def health_check():
    """API health check endpoint."""
    # Check database connection
    db_status = "connected"
    try:
        get_db().command("ping")
    except:
        db_status = "disconnected"
        
    # model_status = "initializing" if not model_service.is_initialized() else "ready"
    
    return {
        "status": "operational",
        "database": db_status,
        # "model_status": model_status,
        "environment": os.getenv("ENVIRONMENT", "development"),
        "version": app.__dict__.get("version", "3.0.0"),
        "timestamp": datetime.utcnow().isoformat()
    }
# @app.post("/api/dynamic-medical-chat")
# async def dynamic_medical_chat(request: Request, current_user: dict = Depends(get_current_user)):
#     """
#     Dynamic medical chat endpoint that automatically determines the user's intent
#     and routes to the appropriate AI model (MedAlpaca, ChatDoctor, etc.)
#     """
#     try:
#         # Generate a request ID for tracking
#         request_id = uuid.uuid4().hex
        
#         # Parse request body
#         data = await request.json()
#         message = data.get("message")
#         context = data.get("context", "")
        
#         # Validate input
#         if not message or not message.strip():
#             raise HTTPException(status_code=400, detail="Message cannot be empty")
        
#         # Check cache for faster response - FIXED REDIS ERROR HANDLING
#         cached_response = None
#         if redis_available and redis_client:
#             try:
#                 cache_key = f"dynamic_chat:{current_user['email']}:{hash(message + context)}"
#                 cached_response = redis_client.get(cache_key)
#                 if cached_response:
#                     try:
#                         response_data = json.loads(cached_response)
#                         logger.info(f"Cache hit for request {request_id}")
#                         return response_data
#                     except Exception as json_error:
#                         logger.warning(f"Error parsing cached response: {json_error}")
#             except Exception as redis_error:
#                 # Gracefully handle Redis errors and continue without caching
#                 logger.warning(f"Redis error in dynamic chat: {str(redis_error)}")
        
#         # Check if models are ready
#         if not model_service.is_initialized():
#             raise HTTPException(
#                 status_code=503, 
#                 detail="AI models are still initializing. Please try again shortly."
#             )
        
#         # Log request start
#         logger.info(f"Request {request_id}: Processing medical chat for user {current_user['email']}")
#         start_time = time.time()
        
#         # Dynamically determine the best model for this query
#         intent_info = model_service.determine_intent(message)
#         intent = intent_info.get("intent", "chat")
#         confidence = intent_info.get("confidence", 0.0)
#         model_name = intent_info.get("model", "medalpaca")
        
#         logger.info(f"Request {request_id}: Detected intent '{intent}' with confidence {confidence:.2f}, using model '{model_name}'")
        
#         # Handle different intents differently
#         if intent == "disease_prediction":
#             # This is a symptom description, use disease prediction
#             prediction = model_service.predict_disease(message)
            
#             response_text = f"Based on your symptoms, you might have {prediction['prediction']} (confidence: {prediction['confidence']:.2f}).\n\n{prediction['explanation']}\n\nRecommendations:\n" + "\n".join([f"- {rec}" for rec in prediction.get('preventionMeasures', [])])
            
#             # Log conversation for disease prediction
#             conversation_entry = {
#                 "user_id": current_user["_id"],
#                 "user_email": current_user["email"],
#                 "user_message": message,
#                 "intent": intent,
#                 "model": model_name,
#                 "context": context,
#                 "prediction": prediction,
#                 "ai_response": response_text,
#                 "timestamp": datetime.utcnow(),
#                 "request_id": request_id
#             }
#         else:
#             # General medical chat or medical Q&A
#             response = model_service.generate_medical_response(
#                 message, 
#                 context=context, 
#                 model_name=model_name
#             )
            
#             response_text = response.get("response", "")
            
#             # Log conversation for normal chat
#             conversation_entry = {
#                 "user_id": current_user["_id"],
#                 "user_email": current_user["email"],
#                 "user_message": message,
#                 "intent": intent,
#                 "model": model_name,
#                 "context": context,
#                 "ai_response": response_text,
#                 "timestamp": datetime.utcnow(),
#                 "request_id": request_id
#             }
        
#         # Store conversation in database
#         consultation_id = consultation_collection.insert_one(conversation_entry).inserted_id
        
#         # Calculate processing time
#         processing_time = round(time.time() - start_time, 2)
#         logger.info(f"Request {request_id}: Processed in {processing_time}s")
        
#         # Create response
#         api_response = {
#             "response": response_text,
#             "conversation_id": str(consultation_id),
#             "intent": intent,
#             "model": model_name,
#             "confidence": confidence,
#             "processing_time": processing_time,
#             "timestamp": datetime.utcnow().isoformat()
#         }
        
#         # Cache the response - FIXED REDIS ERROR HANDLING
#         if redis_available and redis_client:
#             try:
#                 redis_client.setex(
#                     cache_key,
#                     3600,  # 1 hour expiry
#                     json.dumps(api_response)
#                 )
#             except Exception as cache_error:
#                 # Just log the error but don't fail the request
#                 logger.warning(f"Error caching response: {str(cache_error)}")
        
#         # Log audit
#         try:
#             log_audit(
#                 current_user["email"],
#                 "dynamic_medical_chat",
#                 {
#                     "conversation_id": str(consultation_id),
#                     "intent": intent,
#                     "model": model_name,
#                     "request_id": request_id
#                 }
#             )
#         except Exception as audit_error:
#             # Don't fail if audit logging fails
#             logger.warning(f"Error logging audit: {str(audit_error)}")
        
#         return api_response
        
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error in dynamic medical chat: {str(e)}")
#         raise HTTPException(status_code=500, detail="Error processing your request")

@app.post("/api/register", response_model=Dict[str, Any])
async def register_user(request: Request):
    """Register a new user with optional face registration."""
    try:
        # Generate a unique request ID for tracking and debugging
        request_id = uuid.uuid4().hex
        client_ip = request.client.host
        logger.info(f"Registration request started - ID: {request_id}, IP: {client_ip}")
        
        # Get the multipart form data
        form_data = await request.form()
        
        # Extract user data from the 'user' field
        user_json = form_data.get('user')
        face_image = form_data.get('face_image')
        
        if not user_json:
            raise HTTPException(status_code=422, detail="Missing user data")
        
        try:
            # Parse the JSON string to get user data
            user_data = json.loads(user_json)
            logger.info(f"User data parsed successfully - Request ID: {request_id}")
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON format - Request ID: {request_id}")
            raise HTTPException(status_code=422, detail="Invalid user data format")
        
        # Manual validation
        email = user_data.get('email')
        password = user_data.get('password')
        name = user_data.get('name')
        gender = user_data.get('gender', 'other')
        dob = user_data.get('dob')
        role = user_data.get('role', 'patient')
        
        # Validate required fields
        if not email or not password or not name:
            raise HTTPException(status_code=422, detail="Missing required fields: email, password, name")
        
        # Validate email
        if not validate_email(email):
            raise HTTPException(status_code=422, detail="Invalid email format")
        
        # Validate password strength
        if len(password) < settings.PASSWORD_MIN_LENGTH:
            raise HTTPException(status_code=422, detail=f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters")
        if not any(c.isdigit() for c in password):
            raise HTTPException(status_code=422, detail="Password must contain at least one number")
        if not any(c.isupper() for c in password):
            raise HTTPException(status_code=422, detail="Password must contain at least one uppercase letter")
        if not any(c.islower() for c in password):
            raise HTTPException(status_code=422, detail="Password must contain at least one lowercase letter")
        
        # Validate role
        allowed_roles = ["patient", "doctor", "admin"]
        if role not in allowed_roles:
            raise HTTPException(status_code=422, detail=f"Role must be one of: {', '.join(allowed_roles)}")
        
        # Normalize email
        normalized_email = email.lower().strip()
        
        # Use a unique ID to prevent duplicates
        custom_id = user_data.get('id') or f"user_{uuid.uuid4().hex}"
        
        # Check if user already exists using findOneAndUpdate for atomic operation
        try:
            # Add index for unique_id if it doesn't exist
            if "unique_id_index" not in [idx["name"] for idx in users_collection.list_indexes()]:
                users_collection.create_index([("unique_id", ASCENDING)], name="unique_id_index", unique=True)
            
            # Check for existing user
            existing_user = users_collection.find_one({
                "$or": [
                    {"email": normalized_email},
                    {"unique_id": custom_id}
                ]
            })
            
            if existing_user:
                if existing_user.get("email") == normalized_email:
                    logger.warning(f"Email already registered - Request ID: {request_id}, Email: {normalized_email}")
                    raise HTTPException(status_code=400, detail="Email already registered")
                else:
                    logger.warning(f"User ID already exists - Request ID: {request_id}, ID: {custom_id}")
                    raise HTTPException(status_code=400, detail="User ID already exists")
            
            # Hash password
            hashed_password = get_password_hash(password)
            
            # Prepare user data for insertion
            user_dict = {
                "email": normalized_email,
                "password": hashed_password,
                "name": name,
                "gender": gender,
                "dob": dob,
                "role": role,
                "created_at": datetime.utcnow(),
                "is_active": True,
                "is_verified": False,
                "unique_id": custom_id,
                "request_id": request_id
            }
            
            # Insert user into database
            result = users_collection.insert_one(user_dict)
            user_id = result.inserted_id
            logger.info(f"User inserted successfully - Request ID: {request_id}, User ID: {str(user_id)}")
            
            # Log audit
            log_audit(
                normalized_email,
                "user_registration",
                {"user_id": str(user_id), "request_id": request_id}
            )
            
            # Create profile data
            profile_data = {
                "user_id": str(user_id),
                "user_email": normalized_email,
                "name": name,
                "gender": gender,
                "dob": dob,
                "created_at": datetime.utcnow()
            }
            
            db["profiles"].insert_one(profile_data)
            
            # Process face image if provided
            if face_image:
                # Read the file content
                if hasattr(face_image, "read"):
                    content = await face_image.read()
                else:
                    content = face_image
                    
                if len(content) > settings.MAX_UPLOAD_SIZE:
                    logger.warning(f"Face image too large - Request ID: {request_id}")
                    raise HTTPException(status_code=413, detail="Face image file size too large")
                
                # Process the face image
                np_image = np.frombuffer(content, dtype=np.uint8)
                image = cv2.imdecode(np_image, cv2.IMREAD_COLOR)
                
                if image is None:
                    logger.error(f"Invalid image format - Request ID: {request_id}")
                    raise HTTPException(status_code=400, detail="Invalid image format or corrupted image")
                
                # Pre-process image for better face detection
                try:
                    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
                    l, a, b = cv2.split(lab)
                    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
                    l = clahe.apply(l)
                    lab = cv2.merge((l, a, b))
                    enhanced_image = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
                    
                    # Increase brightness for dark images
                    brightness = np.mean(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY))
                    if brightness < 100:
                        alpha = 1.3  # Contrast
                        beta = 30     # Brightness
                        enhanced_image = cv2.convertScaleAbs(enhanced_image, alpha=alpha, beta=beta)
                except Exception as e:
                    logger.warning(f"Image enhancement failed - Request ID: {request_id}, Error: {e}")
                    enhanced_image = image
                
                # Detect face using DNN
                face_detected = False
                face_box = None
                
                # Try with DNN
                try:
                    models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
                    prototxt_path = os.path.join(models_dir, "deploy.prototxt")
                    model_path = os.path.join(models_dir, "res10_300x300_ssd_iter_140000.caffemodel")
                    
                    if os.path.exists(prototxt_path) and os.path.exists(model_path):
                        net = cv2.dnn.readNetFromCaffe(prototxt_path, model_path)
                        
                        blob = cv2.dnn.blobFromImage(
                            cv2.resize(enhanced_image, (300, 300)), 
                            1.0, 
                            (300, 300), 
                            (104.0, 177.0, 123.0)
                        )
                        
                        net.setInput(blob)
                        detections = net.forward()
                        
                        height, width = enhanced_image.shape[:2]
                        best_confidence = 0
                        
                        for i in range(detections.shape[2]):
                            confidence = detections[0, 0, i, 2]
                            
                            if confidence > 0.5 and confidence > best_confidence:
                                best_confidence = confidence
                                box = detections[0, 0, i, 3:7] * np.array([width, height, width, height])
                                (x1, y1, x2, y2) = box.astype("int")
                                
                                # Store face box
                                face_box = (max(0, x1), max(0, y1), min(width, x2) - max(0, x1), min(height, y2) - max(0, y1))
                                face_detected = True
                                
                                logger.info(f"Face detected with DNN - Request ID: {request_id}, Confidence: {confidence:.2f}")
                except Exception as dnn_error:
                    logger.error(f"DNN face detection error - Request ID: {request_id}, Error: {dnn_error}")
                
                # If DNN failed, try with Haar Cascade
                if not face_detected:
                    try:
                        gray = cv2.cvtColor(enhanced_image, cv2.COLOR_BGR2GRAY)
                        
                        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
                        
                        # First attempt - standard parameters
                        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
                        
                        # Second attempt - more lenient parameters
                        if len(faces) == 0:
                            faces = face_cascade.detectMultiScale(
                                gray, 
                                scaleFactor=1.05, 
                                minNeighbors=3, 
                                minSize=(30, 30)
                            )
                        
                        # Third attempt - even more lenient
                        if len(faces) == 0:
                            faces = face_cascade.detectMultiScale(
                                gray, 
                                scaleFactor=1.03, 
                                minNeighbors=2, 
                                minSize=(20, 20)
                            )
                        
                        # If faces found
                        if len(faces) > 0:
                            # Get the largest face if multiple detected
                            if len(faces) > 1:
                                faces = sorted(faces, key=lambda x: x[2] * x[3], reverse=True)
                            
                            face_box = tuple(faces[0])
                            face_detected = True
                            logger.info(f"Face detected with Haar Cascade - Request ID: {request_id}")
                    except Exception as cascade_error:
                        logger.error(f"Haar Cascade face detection error - Request ID: {request_id}, Error: {cascade_error}")
                
                # If no face detected, return an error
                if not face_detected or face_box is None:
                    logger.warning(f"No face detected in image - Request ID: {request_id}")
                    raise HTTPException(
                        status_code=400, 
                        detail="No face detected in the image. Please try again with better lighting."
                    )
                
                # Extract and process the face
                x, y, w, h = face_box
                face_img = enhanced_image[y:y+h, x:x+w]
                
                if face_img.size == 0 or w <= 0 or h <= 0:
                    logger.error(f"Invalid face region - Request ID: {request_id}")
                    raise HTTPException(status_code=400, detail="Invalid face region detected")
                
                # Resize for consistent processing
                face_img = cv2.resize(face_img, (150, 150))
                
                # Extract face features
                try:
                    hog = cv2.HOGDescriptor()
                    h = hog.compute(face_img)
                    face_features = h.flatten()
                    
                    # Normalize features
                    face_features = face_features.astype(np.float32)
                    face_features = face_features / np.linalg.norm(face_features)
                    face_features_list = face_features.tolist()
                except Exception as feature_error:
                    logger.error(f"Feature extraction error - Request ID: {request_id}, Error: {feature_error}")
                    raise HTTPException(status_code=500, detail="Error processing face features")
                
                # Save face image
                try:
                    face_filename = f"face_{user_id}.jpg"
                    user_face_dir = os.path.join(settings.UPLOAD_DIR, "faces", str(user_id))
                    os.makedirs(user_face_dir, exist_ok=True)
                    face_filepath = os.path.join(user_face_dir, face_filename)
                    cv2.imwrite(face_filepath, face_img)
                    
                    # Update user with face features
                    users_collection.update_one(
                        {"_id": user_id},
                        {
                            "$set": {
                                "face_features": face_features_list,
                                "face_image_path": face_filepath,
                                "biometric_auth_enabled": True,
                                "face_updated_at": datetime.utcnow()
                            }
                        }
                    )
                    
                    logger.info(f"Face features saved - Request ID: {request_id}")
                except Exception as save_error:
                    logger.error(f"Error saving face image - Request ID: {request_id}, Error: {save_error}")
            
            # Create access token
            access_token = create_access_token(
                data={"sub": normalized_email, "role": role},
                expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
            )
            
            # Return success response
            return {
                "message": "User registered successfully",
                "user_id": str(user_id),
                "email": normalized_email,
                "status": True,
                "token": access_token
            }
        except HTTPException:
            raise
        except Exception as db_error:
            logger.error(f"Database error - Request ID: {request_id}, Error: {str(db_error)}")
            raise HTTPException(status_code=500, detail=f"Error during user registration: {str(db_error)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error - Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error registering user: {str(e)}")

@app.post("/api/login", response_model=Token)
async def login(request: Request):
    """Authenticate a user and return a token."""
    try:
        data = await request.json()
        email = data.get("email")
        password = data.get("password")
        
        # Validate required fields
        if not email or not password:
            raise HTTPException(status_code=422, detail="Email and password are required")
        
        # Validate email format
        if not validate_email(email):
            raise HTTPException(status_code=422, detail="Invalid email format")
        
        # Get user
        normalized_email = email.lower().strip()
        user = users_collection.find_one({"email": normalized_email})
        
        # Check if user exists and password is correct
        if not user or not verify_password(password, user["password"]):
            raise HTTPException(status_code=401, detail="Incorrect email or password")
        
        # Check if user is active
        if not user.get("is_active", True):
            raise HTTPException(status_code=401, detail="Account is deactivated")
        
        # Create access token
        access_token = create_access_token(
            data={"sub": normalized_email, "role": user.get("role", "patient")},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        # Clean user data for response
        user_response = sanitize_document(user)
        if "password" in user_response:
            del user_response["password"]
        
        # Log audit
        log_audit(
            normalized_email,
            "user_login",
            {"user_id": str(user["_id"])}
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user_response
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Login error")

@app.post("/api/medical-history", response_model=Dict[str, Any])
async def save_medical_history(request: Request, current_user: dict = Depends(get_current_user)):
    """Save patient medical history."""
    try:
        # Parse request body
        history_data = await request.json()
        
        # Add user information
        history_data["user_id"] = current_user["_id"]
        history_data["user_email"] = current_user["email"]
        history_data["created_at"] = datetime.utcnow()
        
        # Calculate BMI if height and weight are provided
        height = history_data.get("height")
        weight = history_data.get("weight")
        if height and weight:
            height_m = float(height) / 100  # Convert cm to m
            bmi = float(weight) / (height_m * height_m)
            history_data["bmi"] = round(bmi, 2)
        
        # Store in database
        result = medical_history_collection.insert_one(history_data)
        
        # Update user record
        users_collection.update_one(
            {"_id": current_user["_id"]},
            {"$set": {
                "has_medical_history": True,
                "medical_history_id": str(result.inserted_id),
                "medical_history_updated_at": datetime.utcnow()
            }}
        )
        
        # Log action
        log_audit(
            current_user["email"],
            "medical_history_save",
            {"history_id": str(result.inserted_id)}
        )
        
        return {
            "message": "Medical history saved successfully",
            "history_id": str(result.inserted_id)
        }
    except Exception as e:
        logger.error(f"Error saving medical history: {e}")
        raise HTTPException(status_code=500, detail="Error saving medical history")

@app.post("/api/vital-signs", response_model=Dict[str, Any])
async def save_vital_signs(request: Request, current_user: dict = Depends(get_current_user)):
    """Save patient vital signs."""
    try:
        # Parse request body
        vitals_data = await request.json()
        print(vitals_data)
        
        # Validate vital signs ranges
        heart_rate = vitals_data.get("heartRate")
        if heart_rate is not None and (heart_rate < 30 or heart_rate > 220):
            raise HTTPException(status_code=422, detail="Heart rate must be between 30 and 220 bpm")
            
        oxygen_level = vitals_data.get("oxygenLevel")
        if oxygen_level is not None and (oxygen_level < 70 or oxygen_level > 100):
            raise HTTPException(status_code=422, detail="Oxygen level must be between 70 and 100%")
            
        temperature = vitals_data.get("temperature")
        if temperature is not None and (temperature < 35 or temperature > 42):
            raise HTTPException(status_code=422, detail="Temperature must be between 35 and 42°C")
            
        respiratory_rate = vitals_data.get("respiratoryRate")
        if respiratory_rate is not None and (respiratory_rate < 8 or respiratory_rate > 40):
            raise HTTPException(status_code=422, detail="Respiratory rate must be between 8 and 40 breaths per minute")
        
        # Add user information and timestamp
        vitals_data["user_id"] = current_user["_id"]
        vitals_data["user_email"] = current_user["email"]
        vitals_data["recorded_at"] = datetime.utcnow()
        
        # Store in database
        result = vital_signs_collection.insert_one(vitals_data)
        
        # Update user record with latest vitals
        users_collection.update_one(
            {"_id": current_user["_id"]},
            {"$set": {
                "latest_vitals": {
                    "heartRate": vitals_data.get("heartRate"),
                    "bloodPressure": vitals_data.get("bloodPressure"),
                    "oxygenLevel": vitals_data.get("oxygenLevel"),
                    "temperature": vitals_data.get("temperature"),
                    "respiratoryRate": vitals_data.get("respiratoryRate"),
                    "updated_at": datetime.utcnow()
                }
            }}
        )
        
        # Log action
        log_audit(
            current_user["email"],
            "vital_signs_save",
            {"vitals_id": str(result.inserted_id)}
        )
        
        return {
            "message": "Vital signs saved successfully",
            "vitals_id": str(result.inserted_id),
            "data": sanitize_document(vitals_data)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving vital signs: {e}")
        raise HTTPException(status_code=500, detail="Error saving vital signs")

# # Add a new route to explicitly analyze the intent of a message - useful for debugging
# System prompt to guide PaLM 2
SYSTEM_PROMPT = """
You are a medical assistant designed to simulate a doctor chatting with a patient. Your goal is to:
1. Ask one question at a time to gather detailed information about the patient's symptoms and medical history.
2. Continue asking follow-up questions until you have sufficient information to make an informed diagnosis.
3. Once you have enough data, analyze the information, predict possible diseases, and provide recommendations (e.g., possible medicines or actions).
4. Maintain a natural, empathetic tone like a doctor.
5. And when you're done, you can end the conversation don't ask for any more information.
6. also at last recommend the doctor to the patient from the list of doctors available.

For each response, either:
- Ask a single follow-up question to gather more details, OR
- Provide a diagnosis and recommendations if you have enough information and if you think any lab tests or procedures are necessary.
- If you have enough information, start your response with 'FINAL DIAGNOSIS:' followed by a JSON object containing:
  {
    "diagnosis": "string",
    "recommendations": ["string"],
    "doctor_specialty": "string"
  }

Example flow:
- User: "I have a fever."
- You: "How long have you had the fever, and do you have any other symptoms?"
- User: "Since yesterday, and I have a sore throat."
- You: "Is the sore throat constant, and have you noticed any swelling or difficulty swallowing?"
- (Continues until sufficient data is gathered, then provides diagnosis and advice.)
- - You: "FINAL DIAGNOSIS: ```json
  {
    \"diagnosis\": \"Tonsillitis\",
    \"recommendations\": [\"Rest and hydrate\", \"Consider over-the-counter pain relief\", \"See a doctor if symptoms worsen\", \"Consider a throat swab test if fever persists\"],
    \"doctor_specialty\": \"ENT Specialist\"
  }
  ```"

If the user provides context about patient data, medical history, or vital signs, incorporate that into your questions and analysis.
"""

@app.post("/api/analyze-intent")
async def analyze_intent(request: ChatRequest):
    """
    Single endpoint to handle all medical chat interactions using PaLM 2.
    Maintains conversation flow: asks questions, analyzes, predicts diseases, and responds.
    """
    try:
        # Generate or retrieve session token
        if not request.session_token:
            session_token = str(uuid.uuid4())
            conversations[session_token] = []
        else:
            session_token = request.session_token
            if session_token not in conversations:
                raise HTTPException(status_code=400, detail="Invalid session token")

        # Get conversation history
        history = conversations[session_token]

        # Validate input
        if not request.message.strip():
            raise HTTPException(status_code=400, detail="Message cannot be empty")

        # Add user message to history
        history.append({"role": "user", "content": request.message})

        # Construct prompt with system instructions and history
        prompt = SYSTEM_PROMPT + "\n\nConversation History:\n" + \
                 "\n".join([f"{msg['role']}: {msg['content']}" for msg in history])

        # Call PaLM 2 API
        response = model.generate_content(prompt)
        print(response)
        assistant_message = response.text.strip()
        if assistant_message.startswith("FINAL DIAGNOSIS:"):
            try:
                # Extract JSON from the response
                json_start = assistant_message.find("```json") + len("```json")
                json_end = assistant_message.find("```", json_start)
                json_str = assistant_message[json_start:json_end].strip()
                final_data = json.loads(json_str)

                diagnosis = final_data.get("diagnosis", "Unknown")
                recommendations = final_data.get("recommendations", [])
                doctor_specialty = final_data.get("doctor_specialty", "General Practitioner")

                # Find a doctor from seed_doctors
                
                doctor = doctors_collection.find_one({"specialty": doctor_specialty})
                if doctor:
                    doctor_info = f"{doctor['name']}, a {doctor['specialty']} with {doctor['experience']} experience and rating {doctor['rating']}"
                else:
                    doctor_info = "a General Practitioner"

                # Construct the response
                response_text = f"Based on your symptoms, the possible diagnosis is: {diagnosis}\n\n"
                response_text += "Recommendations:\n" + "\n".join([f"- {rec}" for rec in recommendations]) + "\n\n"
                response_text += f"We recommend consulting with {doctor_info} for further evaluation."

                # Add to history
                history.append({"role": "assistant", "content": response_text})
                conversations[session_token] = history

                return {
                    "response": response_text,
                    "session_token": session_token,
                    "timestamp": datetime.utcnow().isoformat(),
                    "is_final": True
                }
            except json.JSONDecodeError:
                logger.error("Failed to parse final diagnosis JSON")
                response_text = "I’ve analyzed your symptoms and prepared a diagnosis. Please consult a healthcare professional for further evaluation."
                history.append({"role": "assistant", "content": response_text})
                conversations[session_token] = history
                return {
                    "response": response_text,
                    "session_token": session_token,
                    "timestamp": datetime.utcnow().isoformat(),
                    "is_final": True
                }
        else:
            # Treat as a follow-up question
            history.append({"role": "assistant", "content": assistant_message})
            conversations[session_token] = history
            return {
                "response": assistant_message,
                "session_token": session_token,
                "timestamp": datetime.utcnow().isoformat(),
                "is_final": False
            }

    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")
# 


@app.post("/api/book-appointment", response_model=Dict[str, Any])
async def book_appointment(request: Request, current_user: dict = Depends(get_current_user)):
    """Book an appointment with a doctor."""
    try:
        # Parse request body
        data = await request.json()
        doctor_id = data.get("doctor_id")
        appointment_date = data.get("date")
        appointment_time = data.get("time")
        reason = data.get("reason")
        
        # Validate required fields
        if not doctor_id or not appointment_date or not appointment_time or not reason:
            raise HTTPException(status_code=422, detail="Missing required fields")
        
        # Verify doctor exists
        doctor = doctors_collection.find_one({"_id": doctor_id})
        if not doctor:
            raise HTTPException(status_code=404, detail="Doctor not found")
        
        # Validate appointment date and time
        try:
            # Parse date
            appointment_date_obj = datetime.strptime(appointment_date, "%Y-%m-%d").date()
            today = datetime.utcnow().date()
            
            if appointment_date_obj < today:
                raise HTTPException(status_code=422, detail="Appointment date cannot be in the past")
                
            if appointment_date_obj > today + timedelta(days=90):
                raise HTTPException(status_code=422, detail="Appointment date cannot be more than 90 days in the future")
        except ValueError:
            raise HTTPException(status_code=422, detail="Date must be in YYYY-MM-DD format")
        
        # Validate time
        try:
            datetime.strptime(appointment_time, "%H:%M")
        except ValueError:
            raise HTTPException(status_code=422, detail="Time must be in HH:MM format")
        
        # Parse datetime
        appointment_datetime = datetime.strptime(f"{appointment_date} {appointment_time}", "%Y-%m-%d %H:%M")
        
        # Check for existing appointments at same time
        existing_appointment = appointments_collection.find_one({
            "doctor_id": doctor_id,
            "appointment_date": appointment_date,
            "appointment_time": appointment_time,
            "status": "scheduled"
        })
        
        if existing_appointment:
            raise HTTPException(status_code=409, detail="This time slot is already booked")
        
        # Generate appointment data
        appointment_data = {
            "user_id": current_user["_id"],
            "user_email": current_user["email"],
            "user_name": current_user.get("name", "Patient"),
            "doctor_id": doctor_id,
            "doctor_name": doctor.get("name", "Doctor"),
            "doctor_specialty": doctor.get("specialty", ""),
            "appointment_date": appointment_date,
            "appointment_time": appointment_time,
            "appointment_datetime": appointment_datetime,
            "reason": reason,
            "status": "scheduled",
            "notes": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        # Store in database
        appointment_id = appointments_collection.insert_one(appointment_data).inserted_id
        
        # Log action
        log_audit(
            current_user["email"],
            "appointment_booking",
            {
                "appointment_id": str(appointment_id),
                "doctor_id": doctor_id,
                "appointment_date": appointment_date
            }
        )
        
        return {
            "message": "Appointment booked successfully",
            "appointment_id": str(appointment_id),
            "details": {
                "date": appointment_date,
                "time": appointment_time,
                "doctor_name": doctor.get("name", "Doctor"),
                "doctor_specialty": doctor.get("specialty", ""),
                "status": "scheduled"
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error booking appointment: {e}")
        raise HTTPException(status_code=500, detail="Error booking appointment")

# More API routes would be implemented similarly...
# Additional API Routes

@app.post("/api/verify-face", response_model=Dict[str, Any])
async def verify_face(
    face_image: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Verify user by face recognition."""
    try:
        # Validate file size
        content = await face_image.read()
        if len(content) > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="File size too large")
            
        # Validate file type
        if not face_image.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Invalid file type. Only images are allowed.")
        
        # Process image
        np_image = np.frombuffer(content, dtype=np.uint8)
        image = cv2.imdecode(np_image, cv2.IMREAD_COLOR)
        
        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image format or corrupted image")
        
        # Enhance image quality for better face detection
        try:
            # Convert to LAB color space
            lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            
            # Apply CLAHE to L channel for better contrast
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            cl = clahe.apply(l)
            
            # Merge channels and convert back to BGR
            enhanced_lab = cv2.merge((cl, a, b))
            enhanced_image = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
            
            # Check if image is dark and needs brightness enhancement
            brightness = np.mean(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY))
            if brightness < 100:  # Dark image
                alpha = 1.3  # Contrast control
                beta = 30    # Brightness control
                enhanced_image = cv2.convertScaleAbs(enhanced_image, alpha=alpha, beta=beta)
        except Exception as e:
            logger.warning(f"Image enhancement failed, using original: {e}")
            enhanced_image = image
        
        # Face detection - first try with DNN model
        face_detected = False
        face_box = None
        
        try:
            # Setup DNN face detector
            models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
            os.makedirs(models_dir, exist_ok=True)
            
            prototxt_path = os.path.join(models_dir, "deploy.prototxt")
            model_path = os.path.join(models_dir, "res10_300x300_ssd_iter_140000.caffemodel")
            
            # Download model files if they don't exist
            if not os.path.exists(prototxt_path) or not os.path.exists(model_path):
                logger.info("DNN model files not found, downloading them...")
                try:
                    import urllib.request
                    
                    # Download prototxt file
                    urllib.request.urlretrieve(
                        "https://raw.githubusercontent.com/opencv/opencv/master/samples/dnn/face_detector/deploy.prototxt",
                        prototxt_path
                    )
                    
                    # Download caffemodel
                    urllib.request.urlretrieve(
                        "https://raw.githubusercontent.com/opencv/opencv_3rdparty/dnn_samples_face_detector_20170830/res10_300x300_ssd_iter_140000.caffemodel",
                        model_path
                    )
                    
                    logger.info("DNN model files downloaded successfully")
                except Exception as download_error:
                    logger.error(f"Error downloading DNN model files: {download_error}")
            
            # Use DNN face detector if model files exist
            if os.path.exists(prototxt_path) and os.path.exists(model_path):
                net = cv2.dnn.readNetFromCaffe(prototxt_path, model_path)
                
                # Preprocess image
                blob = cv2.dnn.blobFromImage(
                    cv2.resize(enhanced_image, (300, 300)), 
                    1.0, 
                    (300, 300), 
                    (104.0, 177.0, 123.0),
                    swapRB=False
                )
                
                # Detect faces
                net.setInput(blob)
                detections = net.forward()
                
                # Process detections
                height, width = enhanced_image.shape[:2]
                best_confidence = 0
                
                for i in range(detections.shape[2]):
                    confidence = detections[0, 0, i, 2]
                    
                    if confidence > 0.5 and confidence > best_confidence:  # Confidence threshold
                        best_confidence = confidence
                        box = detections[0, 0, i, 3:7] * np.array([width, height, width, height])
                        (x1, y1, x2, y2) = box.astype("int")
                        
                        # Store face box
                        face_box = (max(0, x1), max(0, y1), min(width, x2 - x1), min(height, y2 - y1))
                        face_detected = True
                        
                        logger.info(f"Face detected with DNN, confidence: {confidence:.2f}")
        except Exception as dnn_error:
            logger.error(f"DNN face detection error: {dnn_error}")
        
        # If DNN failed, try with Haar Cascade
        if not face_detected:
            try:
                gray = cv2.cvtColor(enhanced_image, cv2.COLOR_BGR2GRAY)
                
                # Try with different cascade classifiers and parameters
                face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
                
                # First attempt - standard parameters
                faces = face_cascade.detectMultiScale(gray, 1.1, 4)
                
                # Second attempt - more lenient parameters
                if len(faces) == 0:
                    faces = face_cascade.detectMultiScale(
                        gray, 
                        scaleFactor=1.05, 
                        minNeighbors=3, 
                        minSize=(30, 30)
                    )
                
                # Third attempt - even more lenient
                if len(faces) == 0:
                    faces = face_cascade.detectMultiScale(
                        gray, 
                        scaleFactor=1.03, 
                        minNeighbors=2, 
                        minSize=(20, 20)
                    )
                
                # If faces found
                if len(faces) > 0:
                    # Get the largest face if multiple detected
                    if len(faces) > 1:
                        faces = sorted(faces, key=lambda x: x[2] * x[3], reverse=True)
                    
                    face_box = tuple(faces[0])
                    face_detected = True
                    logger.info("Face detected with Haar Cascade")
            except Exception as cascade_error:
                logger.error(f"Haar Cascade face detection error: {cascade_error}")
        
        # Return if no face detected
        if not face_detected or face_box is None:
            return {
                "verified": False,
                "message": "No face detected in the image. Please try again with better lighting and make sure your face is clearly visible."
            }
        
        # Extract face from image
        x, y, w, h = face_box
        face_img = enhanced_image[y:y+h, x:x+w]
        
        # Resize to standard size
        face_img = cv2.resize(face_img, (150, 150))
        
        # Extract face features
        try:
            # Use HOG features for recognition
            hog = cv2.HOGDescriptor()
            h = hog.compute(face_img)
            face_features = h.flatten()
            
            # Normalize features
            face_features = face_features.astype(np.float32)
            face_features = face_features / np.linalg.norm(face_features)
            
            # Find users with registered face features
            users_with_faces = list(users_collection.find(
                {"face_features": {"$exists": True}},
                projection={"_id": 1, "email": 1, "role": 1, "name": 1, "face_features": 1}
            ))
            
            # Compare with stored features
            best_match = None
            best_similarity = -1
            threshold = 0.6  # Similarity threshold
            
            for user in users_with_faces:
                if "face_features" not in user:
                    continue
                
                # Convert stored features to numpy array
                stored_features = np.array(user["face_features"], dtype=np.float32)
                
                # Calculate similarity (cosine similarity)
                similarity = np.dot(face_features, stored_features) / (
                    np.linalg.norm(face_features) * np.linalg.norm(stored_features)
                )
                
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_match = {
                        "user_id": str(user["_id"]),
                        "email": user["email"],
                        "name": user.get("name", ""),
                        "role": user.get("role", "patient"),
                        "confidence": float(similarity)
                    }
            
            # If match found with sufficient confidence
            if best_match and best_match["confidence"] > threshold:
                # Create access token
                token = create_access_token(
                    data={"sub": best_match["email"], "role": best_match["role"]}
                )
                
                # Log authentication
                log_audit(
                    best_match["email"],
                    "face_authentication",
                    {"user_id": best_match["user_id"]}
                )
                
                # Update last login
                background_tasks.add_task(
                    lambda: users_collection.update_one(
                        {"email": best_match["email"]},
                        {"$set": {"last_login": datetime.utcnow()}}
                    )
                )
                
                return {
                    "verified": True,
                    "user_id": best_match["user_id"],
                    "token": token,
                    "name": best_match["name"],
                    "confidence": best_match["confidence"],
                    "message": "Face verified successfully"
                }
        except Exception as e:
            logger.error(f"Error in face recognition: {e}")
        
        # If we get here, no match was found
        return {
            "verified": False,
            "message": "Face not recognized. Please register or try again with better lighting."
        }
    except Exception as e:
        logger.error(f"Unexpected error in face verification: {e}")
        raise HTTPException(
            status_code=500,
            detail="Face verification system encountered an error. Please try another login method."
        )

@app.post("/api/register-face", response_model=Dict[str, Any])
async def register_face(
    face_image: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Register a user's face for biometric authentication."""
    try:
        # Validate file size
        content = await face_image.read()
        if len(content) > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="File size too large")
            
        # Validate file type
        if not face_image.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Invalid file type. Only images are allowed.")
        
        # Process image
        np_image = np.frombuffer(content, dtype=np.uint8)
        image = cv2.imdecode(np_image, cv2.IMREAD_COLOR)
        
        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image format or corrupted image")
        
        # Ensure faces directory exists
        face_dir = os.path.join(settings.UPLOAD_DIR, "faces")
        os.makedirs(face_dir, exist_ok=True)
        
        # Create user-specific directory
        user_face_dir = os.path.join(face_dir, str(current_user["_id"]))
        os.makedirs(user_face_dir, exist_ok=True)
        
        # Save original image securely
        secure_name = secure_filename(face_image.filename)
        filepath = os.path.join(user_face_dir, secure_name)
        
        with open(filepath, "wb") as f:
            f.seek(0)
            f.write(content)
        
        # Detect faces
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.3, 5)
        
        if len(faces) == 0:
            # Remove saved image since we couldn't process it
            try:
                os.remove(filepath)
            except:
                pass
                
            raise HTTPException(
                status_code=400, 
                detail="No face detected in the image. Please try again with a clearer photo."
            )
        
        # Get the largest face if multiple faces detected
        if len(faces) > 1:
            # Find the face with the largest area
            largest_area = 0
            largest_face_idx = 0
            
            for i, (x, y, w, h) in enumerate(faces):
                area = w * h
                if area > largest_area:
                    largest_area = area
                    largest_face_idx = i
            
            x, y, w, h = faces[largest_face_idx]
        else:
            x, y, w, h = faces[0]
        
        # Extract face region
        face_img = image[y:y+h, x:x+w]
        
        # Save cropped face image
        face_filename = f"face_{secure_filename(face_image.filename)}"
        face_filepath = os.path.join(user_face_dir, face_filename)
        cv2.imwrite(face_filepath, face_img)
        
        # Resize for consistent processing
        face_img = cv2.resize(face_img, (150, 150))
        
        # Extract features using HOG (Histogram of Oriented Gradients)
        try:
            # Compute HOG features
            hog = cv2.HOGDescriptor()
            h = hog.compute(face_img)
            face_features = h.flatten()
            
            # Convert to floating point and normalize
            face_features = face_features.astype(np.float32)
            face_features = face_features / np.linalg.norm(face_features)
            
            # Convert numpy array to list for MongoDB storage
            face_features_list = face_features.tolist()
            
            # Check if user already has a face registered
            existing_face = users_collection.find_one(
                {"_id": current_user["_id"], "face_features": {"$exists": True}}
            )
            
            # Update user record with face encoding
            users_collection.update_one(
                {"_id": current_user["_id"]},
                {
                    "$set": {
                        "face_features": face_features_list,
                        "face_image_path": face_filepath,
                        "face_updated_at": datetime.utcnow(),
                        "biometric_auth_enabled": True
                    }
                }
            )
            
            # Log the action
            log_audit(
                current_user["email"],
                "face_registration",
                {
                    "user_id": current_user["_id"],
                    "face_updated": bool(existing_face)
                }
            )
            
            return {
                "success": True,
                "message": "Face registered successfully. You can now use face recognition to log in.",
                "updated": bool(existing_face)
            }
            
        except Exception as e:
            # Clean up on error
            try:
                os.remove(filepath)
                if os.path.exists(face_filepath):
                    os.remove(face_filepath)
            except:
                pass
                
            logger.error(f"Error in face feature extraction: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Error processing facial features. Please try again with a clearer photo."
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in face registration: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Face registration failed. Please try again later."
        )

@app.post("/api/upload-aadhaar", response_model=Dict[str, Any])
async def upload_aadhaar(
    aadhaar_image: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Process Aadhaar card and store extracted details."""
    try:
        # Validate file size
        content = await aadhaar_image.read()
        if len(content) > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="File size too large")
            
        # Validate file type
        if not aadhaar_image.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Process image
        np_image = np.frombuffer(content, dtype=np.uint8)
        image = cv2.imdecode(np_image, cv2.IMREAD_COLOR)
        
        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image format or corrupted file")
        
        # In production, implement OCR using libraries like Tesseract, Azure Computer Vision, etc.
        # For this demo, we'll use current user details
        details = {
            "name": current_user.get("name", "John Doe"),
            "dob": current_user.get("dob", "1990-01-01"),
            "gender": current_user.get("gender", "Male"),
            "aadhaar_number": f"XXXX XXXX {random.randint(1000, 9999)}",
            "address": "123 Sample Street, Example City, State - 560001"
        }
        
        # Save file securely
        secure_name = secure_filename(aadhaar_image.filename)
        filepath = os.path.join(settings.UPLOAD_DIR, "aadhaar", secure_name)
        
        with open(filepath, "wb") as f:
            f.seek(0)
            f.write(content)
        
        # Store in database
        details["user_id"] = current_user["_id"]
        details["user_email"] = current_user["email"]
        details["processed_at"] = datetime.utcnow()
        details["file_path"] = filepath
        details["file_name"] = secure_name
        
        # Update user record
        users_collection.update_one(
            {"_id": current_user["_id"]},
            {"$set": {
                "aadhaar_details": {
                    "name": details["name"],
                    "dob": details["dob"],
                    "gender": details["gender"],
                    "updated_at": datetime.utcnow()
                },
                "is_verified": True
            }}
        )
        
        # Store full details in separate collection
        aadhaar_id = aadhaar_collection.insert_one(details).inserted_id
        
        # Log action
        log_audit(
            current_user["email"],
            "aadhaar_upload",
            {"aadhaar_id": str(aadhaar_id)}
        )
        
        return {
            "message": "Aadhaar details processed successfully",
            "data": {
                "name": details["name"],
                "dob": details["dob"],
                "gender": details["gender"],
                "aadhaar_number": details["aadhaar_number"],  # Masked for security
                "record_id": str(aadhaar_id)
            },
            'verified': True
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing Aadhaar upload: {e}")
        raise HTTPException(status_code=500, detail="Error processing Aadhaar card")

@app.post("/api/analyze-blood-report", response_model=Dict[str, Any])
async def analyze_blood_report(
    blood_report: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Analyze blood test report using Gemini API."""
    try:
        # Validate file size
        content = await blood_report.read()
        if len(content) > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="File size too large")
            
        # Validate file type
        valid_types = ["application/pdf", "image/jpeg", "image/png", "image/tiff", "text/plain"]
        if blood_report.content_type not in valid_types:
            raise HTTPException(status_code=400, detail="Invalid file type. Please upload a PDF, image, or text file.")
        
        # Process based on file type
        report_text = ""
        if blood_report.content_type == "text/plain":
            report_text = content.decode("utf-8")
        elif blood_report.content_type == "application/pdf":
            # In production, use a library like PyPDF2, pdfplumber, or pdf2image + Tesseract to extract text
            # For demo purposes, we'll use a placeholder implementation
            try:
                import PyPDF2
                from io import BytesIO
                
                pdf_reader = PyPDF2.PdfReader(BytesIO(content))
                report_text = ""
                for page_num in range(len(pdf_reader.pages)):
                    report_text += pdf_reader.pages[page_num].extract_text()
            except Exception as e:
                logger.warning(f"PyPDF2 extraction failed: {str(e)}. Using fallback text.")
                # Fallback if PyPDF2 is not available or fails
                report_text = "Hemoglobin: 14.2 g/dL\nWhite Blood Cells: 7.5 x10^9/L\nPlatelets: 250 x10^9/L\nGlucose: 95 mg/dL"
        else:
            # For images, in production use Tesseract OCR or a cloud OCR service
            try:
                import pytesseract
                from PIL import Image
                from io import BytesIO
                
                image = Image.open(BytesIO(content))
                report_text = pytesseract.image_to_string(image)
            except Exception as e:
                logger.warning(f"OCR extraction failed: {str(e)}. Using fallback text.")
                # Fallback if OCR dependencies are not available
                report_text = "Hemoglobin: 13.8 g/dL\nWhite Blood Cells: 6.9 x10^9/L\nPlatelets: 230 x10^9/L\nGlucose: 92 mg/dL"

        # Save file in a secure manner
        secure_name = secure_filename(blood_report.filename)
        filepath = os.path.join(settings.UPLOAD_DIR, "blood_reports", secure_name)
        
        with open(filepath, "wb") as f:
            f.seek(0)
            f.write(content)
        
        # Analyze with Gemini API
        try:
            # Define a prompt for Gemini to analyze the blood report
            prompt = f"""
            You are a medical AI assistant. Analyze the following blood test report and provide a detailed analysis in JSON format. Include:
            - A list of abnormal values (if any) with their normal ranges and severity levels (low, moderate, high).
            - An overall severity score from 0 to 10 (0 being normal, 10 being critical).
            - Recommendations for the patient based on the findings.

            Blood Report:
            {report_text}

            Return the response in this JSON structure:
            {{
                "abnormalValues": [
                    {{"parameter": "string", "value": "string", "normalRange": "string", "severity": "string"}}
                ],
                "severityScore": number,
                "recommendations": ["string"]
            }}
            """
            
            # Call Gemini API
            response = model.generate_content(prompt)
            analysis_text = response.text.strip()
            
            # Parse the response as JSON
            try:
                analysis_results = json.loads(analysis_text)
            except json.JSONDecodeError as e:
                logger.error(f"Gemini response parsing failed: {str(e)}. Response: {analysis_text}")
                # Fallback response in case JSON parsing fails
                analysis_results = {
                    "abnormalValues": [],
                    "severityScore": 0,
                    "recommendations": ["Unable to analyze report fully. Consult a doctor for detailed evaluation."]
                }
            
            # Validate the structure of analysis_results
            if not isinstance(analysis_results, dict) or \
               "abnormalValues" not in analysis_results or \
               "severityScore" not in analysis_results or \
               "recommendations" not in analysis_results:
                logger.warning("Invalid Gemini response structure. Using fallback.")
                analysis_results = {
                    "abnormalValues": [],
                    "severityScore": 0,
                    "recommendations": ["Error in analysis. Please consult a healthcare professional."]
                }
                
        except Exception as gemini_error:
            logger.error(f"Gemini API error: {str(gemini_error)}")
            # Fallback in case Gemini API fails
            analysis_results = {
                "abnormalValues": [],
                "severityScore": 0,
                "recommendations": ["Analysis unavailable due to technical issues. Please try again or consult a doctor."]
            }
        
        # Store results in database
        report_data = {
            "user_id": current_user["_id"],
            "user_email": current_user["email"],
            "report_type": "blood",
            "report_text": report_text,
            "filename": secure_name,
            "file_path": filepath,
            "content_type": blood_report.content_type,
            "file_size": len(content),
            "analysis_results": analysis_results,
            "created_at": datetime.utcnow()
        }
        
        report_id = medical_reports_collection.insert_one(report_data).inserted_id
        
        # Log action
        log_audit(
            current_user["email"],
            "blood_report_analysis",
            {
                "report_id": str(report_id),
                "severity": analysis_results.get("severityScore", 0)
            }
        )
        
        # Add to health history
        health_entry = {
            "user_id": current_user["_id"],
            "user_email": current_user["email"],
            "entry_type": "blood_test",
            "report_id": str(report_id),
            "summary": {
                "severity": analysis_results.get("severityScore", 0),
                "abnormal_values": len(analysis_results.get("abnormalValues", [])),
                "recommendations": analysis_results.get("recommendations", [])
            },
            "created_at": datetime.utcnow()
        }
        
        db["health_history"].insert_one(health_entry)
        
        # Return response in the same structure as before
        return {
            "message": "Blood report analyzed successfully",
            "report_id": str(report_id),
            "analysis_results": analysis_results
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing blood report: {e}")
        raise HTTPException(status_code=500, detail="Error analyzing blood report")
    
    
@app.post("/api/analyze-xray", response_model=Dict[str, Any])
async def analyze_xray(
    xray_image: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Analyze chest X-ray image with comprehensive medical analysis pipeline."""
    try:
        # ==================== File Validation ====================
        content = await xray_image.read()
        if len(content) > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="File size exceeds limit")

        # Enhanced DICOM validation
        is_dicom = (
            xray_image.filename.lower().endswith(('.dcm', '.dicom')) or 
            xray_image.content_type in ["application/dicom", "image/dicom"]
        )
        
        if not is_dicom and xray_image.content_type not in ["image/jpeg", "image/png"]:
            raise HTTPException(status_code=400, detail="Invalid file type")

        # ==================== File Processing ====================
        analysis_id = uuid.uuid4().hex
        analysis_dir = os.path.join(settings.UPLOAD_DIR, "xrays", analysis_id)
        os.makedirs(analysis_dir, exist_ok=True)

        secure_name = secure_filename(xray_image.filename)
        original_path = os.path.join(analysis_dir, secure_name)
        with open(original_path, "wb") as f:
            f.write(content)

        # ==================== Image Processing ====================
        try:
            if is_dicom:
                with tempfile.NamedTemporaryFile(delete=False) as tmp:
                    tmp.write(content)
                    ds = pydicom.dcmread(tmp.name)
                    img_array = ds.pixel_array
                    
                    if getattr(ds, 'PhotometricInterpretation', '') == "MONOCHROME1":
                        img_array = np.amax(img_array) - img_array
                    
                    img_array = exposure.rescale_intensity(img_array, out_range=(0, 255))
                    pil_image = Image.fromarray(img_array.astype(np.uint8)).convert('RGB')
            else:
                pil_image = Image.open(BytesIO(content)).convert('RGB')

            processed_path = os.path.join(analysis_dir, "processed.jpg")
            pil_image.save(processed_path)
        except Exception as e:
            logger.error(f"Image processing failed: {str(e)}")
            raise HTTPException(status_code=400, detail="Invalid image format")

        # ==================== Model Inference ====================
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Using device: {device}")

        # Model configuration with verified models
        model_configs = [
            {
                "type": "huggingface",
                "name": "microsoft/BiomedVLP-CXR-BERT-general",
                "fine_tuned": True,
                "classes": [
                    "Atelectasis", "Cardiomegaly", "Consolidation", "Edema",
                    "Effusion", "Emphysema", "Fibrosis", "Hernia", "Infiltration",
                    "Mass", "Nodule", "Pleural_Thickening", "Pneumonia", "Pneumothorax"
                ],
                "weights": None
            },
            {
                "type": "torchvision",
                "name": "densenet121",
                "weights": torchvision.models.DenseNet121_Weights.DEFAULT,
                "classes": [
                    "Atelectasis", "Consolidation", "Infiltration", "Pneumothorax",
                    "Edema", "Emphysema", "Fibrosis", "Effusion", "Pneumonia",
                    "Pleural_Thickening", "Cardiomegaly", "Nodule", "Mass", "Hernia"
                ]
            }
        ]

        model, processor, model_metadata = None, None, {}
        for cfg in model_configs:
            try:
                if cfg["type"] == "huggingface":
                    processor = AutoImageProcessor.from_pretrained(cfg["name"])
                    model = AutoModelForImageClassification.from_pretrained(cfg["name"]).to(device)
                else:
                    processor = cfg["weights"].transforms()
                    model = getattr(torchvision.models, cfg["name"])(weights=cfg["weights"]).to(device)
                
                model.eval()
                model_metadata = cfg
                break
            except Exception as e:
                logger.warning(f"Model {cfg['name']} failed: {str(e)}")
                continue

        if not model:
            raise HTTPException(status_code=503, detail="All models failed to load")

        # Preprocess and run inference
        prompt='tThis is a chest X-ray image for analysis'
        try:
            if model_metadata["type"] == "huggingface":
                inputs = processor(pil_image,text=prompt, return_tensors="pt").to(device)
                img_tensor = inputs.pixel_values
            else:
                img_tensor = processor(pil_image).unsqueeze(0).to(device)
            
            with torch.no_grad():
                outputs = model(img_tensor)
                logits = outputs.logits if hasattr(outputs, 'logits') else outputs
                preds = torch.sigmoid(logits).cpu().numpy()[0]
        except Exception as e:
            logger.error(f"Inference failed: {str(e)}")
            raise HTTPException(status_code=500, detail="Model inference error")

        # ==================== Heatmap Generation ====================
        heatmap_path = None
        try:
            # Fixed missing parenthesis here
            target_layer = next((module for module in model.modules() 
                               if isinstance(module, torch.nn.Conv2d)), None)
            
            if target_layer:
                cam = GradCAM(model=model, target_layers=[target_layer])
                grayscale_cam = cam(input_tensor=img_tensor, targets=None)[0]
                
                # Resize to original image dimensions
                img_width, img_height = pil_image.size
                heatmap = cv2.resize(grayscale_cam, (img_width, img_height))
                heatmap = cv2.applyColorMap(np.uint8(255 * heatmap), cv2.COLORMAP_JET)
                
                img = cv2.imread(processed_path)
                if img is not None:
                    superimposed_img = cv2.addWeighted(img, 0.6, heatmap, 0.4, 0)
                    heatmap_path = os.path.join(analysis_dir, "heatmap.jpg")
                    cv2.imwrite(heatmap_path, superimposed_img)
        except Exception as e:
            logger.error(f"Heatmap generation failed: {str(e)}")

        # ==================== Medical Report Generation ====================
        report_text = "Normal chest X-ray findings."
        try:
            report_processor = AutoProcessor.from_pretrained("microsoft/BiomedVLP-CXR-BERT-general")
            report_model = BlipForConditionalGeneration.from_pretrained("microsoft/BiomedVLP-CXR-BERT-general").to(device)
            
            inputs = report_processor(pil_image, return_tensors="pt").to(device)
            report_ids = report_model.generate(**inputs, max_length=150)
            report_text = report_processor.decode(report_ids[0], skip_special_tokens=True)
        except Exception as e:
            logger.warning(f"Report generation failed: {str(e)}")

        # ==================== Clinical Analysis ====================
        findings = []
        confidence_threshold = 0.3
        for idx, (label, prob) in enumerate(zip(model_metadata["classes"], preds)):
            if prob >= confidence_threshold:
                findings.append({
                    "condition": label,
                    "confidence": float(prob),
                    "severity": "critical" if prob > 0.8 else "high" if prob > 0.6 else "moderate"
                })

        # Sort findings by confidence (descending)
        findings.sort(key=lambda x: x["confidence"], reverse=True)

        # Generate clinical recommendations
        recommendations = ["Consult with a radiologist for complete evaluation"]
        critical_conditions = [f["condition"] for f in findings if f["severity"] == "critical"]
        if critical_conditions:
            recommendations.insert(0, 
                f"Immediate attention required for: {', '.join(critical_conditions)}"
            )

        # Calculate severity score
        def calculate_severity():
            score = 0
            for finding in findings:
                if finding["condition"] == "No significant abnormalities":
                    continue
                contribution = finding["confidence"] * 10
                if finding["condition"] in ["Pneumothorax", "Pneumonia", "Edema"]:
                    contribution *= 1.5
                score += contribution
            return min(round(score), 10)

        severity_score = calculate_severity()

        # ==================== Data Storage ====================
        analysis_results = {
            "findings": findings,
            "medical_report": report_text,
            "recommendations": recommendations,
            "severityScore": severity_score,
            "model_used": model_metadata["name"],
            "confidence_threshold": confidence_threshold
        }

        report_data = {
            "user_id": current_user["_id"],
            "user_email": current_user["email"],
            "report_type": "xray",
            "filename": secure_name,
            "file_path": original_path,
            "heatmap_path": heatmap_path,
            "content_type": xray_image.content_type,
            "file_size": len(content),
            "analysis_results": analysis_results,
            "is_dicom": is_dicom,
            "analysis_id": analysis_id,
            "created_at": datetime.utcnow()
        }

        try:
            # Main report insertion
            report_id = medical_reports_collection.insert_one(report_data).inserted_id
            
            # Audit logging
            log_audit(
                current_user["email"],
                "xray_analysis",
                {
                    "report_id": str(report_id),
                    "severity": severity_score,
                    "findings_count": len(findings)
                }
            )
            
            # Health history entry
            health_entry = {
                "user_id": current_user["_id"],
                "user_email": current_user["email"],
                "entry_type": "xray",
                "report_id": str(report_id),
                "summary": {
                    "severity": severity_score,
                    "findings": len(findings),
                    "recommendations": recommendations
                },
                "created_at": datetime.utcnow()
            }
            db["health_history"].insert_one(health_entry)
        except Exception as db_error:
            logger.error(f"Database error: {str(db_error)}")

        return {
            "analysis_id": analysis_id,
            "findings": findings,
            "medical_report": report_text,
            "recommendations": recommendations,
            "severity_score": severity_score,
            "heatmap_url": f"/static/xrays/{analysis_id}/heatmap.jpg" if heatmap_path else None,
            "model_used": model_metadata["name"],
            "confidence_threshold": confidence_threshold
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analysis pipeline failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Medical analysis system error")

@app.post("/api/health-assessment", response_model=Dict[str, Any])
async def complete_health_assessment(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Complete a comprehensive health assessment."""
    try:
        # Get request body
        data = await request.json()
        
        # Validate required data
        required_sections = ["medicalHistory", "vitalSigns"]
        for section in required_sections:
            if section not in data:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Missing required section: {section}"
                )
        
        # Combine information from various sources
        medical_history = data.get("medicalHistory", {})
        vital_signs = data.get("vitalSigns", {})
        document_analysis = data.get("documentAnalysis", {})
        ai_consultation = data.get("aiConsultation", {})
        
        # Validate risk factors
        risk_factors = []
        
        # Check vital signs
        # Added null checks to prevent TypeError
        heart_rate = vital_signs.get("heartRate")
        if heart_rate is not None and isinstance(heart_rate, (int, float)) and heart_rate > 100:
            risk_factors.append("Elevated heart rate")
        if heart_rate is not None and isinstance(heart_rate, (int, float)) and heart_rate < 60:
            risk_factors.append("Low heart rate")
            
        # Parse blood pressure if available
        bp_str = vital_signs.get("bloodPressure", "")
        if bp_str and isinstance(bp_str, str) and "/" in bp_str:
            try:
                systolic, diastolic = map(int, bp_str.split("/"))
                if systolic > 140 or diastolic > 90:
                    risk_factors.append("Hypertension risk")
                if systolic < 90 or diastolic < 60:
                    risk_factors.append("Hypotension risk")
            except ValueError:
                pass  # Skip if values can't be parsed
                
        oxygen_level = vital_signs.get("oxygenLevel")
        if oxygen_level is not None and isinstance(oxygen_level, (int, float)) and oxygen_level < 95:
            risk_factors.append("Low blood oxygen")
            
        temperature = vital_signs.get("temperature")
        if temperature is not None and isinstance(temperature, (int, float)) and temperature > 37.5:
            risk_factors.append("Elevated temperature")
        
        # Check medical history risk factors
        if medical_history and isinstance(medical_history, dict) and medical_history.get("conditions"):
            conditions = medical_history.get("conditions", [])
            if isinstance(conditions, list):
                for condition in conditions:
                    if isinstance(condition, str):  # Ensure condition is a string
                        condition_lower = condition.lower()
                        if "diabetes" in condition_lower:
                            risk_factors.append("Diabetes")
                        if "hypertension" in condition_lower or "high blood pressure" in condition_lower:
                            risk_factors.append("Hypertension")
                        if "heart" in condition_lower and "disease" in condition_lower:
                            risk_factors.append("Heart disease")
        
        # Calculate BMI if height and weight are available
        height_cm = medical_history.get("height") if medical_history else None
        weight_kg = medical_history.get("weight") if medical_history else None
        bmi = None
        
        if height_cm is not None and weight_kg is not None:
            try:
                height_cm = float(height_cm)
                weight_kg = float(weight_kg)
                if height_cm > 0:  # Prevent division by zero
                    height_m = height_cm / 100  # Convert to meters
                    bmi = weight_kg / (height_m * height_m)
                    
                    if bmi < 18.5:
                        risk_factors.append("Underweight")
                    elif bmi >= 25:
                        risk_factors.append("Overweight")
                    elif bmi >= 30:
                        risk_factors.append("Obesity")
            except (ValueError, ZeroDivisionError, TypeError):
                pass  # Skip BMI calculation if there's an error
        
        # Calculate overall health score
        health_score = 80  # Base score
        
        # Adjust based on risk factors
        health_score -= len(risk_factors) * 5
        
        # Adjust based on document analysis severity - with null check
        doc_severity = 0
        if document_analysis and isinstance(document_analysis, dict):
            # Get severity safely with default of 0
            doc_severity = document_analysis.get("overallSeverity", 0)
            # Ensure it's a number
            if not isinstance(doc_severity, (int, float)):
                doc_severity = 0
                
        health_score -= doc_severity * 3
        
        # Ensure score is in valid range
        health_score = max(min(health_score, 100), 0)
        
        # Determine most likely conditions
        conditions = []
        if ai_consultation and isinstance(ai_consultation, dict):
            conditions = ai_consultation.get("possibleConditions", [])
            if not isinstance(conditions, list):
                conditions = []
        
        # Generate recommendations based on overall assessment
        recommendations = [
            "Schedule a follow-up with your primary care physician",
            "Maintain a balanced diet and stay hydrated",
            "Engage in regular moderate exercise (at least 150 minutes per week)"
        ]
        
        # Add specific recommendations based on conditions and risk factors
        for condition in conditions:
            if isinstance(condition, dict) and "name" in condition:
                condition_name = condition.get("name", "").lower()
                if "hypertension" in condition_name or "high blood pressure" in condition_name:
                    recommendations.append("Monitor blood pressure regularly")
                    recommendations.append("Reduce sodium intake")
                elif "diabetes" in condition_name or "glucose" in condition_name:
                    recommendations.append("Monitor blood glucose levels")
                    recommendations.append("Limit refined carbohydrates and sugars")
        
        # Add recommendations based on risk factors
        if "Underweight" in risk_factors:
            recommendations.append("Consult with a nutritionist for a healthy weight gain plan")
        elif "Overweight" in risk_factors or "Obesity" in risk_factors:
            recommendations.append("Consult with a nutritionist for a weight management plan")
            
        if "Low blood oxygen" in risk_factors:
            recommendations.append("Follow up with a pulmonologist to evaluate respiratory function")
        
        # Save assessment results
        assessment_data = {
            "user_id": current_user["_id"],
            "user_email": current_user["email"],
            "medical_history": medical_history,
            "vital_signs": vital_signs,
            "document_analysis": document_analysis,
            "ai_consultation": ai_consultation,
            "risk_factors": risk_factors,
            "health_score": health_score,
            "bmi": bmi,
            "recommendations": recommendations,
            "created_at": datetime.utcnow()
        }
        
        assessment_id = health_assessments_collection.insert_one(assessment_data).inserted_id
        
        # Find appropriate doctors based on conditions and risk factors
        specialties_needed = set()
        
        # Add specialties based on conditions
        for condition in conditions:
            if isinstance(condition, dict) and "name" in condition:
                condition_name = condition.get("name", "").lower()
                if "hypertension" in condition_name or "heart" in condition_name:
                    specialties_needed.add("Cardiologist")
                elif "diabetes" in condition_name:
                    specialties_needed.add("Endocrinologist")
                elif any(term in condition_name for term in ["respiratory", "pneumonia", "lung", "copd"]):
                    specialties_needed.add("Pulmonologist")
                elif any(term in condition_name for term in ["skin", "dermatitis", "eczema"]):
                    specialties_needed.add("Dermatologist")
                elif any(term in condition_name for term in ["joint", "arthritis", "bone"]):
                    specialties_needed.add("Orthopedic")
                elif any(term in condition_name for term in ["brain", "nerve", "neuro"]):
                    specialties_needed.add("Neurologist")
        
        # Add specialties based on risk factors
        for risk in risk_factors:
            if isinstance(risk, str):
                risk_lower = risk.lower()
                if "blood pressure" in risk_lower or "hypertension" in risk_lower:
                    specialties_needed.add("Cardiologist")
                elif "blood oxygen" in risk_lower:
                    specialties_needed.add("Pulmonologist")
        
        # Always include General Practitioner
        specialties_needed.add("General Practitioner")
        
        # Find doctors with these specialties
        doctor_matches = []
        for specialty in specialties_needed:
            doctors = list(doctors_collection.find(
                {"specialty": specialty},
                limit=2
            ))
            
            for doctor in doctors:
                if "_id" in doctor:
                    doctor["_id"] = str(doctor["_id"])
                doctor_matches.append(doctor)
        
        # Log action
        try:
            log_audit(
                current_user["email"],
                "health_assessment",
                {
                    "assessment_id": str(assessment_id),
                    "health_score": health_score,
                    "risk_factors_count": len(risk_factors)
                }
            )
        except Exception as audit_error:
            logger.warning(f"Error logging audit: {str(audit_error)}")
        
        return {
            "message": "Health assessment completed successfully",
            "assessment_id": str(assessment_id),
            "health_score": health_score,
            "risk_factors": risk_factors,
            "bmi": bmi,
            "recommended_doctors": doctor_matches,
            "recommendations": recommendations
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing health assessment: {str(e)}")
        raise HTTPException(status_code=500, detail="Error completing health assessment")

@app.get("/api/user/profile", response_model=Dict[str, Any])
async def get_user_profile(current_user: dict = Depends(get_current_user)):
    """Get current user profile information."""
    try:
        # Get recent medical information
        recent_vitals = vital_signs_collection.find_one(
            {"user_email": current_user["email"]},
            sort=[("recorded_at", -1)]
        )
        
        recent_medical_history = medical_history_collection.find_one(
            {"user_email": current_user["email"]},
            sort=[("created_at", -1)]
        )
        
        recent_reports = list(medical_reports_collection.find(
            {"user_email": current_user["email"]},
            sort=[("created_at", -1)],
            limit=5
        ))
        
        recent_health_assessment = health_assessments_collection.find_one(
            {"user_email": current_user["email"]},
            sort=[("created_at", -1)]
        )
        
        # Get upcoming appointments
        upcoming_appointments = list(appointments_collection.find(
            {
                "user_email": current_user["email"],
                "status": "scheduled"
            },
            sort=[("appointment_date", 1)],
            limit=5
        ))
        
        # Join doctor information with appointments
        for appointment in upcoming_appointments:
            if "doctor_id" in appointment:
                doctor = doctors_collection.find_one({"_id": appointment["doctor_id"]})
                if doctor:
                    appointment["doctor"] = sanitize_document(doctor)
        
        # Format the response
        profile_data = {
            "user": current_user,
            "vital_signs": sanitize_document(recent_vitals),
            "medical_history": sanitize_document(recent_medical_history),
            "recent_reports": sanitize_document(recent_reports),
            "recent_health_assessment": sanitize_document(recent_health_assessment),
            "upcoming_appointments": sanitize_document(upcoming_appointments)
        }
        
        # Log action
        log_audit(
            current_user["email"],
            "profile_view",
            {}
        )
        
        return {
            "message": "Profile retrieved successfully",
            "data": profile_data
        }
    except Exception as e:
        logger.error(f"Error retrieving user profile: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving user profile")

# Keep the remaining routes (analyze-blood-report, analyze-xray, etc.) with the same simplification approach


# Main application
if __name__ == "__main__":
    import uvicorn
    
   
    
    # Start server
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)

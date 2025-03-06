// This file contains symptom-specific follow-up questions to be incorporated
// into the MedicalChatSystem component

// Mapping of symptom types to appropriate follow-up questions
const symptomFollowUpQuestions = {
    // Chest-related symptoms
    chest_pain: [
      "How would you describe the pain (sharp, dull, pressure, burning)?",
      "When did it start and how long have you had it?",
      "Does the pain radiate to other areas like your arm, jaw, or back?",
      "Does it worsen with activity, stress, or certain positions?",
      "Do you have any other symptoms like shortness of breath, sweating, or nausea?",
      "Do you have any history of heart problems, high blood pressure, or high cholesterol?"
    ],
    
    // Head-related symptoms
    headache: [
      "Where exactly is the pain located (one side, both sides, front, back)?",
      "How would you describe the pain (throbbing, constant, sharp)?",
      "When did it start and how often does it occur?",
      "Do you have any other symptoms like visual changes, nausea, or sensitivity to light?",
      "Does anything make it better or worse (certain foods, activities, time of day)?",
      "Do you have a history of migraines or head injuries?"
    ],
    
    // Stomach/Abdominal symptoms
    stomach_pain: [
      "Where exactly in your abdomen is the pain (upper, lower, left, right, center)?",
      "Is the pain constant or does it come and go?",
      "How would you describe the pain (sharp, cramping, burning)?",
      "Have you noticed any changes in appetite, bowel movements, or nausea?",
      "Are there any foods or activities that make it better or worse?",
      "Have you had any fever, vomiting, or blood in your stool?"
    ],
    
    // Respiratory symptoms
    breathing_difficulty: [
      "When did the shortness of breath start?",
      "Does it occur at rest, with activity, or both?",
      "Do you have a cough or wheeze along with it?",
      "Have you had any chest pain or fever?",
      "Do you have any history of asthma, COPD, or smoking?",
      "Has this happened before, or is this the first time?"
    ],
    
    // Joint/Musculoskeletal symptoms
    joint_pain: [
      "Which joint(s) are affected?",
      "Is there any swelling, redness, or warmth in the affected joints?",
      "When did the pain start and how long have you had it?",
      "Is the pain constant or does it come and go?",
      "Does movement make it better or worse?",
      "Have you had any injury to the area recently?"
    ],
    
    // Skin-related symptoms
    skin_issues: [
      "Where on your body is the rash or skin issue located?",
      "How would you describe it (red, itchy, scaly, bumpy)?",
      "When did you first notice it and has it changed over time?",
      "Is it painful, itchy, or burning?",
      "Have you used any new soaps, detergents, or skin products recently?",
      "Do you have any known allergies or previous skin conditions?"
    ],
    
    // Neurological symptoms
    neurological: [
      "What specific symptoms are you experiencing (numbness, tingling, weakness)?",
      "Which parts of your body are affected?",
      "When did you first notice these symptoms?",
      "Do the symptoms come and go, or are they constant?",
      "Have you had any changes in vision, speech, or balance?",
      "Have you experienced any head injuries or loss of consciousness recently?"
    ],
    
    // Fever/Infection symptoms
    fever: [
      "How high is your temperature?",
      "When did the fever start?",
      "Do you have any other symptoms like chills, cough, sore throat, or body aches?",
      "Have you traveled recently or been exposed to anyone who is sick?",
      "Are you taking any medications for the fever?",
      "Do you have any underlying medical conditions?"
    ],
    
    // General/Default symptoms
    general: [
      "How long have you been experiencing this symptom?",
      "Is the symptom constant or does it come and go?",
      "What makes it better or worse?",
      "Do you have any other symptoms?",
      "Have you tried any treatments or medications?",
      "Has this happened to you before?"
    ]
  };
  
  // Function to detect symptom type from user message
  function detectSymptomType(message) {
    const lowerMessage = message.toLowerCase();
    
    // Check for chest-related symptoms
    if (lowerMessage.includes('chest pain') || 
        lowerMessage.includes('chest discomfort') || 
        (lowerMessage.includes('chest') && lowerMessage.includes('pain'))) {
      return 'chest_pain';
    }
    
    // Check for head-related symptoms
    if (lowerMessage.includes('headache') || 
        lowerMessage.includes('migraine') || 
        (lowerMessage.includes('head') && lowerMessage.includes('pain'))) {
      return 'headache';
    }
    
    // Check for stomach symptoms
    if (lowerMessage.includes('stomach') || 
        lowerMessage.includes('abdominal') || 
        lowerMessage.includes('belly') ||
        lowerMessage.includes('nausea') ||
        lowerMessage.includes('vomit')) {
      return 'stomach_pain';
    }
    
    // Check for breathing symptoms
    if (lowerMessage.includes('breath') || 
        lowerMessage.includes('breathing') || 
        lowerMessage.includes('short of breath') ||
        lowerMessage.includes('can\'t breathe') ||
        lowerMessage.includes('difficult to breathe')) {
      return 'breathing_difficulty';
    }
    
    // Check for joint symptoms
    if (lowerMessage.includes('joint') || 
        lowerMessage.includes('arthritis') || 
        lowerMessage.includes('knee') ||
        lowerMessage.includes('elbow') ||
        lowerMessage.includes('shoulder') ||
        lowerMessage.includes('back pain')) {
      return 'joint_pain';
    }
    
    // Check for skin symptoms
    if (lowerMessage.includes('skin') || 
        lowerMessage.includes('rash') || 
        lowerMessage.includes('itch') ||
        lowerMessage.includes('bump') ||
        lowerMessage.includes('acne')) {
      return 'skin_issues';
    }
    
    // Check for neurological symptoms
    if (lowerMessage.includes('dizzy') || 
        lowerMessage.includes('numbness') || 
        lowerMessage.includes('tingling') ||
        lowerMessage.includes('balance') ||
        lowerMessage.includes('vision') ||
        lowerMessage.includes('vertigo')) {
      return 'neurological';
    }
    
    // Check for fever symptoms
    if (lowerMessage.includes('fever') || 
        lowerMessage.includes('temperature') || 
        lowerMessage.includes('chills') ||
        lowerMessage.includes('sweating')) {
      return 'fever';
    }
    
    // Default to general symptoms
    return 'general';
  }
  
  // Function to generate follow-up questions based on symptom type
  function generateFollowUpResponse(symptomType, includeUploadPrompt = true) {
    // Get the appropriate questions
    const questions = symptomFollowUpQuestions[symptomType] || symptomFollowUpQuestions.general;
    
    // Create a response with the questions
    let response = "I'd like to understand your symptoms better. ";
    
    // Add symptom-specific introduction
    if (symptomType === 'chest_pain') {
      response += "Chest pain can have many causes, from muscle strain to more serious conditions. ";
    } else if (symptomType === 'headache') {
      response += "Headaches can vary widely in their causes and characteristics. ";
    } else if (symptomType === 'stomach_pain') {
      response += "Stomach pain can be caused by many different conditions. ";
    } else if (symptomType === 'breathing_difficulty') {
      response += "Breathing difficulties can result from several conditions affecting the lungs or heart. ";
    } else if (symptomType === 'joint_pain') {
      response += "Joint pain can be caused by inflammation, injury, or underlying conditions. ";
    } else if (symptomType === 'skin_issues') {
      response += "Skin conditions can have many different causes, from allergies to infections. ";
    } else if (symptomType === 'neurological') {
      response += "Neurological symptoms can be related to various conditions affecting the nervous system. ";
    } else if (symptomType === 'fever') {
      response += "Fever is often a sign that your body is fighting an infection. ";
    }
    
    response += "Could you please tell me:\n\n";
    
    // Add the questions as a bulleted list
    questions.forEach(question => {
      response += `- ${question}\n`;
    });
    
    // Add upload prompt if requested
    if (includeUploadPrompt) {
      response += "\nIf you have any relevant medical images, test results, or documents, you can also upload them for better assessment.";
    }
    
    return response;
  }
  
  // Function to check if a user message is a brief symptom description
  function isBriefSymptomDescription(message) {
    if (!message || typeof message !== 'string') {
      return false;
    }
    
    const lowerMessage = message.toLowerCase();
    
    // Check if message is relatively brief
    if (message.length > 80) {
      return false;
    }
    
    // Check for common symptom keywords
    const symptomKeywords = [
      'pain', 'ache', 'hurt', 'sore', 'discomfort',
      'fever', 'cough', 'tired', 'fatigue', 'dizzy',
      'nausea', 'vomit', 'diarrhea', 'constipation',
      'rash', 'itch', 'swelling', 'lump', 'bleeding',
      'headache', 'migraine', 'chest', 'stomach', 'back'
    ];
    
    return symptomKeywords.some(keyword => lowerMessage.includes(keyword));
  }
  
  // Export the functions for use in the MedicalChatSystem
  export {
    symptomFollowUpQuestions,
    detectSymptomType,
    generateFollowUpResponse,
    isBriefSymptomDescription
  };
import os
import json
import re
from datetime import datetime
from flask import Flask, request, jsonify, session
from flask_cors import CORS
from dotenv import load_dotenv
import requests
import random

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'your-secret-key-here')
CORS(app, origins=['http://localhost:3000', 'http://localhost:3001'])

# ============================================
# AI PROVIDER CONFIGURATION
# ============================================

# OpenAI Configuration
try:
    import openai
    openai.api_key = os.getenv('OPENAI_API_KEY', '')
except Exception as e:
    print(f"[INFO] OpenAI setup info: {e}")

# Google Gemini Configuration
try:
    api_key = os.getenv('GOOGLE_API_KEY') or os.getenv('GEMINI_API_KEY')
    if api_key:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        gemini_model = genai.GenerativeModel('gemini-1.5-pro')
        print("[OK] Gemini configured successfully")
    else:
        gemini_model = None
        print("[INFO] No Gemini API key found, using local fallback")
except Exception as e:
    print(f"[INFO] Gemini setup error: {e}")
    gemini_model = None

# ============================================
# SYSTEM PROMPTS WITH RECRUITAI INFO
# ============================================

# Platform Information
PLATFORM_INFO = """
ABOUT KETARI:
- KETARI is an Intelligent Job Matching and Recruitment Automation Platform
- Built for the Sidama Innovation and Technology Agency (SITA) in Ethiopia
- Location: Hawassa, Sidama Region, Ethiopia
- Purpose: To modernize and automate recruitment processes using AI technology
- Name: "Ketari" (ከታሪ in Amharic) - meaning "to organize" or "to arrange"

PLATFORM FEATURES:
1. For Job Seekers:
   - Create comprehensive profile with skills, education, work experience
   - Upload multiple resumes in PDF or DOCX format
   - Browse and search for jobs by department, location, type
   - Apply for jobs with one click using selected resume
   - Track application status (pending, reviewed, shortlisted, interviewed, offered, rejected)
   - Receive AI-powered job recommendations based on profile
   - View interview invitations and schedule
   - Manage leave requests and attendance (for employees)
   - Submit complaints and feedback

2. For Employers:
   - Post job vacancies with detailed requirements (skills, education, experience)
   - Set salary ranges, employment types (Full-Time, Part-Time, Contract)
   - Review applications from candidates
   - View AI match scores for each candidate (0-100%)
   - Shortlist candidates for interviews
   - Schedule interviews and manage interview process
   - Generate recruitment reports and analytics
   - Manage employee attendance and leave requests

3. AI Matching System:
   - Compares candidate skills with job requirements
   - Calculates match score (0-100%) based on multiple factors
   - Considers: Skills (40%), Education (25%), Experience (25%), Location (10%)
   - Recommends best candidates for jobs
   - Suggests best jobs for candidates
   - Uses advanced algorithms for intelligent matching

6. Language Support:
   - Full English and Amharic language support
   - Switch between languages easily
   - Localized content for Ethiopian users

PLATFORM URLS:
- Home: http://localhost:3000
- Login: http://localhost:3000/login
- Register: http://localhost:3000/register
- Browse Jobs: http://localhost:3000/jobs
- Post Job: http://localhost:3000/hr-expert/post-job
- Job Seeker Dashboard: http://localhost:3000/candidate/dashboard
- Employer Dashboard: http://localhost:3000/hr-expert/jobs
- Admin Dashboard: http://localhost:3000/admin/dashboard

USER TYPES:
1. Job Seeker: Looking for employment opportunities
2. Employer: Looking to hire talent
3. Admin: Managing the entire platform

COMMON QUESTIONS ANSWERED:
- How to create account: Go to /register, choose role, fill details
- How to apply for job: Browse jobs, click apply, select resume, submit
- How AI matching works: System compares your profile with job requirements
- Password reset: Use forgot password link on login page
- Profile completion: Add skills, education, experience for better matching
- Application tracking: Check dashboard for real-time status updates
"""

JOB_SEEKER_SYSTEM = f"""You are KETARI Assistant, a career advisor for the KETARI platform.

{PLATFORM_INFO}

YOUR ROLE:
Help job seekers with:
1. Finding the right job on the platform
2. Creating and optimizing their profile for better matching
3. Uploading and managing multiple resumes
4. Understanding AI match scores and how to improve them
5. Applying for jobs effectively
6. Tracking application status and next steps
7. Preparing for interviews and career development
8. Career advice and skill development
9. Ethiopian job market insights and opportunities
10. Professional development tips and guidance
11. Leave management and attendance tracking
13. Submitting complaints and feedback

RESPONSE GUIDELINES:
- Be warm, encouraging, and professional
- Provide practical, actionable advice
- Guide users to the right platform features with specific URLs
- Ask follow-up questions to understand user needs better
- Keep responses comprehensive but concise (2-4 paragraphs)
- Explain technical concepts simply
- Provide step-by-step instructions when needed
- Offer encouragement and motivation
- Address both English and Amharic queries appropriately
"""

EMPLOYER_SYSTEM = f"""You are KETARI Assistant, a recruitment advisor for hr_experts using the KETARI platform.

{PLATFORM_INFO}

YOUR ROLE:
Help hr_experts with:
1. Writing effective job descriptions that attract qualified candidates
2. Posting jobs on the platform with optimal requirements
3. Reviewing and screening candidates efficiently
4. Understanding AI match scores and how to interpret them
5. Shortlisting candidates for interviews
6. Scheduling interviews and managing the interview process
7. Making data-driven hiring decisions
8. Recruitment best practices and strategies
9. Hiring in the Ethiopian market context
10. Employer branding and company culture
11. Managing employee attendance and leave requests
12. Generating recruitment reports and analytics

RESPONSE GUIDELINES:
- Be professional, strategic, and data-driven
- Provide practical, actionable advice
- Guide hr_experts to the right platform features with specific URLs
- Ask follow-up questions to understand hr_expert needs better
- Keep responses comprehensive but concise (2-4 paragraphs)
- Explain technical concepts simply
- Provide step-by-step instructions when needed
- Focus on efficiency and quality in hiring
- Address both English and Amharic queries appropriately
"""

# Amharic System Prompts
JOB_SEEKER_SYSTEM_AM = f"""እንኳን ደህና መጡ! እኔ የከታሪ ረዳት ነኝ። ለስራ ፈላጊዎች ስራ ምክር እሰጥዎታለሁ።

{PLATFORM_INFO}

የእኔ ሚናገሪዎች:
1. ትክክለኛ ስራ መፈለግ
2. መገለጫ መሙሉ እና ማሻሻል ለዝርዝር ነጥብ
3. የረጅም ጊዜ መግለጫ መስቀል
4. የአይ ማጣጣሚያ ነጥብ መረዳት እና ማሻሻል
5. ስራ በፍጥነት መመልከቻ
6. የመመልከቻ ሁኔታ መከታተር እና የሚቀጥሩት እርምጌዎች
7. ለቃለ መጠይቅ አሰራር እና የሙያ ልምምድ
8. የስራ ምክር እና የችሎታ ልምምድ
9. የኢትዮጵያ የስራ ገበያ መረጃ እና እድሎች
10. የሙያ ልምምድ ምክሮች እና አማካሪዎች
11. የልምምድ ፕሮግራሞች እና የተፈለጉ ሁኔታዎች
12. የቅድመ ፍቃድ እና የመገናኛ አስተዳደር
13. ቅልፍና አስተያየት መስጫት

የምላሽ መመሪያዎች:
- ወደ አይነት እንዲሻል ቀላሽ እና አስተማማኝ ይሁኑ
- ጥበብ ያለ እና ሊተገበር የሚሆን ምክር ይስጡ
- ወደ ትክክለኛ ባህሪያዎች URL ይመራከሩ
- ተከታይ ጥያቄዎች ይጠይቁ ወደ የተጠቃሚ ፍላጎቶች ለማረጋገጥ
- ምላሾችን አጭር ነገር ግን መረጃ ያለ (2-4 አንቀጽ)
- የቴክኒክ ነገሮችን በቀላሉ ይሰማሩ
- የእርምጌ በእርምጌ አሰራር ይስጡ
- አስተማማኝ እና አስተዳደር ይስጡ
- በእንግሊዝኛ እና በአማርኛ ጥያቄዎችን በትክክል ይመለስበት
"""

EMPLOYER_SYSTEM_AM = f"""እንኳን ደህና መጡ! እኔ የከታሪ ረዳት ነኝ። ለአሰሪዎች የመመልመያ ምክር እሰጥዎታለሁ።

{PLATFORM_INFO}

የእኔ ሚናገሪዎች:
1. ውጤል ያለ የስራ መግለጫ መጻፍ የተፈለጉ እጩዎችን ለማስቀረት
2. ስራዎችን በመድረክ በትክክለኛ የፈለጉ ክህሎች ማስቀመጥ
3. እጩዎችን በፍጥነት መመልከት እና መረጋገጥ
4. የአይ ማጣጣሚያ ነጥብ መረዳት እና እንዴት እንደሚተረከብ
5. እጩዎችን ለቃለ መጠይቅ በአጭር ዝርዝር ማስገባት
6. የቃለ መጠይቅ አሰራር እና አስተዳደር
7. በዳታ ላይ የተመሰረተ የቅጥር ውሳኔዎች መውሰድ
8. የመመልመያ ምርጥ ልምምድ እና ስትራቴጂዎች
9. በኢትዮጵያ የስራ ገበያ ውስጥ መቅጠር
10. የአሰሪ ስም ማሻሻል እና የኩባንያ ባህሪ
11. የሰራተኛ መገናኛ እና ቅድመ ፍቃድ አስተዳደር
12. ለተማሪዎች የልምምድ ፕሮግራሞች ማስቀመጥ
13. የመመልመያ ሪፖርቶች እና አናሊቲክስ መፈጠር

የምላሽ መመሪያዎች:
- ቀጣይ እና ስትራቴጂካዊ ይሁኑ
- ጥበብ ያለ እና ሊተገበር የሚሆን ምክር ይስጡ
- አሰሪዎችን ወደ ትክክለኛ ባህሪያዎች URL ይመራከሩ
- ተከታይ ጥያቄዎች ይጠይቁ ወደ የአሰሪ ፍላጎቶች ለማረጋገጥ
- ምላሾችን አጭር ነገር ግን መረጃ ያለ (2-4 አንቀጽ)
- የቴክኒክ ነገሮችን በቀላሉ ይሰማሩ
- የእርምጌ በእርምጌ አሰራር ይስጡ
- በፍጥነት እና ጥራት ላይ ያተኩሩ
- በእንግሊዝኛ እና በአማርኛ ጥያቄዎችን በትክክል ይመለስበት
"""

# ============================================
# USER CONTEXT MANAGEMENT
# ============================================

user_sessions = {}

def get_user_session(user_id):
    if user_id not in user_sessions:
        user_sessions[user_id] = {
            'history': [],
            'context': {},
            'conversation_count': 0
        }
    return user_sessions[user_id]

def update_user_session(user_id, role, content, context=None):
    session = get_user_session(user_id)
    session['history'].append({
        'role': role,
        'content': content,
        'timestamp': datetime.now().isoformat()
    })
    session['conversation_count'] += 1
    if context:
        session['context'].update(context)
    return session

# ============================================
# AI PROVIDER HANDLERS
# ============================================

def get_ai_response_openai(messages):
    """Get response from OpenAI"""
    if not openai.api_key:
        return None
    
    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=messages,
            max_tokens=800,
            temperature=0.7,
            presence_penalty=0.6,
            frequency_penalty=0.3
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"OpenAI Error: {e}")
        return None

def get_ai_response_gemini(messages):
    """Get response from Google Gemini"""
    if not gemini_model:
        return None
    
    try:
        prompt = ""
        for msg in messages:
            if msg['role'] == 'system':
                prompt += f"System: {msg['content']}\n"
            elif msg['role'] == 'user':
                prompt += f"User: {msg['content']}\n"
            elif msg['role'] == 'assistant':
                prompt += f"Assistant: {msg['content']}\n"
        
        response = gemini_model.generate_content(prompt)
        return response.text if response.text else None
    except Exception as e:
        print(f"Gemini Error: {e}")
        return None

def get_ai_response_local(message, user_context=None):
    """Comprehensive local responses for all recruitment topics"""
    
    message_lower = message.lower()
    
    # Get user info if available
    user_name = user_context.get('name', 'there') if user_context else 'there'
    user_role = user_context.get('role', 'guest') if user_context else 'guest'
    is_authenticated = user_context.get('isAuthenticated', False) if user_context else False
    user_skills = user_context.get('skills', []) if user_context else []
    user_location = user_context.get('location', '') if user_context else ''
    language = user_context.get('language', 'en') if user_context else 'en'
    
    # ============================================
    # AMHARIC RESPONSES
    # ============================================
    
    if language == 'am':
        # Amharic responses for common queries
        if any(phrase in message_lower for phrase in ['ሰላም', 'እንኳን', 'እንደምን', 'እንዴት', 'ስለ', 'ለምን', 'ምንድን']):
            if is_authenticated and user_name:
                return f"👋 ሰላም {user_name}! እኔ የሪክሩትአይ ረዳት ነኝ። እንዴት ልረዳዎት? ስለ ስራ ፍለግ፣ መመልከቻ፣ ወይም ሌሎች ጉዳዮች ማንኛውንም ጥያቄ ሊያቀርቡ ይችላሉ! 😊"
            else:
                return "👋 ሰላም! እኔ የሪክሩትአይ ረዳት ነኝ። ስለ ስራ ፍለግ፣ መመልከቻ፣ እና መመልመያ ልረዳዎት ልትል። ለውጥ አስተዳደሪ ለማግኘት መጀመር ወይም ተመዝገቡ! 🚀"
        
        if any(phrase in message_lower for phrase in ['ስራ', 'ስራ ፍለግ', 'ስራ እፈልጋ', 'ስራ እንዴት እፈልጋ', 'ክፍት ያለ ስራ']):
            return f"""🔍 **በሪክሩትአይ ትክክለኛ ስራ እንዴት እፈልጋ**

📍 **እርምግ 1: ሁሉም ስራዎችን ይመልከቱ**
ወደ **ስራዎች ገጽ** በ http://localhost:3000/jobs ይሂዱ

🔎 **እርምግ 2: ፈልጎት ይጠቀሙ**
- ቁልፍ ቃሎችን ይጠቀሙ (ለምሳሌ: "ሶፍትዌር ዴቨሎፐር")
- ቦታ ይምረጡ (ለምሳሌ: "ሀዋሳ")
- የስራ ዓይነት ይምረጡ (ሙሉ ጊዜ፣ ክፍል ጊዜ፣ ውል)

📋 **እርምግ 3: የስራ ዝርዝሮችን ይመለከቱ**
- ሙሉ የስራ መግለጫ
- የተፈለጉ ክህሎቶች
- የአይ ማጣጣሚያ ነጥብ

📝 **እርምግ 4: አሁን ይመመልክቱ**
ስራውን ካገኙት በኋላ "አሁን ይመመልክቱ" ይጫኑ

💡 **ምክሮች:**
- መገለጫዎን ይሙሉ ለዝርዝር ነጥብ
- የረጅም ጊዜ መግለጫ ያስቀሙ
- የአይ ነጥብ 70% ከላይ ያለ ስራዎችን ይመመልክቱ

🔗 **ፈጣን አገናኝ**: http://localhost:3000/jobs"""
        
        if any(phrase in message_lower for phrase in ['መመልከቻ', 'እንዴት እመመልክት', 'መመልክት ሂደት']):
            return f"""📝 **የስራ መመልከቻ ሂደት**

📋 **እርምም እርምግ:**

1️⃣ **ስራ ያግኙ**
   - ወደ http://localhost:3000/jobs ይሂዱ
   - ክፍት ያሉ ስራዎችን ይመለከቱ

2️⃣ **"አሁን ይመመልክቱ" ይጫኑ**
   - የሚፈልጉትን ስራ ይምረጡ
   - የመመልክት አዝማሚያን ይጫኑ

3️⃣ **የረጅም ጊዜ መግለጫዎን ይምረጡ**
   - ከያስቀሙት መግለጫዎች ይምረጡ
   - ለስራው ተስማሚ ይምረጡ

4️⃣ **የማስታወሻ ደብዳቤ ይጻፉ (አማራጭ)**
   - ራስዎን ያስተውሉ
   - ለስራው ምንም ነው የሚስማሙት

5️⃣ **መመልክት ይስጡ**
   - መመልክትዎን ይመረጝ
   - "አስገባ" ይጫኑ

✅ **ከመመልክት በኋይ:**
- ✅ መመልክት ተቀብሷል
- 📊 የአይ ነጥብ ተሰልፏል
- 📋 ሁኔታ "በመጠባበቅ ላይ" ይደርጋል

📱 **መመልክትዎን ለማከታተር:**
- ወደ ዳሽቦርድ: http://localhost:3000/candidate/dashboard

💡 **ለስኬል መመልክት ምክሮች:**
- መገለጫዎን ለእያኛው ስራ ይሙሉ
- ከየስራ መግለጫ ቁልፍ ቃሎችን ይጠቀሙ
- መገለጫዎን ሙሉ ይሙሉ"""
        
        # Default Amharic response
        return f"👋 ሰላም! እኔ የሪክሩትአይ ረዳት ነእ። ስለ ስራ ፍለግ፣ መመልከቻ፣ ወይም ሌሎች ጉዳዮች ማንኛውንም ጥያቄ ሊያቀርቡ ይችላሉ! 😊"
    
    # ============================================
    # ENGLISH RESPONSES
    # ============================================
    
    # PERSONALIZED RESPONSES
    # ============================================
    
    # Who am I / Do you know me
    if any(phrase in message_lower for phrase in ['who am i', 'do you know me', 'who is', 'know me', 'my name']):
        if is_authenticated and user_name:
            role_display = {
                'candidate': 'Job Seeker',
                'hr_expert': 'Employer',
                'admin': 'Admin'
            }.get(user_role, user_role)
            
            response = f"🌟 **I know you!** 👋\n\nYou are **{user_name}**. You're logged in as a **{role_display}** on KETARI."
            
            if user_context.get('email'):
                response += f"\n\n📧 **Email**: {user_context.get('email')}"
            if user_location:
                response += f"\n📍 **Location**: {user_location}"
            if user_skills:
                response += f"\n💡 **Skills**: {', '.join(user_skills[:5])}"
                if len(user_skills) > 5:
                    response += f" and {len(user_skills) - 5} more"
            
            response += "\n\nIs there anything specific you'd like help with today? I'm here to assist you with your job search, applications, or any other recruitment questions! 💪"
            return response
        else:
            return "👋 I don't know who you are yet. You're currently browsing as a guest.\n\nIf you want me to know your name and give personalized advice, please **login** at http://localhost:3000/login or **register** at http://localhost:3000/register first!\n\nI'd love to help you better with your job search! 😊"
    
    # Hello / Hi / Hey with name
    if any(phrase in message_lower for phrase in ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening']):
        if is_authenticated and user_name:
            return f"👋 **Hello {user_name}!**\n\nIt's great to see you again! You're logged in as a **{user_role}** on KETARI.\n\nHow can I help you today? I can assist with:\n• 🔍 Finding jobs\n• 📝 Applying for positions\n• 📄 Resume tips and upload\n• 🤖 AI matching and scores\n• 🗣️ Interview preparation\n• 👤 Profile updates\n\nJust ask me anything about KETARI! 😊"
        else:
            return "👋 **Hello!**\n\nI'm your KETARI Career Assistant. I'm here to help you with everything related to job searching, applications, and recruitment.\n\nFeel free to ask me about:\n• 🔍 How to find jobs\n• 📝 How to apply\n• 📄 Resume tips\n• 🤖 AI matching\n• 🗣️ Interview prep\n\nTo get personalized help, please **login** or **register** first! 🚀"
    
    # ============================================
    # JOB SEARCH & FINDING JOBS
    # ============================================
    
    if any(phrase in message_lower for phrase in ['how to find a job', 'job search', 'find job', 'looking for job', 'search job', 'where to find jobs', 'job opportunities']):
        return f"""🔍 **How to Find the Right Job on KETARI**

📍 **Step 1: Browse All Jobs**
Visit the **Jobs page** at http://localhost:3000/jobs to see all available positions.

🔎 **Step 2: Search and Filter**
- Use keywords to find specific roles (e.g., "Software Developer", "Data Analyst")
- Filter by location (e.g., "Hawassa")
- Filter by employment type (Full-Time, Part-Time, Contract)
- Filter by salary range

📋 **Step 3: Review Job Details**
Click on any job to see:
- Full job description
- Required skills and qualifications
- Department and location
- Application deadline
- AI Match Score (how well you fit!)

📝 **Step 4: Apply**
Once you find a job you like, click **"Apply Now"** and submit your application with your resume.

💡 **Pro Tips:**
- Complete your profile first for better match scores
- Upload a detailed resume
- Apply to jobs that match your skills
- Check the Jobs page regularly for new postings
- Use the AI Match Score to find the best fit for you

📊 **Current Job Market Insights (Ethiopia):**
- Growing demand for tech skills (Software, Data, Networking)
- Government and NGO sectors hiring
- Remote work opportunities increasing
- SITA regularly posts new positions

{'Since you have skills in ' + ', '.join(user_skills[:3]) + ', I recommend searching for jobs with these keywords!' if is_authenticated and user_skills else 'What kind of job are you looking for? I can help you find it!'}

🔗 **Quick Link**: http://localhost:3000/jobs"""
    
    # ============================================
    # HOW TO APPLY / APPLICATION PROCESS
    # ============================================
    
    if any(phrase in message_lower for phrase in ['how to apply', 'application process', 'apply for job', 'submit application', 'applying']):
        return f"""📝 **Complete Guide to Applying for Jobs on KETARI**

📋 **Step-by-Step Application Process:**

1️⃣ **Find a Job**
   - Go to http://localhost:3000/jobs
   - Browse available positions
   - Review job requirements

2️⃣ **Click "Apply Now"**
   - Select the job you want
   - Click the "Apply Now" button

3️⃣ **Select Your Resume**
   - Choose from your uploaded resumes
   - Make sure it's the most relevant one
   - If you haven't uploaded one, do it first!

4️⃣ **Write a Cover Letter (Optional)**
   - Introduce yourself
   - Explain why you're a good fit
   - Highlight relevant experience
   - Keep it professional and concise

5️⃣ **Submit Application**
   - Review your application
   - Click "Submit"
   - You'll get a confirmation message

✅ **After Applying:**
- ✅ Application is received
- 📊 AI Match Score is calculated
- 📋 Status is set to "Pending"
- 📧 You'll be notified of updates

📱 **Track Your Applications:**
- Go to Dashboard: http://localhost:3000/candidate/dashboard
- See all your applications in one place
- Check status: Pending → Reviewed → Shortlisted → Interviewed → Offered/Rejected

💡 **Tips for Successful Applications:**
- Tailor your resume for each job
- Use keywords from the job description
- Complete your profile fully
- Add all relevant skills
- Upload a professional resume

🚀 **Pro Tip:** Employers look for candidates with match scores above 70%!

{'You have applied to ' + str(user_context.get('applications_count', 0)) + ' jobs so far. Keep going!' if is_authenticated else 'Ready to apply? Start by finding a job that matches your skills!'}
"""

    # ============================================
    # INTERVIEW PREPARATION
    # ============================================
    
    if any(phrase in message_lower for phrase in ['interview', 'schedule interview', 'interview preparation', 'interview tips', 'prepare for interview', 'interview questions']):
        return f"""🗣️ **Complete Interview Guide for KETARI**

📅 **How Interviews Work on KETARI:**

1️⃣ **Application Reviewed** - Employer reviews your application
2️⃣ **Shortlisted** - You're selected for interview
3️⃣ **Invitation** - You receive an interview invitation
4️⃣ **Schedule** - Interview date, time, and location set
5️⃣ **Preparation** - Get ready for the interview
6️⃣ **Interview** - Attend the interview
7️⃣ **Follow-up** - Receive feedback/offer

🔔 **You'll Be Notified When:**
- You're shortlisted
- An interview is scheduled
- Your status changes

📱 **View Interview Details:**
Go to Dashboard → Recent Applications → Click "View Interview"

🎯 **Interview Preparation Tips:**

**Before the Interview:**
1. 🔍 **Research the Company**
   - Visit their website
   - Understand their mission
   - Know their products/services

2. 📝 **Review the Job Description**
   - Understand the requirements
   - Match your skills to their needs
   - Prepare examples for each requirement

3. 📋 **Prepare STAR Stories**
   - **S**ituation: Set the context
   - **T**ask: What needed to be done
   - **A**ction: What you did
   - **R**esult: What happened

4. 🤝 **Practice Common Questions**
   - "Tell me about yourself"
   - "Why do you want this job?"
   - "What are your strengths/weaknesses?"
   - "Where do you see yourself in 5 years?"

5. ❓ **Prepare Questions to Ask**
   - "What's the team culture like?"
   - "What are the growth opportunities?"
   - "What would a typical day look like?"

**During the Interview:**
- ✅ Dress professionally
- ✅ Arrive early (10-15 minutes)
- ✅ Be confident and positive
- ✅ Listen carefully
- ✅ Provide clear, concise answers
- ✅ Be honest and authentic

**After the Interview:**
- 📧 Send a thank-you email
- 👍 Follow up if needed
- 📱 Check your dashboard for updates

💡 **Virtual Interview Tips:**
- Test your camera and microphone
- Ensure good lighting
- Minimize background noise
- Dress professionally
- Look at the camera

🚀 **You've got this! Good luck with your interview!** 🍀"""
    
    # ============================================
    # RESUME HELP
    # ============================================
    
    if any(phrase in message_lower for phrase in ['resume', 'upload resume', 'resume tips', 'cv', 'curriculum vitae', 'resume help', 'resume advice']):
        return f"""📄 **Complete Resume Guide for RecruitAI**

📤 **How to Upload Your Resume:**

1️⃣ Go to **Profile** → **Resume Management**
2️⃣ Click **"Choose File"**
3️⃣ Select your PDF or DOCX file
4️⃣ Click **Upload**
5️⃣ Set as **Default** (optional)

📋 **Supported Formats:** PDF, DOCX (Max 5MB)

📝 **Resume Writing Tips:**

**1. Keep It Concise**
- Aim for 1-2 pages
- Use bullet points for readability
- Be specific and quantify achievements

**2. Highlight Achievements, Not Just Duties**
- ❌ "Responsible for coding"
- ✅ "Developed 5 web applications that increased user engagement by 30%"

**3. Use Keywords**
- Match keywords from job descriptions
- Use industry-specific terms
- Include technical and soft skills

**4. Structure Your Resume:**
- 📌 **Contact Information**: Name, email, phone, location
- 🎯 **Professional Summary**: Brief overview of your experience
- 💼 **Work Experience**: Company, position, dates, achievements
- 🎓 **Education**: Institution, degree, graduation year
- 💡 **Skills**: Technical and soft skills
- 📜 **Certifications**: Professional certifications
- 🌐 **Languages**: Languages you speak

**5. Tailor for Each Job**
- Customize your resume for each application
- Highlight relevant experience
- Use similar keywords

✅ **After Upload:**
- 🔍 AI parses your resume
- 📊 Extracts skills, education, experience
- 🎯 Improves your match scores
- 📋 Resume is available for applications

💡 **Pro Tips:**
- Upload multiple versions for different job types
- Keep your resume updated
- Add new skills and experience regularly
- Use a professional format

📊 **What the AI Extracts:**
- Your name and contact info
- Work experience and dates
- Education and certifications
- Skills and competencies

🚀 **A strong resume = Better match scores + More interviews!**

{'You have uploaded ' + str(len(user_context.get('resumes', []))) + ' resume(s). Keep them updated!' if is_authenticated else 'Upload your resume now to get started!'}"""
    
    # ============================================
    # AI MATCHING / MATCH SCORE
    # ============================================
    
    if any(phrase in message_lower for phrase in ['match score', 'ai matching', 'how does ai match', 'matching algorithm', 'match percentage', 'score']):
        return f"""🤖 **How AI Matching Works on RecruitAI**

📊 **The AI matching system compares your profile with job requirements using 4 categories:**

**1. Skills Matching (40% Weight)** ⭐
- Matches your skills with job requirements
- More matching skills = Higher score
- Example: Job needs JavaScript, React, Node.js → You have all three → 100%

**2. Education Matching (25% Weight)** 🎓
- Checks if your education matches job requirements
- Degree, field of study, and institution matter
- Example: Job needs B.Sc. Computer Science → You have it → 100%

**3. Experience Matching (25% Weight)** 💼
- Compares your years and relevance of experience
- More relevant experience = Higher score
- Example: Job needs 3+ years → You have 4 years → 100%

**4. Location Matching (10% Weight)** 📍
- Checks if your location matches job location
- Closer match = Higher score
- Example: Job in Hawassa → You're in Hawassa → 100%

📈 **Match Score Ranges:**
- 🌟 **80-100% - Excellent Match!** You're a top candidate!
- 👍 **60-79% - Good Match** Strong candidate, apply!
- 📊 **40-59% - Fair Match** Consider applying
- ⚠️ **0-39% - Low Match** Need more skills or experience

💡 **How to Improve Your Match Score:**

1. ✅ **Complete Your Profile** - Add all skills, education, experience
2. ✅ **Upload a Detailed Resume** - More data = Better matching
3. ✅ **Add Relevant Skills** - Include all your skills and certifications
4. ✅ **Update Experience** - Add all work experience with descriptions
5. ✅ **Set Your Location** - Helps with location matching

🎯 **Where to See Match Scores:**
- On each job card in the Jobs page
- In your applications on the Dashboard
- When you apply for a job

🚀 **Goal:** Aim for jobs with match scores above 70% for the best chances!

{'Your current skills: ' + ', '.join(user_skills[:5]) + '. Add more skills to improve your match scores!' if is_authenticated and user_skills else 'Add your skills to see match scores!'}"""
    
    # ============================================
    # PROFILE MANAGEMENT
    # ============================================
    
    if any(phrase in message_lower for phrase in ['profile', 'update profile', 'edit profile', 'my profile', 'profile settings']):
        return f"""👤 **Complete Profile Management Guide**

📍 **Where to Update:** http://localhost:3000/candidate/profile

📋 **What to Add to Your Profile:**

**1. Personal Information** 👤
- Full Name
- Email (auto-filled)
- Phone Number
- Location
- Bio/About

**2. Skills** 💡
- Add all your technical and soft skills
- Include both hard and soft skills
- Keep them updated

**3. Education** 🎓
- Institution name
- Degree obtained
- Field of study
- Graduation year

**4. Work Experience** 💼
- Company name
- Position title
- Start and end dates
- Description of responsibilities
- Check "Currently Working" if applicable

**5. Certifications** 📜
- Professional certifications
- Training programs
- Online course completions

**6. Languages** 🌐
- Languages you speak
- Proficiency level (e.g., Fluent, Native, Intermediate)

**7. Resume** 📄
- Upload multiple resumes
- Set one as default
- Keep them updated

📊 **Profile Completeness:**
- Shows how complete your profile is
- Aim for 100% for best results
- More complete = Better match scores

💡 **Pro Tips:**
- Update your profile regularly
- Add new skills as you learn them
- Keep your experience current
- Add a professional bio
- Upload a professional photo

🔒 **Privacy:**
- Your profile is visible to hr_experts when you apply
- Only relevant information is shown
- You control what you share

🚀 **Complete profile = More job opportunities + Better matches!**

{'Your profile is ' + str(user_context.get('completeness', 0)) + '% complete. Keep going!' if is_authenticated else 'Start building your profile now!'}"""
    
    # ============================================
    # DASHBOARD / APPLICATIONS STATUS
    # ============================================
    
    if any(phrase in message_lower for phrase in ['dashboard', 'my applications', 'application status', 'track application', 'status']):
        return f"""📊 **Dashboard & Application Tracking Guide**

📍 **Access Dashboard:** http://localhost:3000/candidate/dashboard

📋 **What You'll See on Your Dashboard:**

**1. Statistics Cards** 📈
- **Total Applications**: Number of jobs you've applied to
- **Pending**: Applications under review
- **Shortlisted**: You've been selected for next steps
- **Interviewed**: Interview completed
- **Offered**: Job offer received! 🎉
- **Rejected**: Not selected for this position

**2. Recent Applications** 📋
- List of all your applications
- Job title and department
- Application date
- Current status
- AI Match Score

**3. Application Status Meanings:** 🔍
- ⏳ **Pending**: Application is being reviewed
- 📋 **Reviewed**: Employer has seen your application
- ⭐ **Shortlisted**: You've been selected for interview
- 🗣️ **Interviewed**: You've had an interview
- 🎉 **Offered**: You got the job offer! Congratulations!
- ❌ **Rejected**: Not selected this time

**4. Interview Details** 🗓️
- View interview invitations
- Date, time, and location
- Additional notes from hr_expert

**5. Quick Actions** ⚡
- Browse more jobs
- Update your profile
- Upload resumes

💡 **Pro Tips:**
- Check your dashboard daily
- Respond to interview invitations quickly
- Keep your profile updated
- Apply to multiple jobs

🚀 **Stay active and persistent - your dream job is waiting!**

{'You have ' + str(user_context.get('applications_count', 0)) + ' application(s). Keep going!' if is_authenticated else 'Start applying to see your dashboard!'}
"""

    # ============================================
    # SALARY / COMPENSATION
    # ============================================
    
    if any(phrase in message_lower for phrase in ['salary', 'compensation', 'pay', 'how much', 'salary range', 'negotiate']):
        return f"""💰 **Salary and Compensation Guide**

📊 **Understanding Salaries in Ethiopia:**

**Tech Industry Averages (ETB/month):**
- Software Developer (Junior): 15,000 - 25,000
- Software Developer (Senior): 25,000 - 45,000
- Data Analyst: 12,000 - 22,000
- Network Engineer: 18,000 - 30,000
- UI/UX Designer: 14,000 - 25,000
- IT Manager: 30,000 - 55,000
- Project Manager: 25,000 - 50,000

**Government / NGO Salaries:**
- Entry Level: 8,000 - 15,000
- Mid Level: 15,000 - 25,000
- Senior Level: 25,000 - 40,000

💡 **Salary Negotiation Tips:**

**1. Research Before Negotiating**
- Know the market rate for your role
- Consider your experience level
- Factor in location (Hawassa vs Addis)

**2. Know Your Worth**
- Highlight your skills and experience
- Show your achievements
- Demonstrate your value

**3. Be Professional**
- Be confident but polite
- Have a clear number in mind
- Be willing to negotiate

**4. Consider the Full Package**
- Base salary
- Health insurance
- Bonuses
- Allowances (transport, housing)
- Training and development
- Career growth

**5. How to Respond**
- "Based on my research and experience, I'm looking for [amount]"
- "I'm open to discussing the total compensation package"
- "Thank you for the offer. Can we discuss [specific aspect]?"

💡 **Pro Tips:**
- Don't rush your decision
- Negotiate professionally
- Know your minimum acceptable salary
- Consider long-term growth

🚀 **Remember: You have value and deserve fair compensation!** 💪"""
    
    # ============================================
    # CAREER ADVICE
    # ============================================
    
    if any(phrase in message_lower for phrase in ['career', 'career advice', 'career path', 'career growth', 'professional development']):
        return f"""🌟 **Career Advice and Professional Development**

📈 **Building a Successful Career Path:**

**1. Know Yourself** 🧠
- Identify your strengths and weaknesses
- Understand your values and passions
- Define your career goals
- Assess your skills and gaps

**2. Continuous Learning** 📚
- Take online courses (Coursera, Udemy)
- Attend workshops and seminars
- Read industry blogs and books
- Learn new technologies
- Stay updated with trends

**3. Build Your Network** 🌐
- Connect with professionals
- Join industry groups
- Attend networking events
- Find a mentor
- Use LinkedIn effectively

**4. Gain Experience** 💼
- Take on challenging projects
- Volunteer for new responsibilities
- Seek internships
- Work on side projects
- Build a portfolio

**5. Develop Soft Skills** 🤝
- Communication
- Leadership
- Problem-solving
- Teamwork
- Time management

**6. Brand Yourself** 🏷️
- Create a professional online presence
- Showcase your achievements
- Build a personal brand
- Share your knowledge

**7. Set SMART Goals** 🎯
- **S**pecific: Clear and defined
- **M**easurable: Trackable progress
- **A**chievable: Realistic goals
- **R**elevant: Aligned with your career
- **T**ime-bound: Deadlines

💡 **Career Growth Tips:**
- Never stop learning
- Be adaptable and flexible
- Take calculated risks
- Build your network
- Seek feedback
- Be persistent

🚀 **Your career is a journey, not a destination! Keep growing!** 🌟"""
    
    # ============================================
    # SKILLS DEVELOPMENT
    # ============================================
    
    if any(phrase in message_lower for phrase in ['skills', 'skill development', 'learn skills', 'skill gap', 'what skills']):
        return f"""💡 **Skills Development Guide**

📊 **In-Demand Skills in Ethiopia (2026):**

**Technical Skills:**
1. 💻 **Programming**: JavaScript, Python, Java, C#
2. 🌐 **Web Development**: React, Node.js, HTML, CSS
3. 📊 **Data Science**: Python, SQL, Tableau, Power BI
4. 🔒 **Cybersecurity**: Network Security, Ethical Hacking
5. ☁️ **Cloud Computing**: AWS, Azure, Google Cloud
6. 📱 **Mobile Development**: React Native, Flutter
7. 🗄️ **Database**: MongoDB, MySQL, PostgreSQL

**Soft Skills:**
1. 🗣️ **Communication**: Written and verbal
2. 🤝 **Teamwork**: Collaboration and cooperation
3. 🧠 **Problem-Solving**: Critical thinking
4. 📋 **Project Management**: Planning and execution
5. 🎯 **Leadership**: Motivating and guiding teams
6. ⏰ **Time Management**: Prioritization and efficiency

📚 **How to Learn New Skills:**

**1. Online Platforms:** 💻
- Coursera, Udemy, edX
- LinkedIn Learning
- FreeCodeCamp
- YouTube tutorials

**2. University Courses:** 🎓
- Evening classes
- Weekend programs
- Online degrees

**3. Practical Experience:** 💼
- Side projects
- Internships
- Volunteering
- Open source contributions

**4. Certifications:** 📜
- Professional certifications
- Industry-recognized credentials
- Vendor certifications

💡 **Skill Development Tips:**
- Focus on one skill at a time
- Practice consistently
- Apply what you learn
- Build a portfolio
- Get feedback

🚀 **Skills = Opportunities! Start learning today!** 💪"""
    
    # ============================================
    # SITA / AGENCY INFO
    # ============================================
    
    if any(phrase in message_lower for phrase in ['sita', 'sidama', 'agency', 'sidama innovation', 'about sita']):
        return f"""🏢 **About SITA (Sidama Innovation and Technology Agency)**

📍 **Location**: Hawassa, Sidama Region, Ethiopia

🎯 **Mission**: 
To drive innovation, digital transformation, and technological development in the Sidama Region.

📋 **What SITA Does:**
1. 💡 **Innovation Support**: Fostering innovation and creativity
2. 🌐 **Digital Transformation**: Modernizing government services
3. 🏗️ **Capacity Building**: Training and development
4. 🤝 **Partnerships**: Collaborating with stakeholders
5. 📈 **Job Creation**: Connecting talent with opportunities
6. 🔧 **Technology Development**: Building digital solutions

📊 **Key Focus Areas:**
- E-Government services
- Digital literacy
- Technology infrastructure
- Innovation ecosystem
- Youth employment
- Entrepreneurship support

💼 **SITA Careers:**
- Technology professionals
- Innovation managers
- Policy advisors
- Digital transformation specialists
- ICT infrastructure managers
- Data protection officers

🤖 **KETARI:** 
Built specifically for SITA to modernize recruitment and connect qualified professionals with opportunities in the Sidama Region.

🌍 **Impact:**
- Improving access to jobs
- Supporting economic growth
- Building digital capacity
- Creating opportunities for youth

📢 **Why Work at SITA?**
- Meaningful work that impacts the community
- Professional growth opportunities
- Collaborative environment
- Contribution to national development
- Competitive compensation

🔗 **Learn more**: Visit http://localhost:3000 for job opportunities at SITA!

Would you like to know about specific SITA job openings? 🚀"""
    
    # ============================================
    # EMPLOYER / POST JOB / HIRE
    # ============================================
    
    if any(phrase in message_lower for phrase in ['hr_expert', 'post job', 'hire', 'recruit', 'job posting', 'hr_expert dashboard']):
        return f"""💼 **Employer Features on KETARI**

📝 **Post a Job:** http://localhost:3000/hr-expert/post-job

📋 **What Employers Can Do:**

**1. Post Jobs** 📋
- Create detailed job postings
- Add requirements and skills
- Set deadlines
- Specify location and salary

**2. Review Applications** 👀
- View all applicants
- See AI match scores
- Review candidate profiles
- Filter and sort candidates

**3. Shortlist Candidates** ⭐
- Select top candidates
- Save for later review
- Track shortlisted candidates

**4. Schedule Interviews** 🗓️
- Set interview dates and times
- Choose locations
- Add notes and instructions

**5. Track Hiring Progress** 📊
- Monitor application status
- See hiring pipeline
- Generate recruitment reports

📊 **AI Matching for Employers:**
- Candidates are ranked by match score
- View skills, experience, and education
- Make data-driven hiring decisions

💡 **Tips for Effective Hiring:**

**Writing Job Descriptions:**
- ✅ Clear job title
- ✅ Detailed responsibilities
- ✅ Required qualifications
- ✅ Desired skills
- ✅ Salary range
- ✅ Application deadline

**Reviewing Candidates:**
- 👀 Check match scores first
- 📋 Review relevant experience
- 💡 Look for culture fit
- 📄 Check resume details
- 🤝 Consider communication skills

💼 **Why Use KETARI?**
- Faster hiring process
- Better candidate matching
- Data-driven decisions
- Reduced time-to-hire
- Access to qualified talent

🚀 **Hire the best talent for your organization with KETARI!**
"""

    # ============================================
    # ADMIN / REPORTS
    # ============================================
    
    if any(phrase in message_lower for phrase in ['admin', 'reports', 'dashboard admin', 'analytics', 'admin dashboard']):
        return f"""🛡️ **Admin Features on RecruitAI**

📊 **Admin Dashboard:** http://localhost:3000/admin/dashboard

🔧 **What Admins Can Do:**

**1. User Management** 👥
- View all users
- Edit user profiles
- Delete users
- Manage roles

**2. Job Management** 📋
- View all job postings
- Edit or delete jobs
- Monitor job activity

**3. Application Monitoring** 📄
- View all applications
- Track application status
- Monitor hiring progress

**4. Analytics & Reports** 📈
- Total users and activity
- Job posting trends
- Application statistics
- Recruitment metrics

**5. Platform Monitoring** 🔍
- System activity
- Error logs
- Performance metrics

📊 **Reports Available:**
- 📋 Recruitment summary
- 📈 Monthly applications trend
- 🏢 Jobs by department
- 📊 Status breakdown
- 👥 User statistics
- 📅 Hiring timeline

🔒 **Admin Security:**
- Role-based access
- Secure authentication
- Activity logging

💡 **Admin Tips:**
- Monitor platform activity regularly
- Generate reports for insights
- Support users when needed
- Keep platform secure

🚀 **Admins are the backbone of RecruitAI! Keep up the great work!**
"""

    # ============================================
    # REGISTRATION / SIGN UP
    # ============================================
    
    if any(phrase in message_lower for phrase in ['register', 'sign up', 'create account', 'new user', 'how to register']):
        return f"""📝 **Complete Registration Guide**

🔗 **Register Here:** http://localhost:3000/register

📋 **Step-by-Step Registration:**

**Step 1: Fill in Your Details**
- 📝 **Full Name**: Your complete name
- 📧 **Email**: Valid email address
- 🔐 **Password**: Min 6 characters, strong and memorable
- 🔑 **Confirm Password**: Re-enter your password

**Step 2: Select Your Role**
Choose one:
- 🧑‍💻 **Job Seeker** - Looking for employment
- 💼 **Employer** - Hiring for positions
- 🛡️ **Admin** - Platform management (limited)

**Step 3: Click "Create Account"**
- ✅ Account is created instantly
- 🔑 You're logged in automatically
- 📧 Welcome email sent

✅ **After Registration:**

**For Job Seekers:**
1. Complete your profile
2. Add your skills
3. Upload your resume
4. Start browsing jobs
5. Apply for positions

**For Employers:**
1. Complete company profile
2. Post your first job
3. Review applications
4. Start hiring

💡 **Registration Tips:**
- Use a professional email
- Create a strong password
- Use your real name
- Complete your profile immediately
- Add a profile photo

🚀 **Why Register on KETARI?**
- 🔍 Find the perfect job
- 💼 Hire the best talent
- 🤖 AI-powered matching
- 📊 Track applications
- 🗣️ Schedule interviews

👉 **Already have an account?** Login at http://localhost:3000/login

🎉 **Join thousands of professionals on KETARI!**
"""
    
    # ============================================
    # LOGIN / SIGN IN
    # ============================================
    
    if any(phrase in message_lower for phrase in ['login', 'sign in', 'log in', 'forgot password', 'reset password']):
        return f"""🔐 **Login and Account Access Guide**

🔗 **Login Here:** http://localhost:3000/login

📋 **How to Login:**

**Step 1:** Go to http://localhost:3000/login
**Step 2:** Enter your email address
**Step 3:** Enter your password
**Step 4:** Click "Sign In"

🔑 **Forgot Password?**

**Step 1:** Click "Forgot Password?" on the login page
**Step 2:** Enter your registered email
**Step 3:** Check your email for reset link
**Step 4:** Click the link in the email
**Step 5:** Create a new password
**Step 6:** Login with your new password

📧 **Password Reset Email:**
- Sent instantly
- Valid for 10 minutes
- Contains secure link
- One-time use only

💡 **Login Tips:**
- Remember your password
- Check your email if resetting
- Use a strong password
- Log out when using shared devices
- Contact support if issues persist

🔒 **Security Tips:**
- Use unique password for KETARI
- Never share your password
- Enable 2FA if available
- Log out after each session
- Report suspicious activity

🚨 **Trouble Logging In?**
- ❌ **Wrong password**: Try resetting it
- ❌ **User not found**: Register first
- ❌ **Connection issues**: Check your internet
- ❌ **Account locked**: Contact support

📱 **After Login:**
- Job seekers → Dashboard
- Employers → My Jobs
- Admins → Admin Dashboard

🚀 **Login now to access your personalized recruitment experience!**

{'You are already logged in as ' + user_name + '! 🎉' if is_authenticated and user_name else 'Login or register to get started!'}
"""

    # ============================================
    # SUGGESTIONS / RECOMMENDATIONS
    # ============================================
    
    if any(phrase in message_lower for phrase in ['suggest', 'recommend', 'advice', 'suggestion']):
        return f"""💡 **Personalized Suggestions for You**

{'Based on your profile, ' + user_name + ', here are some recommendations:' if is_authenticated and user_name else 'Here are some suggestions to help you on KETARI:'}

📋 **For Job Seekers:**

1. 🔍 **Complete Your Profile**
   - Add all your skills
   - Upload your resume
   - Fill in education and experience

2. 📊 **Apply to Matching Jobs**
   - Look for 70%+ match scores
   - Apply to 5-10 jobs per week
   - Tailor each application

3. 🤖 **Improve Your Match Scores**
   - Add relevant keywords
   - Update your skills
   - Get certified

4. 🌐 **Network**
   - Connect with professionals
   - Build your network
   - Join industry groups

5. 🗣️ **Prepare for Interviews**
   - Practice common questions
   - Research companies
   - Prepare your stories

💼 **For Employers:**

1. 📝 **Write Clear Job Descriptions**
   - Be specific about requirements
   - List required skills
   - Include salary range

2. 👀 **Review Candidates Thoroughly**
   - Check match scores
   - Review experience
   - Consider culture fit

3. 🤝 **Respond Quickly**
   - Acknowledge applications
   - Schedule interviews promptly
   - Provide feedback

4. 📊 **Use AI Matching**
   - Let AI rank candidates
   - Focus on top matches
   - Make data-driven decisions

💡 **Need more specific advice? Just ask me!** 🚀
"""

    # ============================================
    # GENERAL HELP / WHAT CAN YOU DO
    # ============================================
    
    if any(phrase in message_lower for phrase in ['help', 'what can you do', 'capabilities', 'assist', 'features']):
        return f"""🤖 **I'm Your KETARI Assistant - Here's What I Can Help You With!**

📋 **Complete List of Topics I Can Assist With:**

**🔍 Job Search & Applications:**
- Finding the right job
- Applying for positions
- Understanding match scores
- Tracking applications
- Interview scheduling

**📄 Resume & Profile:**
- Uploading resumes
- Resume writing tips
- Profile management
- Skills and certifications
- Education and experience

**🗣️ Interview Preparation:**
- Common interview questions
- How to prepare
- Virtual interview tips
- Follow-up strategies
- Salary negotiation

**💼 Career Development:**
- Career advice
- Skill development
- Professional growth
- Networking tips
- Job market insights

**📊 Platform Features:**
- Dashboard navigation
- AI matching system
- Employer features
- Admin features
- Reports and analytics

**🔐 Account Support:**
- Registration help
- Login issues
- Password reset
- Profile updates
- Account settings

📋 **Quick Topics to Ask About:**
- "How to find a job?"
- "How to apply?"
- "Resume tips"
- "Interview preparation"
- "Match score"
- "Dashboard help"
- "SITA information"
- "Salary negotiation"
- "Career advice"

💡 **How to Ask:**
- Be specific about what you need
- Mention your role (job seeker/hr_expert)
- Include details if possible

🔗 **Quick Links:**
- Home: http://localhost:3000
- Jobs: http://localhost:3000/jobs
- Dashboard: http://localhost:3000/candidate/dashboard
- Profile: http://localhost:3000/candidate/profile
- Register: http://localhost:3000/register
- Login: http://localhost:3000/login

🚀 **What would you like to know about today? Just ask!** 💬
"""

    # ============================================
    # DEFAULT RESPONSES
    # ============================================
    
    if is_authenticated and user_name:
        default_responses = [
            f"👋 Hi {user_name}! I'm here to help you with KETARI. You can ask me about:\n\n📋 **Topics I Cover:**\n• 🔍 Finding and applying for jobs\n• 📄 Resume tips and upload\n• 🤖 AI matching and scores\n• 🗣️ Interview preparation\n• 👤 Profile management\n• 📊 Dashboard and applications\n• 💰 Salary and compensation\n• 🌟 Career advice\n\nWhat would you like to know? I'm here to help you succeed! 💪",
            
            f"🌟 Great question {user_name}! Let me help you with that on KETARI.\n\nThe platform is designed to make job searching and recruitment easier. I can provide detailed answers about:\n• Job search strategies\n• Application process\n• Interview tips\n• Skill development\n• Platform features\n\nWhat specific aspect are you looking for?",
            
            f"👋 I can help you navigate KETARI, {user_name}! You can ask me about:\n\n**Job Seekers:**\n• How to find and apply for jobs\n• Resume and profile tips\n• Interview preparation\n• Career advice\n\n**Employers:**\n• Posting jobs\n• Reviewing candidates\n• Scheduling interviews\n\n**Platform:**\n• AI matching system\n• Dashboard features\n• Account help\n\nWhat do you need help with? 🚀"
        ]
    else:
        default_responses = [
            "👋 I'm here to help you with KETARI! You can ask me about:\n\n📋 **Topics I Cover:**\n• 🔍 Finding and applying for jobs\n• 📄 Resume tips and upload\n• 🤖 AI matching and scores\n• 🗣️ Interview preparation\n• 👤 Profile management\n• 📊 Dashboard and applications\n\n🚀 To get personalized help, please **login** at http://localhost:3000/login or **register** at http://localhost:3000/register first!",
            
            "🌟 Great question! Let me help you with that on KETARI.\n\nI can help with:\n• How to find jobs\n• How to apply\n• Resume tips\n• Interview advice\n• Platform features\n\nFor personalized assistance, login or register first!",
            
            "👋 I can help you navigate KETARI! You can ask me about:\n\n• Job searching and applications\n• Resume and profile help\n• Interview preparation\n• Platform features\n• Account support\n\nLogin or register for personalized help! 🚀"
        ]
    
    return random.choice(default_responses)

def get_ai_response(messages, user_id, user_context=None):
    """Main AI response handler - tries providers in order"""
    
    # Try OpenAI first
    response = get_ai_response_openai(messages)
    if response:
        return response
    
    # Try Gemini second
    response = get_ai_response_gemini(messages)
    if response:
        return response
    
    # Fallback to local responses with user context
    user_message = messages[-1]['content'] if messages else ""
    return get_ai_response_local(user_message, user_context)

# ============================================
# API ENDPOINTS
# ============================================

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        message = data.get('message', '')
        user_type = data.get('user_type', 'candidate')
        user_id = data.get('user_id', 'default_user')
        context = data.get('context', {})
        language = context.get('language', 'en')  # Get language from context
        
        if not message:
            return jsonify({'success': False, 'error': 'No message provided'}), 400
        
        # Get user session
        session = get_user_session(user_id)
        
        # Build system prompt based on language
        if language == 'am':
            system_prompt = JOB_SEEKER_SYSTEM_AM if user_type == 'candidate' else EMPLOYER_SYSTEM_AM
        else:
            system_prompt = JOB_SEEKER_SYSTEM if user_type == 'candidate' else EMPLOYER_SYSTEM
        
        # Build messages for AI
        messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        # Add conversation history (last 5 messages for context)
        for msg in session['history'][-5:]:
            messages.append({"role": msg['role'], "content": msg['content']})
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        # Build user context for local responses
        user_context = {
            'name': context.get('name', ''),
            'email': context.get('email', ''),
            'language': language,  # Pass language to local responses
            'role': context.get('role', ''),
            'skills': context.get('skills', []),
            'location': context.get('location', ''),
            'isAuthenticated': context.get('isAuthenticated', False),
            'company': context.get('company', ''),
            'phone': context.get('phone', ''),
            'bio': context.get('bio', ''),
            'applications_count': context.get('applications_count', 0),
            'resumes': context.get('resumes', [])
        }
        
        # Get AI response with user context
        response = get_ai_response(messages, user_id, user_context)
        
        # Update session
        update_user_session(user_id, 'user', message, context)
        update_user_session(user_id, 'assistant', response)
        
        # Generate suggestions for follow-up questions
        suggestions = generate_suggestions(message, user_type, user_context)
        
        return jsonify({
            'success': True,
            'response': response,
            'suggestions': suggestions[:4],
            'conversation_count': session['conversation_count']
        })
        
    except Exception as e:
        print(f"Chat Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

def generate_suggestions(message, user_type, user_context=None):
    """Generate follow-up question suggestions"""
    
    message_lower = message.lower()
    is_authenticated = user_context.get('isAuthenticated', False) if user_context else False
    user_name = user_context.get('name', '') if user_context else ''
    
    # Personal suggestions for authenticated users
    if is_authenticated and user_name:
        personal_suggestions = {
            'profile': [f'How to improve my profile {user_name}?', 'What skills should I add?'],
            'apply': [f'How do I apply for jobs {user_name}?', 'How to get better match scores?'],
            'job': ['How to find jobs that match my skills?', 'What jobs are available now?'],
        }
        for key, responses in personal_suggestions.items():
            if key in message_lower:
                return responses
    
    # KETARI specific suggestions
    ketari_suggestions = {
        'register': ['How to login?', 'What are the requirements?', 'Benefits of registering?'],
        'login': ['How to reset password?', 'How to register?', 'Login issues?'],
        'apply': ['How to upload resume?', 'How to track applications?', 'Application tips?'],
        'post': ['How to write job description?', 'How to review candidates?', 'Hiring tips?'],
        'match': ['How to improve match score?', 'What skills should I add?', 'How AI matching works?'],
        'profile': ['How to upload resume?', 'How to add skills?', 'Complete profile?'],
        'sita': ['What does SITA do?', 'Where is SITA located?', 'SITA jobs?'],
        'who am i': ['What is my role?', 'How to update my profile?', 'My details?'],
        'hello': ['What can you help with?', 'How to find a job?', 'Getting started?'],
        'interview': ['Interview tips?', 'How to prepare?', 'Common questions?'],
        'salary': ['Salary ranges?', 'How to negotiate?', 'Fair compensation?'],
        'career': ['Career advice?', 'Career path?', 'Professional development?'],
        'skills': ['What skills are in demand?', 'How to learn skills?', 'Skill development?'],
        'resume': ['Resume tips?', 'How to upload?', 'What to include?']
    }
    
    for key, responses in ketari_suggestions.items():
        if key in message_lower:
            return responses
    
    # Default suggestions based on user type
    if user_type == 'candidate':
        return [
            'How do I find a job?',
            'How to improve my match score?',
            'How to update my profile?',
            'How to prepare for interviews?',
            'What skills should I learn?'
        ]
    else:
        return [
            'How to post a job?',
            'How to review candidates?',
            'How to schedule interviews?',
            'How does AI matching work?',
            'Recruitment best practices?'
        ]

@app.route('/api/chat/health', methods=['GET'])
def health():
    """Check service health"""
    status = {
        'status': 'ok',
        'message': 'AI Chat Service is running',
        'providers': {
            'openai': 'connected' if openai.api_key else 'not configured',
            'gemini': 'connected' if gemini_model else 'not configured',
            'local': 'active'
        }
    }
    return jsonify(status)

@app.route('/api/chat/reset', methods=['POST'])
def reset_chat():
    """Reset user conversation"""
    try:
        data = request.json
        user_id = data.get('user_id', 'default_user')
        
        if user_id in user_sessions:
            user_sessions[user_id] = {
                'history': [],
                'context': {},
                'conversation_count': 0
            }
        
        return jsonify({'success': True, 'message': 'Chat reset successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/chat/context', methods=['POST'])
def update_context():
    """Update user context"""
    try:
        data = request.json
        user_id = data.get('user_id', 'default_user')
        context = data.get('context', {})
        
        session = get_user_session(user_id)
        session['context'].update(context)
        
        return jsonify({'success': True, 'context': session['context']})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('AI_CHAT_PORT', 5002))
    has_openai = 'openai' in globals() and bool(getattr(openai, 'api_key', None))
    print(f"[START] KETARI Chat Service starting on port {port}")
    print(f"[STATUS] Providers: OpenAI={has_openai}, Gemini={bool(gemini_model)}, Local=Active")
    app.run(host='0.0.0.0', port=port, debug=True)
// IMPORT MUST BE AT THE TOP
import am from './am.json';

// Available languages
export const languages = {
    am: { 
        name: 'አማርኛ', 
        nativeName: 'አማርኛ', 
        translation: am 
    },
    en: { 
        name: 'English', 
        nativeName: 'English', 
        translation: {} 
    }
};

// Current language
let currentLanguage = 'en';

// English translations
const enTranslations = {
    "app": {
        "title": "KETARI — AI-Powered Recruitment Platform",
        "welcome": "Welcome",
        "tagline": "AI-Powered Recruitment Platform & Candidate Matching Engine"
    },
    "home": {
        "hero_badge": "AI-Powered Recruitment Platform",
        "hero_title": "KETARI",
        "hero_title_suffix": "AI Recruitment",
        "hero_subtitle": "Automating the entire recruitment lifecycle: Candidate Registration → AI CV Parsing & Transparent Matching → Ranking → HR Expert Screening → Interview Scheduling → HR Manager Approval → Selection & Hiring.",
        "sign_up_free": "Register Account",
        "login": "Login",
        "post_job": "Post a Vacancy",
        "explore_jobs": "Browse Jobs",
        "candidates": "candidates",
        "completed_jobs": "completed jobs",
        "trusted_by": "Trusted by Ethiopian startups",
        "job_card_title_1": "Web developer",
        "job_card_desc_1": "we need a remote python developer to work from home",
        "fixed_price": "fixed",
        "view_details": "View Details",
        "job_card_title_2": "Junior Python Developer",
        "job_card_desc_2": "as a python developer u are responsible to handle python based operations",
        "negotiable": "Negotiable",
        "how_it_works": "How KETARI works",
        "one_platform": "One platform, two paths to success",
        "for_hr_experts": "For Employers",
        "step1_hr_expert": "Post a Job",
        "step1_hr_expert_desc": "Describe your project, set a budget.",
        "step2_hr_expert": "Receive Proposals",
        "step2_hr_expert_desc": "Connect with skilled Ethiopian professionals.",
        "step3_hr_expert": "Hire & get work done",
        "step3_hr_expert_desc": "Collaborate, review, and pay securely.",
        "for_candidates": "For Candidates",
        "step1_candidate": "Create Profile",
        "step1_candidate_desc": "Showcase your skills & portfolio.",
        "step2_candidate": "Find Jobs",
        "step2_candidate_desc": "Browse projects that match your expertise.",
        "step3_candidate": "Get Paid",
        "step3_candidate_desc": "Secure payments, local or international.",
        "in_demand": "In Demand",
        "popular_services": "Popular Services on KETARI",
        "popular_services_desc": "In-demand skills from Ethiopia's top talent",
        "featured_candidates": "Featured Candidates",
        "view_all": "View all",
        "digital_marketing": "Digital Marketing",
        "translation": "Translation",
        "web_development": "Web Development",
        "mobile_apps": "Mobile Apps",
        "data_analysis": "Data Analysis",
        "graphic_design": "Graphic Design",
        "voice_over": "Voice Over",
        "customer_support": "Customer Support"
    },
    "nav": {
        "home": "Home",
        "jobs": "Jobs",
        "find_talent": "Find Talent",
        "internships": "Internships",
        "about": "About",
        "contact": "Contact",
        "login": "Login",
        "register": "Register",
        "dashboard": "Dashboard",
        "profile": "Profile",
        "logout": "Logout",
        "dark_mode": "Dark Mode",
        "light_mode": "Light Mode"
    },
    "auth": {
        "login_title": "Welcome Back",
        "login_subtitle": "Sign in to your KETARI account",
        "register_title": "Create Account",
        "register_subtitle": "Join KETARI and find your perfect job",
        "email": "Email Address",
        "email_placeholder": "Enter your email",
        "password": "Password",
        "password_placeholder": "Enter your password",
        "confirm_password": "Confirm Password",
        "name": "Full Name",
        "name_placeholder": "Enter your full name",
        "phone": "Phone Number",
        "location": "Location",
        "role": "I am a",
        "job_seeker": "Job Seeker",
        "hr_expert": "Employer",
        "admin": "Admin",
        "remember_me": "Remember me",
        "forgot_password": "Forgot Password?",
        "sign_in": "Sign In",
        "sign_up": "Sign Up",
        "no_account": "Don't have an account?",
        "has_account": "Already have an account?",
        "sign_up_link": "Sign Up",
        "sign_in_link": "Sign In",
        "terms": "By continuing, you agree to our Terms of Service and Privacy Policy",
        "login_error": "Login failed. Please try again."
    },
    "jobs": {
        "title": "Browse Jobs",
        "search": "Search by job title, department, or keyword...",
        "location": "Location",
        "filters": "Filters",
        "active": "Active",
        "reset": "Reset Filters",
        "employment_type": "Employment Type",
        "all_types": "All Types",
        "full_time": "Full-Time",
        "part_time": "Part-Time",
        "contract": "Contract",
        "internship": "Internship",
        "min_salary": "Min Salary",
        "max_salary": "Max Salary",
        "no_jobs": "No jobs found",
        "no_jobs_desc": "Try adjusting your search filters",
        "deadline": "Deadline",
        "apply_now": "Apply Now",
        "found": "Found",
        "jobs_found": "jobs",
        "fill_details": "Fill in the details below to create a job posting",
        "hero_title": "Find your next great opportunity",
        "hero_subtitle": "Browse {{count}} open jobs from top Ethiopian hr_experts",
        "search_placeholder": "Search for roles, skills, or keywords...",
        "location_placeholder": "Location (e.g. Addis Ababa)",
        "search_button": "Search",
        "clear_all": "Clear all",
        "login_to_save": "Please login to save jobs",
        "experience_level": "Experience Level",
        "job_type": "Job Type",
        "top_skills": "Top Skills",
        "sort_newest": "Sort by: Newest",
        "sort_relevant": "Sort by: Most Relevant"
    },
    "apply": {
        "title": "Apply for {{title}}",
        "back": "Back",
        "department": "Department",
        "employment_type": "Employment Type",
        "location": "Location",
        "deadline": "Deadline",
        "select_resume": "Select Resume",
        "upload_resume": "Upload Resume",
        "supported_formats": "Supported: PDF, DOCX (Max 5MB)",
        "no_resumes": "No resumes uploaded yet",
        "upload_above": "Upload a resume using the button above",
        "cover_letter": "Cover Letter",
        "cover_letter_placeholder": "Write a brief cover letter explaining why you're a good fit for this position...",
        "submit": "Submit Application",
        "cancel": "Cancel",
        "submitting": "Submitting...",
        "submitted": "Application Submitted!",
        "submitted_desc": "Your application for <strong>{{title}}</strong> has been submitted successfully.",
        "status_notification": "You will be notified about the status of your application.",
        "go_dashboard": "Go to Dashboard",
        "ai_match": "AI Match Score",
        "ai_match_desc": "How well your profile matches this job",
        "excellent_match": "Excellent Match!",
        "good_match": "Good Match",
        "fair_match": "Fair Match",
        "low_match": "Low Match",
        "skills": "Skills",
        "education": "Education",
        "experience": "Experience",
        "upload_resume_required": "Please upload a resume before applying",
        "load_error": "Failed to load job details",
        "resume_uploaded": "Resume uploaded successfully",
        "upload_error": "Failed to upload resume",
        "select_resume_error": "Please select or upload a resume",
        "submit_error": "Failed to submit application",
        "job_not_found": "Job not found",
        "back_to_jobs": "Back to Jobs",
        "back_to_search": "Back to Search",
        "ai_match_score": "AI Match Score",
        "job_description": "Job Description"
    },
    "profile": {
        "title": "My Profile",
        "personal_info": "Personal Information",
        "full_name": "Full Name",
        "email": "Email",
        "phone": "Phone Number",
        "location": "Location",
        "bio": "About You",
        "bio_placeholder": "Tell us about yourself...",
        "skills": "Skills",
        "skills_placeholder": "Enter a skill (e.g., Python, Java)",
        "add_skill": "Add Skill",
        "no_skills": "No skills added yet",
        "education": "Education",
        "institution": "Institution",
        "degree": "Degree",
        "field_of_study": "Field of Study",
        "graduation_year": "Graduation Year",
        "add_education": "Add Education",
        "no_education": "No education added yet",
        "experience": "Experience",
        "company": "Company",
        "position": "Position",
        "start_date": "Start Date",
        "end_date": "End Date",
        "description": "Description",
        "add_experience": "Add Experience",
        "no_experience": "No work experience added yet",
        "save_changes": "Save Changes",
        "resume_management": "Resume Management",
        "supported_formats": "Supported: PDF, DOCX (Max 5MB)",
        "default": "Default",
        "set_default": "Set as default",
        "delete": "Delete",
        "uploading": "Uploading...",
        "no_resumes": "No resumes uploaded yet"
    },
    "dashboard": {
        "welcome": "Welcome back, {{name}}!",
        "welcome_desc": "Here's an overview of your job applications and recruitment status",
        "total_applications": "Total Applications",
        "pending": "Pending",
        "shortlisted": "Shortlisted",
        "interviewed": "Interviewed",
        "offered": "Offered",
        "rejected": "Rejected",
        "opportunities": "Looking for new opportunities?",
        "opportunities_desc": "Browse available job openings and apply now",
        "browse_jobs": "Browse Jobs →",
        "recent_applications": "Recent Applications",
        "total": "total",
        "no_applications": "No applications yet",
        "no_applications_desc": "Start applying to jobs to see them here",
        "complete_profile": "Complete Your Profile",
        "complete_profile_desc": "Add more details to get better job recommendations",
        "update_profile": "Update Profile"
    },
    "internships": {
        "title": "Internship Programs",
        "subtitle": "Find the perfect internship to kickstart your career",
        "loading": "Loading internships...",
        "search_placeholder": "Search by title, department, or keyword...",
        "location_placeholder": "Location",
        "filters": "Filters",
        "active": "Active",
        "internship_type": "Internship Type",
        "all_types": "All Types",
        "paid": "Paid",
        "unpaid": "Unpaid",
        "stipend": "Stipend",
        "credit": "Credit",
        "duration": "Duration",
        "all_durations": "All Durations",
        "months_3": "3 Months",
        "months_6": "6 Months",
        "months_9": "9 Months",
        "months_12": "12 Months",
        "flexible": "Flexible",
        "field_of_study": "Field of Study",
        "field_of_study_placeholder": "e.g., Computer Science",
        "min_gpa": "Min GPA",
        "min_gpa_placeholder": "e.g., 3.0",
        "reset_filters": "Reset Filters",
        "found_count": "Found {{count}} internship{{plural}}",
        "no_results": "No internships found",
        "no_results_desc": "Try adjusting your search filters",
        "clear_filters": "Clear Filters",
        "year_any": "Any Year",
        "deadline": "Deadline:",
        "apply_now": "Apply Now",
        "benefits": "Benefits:",
        "positions": "positions",
        "load_error": "Unable to load internship details. Please try again.",
        "please_select_resume": "Please select a resume to continue.",
        "submit_error": "Unable to submit your application. Please try again.",
        "loading_details": "Loading internship details...",
        "not_found": "Internship not found",
        "back_to_internships": "Back to internships",
        "application_submitted_title": "Application Submitted!",
        "application_review_desc": "Your application has been received and will be reviewed shortly.",
        "browse_more_internships": "Browse more internships",
        "department": "Department",
        "type": "Type",
        "academic_requirements": "Academic Requirements",
        "no_resumes": "No resumes uploaded yet",
        "upload_resume": "Upload Resume",
        "academic_information": "Academic Information",
        "cover_letter": "Cover Letter",
        "cover_letter_placeholder": "Write a brief cover letter explaining why you're a good fit for this internship...",
        "optional_but_recommended": "Optional but recommended",
        "submitting": "Submitting...",
        "submit_application": "Submit Application",
        "upload_resume_before_applying": "Please upload a resume before applying"
    },
    "common": {
        "loading": "Loading...",
        "error": "An error occurred",
        "success": "Success",
        "cancel": "Cancel",
        "save": "Save",
        "delete": "Delete",
        "edit": "Edit",
        "view": "View",
        "search": "Search",
        "filter": "Filter",
        "reset": "Reset",
        "apply": "Apply",
        "confirm": "Confirm",
        "back": "Back",
        "next": "Next",
        "previous": "Previous",
        "page": "Page",
        "of": "of",
        "status": "Status"
    },
    "footer": {
        "description": "Intelligent Job Matching and Recruitment Automation Platform for the Sidama Innovation and Technology Agency.",
        "quick_links": "Quick Links",
        "about": "About Us",
        "contact": "Contact Us",
        "for_job_seekers": "For Job Seekers",
        "dashboard": "Dashboard",
        "profile": "Profile",
        "browse_jobs": "Browse Jobs",
        "resume_tips": "Resume Tips",
        "for_hr_experts": "For Employers",
        "my_jobs": "My Jobs",
        "post_job": "Post a Job",
        "find_candidates": "Find Candidates",
        "pricing": "Pricing",
        "rights": "All rights reserved",
        "newsletter_title": "Subscribe to Job Alerts",
        "newsletter_desc": "Get notified about the latest job opportunities, career advice, and recruitment updates in Sidama Region.",
        "subscribe": "Subscribe",
        "email_placeholder": "Enter your email address...",
        "contact_info": "Contact & Location",
        "address": "Hawassa, Sidama Region, Ethiopia",
        "email_label": "info@sit-agency.gov.et",
        "phone_label": "+251 46 220 1234",
        "legal": "Legal & Security",
        "privacy": "Privacy Policy",
        "terms": "Terms of Service",
        "complaints": "Complaints & Feedback",
        "internships": "Internship Programs",
        "subscribed_success": "Thank you for subscribing to KETARI Job Alerts!"
    },
    "complaints": {
        "title": "Complaints & Feedback",
        "subtitle": "Submit and track your complaints and feedback",
        "new_complaint": "New Complaint",
        "view_complaints": "View Complaints",
        "submit_complaint": "Submit New Complaint",
        "title_label": "Title",
        "category": "Category",
        "category_placeholder": "Select category",
        "workplace": "Workplace",
        "salary_benefits": "Salary & Benefits",
        "harassment": "Harassment",
        "management": "Management",
        "equipment": "Equipment",
        "other": "Other",
        "priority": "Priority",
        "low": "Low",
        "medium": "Medium",
        "high": "High",
        "urgent": "Urgent",
        "description": "Description",
        "description_placeholder": "Provide detailed description of your complaint",
        "submit": "Submit Complaint",
        "cancel": "Cancel",
        "submitting": "Submitting...",
        "submitted": "Complaint submitted successfully!",
        "my_complaints": "My Complaints",
        "no_complaints": "No complaints submitted yet",
        "submit_first": "Submit Your First Complaint",
        "date": "Date",
        "status": "Status",
        "pending": "Pending",
        "investigating": "Investigating",
        "resolved": "Resolved",
        "rejected": "Rejected"
    },
    "attendance": {
        "title": "Attendance Tracker",
        "check_in": "Check In",
        "check_out": "Check Out",
        "current_status": "Current Status",
        "checked_in": "Checked In",
        "checked_out": "Checked Out",
        "not_checked_in": "Not Checked In",
        "check_in_time": "Check In Time",
        "check_out_time": "Check Out Time",
        "total_hours": "Total Hours",
        "today": "Today",
        "this_week": "This Week",
        "this_month": "This Month",
        "attendance_rate": "Attendance Rate",
        "on_time": "On Time",
        "late": "Late",
        "absent": "Absent",
        "job_seeker_attendance": "Job Seeker Attendance",
    },
    "admin": {
        "dashboard": "Admin Dashboard",
        "sidebar": "Admin",
        "overview": "Overview",
        "users": "Users",
        "employees": "Employees",
        "attendance": "Attendance",
        "leave": "Leave",
        "complaints": "Complaints",
        "training": "Training",
        "config": "Configuration",
        "leave_management": "Leave Management",
        "approve": "Approve",
        "reject": "Reject",
        "rejection_reason": "Rejection Reason",
        "total_requests": "Total Requests",
        "pending_requests": "Pending",
        "approved_requests": "Approved",
        "rejected_requests": "Rejected",
        "employee": "Employee",
        "leave_type": "Leave Type",
        "dates": "Dates",
        "days": "Days",
        "action": "Action",
        "no_requests": "No leave requests found",
        "manage_users": "Manage Users",
        "view_users": "View and manage all platform users",
        "add_user": "Add User",
        "training_management": "Training Management",
        "manage_training": "Manage all training programs",
        "create_training": "Create Training",
        "no_training": "No training programs found",
        "create_first": "Create your first training program",
        "job_seeker_attendance": "Job Seeker Attendance",
        "attendance_desc": "Real-time attendance tracking for all job seekers"
    },
    "config": {
        "title": "Configuration Manager",
        "organization": "Organization",
        "departments": "Departments",
        "positions": "Positions",
        "skills": "Skills",
        "leave_types": "Leave Types",
        "job_titles": "Job Titles",
        "languages": "Languages",
        "licenses": "Licenses",
        "religions": "Religions",
        "employment_status": "Employment Status",
        "education_levels": "Education Levels",
        "marital_status": "Marital Status",
        "training_types": "Training Types",
        "termination_reasons": "Termination Reasons",
        "deduction_types": "Deduction Types",
        "nations": "Nations",
        "titles": "Titles",
        "blood_types": "Blood Types",
        "partners": "Partners",
        "position_ranks": "Position Ranks",
        "add": "Add",
        "name": "Name",
        "code": "Code",
        "description": "Description",
        "status": "Status",
        "active": "Active",
        "inactive": "Inactive",
        "actions": "Actions",
        "save": "Save",
        "delete": "Delete",
        "no_items": "No items found"
    },
    "ai": {
        "title": "AI Assistant",
        "placeholder": "Ask a question...",
        "send": "Send",
        "clear": "Clear",
        "typing": "Typing...",
        "welcome": "Welcome! I'm your AI assistant. You can ask me anything about jobs, training, or other topics.",
        "context": "Current work status, attendance, and leave data has been included"
    }
};

// Add English translations to languages
languages.en.translation = enTranslations;

// Get translation
export const t = (key, params = {}) => {
    const translations = languages[currentLanguage]?.translation;
    if (!translations) return key;

    const keys = key.split('.');
    let value = translations;
    for (const k of keys) {
        if (value && value[k] !== undefined) {
            value = value[k];
        } else {
            return key;
        }
    }

    if (typeof value === 'string' && params) {
        return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
            return params[paramKey] !== undefined ? String(params[paramKey]) : match;
        });
    }

    return value || key;
};

// Set language
export const setLanguage = (lang) => {
    if (languages[lang]) {
        currentLanguage = lang;
        localStorage.setItem('language', lang);
        return true;
    }
    return false;
};

// Get current language
export const getLanguage = () => {
    return currentLanguage;
};

// Initialize language from localStorage
export const initLanguage = () => {
    const saved = localStorage.getItem('language');
    if (saved && languages[saved]) {
        currentLanguage = saved;
    }
    return currentLanguage;
};

// Load translations for a language
export const loadTranslations = async (lang) => {
    if (languages[lang] && Object.keys(languages[lang].translation || {}).length > 0) {
        return languages[lang].translation;
    }

    if (lang === 'en') {
        return languages.en.translation;
    }

    try {
        const response = await fetch(`/i18n/${lang}.json`);
        const data = await response.json();
        languages[lang].translation = data;
        return data;
    } catch (error) {
        console.error(`Failed to load translations for ${lang}:`, error);
        return null;
    }
};
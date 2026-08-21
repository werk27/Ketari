from flask import Flask, jsonify, request
from flask_cors import CORS
import re

app = Flask(__name__)
CORS(app)

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'message': 'AI Service is running'})

@app.route('/api/parse-resume', methods=['POST'])
def parse_resume():
    data = request.json
    text = data.get('text', '')
    
    result = {
        'success': True,
        'data': {
            'name': text.split('\n')[0] if text else '',
            'email': extract_email(text),
            'skills': extract_skills(text),
            'education': extract_education(text),
            'work_experience': extract_experience(text)
        }
    }
    return jsonify(result)

def extract_email(text):
    pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    match = re.search(pattern, text)
    return match.group(0) if match else ''

def extract_skills(text):
    common_skills = ['python', 'java', 'javascript', 'react', 'node.js', 'mongodb', 
                     'sql', 'html', 'css', 'bootstrap', 'django', 'flask',
                     'machine learning', 'ai', 'data science', 'cloud', 'aws',
                     'c++', 'c#', 'ruby', 'php', 'docker', 'kubernetes', 'git']
    found_skills = []
    text_lower = text.lower()
    for skill in common_skills:
        if skill in text_lower:
            found_skills.append(skill)
    return found_skills

def extract_education(text):
    education = []
    lines = text.split('\n')
    for line in lines:
        line_lower = line.lower()
        if any(word in line_lower for word in ['university', 'college', 'institute', 
                                                 'bachelor', 'master', 'phd', 'diploma',
                                                 'b.sc', 'm.sc', 'bcs', 'mcs']):
            education.append({'institution': line.strip()})
    return education

def extract_experience(text):
    experience = []
    lines = text.split('\n')
    for line in lines:
        line_lower = line.lower()
        if any(word in line_lower for word in ['experience', 'developer', 'engineer', 
                                                 'manager', 'analyst', 'worked', 'position']):
            if len(line.strip()) > 10:
                experience.append({'company': line.strip()})
    return experience

@app.route('/api/match-score', methods=['POST'])
def calculate_match_score():
    data = request.json or {}
    job = data.get('job', {})
    candidate = data.get('candidate', {})
    
    job_skills = [s.lower().strip() for s in job.get('requirements', {}).get('skills', [])]
    candidate_skills = [s.lower().strip() for s in candidate.get('skills', [])]
    
    matching_skills = [s for s in job_skills if any(c in s or s in c for c in candidate_skills)] if job_skills else []
    missing_skills = [s for s in job_skills if s not in matching_skills] if job_skills else []
    
    skills_score = int((len(matching_skills) / len(job_skills)) * 100) if job_skills else 100
    
    job_edu = job.get('requirements', {}).get('education', '').lower()
    cand_edu = [str(e).lower() for e in candidate.get('education', [])]
    edu_score = 100 if not job_edu or any(job_edu in e for e in cand_edu) else 60
    
    job_exp = job.get('requirements', {}).get('experience', '').lower()
    cand_exp = candidate.get('workExperience', [])
    exp_score = 100 if not job_exp else (85 if cand_exp else 50)
    
    job_loc = job.get('location', '').lower()
    cand_loc = candidate.get('location', '').lower()
    loc_score = 100 if not job_loc or not cand_loc or job_loc in cand_loc or cand_loc in job_loc else 70
    
    total_score = int((skills_score * 0.40) + (edu_score * 0.25) + (exp_score * 0.25) + (loc_score * 0.10))
    total_score = min(max(total_score, 0), 100)
    
    return jsonify({
        'success': True, 
        'score': total_score,
        'details': {
            'skillsScore': skills_score,
            'educationScore': edu_score,
            'experienceScore': exp_score,
            'locationScore': loc_score,
            'matchingSkills': matching_skills,
            'missingSkills': missing_skills
        }
    })

@app.route('/api/recommend-jobs', methods=['POST'])
def recommend_jobs():
    data = request.json
    candidate = data.get('candidate', {})
    jobs = data.get('jobs', [])
    
    recommendations = []
    for job in jobs:
        job_skills = job.get('requirements', {}).get('skills', [])
        candidate_skills = candidate.get('skills', [])
        
        if job_skills and candidate_skills:
            matching = len(set([s.lower() for s in job_skills]) & set([s.lower() for s in candidate_skills]))
            score = int((matching / len(job_skills)) * 100) if job_skills else 0
        else:
            score = 50
        
        recommendations.append({
            'job': job,
            'matchScore': min(score, 100)
        })
    
    recommendations.sort(key=lambda x: x['matchScore'], reverse=True)
    
    return jsonify({
        'success': True,
        'recommendations': recommendations[:10]
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)

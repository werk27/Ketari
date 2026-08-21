import {
    FaChartBar, FaBriefcase, FaFileAlt, FaUsers, FaRobot,
    FaClipboardCheck, FaBell, FaBuilding, FaCog, FaPlusCircle,
    FaUserFriends, FaListAlt, FaCalendarAlt, FaClipboardList,
    FaGraduationCap, FaExchangeAlt, FaUserClock, FaComments, FaUserCheck, FaShieldAlt
} from 'react-icons/fa';

/**
 * Role-specific navigation.
 *
 * Each role gets its own workspace, mirroring the backend capability matrix so
 * a user is never shown an action the API would reject:
 *   SYSTEM ADMINISTRATOR -> manages the PLATFORM only
 *   EMPLOYER             -> owns the ORGANIZATION and its HR environment
 *   HR EXPERT            -> RECORDS / PROCESSES / SUBMITS
 *   HR MANAGER           -> VIEWS / REVIEWS / APPROVES / SUPERVISES
 *   EMPLOYEE             -> uses employee HR services for themselves
 *   CANDIDATE            -> participates in recruitment
 */
export const NAVIGATION = {
    hr_expert: {
        title: 'HR Expert Workspace',
        subtitle: 'HR & Recruitment Operations',
        home: '/hr-expert/dashboard',
        sections: [
            {
                label: null,
                items: [
                    { to: '/hr-expert/dashboard', label: 'Dashboard', icon: FaChartBar, end: true }
                ]
            },
            {
                label: 'Recruitment',
                items: [
                    { to: '/hr-expert/job-creator', label: 'Job Creator', icon: FaPlusCircle },
                    { to: '/hr-expert/vacancies', label: 'My Vacancies', icon: FaBriefcase },
                    { to: '/hr-expert/applications', label: 'Applications', icon: FaFileAlt },
                    { to: '/hr-expert/candidates', label: 'Candidates', icon: FaUsers },
                    { to: '/hr-expert/ai-matching', label: 'AI Matching', icon: FaRobot }
                ]
            },
            {
                label: 'HR Operations',
                items: [
                    { to: '/hr-expert/employees', label: 'Employees', icon: FaUserFriends },
                    { to: '/hr-expert/onboarding', label: 'Onboarding', icon: FaUserCheck },
                    { to: '/hr-expert/leave', label: 'Leave', icon: FaCalendarAlt },
                    { to: '/hr-expert/requests', label: 'Employee Requests', icon: FaClipboardList },
                    { to: '/hr-expert/training', label: 'Training', icon: FaGraduationCap },
                    { to: '/hr-expert/complaints', label: 'Complaints', icon: FaComments }
                ]
            },
            {
                label: 'My Workspace',
                items: [
                    { to: '/hr-expert/my-hr', label: 'My HR Services', icon: FaUserClock }
                ]
            }
        ]
    },

    hr_manager: {
        title: 'HR Manager Workspace',
        subtitle: 'Review & Approval',
        home: '/hr-manager/dashboard',
        sections: [
            {
                label: null,
                items: [
                    { to: '/hr-manager/dashboard', label: 'Dashboard', icon: FaChartBar, end: true }
                ]
            },
            {
                label: 'Approvals',
                items: [
                    { to: '/hr-manager/vacancy-approvals', label: 'Vacancy Approvals', icon: FaClipboardCheck },
                    { to: '/hr-manager/shortlists', label: 'Hiring Decisions', icon: FaUserCheck },
                    { to: '/hr-manager/leave', label: 'Leave Approvals', icon: FaCalendarAlt },
                    { to: '/hr-manager/requests', label: 'Employee Requests', icon: FaClipboardList },
                    { to: '/hr-manager/training', label: 'Training Approvals', icon: FaGraduationCap }
                ]
            },
            {
                label: 'Oversight',
                items: [
                    { to: '/hr-manager/vacancies', label: 'Vacancies', icon: FaBriefcase },
                    { to: '/hr-manager/applications', label: 'Applications', icon: FaFileAlt },
                    { to: '/hr-manager/candidates', label: 'Candidates', icon: FaUsers },
                    { to: '/hr-manager/employees', label: 'Employees', icon: FaUserFriends },
                    { to: '/hr-manager/onboarding', label: 'Onboarding', icon: FaUserCheck },
                    { to: '/hr-manager/complaints', label: 'Complaints', icon: FaComments },
                    { to: '/hr-manager/delegation', label: 'Delegation', icon: FaExchangeAlt }
                ]
            },
            {
                label: 'My Workspace',
                items: [
                    { to: '/hr-manager/my-hr', label: 'My HR Services', icon: FaUserClock }
                ]
            }
        ]
    },

    employer: {
        title: 'Employer HR Workspace',
        subtitle: 'Human Resource Management',
        home: '/employer/dashboard',
        sections: [
            {
                label: null,
                items: [
                    { to: '/employer/dashboard', label: 'Dashboard', icon: FaChartBar, end: true }
                ]
            },
            {
                label: 'Organization',
                items: [
                    { to: '/employer/profile', label: 'Organization Profile', icon: FaBuilding },
                    { to: '/employer/verification', label: 'Verification', icon: FaShieldAlt },
                    { to: '/employer/team', label: 'HR Team', icon: FaUserFriends },
                    { to: '/employer/configuration', label: 'Configuration', icon: FaCog }
                ]
            },
            {
                label: 'Employees',
                items: [
                    { to: '/employer/employees', label: 'Employee Directory', icon: FaUsers },
                    { to: '/employer/leave', label: 'Leave', icon: FaCalendarAlt },
                    { to: '/employer/requests', label: 'Employee Requests', icon: FaClipboardList },
                    { to: '/employer/training', label: 'Training', icon: FaGraduationCap },
                    { to: '/employer/complaints', label: 'Complaints', icon: FaComments }
                ]
            },
            {
                label: 'Recruitment',
                items: [
                    { to: '/employer/vacancies', label: 'Vacancies', icon: FaBriefcase },
                    { to: '/employer/applications', label: 'Applications', icon: FaFileAlt }
                ]
            }
        ]
    },

    admin: {
        title: 'System Administration',
        subtitle: 'Platform Management',
        home: '/admin/dashboard',
        sections: [
            {
                label: null,
                items: [
                    { to: '/admin/dashboard', label: 'Dashboard', icon: FaChartBar, end: true }
                ]
            },
            {
                label: 'Platform',
                items: [
                    { to: '/admin/employers', label: 'Employers', icon: FaBuilding },
                    { to: '/admin/users/all', label: 'Users', icon: FaUsers }
                ]
            },
            {
                label: 'Configuration',
                items: [
                    { to: '/admin/config', label: 'Platform Defaults', icon: FaCog }
                ]
            },
            {
                label: 'Monitoring',
                items: [
                    { to: '/admin/complaints', label: 'Platform Feedback', icon: FaBell }
                ]
            }
        ]
    },

    employee: {
        title: 'My HR Workspace',
        subtitle: 'Employee Services',
        home: '/employee/dashboard',
        sections: [
            {
                label: null,
                items: [
                    { to: '/employee/dashboard', label: 'My HR Services', icon: FaChartBar, end: true }
                ]
            },
            {
                label: 'My Records',
                items: [
                    { to: '/employee/onboarding', label: 'Complete My Profile', icon: FaUserCheck },
                    { to: '/employee/profile', label: 'My Profile', icon: FaUsers },
                    { to: '/employee/complaints', label: 'Complaints & Feedback', icon: FaComments }
                ]
            }
        ]
    },

    candidate: {
        title: 'My Career',
        subtitle: 'Job Seeker',
        home: '/candidate/dashboard',
        sections: [
            {
                label: null,
                items: [
                    { to: '/candidate/dashboard', label: 'Dashboard', icon: FaChartBar, end: true }
                ]
            },
            {
                label: 'My Job Search',
                items: [
                    { to: '/jobs', label: 'Find Jobs', icon: FaBriefcase },
                    { to: '/candidate/profile', label: 'My Profile', icon: FaListAlt },
                    { to: '/candidate/complaints', label: 'Complaints & Feedback', icon: FaBell }
                ]
            }
        ]
    }
};

export const ROLE_LABELS = {
    admin: 'System Administrator',
    employer: 'Employer',
    hr_expert: 'HR Expert',
    hr_manager: 'HR Manager',
    employee: 'Employee',
    candidate: 'Candidate'
};

export const getNavigation = (role) => NAVIGATION[role] || null;

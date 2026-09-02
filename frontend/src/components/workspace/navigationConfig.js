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
                    { to: '/hr-expert/requisitions', label: 'Job Requisitions', icon: FaClipboardList },
                    { to: '/hr-expert/job-creator', label: 'Job Creator', icon: FaPlusCircle },
                    { to: '/hr-expert/vacancies', label: 'My Vacancies', icon: FaBriefcase },
                    { to: '/hr-expert/applications', label: 'Applications', icon: FaFileAlt },
                    { to: '/hr-expert/candidates', label: 'Candidates', icon: FaUsers },
                    { to: '/hr-expert/ai-matching', label: 'AI Matching', icon: FaRobot },
                    { to: '/hr-expert/reports', label: 'Recruitment Report', icon: FaChartBar }
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
                    { to: '/hr-expert/complaints', label: 'Complaints', icon: FaComments },
                    { to: '/hr-expert/delegation', label: 'Delegation', icon: FaExchangeAlt }
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
                    { to: '/hr-manager/requisitions', label: 'Job Requisitions', icon: FaClipboardList },
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
                    { to: '/hr-manager/reports', label: 'Recruitment Report', icon: FaChartBar },
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
                    { to: '/employer/complaints', label: 'Complaints', icon: FaComments },
                    { to: '/employer/delegation', label: 'Delegation', icon: FaExchangeAlt }
                ]
            },
            {
                label: 'Recruitment',
                items: [
                    { to: '/employer/requisitions', label: 'Job Requisitions', icon: FaClipboardList },
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
                    { to: '/employee/complaints', label: 'Complaints & Feedback', icon: FaComments },
                    { to: '/employee/delegation', label: 'My Delegations', icon: FaExchangeAlt }
                ]
            },
            {
                // Being hired does not end a job search, and someone hired by one
                // organization may still have an application open with another.
                label: 'My Job Search',
                items: [
                    { to: '/jobs', label: 'Find Jobs', icon: FaBriefcase },
                    { to: '/candidate/dashboard', label: 'My Applications', icon: FaListAlt }
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

/**
 * Extra navigation an employee gains by heading a department.
 *
 * A Department Head is not a role - they keep the whole employee workspace and
 * gain a department section on top of it. Anything HR Expert or HR Manager
 * specific is deliberately absent: these are read-only department views plus
 * the one thing a head actually originates, a Job Requisition.
 */
const DEPARTMENT_HEAD_SECTION = {
    label: 'My Department',
    items: [
        { to: '/employee/department', label: 'Department Dashboard', icon: FaChartBar, end: true },
        { to: '/employee/department/profile', label: 'My Department', icon: FaBuilding },
        { to: '/employee/department/employees', label: 'Department Employees', icon: FaUserFriends },
        { to: '/employee/requisitions', label: 'Job Requisitions', icon: FaClipboardList },
        { to: '/employee/recruitment', label: 'Recruitment Status', icon: FaClipboardCheck }
    ]
};

/**
 * Pages a user may temporarily need through an ACTIVE delegation.
 *
 * The backend genuinely grants delegated capabilities (see
 * delegationCapabilities.js), but each workspace's static navigation only
 * lists what the ROLE normally does - so a delegate could hold e.g.
 * 'leave:approve' with no way to reach the leave page. Any entry whose
 * capability appears in the user's capabilities but NOT in their own
 * intrinsic ownCapabilities is surfaced in a "Delegated Duties" section of
 * their own workspace. Navigation only ever mirrors what the backend
 * already granted - it never grants anything itself.
 */
const DELEGATED_PAGES = [
    { caps: ['leave:view', 'leave:process', 'leave:approve'], path: 'leave', label: 'Leave', icon: FaCalendarAlt },
    { caps: ['request:view', 'request:process', 'request:approve'], path: 'requests', label: 'Employee Requests', icon: FaClipboardList },
    { caps: ['training:view', 'training:record', 'training:approve'], path: 'training', label: 'Training', icon: FaGraduationCap },
    { caps: ['employee:view'], path: 'employees', label: 'Employees', icon: FaUserFriends },
    // The employee workspace already uses /complaints for raising their own,
    // so the management view lives on its own path there (see App.js).
    { caps: ['complaint:handle'], path: 'complaints', employeePath: 'complaints-management', label: 'Complaints Handling', icon: FaComments }
];

/** Extra section for capabilities held only via an active delegation. */
const delegatedDutiesSection = (user, base) => {
    const own = new Set(user.ownCapabilities || []);
    const merged = user.capabilities || [];
    if (!merged.length || own.size === 0) return null;

    const delegatedOnly = merged.filter(c => !own.has(c));
    if (delegatedOnly.length === 0) return null;

    const prefix = `/${(base.home || '').split('/')[1] || ''}`;
    const existingTargets = new Set(base.sections.flatMap(s => s.items.map(i => i.to)));

    const items = DELEGATED_PAGES
        .filter(page => page.caps.some(c => delegatedOnly.includes(c)))
        .map(page => {
            const path = (user.role === 'employee' && page.employeePath) ? page.employeePath : page.path;
            return { to: `${prefix}/${path}`, label: page.label, icon: page.icon };
        })
        .filter(item => !existingTargets.has(item.to));

    if (items.length === 0) return null;
    return { label: 'Delegated Duties', items };
};

export const ROLE_LABELS = {
    admin: 'System Administrator',
    employer: 'Employer',
    hr_expert: 'HR Expert',
    hr_manager: 'HR Manager',
    employee: 'Employee',
    candidate: 'Candidate'
};

/**
 * How a signed-in member should be introduced inside their organization.
 *
 * `role` only decides which workspace someone gets, so on its own it presented
 * everybody as a bare "Employee" - it never said what they actually do there.
 * The position (from their employee record / the organization's configured
 * Position) and the departments they head come from `user.employment`, built
 * by the backend auth payload.
 */
export const describeEmployment = (user) => {
    const roleLabel = ROLE_LABELS[user?.role] || user?.role || '';
    const employment = user?.employment || null;
    const headOf = (employment?.headOfDepartments || []).map(d => d.name).filter(Boolean);
    const isDepartmentHead = !!employment?.isDepartmentHead && headOf.length > 0;

    // A Department Head outranks a generic position title: it is the standing
    // that decides what they may do (raise Job Requisitions for that
    // department), so it leads. Otherwise their position, and only when the
    // organization holds neither do we fall back to the account role.
    const title = isDepartmentHead
        ? `Head of ${headOf.join(', ')}`
        : (employment?.jobTitle || roleLabel);

    // Never repeat the department when it is already named in the title.
    const department = isDepartmentHead ? '' : (employment?.departmentName || '');

    return {
        roleLabel,
        title,
        department,
        isDepartmentHead,
        headOf,
        // Their position still matters when the head badge took the title.
        positionTitle: employment?.jobTitle || '',
        employeeId: employment?.employeeId || '',
        subtitle: [title, department].filter(Boolean).join(' · ')
    };
};

/**
 * The navigation for a signed-in user.
 *
 * Takes the whole user, not just the role, because one employee account can
 * carry an extra responsibility - heading a department - that changes what
 * they should see. `getNavigation(role)` still works for callers that only
 * have a role string.
 */
export const getNavigation = (userOrRole) => {
    const user = typeof userOrRole === 'string' ? { role: userOrRole } : (userOrRole || {});
    const base = NAVIGATION[user.role] || null;
    if (!base) return null;

    // Pages reachable only through an active delegation, if any.
    const delegatedSection = delegatedDutiesSection(user, base);

    if (user.role !== 'employee' || !user.employment?.isDepartmentHead) {
        if (!delegatedSection) return base;
        return { ...base, sections: [...base.sections, delegatedSection] };
    }

    // The department section leads: for a head this is the reason they open
    // the workspace, and their own HR services stay exactly where they were.
    const [overview, ...rest] = base.sections;
    return {
        ...base,
        subtitle: 'Employee & Department Head',
        sections: [
            overview,
            DEPARTMENT_HEAD_SECTION,
            ...rest,
            ...(delegatedSection ? [delegatedSection] : [])
        ]
    };
};

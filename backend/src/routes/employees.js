const express = require('express');
const router = express.Router();
const {
    createEmployee,
    getEmployees,
    getEmployee,
    getMyEmployeeRecord,
    updateEmployee,
    deleteEmployee,
    getEmployeeStatistics,
    getUnlinkedAccounts,
    createEmployeeAccount,
    linkEmployeeAccount,
    setEmployeeAccountStatus,
    assignEmployeeRole,
    resendEmployeeCredentials
} = require('../controllers/employeeController');
const { protect, can, withEmployerScope, requireActiveEmployer } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');
const {
    getMyOnboarding,
    submitMyOnboarding,
    getOnboardingQueue,
    verifyOnboarding,
    approveOnboarding,
    returnOnboarding
} = require('../controllers/onboardingController');

// ---------------------------------------------------------------------------
// Onboarding. Declared before '/:id' so these paths are not captured by it.
// ---------------------------------------------------------------------------

// @route   GET /api/employees/onboarding/me
// @desc    The signed-in employee's own onboarding record and progress
// @access  Private (the employee themselves)
router.get('/onboarding/me', protect, getMyOnboarding);

// @route   PUT /api/employees/onboarding/me
// @desc    Employee provides the information recruitment could not supply
// @access  Private (the employee themselves)
router.put('/onboarding/me', protect, submitMyOnboarding);

// @route   GET /api/employees/onboarding
// @desc    Onboarding queue for the caller's organization
// @access  Private (employee:view)
router.get('/onboarding', protect, can(CAPABILITIES.EMPLOYEE_VIEW), withEmployerScope, getOnboardingQueue);

// @route   PUT /api/employees/:id/onboarding/verify
// @desc    HR Expert verifies a submitted profile and forwards it
// @access  Private (employee:record)
router.put('/:id/onboarding/verify', protect, can(CAPABILITIES.EMPLOYEE_RECORD), withEmployerScope, verifyOnboarding);

// @route   PUT /api/employees/:id/onboarding/approve
// @desc    HR Manager approves a verified profile
// @access  Private (employee:delete - the HR Manager oversight capability)
router.put('/:id/onboarding/approve', protect, can(CAPABILITIES.EMPLOYEE_DELETE), withEmployerScope, approveOnboarding);

// @route   PUT /api/employees/:id/onboarding/return
// @desc    Return a record to the employee for correction
// @access  Private (employee:view - HR Expert or HR Manager)
router.put('/:id/onboarding/return', protect, can(CAPABILITIES.EMPLOYEE_VIEW), withEmployerScope, returnOnboarding);

// @route   GET /api/employees/me
// @desc    The signed-in user's own employee record
// @access  Private (any authenticated user)
router.get('/me', protect, getMyEmployeeRecord);

// @route   GET /api/employees/statistics
// @desc    Employee statistics for the caller's organization
// @access  Private (employee:view)
router.get('/statistics', protect, can(CAPABILITIES.EMPLOYEE_VIEW), withEmployerScope, getEmployeeStatistics);

// @route   GET /api/employees/accounts/unlinked
// @desc    User accounts in this organization not yet linked to any employee
//          record (populates "link an existing account"). Declared before
//          '/:id' so the literal path is never read as an employee id.
// @access  Private (org:team - the employer)
router.get('/accounts/unlinked', protect, can(CAPABILITIES.ORG_TEAM_MANAGE), withEmployerScope, getUnlinkedAccounts);

// @route   POST /api/employees
// @desc    Record a new employee
// @access  Private (HR Expert - records information)
router.post('/', protect, can(CAPABILITIES.EMPLOYEE_RECORD), withEmployerScope, createEmployee);

// @route   GET /api/employees
// @desc    Employee directory for the caller's organization
// @access  Private (employee:view)
router.get('/', protect, can(CAPABILITIES.EMPLOYEE_VIEW), withEmployerScope, getEmployees);

// @route   GET /api/employees/:id
// @desc    Single employee (own record always permitted)
// @access  Private
router.get('/:id', protect, getEmployee);

// @route   PUT /api/employees/:id
// @desc    Update an employee record
// @access  Private (HR Expert)
router.put('/:id', protect, can(CAPABILITIES.EMPLOYEE_RECORD), withEmployerScope, updateEmployee);

// @route   DELETE /api/employees/:id
// @desc    Mark an employee as terminated (history is retained)
// @access  Private (HR Manager)
router.delete('/:id', protect, can(CAPABILITIES.EMPLOYEE_DELETE), withEmployerScope, deleteEmployee);

// ---------------------------------------------------------------------------
// Employee <-> User account <-> Organizational role.
//
// Restricted to the employer (org:team, the same capability that already
// gates /employers/me/team) rather than the HR Expert's employee:record
// capability - recording someone's personal/employment details is routine
// HR Expert work, but granting login access or an organizational role is an
// ownership-level decision, consistent with how team membership already
// works elsewhere in this app.
// ---------------------------------------------------------------------------

// @route   POST /api/employees/:id/account
// @desc    Create a new user account for an existing employee
// @access  Private (org:team - the employer)
router.post('/:id/account', protect, can(CAPABILITIES.ORG_TEAM_MANAGE), withEmployerScope, requireActiveEmployer, createEmployeeAccount);

// @route   PUT /api/employees/:id/account/link
// @desc    Link an existing, unlinked user account to this employee
// @access  Private (org:team - the employer)
router.put('/:id/account/link', protect, can(CAPABILITIES.ORG_TEAM_MANAGE), withEmployerScope, linkEmployeeAccount);

// @route   PUT /api/employees/:id/account/status
// @desc    Activate or deactivate the employee's linked account
// @access  Private (org:team - the employer)
router.put('/:id/account/status', protect, can(CAPABILITIES.ORG_TEAM_MANAGE), withEmployerScope, setEmployeeAccountStatus);

// @route   PUT /api/employees/:id/role
// @desc    Assign an organizational role to the employee's linked account
// @access  Private (org:team - the employer)
router.put('/:id/role', protect, can(CAPABILITIES.ORG_TEAM_MANAGE), withEmployerScope, requireActiveEmployer, assignEmployeeRole);

// @route   POST /api/employees/:id/account/resend-credentials
// @desc    Resend the employee's login/credential-setup email
// @access  Private (org:team - the employer)
router.post('/:id/account/resend-credentials', protect, can(CAPABILITIES.ORG_TEAM_MANAGE), withEmployerScope, resendEmployeeCredentials);

module.exports = router;

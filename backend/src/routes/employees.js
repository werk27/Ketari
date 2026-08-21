const express = require('express');
const router = express.Router();
const {
    createEmployee,
    getEmployees,
    getEmployee,
    getMyEmployeeRecord,
    updateEmployee,
    deleteEmployee,
    getEmployeeStatistics
} = require('../controllers/employeeController');
const { protect, can, withEmployerScope } = require('../middleware/auth');
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

module.exports = router;

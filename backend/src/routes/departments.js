const express = require('express');
const router = express.Router();
const {
    getMyDepartments,
    getMyDepartmentOverview,
    getMyDepartmentEmployees,
    getMyDepartmentRecruitment
} = require('../controllers/departmentController');
const { protect, withEmployerScope } = require('../middleware/auth');
const { withDepartmentHeadScope } = require('../services/departmentScope');

/**
 * Department Head workspace - read-only, scoped to the departments the caller
 * actually heads.
 *
 * Every route is guarded by the same three-layer chain:
 *   protect                 -> a real, active account
 *   withEmployerScope       -> the tenant boundary (req.employerId)
 *   withDepartmentHeadScope -> the departments they head (req.headedDepartmentIds)
 *
 * There is deliberately no POST/PUT/DELETE here. A Department Head changes the
 * organization through exactly one channel - the existing Job Requisition
 * workflow (/api/requisitions) - and never edits configuration, departments,
 * positions, salaries, employee records or HR roles.
 */

// @route   GET /api/departments/mine
// @desc    The departments the caller heads, with positions and vacancies
// @access  Private (Department Head)
router.get('/mine', protect, withEmployerScope, withDepartmentHeadScope, getMyDepartments);

// @route   GET /api/departments/mine/overview
// @desc    Department-only dashboard figures
// @access  Private (Department Head)
router.get('/mine/overview', protect, withEmployerScope, withDepartmentHeadScope, getMyDepartmentOverview);

// @route   GET /api/departments/mine/employees
// @desc    Employees in the caller's department (non-sensitive fields only)
// @access  Private (Department Head)
router.get('/mine/employees', protect, withEmployerScope, withDepartmentHeadScope, getMyDepartmentEmployees);

// @route   GET /api/departments/mine/recruitment
// @desc    Recruitment progress for the caller's own requisitions
// @access  Private (Department Head)
router.get('/mine/recruitment', protect, withEmployerScope, withDepartmentHeadScope, getMyDepartmentRecruitment);

module.exports = router;

import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { useTheme } from './context/ThemeContext';

import ProtectedRoute from './components/common/ProtectedRoute';
import Navbar from './components/common/Navbar';
import Footer from './components/common/Footer';
import Home from './components/Home';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import ForgotPassword from './components/auth/ForgotPassword';
import ActivateEmployee from './components/auth/ActivateEmployee';
import ResetPassword from './components/auth/ResetPassword';
import JobSearch from './components/candidate/JobSearch';
import Dashboard from './components/candidate/Dashboard';
import ApplyJob from './components/candidate/ApplyJob';
import Profile from './components/candidate/Profile';
import Complaints from './components/candidate/Complaints';

import WorkspaceLayout from './components/workspace/WorkspaceLayout';

// Recruitment (HR Expert / HR Manager)
import HRExpertDashboard from './components/hr-expert/HRExpertDashboard';
import VacancyList from './components/hr-expert/VacancyList';
import ApplicationsHub from './components/hr-expert/ApplicationsHub';
import AIMatching from './components/hr-expert/AIMatching';
import PostJob from './components/hr-expert/PostJob';
import EditJob from './components/hr-expert/EditJob';
import Applications from './components/hr-expert/Applications';
import CandidateList from './components/hr-expert/CandidateList';
import HRManagerDashboard from './components/hr-manager/HRManagerDashboard';
import VacancyReview from './components/hr-manager/VacancyReview';
import ShortlistReview from './components/hr-manager/ShortlistReview';

// Shared HR modules
import EmployeeDirectory from './components/hr/EmployeeDirectory';
import LeaveManagement from './components/hr/LeaveManagement';
import RequestManagement from './components/hr/RequestManagement';
import TrainingManagement from './components/hr/TrainingManagement';
import ComplaintsManagement from './components/hr/ComplaintsManagement';
import DelegationManagement from './components/hr/DelegationManagement';
import ConfigurationManager from './components/hr/ConfigurationManager';
import JobRequisitions from './components/hr/JobRequisitions';
import RequisitionForm from './components/hr/RequisitionForm';
import RequisitionReview from './components/hr/RequisitionReview';
import RecruitmentReport from './components/hr/RecruitmentReport';

// Employee self-service
import EmployeeDashboard from './components/employee/EmployeeDashboard';
import EmployeeOnboarding from './components/employee/EmployeeOnboarding';
import OnboardingQueue from './components/hr/OnboardingQueue';

// Department Head - an employee who additionally heads a department. Reuses the
// existing Job Requisition, Employee and Configuration modules; these screens
// are read-only department views on top of them.
import DepartmentDashboard from './components/department/DepartmentDashboard';
import MyDepartment from './components/department/MyDepartment';
import DepartmentEmployees from './components/department/DepartmentEmployees';
import RecruitmentStatus from './components/department/RecruitmentStatus';

// Employer / platform
import EmployerDashboard from './components/employer/EmployerDashboard';
import EmployerTeam from './components/employer/EmployerTeam';
import EmployerProfilePage from './components/employer/EmployerProfilePage';
import EmployerVerification from './components/employer/EmployerVerification';
import AdminDashboard from './components/admin/AdminDashboard';
import AdminUserList from './components/admin/AdminUserList';
import AdminEmployers from './components/admin/AdminEmployers';
import ComplaintManager from './components/admin/ComplaintManager';

import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';
import About from './components/About';
import Contact from './components/Contact';
import NotFound from './components/common/NotFound';
import AIChat from './components/common/AIChat';

import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-toastify/dist/ReactToastify.css';
import './index.css';

/** Authenticated role workspaces render their own shell (sidebar + header). */
const WORKSPACE_PREFIXES = ['/admin', '/hr-expert', '/hr-manager', '/employer', '/employee'];

function AppContent() {
    const { theme } = useTheme();
    const location = useLocation();
    const isWorkspaceRoute = WORKSPACE_PREFIXES.some(prefix => location.pathname.startsWith(prefix));

    return (
        <div className={isWorkspaceRoute ? '' : 'd-flex flex-column min-vh-100'}>
            {!isWorkspaceRoute && <Navbar />}

            <main className={isWorkspaceRoute ? '' : 'flex-grow-1'}>
                <Routes>

                    {/* ============================================
                        PUBLIC
                       ============================================ */}
                    <Route path="/" element={<Home />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    {/* Reached from the "Forgot Password?" link on the login page -
                        this route previously did not exist even though the backend
                        endpoint it calls (POST /auth/forgotpassword) already did. */}
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    {/* Reached from the activation link a hired candidate receives.
                        Public because they are not yet an employee - the link is
                        what grants that. */}
                    <Route path="/activate-employee/:token" element={<ActivateEmployee />} />
                    {/* Reached from a "forgot password" request, or from the
                        "set up your account" email an Employer can send when
                        creating an account or assigning a role. Public for the
                        same reason as activate-employee above: the link itself
                        is what proves the request. */}
                    <Route path="/reset-password/:token" element={<ResetPassword />} />
                    <Route path="/jobs" element={<JobSearch />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contact" element={<Contact />} />

                    {/* ============================================
                        CANDIDATE - participates in recruitment

                        The job-seeking pages also admit employees. Being hired
                        does not end a person's job search, and someone hired by
                        one organization may still have an application open with
                        another that they need to follow or withdraw.
                       ============================================ */}
                    <Route path="/candidate/dashboard" element={
                        <ProtectedRoute allowedRoles={['candidate', 'employee']}><Dashboard /></ProtectedRoute>
                    } />
                    <Route path="/candidate/profile" element={
                        <ProtectedRoute allowedRoles={['candidate', 'employee']}><Profile /></ProtectedRoute>
                    } />
                    <Route path="/candidate/apply/:jobId" element={
                        <ProtectedRoute allowedRoles={['candidate', 'employee']}><ApplyJob /></ProtectedRoute>
                    } />
                    <Route path="/candidate/complaints" element={
                        <ProtectedRoute allowedRoles={['candidate']}><Complaints /></ProtectedRoute>
                    } />

                    {/* ============================================
                        HR EXPERT - records / processes / submits
                       ============================================ */}
                    <Route path="/hr-expert" element={
                        <ProtectedRoute allowedRoles={['hr_expert']}><WorkspaceLayout /></ProtectedRoute>
                    }>
                        <Route index element={<Navigate to="/hr-expert/dashboard" replace />} />
                        <Route path="dashboard" element={<HRExpertDashboard />} />
                        <Route path="job-creator" element={<PostJob />} />
                        <Route path="vacancies" element={<VacancyList />} />
                        <Route path="vacancies/:id/edit" element={<EditJob />} />
                        <Route path="requisitions" element={<JobRequisitions />} />
                        <Route path="requisitions/new" element={<RequisitionForm />} />
                        <Route path="requisitions/:id" element={<RequisitionReview />} />
                        <Route path="requisitions/:id/edit" element={<RequisitionForm />} />
                        <Route path="applications" element={<ApplicationsHub />} />
                        <Route path="applications/:jobId" element={<Applications />} />
                        <Route path="candidates" element={<CandidateList />} />
                        <Route path="ai-matching" element={<AIMatching />} />
                        <Route path="ai-matching/:jobId" element={<AIMatching />} />
                        <Route path="reports" element={<RecruitmentReport />} />
                        <Route path="reports/:jobId" element={<RecruitmentReport />} />
                        <Route path="employees" element={<EmployeeDirectory />} />
                        <Route path="onboarding" element={<OnboardingQueue />} />
                        <Route path="leave" element={<LeaveManagement />} />
                        <Route path="requests" element={<RequestManagement />} />
                        <Route path="training" element={<TrainingManagement />} />
                        <Route path="complaints" element={<ComplaintsManagement />} />
                        <Route path="delegation" element={<DelegationManagement />} />
                        <Route path="my-hr" element={<EmployeeDashboard />} />
                    </Route>

                    {/* ============================================
                        HR MANAGER - views / reviews / approves
                       ============================================ */}
                    <Route path="/hr-manager" element={
                        <ProtectedRoute allowedRoles={['hr_manager']}><WorkspaceLayout /></ProtectedRoute>
                    }>
                        <Route index element={<Navigate to="/hr-manager/dashboard" replace />} />
                        <Route path="dashboard" element={<HRManagerDashboard />} />
                        <Route path="vacancy-approvals" element={<HRManagerDashboard />} />
                        <Route path="vacancy-approvals/:id" element={<VacancyReview />} />
                        <Route path="shortlists" element={<ShortlistReview />} />
                        <Route path="vacancies" element={<VacancyList />} />
                        <Route path="requisitions" element={<JobRequisitions />} />
                        <Route path="requisitions/:id" element={<RequisitionReview />} />
                        <Route path="applications" element={<ApplicationsHub />} />
                        <Route path="applications/:jobId" element={<Applications />} />
                        <Route path="candidates" element={<CandidateList />} />
                        <Route path="employees" element={<EmployeeDirectory />} />
                        <Route path="onboarding" element={<OnboardingQueue />} />
                        <Route path="leave" element={<LeaveManagement />} />
                        <Route path="requests" element={<RequestManagement />} />
                        <Route path="training" element={<TrainingManagement />} />
                        <Route path="complaints" element={<ComplaintsManagement />} />
                        <Route path="delegation" element={<DelegationManagement />} />
                        <Route path="reports" element={<RecruitmentReport />} />
                        <Route path="reports/:jobId" element={<RecruitmentReport />} />
                        <Route path="my-hr" element={<EmployeeDashboard />} />
                    </Route>

                    {/* ============================================
                        EMPLOYER - owns the organization's HR environment
                       ============================================ */}
                    <Route path="/employer" element={
                        <ProtectedRoute allowedRoles={['employer']}><WorkspaceLayout /></ProtectedRoute>
                    }>
                        <Route index element={<Navigate to="/employer/dashboard" replace />} />
                        <Route path="dashboard" element={<EmployerDashboard />} />
                        <Route path="verification" element={<EmployerVerification />} />
                        <Route path="profile" element={<EmployerProfilePage />} />
                        <Route path="team" element={<EmployerTeam />} />
                        <Route path="configuration" element={<ConfigurationManager />} />
                        <Route path="employees" element={<EmployeeDirectory />} />
                        <Route path="leave" element={<LeaveManagement />} />
                        <Route path="requests" element={<RequestManagement />} />
                        <Route path="training" element={<TrainingManagement />} />
                        <Route path="complaints" element={<ComplaintsManagement />} />
                        <Route path="delegation" element={<DelegationManagement />} />
                        <Route path="vacancies" element={<VacancyList />} />
                        <Route path="requisitions" element={<JobRequisitions />} />
                        <Route path="requisitions/new" element={<RequisitionForm />} />
                        <Route path="requisitions/:id" element={<RequisitionReview />} />
                        <Route path="requisitions/:id/edit" element={<RequisitionForm />} />
                        <Route path="applications" element={<ApplicationsHub />} />
                    </Route>

                    {/* ============================================
                        EMPLOYEE - self-service HR
                       ============================================ */}
                    <Route path="/employee" element={
                        <ProtectedRoute allowedRoles={['employee']}><WorkspaceLayout /></ProtectedRoute>
                    }>
                        <Route index element={<Navigate to="/employee/dashboard" replace />} />
                        <Route path="dashboard" element={<EmployeeDashboard />} />
                        <Route path="onboarding" element={<EmployeeOnboarding />} />
                        <Route path="profile" element={<Profile />} />
                        <Route path="complaints" element={<Complaints />} />
                        <Route path="delegation" element={<DelegationManagement />} />
                        {/* Job Requisitions: reachable by any employee account, but only
                            an employee assigned as a Department's Head can actually raise
                            one - see requisitionController.createRequisition. */}
                        <Route path="requisitions" element={<JobRequisitions />} />
                        <Route path="requisitions/new" element={<RequisitionForm />} />
                        <Route path="requisitions/:id" element={<RequisitionReview />} />
                        <Route path="requisitions/:id/edit" element={<RequisitionForm />} />

                        {/* Department Head views. Guarded server-side by
                            withDepartmentHeadScope, which refuses anyone who heads no
                            department, so these routes reveal nothing on their own. */}
                        <Route path="department" element={<DepartmentDashboard />} />
                        <Route path="department/profile" element={<MyDepartment />} />
                        <Route path="department/employees" element={<DepartmentEmployees />} />
                        <Route path="recruitment" element={<RecruitmentStatus />} />
                    </Route>

                    {/* ============================================
                        SYSTEM ADMINISTRATOR - platform only
                       ============================================ */}
                    <Route path="/admin" element={
                        <ProtectedRoute allowedRoles={['admin']}><WorkspaceLayout /></ProtectedRoute>
                    }>
                        <Route index element={<Navigate to="/admin/dashboard" replace />} />
                        <Route path="dashboard" element={<AdminDashboard />} />
                        <Route path="employers" element={<AdminEmployers />} />
                        <Route path="users/:roleSlug" element={<AdminUserList />} />
                        <Route path="config" element={<ConfigurationManager />} />
                        <Route path="complaints" element={<ComplaintManager />} />
                    </Route>

                    {/* DEFAULT / 404 */}
                    <Route path="*" element={<NotFound />} />

                </Routes>
            </main>
            {!isWorkspaceRoute && <Footer />}

            <ToastContainer
                position="top-right"
                autoClose={3000}
                hideProgressBar={false}
                newestOnTop
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme={theme === 'dark' ? 'dark' : 'light'}
            />
            {!isWorkspaceRoute && <AIChat />}
        </div>
    );
}

function App() {
    return (
        <AuthProvider>
            <LanguageProvider>
                <Router>
                    <AppContent />
                </Router>
            </LanguageProvider>
        </AuthProvider>
    );
}

export default App;

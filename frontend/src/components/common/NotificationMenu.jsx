import React, { useState, useEffect } from 'react';
import { Dropdown, Badge, Spinner } from 'react-bootstrap';
import {
    FaBell, FaCheckCircle, FaTimesCircle, FaBriefcase, FaEnvelope, FaInfoCircle,
    FaUserClock, FaGraduationCap, FaBuilding, FaUserCog, FaClipboardList
} from 'react-icons/fa';
import { Link } from 'react-router-dom';
import api from '../../services/api';

const NotificationMenu = () => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        fetchNotifications();
        // Poll every 30 seconds so the badge follows new notifications closely.
        const interval = setInterval(fetchNotifications, 30000);
        // Refresh immediately when the user returns to the tab - otherwise the
        // badge showed a stale count until the next poll tick.
        const onFocus = () => fetchNotifications();
        window.addEventListener('focus', onFocus);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', onFocus);
        };
    }, []);

    const fetchNotifications = async () => {
        try {
            const response = await api.get('/notifications');
            if (response.data.success) {
                setNotifications(response.data.notifications);
                setUnreadCount(response.data.unreadCount);
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    };

    const handleToggle = (nextOpen) => {
        setIsOpen(nextOpen);
        // Always refetch on open: only fetching when the list was empty left
        // both the list and the unread badge stale until the next poll.
        // Deliberately NO bulk mark-as-read here: only a notification the
        // user actually views (row click or "View details") is marked read,
        // so the badge always reflects what is genuinely still unread.
        if (nextOpen) {
            setLoading(notifications.length === 0);
            fetchNotifications().finally(() => setLoading(false));
        }
    };

    const markAsRead = async (id) => {
        try {
            await api.put(`/notifications/${id}/read`);
            setNotifications(notifications.map(n => 
                n._id === id ? { ...n, read: true } : n
            ));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            await api.put('/notifications/read-all');
            setNotifications(notifications.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Error marking all as read:', error);
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'application_update': return <FaBriefcase className="text-primary" />;
            case 'new_application': return <FaBriefcase className="text-primary" />;
            case 'interview_scheduled': return <FaEnvelope className="text-info" />;
            case 'job_approved': return <FaCheckCircle className="text-success" />;
            case 'job_rejected': return <FaTimesCircle className="text-danger" />;
            case 'vacancy_pending_approval': return <FaBriefcase className="text-warning" />;
            case 'hiring_decision': return <FaCheckCircle className="text-success" />;
            case 'requisition_submitted': case 'requisition_pending_approval': return <FaClipboardList className="text-warning" />;
            case 'requisition_returned': return <FaClipboardList className="text-danger" />;
            case 'requisition_approved': case 'requisition_job_created': return <FaClipboardList className="text-success" />;
            case 'requisition_rejected': return <FaClipboardList className="text-danger" />;
            case 'leave_request': case 'leave_decision': return <FaUserClock className="text-warning" />;
            case 'leave_returned': return <FaUserClock className="text-danger" />;
            case 'vacancy_filled': return <FaBriefcase className="text-success" />;
            case 'request_submitted': case 'request_decision': return <FaUserCog className="text-info" />;
            case 'training_assigned': case 'training_decision': return <FaGraduationCap className="text-primary" />;
            case 'training_returned': return <FaGraduationCap className="text-danger" />;
            case 'employer_registered': return <FaBuilding className="text-warning" />;
            default: return <FaInfoCircle className="text-secondary" />;
        }
    };

    return (
        <Dropdown show={isOpen} onToggle={handleToggle} align="end" className="ms-2">
            <Dropdown.Toggle 
                variant="light" 
                className="d-flex align-items-center justify-content-center p-2 rounded-circle border-0 bg-transparent"
                style={{ position: 'relative' }}
            >
                <FaBell size={18} color="var(--text-primary)" />
                {unreadCount > 0 && (
                    <Badge 
                        bg="danger" 
                        pill 
                        style={{ 
                            position: 'absolute', 
                            top: 0, 
                            right: 0, 
                            fontSize: '0.65rem',
                            transform: 'translate(25%, -25%)'
                        }}
                    >
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </Badge>
                )}
            </Dropdown.Toggle>

            <Dropdown.Menu 
                style={{ 
                    width: '320px', 
                    maxHeight: '400px', 
                    overflowY: 'auto',
                    border: '1px solid var(--border-color)',
                    boxShadow: 'var(--shadow-lg)',
                    borderRadius: '12px',
                    padding: 0
                }}
            >
                <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
                    <h6 className="mb-0 fw-bold">Notifications</h6>
                    {unreadCount > 0 && (
                        <button 
                            className="btn btn-link p-0 text-decoration-none small text-primary"
                            onClick={markAllAsRead}
                            style={{ fontSize: '0.8rem' }}
                        >
                            Mark all read
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="text-center p-4">
                        <Spinner animation="border" size="sm" variant="primary" />
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="text-center p-4 text-muted">
                        <FaBell size={24} className="mb-2 opacity-50" />
                        <p className="small mb-0">No notifications yet.</p>
                    </div>
                ) : (
                    <div className="notification-list">
                        {notifications.map(notif => (
                            <div 
                                key={notif._id} 
                                className={`p-3 border-bottom d-flex align-items-start ${notif.read ? 'bg-white' : 'bg-light'}`}
                                onClick={() => !notif.read && markAsRead(notif._id)}
                                style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                            >
                                <div className="mt-1 me-3">
                                    {getIcon(notif.type)}
                                </div>
                                <div className="flex-grow-1">
                                    <div className="d-flex justify-content-between align-items-start mb-1">
                                        <div className={`small ${notif.read ? 'text-dark' : 'fw-bold text-dark'}`}>
                                            {notif.title}
                                        </div>
                                        {!notif.read && (
                                            <span className="bg-primary rounded-circle" style={{ width: '8px', height: '8px', marginTop: '6px' }}></span>
                                        )}
                                    </div>
                                    <div className="small text-muted mb-1" style={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
                                        {notif.message}
                                    </div>
                                    <div className="d-flex justify-content-between align-items-center">
                                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                                            {new Date(notif.createdAt).toLocaleDateString()}
                                        </div>
                                        {notif.link && (
                                            <Link 
                                                to={notif.link} 
                                                className="small text-decoration-none"
                                                style={{ fontSize: '0.75rem' }}
                                                onClick={(e) => {
                                                    // Following the notification counts as reading it -
                                                    // stopPropagation used to skip the row's markAsRead,
                                                    // leaving the item highlighted as new forever.
                                                    e.stopPropagation();
                                                    if (!notif.read) markAsRead(notif._id);
                                                    setIsOpen(false);
                                                }}
                                            >
                                                View details
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Dropdown.Menu>
        </Dropdown>
    );
};

export default NotificationMenu;

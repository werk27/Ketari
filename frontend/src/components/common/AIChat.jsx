import React, { useState, useRef, useEffect } from 'react';
import { Button, Card, Form, Spinner, Badge, Image, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { 
    FaRobot, FaTimes, FaPaperPlane, FaUser, FaComment, 
    FaLightbulb, FaBriefcase, FaGraduationCap, FaTrash,
    FaRedo, FaSmile, FaFileAlt, FaQuestionCircle, FaStar
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api';

const AIChat = () => {
    const { user } = useAuth();
    const { language, t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [conversationCount, setConversationCount] = useState(0);
    const [isMinimized, setIsMinimized] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [contextData, setContextData] = useState({});
    const messagesEndRef = useRef(null);
    const chatContainerRef = useRef(null);

    const userType = user?.role || 'candidate';
    const userId = user?.id || 'guest';
    const isAuthenticated = !!user;

    useEffect(() => {
        const userName = user?.name || 'there';
        const welcomeMessage = userType === 'hr_expert' 
            ? `Hello ${userName}! 👋 I'm your KETARI Employer Assistant. I can help you with:\n📋 Job postings\n🔍 Candidate screening\n🗣️ Interview questions\n💼 Hiring strategies\n\nWhat would you like to know?`
            : `Hello ${userName}! 👋 I'm your KETARI Career Assistant. I can help you with:\n🔍 Job searching\n📝 Resume writing\n🎯 Interview preparation\n💡 Career advice\n\nWhat would you like to know?`;
        
        setMessages([
            { 
                role: 'assistant', 
                content: welcomeMessage,
                timestamp: new Date()
            }
        ]);
        
        setSuggestions([
            userType === 'hr_expert' 
                ? (language === 'am' ? 'የስራ መግለጫ እንዴት እመጻፍ?' : 'How to write a job description?')
                : (language === 'am' ? 'ትክክለኛ ስራ እንዴት እፈልጋ?' : 'How do I find the right job?'),
            userType === 'hr_expert'
                ? (language === 'am' ? 'ምርጥ የቃለ መጠይቅ ጥያቄዎች' : 'Best interview questions to ask')
                : (language === 'am' ? 'የረጅም ጊዜ መግለጫዎን ይርዱኝ' : 'Help me improve my resume'),
            userType === 'hr_expert'
                ? (language === 'am' ? 'እጩዎችን እንዴት እመረጋገጫለሁ?' : 'How to screen candidates effectively?')
                : (language === 'am' ? 'ምን ክህሎች መማ� RSVP ይጠበቅ?' : 'What skills should I learn?'),
            userType === 'hr_expert'
                ? 'Hiring best practices'
                : 'How to prepare for interviews?'
        ]);
    }, [user, userType, language]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const userMessage = {
            role: 'user',
            content: input,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            // Prepare context data to send to AI
            const contextToSend = {
                user: {
                    name: user?.name,
                    email: user?.email,
                    role: userType,
                    id: userId
                },
                attendance: contextData.attendance,
                leaves: contextData.leaves,
                complaints: contextData.complaints,
                conversationCount,
                language: language // Send current language to AI
            };

            const response = await fetch('http://localhost:5002/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: input,
                    context: contextToSend
                })
            });

            const data = await response.json();
            
            if (data.success) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.response,
                    timestamp: new Date()
                }]);
                setConversationCount(data.conversation_count || 0);
                setSuggestions(data.suggestions || []);
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: language === 'am' ? "ታዲያ! ከአይ አገልግሎት ጋር መገናኘት ስህተት ተፈጥሯል። እባክዎ እንደገና ይሞክሩ።" : "I'm having trouble connecting. Please try again or refresh the page.",
                    timestamp: new Date(),
                    error: true
                }]);
            }
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: language === 'am' ? "ታዲያ! ኔትወርክ ስህተት ተፈጥሯል። ኔትወርክዎን ይመረጝ እና እንደገና ይሞክሩ።" : "Network error. Please check your connection and try again.",
                timestamp: new Date(),
                error: true
            }]);
        } finally {
            setLoading(false);
        }
    };

    const resetChat = async () => {
        try {
            await fetch('http://localhost:5002/api/chat/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
            
            const welcomeMessage = userType === 'hr_expert' 
                ? "Chat reset! 👋 I'm ready to help with your recruitment needs. What would you like to discuss?"
                : "Chat reset! 👋 I'm ready to help with your career journey. What would you like to know?";
            
            setMessages([{
                role: 'assistant',
                content: welcomeMessage,
                timestamp: new Date()
            }]);
            setConversationCount(0);
            setSuggestions([
                userType === 'hr_expert' 
                    ? 'How to write a job description?' 
                    : 'How do I find the right job?',
                userType === 'hr_expert'
                    ? 'Best interview questions'
                    : 'Help me improve my resume',
                userType === 'hr_expert'
                    ? 'Candidate screening tips'
                    : 'What skills should I learn?',
                userType === 'hr_expert'
                    ? 'Hiring best practices'
                    : 'How to prepare for interviews?'
            ]);
        } catch (error) {
            console.error('Reset error:', error);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getRoleIcon = () => {
        if (userType === 'hr_expert') {
            return <FaBriefcase size={18} />;
        }
        return <FaGraduationCap size={18} />;
    };

    const getChatTitle = () => {
        if (userType === 'hr_expert') {
            return 'AI Employer Assistant';
        }
        return 'AI Career Assistant';
    };

    const getQuickActions = () => {
        if (userType === 'hr_expert') {
            return [
                { icon: <FaFileAlt />, label: 'Job Post', action: 'How do I write a job description?' },
                { icon: <FaUser />, label: 'Screening', action: 'How to screen candidates?' },
                { icon: <FaQuestionCircle />, label: 'Interview', action: 'Best interview questions to ask' },
                { icon: <FaStar />, label: 'Hiring', action: 'Hiring best practices' }
            ];
        }
        return [
            { icon: <FaFileAlt />, label: 'Resume', action: 'Help me improve my resume' },
            { icon: <FaBriefcase />, label: 'Jobs', action: 'How do I find the right job?' },
            { icon: <FaQuestionCircle />, label: 'Interview', action: 'How to prepare for interviews?' },
            { icon: <FaStar />, label: 'Career', action: 'Career advice for me' }
        ];
    };

    if (!isOpen) {
        return (
            <Button
                variant="primary"
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed',
                    bottom: '30px',
                    right: '30px',
                    borderRadius: '50%',
                    width: '65px',
                    height: '65px',
                    fontSize: '1.8rem',
                    zIndex: 999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 25px rgba(0, 200, 83, 0.18)',
                    background: 'var(--gradient)',
                    border: 'none',
                    transition: 'all 0.3s ease'
                }}
                className="chat-toggle-btn"
            >
                <FaRobot />
                <span style={{
                    position: 'absolute',
                    top: '-5px',
                    right: '-5px',
                    background: 'var(--primary-color)',
                    borderRadius: '50%',
                    width: '18px',
                    height: '18px',
                    fontSize: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid white'
                }}>
                    AI
                </span>
            </Button>
        );
    }

    return (
        <>
            <Card
                ref={chatContainerRef}
                style={{
                    position: 'fixed',
                    bottom: '30px',
                    right: '30px',
                    width: '420px',
                    maxWidth: '92vw',
                    height: isMinimized ? '60px' : '580px',
                    maxHeight: '85vh',
                    zIndex: 998,
                    boxShadow: '0 15px 50px rgba(0,0,0,0.2)',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'height 0.3s ease'
                }}
            >
                {/* Header */}
                <Card.Header
                    style={{
                        background: 'var(--gradient)',
                        color: 'white',
                        padding: '12px 16px',
                        borderBottom: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        flexShrink: 0
                    }}
                    onClick={() => setIsMinimized(!isMinimized)}
                >
                    <div className="d-flex align-items-center gap-2">
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <FaRobot size={18} />
                        </div>
                        <div>
                            <div className="fw-bold" style={{ fontSize: '0.9rem' }}>
                                {getChatTitle()}
                            </div>
                            <div className="d-flex align-items-center gap-2" style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                                {getRoleIcon()} {user?.name || 'Guest'}
                                <Badge bg="success" className="p-1" style={{ fontSize: '0.5rem' }}>
                                    <span className="badge-dot" style={{
                                        display: 'inline-block',
                                        width: '6px',
                                        height: '6px',
                                        borderRadius: '50%',
                                        backgroundColor: 'var(--primary-color)',
                                        marginRight: '4px',
                                        animation: 'pulse 1.5s infinite'
                                    }}></span>
                                    Online
                                </Badge>
                            </div>
                        </div>
                    </div>
                    <div className="d-flex gap-1">
                        <OverlayTrigger placement="bottom" overlay={<Tooltip>Reset Chat</Tooltip>}>
                            <Button variant="link" size="sm" onClick={(e) => { e.stopPropagation(); resetChat(); }} style={{ color: 'white', padding: '4px' }}>
                                <FaRedo size={14} />
                            </Button>
                        </OverlayTrigger>
                        <OverlayTrigger placement="bottom" overlay={<Tooltip>{isMinimized ? 'Expand' : 'Minimize'}</Tooltip>}>
                            <Button variant="link" size="sm" onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }} style={{ color: 'white', padding: '4px' }}>
                                {isMinimized ? '□' : '−'}
                            </Button>
                        </OverlayTrigger>
                        <Button variant="link" size="sm" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} style={{ color: 'white', padding: '4px' }}>
                            <FaTimes size={16} />
                        </Button>
                    </div>
                </Card.Header>

                {!isMinimized && (
                    <>
                        {/* Messages */}
                        <div
                            style={{
                                flex: 1,
                                overflowY: 'auto',
                                padding: '16px',
                                background: 'var(--container-bg)'
                            }}
                        >
                            {messages.map((msg, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        display: 'flex',
                                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                        marginBottom: '12px',
                                        animation: 'fadeIn 0.3s ease'
                                    }}
                                >
                                    <div
                                        style={{
                                            maxWidth: '85%',
                                            padding: '10px 14px',
                                            borderRadius: msg.role === 'user' 
                                                ? '18px 18px 4px 18px' 
                                                : '18px 18px 18px 4px',
                                            background: msg.role === 'user' 
                                                ? 'var(--gradient)' 
                                                : msg.error ? '#fce4ec' : 'var(--container-bg)',
                                            color: msg.role === 'user' ? 'white' : 'var(--text-secondary)',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                                            border: msg.role === 'assistant' ? '1px solid #e0e0e0' : 'none'
                                        }}
                                    >
                                        <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                                            {msg.content}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: '0.6rem',
                                                marginTop: '6px',
                                                opacity: 0.5,
                                                textAlign: msg.role === 'user' ? 'right' : 'left'
                                            }}
                                        >
                                            {formatTime(msg.timestamp)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
                                    <div
                                        style={{
                                            padding: '10px 16px',
                                            borderRadius: '18px 18px 18px 4px',
                                            background: 'var(--container-bg)',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                                            border: '1px solid #e0e0e0',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        <Spinner animation="border" size="sm" variant="primary" />
                                        <span className="text-muted" style={{ fontSize: '0.85rem' }}>Thinking...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Quick Actions */}
                        <div style={{ padding: '8px 12px', background: 'var(--container-bg)', borderTop: '1px solid rgba(0,0,0,0.06)', flexShrink: 0 }}>
                            <div className="d-flex flex-wrap gap-1">
                                {getQuickActions().map((action, idx) => (
                                    <Button
                                        key={idx}
                                        variant="outline-secondary"
                                        size="sm"
                                        onClick={() => sendMessage(action.action)}
                                        style={{
                                            fontSize: '0.7rem',
                                            borderRadius: '20px',
                                            padding: '4px 12px',
                                            borderColor: 'rgba(0,0,0,0.08)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        {action.icon}
                                        {action.label}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Suggested Questions */}
                        {suggestions.length > 0 && messages.length < 5 && (
                            <div style={{ padding: '8px 12px', background: 'var(--container-bg)', borderTop: '1px solid rgba(0,0,0,0.06)', flexShrink: 0 }}>
                                <small className="text-muted d-flex align-items-center gap-1">
                                    <FaLightbulb size={12} className="text-warning" />
                                    Suggested questions:
                                </small>
                                <div className="d-flex flex-wrap gap-1 mt-1">
                                    {suggestions.map((suggestion, idx) => (
                                        <Button
                                            key={idx}
                                            variant="outline-primary"
                                            size="sm"
                                            onClick={() => sendMessage(suggestion)}
                                            style={{
                                                fontSize: '0.7rem',
                                                borderRadius: '20px',
                                                padding: '2px 10px',
                                                borderColor: 'rgba(255,107,53,0.25)'
                                            }}
                                        >
                                            {suggestion}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Input */}
                        <Card.Footer
                            style={{
                                background: 'var(--container-bg)',
                                padding: '8px 12px',
                                borderTop: '1px solid rgba(0,0,0,0.06)',
                                flexShrink: 0
                            }}
                        >
                            <Form.Group className="d-flex gap-2">
                                <Form.Control
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    placeholder="Ask me anything..."
                                    style={{
                                        borderRadius: '24px',
                                        border: '1px solid #ddd',
                                        fontSize: '0.9rem',
                                        padding: '8px 16px'
                                    }}
                                    disabled={loading}
                                />
                                <Button
                                    variant="primary"
                                    onClick={() => sendMessage(input)}
                                    disabled={!input.trim() || loading}
                                    style={{
                                        borderRadius: '50%',
                                        width: '40px',
                                        height: '40px',
                                        padding: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: 'var(--gradient)',
                                        border: 'none'
                                    }}
                                >
                                    <FaPaperPlane size={14} />
                                </Button>
                            </Form.Group>
                            <div style={{ fontSize: '0.6rem', textAlign: 'center', color: 'var(--muted)', marginTop: '4px' }}>
                                {conversationCount > 0 && `${conversationCount} messages · `}
                                Powered by KETARI
                            </div>
                        </Card.Footer>
                    </>
                )}
            </Card>

            <style>
                {`
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.3; }
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .chat-toggle-btn:hover {
                        transform: scale(1.05);
                        box-shadow: 0 6px 30px rgba(255,107,53,0.38);
                    }
                    .badge-dot {
                        animation: pulse 1.5s infinite;
                    }
                `}
            </style>
        </>
    );
};

export default AIChat;

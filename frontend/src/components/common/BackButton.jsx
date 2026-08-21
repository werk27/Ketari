import React from 'react';
import { Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';

const BackButton = ({ to, onClick, variant = 'outline-secondary', className = '', children }) => {
    const navigate = useNavigate();

    const handleClick = () => {
        if (onClick) {
            onClick();
        } else if (to) {
            navigate(to);
        } else {
            navigate(-1);
        }
    };

    return (
        <Button
            variant={variant}
            onClick={handleClick}
            className={`back-button ${className}`}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '20px'
            }}
        >
            <FaArrowLeft />
            {children || 'Back'}
        </Button>
    );
};

export default BackButton;

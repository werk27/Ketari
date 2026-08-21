import React, { useState } from 'react';
import { Form } from 'react-bootstrap';
import { FaLock, FaEye, FaEyeSlash } from 'react-icons/fa';

/**
 * Password field with a show/hide toggle.
 *
 * Matches the existing `input-group-custom` / `input-icon` styling used across
 * the auth forms, so it drops in without changing their look. The toggle is a
 * real button so it is keyboard reachable, and it is excluded from the tab
 * order by default so it never interrupts typing password -> submit.
 */
const PasswordInput = ({
    name,
    value,
    onChange,
    placeholder,
    required = false,
    minLength,
    autoComplete = 'current-password',
    disabled = false,
    showLabel = 'Show password',
    hideLabel = 'Hide password'
}) => {
    const [visible, setVisible] = useState(false);

    return (
        <div className="input-group-custom">
            <span className="input-icon">
                <FaLock />
            </span>
            <Form.Control
                type={visible ? 'text' : 'password'}
                name={name}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className="form-control-custom has-password-toggle"
                required={required}
                minLength={minLength}
                autoComplete={autoComplete}
                disabled={disabled}
            />
            <button
                type="button"
                className="password-toggle"
                onClick={() => setVisible(v => !v)}
                aria-label={visible ? hideLabel : showLabel}
                aria-pressed={visible}
                title={visible ? hideLabel : showLabel}
                tabIndex={-1}
                disabled={disabled}
            >
                {visible ? <FaEyeSlash /> : <FaEye />}
            </button>
        </div>
    );
};

export default PasswordInput;

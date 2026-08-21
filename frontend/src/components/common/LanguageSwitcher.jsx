import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

const LANGUAGES = [
    { code: 'en', short: 'EN', name: 'English' },
    { code: 'am', short: 'አማ', name: 'አማርኛ' }
];

/**
 * Language switcher.
 *
 * A compact segmented control rather than a dropdown: with only two languages a
 * menu costs two clicks and a lot of header space to do one thing. Both options
 * stay visible and switching is a single tap.
 */
const LanguageSwitcher = () => {
    const { language, setLanguage, loading } = useLanguage();

    return (
        <div
            role="group"
            aria-label="Select language"
            className="d-inline-flex align-items-center"
            style={{
                background: 'rgba(148, 163, 184, 0.16)',
                borderRadius: 999,
                padding: 3,
                gap: 2
            }}
        >
            {LANGUAGES.map(item => {
                const isActive = language === item.code;
                return (
                    <button
                        key={item.code}
                        type="button"
                        onClick={() => setLanguage(item.code)}
                        disabled={loading}
                        aria-pressed={isActive}
                        title={item.name}
                        style={{
                            border: 'none',
                            borderRadius: 999,
                            padding: '4px 12px',
                            fontSize: '0.78rem',
                            fontWeight: isActive ? 600 : 500,
                            lineHeight: 1.5,
                            cursor: loading ? 'wait' : 'pointer',
                            background: isActive ? '#FFFFFF' : 'transparent',
                            color: isActive ? '#4F46E5' : '#64748B',
                            boxShadow: isActive ? '0 1px 2px rgba(15, 23, 42, 0.12)' : 'none',
                            transition: 'background .15s, color .15s'
                        }}
                    >
                        {item.short}
                    </button>
                );
            })}
        </div>
    );
};

export default LanguageSwitcher;

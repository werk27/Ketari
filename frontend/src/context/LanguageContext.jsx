import React, { createContext, useState, useContext, useEffect } from 'react';
import { t, setLanguage, getLanguage, initLanguage, loadTranslations, languages } from '../i18n';

const LanguageContext = createContext();

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};

export const LanguageProvider = ({ children }) => {
    const [language, setLang] = useState('en');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const savedLang = initLanguage();
        setLang(savedLang);
        if (savedLang !== 'en') {
            loadTranslations(savedLang);
        }
        // Set HTML direction based on language
        updateDocumentDirection(savedLang);
    }, []);

    const updateDocumentDirection = (lang) => {
        // Amharic (am) is a left-to-right language. Only enable RTL for
        // languages that are truly right-to-left (Arabic, Hebrew, Persian, Urdu).
        const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
        const isRTL = rtlLanguages.includes(lang);
        document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
        document.documentElement.lang = lang;
        
        // Add language class to body for CSS targeting
        document.body.classList.remove('lang-en', 'lang-am');
        document.body.classList.add(`lang-${lang}`);
        
        console.log('Language updated:', lang, 'HTML lang:', document.documentElement.lang, 'Body classes:', document.body.className);
        
        // Also update body class for additional RTL styling if needed
        if (isRTL) {
            document.body.classList.add('rtl');
        } else {
            document.body.classList.remove('rtl');
        }
    };

    const changeLanguage = async (lang) => {
        if (lang === language) return;
        setLoading(true);
        try {
            if (lang !== 'en') {
                await loadTranslations(lang);
            }
            setLanguage(lang);
            setLang(lang);
            // Update HTML direction
            updateDocumentDirection(lang);
        } catch (error) {
            console.error('Failed to change language:', error);
        } finally {
            setLoading(false);
        }
    };

    const translate = (key, params = {}) => {
        return t(key, params);
    };

    const value = {
        language,
        setLanguage: changeLanguage,
        translate,
        loading,
        languages,
        t: translate
    };

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
};
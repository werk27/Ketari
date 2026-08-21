import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(() => {
        try {
            const stored = localStorage.getItem('theme');
            return stored || 'light';
        } catch (e) {
            return 'light';
        }
    });

    useEffect(() => {
        const root = document.body;
        root.classList.remove('theme-light', 'theme-dark');
        root.classList.add(`theme-${theme}`);
        try {
            localStorage.setItem('theme', theme);
        } catch (e) {
            // ignore
        }
    }, [theme]);

    const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext;

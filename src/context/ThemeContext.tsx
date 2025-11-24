import React, { createContext, useContext, ReactNode } from 'react';
import { useColorScheme } from 'react-native';

// Define the theme interface
export interface Theme {
  // Core colors
  background: string;
  text: string;
  subtext: string;
  border: string;

  // Component specific colors
  cardBackground: string;
  dropdownBg: string;
  selectedBg: string;
  selectedText: string;
  dropdownSelectedBg: string;
  iconColor: string;

  // Button colors
  buttonBackground: string;
  buttonText: string;
  deleteButton: string;

  // Modal colors
  modalBackground: string;
  modalOverlay: string;

  // Tab bar colors
  activeTint: string;
  inactiveTint: string;
  tabBarBackground: string;

  // Status colors
  pendingText: string;
  pendingBorder: string;

  // Shadow
  shadow: string;

  // Status bar
  statusBarStyle: 'light-content' | 'dark-content';
}

// Define light and dark themes - colors are exact opposites
const lightTheme: Theme = {
  background: '#FFFFFF', // white
  text: '#000000', // black
  subtext: '#64748B', // slate-500 (medium gray)
  border: '#E5E7EB', // light gray border
  cardBackground: '#F9FAFB', // very light gray
  dropdownBg: '#FFFFFF', // white background for dropdown
  selectedBg: '#000000', // black for selected
  selectedText: '#FFFFFF', // white text on selected
  dropdownSelectedBg: '#F3F4F6', // light gray for selected items
  iconColor: '#000000', // black icons
  buttonBackground: '#000000', // black button
  buttonText: '#FFFFFF', // white text on button
  deleteButton: '#EF2226', // red delete button
  modalBackground: '#FFFFFF', // white modal
  modalOverlay: '#00000033', // dark overlay with transparency
  activeTint: '#000000', // black active
  inactiveTint: '#9CA3AF', // gray inactive
  tabBarBackground: '#FFFFFF', // white tab bar
  pendingText: '#DC7609', // orange (status color, same in both)
  pendingBorder: '#DC7609', // orange border (status color, same in both)
  shadow: '#000000', // black shadow
  statusBarStyle: 'dark-content',
};

const darkTheme: Theme = {
  background: '#000000', // black (opposite of white)
  text: '#FFFFFF', // white (opposite of black)
  subtext: '#9CA3AF', // gray-400 (opposite tone of slate-500)
  border: '#404040', // dark gray (opposite of light gray)
  cardBackground: '#1A1A1A', // dark gray (opposite of light gray)
  dropdownBg: '#1A1A1A', // dark gray dropdown (opposite of white)
  selectedBg: '#FFFFFF', // white for selected (opposite of black)
  selectedText: '#000000', // black text on selected (opposite of white)
  dropdownSelectedBg: '#2D2D2D', // medium dark gray (opposite of light gray)
  iconColor: '#FFFFFF', // white icons (opposite of black)
  buttonBackground: '#FFFFFF', // white button (opposite of black)
  buttonText: '#000000', // black text on button (opposite of white)
  deleteButton: '#EF2226', // red delete button (same in both themes)
  modalBackground: '#1A1A1A', // dark modal (opposite of white)
  modalOverlay: '#FFFFFF33', // white overlay with transparency (opposite of dark)
  activeTint: '#FFFFFF', // white active (opposite of black)
  inactiveTint: '#808080', // medium gray (opposite tone)
  tabBarBackground: '#1A1A1A', // dark tab bar (opposite of white)
  pendingText: '#FFA500', // orange (status color, same in both)
  pendingBorder: '#FFA500', // orange border (status color, same in both)
  shadow: '#FFFFFF', // white shadow (opposite of black)
  statusBarStyle: 'light-content',
};

// Create the context
interface ThemeContextType {
  theme: Theme;
  isDarkMode: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Theme Provider component
interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';
  const theme = isDarkMode ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, isDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Custom hook to use theme
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;

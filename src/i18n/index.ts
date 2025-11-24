import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en.json';
import hi from './locales/hi.json';
import te from './locales/te.json';

// Define translations inline to avoid import issues
const resources = {
  en: { translation: en },
  hi: { translation: hi },
  te: { translation: te },
};

const LANGUAGE_DETECTOR = {
  type: 'languageDetector' as const,
  async: true,
  detect: async (callback: (lng: string) => void) => {
    try {
      // Get the saved language from AsyncStorage
      const savedLanguage = await AsyncStorage.getItem('user-language');
      if (savedLanguage) {
        callback(savedLanguage);
        return;
      }
      // If no saved language, use default
      callback('en');
    } catch (error) {
      console.log('Error reading language from AsyncStorage', error);
      callback('en');
    }
  },
  init: () => {},
  cacheUserLanguage: async (language: string) => {
    try {
      await AsyncStorage.setItem('user-language', language);
    } catch (error) {
      console.log('Error saving language to AsyncStorage', error);
    }
  },
};

i18n
  .use(LANGUAGE_DETECTOR)
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v4',
    fallbackLng: 'en',
    debug: false, // Disable debug to avoid console errors

    resources,

    interpolation: {
      escapeValue: false,
    },

    react: {
      useSuspense: false,
    },

    // Add these options to prevent navigation issues
    load: 'languageOnly',
    ns: ['translation'],
    defaultNS: 'translation',
  });
export default i18n;

import { GOOGLE_WEB_CLIENT_ID } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';
import '../../global.css';
import { NetworkProvider } from '../context/NetworkProvider';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import '../i18n';
import {
  clearAuthTokens,
  getAuthTokens,
  refreshAuthTokens,
} from '../services/auth/tokenStorage';
import Home from './navigation/BottomTabs';
import { RootStackParamList } from './navigation/RootStackedList';
import Login from './screens/Login';

enableScreens();

// Inner component that uses theme
function AppContent(): React.JSX.Element {
  const { theme } = useTheme();
  const Stack = createNativeStackNavigator<RootStackParamList>();
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState<'Login' | 'MainApp'>(
    'Login'
  );

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: true,
      hostedDomain: '',
      forceCodeForRefreshToken: true,
    });

    const checkAuthState = async () => {
      try {
        // ⭐ CRITICAL: Check if this is first launch after fresh install
        // This prevents stale data from previous uninstalls
        const hasLaunchedBefore = await AsyncStorage.getItem('hasLaunchedBefore');
        
        if (hasLaunchedBefore === null) {
          console.log('[App] First launch detected - clearing any stale data from previous install');
          
          // Clear ALL data (in case of reinstall with stale data)
          try {
            await AsyncStorage.clear();
            await clearAuthTokens();
            await GoogleSignin.signOut().catch(() => {});
          } catch (e) {
            console.log('[App] Error clearing stale data:', e);
          }
          
          // Mark that app has been launched
          await AsyncStorage.setItem('hasLaunchedBefore', 'true');
          console.log('[App] First launch cleanup complete');
          
          // Fresh install always shows login
          setInitialRoute('Login');
          setIsLoading(false);
          return;
        }

        const storedTokens = await getAuthTokens();

        if (storedTokens?.idToken) {
          // Check network connectivity
          const networkState = await NetInfo.fetch();
          const isOnline = networkState.isConnected;

          console.log('[App] Network status:', isOnline ? 'Online' : 'Offline');

          // If online, try to refresh tokens to ensure they're valid
          if (isOnline) {
            try {
              console.log('[App] Refreshing tokens on startup...');
              await refreshAuthTokens();
              console.log('[App] Tokens refreshed successfully');
              setInitialRoute('MainApp');
            } catch (tokenError) {
              console.error(
                '[App] Failed to refresh tokens on startup:',
                tokenError
              );
              // Check if it's a session expired error
              const errorMessage = (tokenError as Error)?.message || '';
              if (errorMessage.includes('SESSION_EXPIRED')) {
                console.log('[App] Session expired, require re-login');
                setInitialRoute('Login');
              } else {
                // Network or other error while online - still try to use cached tokens
                console.log('[App] Token refresh failed but allowing access with cached tokens');
                setInitialRoute('MainApp');
              }
            }
          } else {
            // Offline mode: Allow access with stored tokens
            console.log('[App] Offline mode: Using cached tokens to allow app access');
            setInitialRoute('MainApp');
          }
          return;
        }

        setInitialRoute('Login');
      } catch (error) {
        console.error('[App] Error checking auth state:', error);
        setInitialRoute('Login');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthState();
  }, []);

  if (isLoading) {
    return (
      <GestureHandlerRootView className="flex-1">
        <SafeAreaView
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: theme.background }}
        >
          <StatusBar
            barStyle={theme.statusBarStyle}
            backgroundColor={theme.background}
          />
          <ActivityIndicator size="large" color={theme.text} />
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: theme.background }}
      >
        <StatusBar
          barStyle={theme.statusBarStyle}
          backgroundColor={theme.background}
        />
        <NetworkProvider>
          <NavigationContainer>
            <Stack.Navigator
              initialRouteName={initialRoute}
              screenOptions={{ headerShown: false }}
            >
              <Stack.Screen name="Login" component={Login} />
              <Stack.Screen name="MainApp" component={Home} />
            </Stack.Navigator>
          </NavigationContainer>
        </NetworkProvider>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;

import { GOOGLE_WEB_CLIENT_ID } from '@env';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableScreens } from 'react-native-screens';
import '../../global.css';
import { NetworkProvider } from '../context/NetworkProvider';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import '../i18n';
import {
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
        const storedTokens = await getAuthTokens();
        const hasPreviousSignIn = await GoogleSignin.hasPreviousSignIn();

        if (storedTokens?.idToken || hasPreviousSignIn) {
          // Always try to refresh tokens on startup to ensure they're valid
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
            // If we have stored tokens, still allow access (they might work)
            // But if refresh fails and no stored tokens, go to login
            if (storedTokens?.idToken) {
              console.log('[App] Using stored tokens despite refresh failure');
              setInitialRoute('MainApp');
            } else {
              setInitialRoute('Login');
            }
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

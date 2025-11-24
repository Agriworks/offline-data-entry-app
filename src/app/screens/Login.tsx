import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootStackedList';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react-native';
import LanguageControl from '../components/LanguageControl';
import { useTheme } from '../../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  refreshAuthTokens,
  saveAuthTokens,
} from '../../services/auth/tokenStorage';

type LoginScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Login'
>;

type Props = {
  navigation: LoginScreenNavigationProp;
};

const Login: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const signInWithGoogle = async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const signInResponse = await GoogleSignin.signIn();

      if (signInResponse.type !== 'success' || !signInResponse.data) {
        console.log(
          'Google sign-in did not complete successfully.',
          signInResponse
        );
        return;
      }

      const { data } = signInResponse;

      console.log('User Info:', data);

      if (data.user) {
        await AsyncStorage.setItem('userInfo', JSON.stringify(data.user));
      }

      await saveAuthTokens({
        idToken: data.idToken,
        serverAuthCode: data.serverAuthCode,
      });

      try {
        await refreshAuthTokens();
      } catch (refreshError) {
        console.error('Failed to refresh tokens after sign-in:', refreshError);
      }

      navigation.navigate('MainApp');

      if (data.user?.name) {
        Alert.alert('Success', `Welcome ${data.user.name}!`);
      }
    } catch (error: any) {
      console.log('Google Sign-in Error:', error);

      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log('User cancelled the login flow');
        // Don't show alert for user cancellation
      } else if (error.code === statusCodes.IN_PROGRESS) {
        console.log('Sign in is in progress already');
        Alert.alert('Info', 'Sign in is already in progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        console.log('Play services not available or outdated');
        Alert.alert(
          'Error',
          'Google Play Services not available. Please update Google Play Services.'
        );
      } else if (error.code === 'DEVELOPER_ERROR') {
        console.log('Developer error - check configuration');
        Alert.alert(
          'Configuration Error',
          'Google Sign-in is not properly configured. Please check your Google Console settings.'
        );
      } else {
        console.log('Some other error happened:', error);
        Alert.alert(
          'Error',
          `Failed to sign in with Google: ${error.message || 'Unknown error'}`
        );
      }
    }
  };

  return (
    <View
      className="w-full flex-1 items-center justify-center"
      style={{ backgroundColor: theme.background }}
    >
      {/* Language Control - Top Right Corner */}
      <View className="absolute right-6 top-12">
        <LanguageControl />
      </View>

      <View className="w-[85%] items-center">
        <View className="mb-8 w-full items-start">
          <Text
            className="mb-0.5 text-xl font-bold"
            style={{ color: theme.text }}
          >
            {t('login.title')}
          </Text>
          <Text className="text-left text-sm" style={{ color: theme.subtext }}>
            {t('login.subtitle')}
          </Text>
        </View>
        <TouchableOpacity
          className="w-full items-center rounded-lg p-3"
          style={{ backgroundColor: theme.buttonBackground }}
          onPress={signInWithGoogle}
        >
          <View className="flex-row items-center gap-2">
            <Mail size={20} color={theme.buttonText} />
            <Text className="text-base" style={{ color: theme.buttonText }}>
              {t('login.signInWithGoogle')}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default Login;

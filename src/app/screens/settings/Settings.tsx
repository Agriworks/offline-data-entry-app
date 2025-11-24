import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import LanguageControl from '../../components/LanguageControl';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { getQueue } from '../../pendingQueue';
import { SubmissionItem } from '../../../types';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { BottomTabsList } from '../../navigation/BottomTabsList';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/RootStackedList';
import { useTheme } from '../../../context/ThemeContext';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAllDoctypesFromLocal } from '../../../api';
import { clearAuthTokens } from '../../../services/auth/tokenStorage';
import { usePendingFormsExport } from '../../../hooks/usePendingFormsExport';

type SettingsNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<BottomTabsList, 'Settings'>,
  NativeStackNavigationProp<RootStackParamList>
>;

function Settings() {
  const navigation = useNavigation<SettingsNavigationProp>();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [pendingFormsModalVisible, setPendingFormsModalVisible] =
    useState(false);
  const { exportPendingForms, isExporting } = usePendingFormsExport();

  const handleLogoutPress = async () => {
    const hasPendingForms = await checkForPendingForms();
    if (hasPendingForms) {
      setPendingFormsModalVisible(true);
    } else {
      setLogoutModalVisible(true);
    }
  };

  const checkForPendingForms = async (): Promise<boolean> => {
    try {
      const pendingSubmissions = (await getQueue()) as SubmissionItem[];

      if (Array.isArray(pendingSubmissions) && pendingSubmissions.length > 0) {
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error checking for pending forms:', error);
      return false;
    }
  };

  const handleLogoutConfirm = async () => {
    try {
      // Sign out from Google
      await GoogleSignin.signOut();

      // Clear secure tokens
      await clearAuthTokens();
      await clearAllDoctypesFromLocal();

      // Clear all user-related data from AsyncStorage
      await AsyncStorage.multiRemove([
        'userInfo',
        'downloadDoctypes', // Clear downloaded forms
        'pendingSubmissions', // Clear pending submissions
        'tempFormData', // Clear any temporary form data
      ]);

      console.log('User logged out successfully');
      setLogoutModalVisible(false);

      // Navigate to Login screen
      navigation.getParent()?.navigate('Login');
    } catch (error) {
      console.error('Error during logout:', error);
      setLogoutModalVisible(false);
      navigation.getParent()?.navigate('Login');
    }
  };

  const handleLogoutCancel = () => {
    setLogoutModalVisible(false);
  };

  const handlePendingFormsCancel = () => {
    setPendingFormsModalVisible(false);
  };

  const handleUploadNow = () => {
    // Close the modal and navigate to the Files tab which contains the Forms screen
    setPendingFormsModalVisible(false);
    // Navigate to Files tab (which will show the Forms screen by default)
    navigation.navigate('Files');
  };

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: theme.background }}
    >
      <View
        className="flex-row items-center justify-between border-b px-4 py-3 pt-10"
        style={{
          backgroundColor: theme.background,
          borderBottomColor: theme.border,
        }}
      >
        <View className="flex-1 items-center">
          <Text
            className="font-inter text-center text-[18px] font-semibold leading-[32px] tracking-[-0.006em]"
            style={{ color: theme.text }}
          >
            {t('settings.title')}
          </Text>
        </View>
        <LanguageControl />
      </View>
      <KeyboardAwareScrollView>
        {[
          { title: t('settings.notificationSettings'), onPress: () => {} },
          { title: t('settings.privacySecurity'), onPress: () => {} },
          { title: t('settings.supportHelp'), onPress: () => {} },
          { title: t('settings.appInfo'), onPress: () => {} },
          {
            title: t('settings.exportPendingForms'),
            onPress: exportPendingForms,
            disabled: isExporting,
            showStatus: isExporting,
          },
          {
            title: t('settings.logout'),
            onPress: handleLogoutPress,
            isLogout: true,
          },
        ].map((item, index) => (
          <TouchableOpacity
            key={index}
            className="border-1 flex-row items-center gap-2 border-b px-4 py-6"
            style={{ borderBottomColor: theme.border }}
            onPress={item.onPress}
            disabled={item.disabled}
          >
            <View className="flex-1 flex-row items-center justify-between">
              <Text
                className={`font-inter text-left text-[16px] font-normal leading-[100%] ${
                  item.isLogout ? 'text-red-500' : ''
                }`}
                style={
                  item.isLogout
                    ? {}
                    : {
                        color: item.disabled ? theme.subtext : theme.text,
                      }
                }
              >
                {item.title}
              </Text>
              {item.showStatus && (
                <Text
                  className="font-inter text-[12px] font-medium leading-[16px]"
                  style={{ color: theme.subtext }}
                >
                  {t('common.loading')}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </KeyboardAwareScrollView>

      {/* Logout Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={logoutModalVisible}
        onRequestClose={handleLogoutCancel}
      >
        <View
          className="flex-1 items-center justify-center p-[1.25rem]"
          style={{ backgroundColor: theme.modalOverlay }}
        >
          <View
            className="w-full max-w-[400px] gap-4 rounded-[6px] border p-6 opacity-100"
            style={{
              backgroundColor: theme.modalBackground,
              borderColor: theme.border,
            }}
          >
            <Text
              className="font-inter text-[18px] font-semibold leading-[28px] tracking-[-0.006em]"
              style={{ color: theme.text }}
            >
              {t('settings.logoutConfirmTitle')}
            </Text>
            <Text
              className="font-inter text-[14px] font-normal leading-[20px] tracking-normal"
              style={{ color: theme.subtext }}
            >
              {t('settings.logoutConfirmMessage')}
            </Text>
            <View className="mt-4 flex-row justify-end gap-3">
              <TouchableOpacity
                className="items-center justify-center gap-2 rounded-md border px-4 py-2 opacity-100"
                style={{ borderColor: theme.border }}
                onPress={handleLogoutCancel}
              >
                <Text
                  className="font-inter align-middle text-[14px] font-medium leading-[20px] tracking-[-0.006em]"
                  style={{ color: theme.text }}
                >
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-lg bg-red-600 px-4 py-2"
                onPress={handleLogoutConfirm}
              >
                <Text className="font-inter align-middle text-[14px] font-medium leading-[20px] tracking-[-0.006em] text-white">
                  {t('settings.logout')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        transparent={true}
        visible={pendingFormsModalVisible}
        onRequestClose={handlePendingFormsCancel}
      >
        <View
          className="flex-1 items-center justify-center p-[1.25rem]"
          style={{ backgroundColor: theme.modalOverlay }}
        >
          <View
            className="w-full max-w-[400px] gap-4 rounded-[6px] border p-6 opacity-100"
            style={{
              backgroundColor: theme.modalBackground,
              borderColor: theme.border,
            }}
          >
            <Text
              className="font-inter text-[18px] font-semibold leading-[28px] tracking-[-0.006em]"
              style={{ color: theme.text }}
            >
              {t('settings.pendingFormsTitle')}
            </Text>
            <Text
              className="font-inter text-[14px] font-normal leading-[20px] tracking-normal"
              style={{ color: theme.subtext }}
            >
              {t('settings.pendingFormsMessage')}
            </Text>
            <View className="mt-4 flex-row justify-end gap-3">
              <TouchableOpacity
                className="items-center justify-center gap-2 rounded-md border px-4 py-2 opacity-100"
                style={{ borderColor: theme.border }}
                onPress={handlePendingFormsCancel}
              >
                <Text
                  className="font-inter align-middle text-[14px] font-medium leading-[20px] tracking-[-0.006em]"
                  style={{ color: theme.text }}
                >
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-lg px-4 py-2"
                style={{ backgroundColor: theme.buttonBackground }}
                onPress={handleUploadNow}
              >
                <Text
                  className="font-inter align-middle text-[14px] font-medium leading-[20px] tracking-[-0.006em]"
                  style={{ color: theme.buttonText }}
                >
                  {t('settings.uploadNow')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default Settings;

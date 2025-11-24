import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../context/ThemeContext';
import { SubmissionItem } from '../../../types';
import LanguageControl from '../../components/LanguageControl';
import { FormStackParamList } from '../../navigation/FormStackParamList';
import { getQueue, removeFromQueue } from '../../pendingQueue';
// import { submitFormData } from '../../../lib/hey-api/client/sdk.gen';
import { EXPO_PUBLIC_BACKEND_URL } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { getIdToken } from '../../../services/auth/tokenStorage';

type FormsNavigationProp = NativeStackNavigationProp<
  FormStackParamList,
  'Forms'
>;

interface SubmissionResult {
  success: boolean;
  form: SubmissionItem;
  result?: any;
  reason?: string;
}

interface ApiResponse {
  success?: boolean;
  error?: string;
  message?: string;
  latest_schema_hash?: string;
  schemaHash?: string;
  form_name?: string;
  submission_id?: string;
  status?: string;
}

function Forms() {
  const [queueData, setQueueData] = useState<SubmissionItem[]>([]);
  const [pendingFormsCount, setPendingFormsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showSubmissionSummary, setShowSubmissionSummary] =
    useState<boolean>(false);
  const [submissionResults, setSubmissionResults] = useState<
    SubmissionResult[]
  >([]);
  const { t } = useTranslation();
  const { theme } = useTheme();
  const navigation = useNavigation<FormsNavigationProp>();
  const STORAGE_KEY = 'pendingSubmissions';

  useFocusEffect(
    useCallback(() => {
      fetchPendingForms();
    }, [])
  );

  const fetchPendingForms = async () => {
    try {
      setIsLoading(true);

      const pendingSubmissions = await getQueue();

      if (Array.isArray(pendingSubmissions)) {
        setQueueData(pendingSubmissions);
        setPendingFormsCount(pendingSubmissions.length);
      } else {
        setQueueData([]);
        setPendingFormsCount(0);
      }
    } catch (e) {
      console.error('Error fetching pending forms:', e);
      setPendingFormsCount(0);
      setQueueData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitAllForms = () => {
    if (pendingFormsCount === 0) {
      Alert.alert(
        t('formsScreen.noFormsAlert'),
        t('formsScreen.noFormsMessage')
      );
      return;
    }

    Alert.alert(
      t('formsScreen.submitAllFormsTitle'),
      t('formsScreen.submitAllFormsMessage', { count: pendingFormsCount }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('formsScreen.submit'),
          onPress: () => {
            (async () => {
              try {
                let idToken = await getIdToken({ forceRefresh: true });
                if (!idToken) {
                  throw new Error(
                    'Missing authentication token. Please sign in again.'
                  );
                }

                const submitWithRetry = async (
                  submissionItem: SubmissionItem
                ) => {
                  if (!EXPO_PUBLIC_BACKEND_URL) {
                    throw new Error('EXPO_PUBLIC_BACKEND_URL is not set');
                  }
                  try {
                    let response = await axios.post(
                      `${EXPO_PUBLIC_BACKEND_URL}/submit`,
                      submissionItem,
                      {
                        headers: {
                          'Content-Type': 'application/json',
                          ...(idToken && {
                            Authorization: `Bearer ${idToken}`,
                          }),
                        },
                      }
                    );

                    // If we get a 401, refresh token and retry once
                    if (response.status === 401) {
                      console.log(
                        '[Forms] Received 401, refreshing token and retrying...'
                      );
                      idToken = await getIdToken({ forceRefresh: true });
                      if (!idToken) {
                        throw new Error(
                          'Failed to refresh authentication token. Please sign in again.'
                        );
                      }
                      response = await axios.post(
                        `${EXPO_PUBLIC_BACKEND_URL}/submit`,
                        submissionItem,
                        {
                          headers: {
                            'Content-Type': 'application/json',
                            ...(idToken && {
                              Authorization: `Bearer ${idToken}`,
                            }),
                          },
                        }
                      );
                    }

                    return response;
                  } catch (error: any) {
                    // If it's a 401 error, try one more time with refreshed token
                    if (error?.response?.status === 401) {
                      console.log(
                        '[Forms] 401 error in catch, refreshing token and retrying...'
                      );
                      idToken = await getIdToken({ forceRefresh: true });
                      if (idToken) {
                        return axios.post(
                          `${EXPO_PUBLIC_BACKEND_URL}/submit`,
                          submissionItem,
                          {
                            headers: {
                              'Content-Type': 'application/json',
                              ...(idToken && {
                                Authorization: `Bearer ${idToken}`,
                              }),
                            },
                          }
                        );
                      }
                    }
                    throw error;
                  }
                };

                const results = await Promise.allSettled(
                  queueData.map(submissionItem =>
                    submitWithRetry(submissionItem)
                  )
                );

                const processedResults = results.map((res, index) => {
                  const currentSubmissionItem = queueData[index];

                  if (res.status === 'fulfilled') {
                    const responseData = res.value.data as ApiResponse;
                    const isSuccess =
                      responseData && responseData.success === true;
                    return {
                      success: isSuccess,
                      form: currentSubmissionItem,
                      result: responseData,
                    };
                  } else {
                    // Extract meaningful error message
                    let errorMessage = 'Submission failed';
                    const reason = res.reason;

                    if (reason?.response?.data?.detail?.error) {
                      errorMessage = reason.response.data.detail.error;
                    } else if (reason?.response?.data?.error) {
                      errorMessage = reason.response.data.error;
                    } else if (reason?.message) {
                      errorMessage = reason.message;
                    } else if (typeof reason === 'string') {
                      errorMessage = reason;
                    }

                    // Check for session expired or authentication errors
                    if (
                      errorMessage.includes('Session expired') ||
                      errorMessage.includes('SESSION_EXPIRED') ||
                      errorMessage.includes('sign in again') ||
                      errorMessage.toLowerCase().includes('token') ||
                      errorMessage.toLowerCase().includes('unauthorized')
                    ) {
                      errorMessage =
                        'Authentication error. Please sign out and sign in again.';
                    }

                    return {
                      success: false,
                      form: currentSubmissionItem,
                      reason: errorMessage,
                    };
                  }
                });

                const successfulIds = processedResults
                  .filter(r => r.success)
                  .map(r => r.form.id);

                const queue = await getQueue();
                const updatedQueue = queue.filter(
                  item => !successfulIds.includes(item.id)
                );
                await AsyncStorage.setItem(
                  STORAGE_KEY,
                  JSON.stringify(updatedQueue)
                );

                setQueueData(updatedQueue);

                setSubmissionResults(processedResults);
                setShowSubmissionSummary(true);
              } catch (error: any) {
                console.error('Unexpected error submitting forms:', error);

                // Check for session expired errors
                let message =
                  error instanceof Error && error.message
                    ? error.message
                    : t('formsScreen.submitErrorMessage');

                if (
                  message.includes('Session expired') ||
                  message.includes('SESSION_EXPIRED') ||
                  message.includes('sign in again')
                ) {
                  message =
                    'Session expired. Please sign out and sign in again to continue.';
                } else if (
                  message.toLowerCase().includes('token') ||
                  message.toLowerCase().includes('unauthorized') ||
                  message.toLowerCase().includes('authentication')
                ) {
                  message =
                    'Authentication error. Please try again or sign in again.';
                }

                Alert.alert(t('formsScreen.submitError'), message);
              }
            })();
          },
        },
      ]
    );
  };

  const handleSubmitSingleForm = async (formData: SubmissionItem) => {
    Alert.alert(
      t('formsScreen.submitFormTitle'),
      t('formsScreen.submitFormMessage', { formName: formData?.formName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('formsScreen.submit'),
          onPress: async () => {
            try {
              console.log(formData);
              if (!EXPO_PUBLIC_BACKEND_URL) {
                throw new Error('EXPO_PUBLIC_BACKEND_URL is not set');
              }
              let idToken = await getIdToken({ forceRefresh: true });
              if (!idToken) {
                throw new Error(
                  'Missing authentication token. Please sign in again.'
                );
              }

              let response = await axios.post(
                `${EXPO_PUBLIC_BACKEND_URL}/submit`,
                formData,
                {
                  headers: {
                    'Content-Type': 'application/json',
                    ...(idToken && { Authorization: `Bearer ${idToken}` }),
                  },
                }
              );

              // If we get a 401, refresh token and retry once
              if (response.status === 401) {
                console.log(
                  '[Forms] Received 401, refreshing token and retrying...'
                );
                idToken = await getIdToken({ forceRefresh: true });
                if (!idToken) {
                  throw new Error(
                    'Failed to refresh authentication token. Please sign in again.'
                  );
                }
                response = await axios.post(`${EXPO_PUBLIC_BACKEND_URL}/submit`, formData, {
                  headers: {
                    'Content-Type': 'application/json',
                    ...(idToken && { Authorization: `Bearer ${idToken}` }),
                  },
                });
              }

              const responseData = response.data as ApiResponse;

              // Check if the response indicates success
              const isSuccess = responseData && responseData.success === true;

              const processedResult = isSuccess
                ? { success: true, form: formData, result: responseData }
                : {
                    success: false,
                    form: formData,
                    reason: responseData?.error || 'Submission failed',
                  };

              // Remove from queue & local storage if successful
              if (processedResult.success) {
                await removeFromQueue(formData.id);
                fetchPendingForms();
              }

              // Set modal results using the same state as "Submit All"
              setSubmissionResults([processedResult]); // single-item array
              setShowSubmissionSummary(true);
            } catch (error: any) {
              console.error('Error submitting form:', error);

              // Check if it's a session expired error from token refresh
              if (
                error?.message?.includes('Session expired') ||
                error?.message?.includes('SESSION_EXPIRED') ||
                error?.message?.includes('sign in again')
              ) {
                const processedResult = {
                  success: false,
                  form: formData,
                  reason:
                    'Session expired. Please sign out and sign in again to continue.',
                };
                setSubmissionResults([processedResult]);
                setShowSubmissionSummary(true);
                return;
              }

              // If it's a 401 error, try refreshing token and retry once
              if (error?.response?.status === 401) {
                try {
                  console.log(
                    '[Forms] 401 error in catch, refreshing token and retrying...'
                  );
                  const refreshedToken = await getIdToken({
                    forceRefresh: true,
                  });
                  if (refreshedToken) {
                    if (!EXPO_PUBLIC_BACKEND_URL) {
                      throw new Error('EXPO_PUBLIC_BACKEND_URL is not set');
                    }
                    const retryResponse = await axios.post(
                      `${EXPO_PUBLIC_BACKEND_URL}/submit`,
                      formData,
                      {
                        headers: {
                          'Content-Type': 'application/json',
                          ...(refreshedToken && {
                            Authorization: `Bearer ${refreshedToken}`,
                          }),
                        },
                      }
                    );
                    const responseData = retryResponse.data as ApiResponse;
                    const isSuccess =
                      responseData && responseData.success === true;
                    const processedResult = isSuccess
                      ? { success: true, form: formData, result: responseData }
                      : {
                          success: false,
                          form: formData,
                          reason: responseData?.error || 'Submission failed',
                        };
                    if (processedResult.success) {
                      await removeFromQueue(formData.id);
                      fetchPendingForms();
                    }
                    setSubmissionResults([processedResult]);
                    setShowSubmissionSummary(true);
                    return;
                  } else {
                    // Token refresh failed - session likely expired
                    const processedResult = {
                      success: false,
                      form: formData,
                      reason:
                        'Authentication failed. Please sign out and sign in again.',
                    };
                    setSubmissionResults([processedResult]);
                    setShowSubmissionSummary(true);
                    return;
                  }
                } catch (retryError: any) {
                  console.error(
                    '[Forms] Error retrying after token refresh:',
                    retryError
                  );
                  // Check if retry error is also session expired
                  if (
                    retryError?.message?.includes('Session expired') ||
                    retryError?.message?.includes('SESSION_EXPIRED')
                  ) {
                    const processedResult = {
                      success: false,
                      form: formData,
                      reason:
                        'Session expired. Please sign out and sign in again.',
                    };
                    setSubmissionResults([processedResult]);
                    setShowSubmissionSummary(true);
                    return;
                  }
                  // Fall through to show original error
                }
              }

              // Handle HTTP errors (like 500 status)
              let errorMessage = 'Submission failed';
              if (error?.response?.data?.detail?.error) {
                errorMessage = error.response.data.detail.error;
              } else if (error?.response?.data?.error) {
                errorMessage = error.response.data.error;
              } else if (error?.message) {
                errorMessage = error.message;
              }

              // Check for common token-related error messages from backend
              if (
                errorMessage.toLowerCase().includes('token') ||
                errorMessage.toLowerCase().includes('unauthorized') ||
                errorMessage.toLowerCase().includes('authentication')
              ) {
                errorMessage =
                  'Authentication error. Please try again or sign in again.';
              }

              const processedResult = {
                success: false,
                form: formData,
                reason: errorMessage,
              };

              setSubmissionResults([processedResult]);
              setShowSubmissionSummary(true);
            }
          },
        },
      ]
    );
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
            {t('formsScreen.title')}
          </Text>
        </View>
        <LanguageControl />
      </View>

      {showSubmissionSummary && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={showSubmissionSummary}
          onRequestClose={() => setShowSubmissionSummary(false)}
        >
          <View className="flex-1 items-center justify-center bg-[#00000033] p-[1.25rem]">
            <View className="w-full max-w-[400px] gap-4 rounded-[6px] border border-[#E2E8F0] bg-white p-6 opacity-100">
              <Text className="font-inter text-[18px] font-semibold leading-[28px] tracking-[-0.006em] text-[#020617]">
                {t('formsScreen.submissionSummaryTitle')}
              </Text>
              {/* output for error */}
              {/* raise HTTPException(
                                    status_code=500,
                                    detail={
                                        "success": False,
                                        "formname": submission_item.formName,
                                        "error": f"Forced failure for testing form"
                                    }
                                ) */}
              {/* output for success
                            return {
                                "success": True,
                            "message": f"Submitted successfully",
                            "formName": submission_item.formName
                            } */}

              <ScrollView className="max-h-[300px]">
                {submissionResults.map((res, idx) => (
                  <View key={idx} className="mb-2">
                    <Text
                      className={`font-inter text-[14px] font-normal leading-[20px] tracking-normal ${
                        res.success ? 'text-[#16a34a]' : 'text-[#EF2226]'
                      }`}
                    >
                      {res.form?.formName || res.form?.id || `Form ${idx + 1}`}{' '}
                      —{' '}
                      {res.success
                        ? t('formsScreen.submissionSuccess')
                        : t('formsScreen.submissionFailed')}
                      {!res.success && res.reason ? ` (${res.reason})` : ''}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              <View className="mt-4 flex-row justify-end gap-3">
                <TouchableOpacity
                  className="items-center justify-center gap-2 rounded-md border border-[#E2E8F0] px-4 py-2 opacity-100"
                  onPress={() => setShowSubmissionSummary(false)}
                >
                  <Text className="font-inter align-middle text-[14px] font-medium leading-[20px] tracking-[-0.006em] text-[#020617]">
                    {t('common.close')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      <View className="p-4">
        <View
          className="flex-row items-start justify-between rounded-lg border p-4"
          style={{
            borderColor: theme.border,
            backgroundColor: theme.cardBackground,
          }}
        >
          <View className="mr-3 flex-1">
            <Text
              className="text-lg font-bold"
              style={{ color: theme.pendingText }}
            >
              {t('formsScreen.pendingForms', { count: pendingFormsCount })}
            </Text>
            <Text
              className="font-inter text-2xl font-semibold leading-8 tracking-[-0.006em]"
              style={{ color: theme.pendingText }}
            >
              {isLoading ? '...' : `${pendingFormsCount} FORMS`}
            </Text>
          </View>
          {pendingFormsCount > 0 && (
            <TouchableOpacity
              className="flex-shrink-0"
              onPress={handleSubmitAllForms}
              disabled={isLoading}
            >
              <Text
                className="rounded-xl border px-3 py-2 text-sm"
                style={{
                  borderColor: isLoading ? theme.subtext : theme.pendingBorder,
                  color: isLoading ? theme.subtext : theme.pendingText,
                }}
              >
                {t('home.submitAllForms')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View className="px-4">
        <Text
          className="font-inter text-center text-base font-semibold leading-8 tracking-[-0.006em]"
          style={{ color: theme.text }}
        >
          {t('formsScreen.pendingForms')}
        </Text>

        {isLoading ? (
          <View className="flex items-center justify-center py-8">
            <Text style={{ color: theme.subtext }}>
              {t('formsScreen.loadingPendingForms')}
            </Text>
          </View>
        ) : queueData.length === 0 ? (
          <View className="flex items-center justify-center py-8">
            <Text style={{ color: theme.subtext }}>
              {t('formsScreen.noPendingForms')}
            </Text>
          </View>
        ) : (
          queueData.map((item, index) => {
            const formData = item;
            const formName = formData?.formName || `Form ${index + 1}`;
            const formattedDate = new Date().toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            return (
              <View
                key={item.id}
                className="flex w-full flex-row justify-between border px-4 py-4"
                style={{
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    console.log(
                      'Navigating to PreviewForm with formId:',
                      item.id
                    );
                    navigation.navigate('PreviewForm', { formId: item.id });
                  }}
                >
                  <View className="flex flex-col items-start">
                    <Text
                      className="font-inter text-left text-sm font-normal leading-5"
                      style={{ color: theme.text }}
                    >
                      {formName}
                    </Text>
                    <Text
                      className="font-inter text-left text-[10px] font-light leading-5"
                      style={{ color: theme.subtext }}
                    >
                      {t('formsScreen.filledOn', { date: formattedDate })}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleSubmitSingleForm(formData)}
                >
                  <View className="flex h-[40px] w-[117px] items-center justify-center">
                    <Text
                      className="font-inter text-right text-sm font-medium leading-5"
                      style={{ color: theme.text }}
                    >
                      {t('formsScreen.submitForm')}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>
    </SafeAreaView>
  );
}

export default Forms;

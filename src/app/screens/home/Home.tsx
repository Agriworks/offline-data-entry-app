import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { BottomTabsList } from '../../navigation/BottomTabsList';
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageControl from '../../components/LanguageControl';
import { ArrowRight } from 'lucide-react-native';
import { HomeStackParamList } from '../../navigation/HomeStackParamList';
import { useTheme } from '../../../context/ThemeContext';
import { getErpSystems } from '../../../lib/hey-api/client/sdk.gen';
import { getQueue } from '../../pendingQueue';
import { useNetwork } from '../../../context/NetworkProvider';
import {
  loadErpSystemsFromCache,
  saveErpSystemsToCache,
  type ErpSystem,
} from '../../../services/erpStorage';

type HomeNavigationProp = BottomTabNavigationProp<BottomTabsList, 'Home'> & {
  navigate: (
    screen: keyof HomeStackParamList,
    params?: HomeStackParamList[keyof HomeStackParamList]
  ) => void;
};

const ERP: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<HomeNavigationProp>();
  const { theme } = useTheme();
  const [erpSystems, setErpSystems] = useState<ErpSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingFormsCount, setPendingFormsCount] = useState<number>(0);
  const { isConnected } = useNetwork();

  const normalizeErpSystems = useCallback((raw: any): ErpSystem[] => {
    if (!raw) {
      return [];
    }

    const candidates = [raw?.data, raw];
    let list: unknown[] = [];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        list = candidate;
        break;
      }
      if (candidate && Array.isArray((candidate as any).data)) {
        list = (candidate as any).data;
        break;
      }
    }

    const mapToErpSystem = (item: any): ErpSystem | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const id =
        item.id ?? item.ID ?? item.key ?? item.name ?? item.systemId ?? '';
      const name = item.name ?? item.title ?? item.systemName ?? '';
      const formCountValue =
        item.formCount ??
        item.form_count ??
        item.formsCount ??
        item.forms_count ??
        0;

      if (!id || !name) {
        return null;
      }

      return {
        id: String(id),
        name: String(name),
        formCount: Number.isFinite(Number(formCountValue))
          ? Number(formCountValue)
          : 0,
      };
    };

    return list
      .map(mapToErpSystem)
      .filter((value): value is ErpSystem => Boolean(value));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadErpSystems = async () => {
      if (cancelled) {
        return;
      }
      setLoading(true);

      let cached: ErpSystem[] | null = null;
      try {
        cached = await loadErpSystemsFromCache();
        if (!cancelled && cached && cached.length > 0) {
          setErpSystems(cached);
        }
      } catch (error) {
        console.error('Failed to read cached ERP systems:', error);
      }

      if (isConnected === false) {
        if (!cancelled) {
          setLoading(false);
        }
        if (!cached || cached.length === 0) {
          console.warn('Offline with no cached ERP systems available.');
        }
        return;
      }

      try {
        const response = await getErpSystems();
        const systems = normalizeErpSystems(response);
        if (!cancelled) {
          setErpSystems(systems);
        }
        await saveErpSystemsToCache(systems);
        console.log('ERP Systems:', systems);
      } catch (error: any) {
        console.error('Error fetching ERP systems:', error);
        // Check for 401 in various error formats
        const is401Error =
          error?.response?.status === 401 ||
          error?.status === 401 ||
          error?.statusCode === 401 ||
          (typeof error === 'object' &&
            'status' in error &&
            error.status === 401) ||
          error?.message?.includes('401') ||
          error?.message?.includes('Unauthorized');

        // If it's a 401 error, try refreshing token and retry once
        if (is401Error) {
          try {
            console.log(
              '[Home] 401 error detected, refreshing token and retrying...'
            );
            const { getIdToken } = await import(
              '../../../services/auth/tokenStorage'
            );
            const refreshedToken = await getIdToken({ forceRefresh: true });
            if (refreshedToken) {
              // Wait a bit to ensure token is saved
              await new Promise(resolve => setTimeout(resolve, 100));
              // Retry the request - the API client should handle it, but we can also retry here
              const retryResponse = await getErpSystems();
              const systems = normalizeErpSystems(retryResponse);
              if (!cancelled) {
                setErpSystems(systems);
              }
              await saveErpSystemsToCache(systems);
              console.log(
                '[Home] ERP Systems loaded successfully after token refresh'
              );
            } else {
              throw new Error('Failed to refresh authentication token');
            }
          } catch (retryError: any) {
            console.error(
              '[Home] Error retrying ERP systems fetch after token refresh:',
              retryError
            );
            // Fall back to cached data
            if (!cancelled) {
              if (cached && cached.length > 0) {
                setErpSystems(cached);
                console.log(
                  '[Home] Using cached ERP systems due to retry failure'
                );
              } else {
                const fallback = await loadErpSystemsFromCache();
                if (fallback && fallback.length > 0) {
                  setErpSystems(fallback);
                  console.log('[Home] Using fallback cached ERP systems');
                } else {
                  setErpSystems([]);
                  console.warn('[Home] No cached ERP systems available');
                }
              }
            }
          }
        } else {
          // For non-401 errors, use cached data if available
          if (!cancelled) {
            if (cached && cached.length > 0) {
              setErpSystems(cached);
              console.log(
                '[Home] Using cached ERP systems due to non-401 error'
              );
            } else {
              const fallback = await loadErpSystemsFromCache();
              if (fallback && fallback.length > 0) {
                setErpSystems(fallback);
              } else {
                setErpSystems([]);
              }
            }
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadErpSystems();

    return () => {
      cancelled = true;
    };
  }, [isConnected, normalizeErpSystems]);

  const fetchPendingFormsCount = useCallback(async () => {
    try {
      const pendingSubmissions = await getQueue();
      if (Array.isArray(pendingSubmissions)) {
        setPendingFormsCount(pendingSubmissions.length);
      } else {
        setPendingFormsCount(0);
      }
    } catch (e) {
      console.error('Error fetching pending forms count:', e);
      setPendingFormsCount(0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPendingFormsCount();
    }, [fetchPendingFormsCount])
  );

  if (loading && erpSystems.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={theme.text} />
      </View>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 gap-2"
      style={{ backgroundColor: theme.background }}
    >
      {/* Header */}
      <View className="px-6 pb-4 pt-10">
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <Text
              className="font-inter text-lg font-semibold leading-8 tracking-[-0.006em]"
              style={{ color: theme.text }}
            >
              {t('welcome.title') || 'Welcome back!'}
            </Text>
            <Text
              className="font-inter text-xs font-normal leading-5 tracking-normal"
              style={{ color: theme.subtext }}
            >
              {t('welcome.subtitle') ||
                "Here's a list of your ERP Systems for you!"}
            </Text>
          </View>
          <LanguageControl />
        </View>
      </View>

      {/* Pending Forms Card */}
      <View className="mx-6 mb-6">
        <View
          className="flex-row items-start rounded-lg border p-4"
          style={{
            backgroundColor: theme.cardBackground,
            borderColor: theme.border,
          }}
        >
          <View className="flex-1">
            <Text
              className="text-lg font-bold"
              style={{ color: theme.pendingText }}
            >
              {t('home.pendingForms', { count: pendingFormsCount })}
            </Text>
            <TouchableOpacity>
              <View className="mt-2 flex-row items-center gap-2">
                <TouchableOpacity onPress={() => navigation.navigate('Files')}>
                  <Text
                    className="text-sm"
                    style={{ color: theme.pendingText }}
                  >
                    {t('home.viewPendingForms')}
                  </Text>
                </TouchableOpacity>
                <ArrowRight color={theme.pendingText} size={12} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ERP Systems */}
      <ScrollView className="pb-8">
        <View className="flex-row flex-wrap justify-center px-4">
          {erpSystems.map((erp: ErpSystem, i) => (
            <TouchableOpacity
              key={i}
              className="m-2 min-h-[100px] w-[45%] items-center justify-center rounded-2xl border"
              style={{ borderColor: theme.border }}
              onPress={() => {
                if (erp.name === 'CSA') {
                  navigation.navigate('FormsList', { erpSystemName: erp.name });
                }
              }}
            >
              <Text
                className="font-inter text-base font-semibold leading-7 tracking-[-0.006em]"
                style={{ color: theme.text }}
              >
                {erp.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default ERP;

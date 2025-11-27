import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ArrowRight } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNetwork } from '../../../context/NetworkProvider';
import { useTheme } from '../../../context/ThemeContext';
import { getErpSystems } from '../../../lib/hey-api/client/sdk.gen';
import {
  loadErpSystemsFromCache,
  saveErpSystemsToCache,
  type ErpSystem,
} from '../../../services/erpStorage';
import LanguageControl from '../../components/LanguageControl';
import { BottomTabsList } from '../../navigation/BottomTabsList';
import { HomeStackParamList } from '../../navigation/HomeStackParamList';
import { getQueue } from '../../pendingQueue';

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

      // ⭐ ALWAYS load cached data first (works offline and with expired tokens)
      let cached: ErpSystem[] | null = null;
      try {
        cached = await loadErpSystemsFromCache();
        if (!cancelled && cached && cached.length > 0) {
          setErpSystems(cached);
          console.log('[Home] Loaded cached ERP systems:', cached.length);
        }
      } catch (error) {
        console.error('[Home] Failed to read cached ERP systems:', error);
      }

      // ⭐ If offline, just use cached data and stop
      if (isConnected === false) {
        if (!cancelled) {
          setLoading(false);
        }
        if (!cached || cached.length === 0) {
          console.warn('[Home] Offline with no cached ERP systems available.');
        } else {
          console.log('[Home] Offline mode: Using cached ERP systems');
        }
        return;
      }

      // ⭐ If online, try to fetch fresh data (but keep cached data if it fails)
      try {
        console.log('[Home] Online: Fetching fresh ERP systems from API...');
        const response = await getErpSystems();
        const systems = normalizeErpSystems(response);
        if (!cancelled && systems.length > 0) {
          setErpSystems(systems);
          await saveErpSystemsToCache(systems);
          console.log('[Home] Fresh ERP systems loaded and cached:', systems.length);
        }
      } catch (error: any) {
        console.error('[Home] Error fetching ERP systems from API:', error);
        
        // ⭐ DON'T try to refresh tokens - just use cached data
        // This prevents crashes and works with expired tokens
        console.log('[Home] API failed, keeping cached ERP systems');
        
        // Ensure cached data is still displayed
        if (!cancelled) {
          if (cached && cached.length > 0) {
            setErpSystems(cached);
            console.log('[Home] Using cached ERP systems (API failed)');
          } else {
            // Try loading cache one more time
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

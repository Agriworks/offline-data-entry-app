import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useNetwork } from '../../../context/NetworkProvider';
import { useFocusEffect } from '@react-navigation/native';
import {
  ensureDoctypeGraph,
  getRootDocTypeNames,
  getDocTypeFromLocal,
} from '../../../api';
import { useTranslation } from 'react-i18next';
import LanguageControl from '../../components/LanguageControl';
import { ArrowLeft, Download, Check } from 'lucide-react-native';
import { HomeStackParamList } from '@/app/navigation/HomeStackParamList';
import { useTheme } from '../../../context/ThemeContext';
// import { BACKEND_URL } from '@env';

type FormsListNavigationProp = NativeStackNavigationProp<
  HomeStackParamList,
  'FormsList'
>;

type FormsListRouteProp = RouteProp<HomeStackParamList, 'FormsList'>;

export interface FormItem {
  name: string;
}

const additionalDoctype = [
  'Combating Malnutrition Basic Data',
  'PGS Peer Appraisal Basic Data',
  'Testing DocType',
];

const FormsList = () => {
  const navigation = useNavigation<FormsListNavigationProp>();
  const route = useRoute<FormsListRouteProp>();
  const { isConnected } = useNetwork();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { erpSystemName } = route.params || {
    erpSystemName: t('formsList.title'),
  };
  const [forms, setForms] = useState<FormItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadStates, setDownloadStates] = useState<{
    [key: string]: { isDownloaded: boolean; isDownloading: boolean };
  }>({});

  useEffect(() => {
    const loadForms = async () => {
      setLoading(true);
      try {
        if (isConnected) {
          // const doctypesResponse = await getAllDoctypes();
          // const responseData = doctypesResponse.data as { data: FormItem[] };
          // const data = responseData.data;

          // // Add additional doctypes to the forms list
          // const additionalDoctypeItems: FormItem[] = additionalDoctype.map(
          //   name => ({ name })
          // );
          // const combinedData = [...data, ...additionalDoctypeItems];
          // setForms(combinedData);
          setForms(additionalDoctype.map(name => ({ name })));
        } else {
          // When offline, only show root doctypes (main doctypes), not linked doctypes
          const stored = (await getRootDocTypeNames()) as FormItem[];
          setForms(stored);
        }
      } catch (error) {
        console.error('Error loading forms:', error);
      } finally {
        setLoading(false);
      }
    };
    if (isConnected !== null) {
      loadForms();
    }
  }, [isConnected]);

  useFocusEffect(() => {
    const checkDownloadStatus = async () => {
      const statusEntries = await Promise.all(
        forms.map(async f => {
          const cached = await getDocTypeFromLocal(f.name);
          return {
            name: f.name,
            isDownloaded: Boolean(cached),
          };
        })
      );

      const initialDownloadStates = statusEntries.reduce(
        (acc, item) => {
          acc[item.name] = {
            isDownloaded: item.isDownloaded,
            isDownloading: false,
          };
          return acc;
        },
        {} as Record<string, { isDownloaded: boolean; isDownloading: boolean }>
      );

      setDownloadStates(initialDownloadStates);
    };

    if (forms.length > 0) {
      checkDownloadStatus();
    }
  });

  const handleDownload = async (docTypeName: string) => {
    setDownloadStates(prev => ({
      ...prev,
      [docTypeName]: { ...prev[docTypeName], isDownloading: true },
    }));

    try {
      const ensureResult = await ensureDoctypeGraph(docTypeName, {
        networkAvailable: Boolean(isConnected),
      });

      if (ensureResult.skipped.includes(docTypeName)) {
        throw new Error('Download skipped due to offline mode');
      }
      if (ensureResult.errors.length > 0) {
        throw (
          ensureResult.errors[0].error ??
          new Error('Failed to download doctype')
        );
      }

      const cached = await getDocTypeFromLocal(docTypeName);
      const isDownloaded = Boolean(cached);
      if (!isDownloaded) {
        throw new Error('Doctype not cached after download attempt');
      }

      // Update download state to show as downloaded
      setDownloadStates(prev => ({
        ...prev,
        [docTypeName]: { isDownloaded, isDownloading: false },
      }));
    } catch (error) {
      console.error('Error downloading doctype:', error);
      // Reset download state on error
      setDownloadStates(prev => ({
        ...prev,
        [docTypeName]: { ...prev[docTypeName], isDownloading: false },
      }));
    }
  };

  const renderFormItem = ({ item }: { item: FormItem }) => {
    const itemState = downloadStates[item.name] || {
      isDownloaded: false,
      isDownloading: false,
    };

    return (
      <TouchableOpacity
        className="flex-row items-center justify-between border-b px-5 py-4"
        style={{ borderBottomColor: theme.border }}
        onPress={() => {
          navigation.navigate('FormDetail', {
            formName: item.name,
            erpSystemName,
          });
        }}
      >
        <Text className="text-base font-normal" style={{ color: theme.text }}>
          {item.name}
        </Text>
        <View className="flex-row items-center">
          {isConnected &&
            (itemState.isDownloading ? (
              <ActivityIndicator size="small" color={theme.buttonBackground} />
            ) : itemState.isDownloaded ? (
              <View className="mr-3">
                <Check color="#16a34a" size={20} />
              </View>
            ) : (
              <TouchableOpacity
                className="mr-3 p-2"
                onPress={() => {
                  handleDownload(item.name);
                }}
              >
                <Download color={theme.buttonBackground} size={20} />
              </TouchableOpacity>
            ))}
          <Text className="text-base font-normal" style={{ color: theme.text }}>
            {t('formsList.open')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: theme.background }}
      >
        <ActivityIndicator
          size="large"
          color={theme.buttonBackground}
          className="mt-10"
        />
      </SafeAreaView>
    );
  }

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
        <TouchableOpacity className="p-2" onPress={() => navigation.goBack()}>
          <ArrowLeft color={theme.text} size={16} />
        </TouchableOpacity>
        <View className="flex-1 items-center">
          <Text
            className="font-inter text-center text-[18px] font-semibold leading-[32px] tracking-[-0.006em]"
            style={{ color: theme.text }}
          >
            {erpSystemName}
          </Text>
          <Text className="mt-0.5 text-sm" style={{ color: theme.subtext }}>
            {forms.length} {t('navigation.forms') || 'Forms'}
          </Text>
        </View>
        <LanguageControl />
      </View>

      <FlatList
        data={forms}
        renderItem={renderFormItem}
        keyExtractor={item => item.name}
        className="flex-1"
        style={{ backgroundColor: theme.background }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

export default FormsList;

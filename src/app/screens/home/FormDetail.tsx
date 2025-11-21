import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/app/navigation/RootStackedList';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useNetwork } from '../../../context/NetworkProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueue } from '../../pendingQueue';
import {
  ensureDoctypeGraph,
  getDocTypeFromLocal,
  extractFields,
} from '../../../api';
import { RawField } from '../../../types';
import { useTranslation } from 'react-i18next';
import LanguageControl from '../../components/LanguageControl';
import SelectDropdown from '../../components/SelectDropdown';
import LinkDropdown from '../../components/LinkDropdown';
import DatePicker from '../../components/DatePicker';
import TableField from '../../components/TableField';
import generateSchemaHash from '../../../helper/hashFunction';
import { ArrowLeft } from 'lucide-react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { HomeStackParamList } from '@/app/navigation/HomeStackParamList';
import { useTheme } from '../../../context/ThemeContext';

type FormDetailRouteProp = RouteProp<HomeStackParamList, 'FormDetail'>;
type FormDetailNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'MainApp'
>;

type Props = {
  navigation: FormDetailNavigationProp;
};

const FormDetail: React.FC<Props> = ({ navigation }) => {
  //this is the network status , make it true/false to simulate offline/online
  const { isConnected } = useNetwork();
  const route = useRoute<FormDetailRouteProp>();
  const { formName, erpSystemName } = route.params;
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [fields, setFields] = useState<RawField[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [dropdownStates, setDropdownStates] = useState<Record<string, boolean>>(
    {}
  );
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isSubmittedRef = useRef(false);

  const loginAndFetchFields = useCallback(async () => {
    let allFields: RawField[] = [];

    try {
      const ensureResult = await ensureDoctypeGraph(formName, {
        networkAvailable: Boolean(isConnected),
      });

      if (ensureResult.skipped.length > 0) {
        console.warn(
          'Some doctypes were skipped due to offline mode:',
          ensureResult.skipped
        );
      }
      if (ensureResult.errors.length > 0) {
        console.error('Errors ensuring doctypes:', ensureResult.errors);
      }

      const savedDoctypeData = await getDocTypeFromLocal(formName);
      if (savedDoctypeData) {
        allFields = extractFields(savedDoctypeData);
      } else {
        console.warn('No cached data available for offline use');
      }

      const inputFields = allFields.filter(field => {
        // Skip if hidden, print_hide, or report_hide is true (value is 1 or truthy)
        if (field.hidden || field.print_hide || field.report_hide) {
          return false;
        }
        return [
          'Data',
          'Select',
          'Text',
          'Int',
          'Float',
          'Link',
          'Date',
          'Table',
        ].includes(field.fieldtype);
      });

      const defaults: Record<string, any> = {};
      inputFields.forEach(field => {
        if (field.default) {
          defaults[field.fieldname] = field.default;
        }
      });
      setFormData(defaults);
      setFields(inputFields);
      setLoading(false);
    } catch (error: any) {
      console.error('Error in loginAndFetchFields:', error);
    } finally {
      setLoading(false);
    }
  }, [formName, isConnected]);

  useEffect(() => {
    if (isConnected != null) {
      loginAndFetchFields();
    }
  }, [formName, isConnected, loginAndFetchFields]);

  const handleSubmitConfirmation = () => {
    if (!formName || !formData) {
      return;
    }

    const missingFields = fields.filter(
      field =>
        !formData[field.fieldname] ||
        formData[field.fieldname].toString().trim() === ''
    );

    if (missingFields.length > 0) {
      const fieldNames = missingFields
        .map(field => field.label || field.fieldname)
        .join(', ');
      Alert.alert(
        t('common.error'),
        t('formDetail.requiredFields', { fields: fieldNames })
      );
      return;
    }

    if (Object.keys(formData).length === 0) {
      Alert.alert(t('common.error'), t('formDetail.noData'));
      return;
    }
    setConfirmModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!formName || !formData) {
      return;
    }

    const doctype = await getDocTypeFromLocal(formName);
    if (!doctype) {
      Alert.alert(t('common.error'), t('formDetail.missingDoctype'));
      return;
    }
    const schemaHash = generateSchemaHash(doctype.fields);

    const newSubmission = {
      id: Date.now().toString(),
      formName,
      data: formData,
      schemaHash,
      status: 'pending' as 'pending' | 'submitted' | 'failed',
    };

    setLoading(true);
    setConfirmModalVisible(false);
    try {
      await enqueue(newSubmission);
      isSubmittedRef.current = true;
      await AsyncStorage.removeItem('tempFormData');
      setFormData({});
      setTimeout(() => {
        navigation.goBack();
      }, 100);
    } catch (e) {
      Alert.alert(t('common.error'), t('formDetail.errorSaving'));
      isSubmittedRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (isSubmittedRef.current || Object.values(formData).length === 0) {
        // no data to save or form was submitted, don't prompt
        return;
      }
      // Prevent default back action
      e.preventDefault();
      Alert.alert(
        t('formDetail.discardChanges'),
        t('formDetail.unsavedDataMessage'),
        [
          { text: t('common.cancel'), style: 'cancel', onPress: () => {} },
          {
            text: t('formDetail.discard'),
            style: 'destructive',
            onPress: async () => {
              await AsyncStorage.removeItem('tempFormData'); // clear saved draft
              navigation.dispatch(e.data.action); // continue with back navigation
            },
          },
        ]
      );
    });

    return unsubscribe;
  }, [navigation, formData, t]);

  // Apply table row edits created in TableRowEditor
  useEffect(() => {
    const onFocus = navigation.addListener('focus', async () => {
      try {
        const draft = await AsyncStorage.getItem('tableRowDraft');
        if (!draft) {
          return;
        }
        const parsed = JSON.parse(draft) as {
          fieldname: string;
          index: number | null;
          row: Record<string, any>;
        };
        await AsyncStorage.removeItem('tableRowDraft');
        if (!parsed || !parsed.fieldname || !parsed.row) {
          return;
        }
        setFormData(prev => {
          const current = Array.isArray(prev[parsed.fieldname])
            ? [...(prev[parsed.fieldname] as any[])]
            : [];
          if (
            typeof parsed.index === 'number' &&
            parsed.index >= 0 &&
            parsed.index < current.length
          ) {
            current[parsed.index] = parsed.row;
          } else {
            current.push(parsed.row);
          }
          const updated = { ...prev, [parsed.fieldname]: current };
          AsyncStorage.setItem('tempFormData', JSON.stringify(updated));
          return updated;
        });
      } catch {
        // ignore parse/storage errors
      }
    });
    return onFocus;
  }, [navigation]);

  useEffect(() => {
    const restoreForm = async () => {
      const saved = await AsyncStorage.getItem('tempFormData');
      if (saved) {
        setFormData(JSON.parse(saved));
      }
    };
    restoreForm();
  }, []);

  useEffect(() => {
    if (Object.keys(formData).length > 0) {
      isSubmittedRef.current = false;
    }
  }, [formData]);

  const handleChange = async (fieldname: string, value: any) => {
    const updated = { ...formData, [fieldname]: value };
    setFormData(updated);
    //store the temp data on every change
    await AsyncStorage.setItem('tempFormData', JSON.stringify(updated));
    // Close dropdown after selection
    if (dropdownStates[fieldname]) {
      setDropdownStates(prev => ({
        ...prev,
        [fieldname]: false,
      }));
    }
  };

  const toggleDropdown = (fieldName: string) => {
    setDropdownStates(prev => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }));
  };

  const closeAllDropdowns = () => {
    setDropdownStates({});
  };

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: theme.background }}
      >
        <Text
          className="mt-12 text-center text-lg"
          style={{ color: theme.text }}
        >
          {t('formDetail.loading')}
        </Text>
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
        </View>
        <LanguageControl />
      </View>

      <KeyboardAwareScrollView
        // contentContainerStyle={{ padding: 24 }}
        extraScrollHeight={50}
        enableOnAndroid={true}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={closeAllDropdowns}
          className="flex-1"
        >
          <ScrollView className="gap-3 p-6">
            <Text
              className="mb-1 text-3xl font-bold"
              style={{ color: theme.text }}
            >
              {formName}
            </Text>
            <Text className="mb-6 text-base" style={{ color: theme.subtext }}>
              {t('formDetail.subtitle')}
            </Text>
            <View className="flex-col">
              {fields.map((field, index) => {
                const isSelectField =
                  field.fieldtype === 'Select' && field.options;
                const optionsList =
                  isSelectField && field.options
                    ? field.options
                        .split('\n')
                        .filter((opt: string) => opt.trim())
                    : [];
                const isLinkField = field.fieldtype === 'Link' && field.options;
                const isDateField = field.fieldtype === 'Date';
                const isTableField = field.fieldtype === 'Table';
                const isOpen = dropdownStates[field.fieldname] || false;
                const selectedValue = formData[field.fieldname];
                const isNumericField =
                  field.fieldtype === 'Int' || field.fieldtype === 'Float';

                return (
                  <View
                    key={field.fieldname}
                    className="mb-4"
                    style={{ zIndex: 1000 - index }}
                  >
                    <Text
                      className="font-sans text-sm font-medium leading-5 tracking-normal"
                      style={{ color: theme.text }}
                    >
                      {field.label || field.fieldname}
                    </Text>
                    {isSelectField ? (
                      <SelectDropdown
                        options={optionsList}
                        value={selectedValue}
                        onValueChange={value =>
                          handleChange(field.fieldname, value)
                        }
                        placeholder={t('formDetail.selectPlaceholder', {
                          label: field.label || field.fieldname,
                        })}
                        isOpen={isOpen}
                        onToggle={() => toggleDropdown(field.fieldname)}
                        containerZIndex={1000 - index}
                      />
                    ) : isLinkField ? (
                      <LinkDropdown
                        doctype={field.options as string}
                        value={selectedValue}
                        onValueChange={value =>
                          handleChange(field.fieldname, value)
                        }
                        placeholder={t('formDetail.selectPlaceholder', {
                          label: field.label || field.fieldname,
                        })}
                        isOpen={isOpen}
                        onToggle={() => toggleDropdown(field.fieldname)}
                        containerZIndex={1000 - index}
                      />
                    ) : isDateField ? (
                      <DatePicker
                        value={selectedValue}
                        onValueChange={value =>
                          handleChange(field.fieldname, value)
                        }
                        placeholder={t('formDetail.selectPlaceholder', {
                          label: field.label || field.fieldname,
                        })}
                      />
                    ) : isTableField ? (
                      <TableField
                        value={selectedValue}
                        onAddRow={() =>
                          (navigation as any).navigate('TableRowEditor', {
                            fieldname: field.fieldname,
                            tableDoctype: (field.options as string) || '',
                            title: field.label || field.fieldname,
                          })
                        }
                        onEditRow={rowIndex =>
                          (navigation as any).navigate('TableRowEditor', {
                            fieldname: field.fieldname,
                            tableDoctype: (field.options as string) || '',
                            title: field.label || field.fieldname,
                            index: rowIndex,
                            initialRow:
                              Array.isArray(selectedValue) &&
                              selectedValue[rowIndex]
                                ? selectedValue[rowIndex]
                                : null,
                          })
                        }
                        onDeleteRow={async rowIndex => {
                          const current = Array.isArray(selectedValue)
                            ? [...(selectedValue as any[])]
                            : [];
                          if (rowIndex >= 0 && rowIndex < current.length) {
                            current.splice(rowIndex, 1);
                            const updated = {
                              ...formData,
                              [field.fieldname]: current,
                            };
                            setFormData(updated);
                            await AsyncStorage.setItem(
                              'tempFormData',
                              JSON.stringify(updated)
                            );
                          }
                        }}
                      />
                    ) : (
                      <TextInput
                        className="h-[40px] w-full rotate-0 rounded-md border pb-2.5 pl-3 pr-3 pt-2.5 opacity-100"
                        style={{
                          borderColor: theme.border,
                          backgroundColor: theme.background,
                          color: theme.text,
                        }}
                        placeholder={t('formDetail.enterPlaceholder', {
                          label: field.label || field.fieldname,
                        })}
                        placeholderTextColor={theme.subtext}
                        value={formData[field.fieldname] || ''}
                        keyboardType={isNumericField ? 'numeric' : 'default'}
                        onChangeText={text =>
                          handleChange(field.fieldname, text)
                        }
                      />
                    )}
                  </View>
                );
              })}
              <TouchableOpacity
                className="w-full min-w-[80px] items-center justify-center gap-1 rounded-md p-4 opacity-100"
                style={{ backgroundColor: theme.buttonBackground }}
                onPress={handleSubmitConfirmation}
              >
                <Text className="" style={{ color: theme.buttonText }}>
                  {t('formDetail.submit')}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableOpacity>
      </KeyboardAwareScrollView>

      <Modal
        animationType="fade"
        transparent={true}
        visible={confirmModalVisible}
        onRequestClose={() => setConfirmModalVisible(false)}
      >
        <View
          className="flex-1 items-center justify-center p-[1.25rem]"
          style={{ backgroundColor: theme.modalOverlay }}
        >
          <View
            className="h-[176px] w-full max-w-[512px] gap-4 rounded-[6px] border p-6 opacity-100"
            style={{
              backgroundColor: theme.modalBackground,
              borderColor: theme.border,
            }}
          >
            <Text
              className="font-inter text-[18px] font-semibold leading-[28px] tracking-[-0.006em]"
              style={{ color: theme.text }}
            >
              {t('formDetail.confirmSubmission') || 'Confirm Submission'}
            </Text>

            <Text
              className="font-inter text-[14px] font-normal leading-[20px] tracking-normal"
              style={{ color: theme.subtext }}
            >
              {t('formDetail.confirmSubmissionMessage') ||
                'Are you sure you want to submit this form? This action cannot be undone.'}
            </Text>

            <View className="flex-row justify-end gap-3">
              <TouchableOpacity
                className="h-[36px] w-[78px] items-center justify-center gap-2 rounded-md border px-4 opacity-100"
                style={{ borderColor: theme.border }}
                onPress={() => setConfirmModalVisible(false)}
              >
                <Text
                  className="font-inter align-middle text-[14px] font-medium leading-[20px] tracking-[-0.006em]"
                  style={{ color: theme.text }}
                >
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="rounded-lg px-4 py-2.5"
                style={{ backgroundColor: theme.buttonBackground }}
                onPress={handleSubmit}
              >
                <Text
                  className="font-inter align-middle text-[14px] font-medium leading-[20px] tracking-[-0.006em]"
                  style={{ color: theme.buttonText }}
                >
                  {t('common.ok')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default FormDetail;

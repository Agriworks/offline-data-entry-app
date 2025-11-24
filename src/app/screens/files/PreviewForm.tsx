import { ArrowLeft } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  TouchableOpacity,
  View,
  Text,
  TextInput,
  ScrollView,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import LanguageControl from '../../components/LanguageControl';
import SelectDropdown from '../../components/SelectDropdown';
import LinkDropdown from '../../components/LinkDropdown';
import DatePicker from '../../components/DatePicker';
import TableField from '../../components/TableField';
import { useTranslation } from 'react-i18next';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { SubmissionItem, RawField } from '../../../types';
import { getQueue, removeFromQueue } from '../../pendingQueue';
import { FormStackParamList } from '@/app/navigation/FormStackParamList';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../../context/ThemeContext';
import { extractFields, getDocTypeFromLocal } from '../../../api';
import { usePendingFormsExport } from '../../../hooks/usePendingFormsExport';

type PreviewFormRouteProp = RouteProp<FormStackParamList, 'PreviewForm'>;
type PreviewFormNavigationProp = NativeStackNavigationProp<
  FormStackParamList,
  'PreviewForm'
>;

function PreviewForm() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { exportPendingForms, isExporting } = usePendingFormsExport();

  const deleteButtonStyle = {
    backgroundColor: theme.deleteButton,
  };
  const route = useRoute<PreviewFormRouteProp>();
  const navigation = useNavigation<PreviewFormNavigationProp>();

  // State for form data
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submissionItem, setSubmissionItem] = useState<SubmissionItem | null>(
    null
  );
  const [formFields, setFormFields] = useState<RawField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [dropdownStates, setDropdownStates] = useState<Record<string, boolean>>(
    {}
  );
  const [tableSchemas, setTableSchemas] = useState<
    Record<string, RawField[] | null>
  >({});

  // Get the formId from route params
  const { formId } = route.params;

  const fetchTableSchema = useCallback(
    async (tableDoctype: string): Promise<RawField[] | null> => {
      const normalized = tableDoctype?.trim();
      if (!normalized) {
        return null;
      }

      const cached = await getDocTypeFromLocal(normalized);
      if (cached?.fields) {
        return extractFields(cached);
      }
      console.warn('Table schema not found in local cache:', normalized);
      return null;
    },
    []
  );

  const loadTableSchemas = useCallback(
    async (fields: RawField[]) => {
      if (!fields || fields.length === 0) {
        setTableSchemas({});
        return;
      }
      const tableFields = fields.filter(
        field => field.fieldtype === 'Table' && field.options
      );
      if (tableFields.length === 0) {
        setTableSchemas({});
        return;
      }
      const schemaEntries = await Promise.all(
        tableFields.map(async field => {
          const schema = await fetchTableSchema(field.options as string);
          return [field.fieldname, schema] as [string, RawField[] | null];
        })
      );
      const updated: Record<string, RawField[] | null> = {};
      schemaEntries.forEach(([fieldname, schema]) => {
        updated[fieldname] = schema;
      });
      setTableSchemas(updated);
    },
    [fetchTableSchema]
  );

  // Fetch form schema using form name
  const fetchFormSchema = useCallback(
    async (formName: string) => {
      try {
        console.log('Fetching form schema for:', formName);

        const normalized = formName?.trim();
        if (!normalized) {
          setFormFields([]);
          setTableSchemas({});
          return;
        }

        const cached = await getDocTypeFromLocal(normalized);
        if (cached?.fields) {
          const fields = extractFields(cached);
          setFormFields(fields);
          await loadTableSchemas(fields);
        } else {
          console.warn('No cached form schema found for:', normalized);
          setFormFields([]);
          setTableSchemas({});
        }
      } catch (error) {
        console.error('Error fetching form schema:', error);
        setFormFields([]);
        setTableSchemas({});
      }
    },
    [loadTableSchemas]
  );

  const loadFormData = useCallback(async () => {
    try {
      console.log('Loading form data for formId:', formId);
      setIsLoading(true);
      const queue = await getQueue();
      console.log('Queue data:', queue);

      const foundForm = queue.find(
        (item: SubmissionItem) => item.id === formId
      );
      console.log('Found form:', foundForm);

      if (foundForm) {
        setSubmissionItem(foundForm);
        setFormData(foundForm.data || {});
        console.log('Form data set:', foundForm.data);

        // Fetch form schema using form name
        await fetchFormSchema(foundForm.formName);
      } else {
        console.error('Form not found with ID:', formId);
      }
    } catch (error) {
      console.error('Error loading form data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [formId, fetchFormSchema]);

  useEffect(() => {
    console.log('PreviewForm mounted with formId:', formId);
    console.log('Route params:', route.params);
    console.log('All route data:', route);
    loadFormData();
  }, [formId, loadFormData, route]);

  // Apply table row edits created in TableRowEditor (similar to FormDetail)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
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
          return { ...prev, [parsed.fieldname]: current };
        });
      } catch {
        // ignore parse/storage errors
      }
    });
    return unsubscribe;
  }, [navigation]);

  const handleChange = (fieldName: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value,
    }));
    // Close dropdown after selection
    if (dropdownStates[fieldName]) {
      setDropdownStates(prev => ({
        ...prev,
        [fieldName]: false,
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

  // Close dropdowns when any other area is touched
  const handleOutsidePress = () => {
    closeAllDropdowns();
  };

  const handleSubmitConfirmation = () => {
    setConfirmModalVisible(true);
  };

  const handleDeleteConfirmation = () => {
    setDeleteModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      // Add your submission logic here
      console.log('Submitting form:', submissionItem);
      setConfirmModalVisible(false);
      navigation.goBack();
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  };

  const handleDelete = async () => {
    try {
      if (!submissionItem) {
        return;
      }
      console.log('Deleting form:', submissionItem);
      await removeFromQueue(submissionItem.id);
      console.log('Form deleted successfully');
      setDeleteModalVisible(false);
      navigation.goBack();
    } catch (error) {
      console.error('Error deleting form:', error);
    }
  };

  if (isLoading) {
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
              {t('common.loading')}
            </Text>
          </View>
          <LanguageControl />
        </View>
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: theme.subtext }}>
            {t('previewForm.loadingForm')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!submissionItem) {
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
              {t('common.error')}
            </Text>
          </View>
          <LanguageControl />
        </View>
        <View className="flex-1 items-center justify-center">
          <Text className="mb-4 text-center" style={{ color: theme.subtext }}>
            {t('previewForm.formNotFound')}
          </Text>
          <Text className="mb-4 text-center" style={{ color: theme.subtext }}>
            {t('previewForm.formId')}: {formId}
          </Text>
          <TouchableOpacity
            className="mt-4 rounded px-4 py-2"
            style={{ backgroundColor: theme.buttonBackground }}
            onPress={() => navigation.goBack()}
          >
            <Text style={{ color: theme.buttonText }}>
              {t('previewForm.goBack')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const formName = submissionItem.formName || 'Form Preview';

  // Create fields from the form schema if available, otherwise fallback to form data keys
  // Filter out hidden fields and only show input fieldtypes (same as FormDetail)
  const allowedFieldTypes = [
    'Data',
    'Select',
    'Text',
    'Int',
    'Float',
    'Link',
    'Date',
    'Table',
  ];
  const fieldsToRender =
    formFields.length > 0
      ? formFields
          .filter(field => {
            // Skip if hidden, print_hide, or report_hide is true (value is 1 or truthy)
            if (field.hidden || field.print_hide || field.report_hide) {
              return false;
            }
            return allowedFieldTypes.includes(field.fieldtype || 'Data');
          })
          .map(field => ({
            fieldname: field.fieldname,
            label:
              field.label ||
              field.fieldname.charAt(0).toUpperCase() +
                field.fieldname.slice(1).replace(/([A-Z])/g, ' $1'),
            fieldtype: field.fieldtype || 'Data',
            options: field.options,
            value: formData[field.fieldname],
          }))
      : Object.keys(formData).map(key => ({
          fieldname: key,
          label:
            key.charAt(0).toUpperCase() +
            key.slice(1).replace(/([A-Z])/g, ' $1'),
          fieldtype: typeof formData[key] === 'boolean' ? 'Check' : 'Data',
          options: undefined,
          value: formData[key],
        }));

  // Helper function to render field based on type
  const renderField = (field: any, index: number = 0) => {
    const { fieldname, label, fieldtype, options, value } = field;
    const isOpen = dropdownStates[fieldname] || false;

    switch (fieldtype) {
      case 'Select':
        if (options) {
          const optionsList = options
            .split('\n')
            .filter((opt: string) => opt.trim());

          return (
            <View
              key={fieldname}
              className="mb-4"
              style={{ zIndex: 1000 - index }}
            >
              <Text
                className="font-sans text-sm font-medium leading-5 tracking-normal"
                style={{ color: theme.text }}
              >
                {label}
              </Text>
              <SelectDropdown
                options={optionsList}
                value={value}
                onValueChange={val => handleChange(fieldname, val)}
                placeholder={t('formDetail.selectPlaceholder', {
                  label: label,
                })}
                isOpen={isOpen}
                onToggle={() => toggleDropdown(fieldname)}
                containerZIndex={1000 - index}
              />
            </View>
          );
        }
        // Fallback to text input if no options
        return (
          <View key={fieldname} className="mb-4">
            <Text
              className="font-sans text-sm font-medium leading-5 tracking-normal"
              style={{ color: theme.text }}
            >
              {label}
            </Text>
            <TextInput
              className="h-[40px] w-full rotate-0 rounded-md border pb-2.5 pl-3 pr-3 pt-2.5 opacity-100"
              style={{
                borderColor: theme.border,
                backgroundColor: theme.background,
                color: theme.text,
              }}
              placeholder={label}
              placeholderTextColor={theme.subtext}
              value={String(value || '')}
              onChangeText={text => handleChange(fieldname, text)}
              editable={true}
            />
          </View>
        );

      case 'Link':
        if (options) {
          return (
            <View
              key={fieldname}
              className="mb-4"
              style={{ zIndex: 1000 - index }}
            >
              <Text
                className="font-sans text-sm font-medium leading-5 tracking-normal"
                style={{ color: theme.text }}
              >
                {label}
              </Text>
              <LinkDropdown
                doctype={options as string}
                value={value}
                onValueChange={val => handleChange(fieldname, val)}
                placeholder={t('formDetail.selectPlaceholder', {
                  label: label,
                })}
                isOpen={isOpen}
                onToggle={() => toggleDropdown(fieldname)}
                containerZIndex={1000 - index}
              />
            </View>
          );
        }
        // Fallback to text input if no doctype
        return (
          <View key={fieldname} className="mb-4">
            <Text
              className="font-sans text-sm font-medium leading-5 tracking-normal"
              style={{ color: theme.text }}
            >
              {label}
            </Text>
            <TextInput
              className="h-[40px] w-full rotate-0 rounded-md border pb-2.5 pl-3 pr-3 pt-2.5 opacity-100"
              style={{
                borderColor: theme.border,
                backgroundColor: theme.background,
                color: theme.text,
              }}
              placeholder={label}
              placeholderTextColor={theme.subtext}
              value={String(value || '')}
              onChangeText={text => handleChange(fieldname, text)}
              editable={true}
            />
          </View>
        );

      case 'Date':
        return (
          <View key={fieldname} className="mb-4">
            <Text
              className="font-sans text-sm font-medium leading-5 tracking-normal"
              style={{ color: theme.text }}
            >
              {label}
            </Text>
            <DatePicker
              value={value}
              onValueChange={val => handleChange(fieldname, val)}
              placeholder={t('formDetail.selectPlaceholder', {
                label: label,
              })}
            />
          </View>
        );

      case 'Check':
        const checkBoxStyle = {
          backgroundColor: value ? theme.buttonBackground : 'transparent',
          borderColor: value ? theme.buttonBackground : theme.border,
        };
        return (
          <View key={fieldname} className="mb-4">
            <TouchableOpacity
              className="flex-row items-center"
              onPress={() => handleChange(fieldname, !value)}
            >
              <View
                className="mr-3 flex h-5 w-5 items-center justify-center rounded border-2"
                style={checkBoxStyle}
              >
                {value && (
                  <Text className="text-xs" style={{ color: theme.buttonText }}>
                    ✓
                  </Text>
                )}
              </View>
              <Text
                className="font-sans text-sm font-medium leading-5 tracking-normal"
                style={{ color: theme.text }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          </View>
        );

      case 'Text':
        return (
          <View key={fieldname} className="mb-4">
            <Text
              className="font-sans text-sm font-medium leading-5 tracking-normal"
              style={{ color: theme.text }}
            >
              {label}
            </Text>
            <TextInput
              className="min-h-[80px] w-full rotate-0 rounded-md border pb-2.5 pl-3 pr-3 pt-2.5 opacity-100"
              style={{
                borderColor: theme.border,
                backgroundColor: theme.background,
                color: theme.text,
              }}
              placeholder={label}
              placeholderTextColor={theme.subtext}
              value={String(value || '')}
              onChangeText={text => handleChange(fieldname, text)}
              multiline={true}
              textAlignVertical="top"
              editable={true}
            />
          </View>
        );

      case 'Table': {
        const tableSchema = tableSchemas[fieldname];
        return (
          <View key={fieldname} className="mb-4">
            <Text
              className="font-sans text-sm font-medium leading-5 tracking-normal"
              style={{ color: theme.text }}
            >
              {label}
            </Text>
            <TableField
              value={value}
              onAddRow={undefined}
              onEditRow={rowIndex =>
                // @ts-ignore
                (navigation as any).navigate('TableRowEditor', {
                  fieldname,
                  tableDoctype: (options as string) || '',
                  title: label,
                  index: rowIndex,
                  initialRow:
                    Array.isArray(value) && value[rowIndex]
                      ? value[rowIndex]
                      : null,
                  schema: tableSchema || undefined,
                })
              }
              onDeleteRow={rowIndex => {
                const current = Array.isArray(value)
                  ? [...(value as any[])]
                  : [];
                if (rowIndex >= 0 && rowIndex < current.length) {
                  current.splice(rowIndex, 1);
                  handleChange(
                    fieldname,
                    current as unknown as string | boolean
                  );
                }
              }}
            />
          </View>
        );
      }

      default:
        // Default to regular text input
        return (
          <View key={fieldname} className="mb-4">
            <Text
              className="font-sans text-sm font-medium leading-5 tracking-normal"
              style={{ color: theme.text }}
            >
              {label}
            </Text>
            <TextInput
              className="h-[40px] w-full rotate-0 rounded-md border pb-2.5 pl-3 pr-3 pt-2.5 opacity-100"
              style={{
                borderColor: theme.border,
                backgroundColor: theme.background,
                color: theme.text,
              }}
              placeholder={label}
              placeholderTextColor={theme.subtext}
              value={String(value || '')}
              onChangeText={text => handleChange(fieldname, text)}
              editable={true}
            />
          </View>
        );
    }
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
        <TouchableOpacity className="p-2" onPress={() => navigation.goBack()}>
          <ArrowLeft color={theme.text} size={16} />
        </TouchableOpacity>
        <View className="flex-1 items-center">
          <Text
            className="font-inter text-center text-[18px] font-semibold leading-[32px] tracking-[-0.006em]"
            style={{ color: theme.text }}
          >
            {t('previewForm.title')}
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
          onPress={handleOutsidePress}
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
              {t('previewForm.subtitle')}
            </Text>

            <View className="flex-col">
              {fieldsToRender.map((field, index) => renderField(field, index))}
              <TouchableOpacity
                className="mt-4 w-full min-w-[80px] items-center justify-center gap-1 rounded-md border p-4"
                style={{
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                  opacity: isExporting ? 0.6 : 1,
                }}
                disabled={isExporting}
                onPress={exportPendingForms}
              >
                <Text style={{ color: theme.text }}>
                  {isExporting
                    ? t('common.loading')
                    : t('settings.exportPendingForms')}
                </Text>
              </TouchableOpacity>
              <View className="mt-8 flex flex-col gap-3">
                <TouchableOpacity
                  className="w-full min-w-[80px] items-center justify-center gap-1 rounded-md p-4 opacity-100"
                  style={{ backgroundColor: theme.buttonBackground }}
                  onPress={handleSubmitConfirmation}
                >
                  <Text style={{ color: theme.buttonText }}>
                    {t('formDetail.submit')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="w-full min-w-[80px] items-center justify-center gap-1 rounded-md p-4 opacity-100"
                  style={deleteButtonStyle}
                  onPress={handleDeleteConfirmation}
                >
                  <Text className="text-white">
                    {t('formDetail.deleteForm')}
                  </Text>
                </TouchableOpacity>
              </View>
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
              {t('formDetail.confirmSubmission')}
            </Text>

            <Text
              className="font-inter text-[14px] font-normal leading-[20px] tracking-normal"
              style={{ color: theme.subtext }}
            >
              {t('formDetail.confirmSubmissionMessage')}
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

      <Modal
        animationType="fade"
        transparent={true}
        visible={deleteModalVisible}
        onRequestClose={() => setDeleteModalVisible(false)}
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
              {t('previewForm.deleteThisForm')}
            </Text>

            <Text
              className="font-inter text-[14px] font-normal leading-[20px] tracking-normal"
              style={{ color: theme.subtext }}
            >
              {t('previewForm.confirmDeleteMessage', { formName: formName })}
            </Text>

            <View className="flex-row justify-end gap-3">
              <TouchableOpacity
                className="h-[36px] w-[78px] items-center justify-center gap-2 rounded-md border px-4 opacity-100"
                style={{ borderColor: theme.border }}
                onPress={() => setDeleteModalVisible(false)}
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
                style={deleteButtonStyle}
                onPress={handleDelete}
              >
                <Text className="font-inter align-middle text-[14px] font-medium leading-[20px] tracking-[-0.006em] text-white">
                  {t('common.delete')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
export default PreviewForm;

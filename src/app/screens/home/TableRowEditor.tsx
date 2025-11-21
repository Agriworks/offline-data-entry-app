import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import {
  ensureDoctypeGraph,
  extractFields,
  getDocTypeFromLocal,
} from '../../../api';
import { RawField, DocType } from '../../../types';
import SelectDropdown from '../../components/SelectDropdown';
import LinkDropdown from '../../components/LinkDropdown';
import DatePicker from '../../components/DatePicker';
import { useNetwork } from '../../../context/NetworkProvider';

type TableRowEditorRouteParams = {
  fieldname: string;
  tableDoctype: string;
  title?: string;
  index?: number; // when editing existing row
  initialRow?: Record<string, any> | null;
  schema?: RawField[] | null;
};

type Route = RouteProp<
  Record<'TableRowEditor', TableRowEditorRouteParams>,
  'TableRowEditor'
>;

const TableRowEditor: React.FC = () => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const route = useRoute<Route>();
  const navigation = useNavigation();
  const { isConnected } = useNetwork();
  const { fieldname, tableDoctype, index, initialRow, title, schema } =
    route.params;

  const [fields, setFields] = useState<RawField[]>([]);
  const [rowData, setRowData] = useState<Record<string, any>>(initialRow || {});
  const [loading, setLoading] = useState<boolean>(true);
  const [dropdownStates, setDropdownStates] = useState<Record<string, boolean>>(
    {}
  );

  const loadSchema = useCallback(async () => {
    setLoading(true);
    try {
      const ensureResult = await ensureDoctypeGraph(tableDoctype, {
        networkAvailable: Boolean(isConnected),
      });

      if (ensureResult.skipped.length > 0) {
        console.warn(
          'Some doctypes were skipped due to offline mode in TableRowEditor:',
          ensureResult.skipped
        );
      }
      if (ensureResult.errors.length > 0) {
        console.error('Errors ensuring table doctypes:', ensureResult.errors);
      }

      const docType: DocType | null = await getDocTypeFromLocal(tableDoctype);

      let f: RawField[] | null = null;
      if (docType && docType.fields) {
        f = extractFields(docType);
      }

      // Allow same basic input types in row editor
      const allowed = [
        'Data',
        'Select',
        'Text',
        'Int',
        'Float',
        'Link',
        'Date',
      ];

      if (f && f.length > 0) {
        setFields(
          f.filter(
            x =>
              !x.hidden &&
              !x.print_hide &&
              !x.report_hide &&
              allowed.includes(x.fieldtype)
          )
        );
      } else if (initialRow && Object.keys(initialRow).length > 0) {
        // Fallback: derive fields from existing row keys
        const derived: RawField[] = Object.keys(initialRow).map(k => ({
          fieldname: k,
          label: k,
          fieldtype: 'Data',
          options: '',
          hidden: 0 as any,
          print_hide: 0 as any,
          report_hide: 0 as any,
        }));
        setFields(derived);
      } else {
        // Last resort: no schema and no initial row; keep empty form
        setFields([]);
      }
    } finally {
      setLoading(false);
    }
  }, [tableDoctype, initialRow, isConnected]);

  useEffect(() => {
    if (schema && schema.length > 0) {
      const allowed = [
        'Data',
        'Select',
        'Text',
        'Int',
        'Float',
        'Link',
        'Date',
      ];
      setFields(
        schema.filter(
          x =>
            !x.hidden &&
            !x.print_hide &&
            !x.report_hide &&
            allowed.includes(x.fieldtype)
        )
      );
      setLoading(false);
    } else {
      loadSchema();
    }
  }, [schema, loadSchema]);

  const handleChange = (name: string, value: any) => {
    setRowData(prev => ({ ...prev, [name]: value }));
    // Close dropdown after selection
    if (dropdownStates[name]) {
      setDropdownStates(prev => ({
        ...prev,
        [name]: false,
      }));
    }
  };
  const toggleDropdown = (name: string) => {
    setDropdownStates(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleSave = async () => {
    try {
      // return row back to FormDetail via temp storage
      await AsyncStorage.setItem(
        'tableRowDraft',
        JSON.stringify({
          fieldname,
          index: typeof index === 'number' ? index : null,
          row: rowData,
        })
      );
      // @ts-ignore
      navigation.goBack();
    } catch {
      Alert.alert(t('common.error'), 'Failed to save row');
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: theme.background }}
      >
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: theme.subtext }}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: theme.background }}
    >
      <View
        className="border-b px-4 py-3 pt-10"
        style={{ borderBottomColor: theme.border }}
      >
        <Text className="text-xl font-semibold" style={{ color: theme.text }}>
          {title || tableDoctype}
        </Text>
      </View>
      <ScrollView className="flex-1 p-4">
        {fields.map((field, idx) => {
          const isSelectField = field.fieldtype === 'Select' && field.options;
          const optionsList =
            isSelectField && field.options
              ? field.options.split('\n').filter((opt: string) => opt.trim())
              : [];
          const isLinkField = field.fieldtype === 'Link' && field.options;
          const isDateField = field.fieldtype === 'Date';
          const value = rowData[field.fieldname];
          const isNumeric =
            field.fieldtype === 'Int' || field.fieldtype === 'Float';
          const isOpen = dropdownStates[field.fieldname] || false;
          return (
            <View
              key={field.fieldname}
              className="mb-4"
              style={{ zIndex: 1000 - idx }}
            >
              <Text className="mb-1" style={{ color: theme.text }}>
                {field.label || field.fieldname}
              </Text>
              {isSelectField ? (
                <SelectDropdown
                  options={optionsList}
                  value={value}
                  onValueChange={val => handleChange(field.fieldname, val)}
                  placeholder={t('formDetail.selectPlaceholder', {
                    label: field.label || field.fieldname,
                  })}
                  isOpen={isOpen}
                  onToggle={() => toggleDropdown(field.fieldname)}
                />
              ) : isLinkField ? (
                <LinkDropdown
                  doctype={field.options as string}
                  value={value}
                  onValueChange={val => handleChange(field.fieldname, val)}
                  placeholder={t('formDetail.selectPlaceholder', {
                    label: field.label || field.fieldname,
                  })}
                  isOpen={isOpen}
                  onToggle={() => toggleDropdown(field.fieldname)}
                />
              ) : isDateField ? (
                <DatePicker
                  value={value}
                  onValueChange={val => handleChange(field.fieldname, val)}
                  placeholder={t('formDetail.selectPlaceholder', {
                    label: field.label || field.fieldname,
                  })}
                />
              ) : (
                <TextInput
                  className="h-[40px] w-full rounded-md border px-3"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                    color: theme.text,
                  }}
                  value={value || ''}
                  placeholder={t('formDetail.enterPlaceholder', {
                    label: field.label || field.fieldname,
                  })}
                  placeholderTextColor={theme.subtext}
                  keyboardType={isNumeric ? 'numeric' : 'default'}
                  onChangeText={text => handleChange(field.fieldname, text)}
                />
              )}
            </View>
          );
        })}
        <View className="mt-2 flex-row gap-3">
          <TouchableOpacity
            className="flex-1 items-center justify-center rounded-md border p-4"
            style={{
              borderColor: theme.border,
              backgroundColor: theme.background,
            }}
            onPress={() => navigation.goBack()}
          >
            <Text style={{ color: theme.text }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 items-center justify-center rounded-md p-4"
            style={{ backgroundColor: theme.buttonBackground }}
            onPress={handleSave}
          >
            <Text style={{ color: theme.buttonText }}>{t('common.save')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default TableRowEditor;

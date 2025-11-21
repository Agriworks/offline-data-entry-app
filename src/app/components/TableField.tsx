import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react-native';

type TableFieldProps = {
  value?: unknown;
  onAddRow?: () => void;
  onEditRow?: (index: number) => void;
  onDeleteRow?: (index: number) => void;
};

const TableField: React.FC<TableFieldProps> = ({
  value,
  onAddRow,
  onEditRow,
  onDeleteRow,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const rowsCount =
    Array.isArray(value) && typeof value.length === 'number' ? value.length : 0;
  const rows = Array.isArray(value) ? (value as unknown[]) : [];

  const containerStyle = {
    borderColor: theme.border,
    backgroundColor: theme.cardBackground,
  };
  const noticeTextStyle = { color: theme.subtext };
  const emptyTextStyle = { color: theme.subtext };
  const rowBoxStyle = {
    borderColor: theme.border,
    backgroundColor: theme.background,
  };
  const rowTitleTextStyle = { color: theme.text };
  const addButtonStyle = { backgroundColor: theme.buttonBackground };
  const addButtonTextStyle = { color: theme.buttonText };

  return (
    <View className="w-full rounded-md border p-3" style={containerStyle}>
      <Text className="mb-1 text-xs" style={noticeTextStyle}>
        {t('formDetail.tableFieldNotice') || 'Manage table rows below.'}
      </Text>
      {rowsCount > 0 ? (
        <View>
          <View className="mt-2 gap-2">
            {rows.map((row, index) => {
              const label =
                t('formDetail.rowLabel', { index: index + 1 }) ||
                `Row ${index + 1}`;
              return (
                <View
                  key={index}
                  className="rounded-md border p-2"
                  style={rowBoxStyle}
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="font-medium" style={rowTitleTextStyle}>
                      {label}
                    </Text>
                    <View className="flex-row items-center">
                      {onEditRow && (
                        <TouchableOpacity
                          className="mr-2 rounded-md px-2 py-1"
                          onPress={() => onEditRow(index)}
                          accessibilityLabel={t('common.edit') || 'Edit'}
                        >
                          <Pencil size={16} color={theme.text} />
                        </TouchableOpacity>
                      )}
                      {onDeleteRow && (
                        <TouchableOpacity
                          className="rounded-md px-2 py-1"
                          onPress={() => onDeleteRow(index)}
                          accessibilityLabel={t('common.delete') || 'Delete'}
                        >
                          <Trash2 size={16} color={theme.text} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
          {onAddRow && (
            <TouchableOpacity
              className="mt-3 self-start rounded-md px-3 py-2"
              style={addButtonStyle}
              onPress={onAddRow}
            >
              <Text style={addButtonTextStyle}>
                {t('formDetail.addRow') || 'Add row'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View>
          <Text style={emptyTextStyle}>
            {t('formDetail.noRows') || 'No rows'}
          </Text>
          <TouchableOpacity
            className="mt-2 self-start rounded-md px-3 py-2"
            style={addButtonStyle}
            onPress={() => {
              if (onAddRow) {
                onAddRow();
              }
            }}
          >
            <Text style={addButtonTextStyle}>
              {t('formDetail.addRow') || 'Add row'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export default TableField;

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Platform,
  StyleSheet,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';

interface DatePickerProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder: string;
}

const styles = StyleSheet.create({
  iosModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  iosModalSheet: {
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  iosModalSpacer: {
    flex: 1,
  },
});

const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onValueChange,
  placeholder,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseDateValue = (dateValue: any) => {
    if (!dateValue) {
      return new Date();
    }
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }
    return parsed;
  };

  const formatDisplayDate = (dateValue: any) => {
    if (!dateValue) {
      return '';
    }
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) {
      return dateValue;
    }
    return parsed.toLocaleDateString();
  };

  const showDatePicker = () => {
    const initialDate = parseDateValue(value);

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initialDate,
        mode: 'date',
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if (event.type === 'dismissed' || !selectedDate) {
            return;
          }
          onValueChange(formatDate(selectedDate));
        },
      });
    } else {
      setTempDate(initialDate);
      setDatePickerVisible(true);
    }
  };

  const handleIOSDateChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date
  ) => {
    if (selectedDate) {
      setTempDate(selectedDate);
    }
  };

  const confirmIOSDate = () => {
    onValueChange(formatDate(tempDate));
    setDatePickerVisible(false);
  };

  const cancelIOSDate = () => {
    setDatePickerVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        className="h-[40px] w-full flex-row items-center justify-between rounded-md border px-3"
        style={{
          borderColor: theme.border,
          backgroundColor: theme.background,
        }}
        onPress={showDatePicker}
      >
        <Text
          style={{
            color: value ? theme.text : theme.subtext,
          }}
        >
          {value ? formatDisplayDate(value) : placeholder}
        </Text>
      </TouchableOpacity>

      {Platform.OS === 'ios' && datePickerVisible && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={true}
          onRequestClose={cancelIOSDate}
        >
          <View
            style={[
              styles.iosModalContainer,
              { backgroundColor: theme.modalOverlay },
            ]}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={cancelIOSDate}
              style={styles.iosModalSpacer}
            />
            <View
              style={[
                styles.iosModalSheet,
                { backgroundColor: theme.modalBackground },
              ]}
            >
              <DateTimePicker
                mode="date"
                display="spinner"
                value={tempDate}
                onChange={handleIOSDateChange}
              />
              <View className="mt-4 flex-row justify-end gap-3">
                <TouchableOpacity onPress={cancelIOSDate}>
                  <Text style={{ color: theme.subtext }}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmIOSDate}>
                  <Text style={{ color: theme.buttonText }}>
                    {t('common.ok')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
};

export default DatePicker;

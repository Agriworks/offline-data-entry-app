import { ChevronDown } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface SelectDropdownProps {
  options: string[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  isOpen: boolean;
  onToggle: () => void;
  containerZIndex?: number;
  dependsOn?: string;
  formData?: Record<string, any>;
}

const SelectDropdown: React.FC<SelectDropdownProps> = ({
  options,
  value,
  onValueChange,
  placeholder,
  isOpen,
  onToggle,
  containerZIndex,
  dependsOn,
  formData,
}) => {
  const { theme } = useTheme();

  const containerStyle = {
    position: 'relative' as const,
    zIndex: containerZIndex,
  };

  const dropdownStyle = {
    position: 'absolute' as const,
    top: 45,
    left: 0,
    right: 0,
    zIndex: 2000,
    backgroundColor: theme.dropdownBg,
    borderWidth: 1.5,
    borderColor: theme.border,
    borderRadius: 8,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 20,
    maxHeight: 250,
  };

  const scrollViewStyle = {
    maxHeight: 250,
  };

  // 🔥 Compute disabled state
  const isDisabled = React.useMemo(() => {
    if (!dependsOn) return false;

    if (dependsOn.startsWith('eval:doc.')) {
      const regex = /^eval:doc\.([a-zA-Z0-9_]+)\s*==\s*["'](.+)["']$/;
      const match = dependsOn.match(regex);

      if (match && formData) {
        const [_, fieldName, expectedValue] = match;
        return formData[fieldName] !== expectedValue;
      }
      return true;
    }

    return false;
  }, [dependsOn, formData]);

  // 🔄 Reset value when it becomes disabled
  useEffect(() => {
    if (isDisabled && value !== "") {
      onValueChange("");
    }
  }, [isDisabled, value]);

  return (
    <View style={containerStyle}>
      {/* Dropdown Toggle Button */}
      <TouchableOpacity
        className="h-[40px] w-full flex-row items-center justify-between rounded-md border px-3"
        style={{
          borderColor: theme.border,
          backgroundColor: isDisabled ? '#373737ff' : theme.background,
          opacity: isDisabled ? 0.5 : 1,
        }}
        onPress={() => {
          if (!isDisabled) onToggle(); // prevent opening when disabled
        }}
      >
        <Text
          className="flex-1"
          style={{
            color: isDisabled ? theme.subtext : (value ? theme.text : theme.subtext),
          }}
        >
          {value || placeholder}
        </Text>

        <ChevronDown
          size={16}
          color={theme.subtext}
          style={{
            transform: [{ rotate: isOpen ? '180deg' : '0deg' }],
          }}
        />
      </TouchableOpacity>

      {/* Dropdown Options - Always render structure, only open if isOpen */}
      {isOpen && (
        <View style={dropdownStyle}>
          <ScrollView nestedScrollEnabled={true} style={scrollViewStyle}>
            {options.length > 0 ? (
              options.map((option: string, optIndex: number) => {
                const trimmedOption = option.trim();
                const isSelected = value === trimmedOption;

                return (
                  <TouchableOpacity
                    key={optIndex}
                    className={`px-4 py-3 ${optIndex < options.length - 1 ? 'border-b' : ''}`}
                    style={{
                      backgroundColor: isSelected
                        ? theme.dropdownSelectedBg
                        : theme.dropdownBg,
                      borderBottomColor:
                        optIndex < options.length - 1 ? theme.border : undefined,
                    }}
                    onPress={() => {
                      if (!isDisabled) onValueChange(trimmedOption);
                    }}
                  >
                    <Text
                      style={{
                        color: theme.text,
                        fontWeight: isSelected ? '600' : 'normal',
                      }}
                    >
                      {trimmedOption}
                    </Text>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View className="px-4 py-6">
                <Text
                  className="text-center text-sm"
                  style={{ color: theme.subtext }}
                >
                  No options available
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

export default SelectDropdown;

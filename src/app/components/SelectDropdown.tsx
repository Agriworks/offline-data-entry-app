import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

interface SelectDropdownProps {
  options: string[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  isOpen: boolean;
  onToggle: () => void;
  containerZIndex?: number;
}

const SelectDropdown: React.FC<SelectDropdownProps> = ({
  options,
  value,
  onValueChange,
  placeholder,
  isOpen,
  onToggle,
  containerZIndex,
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

  return (
    <View style={containerStyle}>
      {/* Dropdown Toggle Button */}
      <TouchableOpacity
        className="h-[40px] w-full flex-row items-center justify-between rounded-md border px-3"
        style={{
          borderColor: theme.border,
          backgroundColor: theme.background,
        }}
        onPress={onToggle}
      >
        <Text
          className="flex-1"
          style={{
            color: value ? theme.text : theme.subtext,
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

      {/* Dropdown Options */}
      {isOpen && (
        <View style={dropdownStyle}>
          {/* Options List */}
          <ScrollView nestedScrollEnabled={true} style={scrollViewStyle}>
            {options.length > 0 ? (
              options.map((option: string, optIndex: number) => {
                const trimmedOption = option.trim();
                const isSelected = value === trimmedOption;
                const fontWeight = isSelected
                  ? ('600' as const)
                  : ('normal' as const);
                return (
                  <TouchableOpacity
                    key={optIndex}
                    className={`px-4 py-3 ${optIndex < options.length - 1 ? 'border-b' : ''}`}
                    style={{
                      backgroundColor: isSelected
                        ? theme.dropdownSelectedBg
                        : theme.dropdownBg,
                      borderBottomColor:
                        optIndex < options.length - 1
                          ? theme.border
                          : undefined,
                    }}
                    onPress={() => {
                      onValueChange(trimmedOption);
                    }}
                  >
                    <Text
                      style={{
                        color: theme.text,
                        fontWeight,
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

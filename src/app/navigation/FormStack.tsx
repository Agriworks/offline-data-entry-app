// src/navigation/FilesStack.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Forms from '../screens/files/Forms';
import PreviewForm from '../screens/files/PreviewForm';
import TableRowEditor from '../screens/home/TableRowEditor';

const Stack = createNativeStackNavigator();

export default function FilesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Forms" component={Forms} />
      <Stack.Screen name="PreviewForm" component={PreviewForm} />
      <Stack.Screen name="TableRowEditor" component={TableRowEditor} />
    </Stack.Navigator>
  );
}

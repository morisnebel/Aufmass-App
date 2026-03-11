import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, LogBox } from 'react-native';
import { KeyboardDismissButton } from '../components/KeyboardDismissButton';

// Ignore canvas render warnings from pdf.js in WebView
LogBox.ignoreLogs([
  'PDF Error:',
  'Cannot use the same canvas',
  'RenderingCancelledException',
]);

export default function RootLayout() {
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#1976d2',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="index" 
          options={{ 
            title: 'AUFMASSPROFI - DACH',
            headerShown: true
          }} 
        />
        <Stack.Screen 
          name="customers" 
          options={{ title: 'Kunden' }} 
        />
        <Stack.Screen 
          name="customers/new" 
          options={{ title: 'Neuer Kunde' }} 
        />
        <Stack.Screen 
          name="customers/[id]" 
          options={{ title: 'Kunde bearbeiten' }} 
        />
        <Stack.Screen 
          name="projects/new" 
          options={{ title: 'Neues Projekt' }} 
        />
        <Stack.Screen 
          name="projects/[id]" 
          options={{ title: 'Projektdetails' }} 
        />
        <Stack.Screen 
          name="roofs/new" 
          options={{ title: 'Neue Dachmessung' }} 
        />
        <Stack.Screen 
          name="photos/new" 
          options={{ title: 'Foto hinzufügen' }} 
        />
        <Stack.Screen 
          name="photos/annotate" 
          options={{ title: 'Foto bearbeiten' }} 
        />
        <Stack.Screen 
          name="sketches/draw" 
          options={{ title: 'Skizze zeichnen', headerShown: false }} 
        />
        <Stack.Screen 
          name="sketches/new" 
          options={{ title: 'Neue Skizze', headerShown: false }} 
        />
        <Stack.Screen 
          name="checklists/templates" 
          options={{ title: 'Checklisten-Vorlagen' }} 
        />
        <Stack.Screen 
          name="checklists/new" 
          options={{ title: 'Neue Checkliste' }} 
        />
        <Stack.Screen 
          name="checklists/[id]" 
          options={{ title: 'Checkliste bearbeiten' }} 
        />
        <Stack.Screen 
          name="roofs/[id]" 
          options={{ title: 'Dachmessung bearbeiten' }} 
        />
        <Stack.Screen 
          name="documents/new" 
          options={{ title: 'Dokument hinzufügen' }} 
        />
        <Stack.Screen 
          name="documents/view" 
          options={{ title: 'Dokument', headerShown: false }} 
        />
        <Stack.Screen 
          name="calculator/index" 
          options={{ title: 'Flächenberechnungen' }} 
        />
        <Stack.Screen 
          name="calculator/new" 
          options={{ title: 'Flächenkalkulator', headerShown: false }} 
        />
        <Stack.Screen 
          name="calculator/edit" 
          options={{ title: 'Flächenkalkulator', headerShown: false }} 
        />
      </Stack>
      <KeyboardDismissButton />
    </View>
  );
}

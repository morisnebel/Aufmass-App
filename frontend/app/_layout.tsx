import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
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
          name="customers/index" 
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
          options={{ title: 'Skizze zeichnen' }} 
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
      </Stack>
    </>
  );
}

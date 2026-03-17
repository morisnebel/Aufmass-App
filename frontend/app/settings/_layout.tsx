import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // Wir haben unseren eigenen Header
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ 
          title: 'Einstellungen',
          headerShown: false,
        }} 
      />
    </Stack>
  );
}

import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function SettingsLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerShown: false, // Wir haben unseren eigenen Header
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ 
          title: t('screenTitles.settings'),
          headerShown: false,
        }} 
      />
    </Stack>
  );
}

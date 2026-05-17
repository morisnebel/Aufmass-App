import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, LogBox, Platform } from 'react-native';
import { KeyboardDismissButton } from '../components/KeyboardDismissButton';
import { AppNameHeader } from '../services/FeatureFlags';
import { SketchService } from '../services/LocalStorage';
import { useTranslation } from 'react-i18next';
import '../i18n'; // i18n initialisieren

// Ignore canvas render warnings from pdf.js in WebView
LogBox.ignoreLogs([
  'PDF Error:',
  'Cannot use the same canvas',
  'RenderingCancelledException',
]);

export default function RootLayout() {
  const { t } = useTranslation();
  // iPad hat hellen Header-Hintergrund, iPhone blauen
  const isIPad = Platform.OS === 'ios' && Platform.isPad;
  const headerBgColor = isIPad ? undefined : '#1976d2';
  const headerTextColor = isIPad ? '#000' : '#fff';
  
  // Run one-time migration of sketch data on app startup
  useEffect(() => {
    SketchService.migrateAllSketches().catch(err => 
      console.error('[App] Sketch migration error:', err)
    );
  }, []);
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: headerBgColor ? {
            backgroundColor: headerBgColor,
          } : undefined,
          headerTintColor: headerTextColor,
          headerTitleStyle: {
            fontWeight: 'bold',
            color: headerTextColor,
          },
          headerBackTitleStyle: {
            color: headerTextColor,
          },
        }}
      >
        <Stack.Screen 
          name="index" 
          options={{ 
            title: AppNameHeader,
            headerShown: true
          }} 
        />
        <Stack.Screen 
          name="customers" 
          options={{ title: t('screenTitles.customers'), headerShown: false }} 
        />
        <Stack.Screen 
          name="projects/new" 
          options={{ title: t('screenTitles.newProject') }} 
        />
        <Stack.Screen 
          name="projects/[id]" 
          options={{ 
            title: t('screenTitles.projectDetails'),
            headerStyle: { backgroundColor: '#ffffff' },
            headerTintColor: '#000',
            headerTitleStyle: { color: '#000', fontWeight: 'bold' },
          }} 
        />
        <Stack.Screen 
          name="roofs/new" 
          options={{ title: t('screenTitles.newRoof') }} 
        />
        <Stack.Screen 
          name="photos/new" 
          options={{ title: t('screenTitles.addPhoto') }} 
        />
        <Stack.Screen 
          name="photos/annotate" 
          options={{ title: t('screenTitles.editPhoto') }} 
        />
        <Stack.Screen 
          name="sketches/draw" 
          options={{ title: t('screenTitles.drawSketch'), headerShown: false }} 
        />
        <Stack.Screen 
          name="sketches/new" 
          options={{ title: t('screenTitles.newSketch'), headerShown: false }} 
        />
        <Stack.Screen 
          name="checklists/templates" 
          options={{ title: t('screenTitles.checklistTemplates') }} 
        />
        <Stack.Screen 
          name="checklists/edit-template" 
          options={{ title: t('screenTitles.createChecklist') }} 
        />
        <Stack.Screen 
          name="checklists/new" 
          options={{ title: t('screenTitles.newChecklist') }} 
        />
        <Stack.Screen 
          name="checklists/[id]" 
          options={{ title: t('screenTitles.editChecklist') }} 
        />
        <Stack.Screen 
          name="roofs/[id]" 
          options={{ title: t('screenTitles.editRoof') }} 
        />
        <Stack.Screen 
          name="documents/new" 
          options={{ title: t('screenTitles.addDocument') }} 
        />
        <Stack.Screen 
          name="documents/view" 
          options={{ title: t('screenTitles.document'), headerShown: false }} 
        />
        <Stack.Screen 
          name="calculator/index" 
          options={{ title: t('screenTitles.areaCalculations') }} 
        />
        <Stack.Screen 
          name="calculator/new" 
          options={{ title: t('screenTitles.areaCalculator'), headerShown: false }} 
        />
        <Stack.Screen 
          name="calculator/edit" 
          options={{ title: t('screenTitles.areaCalculator'), headerShown: false }} 
        />
        <Stack.Screen 
          name="references/index" 
          options={{ title: t('screenTitles.referencePhotos'), headerShown: false }} 
        />
        <Stack.Screen 
          name="settings" 
          options={{ title: t('screenTitles.settings'), headerShown: false }} 
        />
      </Stack>
      <KeyboardDismissButton />
    </View>
  );
}

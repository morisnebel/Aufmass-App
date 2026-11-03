import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';

// Plattformübergreifendes Eingabefenster (Ersatz für das nur unter iOS verfügbare Alert.prompt)
type Props = {
  visible: boolean;
  title: string;
  message?: string;
  defaultValue?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
};

export function RenamePromptModal({ visible, title, message, defaultValue = '', onCancel, onSubmit }: Props) {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => { if (visible) setValue(defaultValue); }, [visible, defaultValue]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.box}>
          <Text style={s.title}>{title}</Text>
          {!!message && <Text style={s.message}>{message}</Text>}
          <TextInput
            testID="rename-prompt-input"
            style={s.input}
            value={value}
            onChangeText={setValue}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={() => onSubmit(value)}
          />
          <View style={s.row}>
            <TouchableOpacity testID="rename-prompt-cancel" style={s.btn} onPress={onCancel}>
              <Text style={s.cancelText}>Abbrechen</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="rename-prompt-ok" style={[s.btn, s.okBtn]} onPress={() => onSubmit(value)}>
              <Text style={s.okText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  box: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 14, padding: 20 },
  title: { fontSize: 17, fontWeight: '700', color: '#222', marginBottom: 6 },
  message: { fontSize: 14, color: '#555', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, height: 48, fontSize: 16, color: '#222' },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  btn: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 8 },
  okBtn: { backgroundColor: '#1976d2' },
  cancelText: { fontSize: 16, color: '#1976d2', fontWeight: '600' },
  okText: { fontSize: 16, color: '#fff', fontWeight: '700' },
});

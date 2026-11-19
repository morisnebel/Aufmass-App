import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { getManual } from '../../content/manual';

// Erklärung eines Knopfs aus dem Anleitungs-Kapitel „Skizze: Alle Knöpfe erklärt“ (eine Quelle für beide)
export const buttonHelp = (label: string): { icon?: string; color?: string; title: string; text: string } | null => {
  const steps = getManual(true).find(section => section.id === 'skizzen-knoepfe')?.steps || [];
  const step = steps.find(st => st.text.startsWith(`${label}:`));
  if (!step) return null;
  return { icon: step.icon, color: step.iconColor, title: label, text: step.text.slice(label.length + 1).trim() };
};

// Sprechblase nach langem Druck auf einen Knopf der Werkzeugleiste; schließt bei Tipp oder nach 6 Sekunden
export function ButtonTip({ label, top, onClose }: { label: string | null; top: number; onClose: () => void }) {
  const help = label ? buttonHelp(label) : null;
  useEffect(() => {
    if (!help) return;
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [label]);
  if (!help) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable testID="button-tip-backdrop" style={s.backdrop} onPress={onClose}>
        <View testID="button-tip" style={[s.bubble, { marginTop: top }]}>
          <View style={s.head}>
            {!!help.icon && (
              <View style={[s.iconBox, { borderColor: help.color }]}>
                <Ionicons name={help.icon as any} size={18} color={help.color} />
              </View>
            )}
            <Text style={s.title}>{help.title}</Text>
          </View>
          <Text style={s.text}>{help.text}</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
  bubble: { width: '100%', maxWidth: 360, padding: 12, gap: 6, borderRadius: 12, backgroundColor: '#0f172a', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, elevation: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBox: { width: 30, height: 30, borderRadius: 6, borderWidth: 1.5, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '800' },
  text: { color: '#e2e8f0', fontSize: 14, lineHeight: 20 },
});

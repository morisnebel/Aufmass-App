import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { clearInputLog, getInputLog } from '../BufferedTextInput';

// Zeigt, was bei den letzten Eingaben in Maßfeldern wirklich ankam (Tasten, Feldinhalt, Ergebnis)
const LABELS: { [type: string]: string } = { key: 'Taste', text: 'Feld', result: 'Ergebnis' };

export const LaserLog = () => {
  const [open, setOpen] = useState(false);
  const [, refresh] = useState(0);
  const log = open ? getInputLog() : [];

  return (
    <View style={styles.box}>
      <TouchableOpacity testID="laser-log-toggle" style={styles.header} onPress={() => setOpen(!open)}>
        <Ionicons name="list" size={14} color="#555" />
        <Text style={styles.headerText}>Laser-Protokoll</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#555" />
      </TouchableOpacity>
      {open && (
        <View style={styles.body}>
          <View style={styles.actions}>
            <TouchableOpacity testID="laser-log-refresh" style={styles.action} onPress={() => refresh(n => n + 1)}>
              <Text style={styles.actionText}>Aktualisieren</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="laser-log-clear" style={styles.action} onPress={() => { clearInputLog(); refresh(n => n + 1); }}>
              <Text style={styles.actionText}>Leeren</Text>
            </TouchableOpacity>
          </View>
          {log.length === 0 ? (
            <Text style={styles.line}>Noch keine Eingabe aufgezeichnet.</Text>
          ) : (
            <Text testID="laser-log-text" style={styles.line} selectable>
              {log.map((entry, i) => {
                const gap = i === 0 ? 0 : entry.at - log[i - 1].at;
                return `${i > 0 && gap > 1000 ? '— neue Eingabe —\n' : ''}+${String(Math.min(gap, 9999)).padStart(4, ' ')} ms  ${LABELS[entry.type] || entry.type} „${entry.value}“`;
              }).join('\n')}
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { marginHorizontal: 10, marginBottom: 6, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10 },
  headerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#555' },
  body: { paddingHorizontal: 10, paddingBottom: 8, gap: 6 },
  actions: { flexDirection: 'row', gap: 6 },
  action: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff' },
  actionText: { fontSize: 12, fontWeight: '600', color: '#555' },
  line: { fontSize: 11, color: '#333', fontFamily: 'monospace' },
});

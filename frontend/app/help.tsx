import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, Alert, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { MANUAL, QUICK_START, manualHtml, ManualSection } from '../src/content/manual';
import { createPdfFile } from '../services/PdfExport';

// Bedienungsanleitung: Kurzanleitung + aufklappbare Kapitel mit Erklärungen, als PDF teilbar
export default function HelpScreen() {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sharePdf = async () => {
    setBusy(true);
    try {
      if (Platform.OS === 'web') { await Print.printAsync({ html: manualHtml() }); return; }
      const uri = await createPdfFile(manualHtml());
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Bedienungsanleitung teilen', UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('PDF erstellt', 'Teilen ist auf diesem Gerät nicht verfügbar.');
      }
    } catch (e: any) {
      Alert.alert('PDF fehlgeschlagen', e?.message || 'Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView testID="help-screen" style={s.screen} contentContainerStyle={s.content}>
      <Stack.Screen options={{ title: 'Bedienungsanleitung' }} />
      <TouchableOpacity testID="help-pdf" style={s.pdfBtn} onPress={sharePdf} disabled={busy} activeOpacity={0.85}>
        {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="document-text-outline" size={22} color="#fff" />}
        <Text style={s.pdfText}>{busy ? 'PDF wird erstellt…' : 'Anleitung als PDF teilen'}</Text>
      </TouchableOpacity>

      <View style={s.quick} testID="help-quickstart">
        <View style={s.quickHead}>
          <Ionicons name="flash" size={20} color="#f59e0b" />
          <Text style={s.quickTitle}>Kurzanleitung – in 7 Schritten startklar</Text>
        </View>
        {QUICK_START.map((q, i) => (
          <View key={q.title} style={s.qRow}>
            <View style={s.num}><Text style={s.numText}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.qTitle}>{q.title}</Text>
              <Text style={s.qText}>{q.text}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={s.h2}>Ausführliche Anleitung</Text>
      {MANUAL.map(sec => (
        <Chapter key={sec.id} sec={sec} open={open === sec.id} onToggle={() => setOpen(open === sec.id ? null : sec.id)} />
      ))}
      <Text style={s.foot}>Maße und Berechnungen dienen als Unterstützung und ersetzen keine Statik, Bauplanung oder amtliche Vermessung.</Text>
    </ScrollView>
  );
}

function Chapter({ sec, open, onToggle }: { sec: ManualSection; open: boolean; onToggle: () => void }) {
  const [info, setInfo] = useState<number | null>(null);
  return (
    <View style={s.card}>
      <TouchableOpacity testID={`help-sec-${sec.id}`} style={s.cardHead} onPress={onToggle} activeOpacity={0.7}>
        <View style={[s.icon, { backgroundColor: sec.color + '1f' }]}><Ionicons name={sec.icon as any} size={22} color={sec.color} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>{sec.title}</Text>
          <Text style={s.cardIntro} numberOfLines={open ? undefined : 1}>{sec.intro}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#64748b" />
      </TouchableOpacity>
      {open && (
        <View style={s.body}>
          {sec.steps.map((st, i) => (
            <View key={i} style={s.step}>
              <View style={s.stepRow}>
                <Text style={s.stepNum}>{i + 1}.</Text>
                <Text style={s.stepText}>{st.text}</Text>
                {st.info && (
                  <TouchableOpacity testID={`help-info-${sec.id}-${i}`} hitSlop={8} style={s.infoBtn} onPress={() => setInfo(info === i ? null : i)}>
                    <Ionicons name={info === i ? 'information-circle' : 'information-circle-outline'} size={24} color="#1976d2" />
                  </TouchableOpacity>
                )}
              </View>
              {st.info && info === i && <Text style={s.info}>{st.info}</Text>}
            </View>
          ))}
          {(sec.tips || []).map(t => (
            <View key={t} style={s.tip}><Ionicons name="bulb-outline" size={16} color="#d97706" /><Text style={s.tipText}>{t}</Text></View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 48, maxWidth: 820, width: '100%', alignSelf: 'center' },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 52, borderRadius: 14, backgroundColor: '#1565c0', marginBottom: 16 },
  pdfText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  quick: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#bfdbfe' },
  quickHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  quickTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', flex: 1 },
  qRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1565c0', alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#fff', fontWeight: '800' },
  qTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  qText: { fontSize: 14, color: '#475569', marginTop: 2, lineHeight: 20 },
  h2: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginTop: 24, marginBottom: 10 },
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 64 },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  cardIntro: { fontSize: 13, color: '#64748b', marginTop: 2 },
  body: { paddingHorizontal: 16, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 },
  step: { marginBottom: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  stepNum: { fontSize: 15, fontWeight: '800', color: '#1565c0', width: 22 },
  stepText: { flex: 1, fontSize: 15, color: '#1e293b', lineHeight: 21 },
  infoBtn: { minWidth: 44, minHeight: 32, alignItems: 'center', justifyContent: 'flex-start' },
  info: { marginTop: 6, marginLeft: 28, backgroundColor: '#eff6ff', borderLeftWidth: 3, borderLeftColor: '#1976d2', padding: 10, borderRadius: 6, fontSize: 14, color: '#334155', lineHeight: 20 },
  tip: { flexDirection: 'row', gap: 8, backgroundColor: '#fff7e6', borderRadius: 8, padding: 10, marginTop: 4 },
  tipText: { flex: 1, fontSize: 14, color: '#7c4a03', lineHeight: 20 },
  foot: { marginTop: 16, fontSize: 12, color: '#64748b', textAlign: 'center' },
});

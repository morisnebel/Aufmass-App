import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

const ROOF_TYPES = [
  { id: 'Flachdach', name: 'Flachdach', description: 'Ebene Dachfläche ohne Neigung' },
  { id: 'Pultdach', name: 'Pultdach', description: 'Einseitig geneigte Dachfläche' },
  { id: 'Satteldach', name: 'Satteldach', description: 'Zwei gegenüberliegende Dachflächen' },
  { id: 'Walmdach', name: 'Walmdach', description: 'Vier geneigte Dachflächen' },
  { id: 'Zeltdach', name: 'Zeltdach', description: 'Vier gleiche Dreiecksflächen' },
  { id: 'Mansarddach', name: 'Mansarddach', description: 'Dach mit Knick (steiler unten)' },
];

export default function EditRoofScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [roofType, setRoofType] = useState('Satteldach');
  const [showRoofTypePicker, setShowRoofTypePicker] = useState(false);
  
  const [gebaeudelaenge, setGebaeudelaenge] = useState('');
  const [gebaeudebreite, setGebaeudebreite] = useState('');
  const [traufhoehe, setTraufhoehe] = useState('');
  const [ueberstandLaengsseite, setUeberstandLaengsseite] = useState('');
  const [ueberstandGiebelseite, setUeberstandGiebelseite] = useState('');
  
  const [dachneigung1, setDachneigung1] = useState('');
  const [dachneigung2, setDachneigung2] = useState('');
  const [dachneigung3, setDachneigung3] = useState('');
  const [dachneigung4, setDachneigung4] = useState('');
  
  const [neigungLangUnten, setNeigungLangUnten] = useState('');
  const [neigungLangOben, setNeigungLangOben] = useState('');
  const [neigungSchmalUnten, setNeigungSchmalUnten] = useState('');
  const [neigungSchmalOben, setNeigungSchmalOben] = useState('');
  const [knickhoehe, setKnickhoehe] = useState('');
  
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [calculatedFirsthoehe, setCalculatedFirsthoehe] = useState(0);

  useEffect(() => { loadRoof(); }, [id]);
  useEffect(() => { calculateFirsthoehe(); }, [gebaeudebreite, dachneigung1, dachneigung2, roofType]);

  const loadRoof = async () => {
    try {
      const projectsRes = await axios.get(`${API_URL}/api/projects`);
      for (const project of projectsRes.data) {
        const roofsRes = await axios.get(`${API_URL}/api/roofs/project/${project.id}`);
        const roof = roofsRes.data.find((r: any) => r.id === id);
        if (roof) {
          setProjectId(project.id);
          setRoofType(roof.roof_type);
          const m = roof.measurements || {};
          setGebaeudelaenge(m.gebaeudelaenge?.toString() || m.length?.toString() || '');
          setGebaeudebreite(m.gebaeudebreite?.toString() || m.width?.toString() || '');
          setTraufhoehe(m.traufhoehe?.toString() || '');
          setDachueberstand(m.dachueberstand?.toString() || '');
          setDachneigung1(m.dachneigung1?.toString() || '');
          setDachneigung2(m.dachneigung2?.toString() || '');
          setDachneigung3(m.dachneigung3?.toString() || '');
          setDachneigung4(m.dachneigung4?.toString() || '');
          setNeigungLangUnten(m.neigung_lang_unten?.toString() || '');
          setNeigungLangOben(m.neigung_lang_oben?.toString() || '');
          setNeigungSchmalUnten(m.neigung_schmal_unten?.toString() || '');
          setNeigungSchmalOben(m.neigung_schmal_oben?.toString() || '');
          setKnickhoehe(m.knickhoehe?.toString() || '');
          setNotes(roof.notes || '');
          break;
        }
      }
    } catch (error) {
      Alert.alert('Fehler', 'Dachmessung konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const calculateFirsthoehe = () => {
    const breite = parseFloat(gebaeudebreite) || 0;
    const n1 = parseFloat(dachneigung1) || 0;
    const n2 = parseFloat(dachneigung2) || n1;
    if (breite <= 0 || n1 <= 0) { setCalculatedFirsthoehe(0); return; }
    const rad1 = (n1 * Math.PI) / 180;
    const rad2 = (n2 * Math.PI) / 180;
    let h = 0;
    if (roofType === 'Pultdach') h = breite * Math.tan(rad1);
    else if (roofType === 'Satteldach') h = n1 === n2 ? (breite/2) * Math.tan(rad1) : ((breite * Math.tan(rad2)) / (Math.tan(rad1) + Math.tan(rad2))) * Math.tan(rad1);
    else if (roofType === 'Zeltdach' || roofType === 'Walmdach') h = (breite/2) * Math.tan(rad1);
    setCalculatedFirsthoehe(Math.max(0, h));
  };

  const calculateArea = () => {
    const L = parseFloat(gebaeudelaenge) || 0;
    const B = parseFloat(gebaeudebreite) || 0;
    const n1 = parseFloat(dachneigung1) || 0;
    const n2 = parseFloat(dachneigung2) || n1;
    const n3 = parseFloat(dachneigung3) || n1;
    const n4 = parseFloat(dachneigung4) || n2;
    const ueberstandGiebel = parseFloat(ueberstandGiebelseite) || 0;
    const ueberstandLaengs = parseFloat(ueberstandLaengsseite) || 0;
    const effL = L + 2 * ueberstandGiebel;
    const effB = B + 2 * ueberstandLaengs;
    const nLU = parseFloat(neigungLangUnten) || 0;
    const nLO = parseFloat(neigungLangOben) || 0;
    const nSU = parseFloat(neigungSchmalUnten) || 0;
    const nSO = parseFloat(neigungSchmalOben) || 0;
    const hK = parseFloat(knickhoehe) || 0;

    let area = 0;
    switch (roofType) {
      case 'Flachdach': area = effL * effB; break;
      case 'Pultdach': area = n1 > 0 ? effL * (effB / Math.cos(n1 * Math.PI / 180)) : effL * effB; break;
      case 'Satteldach': {
        if (n1 > 0) {
          const r1 = n1 * Math.PI / 180, r2 = n2 * Math.PI / 180;
          let b1 = effB/2, b2 = effB/2;
          if (n1 !== n2) { b1 = (effB * Math.tan(r2)) / (Math.tan(r1) + Math.tan(r2)); b2 = effB - b1; }
          area = effL * (b1 / Math.cos(r1)) + effL * (b2 / Math.cos(r2));
        } else area = effL * effB;
        break;
      }
      case 'Walmdach': {
        if (n1 > 0) {
          const r1 = n1*Math.PI/180, r2 = n2*Math.PI/180, r3 = n3*Math.PI/180, r4 = n4*Math.PI/180;
          const sL = (effB/2)/Math.cos(r1), fH = (effB/2)*Math.tan(r1);
          const wT = fH/Math.tan(r3), fL = Math.max(0, effL - 2*wT);
          const t1 = ((fL+effL)/2)*sL, t2 = ((fL+effL)/2)*((effB/2)/Math.cos(r2));
          const d1 = (effB/2)*(fH/Math.sin(r3)), d2 = (effB/2)*(fH/Math.sin(r4));
          area = t1 + t2 + d1 + d2;
        } else area = effL * effB * 1.15;
        break;
      }
      case 'Zeltdach': area = n1 > 0 ? 4 * (effL/2) * ((effL/2)/Math.cos(n1*Math.PI/180)) : effL * effL; break;
      case 'Mansarddach': {
        if (nLU > 0 && hK > 0) {
          const rLU = nLU*Math.PI/180, rSU = ((nSU||nLU)*Math.PI)/180;
          const rLO = nLO > 0 ? nLO*Math.PI/180 : 0, rSO = nSO > 0 ? ((nSO||nLO)*Math.PI)/180 : rLO;
          const sLU = hK/Math.sin(rLU), sSU = hK/Math.sin(rSU);
          const hLU = hK/Math.tan(rLU), hSU = hK/Math.tan(rSU);
          const uBL = effL, oBL = Math.max(0, effL - 2*hSU);
          const uBS = effB, oBS = Math.max(0, effB - 2*hLU);
          const fU = 2*((uBL+oBL)/2)*sLU + 2*((uBS+oBS)/2)*sSU;
          let fO = 0;
          if (nLO > 0 && oBL > 0 && oBS > 0) {
            const sLO = (oBS/2)/Math.cos(rLO), sSO = (oBL/2)/Math.cos(rSO);
            fO = Math.abs(oBL-oBS) < 0.01 ? 4*(oBL/2)*sLO : 2*oBL*sLO + 2*oBS*sSO;
          }
          area = fU + fO;
        } else area = effL * effB * 1.4;
        break;
      }
      default: area = effL * effB;
    }
    return Math.max(0, area);
  };

  const handleSave = async () => {
    if (!gebaeudelaenge || !gebaeudebreite) { Alert.alert('Fehler', 'Bitte Länge und Breite eingeben'); return; }
    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/roofs/${id}`, {
        project_id: projectId, roof_type: roofType,
        measurements: {
          gebaeudelaenge: parseFloat(gebaeudelaenge), gebaeudebreite: parseFloat(gebaeudebreite),
          traufhoehe: parseFloat(traufhoehe) || 0, dachueberstand: parseFloat(dachueberstand) || 0,
          dachneigung1: parseFloat(dachneigung1) || 0, dachneigung2: parseFloat(dachneigung2) || 0,
          dachneigung3: parseFloat(dachneigung3) || 0, dachneigung4: parseFloat(dachneigung4) || 0,
          neigung_lang_unten: parseFloat(neigungLangUnten) || 0, neigung_lang_oben: parseFloat(neigungLangOben) || 0,
          neigung_schmal_unten: parseFloat(neigungSchmalUnten) || 0, neigung_schmal_oben: parseFloat(neigungSchmalOben) || 0,
          knickhoehe: parseFloat(knickhoehe) || 0, firsthoehe: calculatedFirsthoehe,
          length: parseFloat(gebaeudelaenge), width: parseFloat(gebaeudebreite),
        },
        area: calculateArea(), notes: notes || undefined,
      });
      Alert.alert('Erfolg', 'Gespeichert', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (error) { Alert.alert('Fehler', 'Speichern fehlgeschlagen'); }
    finally { setSaving(false); }
  };

  const renderUeberstandFields = () => (
    <>
      <View style={styles.sectionDivider}>
        <Text style={styles.sectionText}>Dachüberstände (optional)</Text>
      </View>
      <View style={styles.inputRow}>
        <View style={styles.inputHalf}>
          <Text style={styles.label}>Längsseite (m)</Text>
          <TextInput style={styles.input} placeholder="z.B. 0.5" value={ueberstandLaengsseite} onChangeText={setUeberstandLaengsseite} keyboardType="decimal-pad" />
          <Text style={styles.hint}>Traufseite</Text>
        </View>
        <View style={styles.inputHalf}>
          <Text style={styles.label}>Giebelseite (m)</Text>
          <TextInput style={styles.input} placeholder="z.B. 0.3" value={ueberstandGiebelseite} onChangeText={setUeberstandGiebelseite} keyboardType="decimal-pad" />
          <Text style={styles.hint}>Giebelseite</Text>
        </View>
      </View>
    </>
  );

  const renderFields = () => {
    const LenField = () => <View style={styles.inputGroup}><Text style={styles.label}>Gebäudelänge (m) *</Text><TextInput style={styles.input} placeholder="z.B. 12" value={gebaeudelaenge} onChangeText={setGebaeudelaenge} keyboardType="decimal-pad" /></View>;
    const WidthField = () => <View style={styles.inputGroup}><Text style={styles.label}>Gebäudebreite (m) *</Text><TextInput style={styles.input} placeholder="z.B. 10" value={gebaeudebreite} onChangeText={setGebaeudebreite} keyboardType="decimal-pad" /></View>;
    const FirstH = () => calculatedFirsthoehe > 0 ? <View style={styles.calculatedValue}><Text style={styles.calculatedLabel}>Berechnete Firsthöhe:</Text><Text style={styles.calculatedNumber}>{calculatedFirsthoehe.toFixed(2)} m</Text></View> : null;

    switch (roofType) {
      case 'Flachdach': return <><LenField /><WidthField />{renderUeberstandFields()}</>;
      case 'Pultdach': return <><LenField /><WidthField /><View style={styles.inputGroup}><Text style={styles.label}>Dachneigung (°) *</Text><TextInput style={styles.input} placeholder="z.B. 15" value={dachneigung1} onChangeText={setDachneigung1} keyboardType="decimal-pad" /></View>{renderUeberstandFields()}<FirstH /></>;
      case 'Satteldach': return <><LenField /><WidthField /><View style={styles.sectionDivider}><Text style={styles.sectionText}>Dachneigungen</Text></View><View style={styles.inputRow}><View style={styles.inputHalf}><Text style={styles.label}>DF 1 (°) *</Text><TextInput style={styles.input} placeholder="z.B. 35" value={dachneigung1} onChangeText={setDachneigung1} keyboardType="decimal-pad" /></View><View style={styles.inputHalf}><Text style={styles.label}>DF 2 (°)</Text><TextInput style={styles.input} placeholder="gleich" value={dachneigung2} onChangeText={setDachneigung2} keyboardType="decimal-pad" /></View></View>{renderUeberstandFields()}<FirstH /></>;
      case 'Walmdach': return <><LenField /><WidthField /><View style={styles.sectionDivider}><Text style={styles.sectionText}>Dachneigungen (4 Flächen)</Text></View><View style={styles.inputRow}><View style={styles.inputHalf}><Text style={styles.label}>DF 1 Längs (°)</Text><TextInput style={styles.input} placeholder="35" value={dachneigung1} onChangeText={v=>{setDachneigung1(v);if(!dachneigung2)setDachneigung2(v);}} keyboardType="decimal-pad" /></View><View style={styles.inputHalf}><Text style={styles.label}>DF 2 Längs (°)</Text><TextInput style={styles.input} placeholder="gleich" value={dachneigung2} onChangeText={setDachneigung2} keyboardType="decimal-pad" /></View></View><View style={styles.inputRow}><View style={styles.inputHalf}><Text style={styles.label}>DF 3 Walm (°)</Text><TextInput style={styles.input} placeholder="35" value={dachneigung3} onChangeText={v=>{setDachneigung3(v);if(!dachneigung4)setDachneigung4(v);}} keyboardType="decimal-pad" /></View><View style={styles.inputHalf}><Text style={styles.label}>DF 4 Walm (°)</Text><TextInput style={styles.input} placeholder="gleich" value={dachneigung4} onChangeText={setDachneigung4} keyboardType="decimal-pad" /></View></View>{renderUeberstandFields()}<FirstH /></>;
      case 'Zeltdach': return <><View style={styles.inputGroup}><Text style={styles.label}>Seitenlänge (m) *</Text><TextInput style={styles.input} placeholder="z.B. 8" value={gebaeudelaenge} onChangeText={v=>{setGebaeudelaenge(v);setGebaeudebreite(v);}} keyboardType="decimal-pad" /></View><View style={styles.inputGroup}><Text style={styles.label}>Dachneigung (°) *</Text><TextInput style={styles.input} placeholder="z.B. 30" value={dachneigung1} onChangeText={setDachneigung1} keyboardType="decimal-pad" /></View>{renderUeberstandFields()}<FirstH /></>;
      case 'Mansarddach': return <><LenField /><WidthField /><View style={styles.sectionDivider}><Text style={styles.sectionText}>Knickhöhe</Text></View><View style={styles.inputGroup}><Text style={styles.label}>Knickhöhe (m) *</Text><TextInput style={styles.input} placeholder="z.B. 2" value={knickhoehe} onChangeText={setKnickhoehe} keyboardType="decimal-pad" /></View><View style={styles.sectionDivider}><Text style={styles.sectionText}>Neigung lange Seite (°)</Text></View><View style={styles.inputRow}><View style={styles.inputHalf}><Text style={styles.label}>Unten *</Text><TextInput style={styles.input} placeholder="65" value={neigungLangUnten} onChangeText={v=>{setNeigungLangUnten(v);if(!neigungSchmalUnten)setNeigungSchmalUnten(v);}} keyboardType="decimal-pad" /></View><View style={styles.inputHalf}><Text style={styles.label}>Oben *</Text><TextInput style={styles.input} placeholder="20" value={neigungLangOben} onChangeText={v=>{setNeigungLangOben(v);if(!neigungSchmalOben)setNeigungSchmalOben(v);}} keyboardType="decimal-pad" /></View></View><View style={styles.sectionDivider}><Text style={styles.sectionText}>Neigung schmale Seite (°)</Text></View><View style={styles.inputRow}><View style={styles.inputHalf}><Text style={styles.label}>Unten</Text><TextInput style={styles.input} placeholder="gleich" value={neigungSchmalUnten} onChangeText={setNeigungSchmalUnten} keyboardType="decimal-pad" /></View><View style={styles.inputHalf}><Text style={styles.label}>Oben</Text><TextInput style={styles.input} placeholder="gleich" value={neigungSchmalOben} onChangeText={setNeigungSchmalOben} keyboardType="decimal-pad" /></View></View>{renderUeberstandFields()}</>;
      default: return null;
    }
  };

  const getFormula = () => {
    const f: Record<string, string> = { Flachdach: 'L × B', Pultdach: 'L × B/cos(α)', Satteldach: '2 × L × Sparren', Walmdach: '2 Trapeze + 2 Dreiecke', Zeltdach: '4 × Dreieck', Mansarddach: '4 Trapeze + Walmdach' };
    return f[roofType] || '';
  };

  if (loading) return <View style={styles.centerContainer}><ActivityIndicator size="large" color="#1976d2" /></View>;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Dachtyp *</Text>
            <TouchableOpacity style={styles.roofTypeSelector} onPress={() => setShowRoofTypePicker(true)}>
              <View style={styles.roofTypeSelectorContent}><Ionicons name="home" size={24} color="#1976d2" /><View style={styles.roofTypeSelectorText}><Text style={styles.roofTypeName}>{roofType}</Text><Text style={styles.roofTypeDesc}>{ROOF_TYPES.find(r => r.id === roofType)?.description}</Text></View></View>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>
          <View style={styles.measurementsCard}><Text style={styles.cardTitle}>Eingabewerte {roofType}</Text>{renderFields()}</View>
          <View style={styles.resultCard}><Text style={styles.resultLabel}>Berechnete Dachfläche:</Text><Text style={styles.resultValue}>{calculateArea().toFixed(2)} m²</Text><Text style={styles.resultFormula}>Formel: {getFormula()}</Text></View>
          <View style={styles.inputGroup}><Text style={styles.label}>Notizen</Text><TextInput style={[styles.input, styles.textArea]} placeholder="Hinweise..." value={notes} onChangeText={setNotes} multiline numberOfLines={3} /></View>
          <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}><Text style={styles.buttonText}>{saving ? 'Speichert...' : 'Speichern'}</Text></TouchableOpacity>
        </View>
      </ScrollView>
      <Modal visible={showRoofTypePicker} animationType="slide" transparent onRequestClose={() => setShowRoofTypePicker(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Dachtyp</Text><TouchableOpacity onPress={() => setShowRoofTypePicker(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity></View>
          <FlatList data={ROOF_TYPES} keyExtractor={i => i.id} renderItem={({ item }) => (
            <TouchableOpacity style={[styles.roofTypeItem, item.id === roofType && styles.roofTypeItemSelected]} onPress={() => { setRoofType(item.id); setShowRoofTypePicker(false); }}>
              <View style={styles.roofTypeItemContent}><Ionicons name="home" size={28} color={item.id === roofType ? '#1976d2' : '#666'} /><View style={styles.roofTypeItemTextContainer}><Text style={[styles.roofTypeItemText, item.id === roofType && styles.roofTypeItemTextSelected]}>{item.name}</Text><Text style={styles.roofTypeItemDesc}>{item.description}</Text></View></View>
              {item.id === roofType && <Ionicons name="checkmark-circle" size={24} color="#1976d2" />}
            </TouchableOpacity>
          )} />
        </View></View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  form: { padding: 16 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderRadius: 8, padding: 12, fontSize: 16, borderWidth: 1, borderColor: '#ddd' },
  textArea: { height: 80, textAlignVertical: 'top' },
  inputRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  inputHalf: { flex: 1 },
  hint: { fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 4 },
  sectionDivider: { backgroundColor: '#e8e8e8', padding: 8, borderRadius: 6, marginBottom: 12, marginTop: 4 },
  sectionText: { fontSize: 13, fontWeight: '600', color: '#555' },
  calculatedValue: { backgroundColor: '#e8f5e9', padding: 12, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  calculatedLabel: { fontSize: 14, color: '#2e7d32' },
  calculatedNumber: { fontSize: 18, fontWeight: 'bold', color: '#2e7d32' },
  measurementsCard: { backgroundColor: '#e3f2fd', borderRadius: 12, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1976d2', marginBottom: 16 },
  resultCard: { backgroundColor: '#4caf50', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 16 },
  resultLabel: { fontSize: 14, color: '#fff', marginBottom: 8 },
  resultValue: { fontSize: 36, fontWeight: 'bold', color: '#fff' },
  resultFormula: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 8 },
  button: { backgroundColor: '#1976d2', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  roofTypeSelector: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roofTypeSelectorContent: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  roofTypeSelectorText: { flex: 1 },
  roofTypeName: { fontSize: 16, fontWeight: '600', color: '#333' },
  roofTypeDesc: { fontSize: 12, color: '#666', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  roofTypeItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  roofTypeItemSelected: { backgroundColor: '#e3f2fd' },
  roofTypeItemContent: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  roofTypeItemTextContainer: { flex: 1 },
  roofTypeItemText: { fontSize: 16, color: '#333', fontWeight: '500' },
  roofTypeItemTextSelected: { color: '#1976d2', fontWeight: '600' },
  roofTypeItemDesc: { fontSize: 12, color: '#888', marginTop: 2 },
});

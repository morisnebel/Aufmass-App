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
  
  // Gemeinsame Maße
  const [gebaeudelaenge, setGebaeudelaenge] = useState('');
  const [gebaeudebreite, setGebaeudebreite] = useState('');
  const [traufhoehe, setTraufhoehe] = useState('');
  
  // Dachneigungen
  const [dachneigung1, setDachneigung1] = useState('');
  const [dachneigung2, setDachneigung2] = useState('');
  const [dachneigung3, setDachneigung3] = useState('');
  const [dachneigung4, setDachneigung4] = useState('');
  
  // Mansarddach spezifisch (wie in DachCAD)
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

  useEffect(() => {
    loadRoof();
  }, [id]);

  useEffect(() => {
    calculateFirsthoehe();
  }, [gebaeudebreite, dachneigung1, dachneigung2, roofType]);

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
          setDachneigung1(m.dachneigung1?.toString() || m.angle?.toString() || '');
          setDachneigung2(m.dachneigung2?.toString() || '');
          setDachneigung3(m.dachneigung3?.toString() || '');
          setDachneigung4(m.dachneigung4?.toString() || '');
          // Mansarddach Felder
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
      console.error('Error loading roof:', error);
      Alert.alert('Fehler', 'Dachmessung konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const calculateFirsthoehe = () => {
    const breite = parseFloat(gebaeudebreite) || 0;
    const neigung1 = parseFloat(dachneigung1) || 0;
    const neigung2 = parseFloat(dachneigung2) || neigung1;
    
    if (breite <= 0 || neigung1 <= 0) {
      setCalculatedFirsthoehe(0);
      return;
    }

    let firsthoehe = 0;
    const rad1 = (neigung1 * Math.PI) / 180;
    const rad2 = (neigung2 * Math.PI) / 180;

    switch (roofType) {
      case 'Pultdach':
        firsthoehe = breite * Math.tan(rad1);
        break;
      case 'Satteldach':
        if (neigung1 === neigung2) {
          firsthoehe = (breite / 2) * Math.tan(rad1);
        } else {
          const tan1 = Math.tan(rad1);
          const tan2 = Math.tan(rad2);
          const x1 = (breite * tan2) / (tan1 + tan2);
          firsthoehe = x1 * tan1;
        }
        break;
      case 'Zeltdach':
        const laenge = parseFloat(gebaeudelaenge) || breite;
        firsthoehe = (Math.min(laenge, breite) / 2) * Math.tan(rad1);
        break;
      case 'Walmdach':
        firsthoehe = (breite / 2) * Math.tan(rad1);
        break;
      default:
        firsthoehe = 0;
    }

    setCalculatedFirsthoehe(Math.max(0, firsthoehe));
  };

  const calculateArea = () => {
    const L = parseFloat(gebaeudelaenge) || 0;
    const B = parseFloat(gebaeudebreite) || 0;
    const n1 = parseFloat(dachneigung1) || 0;
    const n2 = parseFloat(dachneigung2) || n1;
    const n3 = parseFloat(dachneigung3) || n1;
    const n4 = parseFloat(dachneigung4) || n2;
    
    // Mansarddach Variablen
    const nLangUnten = parseFloat(neigungLangUnten) || 0;
    const nLangOben = parseFloat(neigungLangOben) || 0;
    const nSchmalUnten = parseFloat(neigungSchmalUnten) || 0;
    const nSchmalOben = parseFloat(neigungSchmalOben) || 0;
    const hKnick = parseFloat(knickhoehe) || 0;

    let area = 0;

    switch (roofType) {
      case 'Flachdach':
        area = L * B;
        break;

      case 'Pultdach': {
        if (n1 > 0) {
          const rad = (n1 * Math.PI) / 180;
          const sparrenlaenge = B / Math.cos(rad);
          area = L * sparrenlaenge;
        } else {
          area = L * B;
        }
        break;
      }

      case 'Satteldach': {
        if (n1 > 0) {
          const rad1 = (n1 * Math.PI) / 180;
          const rad2 = (n2 * Math.PI) / 180;
          
          let b1, b2;
          if (n1 === n2) {
            b1 = b2 = B / 2;
          } else {
            const tan1 = Math.tan(rad1);
            const tan2 = Math.tan(rad2);
            b1 = (B * tan2) / (tan1 + tan2);
            b2 = B - b1;
          }
          
          const sparren1 = b1 / Math.cos(rad1);
          const sparren2 = b2 / Math.cos(rad2);
          
          area = L * sparren1 + L * sparren2;
        } else {
          area = L * B;
        }
        break;
      }

      case 'Walmdach': {
        if (n1 > 0) {
          const rad1 = (n1 * Math.PI) / 180;
          const rad2 = (n2 * Math.PI) / 180;
          const rad3 = (n3 * Math.PI) / 180;
          const rad4 = (n4 * Math.PI) / 180;
          
          const sparrenLang = (B / 2) / Math.cos(rad1);
          const firsthoehe = (B / 2) * Math.tan(rad1);
          const walmTiefe = firsthoehe / Math.tan(rad3);
          const firstlaenge = Math.max(0, L - 2 * walmTiefe);
          
          const trapezFlaeche1 = ((firstlaenge + L) / 2) * sparrenLang;
          const sparrenLang2 = (B / 2) / Math.cos(rad2);
          const trapezFlaeche2 = ((firstlaenge + L) / 2) * sparrenLang2;
          
          const sparrenWalm1 = firsthoehe / Math.sin(rad3);
          const sparrenWalm2 = firsthoehe / Math.sin(rad4);
          const dreieckFlaeche1 = (B / 2) * sparrenWalm1;
          const dreieckFlaeche2 = (B / 2) * sparrenWalm2;
          
          area = trapezFlaeche1 + trapezFlaeche2 + dreieckFlaeche1 + dreieckFlaeche2;
        } else {
          area = L * B * 1.15;
        }
        break;
      }

      case 'Zeltdach': {
        if (n1 > 0) {
          const seite = L;
          const rad = (n1 * Math.PI) / 180;
          const sparrenlaenge = (seite / 2) / Math.cos(rad);
          area = 4 * (seite / 2) * sparrenlaenge;
        } else {
          area = L * L;
        }
        break;
      }

      case 'Mansarddach': {
        if (nLangUnten > 0 && nLangOben > 0 && hKnick > 0) {
          const radLangUnten = (nLangUnten * Math.PI) / 180;
          const radLangOben = (nLangOben * Math.PI) / 180;
          const radSchmalUnten = (nSchmalUnten || nLangUnten) * Math.PI / 180;
          const radSchmalOben = (nSchmalOben || nLangOben) * Math.PI / 180;
          
          const sparrenLangUnten = hKnick / Math.sin(radLangUnten);
          const sparrenSchmalUnten = hKnick / Math.sin(radSchmalUnten);
          
          const breiteUntenLang = hKnick / Math.tan(radLangUnten);
          const breiteUntenSchmal = hKnick / Math.tan(radSchmalUnten);
          
          const restBreiteLang = Math.max(0, B - 2 * breiteUntenLang);
          const restBreiteSchmal = Math.max(0, L - 2 * breiteUntenSchmal);
          
          const sparrenLangOben = (restBreiteLang / 2) / Math.cos(radLangOben);
          const sparrenSchmalOben = (restBreiteSchmal / 2) / Math.cos(radSchmalOben);
          
          const flaecheLangUnten = 2 * L * sparrenLangUnten;
          const flaecheSchmalUnten = 2 * B * sparrenSchmalUnten;
          const flaecheLangOben = 2 * L * sparrenLangOben;
          const flaecheSchmalOben = 2 * B * sparrenSchmalOben;
          
          area = flaecheLangUnten + flaecheSchmalUnten + flaecheLangOben + flaecheSchmalOben;
        } else {
          area = L * B * 1.4;
        }
        break;
      }

      default:
        area = L * B;
    }

    return Math.max(0, area);
  };

  const handleSave = async () => {
    if (!gebaeudelaenge || !gebaeudebreite) {
      Alert.alert('Fehler', 'Bitte geben Sie mindestens Gebäudelänge und Gebäudebreite ein');
      return;
    }

    const area = calculateArea();

    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/roofs/${id}`, {
        project_id: projectId,
        roof_type: roofType,
        measurements: {
          gebaeudelaenge: parseFloat(gebaeudelaenge),
          gebaeudebreite: parseFloat(gebaeudebreite),
          traufhoehe: parseFloat(traufhoehe) || 0,
          dachneigung1: parseFloat(dachneigung1) || 0,
          dachneigung2: parseFloat(dachneigung2) || 0,
          dachneigung3: parseFloat(dachneigung3) || 0,
          dachneigung4: parseFloat(dachneigung4) || 0,
          neigung_lang_unten: parseFloat(neigungLangUnten) || 0,
          neigung_lang_oben: parseFloat(neigungLangOben) || 0,
          neigung_schmal_unten: parseFloat(neigungSchmalUnten) || 0,
          neigung_schmal_oben: parseFloat(neigungSchmalOben) || 0,
          knickhoehe: parseFloat(knickhoehe) || 0,
          firsthoehe: calculatedFirsthoehe,
          length: parseFloat(gebaeudelaenge),
          width: parseFloat(gebaeudebreite),
        },
        area,
        notes: notes || undefined,
      });
      Alert.alert('Erfolg', 'Dachmessung wurde aktualisiert', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error updating roof:', error);
      Alert.alert('Fehler', 'Dachmessung konnte nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  const handleRoofTypeChange = (newType: string) => {
    setRoofType(newType);
    setShowRoofTypePicker(false);
    setDachneigung2('');
    setDachneigung3('');
    setDachneigung4('');
    setNeigungLangUnten('');
    setNeigungLangOben('');
    setNeigungSchmalUnten('');
    setNeigungSchmalOben('');
    setKnickhoehe('');
  };

  const renderMeasurementFields = () => {
    switch (roofType) {
      case 'Flachdach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudelänge (m) *</Text>
              <TextInput style={styles.input} placeholder="z.B. 12.0" value={gebaeudelaenge} onChangeText={setGebaeudelaenge} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput style={styles.input} placeholder="z.B. 8.0" value={gebaeudebreite} onChangeText={setGebaeudebreite} keyboardType="decimal-pad" />
            </View>
          </>
        );

      case 'Pultdach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudelänge (m) *</Text>
              <TextInput style={styles.input} placeholder="z.B. 12.0" value={gebaeudelaenge} onChangeText={setGebaeudelaenge} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput style={styles.input} placeholder="z.B. 8.0" value={gebaeudebreite} onChangeText={setGebaeudebreite} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Dachneigung (°) *</Text>
              <TextInput style={styles.input} placeholder="z.B. 15" value={dachneigung1} onChangeText={setDachneigung1} keyboardType="decimal-pad" />
            </View>
            {calculatedFirsthoehe > 0 && (
              <View style={styles.calculatedValue}>
                <Text style={styles.calculatedLabel}>Berechnete Firsthöhe:</Text>
                <Text style={styles.calculatedNumber}>{calculatedFirsthoehe.toFixed(2)} m</Text>
              </View>
            )}
          </>
        );

      case 'Satteldach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudelänge (m) *</Text>
              <TextInput style={styles.input} placeholder="z.B. 12.0" value={gebaeudelaenge} onChangeText={setGebaeudelaenge} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput style={styles.input} placeholder="z.B. 10.0" value={gebaeudebreite} onChangeText={setGebaeudebreite} keyboardType="decimal-pad" />
            </View>
            <View style={styles.sectionDivider}><Text style={styles.sectionText}>Dachneigungen</Text></View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Dachfläche 1 (°) *</Text>
                <TextInput style={styles.input} placeholder="z.B. 35" value={dachneigung1} onChangeText={setDachneigung1} keyboardType="decimal-pad" />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Dachfläche 2 (°)</Text>
                <TextInput style={styles.input} placeholder="gleich wie DF1" value={dachneigung2} onChangeText={setDachneigung2} keyboardType="decimal-pad" />
              </View>
            </View>
            {calculatedFirsthoehe > 0 && (
              <View style={styles.calculatedValue}>
                <Text style={styles.calculatedLabel}>Berechnete Firsthöhe:</Text>
                <Text style={styles.calculatedNumber}>{calculatedFirsthoehe.toFixed(2)} m</Text>
              </View>
            )}
          </>
        );

      case 'Walmdach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudelänge (m) *</Text>
              <TextInput style={styles.input} placeholder="z.B. 14.0" value={gebaeudelaenge} onChangeText={setGebaeudelaenge} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput style={styles.input} placeholder="z.B. 10.0" value={gebaeudebreite} onChangeText={setGebaeudebreite} keyboardType="decimal-pad" />
            </View>
            <View style={styles.sectionDivider}><Text style={styles.sectionText}>Dachneigungen (4 Flächen)</Text></View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>DF 1 - Längsseite (°)</Text>
                <TextInput style={styles.input} placeholder="z.B. 35" value={dachneigung1} onChangeText={(val) => { setDachneigung1(val); if (!dachneigung2) setDachneigung2(val); }} keyboardType="decimal-pad" />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>DF 2 - Längsseite (°)</Text>
                <TextInput style={styles.input} placeholder="gleich wie DF1" value={dachneigung2} onChangeText={setDachneigung2} keyboardType="decimal-pad" />
              </View>
            </View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>DF 3 - Walmseite (°)</Text>
                <TextInput style={styles.input} placeholder="z.B. 35" value={dachneigung3} onChangeText={(val) => { setDachneigung3(val); if (!dachneigung4) setDachneigung4(val); }} keyboardType="decimal-pad" />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>DF 4 - Walmseite (°)</Text>
                <TextInput style={styles.input} placeholder="gleich wie DF3" value={dachneigung4} onChangeText={setDachneigung4} keyboardType="decimal-pad" />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Traufhöhe (m)</Text>
              <TextInput style={styles.input} placeholder="z.B. 3.0" value={traufhoehe} onChangeText={setTraufhoehe} keyboardType="decimal-pad" />
            </View>
            {calculatedFirsthoehe > 0 && (
              <View style={styles.calculatedValue}>
                <Text style={styles.calculatedLabel}>Berechnete Firsthöhe:</Text>
                <Text style={styles.calculatedNumber}>{calculatedFirsthoehe.toFixed(2)} m</Text>
              </View>
            )}
          </>
        );

      case 'Zeltdach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Seitenlänge (m) * - quadratisch</Text>
              <TextInput style={styles.input} placeholder="z.B. 8.0" value={gebaeudelaenge} onChangeText={(val) => { setGebaeudelaenge(val); setGebaeudebreite(val); }} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Dachneigung (°) *</Text>
              <TextInput style={styles.input} placeholder="z.B. 30" value={dachneigung1} onChangeText={setDachneigung1} keyboardType="decimal-pad" />
            </View>
            {calculatedFirsthoehe > 0 && (
              <View style={styles.calculatedValue}>
                <Text style={styles.calculatedLabel}>Berechnete Firsthöhe:</Text>
                <Text style={styles.calculatedNumber}>{calculatedFirsthoehe.toFixed(2)} m</Text>
              </View>
            )}
          </>
        );

      case 'Mansarddach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudelänge (m) *</Text>
              <TextInput style={styles.input} placeholder="z.B. 12.0" value={gebaeudelaenge} onChangeText={setGebaeudelaenge} keyboardType="decimal-pad" />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput style={styles.input} placeholder="z.B. 10.0" value={gebaeudebreite} onChangeText={setGebaeudebreite} keyboardType="decimal-pad" />
            </View>
            
            <View style={styles.sectionDivider}><Text style={styles.sectionText}>Trauf(Knick)höhe</Text></View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Knickhöhe (m) *</Text>
              <TextInput style={styles.input} placeholder="z.B. 3.0" value={knickhoehe} onChangeText={setKnickhoehe} keyboardType="decimal-pad" />
              <Text style={styles.hint}>Höhe von Traufe bis zum Knickpunkt</Text>
            </View>
            
            <View style={styles.sectionDivider}><Text style={styles.sectionText}>Dachneigung lange Seite (°)</Text></View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Unten (steil) *</Text>
                <TextInput style={styles.input} placeholder="z.B. 65" value={neigungLangUnten} onChangeText={(val) => { setNeigungLangUnten(val); if (!neigungSchmalUnten) setNeigungSchmalUnten(val); }} keyboardType="decimal-pad" />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Oben (flach) *</Text>
                <TextInput style={styles.input} placeholder="z.B. 20" value={neigungLangOben} onChangeText={(val) => { setNeigungLangOben(val); if (!neigungSchmalOben) setNeigungSchmalOben(val); }} keyboardType="decimal-pad" />
              </View>
            </View>
            
            <View style={styles.sectionDivider}><Text style={styles.sectionText}>Dachneigung schmale Seite (°)</Text></View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Unten (steil)</Text>
                <TextInput style={styles.input} placeholder="wie lange Seite" value={neigungSchmalUnten} onChangeText={setNeigungSchmalUnten} keyboardType="decimal-pad" />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Oben (flach)</Text>
                <TextInput style={styles.input} placeholder="wie lange Seite" value={neigungSchmalOben} onChangeText={setNeigungSchmalOben} keyboardType="decimal-pad" />
              </View>
            </View>
            <Text style={styles.hint}>Mansarddach: 4 Dachflächen mit je 2 Neigungen</Text>
          </>
        );

      default:
        return null;
    }
  };

  const getFormulaText = () => {
    switch (roofType) {
      case 'Flachdach': return 'Formel: Länge × Breite';
      case 'Pultdach': return 'Formel: Länge × (Breite / cos(Neigung))';
      case 'Satteldach': return 'Formel: L × Sparren1 + L × Sparren2';
      case 'Walmdach': return 'Formel: 2 Trapeze + 2 Walmdreiecke';
      case 'Zeltdach': return 'Formel: 4 × (Seite/2 × Sparrenlänge)';
      case 'Mansarddach': return 'Formel: 4 Flächen × (unten + oben)';
      default: return '';
    }
  };

  if (loading) {
    return <View style={styles.centerContainer}><ActivityIndicator size="large" color="#1976d2" /></View>;
  }

  const calculatedArea = calculateArea();

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Dachtyp *</Text>
            <TouchableOpacity style={styles.roofTypeSelector} onPress={() => setShowRoofTypePicker(true)}>
              <View style={styles.roofTypeSelectorContent}>
                <Ionicons name="home" size={24} color="#1976d2" />
                <View style={styles.roofTypeSelectorText}>
                  <Text style={styles.roofTypeName}>{roofType}</Text>
                  <Text style={styles.roofTypeDesc}>{ROOF_TYPES.find(r => r.id === roofType)?.description}</Text>
                </View>
              </View>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.measurementsCard}>
            <Text style={styles.cardTitle}>Eingabewerte {roofType}</Text>
            {renderMeasurementFields()}
          </View>

          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>Berechnete Dachfläche:</Text>
            <Text style={styles.resultValue}>{calculatedArea.toFixed(2)} m²</Text>
            <Text style={styles.resultFormula}>{getFormulaText()}</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notizen</Text>
            <TextInput style={[styles.input, styles.textArea]} placeholder="Zusätzliche Hinweise..." value={notes} onChangeText={setNotes} multiline numberOfLines={4} />
          </View>

          <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={handleSave} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? 'Wird gespeichert...' : 'Änderungen speichern'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={showRoofTypePicker} animationType="slide" transparent={true} onRequestClose={() => setShowRoofTypePicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dachtyp auswählen</Text>
              <TouchableOpacity onPress={() => setShowRoofTypePicker(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
            </View>
            <FlatList data={ROOF_TYPES} keyExtractor={(item) => item.id} renderItem={({ item }) => (
              <TouchableOpacity style={[styles.roofTypeItem, item.id === roofType && styles.roofTypeItemSelected]} onPress={() => handleRoofTypeChange(item.id)}>
                <View style={styles.roofTypeItemContent}>
                  <Ionicons name="home" size={28} color={item.id === roofType ? '#1976d2' : '#666'} />
                  <View style={styles.roofTypeItemTextContainer}>
                    <Text style={[styles.roofTypeItemText, item.id === roofType && styles.roofTypeItemTextSelected]}>{item.name}</Text>
                    <Text style={styles.roofTypeItemDesc}>{item.description}</Text>
                  </View>
                </View>
                {item.id === roofType && <Ionicons name="checkmark-circle" size={24} color="#1976d2" />}
              </TouchableOpacity>
            )} />
          </View>
        </View>
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
  textArea: { height: 100, textAlignVertical: 'top' },
  inputRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  inputHalf: { flex: 1 },
  hint: { fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 4, marginBottom: 8 },
  sectionDivider: { backgroundColor: '#e8e8e8', padding: 8, borderRadius: 6, marginBottom: 12, marginTop: 4 },
  sectionText: { fontSize: 13, fontWeight: '600', color: '#555' },
  calculatedValue: { backgroundColor: '#e8f5e9', padding: 12, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 8 },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
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

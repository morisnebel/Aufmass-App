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

export default function NewRoofScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams();
  const [roofType, setRoofType] = useState('Satteldach');
  const [showRoofTypePicker, setShowRoofTypePicker] = useState(false);
  
  // Gemeinsame Maße
  const [gebaeudelaenge, setGebaeudelaenge] = useState('');  // Gebäudelänge in m
  const [gebaeudebreite, setGebaeudebreite] = useState('');  // Gebäudebreite in m
  const [traufhoehe, setTraufhoehe] = useState('');          // Traufhöhe in m
  
  // Dachneigungen (für verschiedene Dachflächen)
  const [dachneigung1, setDachneigung1] = useState('');      // DF 1 in °
  const [dachneigung2, setDachneigung2] = useState('');      // DF 2 in °
  const [dachneigung3, setDachneigung3] = useState('');      // DF 3 in ° (für Walmdach)
  const [dachneigung4, setDachneigung4] = useState('');      // DF 4 in ° (für Walmdach)
  
  // Mansarddach spezifisch (wie in DachCAD)
  const [neigungLangUnten, setNeigungLangUnten] = useState('');    // Dachneig. lange Seite unten (steil)
  const [neigungLangOben, setNeigungLangOben] = useState('');      // Dachneig. lange Seite oben (flach)
  const [neigungSchmalUnten, setNeigungSchmalUnten] = useState(''); // Dachneig. schmale Seite unten
  const [neigungSchmalOben, setNeigungSchmalOben] = useState('');   // Dachneig. schmale Seite oben
  const [knickhoehe, setKnickhoehe] = useState('');                 // Trauf(Knick)höhe in m
  
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Berechnete Werte
  const [calculatedFirsthoehe, setCalculatedFirsthoehe] = useState(0);

  // Automatisch Dachneigung 2 = Dachneigung 1 setzen wenn leer
  useEffect(() => {
    if (roofType === 'Satteldach' && dachneigung1 && !dachneigung2) {
      setDachneigung2(dachneigung1);
    }
  }, [dachneigung1, roofType]);

  // Firsthöhe berechnen wenn sich Werte ändern
  useEffect(() => {
    calculateFirsthoehe();
  }, [gebaeudebreite, dachneigung1, dachneigung2, roofType]);

  // Firsthöhe berechnen basierend auf Dachneigung
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
        // Firsthöhe = Breite × tan(Neigung)
        firsthoehe = breite * Math.tan(rad1);
        break;
      case 'Satteldach':
        // Bei symmetrischem Dach: Firsthöhe = (Breite/2) × tan(Neigung)
        // Bei asymmetrischem: Schnittpunkt der beiden Dachflächen berechnen
        if (neigung1 === neigung2) {
          firsthoehe = (breite / 2) * Math.tan(rad1);
        } else {
          // Asymmetrisches Satteldach
          // x1 × tan(α1) = (B - x1) × tan(α2)
          // x1 = B × tan(α2) / (tan(α1) + tan(α2))
          const tan1 = Math.tan(rad1);
          const tan2 = Math.tan(rad2);
          const x1 = (breite * tan2) / (tan1 + tan2);
          firsthoehe = x1 * tan1;
        }
        break;
      case 'Zeltdach':
        // Firsthöhe = (Seitenlänge/2) × tan(Neigung)
        const laenge = parseFloat(gebaeudelaenge) || breite;
        firsthoehe = (Math.min(laenge, breite) / 2) * Math.tan(rad1);
        break;
      case 'Walmdach':
        // Ähnlich wie Satteldach
        firsthoehe = (breite / 2) * Math.tan(rad1);
        break;
      default:
        firsthoehe = 0;
    }

    setCalculatedFirsthoehe(Math.max(0, firsthoehe));
  };

  // Berechnung der Dachfläche je nach Dachtyp
  const calculateArea = () => {
    const L = parseFloat(gebaeudelaenge) || 0;  // Gebäudelänge
    const B = parseFloat(gebaeudebreite) || 0;  // Gebäudebreite
    const n1 = parseFloat(dachneigung1) || 0;   // Dachneigung 1
    const n2 = parseFloat(dachneigung2) || n1;  // Dachneigung 2
    const n3 = parseFloat(dachneigung3) || n1;  // Dachneigung 3
    const n4 = parseFloat(dachneigung4) || n2;  // Dachneigung 4
    
    // Mansarddach Variablen
    const nLangUnten = parseFloat(neigungLangUnten) || 0;   // Neigung lange Seite unten
    const nLangOben = parseFloat(neigungLangOben) || 0;     // Neigung lange Seite oben
    const nSchmalUnten = parseFloat(neigungSchmalUnten) || 0; // Neigung schmale Seite unten
    const nSchmalOben = parseFloat(neigungSchmalOben) || 0;   // Neigung schmale Seite oben
    const hKnick = parseFloat(knickhoehe) || 0;             // Trauf(Knick)höhe

    let area = 0;

    switch (roofType) {
      case 'Flachdach':
        // Einfache Rechteckfläche
        area = L * B;
        break;

      case 'Pultdach': {
        // Fläche = Länge × Sparrenlänge
        // Sparrenlänge = Breite / cos(Neigung)
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
        // Zwei Dachflächen
        // Sparrenlänge DF1 = (Breite × Anteil1) / cos(Neigung1)
        // Sparrenlänge DF2 = (Breite × Anteil2) / cos(Neigung2)
        if (n1 > 0) {
          const rad1 = (n1 * Math.PI) / 180;
          const rad2 = (n2 * Math.PI) / 180;
          
          let b1, b2;
          if (n1 === n2) {
            b1 = b2 = B / 2;
          } else {
            // Asymmetrisches Dach - First nicht in der Mitte
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
        // 4 Dachflächen: 2 Trapeze (längs) + 2 Dreiecke (Giebel)
        if (n1 > 0) {
          const rad1 = (n1 * Math.PI) / 180;  // Lange Seiten
          const rad2 = (n2 * Math.PI) / 180;  // Lange Seiten (andere)
          const rad3 = (n3 * Math.PI) / 180;  // Walmseite 1
          const rad4 = (n4 * Math.PI) / 180;  // Walmseite 2
          
          // Sparrenlänge für die langen Seiten (Höhe der Trapeze)
          const sparrenLang = (B / 2) / Math.cos(rad1);
          
          // Firsthöhe
          const firsthoehe = (B / 2) * Math.tan(rad1);
          
          // Gratlänge (vom First zur Ecke)
          // Bei Walmdach liegt der First nicht über die gesamte Länge
          // Firstlänge = Gebäudelänge - 2 × (Breite/2) / tan(Walmneigung) × tan(Hauptneigung)
          const walmTiefe = firsthoehe / Math.tan(rad3);
          const firstlaenge = Math.max(0, L - 2 * walmTiefe);
          
          // Trapezflächen (lange Seiten)
          // Fläche = ((Firstlänge + Trauflänge) / 2) × Sparrenlänge
          const trapezFlaeche1 = ((firstlaenge + L) / 2) * sparrenLang;
          const sparrenLang2 = (B / 2) / Math.cos(rad2);
          const trapezFlaeche2 = ((firstlaenge + L) / 2) * sparrenLang2;
          
          // Walmflächen (Dreiecksflächen an den Giebelseiten)
          // Sparrenlänge Walm = Firsthöhe / sin(Walmneigung)
          const sparrenWalm1 = firsthoehe / Math.sin(rad3);
          const sparrenWalm2 = firsthoehe / Math.sin(rad4);
          const dreieckFlaeche1 = (B / 2) * sparrenWalm1;
          const dreieckFlaeche2 = (B / 2) * sparrenWalm2;
          
          area = trapezFlaeche1 + trapezFlaeche2 + dreieckFlaeche1 + dreieckFlaeche2;
        } else {
          area = L * B * 1.15;  // Fallback mit ~15% Aufschlag
        }
        break;
      }

      case 'Zeltdach': {
        // 4 gleiche Dreiecksflächen
        // Bei quadratischem Grundriss: Länge = Breite
        if (n1 > 0) {
          const seite = L; // Quadratischer Grundriss angenommen
          const rad = (n1 * Math.PI) / 180;
          
          // Sparrenlänge = (Seitenlänge/2) / cos(Neigung)
          const sparrenlaenge = (seite / 2) / Math.cos(rad);
          
          // Fläche eines Dreiecks = (Basis × Sparrenlänge) / 2
          // 4 Dreiecke
          area = 4 * (seite / 2) * sparrenlaenge;
        } else {
          area = L * L;
        }
        break;
      }

      case 'Mansarddach': {
        // Mansarddach: 4 Dachflächen (lange + schmale Seiten), jeweils unten (steil) + oben (flach)
        // Basierend auf DachCAD-Eingaben
        if (nLangUnten > 0 && nLangOben > 0 && hKnick > 0) {
          // Umrechnung in Radiant
          const radLangUnten = (nLangUnten * Math.PI) / 180;
          const radLangOben = (nLangOben * Math.PI) / 180;
          const radSchmalUnten = (nSchmalUnten || nLangUnten) * Math.PI / 180;
          const radSchmalOben = (nSchmalOben || nLangOben) * Math.PI / 180;
          
          // Sparrenlänge unten (steil) = Knickhöhe / sin(Neigung)
          const sparrenLangUnten = hKnick / Math.sin(radLangUnten);
          const sparrenSchmalUnten = hKnick / Math.sin(radSchmalUnten);
          
          // Horizontale Ausdehnung des unteren Teils = Knickhöhe / tan(Neigung)
          const breiteUntenLang = hKnick / Math.tan(radLangUnten);
          const breiteUntenSchmal = hKnick / Math.tan(radSchmalUnten);
          
          // Verbleibende Breite für oberen Teil
          // Für lange Seite: Gebäudebreite - 2 × breiteUntenLang
          const restBreiteLang = Math.max(0, B - 2 * breiteUntenLang);
          // Für schmale Seite: Gebäudelänge - 2 × breiteUntenSchmal
          const restBreiteSchmal = Math.max(0, L - 2 * breiteUntenSchmal);
          
          // Sparrenlänge oben (flach) = (Restbreite/2) / cos(Neigung)
          const sparrenLangOben = (restBreiteLang / 2) / Math.cos(radLangOben);
          const sparrenSchmalOben = (restBreiteSchmal / 2) / Math.cos(radSchmalOben);
          
          // Untere Flächen (2 lange Seiten + 2 schmale Seiten)
          const flaecheLangUnten = 2 * L * sparrenLangUnten;   // 2 lange Seiten
          const flaecheSchmalUnten = 2 * B * sparrenSchmalUnten; // 2 schmale Seiten
          
          // Obere Flächen (2 lange Seiten + 2 schmale Seiten) 
          // Wie Walmdach: Trapeze an langen Seiten, Dreiecke an schmalen
          const flaecheLangOben = 2 * L * sparrenLangOben;
          const flaecheSchmalOben = 2 * B * sparrenSchmalOben;
          
          area = flaecheLangUnten + flaecheSchmalUnten + flaecheLangOben + flaecheSchmalOben;
        } else {
          area = L * B * 1.4; // Fallback mit Aufschlag für Mansarddach
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

    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/roofs`, {
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
          // Mansarddach Felder
          neigung_lang_unten: parseFloat(neigungLangUnten) || 0,
          neigung_lang_oben: parseFloat(neigungLangOben) || 0,
          neigung_schmal_unten: parseFloat(neigungSchmalUnten) || 0,
          neigung_schmal_oben: parseFloat(neigungSchmalOben) || 0,
          knickhoehe: parseFloat(knickhoehe) || 0,
          firsthoehe: calculatedFirsthoehe,
          // Legacy-Felder für Kompatibilität
          length: parseFloat(gebaeudelaenge),
          width: parseFloat(gebaeudebreite),
        },
        area,
        notes: notes || undefined,
      });
      Alert.alert('Erfolg', 'Dachmessung wurde gespeichert', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error creating roof:', error);
      Alert.alert('Fehler', 'Dachmessung konnte nicht gespeichert werden');
    } finally {
      setLoading(false);
    }
  };

  const calculatedArea = calculateArea();

  // Beim Wechsel des Dachtyps Felder zurücksetzen
  const handleRoofTypeChange = (newType: string) => {
    setRoofType(newType);
    setShowRoofTypePicker(false);
    // Spezifische Felder zurücksetzen
    setDachneigung2('');
    setDachneigung3('');
    setDachneigung4('');
    setNeigungUnten('');
    setStockwerkhoehe('');
    setNeigungOben('');
  };

  // Dynamische Eingabefelder je nach Dachtyp
  const renderMeasurementFields = () => {
    switch (roofType) {
      case 'Flachdach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudelänge (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 12.0"
                value={gebaeudelaenge}
                onChangeText={setGebaeudelaenge}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 8.0"
                value={gebaeudebreite}
                onChangeText={setGebaeudebreite}
                keyboardType="decimal-pad"
              />
            </View>
          </>
        );

      case 'Pultdach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudelänge (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 12.0"
                value={gebaeudelaenge}
                onChangeText={setGebaeudelaenge}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 8.0"
                value={gebaeudebreite}
                onChangeText={setGebaeudebreite}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Dachneigung (°) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 15"
                value={dachneigung1}
                onChangeText={setDachneigung1}
                keyboardType="decimal-pad"
              />
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
              <TextInput
                style={styles.input}
                placeholder="z.B. 12.0"
                value={gebaeudelaenge}
                onChangeText={setGebaeudelaenge}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 10.0"
                value={gebaeudebreite}
                onChangeText={setGebaeudebreite}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionText}>Dachneigungen</Text>
            </View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Dachfläche 1 (°) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 35"
                  value={dachneigung1}
                  onChangeText={setDachneigung1}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Dachfläche 2 (°)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="gleich wie DF1"
                  value={dachneigung2}
                  onChangeText={setDachneigung2}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <Text style={styles.hint}>Bei unterschiedlichen Neigungen: asymmetrisches Satteldach</Text>
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
              <TextInput
                style={styles.input}
                placeholder="z.B. 14.0"
                value={gebaeudelaenge}
                onChangeText={setGebaeudelaenge}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 10.0"
                value={gebaeudebreite}
                onChangeText={setGebaeudebreite}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionText}>Dachneigungen (4 Flächen)</Text>
            </View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>DF 1 - Längsseite (°)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 35"
                  value={dachneigung1}
                  onChangeText={(val) => {
                    setDachneigung1(val);
                    if (!dachneigung2) setDachneigung2(val);
                  }}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>DF 2 - Längsseite (°)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="gleich wie DF1"
                  value={dachneigung2}
                  onChangeText={setDachneigung2}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>DF 3 - Walmseite (°)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 35"
                  value={dachneigung3}
                  onChangeText={(val) => {
                    setDachneigung3(val);
                    if (!dachneigung4) setDachneigung4(val);
                  }}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>DF 4 - Walmseite (°)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="gleich wie DF3"
                  value={dachneigung4}
                  onChangeText={setDachneigung4}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Traufhöhe (m)</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 3.0"
                value={traufhoehe}
                onChangeText={setTraufhoehe}
                keyboardType="decimal-pad"
              />
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
              <TextInput
                style={styles.input}
                placeholder="z.B. 8.0"
                value={gebaeudelaenge}
                onChangeText={(val) => {
                  setGebaeudelaenge(val);
                  setGebaeudebreite(val); // Quadratisch
                }}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Dachneigung (°) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 30"
                value={dachneigung1}
                onChangeText={setDachneigung1}
                keyboardType="decimal-pad"
              />
            </View>
            <Text style={styles.hint}>Zeltdach: Quadratischer Grundriss, 4 gleiche Dreiecksflächen</Text>
            {calculatedFirsthoehe > 0 && (
              <View style={styles.calculatedValue}>
                <Text style={styles.calculatedLabel}>Berechnete Firsthöhe (Spitze):</Text>
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
              <TextInput
                style={styles.input}
                placeholder="z.B. 12.0"
                value={gebaeudelaenge}
                onChangeText={setGebaeudelaenge}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 10.0"
                value={gebaeudebreite}
                onChangeText={setGebaeudebreite}
                keyboardType="decimal-pad"
              />
            </View>
            
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionText}>Unterer Teil (Mansarde - steil)</Text>
            </View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Neigung unten (°) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 70"
                  value={neigungUnten}
                  onChangeText={setNeigungUnten}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Stockwerkhöhe (m) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 2.5"
                  value={stockwerkhoehe}
                  onChangeText={setStockwerkhoehe}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionText}>Oberer Teil (Walm - flacher)</Text>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Neigung oben (°) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 25"
                value={neigungOben}
                onChangeText={setNeigungOben}
                keyboardType="decimal-pad"
              />
            </View>
            <Text style={styles.hint}>Mansarddach: Steiler unterer Teil für Wohnraum, flacherer oberer Teil</Text>
          </>
        );

      default:
        return null;
    }
  };

  // Formel-Text für Anzeige
  const getFormulaText = () => {
    switch (roofType) {
      case 'Flachdach':
        return 'Formel: Länge × Breite';
      case 'Pultdach':
        return 'Formel: Länge × (Breite / cos(Neigung))';
      case 'Satteldach':
        return 'Formel: L × Sparren1 + L × Sparren2';
      case 'Walmdach':
        return 'Formel: 2 Trapeze + 2 Walmdreiecke';
      case 'Zeltdach':
        return 'Formel: 4 × (Seite/2 × Sparrenlänge)';
      case 'Mansarddach':
        return 'Formel: Fläche unten + Fläche oben';
      default:
        return '';
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView}>
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Dachtyp *</Text>
            <TouchableOpacity
              style={styles.roofTypeSelector}
              onPress={() => setShowRoofTypePicker(true)}
            >
              <View style={styles.roofTypeSelectorContent}>
                <Ionicons name="home" size={24} color="#1976d2" />
                <View style={styles.roofTypeSelectorText}>
                  <Text style={styles.roofTypeName}>{roofType}</Text>
                  <Text style={styles.roofTypeDesc}>
                    {ROOF_TYPES.find(r => r.id === roofType)?.description}
                  </Text>
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
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Zusätzliche Hinweise..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Wird gespeichert...' : 'Dachmessung speichern'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Roof Type Picker Modal */}
      <Modal
        visible={showRoofTypePicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRoofTypePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dachtyp auswählen</Text>
              <TouchableOpacity onPress={() => setShowRoofTypePicker(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={ROOF_TYPES}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.roofTypeItem,
                    item.id === roofType && styles.roofTypeItemSelected,
                  ]}
                  onPress={() => handleRoofTypeChange(item.id)}
                >
                  <View style={styles.roofTypeItemContent}>
                    <Ionicons 
                      name="home" 
                      size={28} 
                      color={item.id === roofType ? '#1976d2' : '#666'} 
                    />
                    <View style={styles.roofTypeItemTextContainer}>
                      <Text style={[
                        styles.roofTypeItemText,
                        item.id === roofType && styles.roofTypeItemTextSelected,
                      ]}>
                        {item.name}
                      </Text>
                      <Text style={styles.roofTypeItemDesc}>{item.description}</Text>
                    </View>
                  </View>
                  {item.id === roofType && (
                    <Ionicons name="checkmark-circle" size={24} color="#1976d2" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  form: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  inputHalf: {
    flex: 1,
  },
  hint: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 8,
  },
  sectionDivider: {
    backgroundColor: '#e8e8e8',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
    marginTop: 4,
  },
  sectionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  calculatedValue: {
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  calculatedLabel: {
    fontSize: 14,
    color: '#2e7d32',
  },
  calculatedNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  measurementsCard: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 16,
  },
  resultCard: {
    backgroundColor: '#4caf50',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  resultLabel: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
  },
  resultValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  resultFormula: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
  },
  button: {
    backgroundColor: '#1976d2',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  roofTypeSelector: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roofTypeSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  roofTypeSelectorText: {
    flex: 1,
  },
  roofTypeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  roofTypeDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  roofTypeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  roofTypeItemSelected: {
    backgroundColor: '#e3f2fd',
  },
  roofTypeItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  roofTypeItemTextContainer: {
    flex: 1,
  },
  roofTypeItemText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  roofTypeItemTextSelected: {
    color: '#1976d2',
    fontWeight: '600',
  },
  roofTypeItemDesc: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
});

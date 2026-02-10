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
  { id: 'Krueppelwalmdach', name: 'Krüppelwalmdach', description: 'Satteldach mit abgewalmten Giebeln' },
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
  const [ueberstandTraufe, setUeberstandTraufe] = useState('');      // Überstand Traufseite (beeinflusst Breite)
  const [ueberstandGiebelseite, setUeberstandGiebelseite] = useState('');  // Überstand Giebelseite (beeinflusst Länge)
  const [ueberstandPult, setUeberstandPult] = useState('');          // Überstand Pultseite (nur bei Pultdach)
  
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
  
  // Krüppelwalmdach spezifisch
  const [traufhoeheWalm, setTraufhoeheWalm] = useState('');         // Traufhöhe der Walme (höher als Hauptdach)
  
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Berechnete Werte
  const [calculatedFirsthoehe, setCalculatedFirsthoehe] = useState(0);

  // Helper-Funktion: Komma durch Punkt ersetzen (für deutsche Dezimalzahlen)
  const formatDecimal = (text: string) => text.replace(',', '.');

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
    
    // Dachüberstände
    const ueberstandGiebel = parseFloat(ueberstandGiebelseite) || 0;  // Beeinflusst Länge
    const uTraufe = parseFloat(ueberstandTraufe) || 0;  // Traufe-Überstand
    const uPult = parseFloat(ueberstandPult) || 0;      // Pult-Überstand (nur bei Pultdach)
    
    // Effektive Maße berechnen
    const effL = L + 2 * ueberstandGiebel;  // Effektive Länge mit Giebelüberstand
    // Bei Pultdach: Traufe + Pult Überstand; sonst: 2x Traufe
    const effB = roofType === 'Pultdach' 
      ? B + uTraufe + uPult 
      : B + 2 * uTraufe;
    
    // Mansarddach Variablen
    const nLangUnten = parseFloat(neigungLangUnten) || 0;
    const nLangOben = parseFloat(neigungLangOben) || 0;
    const nSchmalUnten = parseFloat(neigungSchmalUnten) || 0;
    const nSchmalOben = parseFloat(neigungSchmalOben) || 0;
    const hKnick = parseFloat(knickhoehe) || 0;

    let area = 0;

    switch (roofType) {
      case 'Flachdach':
        // Einfache Rechteckfläche mit Überstand
        area = effL * effB;
        break;

      case 'Pultdach': {
        // Fläche = Länge × Sparrenlänge (mit Traufe- und Pult-Überstand)
        if (n1 > 0) {
          const rad = (n1 * Math.PI) / 180;
          const sparrenlaenge = effB / Math.cos(rad);
          area = effL * sparrenlaenge;
        } else {
          area = effL * effB;
        }
        break;
      }

      case 'Satteldach': {
        // Zwei Dachflächen (mit Überstand)
        if (n1 > 0) {
          const rad1 = (n1 * Math.PI) / 180;
          const rad2 = (n2 * Math.PI) / 180;
          
          let b1, b2;
          if (n1 === n2) {
            b1 = b2 = effB / 2;
          } else {
            const tan1 = Math.tan(rad1);
            const tan2 = Math.tan(rad2);
            b1 = (effB * tan2) / (tan1 + tan2);
            b2 = effB - b1;
          }
          
          const sparren1 = b1 / Math.cos(rad1);
          const sparren2 = b2 / Math.cos(rad2);
          
          area = effL * sparren1 + effL * sparren2;
        } else {
          area = effL * effB;
        }
        break;
      }

      case 'Walmdach': {
        // 4 Dachflächen: 2 Trapeze (längs) + 2 Dreiecke (Giebel) - mit Überstand
        if (n1 > 0) {
          const rad1 = (n1 * Math.PI) / 180;
          const rad2 = (n2 * Math.PI) / 180;
          const rad3 = (n3 * Math.PI) / 180;
          const rad4 = (n4 * Math.PI) / 180;
          
          // Sparrenlänge für die langen Seiten
          const sparrenLang = (effB / 2) / Math.cos(rad1);
          
          // Firsthöhe
          const firsthoehe = (effB / 2) * Math.tan(rad1);
          
          // Walmtiefe und Firstlänge
          const walmTiefe = firsthoehe / Math.tan(rad3);
          const firstlaenge = Math.max(0, effL - 2 * walmTiefe);
          
          // Trapezflächen (lange Seiten)
          const trapezFlaeche1 = ((firstlaenge + effL) / 2) * sparrenLang;
          const sparrenLang2 = (effB / 2) / Math.cos(rad2);
          const trapezFlaeche2 = ((firstlaenge + effL) / 2) * sparrenLang2;
          
          // Walmflächen (Dreiecksflächen)
          const sparrenWalm1 = firsthoehe / Math.sin(rad3);
          const sparrenWalm2 = firsthoehe / Math.sin(rad4);
          const dreieckFlaeche1 = (effB / 2) * sparrenWalm1;
          const dreieckFlaeche2 = (effB / 2) * sparrenWalm2;
          
          area = trapezFlaeche1 + trapezFlaeche2 + dreieckFlaeche1 + dreieckFlaeche2;
        } else {
          area = effL * effB * 1.15;
        }
        break;
      }

      case 'Zeltdach': {
        // 4 gleiche Dreiecksflächen - mit Überstand (nur Traufe, an allen 4 Seiten)
        const uTraufeZelt = parseFloat(ueberstandTraufe) || 0;
        const seite = L + 2 * uTraufeZelt; // Quadratischer Grundriss mit Überstand an allen Seiten
        
        if (n1 > 0) {
          const rad = (n1 * Math.PI) / 180;
          
          // Sparrenlänge = (Seitenlänge/2) / cos(Neigung)
          const sparrenlaenge = (seite / 2) / Math.cos(rad);
          
          // 4 Dreiecke
          area = 4 * (seite / 2) * sparrenlaenge;
        } else {
          area = seite * seite;
        }
        break;
      }

      case 'Krueppelwalmdach': {
        // Krüppelwalmdach: Satteldach mit abgewalmten Giebeln
        // - 2 trapezförmige Hauptdachflächen (Längsseiten)
        // - 2 dreieckige/trapezförmige Walmflächen (Giebelseiten)
        // Die Walmflächen beginnen ab der Traufhöhe der Walme (höher als Haupttraufe)
        
        const traufWalm = parseFloat(traufhoeheWalm) || 0; // Traufhöhe der Walme in m
        
        if (n1 > 0) {
          const rad1 = (n1 * Math.PI) / 180; // Dachneigung Längsseiten
          const rad2 = (n2 * Math.PI) / 180;
          const rad3 = (n3 * Math.PI) / 180; // Dachneigung Walmseiten
          const rad4 = (n4 * Math.PI) / 180;
          
          // Firsthöhe über Traufe (Hauptdach)
          const firsthoehe = (effB / 2) * Math.tan(rad1);
          
          // Walmhöhe = Firsthöhe - Traufhöhe der Walme
          // Wenn die Walm-Traufhöhe z.B. 2m ist und Firsthöhe 4m, ist die Walmhöhe 2m
          const walmHoehe = Math.max(0, firsthoehe - traufWalm);
          
          // Walmtiefe (horizontale Tiefe des Walms in Längsrichtung)
          // Bei gegebener Walmhöhe und Walmneigung
          const walmTiefe = n3 > 0 ? walmHoehe / Math.tan(rad3) : 0;
          
          // Firstlänge (kürzer als Gebäudelänge wegen der beiden Walme)
          const firstLaenge = Math.max(0, effL - 2 * walmTiefe);
          
          // === HAUPTDACHFLÄCHEN (Trapeze) - Längsseiten ===
          // Diese gehen von der Traufe (0m) bis zum First
          const sparrenLaenge1 = (effB / 2) / Math.cos(rad1);
          const sparrenLaenge2 = (effB / 2) / Math.cos(rad2);
          
          // Trapez: ((Trauflänge + Firstlänge) / 2) * Sparrenlänge
          const trapez1 = ((effL + firstLaenge) / 2) * sparrenLaenge1;
          const trapez2 = ((effL + firstLaenge) / 2) * sparrenLaenge2;
          
          // === WALMFLÄCHEN (Dreiecke) - Giebelseiten ===
          // Die Walme beginnen ab der Walm-Traufhöhe
          // Sparrenlänge des Walms = Walmhöhe / sin(Walmneigung)
          const walmSparren3 = n3 > 0 ? walmHoehe / Math.sin(rad3) : 0;
          const walmSparren4 = n4 > 0 ? walmHoehe / Math.sin(rad4) : walmSparren3;
          
          // Die Basis der Walmfläche ist die Gebäudebreite
          // Dreieck: (Basis * Sparrenlänge) / 2
          const dreieck1 = (effB * walmSparren3) / 2;
          const dreieck2 = (effB * walmSparren4) / 2;
          
          area = trapez1 + trapez2 + dreieck1 + dreieck2;
        } else {
          area = effL * effB * 1.1; // Näherung
        }
        break;
      }

      case 'Mansarddach': {
        // Mansarddach: KORREKTE Geometrie mit Überstand
        // UNTEN: 4 Trapeze
        // OBEN: Walmdach auf der Restfläche
        if (nLangUnten > 0 && hKnick > 0) {
          const radLangUnten = (nLangUnten * Math.PI) / 180;
          const radSchmalUnten = ((nSchmalUnten || nLangUnten) * Math.PI) / 180;
          const radLangOben = nLangOben > 0 ? (nLangOben * Math.PI) / 180 : 0;
          const radSchmalOben = nSchmalOben > 0 ? ((nSchmalOben || nLangOben) * Math.PI) / 180 : radLangOben;
          
          // Sparrenlängen unten
          const sparrenLangUnten = hKnick / Math.sin(radLangUnten);
          const sparrenSchmalUnten = hKnick / Math.sin(radSchmalUnten);
          
          // Horizontale Ausdehnung
          const horizontalLangUnten = hKnick / Math.tan(radLangUnten);
          const horizontalSchmalUnten = hKnick / Math.tan(radSchmalUnten);
          
          // === UNTERER TEIL: 4 TRAPEZE (mit Überstand) ===
          const untereBasisLang = effL;
          const obereBasisLang = Math.max(0, effL - 2 * horizontalSchmalUnten);
          const trapezLang = ((untereBasisLang + obereBasisLang) / 2) * sparrenLangUnten;
          
          const untereBasisSchmal = effB;
          const obereBasisSchmal = Math.max(0, effB - 2 * horizontalLangUnten);
          const trapezSchmal = ((untereBasisSchmal + obereBasisSchmal) / 2) * sparrenSchmalUnten;
          
          const flaecheUnten = 2 * trapezLang + 2 * trapezSchmal;
          
          // === OBERER TEIL: WALMDACH auf Restfläche ===
          let flaecheOben = 0;
          if (nLangOben > 0 && obereBasisLang > 0 && obereBasisSchmal > 0) {
            const walmdachLaenge = obereBasisLang;
            const walmdachBreite = obereBasisSchmal;
            
            const sparrenLangOben = (walmdachBreite / 2) / Math.cos(radLangOben);
            const sparrenSchmalOben = (walmdachLaenge / 2) / Math.cos(radSchmalOben);
            
            // Bei quadratischem Grundriss: Zeltdach (4 Dreiecke)
            // Bei rechteckigem: 2 Trapeze + 2 Dreiecke
            if (Math.abs(walmdachLaenge - walmdachBreite) < 0.01) {
              // Quadratisch: Zeltdach
              flaecheOben = 4 * (walmdachLaenge / 2) * sparrenLangOben;
            } else {
              // Rechteckig: Walmdach
              // Firsthöhe des oberen Teils
              const firsthoeheOben = (walmdachBreite / 2) * Math.tan(radLangOben);
              // Walmtiefe (wie weit der Walm in die Länge geht)
              const walmtiefe = firsthoeheOben / Math.tan(radSchmalOben);
              const firstlaenge = Math.max(0, walmdachLaenge - 2 * walmtiefe);
              
              // 2 Trapezflächen (lange Seiten)
              const trapezOben = ((firstlaenge + walmdachLaenge) / 2) * sparrenLangOben;
              // 2 Dreiecksflächen (Walmseiten)
              const dreieckOben = (walmdachBreite / 2) * sparrenSchmalOben;
              
              flaecheOben = 2 * trapezOben + 2 * dreieckOben;
            }
          }
          
          area = flaecheUnten + flaecheOben;
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

    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/roofs`, {
        project_id: projectId,
        roof_type: roofType,
        measurements: {
          gebaeudelaenge: parseFloat(gebaeudelaenge),
          gebaeudebreite: parseFloat(gebaeudebreite),
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
    setNeigungLangUnten('');
    setNeigungLangOben('');
    setNeigungSchmalUnten('');
    setNeigungSchmalOben('');
    setKnickhoehe('');
  };

  // Gemeinsame Dachüberstand-Felder für alle Dachtypen (separat für Länge und Breite)
  const renderUeberstandFields = () => (
    <>
      <View style={styles.sectionDivider}>
        <Text style={styles.sectionText}>Dachüberstände (optional)</Text>
      </View>
      <View style={styles.inputRow}>
        <View style={styles.inputHalf}>
          <Text style={styles.label}>Traufe (m)</Text>
          <TextInput
            style={styles.input}
            placeholder="z.B. 0,5"
            value={ueberstandTraufe}
            onChangeText={(text) => setUeberstandTraufe(formatDecimal(text))}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.inputHalf}>
          <Text style={styles.label}>Giebel (m)</Text>
          <TextInput
            style={styles.input}
            placeholder="z.B. 0,3"
            value={ueberstandGiebelseite}
            onChangeText={(text) => setUeberstandGiebelseite(formatDecimal(text))}
            keyboardType="decimal-pad"
          />
        </View>
      </View>
    </>
  );

  // Spezielle Überstand-Felder für Pultdach (Traufe + Pult)
  const renderPultdachUeberstandFields = () => (
    <>
      <View style={styles.sectionDivider}>
        <Text style={styles.sectionText}>Dachüberstände (optional)</Text>
      </View>
      <View style={styles.inputRow}>
        <View style={styles.inputHalf}>
          <Text style={styles.label}>Traufe (m)</Text>
          <TextInput
            style={styles.input}
            placeholder="z.B. 0,5"
            value={ueberstandTraufe}
            onChangeText={(text) => setUeberstandTraufe(formatDecimal(text))}
            keyboardType="decimal-pad"
          />
          <Text style={styles.hint}>Untere Seite</Text>
        </View>
        <View style={styles.inputHalf}>
          <Text style={styles.label}>Pult (m)</Text>
          <TextInput
            style={styles.input}
            placeholder="z.B. 0,3"
            value={ueberstandPult}
            onChangeText={(text) => setUeberstandPult(formatDecimal(text))}
            keyboardType="decimal-pad"
          />
          <Text style={styles.hint}>Obere Seite</Text>
        </View>
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Giebel (m)</Text>
        <TextInput
          style={styles.input}
          placeholder="z.B. 0,3"
          value={ueberstandGiebelseite}
          onChangeText={(text) => setUeberstandGiebelseite(formatDecimal(text))}
          keyboardType="decimal-pad"
        />
      </View>
    </>
  );

  // Dynamische Eingabefelder je nach Dachtyp
  const renderMeasurementFields = () => {
    switch (roofType) {
      case 'Flachdach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudelänge (Traufseite) (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 12,0"
                value={gebaeudelaenge}
                onChangeText={(text) => setGebaeudelaenge(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 8,0"
                value={gebaeudebreite}
                onChangeText={(text) => setGebaeudebreite(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
            </View>
            {renderUeberstandFields()}
          </>
        );

      case 'Pultdach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudelänge (Traufseite) (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 12,0"
                value={gebaeudelaenge}
                onChangeText={(text) => setGebaeudelaenge(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 8,0"
                value={gebaeudebreite}
                onChangeText={(text) => setGebaeudebreite(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Dachneigung (°) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 15"
                value={dachneigung1}
                onChangeText={(text) => setDachneigung1(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
            </View>
            {renderPultdachUeberstandFields()}
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
              <Text style={styles.label}>Gebäudelänge (Traufseite) (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 12,0"
                value={gebaeudelaenge}
                onChangeText={(text) => setGebaeudelaenge(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 10,0"
                value={gebaeudebreite}
                onChangeText={(text) => setGebaeudebreite(formatDecimal(text))}
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
                  onChangeText={(text) => setDachneigung1(formatDecimal(text))}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Dachfläche 2 (°)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="gleich wie DF1"
                  value={dachneigung2}
                  onChangeText={(text) => setDachneigung2(formatDecimal(text))}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <Text style={styles.hint}>Bei unterschiedlichen Neigungen: asymmetrisches Satteldach</Text>
            {renderUeberstandFields()}
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
              <Text style={styles.label}>Gebäudelänge (Traufseite) (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 14.0"
                value={gebaeudelaenge}
                onChangeText={(text) => setGebaeudelaenge(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 10,0"
                value={gebaeudebreite}
                onChangeText={(text) => setGebaeudebreite(formatDecimal(text))}
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
                  onChangeText={(val) => setDachneigung1(formatDecimal(val))}
                  onBlur={() => { if (dachneigung1 && !dachneigung2) setDachneigung2(dachneigung1); }}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>DF 2 - Längsseite (°)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="gleich wie DF1"
                  value={dachneigung2}
                  onChangeText={(text) => setDachneigung2(formatDecimal(text))}
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
                  onChangeText={(val) => setDachneigung3(formatDecimal(val))}
                  onBlur={() => { if (dachneigung3 && !dachneigung4) setDachneigung4(dachneigung3); }}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>DF 4 - Walmseite (°)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="gleich wie DF3"
                  value={dachneigung4}
                  onChangeText={(text) => setDachneigung4(formatDecimal(text))}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            {renderUeberstandFields()}
            {calculatedFirsthoehe > 0 && (
              <View style={styles.calculatedValue}>
                <Text style={styles.calculatedLabel}>Berechnete Firsthöhe:</Text>
                <Text style={styles.calculatedNumber}>{calculatedFirsthoehe.toFixed(2)} m</Text>
              </View>
            )}
          </>
        );

      case 'Krueppelwalmdach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudelänge (Traufseite) (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 12,0"
                value={gebaeudelaenge}
                onChangeText={(text) => setGebaeudelaenge(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 10,0"
                value={gebaeudebreite}
                onChangeText={(text) => setGebaeudebreite(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionText}>Dachneigungen</Text>
            </View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>DF 1 Längs (°) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 45"
                  value={dachneigung1}
                  onChangeText={(val) => setDachneigung1(formatDecimal(val))}
                  onBlur={() => { if (dachneigung1 && !dachneigung2) setDachneigung2(dachneigung1); }}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>DF 2 Längs (°)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="gleich"
                  value={dachneigung2}
                  onChangeText={(text) => setDachneigung2(formatDecimal(text))}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>DF 3 Walm (°)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 60"
                  value={dachneigung3}
                  onChangeText={(val) => setDachneigung3(formatDecimal(val))}
                  onBlur={() => { if (dachneigung3 && !dachneigung4) setDachneigung4(dachneigung3); }}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>DF 4 Walm (°)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="gleich"
                  value={dachneigung4}
                  onChangeText={(text) => setDachneigung4(formatDecimal(text))}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <Text style={styles.hint}>Krüppelwalmdach: Satteldach mit abgewalmten Giebeln</Text>
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionText}>Traufhöhe Walm</Text>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Traufhöhe der Walme (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 2,0"
                value={traufhoeheWalm}
                onChangeText={(text) => setTraufhoeheWalm(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
              <Text style={styles.hint}>Höhe ab der die Walme beginnen (über Haupttraufe)</Text>
            </View>
            {renderUeberstandFields()}
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
                placeholder="z.B. 8,0"
                value={gebaeudelaenge}
                onChangeText={(val) => {
                  const v = formatDecimal(val);
                  setGebaeudelaenge(v);
                  setGebaeudebreite(v);
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
                onChangeText={(text) => setDachneigung1(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
            </View>
            <Text style={styles.hint}>Zeltdach: Quadratischer Grundriss, 4 gleiche Dreiecksflächen</Text>
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionText}>Dachüberstand (optional)</Text>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Traufe (m)</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 0,5"
                value={ueberstandTraufe}
                onChangeText={(text) => setUeberstandTraufe(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
              <Text style={styles.hint}>Überstand an allen 4 Seiten</Text>
            </View>
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
              <Text style={styles.label}>Gebäudelänge (Traufseite) (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 12,0"
                value={gebaeudelaenge}
                onChangeText={(text) => setGebaeudelaenge(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 10,0"
                value={gebaeudebreite}
                onChangeText={(text) => setGebaeudebreite(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
            </View>
            
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionText}>Trauf(Knick)höhe</Text>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Knickhöhe (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 3.0"
                value={knickhoehe}
                onChangeText={(text) => setKnickhoehe(formatDecimal(text))}
                keyboardType="decimal-pad"
              />
              <Text style={styles.hint}>Höhe von Traufe bis zum Knickpunkt</Text>
            </View>
            
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionText}>Dachneigung lange Seite (°)</Text>
            </View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Unten (steil) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 65"
                  value={neigungLangUnten}
                  onChangeText={(val) => setNeigungLangUnten(formatDecimal(val))}
                  onBlur={() => { if (neigungLangUnten && !neigungSchmalUnten) setNeigungSchmalUnten(neigungLangUnten); }}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Oben (flach) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 20"
                  value={neigungLangOben}
                  onChangeText={(val) => setNeigungLangOben(formatDecimal(val))}
                  onBlur={() => { if (neigungLangOben && !neigungSchmalOben) setNeigungSchmalOben(neigungLangOben); }}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionText}>Dachneigung schmale Seite (°)</Text>
            </View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Unten (steil)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="wie lange Seite"
                  value={neigungSchmalUnten}
                  onChangeText={(text) => setNeigungSchmalUnten(formatDecimal(text))}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Oben (flach)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="wie lange Seite"
                  value={neigungSchmalOben}
                  onChangeText={(text) => setNeigungSchmalOben(formatDecimal(text))}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            {renderUeberstandFields()}
            <Text style={styles.hint}>Mansarddach: 4 Trapeze unten + Walmdach oben</Text>
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

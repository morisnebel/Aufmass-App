import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Keyboard,
  PanResponder,
  Animated,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChecklistService, ProjectService, ChecklistTemplateService } from '../../services/LocalStorage';
import { getFeatures } from '../../services/FeatureFlags';
import { useTranslation } from 'react-i18next';

// Rekursive Struktur für verschachtelte Unterpunkte
interface Measurement {
  expression: string;  // Der Rechenweg z.B. "5,00+6,00+9,20"
  result: number;      // Das Ergebnis z.B. 20.2
  unit: string;        // Die Einheit z.B. "m²"
}

interface RecursiveItem {
  text: string;
  checked: boolean;
  note?: string;
  measurements?: Measurement[];
  subItems?: RecursiveItem[];
  // Bild-Felder
  printImage?: string;
  previewImages?: string[];
  categoryLogo?: string;
  // Referenz-Ordner Felder
  referenceFolderId?: string;
  referenceFolderName?: string;
}

interface Checklist {
  id: string;
  project_id: string;
  template_id: string;
  template_name: string;
  items: RecursiveItem[];
}

export default function EditChecklistScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams();
  
  // iPhone vs iPad Erkennung - für unterschiedliches Layout
  const { width: screenWidth } = useWindowDimensions();
  const isPhone = Platform.OS === 'ios' ? !Platform.isPad : screenWidth < 768;
  
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  // State für neue Unterpunkt-Eingaben (path -> text)
  const [newSubItemTexts, setNewSubItemTexts] = useState<{[key: string]: string}>({});
  // State um zu tracken welche Eingabefelder offen sind
  const [openInputs, setOpenInputs] = useState<Set<string>>(new Set());
  // State für Bearbeitungsmodus (path -> text)
  const [editingItems, setEditingItems] = useState<{[key: string]: string}>({});
  // State für kopiertes Item (Zwischenablage)
  const [copiedItem, setCopiedItem] = useState<RecursiveItem | null>(null);
  // State für eingeklappte Items
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  // State für offene Notiz-Felder (path -> offen)
  const [openNotePaths, setOpenNotePaths] = useState<Set<string>>(new Set());
  // State für offene Messungs-Felder (path -> offen)
  const [openMeasurementPaths, setOpenMeasurementPaths] = useState<Set<string>>(new Set());
  // State für Messungs-Eingabe Modal
  const [measurementModalPath, setMeasurementModalPath] = useState<number[] | null>(null);
  const [measurementExpression, setMeasurementExpression] = useState('');
  const [measurementUnit, setMeasurementUnit] = useState('m²');
  const [editingMeasurementIndex, setEditingMeasurementIndex] = useState<number | null>(null);
  const [showNumpad, setShowNumpad] = useState(true); // Nummernblock anzeigen
  const [numpadMode, setNumpadMode] = useState<'numbers' | 'letters'>('numbers'); // Zahlen oder Buchstaben
  const [numpadCaps, setNumpadCaps] = useState(false); // Groß/Kleinschreibung
  const measurementInputRef = useRef<TextInput>(null); // Ref für Bluetooth-Input
  
  // Verschiebbare Numpad-Position (in alle Richtungen)
  const numpadPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const numpadPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event(
        [null, { dx: numpadPosition.x, dy: numpadPosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        numpadPosition.extractOffset();
      },
    })
  ).current;
  
  // Verfügbare Einheiten
  const availableUnits = ['m', 'm²', 'm³', 'lfm', 'Stück', 'Paar', 'kg', 'l'];

  // Nummernblock-Taste drücken - modifiziert State und behält Fokus
  const handleNumpadPress = (key: string) => {
    if (key === '⌫') {
      setMeasurementExpression(prev => prev.slice(0, -1));
    } else if (key === 'C') {
      setMeasurementExpression('');
    } else {
      setMeasurementExpression(prev => prev + key);
    }
    // Fokus auf Input zurücksetzen für Bluetooth-Eingabe
    setTimeout(() => {
      measurementInputRef.current?.focus();
    }, 10);
  };

  // Funktion zum Berechnen eines Ausdrucks (mit Komma als Dezimaltrenner)
  const calculateExpression = (expr: string): number | null => {
    try {
      // Leerzeichen entfernen und Komma durch Punkt ersetzen
      let cleanExpr = expr.replace(/\s/g, '').replace(/,/g, '.');
      
      // Nur Zahlen und Operatoren erlauben
      if (!/^[\d.+\-*/()]+$/.test(cleanExpr)) {
        return null;
      }
      
      // Berechnung durchführen (sichere eval-Alternative)
      const result = Function('"use strict"; return (' + cleanExpr + ')')();
      
      if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
        return null;
      }
      
      // Auf 2 Dezimalstellen runden
      return Math.round(result * 100) / 100;
    } catch {
      return null;
    }
  };

  // Formatiere Ausdruck für Anzeige (Punkt zu Komma)
  const formatExpression = (expr: string): string => {
    return expr.replace(/\./g, ',').replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/\+/g, ' + ').replace(/-/g, ' - ');
  };

  useEffect(() => {
    loadChecklist();
  }, [id]);

  // Auto-Save bei Änderungen (mit 2 Sekunden Debounce)
  useEffect(() => {
    if (!hasChanges || !checklist) return;
    
    const timer = setTimeout(() => {
      saveChecklistSilent();
      console.log('[Checklist] Auto-saved changes');
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [hasChanges, checklist?.items]);

  // Auto-Save wenn die Seite verlassen wird
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Wird aufgerufen wenn die Seite verlassen wird
        if (hasChanges && checklist) {
          saveChecklistSilent();
        }
      };
    }, [hasChanges, checklist])
  );

  const loadChecklist = async () => {
    try {
      const projects = await ProjectService.getAll();
      let foundChecklist = null;
      const checklistId = Array.isArray(id) ? id[0] : id;
      
      for (const project of projects) {
        const checklists = await ChecklistService.getByProjectId(project.id);
        const cl = checklists.find((c: any) => c.id === checklistId);
        if (cl) {
          foundChecklist = cl;
          break;
        }
      }
      
      if (foundChecklist) {
        // Konvertiere Items zu rekursiver Struktur
        const convertItems = (items: any[]): RecursiveItem[] => {
          return items.map((item: any) => {
            let subItems: RecursiveItem[] = [];
            if (item.subItems && Array.isArray(item.subItems)) {
              subItems = item.subItems.map((sub: any) => {
                if (typeof sub === 'string') {
                  return { text: sub, checked: false, subItems: [], measurements: [] };
                }
                return {
                  text: sub.text || '',
                  checked: sub.checked || false,
                  note: sub.note || '',
                  measurements: sub.measurements || [],
                  subItems: sub.subItems ? convertItems(sub.subItems) : [],
                  // Bild-Daten mit kopieren
                  printImage: sub.printImage,
                  previewImages: sub.previewImages,
                  categoryLogo: sub.categoryLogo,
                  // Referenz-Ordner mit kopieren
                  referenceFolderId: sub.referenceFolderId,
                  referenceFolderName: sub.referenceFolderName,
                };
              });
            }
            return {
              text: item.text || '',
              checked: item.checked || false,
              note: item.note || '',
              measurements: item.measurements || [],
              subItems: subItems,
              // Bild-Daten mit kopieren
              printImage: item.printImage,
              previewImages: item.previewImages,
              categoryLogo: item.categoryLogo,
              // Referenz-Ordner mit kopieren
              referenceFolderId: item.referenceFolderId,
              referenceFolderName: item.referenceFolderName,
            };
          });
        };
        
        const convertedItems = convertItems(foundChecklist.items);
        
        // Alle Items mit Unterpunkten standardmäßig einklappen
        const collectPathsWithSubItems = (items: RecursiveItem[], basePath: number[] = []): string[] => {
          const paths: string[] = [];
          items.forEach((item, index) => {
            const currentPath = [...basePath, index];
            if (item.subItems && item.subItems.length > 0) {
              paths.push(currentPath.join('-'));
              // Rekursiv auch Unterpunkte prüfen
              paths.push(...collectPathsWithSubItems(item.subItems, currentPath));
            }
          });
          return paths;
        };
        
        const pathsToCollapse = collectPathsWithSubItems(convertedItems);
        setCollapsedPaths(new Set(pathsToCollapse));
        
        setChecklist({
          ...foundChecklist,
          items: convertedItems,
        });
      } else {
        Alert.alert(t('common.error'), t('checklists.checklistNotFound'));
      }
    } catch (error) {
      console.error('Error loading checklist:', error);
      Alert.alert(t('common.error'), t('checklists.checklistLoadError'));
    } finally {
      setLoading(false);
    }
  };

  // Rekursiv einen Item an einem Pfad updaten
  const updateItemAtPath = (items: RecursiveItem[], path: number[], updates: Partial<RecursiveItem>): RecursiveItem[] => {
    const newItems = [...items];
    if (path.length === 1) {
      newItems[path[0]] = { ...newItems[path[0]], ...updates };
    } else {
      const [first, ...rest] = path;
      newItems[first] = {
        ...newItems[first],
        subItems: updateItemAtPath(newItems[first].subItems || [], rest, updates),
      };
    }
    return newItems;
  };

  // Toggle checked status und automatisch aufklappen
  const toggleItemChecked = (path: number[]) => {
    if (!checklist) return;
    
    const getItemAtPath = (items: RecursiveItem[], pathArr: number[]): RecursiveItem | null => {
      if (pathArr.length === 0) return null;
      if (pathArr.length === 1) return items[pathArr[0]];
      const [first, ...rest] = pathArr;
      return getItemAtPath(items[first].subItems || [], rest);
    };
    
    const item = getItemAtPath(checklist.items, path);
    if (!item) return;
    
    const newChecked = !item.checked;
    const newItems = updateItemAtPath(checklist.items, path, { checked: newChecked });
    
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
    
    // Auto-expand: Wenn abgehakt UND dieses Item hat Unterpunkte
    if (newChecked) {
      const currentItem = getItemAtPath(newItems, path);
      if (currentItem && currentItem.subItems && currentItem.subItems.length > 0) {
        const currentPathKey = path.join('-');
        
        // Sammle alle Pfade, die aufgeklappt werden sollen
        const pathsToExpand: string[] = [];
        
        // Immer das aktuelle Item aufklappen (falls eingeklappt)
        if (collapsedPaths.has(currentPathKey)) {
          pathsToExpand.push(currentPathKey);
        }
        
        // Zusätzlich den ersten Unterpunkt aufklappen, wenn er Unterpunkte hat
        const firstChild = currentItem.subItems[0];
        if (firstChild && firstChild.subItems && firstChild.subItems.length > 0) {
          const firstChildPath = [...path, 0].join('-');
          if (collapsedPaths.has(firstChildPath)) {
            pathsToExpand.push(firstChildPath);
          }
        }
        
        // Alle gesammelten Pfade aufklappen
        if (pathsToExpand.length > 0) {
          setCollapsedPaths(prev => {
            const newSet = new Set(prev);
            pathsToExpand.forEach(p => newSet.delete(p));
            return newSet;
          });
        }
      }
    }
  };

  // Notiz updaten
  const updateNote = (path: number[], note: string) => {
    if (!checklist) return;
    const newItems = updateItemAtPath(checklist.items, path, { note });
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
  };

  // Item nach oben verschieben
  const moveItemUp = (path: number[]) => {
    if (!checklist || path.length === 0) return;
    
    const index = path[path.length - 1];
    if (index === 0) return; // Schon ganz oben
    
    const moveInArray = (items: RecursiveItem[], currentPath: number[]): RecursiveItem[] => {
      if (currentPath.length === 1) {
        const idx = currentPath[0];
        const newItems = [...items];
        [newItems[idx - 1], newItems[idx]] = [newItems[idx], newItems[idx - 1]];
        return newItems;
      }
      
      const [first, ...rest] = currentPath;
      return items.map((item, i) => {
        if (i === first) {
          return { ...item, subItems: moveInArray(item.subItems || [], rest) };
        }
        return item;
      });
    };
    
    const newItems = moveInArray(checklist.items, path);
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
  };

  // Item nach unten verschieben
  const moveItemDown = (path: number[]) => {
    if (!checklist || path.length === 0) return;
    
    const getArrayLength = (items: RecursiveItem[], currentPath: number[]): number => {
      if (currentPath.length === 1) return items.length;
      const [first, ...rest] = currentPath;
      return getArrayLength(items[first]?.subItems || [], rest);
    };
    
    const index = path[path.length - 1];
    const parentPath = path.slice(0, -1);
    const arrayLength = parentPath.length === 0 
      ? checklist.items.length 
      : getArrayLength(checklist.items, [...parentPath, 0]);
    
    if (index >= arrayLength - 1) return; // Schon ganz unten
    
    const moveInArray = (items: RecursiveItem[], currentPath: number[]): RecursiveItem[] => {
      if (currentPath.length === 1) {
        const idx = currentPath[0];
        const newItems = [...items];
        [newItems[idx], newItems[idx + 1]] = [newItems[idx + 1], newItems[idx]];
        return newItems;
      }
      
      const [first, ...rest] = currentPath;
      return items.map((item, i) => {
        if (i === first) {
          return { ...item, subItems: moveInArray(item.subItems || [], rest) };
        }
        return item;
      });
    };
    
    const newItems = moveInArray(checklist.items, path);
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
  };

  // Messung hinzufügen
  const addMeasurement = (path: number[], expression: string, result: number, unit: string) => {
    if (!checklist) return;
    
    const getItemAtPath = (items: RecursiveItem[], path: number[]): RecursiveItem | null => {
      if (path.length === 0) return null;
      if (path.length === 1) return items[path[0]];
      const [first, ...rest] = path;
      return getItemAtPath(items[first].subItems || [], rest);
    };
    
    const item = getItemAtPath(checklist.items, path);
    if (!item) return;
    
    const newMeasurements = [...(item.measurements || []), { expression, result, unit }];
    const newItems = updateItemAtPath(checklist.items, path, { measurements: newMeasurements });
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
  };

  // Messung entfernen
  const removeMeasurement = (path: number[], measurementIndex: number) => {
    if (!checklist) return;
    
    const getItemAtPath = (items: RecursiveItem[], path: number[]): RecursiveItem | null => {
      if (path.length === 0) return null;
      if (path.length === 1) return items[path[0]];
      const [first, ...rest] = path;
      return getItemAtPath(items[first].subItems || [], rest);
    };
    
    const item = getItemAtPath(checklist.items, path);
    if (!item || !item.measurements) return;
    
    const newMeasurements = item.measurements.filter((_, i) => i !== measurementIndex);
    const newItems = updateItemAtPath(checklist.items, path, { measurements: newMeasurements });
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
  };

  // Messungs-Modal öffnen (für neue Messung)
  const openMeasurementModal = (path: number[]) => {
    setMeasurementModalPath(path);
    setMeasurementExpression('');
    setMeasurementUnit('m²');
    setEditingMeasurementIndex(null);
  };

  // Messungs-Modal zum Bearbeiten öffnen
  const openEditMeasurementModal = (path: number[], index: number, expression: string, unit: string) => {
    setMeasurementModalPath(path);
    setMeasurementExpression(expression);
    setMeasurementUnit(unit);
    setEditingMeasurementIndex(index);
  };

  // Messung aktualisieren
  const updateMeasurement = (path: number[], index: number, expression: string, result: number, unit: string) => {
    if (!checklist) return;
    
    const getItemAtPath = (items: RecursiveItem[], path: number[]): RecursiveItem | null => {
      if (path.length === 0) return null;
      if (path.length === 1) return items[path[0]];
      const [first, ...rest] = path;
      return getItemAtPath(items[first].subItems || [], rest);
    };
    
    const item = getItemAtPath(checklist.items, path);
    if (!item || !item.measurements) return;
    
    const newMeasurements = [...item.measurements];
    newMeasurements[index] = { expression, result, unit };
    const newItems = updateItemAtPath(checklist.items, path, { measurements: newMeasurements });
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
  };

  // Messung bestätigen (neu oder bearbeiten)
  const confirmMeasurement = () => {
    if (!measurementModalPath || !measurementExpression.trim()) {
      setMeasurementModalPath(null);
      return;
    }
    
    const result = calculateExpression(measurementExpression);
    if (result === null) {
      Alert.alert(t('common.error'), t('checklists.invalidExpression'));
      return;
    }
    
    if (editingMeasurementIndex !== null) {
      // Bearbeiten
      updateMeasurement(measurementModalPath, editingMeasurementIndex, measurementExpression, result, measurementUnit);
    } else {
      // Neu hinzufügen
      addMeasurement(measurementModalPath, measurementExpression, result, measurementUnit);
    }
    
    setMeasurementModalPath(null);
    setMeasurementExpression('');
    setEditingMeasurementIndex(null);
  };

  // Neuen Unterpunkt hinzufügen
  const addSubItem = (path: number[]) => {
    if (!checklist) return;
    
    const getItemAtPath = (items: RecursiveItem[], path: number[]): RecursiveItem | null => {
      if (path.length === 0) return null;
      if (path.length === 1) return items[path[0]];
      const [first, ...rest] = path;
      return getItemAtPath(items[first].subItems || [], rest);
    };
    
    const item = getItemAtPath(checklist.items, path);
    if (!item) return;
    
    // Öffne das Eingabefeld für diesen Pfad
    const pathKey = path.join('-');
    setOpenInputs(prev => new Set(prev).add(pathKey));
    setNewSubItemTexts(prev => ({ ...prev, [pathKey]: '' }));
  };

  // Neuen Unterpunkt bestätigen und hinzufügen
  const confirmNewSubItem = async (path: number[]) => {
    if (!checklist) return;
    
    const pathKey = path.join('-');
    const text = newSubItemTexts[pathKey]?.trim();
    
    if (!text) {
      // Eingabefeld schließen wenn leer
      setOpenInputs(prev => {
        const newSet = new Set(prev);
        newSet.delete(pathKey);
        return newSet;
      });
      return;
    }
    
    const getItemAtPath = (items: RecursiveItem[], pathArr: number[]): RecursiveItem | null => {
      if (pathArr.length === 0) return null;
      if (pathArr.length === 1) return items[pathArr[0]];
      const [first, ...rest] = pathArr;
      return getItemAtPath(items[first].subItems || [], rest);
    };
    
    const item = getItemAtPath(checklist.items, path);
    if (!item) return;
    
    // Versuche, Bilder-Daten aus der Vorlage zu laden
    let newSubItem: RecursiveItem = { text, checked: false, subItems: [] };
    
    try {
      // Lade die ursprüngliche Vorlage
      const template = await ChecklistTemplateService.getById(checklist.template_id);
      if (template) {
        // Suche rekursiv nach einem Item mit dem gleichen Text
        const findItemInTemplate = (items: any[], searchText: string): any | null => {
          for (const templateItem of items) {
            if (typeof templateItem === 'string') {
              if (templateItem.toLowerCase() === searchText.toLowerCase()) {
                return { text: templateItem };
              }
            } else {
              if (templateItem.text?.toLowerCase() === searchText.toLowerCase()) {
                return templateItem;
              }
              // Rekursiv in Unterpunkten suchen
              if (templateItem.subItems) {
                const found = findItemInTemplate(templateItem.subItems, searchText);
                if (found) return found;
              }
            }
          }
          return null;
        };
        
        const templateItem = findItemInTemplate(template.items, text);
        if (templateItem) {
          // Übernehme Bilder-Daten aus der Vorlage
          newSubItem = {
            text: templateItem.text || text,
            checked: false,
            subItems: [],
            printImage: templateItem.printImage,
            previewImages: templateItem.previewImages,
            categoryLogo: templateItem.categoryLogo,
            referenceFolderId: templateItem.referenceFolderId,
            referenceFolderName: templateItem.referenceFolderName,
          };
        }
      }
    } catch (error) {
      console.error('Error loading template for images:', error);
    }
    
    const newSubItems = [...(item.subItems || []), newSubItem];
    const newItems = updateItemAtPath(checklist.items, path, { subItems: newSubItems });
    
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
    
    // Eingabefeld leeren aber offen lassen für weitere Eingaben
    setNewSubItemTexts(prev => ({ ...prev, [pathKey]: '' }));
  };

  // Eingabefeld schließen
  const cancelNewSubItem = (path: number[]) => {
    const pathKey = path.join('-');
    setOpenInputs(prev => {
      const newSet = new Set(prev);
      newSet.delete(pathKey);
      return newSet;
    });
    setNewSubItemTexts(prev => {
      const newTexts = { ...prev };
      delete newTexts[pathKey];
      return newTexts;
    });
  };

  // Bearbeitungsmodus starten
  const startEditing = (path: number[], currentText: string) => {
    const pathKey = path.join('-');
    setEditingItems(prev => ({ ...prev, [pathKey]: currentText }));
  };

  // Bearbeitung bestätigen
  const confirmEditing = (path: number[]) => {
    if (!checklist) return;
    const pathKey = path.join('-');
    const newText = editingItems[pathKey]?.trim();
    
    if (newText) {
      const newItems = updateItemAtPath(checklist.items, path, { text: newText });
      setChecklist({ ...checklist, items: newItems });
      setHasChanges(true);
    }
    
    // Bearbeitungsmodus beenden
    setEditingItems(prev => {
      const newEditing = { ...prev };
      delete newEditing[pathKey];
      return newEditing;
    });
  };

  // Bearbeitung abbrechen
  const cancelEditing = (path: number[]) => {
    const pathKey = path.join('-');
    setEditingItems(prev => {
      const newEditing = { ...prev };
      delete newEditing[pathKey];
      return newEditing;
    });
  };

  // Item löschen (Hauptpunkt oder Unterpunkt)
  const deleteItem = (path: number[]) => {
    if (!checklist) return;
    
    if (path.length === 1) {
      // Hauptpunkt löschen
      const newItems = checklist.items.filter((_, i) => i !== path[0]);
      setChecklist({ ...checklist, items: newItems });
    } else {
      // Unterpunkt löschen
      const parentPath = path.slice(0, -1);
      const subIndex = path[path.length - 1];
      
      const getItemAtPath = (items: RecursiveItem[], p: number[]): RecursiveItem | null => {
        if (p.length === 0) return null;
        if (p.length === 1) return items[p[0]];
        const [first, ...rest] = p;
        return getItemAtPath(items[first].subItems || [], rest);
      };
      
      const parentItem = getItemAtPath(checklist.items, parentPath);
      if (!parentItem || !parentItem.subItems) return;
      
      const newSubItems = parentItem.subItems.filter((_, i) => i !== subIndex);
      const newItems = updateItemAtPath(checklist.items, parentPath, { subItems: newSubItems });
      setChecklist({ ...checklist, items: newItems });
    }
    
    setHasChanges(true);
  };

  // Unterpunkt-Text updaten (für legacy)
  const updateSubItemText = (path: number[], text: string) => {
    if (!checklist) return;
    const newItems = updateItemAtPath(checklist.items, path, { text });
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
  };

  // Ein-/Ausklappen eines Items
  const toggleCollapse = (path: number[]) => {
    const pathKey = path.join('-');
    setCollapsedPaths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pathKey)) {
        newSet.delete(pathKey);
      } else {
        newSet.add(pathKey);
      }
      return newSet;
    });
  };

  // Prüfen ob ein Item eingeklappt ist
  const isCollapsed = (path: number[]): boolean => {
    return collapsedPaths.has(path.join('-'));
  };

  // Toggle Notiz-Feld öffnen/schließen
  const toggleNoteField = (path: number[]) => {
    const pathKey = path.join('-');
    setOpenNotePaths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pathKey)) {
        newSet.delete(pathKey);
      } else {
        newSet.add(pathKey);
        // Wenn wir das Feld öffnen, stellen wir sicher dass das Item nicht collapsed ist
        setCollapsedPaths(prevCollapsed => {
          const newCollapsed = new Set(prevCollapsed);
          newCollapsed.delete(pathKey);
          return newCollapsed;
        });
      }
      return newSet;
    });
  };

  // Prüfen ob Notiz-Feld offen ist
  const isNoteOpen = (path: number[]): boolean => {
    return openNotePaths.has(path.join('-'));
  };

  // Toggle Messungs-Feld öffnen/schließen
  const toggleMeasurementField = (path: number[]) => {
    const pathKey = path.join('-');
    setOpenMeasurementPaths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pathKey)) {
        newSet.delete(pathKey);
      } else {
        newSet.add(pathKey);
        // Wenn wir das Feld öffnen, stellen wir sicher dass das Item nicht collapsed ist
        setCollapsedPaths(prevCollapsed => {
          const newCollapsed = new Set(prevCollapsed);
          newCollapsed.delete(pathKey);
          return newCollapsed;
        });
      }
      return newSet;
    });
  };

  // Prüfen ob Messungs-Feld offen ist
  const isMeasurementOpen = (path: number[]): boolean => {
    return openMeasurementPaths.has(path.join('-'));
  };

  // Zähle alle direkten Unterpunkte eines Items (für Basic Version Limit)
  const countSubItems = (item: RecursiveItem): number => {
    return item.subItems?.length || 0;
  };

  // Prüfen ob noch Unterpunkte hinzugefügt werden dürfen
  const canAddSubItem = (path: number[]): boolean => {
    if (!checklist) return false;
    const features = getFeatures();
    
    // Pro-Version: keine Begrenzung
    if (features.allowNestedSubItems && features.maxChecklistItems >= 999) return true;
    
    // Basic Version: Keine verschachtelten Unterpunkte erlauben
    // path.length == 1 bedeutet: wir sind auf einem Hauptitem (Tiefe 1)
    // path.length > 1 bedeutet: wir sind bereits in einem Unterpunkt
    if (!features.allowNestedSubItems && path.length > 1) {
      // Basic Version erlaubt keine Unterpunkte von Unterpunkten
      return false;
    }
    
    // Zähle die direkten Unterpunkte des aktuellen Items
    const getItemAtPath = (items: RecursiveItem[], pathArr: number[]): RecursiveItem | null => {
      if (pathArr.length === 0) return null;
      if (pathArr.length === 1) return items[pathArr[0]];
      const [first, ...rest] = pathArr;
      return getItemAtPath(items[first].subItems || [], rest);
    };
    
    const item = getItemAtPath(checklist.items, path);
    if (!item) return false;
    
    const currentCount = countSubItems(item);
    return currentCount < features.maxChecklistItems;
  };

  // Unterpunkt löschen (legacy - jetzt durch deleteItem ersetzt)
  const removeSubItem = (parentPath: number[], subIndex: number) => {
    if (!checklist) return;
    
    const getItemAtPath = (items: RecursiveItem[], path: number[]): RecursiveItem | null => {
      if (path.length === 0) return null;
      if (path.length === 1) return items[path[0]];
      const [first, ...rest] = path;
      return getItemAtPath(items[first].subItems || [], rest);
    };
    
    const parentItem = getItemAtPath(checklist.items, parentPath);
    if (!parentItem || !parentItem.subItems) return;
    
    const newSubItems = parentItem.subItems.filter((_, i) => i !== subIndex);
    const newItems = updateItemAtPath(checklist.items, parentPath, { subItems: newSubItems });
    
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
  };

  // Item kopieren (deep copy)
  const copyItem = (path: number[]) => {
    if (!checklist) return;
    
    const getItemAtPath = (items: RecursiveItem[], p: number[]): RecursiveItem | null => {
      if (p.length === 0) return null;
      if (p.length === 1) return items[p[0]];
      const [first, ...rest] = p;
      return getItemAtPath(items[first].subItems || [], rest);
    };
    
    const item = getItemAtPath(checklist.items, path);
    if (!item) return;
    
    // Deep copy des Items
    const deepCopy = (obj: RecursiveItem): RecursiveItem => ({
      text: obj.text,
      checked: false, // Beim Kopieren als unchecked setzen
      note: obj.note || '',
      subItems: obj.subItems ? obj.subItems.map(deepCopy) : [],
      // Bild-Daten mit kopieren
      printImage: obj.printImage,
      previewImages: obj.previewImages,
      categoryLogo: obj.categoryLogo,
      // Referenz-Ordner mit kopieren
      referenceFolderId: obj.referenceFolderId,
      referenceFolderName: obj.referenceFolderName,
    });
    
    setCopiedItem(deepCopy(item));
    Alert.alert(t('checklists.copied'), t('checklists.copiedMessage', { text: item.text }));
  };

  // Item einfügen (nach einer Position)
  const pasteItemAfter = (path: number[]) => {
    if (!checklist || !copiedItem) {
      Alert.alert(t('common.note'), t('checklists.clipboardEmpty'));
      return;
    }
    
    // Deep copy des kopierten Items
    const deepCopy = (obj: RecursiveItem): RecursiveItem => ({
      text: obj.text,
      checked: obj.checked,
      note: obj.note || '',
      subItems: obj.subItems ? obj.subItems.map(deepCopy) : [],
      // Bild-Daten mit kopieren
      printImage: obj.printImage,
      previewImages: obj.previewImages,
      categoryLogo: obj.categoryLogo,
      // Referenz-Ordner mit kopieren
      referenceFolderId: obj.referenceFolderId,
      referenceFolderName: obj.referenceFolderName,
    });
    
    const itemToInsert = deepCopy(copiedItem);
    
    if (path.length === 1) {
      // Einfügen auf Hauptebene
      const insertIndex = path[0] + 1;
      const newItems = [
        ...checklist.items.slice(0, insertIndex),
        itemToInsert,
        ...checklist.items.slice(insertIndex),
      ];
      setChecklist({ ...checklist, items: newItems });
    } else {
      // Einfügen als Unterpunkt
      const parentPath = path.slice(0, -1);
      const insertIndex = path[path.length - 1] + 1;
      
      const getItemAtPath = (items: RecursiveItem[], p: number[]): RecursiveItem | null => {
        if (p.length === 0) return null;
        if (p.length === 1) return items[p[0]];
        const [first, ...rest] = p;
        return getItemAtPath(items[first].subItems || [], rest);
      };
      
      const parentItem = getItemAtPath(checklist.items, parentPath);
      if (!parentItem || !parentItem.subItems) return;
      
      const newSubItems = [
        ...parentItem.subItems.slice(0, insertIndex),
        itemToInsert,
        ...parentItem.subItems.slice(insertIndex),
      ];
      
      const newItems = updateItemAtPath(checklist.items, parentPath, { subItems: newSubItems });
      setChecklist({ ...checklist, items: newItems });
    }
    
    setHasChanges(true);
    Alert.alert(t('checklists.pastedTitle'), t('checklists.pastedMessage', { text: copiedItem.text }));
  };

  // Stilles Speichern (ohne Alert) mit Retry
  const saveChecklistSilent = async (retries = 3) => {
    if (!checklist || saving) return;
    
    for (let i = 0; i < retries; i++) {
      try {
        await ChecklistService.update(checklist.id, checklist);
        setHasChanges(false);
        return; // Erfolgreich gespeichert
      } catch (error) {
        if (i === retries - 1) {
          console.error('Error auto-saving checklist after retries:', error);
        } else {
          // Warte kurz vor dem nächsten Versuch
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  };

  // Manuelles Speichern mit Feedback und Retry
  const handleSave = async () => {
    if (!checklist) return;

    setSaving(true);
    let success = false;
    
    for (let i = 0; i < 3; i++) {
      try {
        await ChecklistService.update(checklist.id, checklist);
        setHasChanges(false);
        success = true;
        break;
      } catch (error) {
        if (i < 2) {
          // Warte kurz vor dem nächsten Versuch
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.error('Error saving checklist:', error);
        }
      }
    }
    
    setSaving(false);
    
    if (success) {
      Alert.alert(t('common.success'), t('checklists.checklistSaved'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } else {
      Alert.alert(t('common.error'), t('checklists.checklistSaveError'));
    }
  };

  // Rekursive Render-Funktion für Items
  const renderItem = (item: RecursiveItem, path: number[], depth: number = 0) => {
    const hasSubItems = item.subItems && item.subItems.length > 0;
    const isMainItem = depth === 0;
    const pathKey = path.join('-');
    const isEditing = editingItems.hasOwnProperty(pathKey);
    
    // Einrückung: Auf iPhone KEINE Einrückung, stattdessen farbige Linie links
    const indentSize = isPhone ? 0 : 16;
    
    // Farben für verschiedene Ebenen (für iPhone)
    const depthColors = ['#1976d2', '#9c27b0', '#ff9800', '#4caf50', '#f44336'];
    const depthColor = depthColors[Math.min(depth, depthColors.length - 1)];
    
    return (
      <View key={path.join('-')} style={[
        styles.itemWrapper, 
        { marginLeft: depth * indentSize },
        // Auf iPhone: farbige Linie links statt Einrückung
        isPhone && depth > 0 && { 
          borderLeftWidth: 2, 
          borderLeftColor: depthColor,
          paddingLeft: 4,
          marginLeft: 2,
          marginTop: 1,
        }
      ]}>
        {/* Bearbeitungsmodus */}
        {isEditing ? (
          <View style={styles.editingContainer}>
            <TextInput
              style={styles.editingInput}
              value={editingItems[pathKey]}
              onChangeText={(text) => setEditingItems(prev => ({ ...prev, [pathKey]: text }))}
              onSubmitEditing={() => confirmEditing(path)}
              autoFocus
              multiline
            />
            <View style={styles.editingButtons}>
              <TouchableOpacity onPress={() => confirmEditing(path)} style={styles.editConfirmButton}>
                <Ionicons name="checkmark-circle" size={28} color="#4caf50" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => cancelEditing(path)} style={styles.editCancelButton}>
                <Ionicons name="close-circle" size={28} color="#999" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* Normaler Anzeigemodus */
          isPhone ? (
            /* iPhone: Kompaktes vertikales Layout */
            <View style={[
              styles.checklistItemPhone,
              item.checked && styles.checklistItemCheckedPhone,
            ]}>
              {/* Obere Zeile: Checkbox + Text */}
              <TouchableOpacity 
                style={styles.itemTopRowPhone}
                onPress={() => startEditing(path, item.text)}
                activeOpacity={0.7}
              >
                <TouchableOpacity 
                  onPress={(e) => {
                    e.stopPropagation();
                    toggleItemChecked(path);
                  }} 
                  style={styles.checkboxTouchablePhone}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={item.checked ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={item.checked ? '#4caf50' : '#666'}
                  />
                </TouchableOpacity>
                <Text
                  style={[
                    styles.checklistTextPhone,
                    item.checked && styles.checklistTextCheckedPhone,
                  ]}
                  numberOfLines={2}
                >
                  {item.text}
                </Text>
                {/* Einklappen-Indikator */}
                {hasSubItems && (
                  <TouchableOpacity
                    onPress={() => toggleCollapse(path)}
                    style={styles.collapseButtonPhone}
                  >
                    <Ionicons 
                      name={isCollapsed(path) ? "chevron-forward" : "chevron-down"} 
                      size={16} 
                      color="#666" 
                    />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              
              {/* Untere Zeile: Action Buttons */}
              <View style={styles.itemActionsRowPhone}>
                <TouchableOpacity 
                  onPress={() => moveItemUp(path)}
                  style={[styles.actionBtnPhone, path[path.length - 1] === 0 && styles.actionButtonDisabled]}
                  disabled={path[path.length - 1] === 0}
                >
                  <Ionicons name="arrow-up" size={14} color={path[path.length - 1] === 0 ? '#ccc' : '#666'} />
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => moveItemDown(path)}
                  style={styles.actionBtnPhone}
                >
                  <Ionicons name="arrow-down" size={14} color="#666" />
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => copyItem(path)}
                  style={styles.actionBtnPhone}
                >
                  <Ionicons name="copy-outline" size={14} color="#ff9800" />
                </TouchableOpacity>
                {copiedItem && (
                  <TouchableOpacity 
                    onPress={() => pasteItemAfter(path)}
                    style={styles.actionBtnPhone}
                  >
                    <Ionicons name="clipboard-outline" size={14} color="#4caf50" />
                  </TouchableOpacity>
                )}
                
                {/* Notiz Button für iPhone */}
                {item.checked && (
                  <TouchableOpacity 
                    onPress={() => toggleNoteField(path)}
                    style={[
                      styles.labeledActionButtonPhone,
                      isNoteOpen(path) && styles.labeledActionButtonActive,
                      item.note && item.note.trim() && styles.labeledActionButtonHasContent
                    ]}
                  >
                    <Ionicons 
                      name={item.note && item.note.trim() ? "document-text" : "document-text-outline"} 
                      size={12} 
                      color={isNoteOpen(path) ? '#fff' : (item.note && item.note.trim() ? '#4caf50' : '#9c27b0')} 
                    />
                    <Text style={[
                      styles.labeledActionTextPhone,
                      isNoteOpen(path) && styles.labeledActionTextActive,
                      item.note && item.note.trim() && styles.labeledActionTextHasContent
                    ]}>
                      {t('checklists.note')}
                    </Text>
                  </TouchableOpacity>
                )}
                
                {/* Messung Button für iPhone */}
                {item.checked && (
                  <TouchableOpacity 
                    onPress={() => toggleMeasurementField(path)}
                    style={[
                      styles.labeledActionButtonPhone,
                      isMeasurementOpen(path) && styles.labeledActionButtonActive,
                      item.measurements && item.measurements.length > 0 && styles.labeledActionButtonHasContent
                    ]}
                  >
                    <Ionicons 
                      name={item.measurements && item.measurements.length > 0 ? "calculator" : "calculator-outline"} 
                      size={12} 
                      color={isMeasurementOpen(path) ? '#fff' : (item.measurements && item.measurements.length > 0 ? '#4caf50' : '#2196f3')} 
                    />
                    <Text style={[
                      styles.labeledActionTextPhone,
                      isMeasurementOpen(path) && styles.labeledActionTextActive,
                      item.measurements && item.measurements.length > 0 && styles.labeledActionTextHasContent
                    ]}>
                      {t('checklists.measurement')}
                    </Text>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity 
                  onPress={() => {
                    Alert.alert(
                      t('common.delete'),
                      t('checklists.deleteConfirmItem', { text: item.text }),
                      [
                        { text: t('common.cancel'), style: 'cancel' },
                        { text: t('common.delete'), style: 'destructive', onPress: () => deleteItem(path) }
                      ]
                    );
                  }}
                  style={styles.actionBtnPhone}
                >
                  <Ionicons name="trash-outline" size={14} color="#f44336" />
                </TouchableOpacity>
              </View>
              
              {/* Hinweis auf Unterpunkte wenn eingeklappt */}
              {hasSubItems && isCollapsed(path) && (
                <Text style={styles.subItemsHintPhone}>
                  {t('checklists.subItemCount', { count: item.subItems!.length })}
                </Text>
              )}
            </View>
          ) : (
          /* iPad: Normales horizontales Layout */
          <View style={[
            styles.checklistItem,
            item.checked && styles.checklistItemChecked,
            !isMainItem && styles.subItemCard,
          ]}>
            {/* Einklappen-Button (nur wenn Unterpunkte vorhanden) */}
            {hasSubItems && (
              <TouchableOpacity
                style={styles.collapseButton}
                onPress={() => toggleCollapse(path)}
              >
                <Ionicons 
                  name={isCollapsed(path) ? "chevron-forward" : "chevron-down"} 
                  size={20} 
                  color="#666" 
                />
              </TouchableOpacity>
            )}
            
            {/* Checkbox */}
            <TouchableOpacity 
              onPress={() => toggleItemChecked(path)} 
              style={styles.checkboxTouchable}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={item.checked ? 'checkbox' : 'square-outline'}
                size={isMainItem ? 28 : 22}
                color={item.checked ? '#4caf50' : '#666'}
              />
            </TouchableOpacity>
            
            {/* Text - Tippen zum Bearbeiten */}
            <TouchableOpacity 
              style={styles.itemContent}
              onPress={() => startEditing(path, item.text)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  isMainItem ? styles.checklistText : styles.subItemText,
                  item.checked && (isMainItem ? styles.checklistTextChecked : styles.subItemTextChecked),
                ]}
              >
                {item.text}
              </Text>
              
              {/* Hinweis auf Unterpunkte wenn eingeklappt */}
              {hasSubItems && isCollapsed(path) && (
                <Text style={styles.subItemsHint}>
                  {t('checklists.subItemsHidden', { count: item.subItems!.length })}
                </Text>
              )}
            </TouchableOpacity>
            
            {/* Action Buttons */}
            <View style={[styles.itemActions, isPhone && styles.itemActionsPhone]}>
              {/* Nach oben verschieben */}
              <TouchableOpacity 
                onPress={() => moveItemUp(path)}
                style={[styles.actionButton, isPhone && styles.actionButtonPhone, path[path.length - 1] === 0 && styles.actionButtonDisabled]}
                disabled={path[path.length - 1] === 0}
              >
                <Ionicons name="chevron-up" size={isPhone ? 14 : 18} color={path[path.length - 1] === 0 ? '#ccc' : '#666'} />
              </TouchableOpacity>
              
              {/* Nach unten verschieben */}
              <TouchableOpacity 
                onPress={() => moveItemDown(path)}
                style={[styles.actionButton, isPhone && styles.actionButtonPhone]}
              >
                <Ionicons name="chevron-down" size={isPhone ? 14 : 18} color="#666" />
              </TouchableOpacity>
              
              {/* Kopieren Button */}
              <TouchableOpacity 
                onPress={() => copyItem(path)}
                style={[styles.actionButton, isPhone && styles.actionButtonPhone]}
              >
                <Ionicons name="copy-outline" size={isPhone ? 14 : 18} color="#ff9800" />
              </TouchableOpacity>
              
              {/* Einfügen Button (nur wenn etwas kopiert wurde) */}
              {copiedItem && (
                <TouchableOpacity 
                  onPress={() => pasteItemAfter(path)}
                  style={[styles.actionButton, isPhone && styles.actionButtonPhone]}
                >
                  <Ionicons name="clipboard-outline" size={isPhone ? 14 : 18} color="#4caf50" />
                </TouchableOpacity>
              )}
              
              {/* Bearbeiten Button - nur auf iPad (auf iPhone tippt man auf Text) */}
              {!isPhone && (
                <TouchableOpacity 
                  onPress={() => startEditing(path, item.text)}
                  style={styles.actionButton}
                >
                  <Ionicons name="pencil" size={18} color="#1976d2" />
                </TouchableOpacity>
              )}
              
              {/* Notiz Button - nur wenn Item abgehakt */}
              {item.checked && (
                <TouchableOpacity 
                  onPress={() => toggleNoteField(path)}
                  style={[
                    styles.labeledActionButton, 
                    isPhone && styles.labeledActionButtonPhone,
                    isNoteOpen(path) && styles.labeledActionButtonActive,
                    item.note && item.note.trim() && styles.labeledActionButtonHasContent
                  ]}
                >
                  <Ionicons 
                    name={item.note && item.note.trim() ? "document-text" : "document-text-outline"} 
                    size={isPhone ? 14 : 16} 
                    color={isNoteOpen(path) ? '#fff' : (item.note && item.note.trim() ? '#4caf50' : '#9c27b0')} 
                  />
                  <Text style={[
                    styles.labeledActionText,
                    isPhone && styles.labeledActionTextPhone,
                    isNoteOpen(path) && styles.labeledActionTextActive,
                    item.note && item.note.trim() && styles.labeledActionTextHasContent
                  ]}>
                    {t('checklists.note')}
                  </Text>
                </TouchableOpacity>
              )}
              
              {/* Messung Button - nur wenn Item abgehakt */}
              {item.checked && (
                <TouchableOpacity 
                  onPress={() => toggleMeasurementField(path)}
                  style={[
                    styles.labeledActionButton, 
                    isPhone && styles.labeledActionButtonPhone,
                    isMeasurementOpen(path) && styles.labeledActionButtonActive,
                    item.measurements && item.measurements.length > 0 && styles.labeledActionButtonHasContent
                  ]}
                >
                  <Ionicons 
                    name={item.measurements && item.measurements.length > 0 ? "calculator" : "calculator-outline"} 
                    size={isPhone ? 14 : 16} 
                    color={isMeasurementOpen(path) ? '#fff' : (item.measurements && item.measurements.length > 0 ? '#4caf50' : '#2196f3')} 
                  />
                  <Text style={[
                    styles.labeledActionText,
                    isPhone && styles.labeledActionTextPhone,
                    isMeasurementOpen(path) && styles.labeledActionTextActive,
                    item.measurements && item.measurements.length > 0 && styles.labeledActionTextHasContent
                  ]}>
                    {t('checklists.measurement')}
                  </Text>
                </TouchableOpacity>
              )}
              
              {/* Löschen Button */}
              <TouchableOpacity 
                onPress={() => {
                  Alert.alert(
                    t('common.delete'),
                    t('checklists.deleteConfirmItem', { text: item.text }),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('common.delete'), style: 'destructive', onPress: () => deleteItem(path) }
                    ]
                  );
                }}
                style={[styles.actionButton, isPhone && styles.actionButtonPhone]}
              >
                <Ionicons name="trash-outline" size={isPhone ? 14 : 18} color="#f44336" />
              </TouchableOpacity>
              
              {/* Pfeil-Icon zeigt an dass es aufklappbar ist */}
              {hasSubItems && (
                <Ionicons
                  name={item.checked ? 'chevron-down' : 'chevron-forward'}
                  size={isPhone ? 16 : 20}
                  color="#999"
                />
              )}
            </View>
          </View>
          )
        )
        }

        {/* Expanded Content - nur wenn abgehakt und nicht eingeklappt */}
        {item.checked && !isCollapsed(path) && (
          <View style={[styles.expandedContent, { marginLeft: 8 }]}>
            {/* Notiz-Feld - ZUERST, direkt unter dem Hauptpunkt */}
            {isNoteOpen(path) && (
              <View style={styles.noteContainer}>
                <View style={styles.noteHeader}>
                  <Ionicons name="document-text-outline" size={18} color="#9c27b0" />
                  <Text style={styles.noteLabel}>{t('checklists.note')}</Text>
                  <TouchableOpacity
                    style={styles.closeSectionButton}
                    onPress={() => toggleNoteField(path)}
                  >
                    <Ionicons name="close" size={20} color="#999" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.noteInput}
                  placeholder={t('checklists.addNotePlaceholder')}
                  value={item.note || ''}
                  onChangeText={(text) => updateNote(path, text)}
                  multiline
                  numberOfLines={3}
                  editable={true}
                  showSoftInputOnFocus={true}
                />
              </View>
            )}

            {/* Messungen - ZUERST, direkt unter dem Hauptpunkt */}
            {isMeasurementOpen(path) && (
              <View style={styles.measurementSection}>
                <View style={styles.measurementHeader}>
                  <Ionicons name="calculator-outline" size={18} color="#2196f3" />
                  <Text style={styles.measurementLabel}>{t('checklists.measurements')}</Text>
                  <TouchableOpacity
                    style={styles.addMeasurementButton}
                    onPress={() => openMeasurementModal(path)}
                  >
                    <Ionicons name="add-circle" size={24} color="#2196f3" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.closeSectionButton}
                    onPress={() => toggleMeasurementField(path)}
                  >
                    <Ionicons name="close" size={20} color="#999" />
                  </TouchableOpacity>
                </View>
                
                {/* Vorhandene Messungen */}
                {item.measurements && item.measurements.length > 0 && (
                  <View style={styles.measurementsList}>
                    {item.measurements.map((m, mIndex) => {
                      const expr = m.expression || (m as any).value?.toString() || '0';
                      const result = m.result ?? (m as any).value ?? 0;
                      
                      return (
                        <TouchableOpacity 
                          key={mIndex} 
                          style={styles.measurementChip}
                          onPress={() => openEditMeasurementModal(path, mIndex, expr, m.unit)}
                        >
                          <Text style={styles.measurementChipText}>
                            {formatExpression(expr)} = {result.toString().replace('.', ',')} {m.unit}
                          </Text>
                          <TouchableOpacity
                            onPress={() => removeMeasurement(path, mIndex)}
                            style={styles.removeMeasurementButton}
                          >
                            <Ionicons name="close-circle" size={18} color="#f44336" />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })}
                    
                    {/* Summe pro Einheit anzeigen */}
                    {(() => {
                      const sumsByUnit: { [unit: string]: number } = {};
                      item.measurements.forEach(m => {
                        const result = m.result ?? (m as any).value ?? 0;
                        sumsByUnit[m.unit] = (sumsByUnit[m.unit] || 0) + result;
                      });
                      const units = Object.keys(sumsByUnit);
                      
                      if (units.length > 0) {
                        return (
                          <View style={styles.measurementSumContainer}>
                            <Text style={styles.measurementSumLabel}>{t('checklists.sums')}</Text>
                            {units.map(unit => (
                              <Text key={unit} style={styles.measurementSumText}>
                                {sumsByUnit[unit].toFixed(2).replace('.', ',')} {unit}
                              </Text>
                            ))}
                          </View>
                        );
                      }
                      return null;
                    })()}
                  </View>
                )}
              </View>
            )}

            {/* Vorhandene Unterpunkte rekursiv rendern */}
            {hasSubItems && (
              <View style={styles.subItemsContainer}>
                {item.subItems!.map((subItem, subIndex) => (
                  <View key={subIndex}>
                    {renderItem(subItem, [...path, subIndex], depth + 1)}
                  </View>
                ))}
              </View>
            )}

            {/* Eingabefeld für neuen Unterpunkt */}
            {openInputs.has(path.join('-')) && (
              <View style={styles.newSubItemRow}>
                <TextInput
                  style={styles.newSubItemInput}
                  placeholder={t('checklists.newSubItemPlaceholder')}
                  placeholderTextColor="#999"
                  value={newSubItemTexts[path.join('-')] || ''}
                  onChangeText={(text) => setNewSubItemTexts(prev => ({ ...prev, [path.join('-')]: text }))}
                  onSubmitEditing={() => confirmNewSubItem(path)}
                  returnKeyType="done"
                  autoFocus
                  editable={true}
                  showSoftInputOnFocus={true}
                />
                <TouchableOpacity
                  onPress={() => confirmNewSubItem(path)}
                  style={styles.confirmSubButton}
                >
                  <Ionicons name="checkmark-circle" size={28} color="#4caf50" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => cancelNewSubItem(path)}
                  style={styles.removeSubButton}
                >
                  <Ionicons name="close-circle" size={28} color="#999" />
                </TouchableOpacity>
              </View>
            )}

            {/* Button zum Hinzufügen von Unterpunkten - nur wenn Limit nicht erreicht */}
            {!openInputs.has(path.join('-')) && canAddSubItem(path) && (
              <TouchableOpacity
                style={styles.addSubItemButton}
                onPress={() => addSubItem(path)}
              >
                <Ionicons name="add" size={18} color="#1976d2" />
                <Text style={styles.addSubItemText}>{t('checklists.addSubItem')}</Text>
              </TouchableOpacity>
            )}
            
            {/* Hinweis wenn Limit erreicht (Basic Version) */}
            {!openInputs.has(path.join('-')) && !canAddSubItem(path) && (
              <View style={styles.limitReachedContainer}>
                <Ionicons name="lock-closed" size={14} color="#999" />
                <Text style={styles.limitReachedText}>
                  {path.length > 1 && !getFeatures().allowNestedSubItems 
                    ? t('checklists.nestedSubItemsProOnly') 
                    : t('checklists.maxSubItemsBasic', { max: getFeatures().maxChecklistItems })}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Notiz-Feld - außerhalb des Expanded Content, damit es auch bei collapsed Items funktioniert */}
        {item.checked && isNoteOpen(path) && isCollapsed(path) && (
          <View style={[styles.noteContainer, { marginLeft: 8, marginTop: 4 }]}>
            <View style={styles.noteHeader}>
              <Ionicons name="document-text-outline" size={18} color="#9c27b0" />
              <Text style={styles.noteLabel}>Notiz</Text>
              <TouchableOpacity
                style={styles.closeSectionButton}
                onPress={() => toggleNoteField(path)}
              >
                <Ionicons name="close" size={20} color="#999" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.noteInput}
              placeholder="Notiz hinzufügen..."
              value={item.note || ''}
              onChangeText={(text) => updateNote(path, text)}
              multiline
              numberOfLines={3}
              editable={true}
              showSoftInputOnFocus={true}
            />
          </View>
        )}

        {/* Messungs-Feld - außerhalb des Expanded Content, damit es auch bei collapsed Items funktioniert */}
        {item.checked && isMeasurementOpen(path) && isCollapsed(path) && (
          <View style={[styles.measurementSection, { marginLeft: 8, marginTop: 4 }]}>
            <View style={styles.measurementHeader}>
              <Ionicons name="calculator-outline" size={18} color="#2196f3" />
              <Text style={styles.measurementLabel}>Messungen</Text>
              <TouchableOpacity
                style={styles.addMeasurementButton}
                onPress={() => openMeasurementModal(path)}
              >
                <Ionicons name="add-circle" size={24} color="#2196f3" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeSectionButton}
                onPress={() => toggleMeasurementField(path)}
              >
                <Ionicons name="close" size={20} color="#999" />
              </TouchableOpacity>
            </View>
            
            {/* Vorhandene Messungen */}
            {item.measurements && item.measurements.length > 0 && (
              <View style={styles.measurementsList}>
                {item.measurements.map((m, mIndex) => {
                  const expr = m.expression || (m as any).value?.toString() || '0';
                  const result = m.result ?? (m as any).value ?? 0;
                  
                  return (
                    <TouchableOpacity 
                      key={mIndex} 
                      style={styles.measurementChip}
                      onPress={() => openEditMeasurementModal(path, mIndex, expr, m.unit)}
                    >
                      <Text style={styles.measurementChipText}>
                        {formatExpression(expr)} = {result.toString().replace('.', ',')} {m.unit}
                      </Text>
                      <TouchableOpacity
                        onPress={() => removeMeasurement(path, mIndex)}
                        style={styles.removeMeasurementButton}
                      >
                        <Ionicons name="close-circle" size={18} color="#f44336" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // Zähle alle abgehakten Items (rekursiv)
  const countChecked = (items: RecursiveItem[]): { checked: number; total: number } => {
    let checked = 0;
    let total = 0;
    
    items.forEach(item => {
      total++;
      if (item.checked) checked++;
      if (item.subItems && item.subItems.length > 0) {
        const subCount = countChecked(item.subItems);
        checked += subCount.checked;
        total += subCount.total;
      }
    });
    
    return { checked, total };
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
      </View>
    );
  }

  if (!checklist) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>{t('checklists.checklistNotFound')}</Text>
      </View>
    );
  }

  const { checked: completedCount, total: totalCount } = countChecked(checklist.items);
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{checklist.template_name}</Text>
        {hasChanges && (
          <Text style={styles.unsavedHint}>{t('checklists.unsavedChanges')}</Text>
        )}
        {/* Zwischenablage-Anzeige */}
        {copiedItem && (
          <View style={styles.clipboardInfo}>
            <Ionicons name="clipboard" size={14} color="#ff9800" />
            <Text style={styles.clipboardText}>{t('checklists.copiedLabel')} "{copiedItem.text.substring(0, 25)}{copiedItem.text.length > 25 ? '...' : ''}"</Text>
            <TouchableOpacity onPress={() => setCopiedItem(null)}>
              <Ionicons name="close-circle" size={18} color="#999" />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {t('checklists.progressTextPercent', { done: completedCount, total: totalCount, percent: Math.round(progress) })}
        </Text>
      </View>

      <ScrollView style={styles.checklistContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.checklistContent}>
          {checklist.items.map((item, index) => renderItem(item, [index], 0))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Ionicons name="checkmark-circle" size={24} color="#fff" />
          <Text style={styles.saveButtonText}>
            {saving ? t('common.isSaving') : t('checklists.saveAndBack')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Messungs-Modal - Kompakt & Verschiebbar */}
      <Modal
        visible={measurementModalPath !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMeasurementModalPath(null)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View 
            style={[
              styles.measurementModalCompact,
              { transform: numpadPosition.getTranslateTransform() }
            ]}
          >
            {/* Schließen-Button außerhalb des Drag-Bereichs */}
            <TouchableOpacity 
              style={styles.closeButtonCompact}
              onPress={() => {
                setMeasurementModalPath(null);
                setEditingMeasurementIndex(null);
                setNumpadMode('numbers');
                numpadPosition.setValue({ x: 0, y: 0 });
                numpadPosition.setOffset({ x: 0, y: 0 });
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle" size={24} color="#999" />
            </TouchableOpacity>
            
            {/* Drag-Handle zum Verschieben */}
            <View {...numpadPanResponder.panHandlers} style={styles.dragHandle}>
              <View style={styles.dragIndicator} />
              <Text style={styles.modalTitleCompact}>
                {editingMeasurementIndex !== null ? t('common.edit') : t('checklists.measurementTitle')}
              </Text>
              <View style={styles.bluetoothBadge}>
                <Ionicons name="bluetooth" size={14} color="#4caf50" />
              </View>
            </View>
            
            {/* Eingabefeld - kompakter */}
            <TextInput
              ref={measurementInputRef}
              style={styles.expressionInputCompact}
              value={measurementExpression}
              onChangeText={setMeasurementExpression}
              placeholder={t('checklists.enterValue')}
              autoFocus={true}
              autoCorrect={false}
              spellCheck={false}
              showSoftInputOnFocus={false}
            />
            
            {/* Live-Ergebnis - kompakter */}
            {measurementExpression.trim() !== '' && (
              <Text style={calculateExpression(measurementExpression) !== null ? styles.resultCompact : styles.resultErrorCompact}>
                {calculateExpression(measurementExpression) !== null 
                  ? `= ${calculateExpression(measurementExpression)?.toString().replace('.', ',')} ${measurementUnit}`
                  : t('checklists.invalid')}
              </Text>
            )}

            {/* Erweitertes Numpad - gleiches Design wie in Skizzen */}
            {showNumpad && (
              <View style={{ paddingHorizontal: 8, paddingTop: 4, paddingBottom: 4 }}>
                {/* Umschalt-Leiste: Zahlen/ABC */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 4 }}>
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 14, paddingVertical: 4, borderRadius: 6,
                      backgroundColor: numpadMode === 'letters' ? '#1976d2' : '#e8e8e8',
                      borderWidth: 1, borderColor: numpadMode === 'letters' ? '#1565c0' : '#ccc',
                    }}
                    onPress={() => setNumpadMode(numpadMode === 'numbers' ? 'letters' : 'numbers')}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: numpadMode === 'letters' ? '#fff' : '#555' }}>
                      {numpadMode === 'numbers' ? 'ABC' : '123'}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                {numpadMode === 'numbers' ? (
                  <>
                    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                      {['7','8','9'].map(k => (
                        <TouchableOpacity key={k} style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', borderRadius: 6, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress(k)}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: '#333' }}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                      {['4','5','6'].map(k => (
                        <TouchableOpacity key={k} style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', borderRadius: 6, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress(k)}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: '#333' }}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                      {['1','2','3'].map(k => (
                        <TouchableOpacity key={k} style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', borderRadius: 6, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress(k)}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: '#333' }}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                      {[',','0','-'].map(k => (
                        <TouchableOpacity key={k} style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', borderRadius: 6, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress(k)}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: '#333' }}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                      {['+','×','÷'].map(k => (
                        <TouchableOpacity key={k} style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', borderRadius: 6, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress(k === '×' ? '*' : k === '÷' ? '/' : k)}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#1976d2' }}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <TouchableOpacity style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', borderRadius: 6, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress('m')}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1976d2' }}>m</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', borderRadius: 6, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress('cm')}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1976d2' }}>cm</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffebee', borderRadius: 6, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress('⌫')}>
                        <Ionicons name="backspace-outline" size={18} color="#f44336" />
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    {/* Einheiten */}
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 4 }}>
                      {['m','m²','m³','lfm'].map(k => (
                        <TouchableOpacity key={`u-${k}`} style={{ flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', borderRadius: 5, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress(k)}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#1976d2' }}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 4 }}>
                      {['Stk','kg','l','Paar'].map(k => (
                        <TouchableOpacity key={`u2-${k}`} style={{ flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', borderRadius: 5, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress(k)}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#1976d2' }}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {/* QWERTZ Buchstaben */}
                    {[
                      ['Q','W','E','R','T','Z','U','I','O','P'],
                      ['A','S','D','F','G','H','J','K','L'],
                      ['Y','X','C','V','B','N','M'],
                    ].map((row, ri) => (
                      <View key={`lr-${ri}`} style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                        {row.map(letter => (
                          <TouchableOpacity key={letter} style={{ flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', borderRadius: 5, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress(numpadCaps ? letter : letter.toLowerCase())}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#333' }}>{numpadCaps ? letter : letter.toLowerCase()}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ))}
                    {/* Umlaute + Sonderzeichen */}
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['ä','ö','ü','ß'].map(k => (
                        <TouchableOpacity key={k} style={{ flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', borderRadius: 5, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress(numpadCaps ? k.toUpperCase() : k)}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: '#333' }}>{numpadCaps ? k.toUpperCase() : k}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity style={{ flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: numpadCaps ? '#1976d2' : '#f0f0f0', borderRadius: 5, borderWidth: 1, borderColor: '#ddd' }} onPress={() => setNumpadCaps(!numpadCaps)}>
                        <Ionicons name="arrow-up" size={16} color={numpadCaps ? '#fff' : '#666'} />
                      </TouchableOpacity>
                    </View>
                    {/* Leer + Sonderzeichen + Backspace */}
                    <View style={{ flexDirection: 'row', gap: 3 }}>
                      <TouchableOpacity style={{ flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', borderRadius: 5, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress(' ')}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#1976d2' }}>{t('checklists.space')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ flex: 0.5, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', borderRadius: 5, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress('.')}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#333' }}>.</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ flex: 0.5, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', borderRadius: 5, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress('/')}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#333' }}>/</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffebee', borderRadius: 5, borderWidth: 1, borderColor: '#ddd' }} onPress={() => handleNumpadPress('⌫')}>
                        <Ionicons name="backspace-outline" size={16} color="#f44336" />
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            )}
            
            {/* Einheiten - kompakter */}
            <View style={styles.unitRowCompact}>
              {availableUnits.map(unit => (
                <TouchableOpacity
                  key={unit}
                  style={[styles.unitChip, measurementUnit === unit && styles.unitChipActive]}
                  onPress={() => setMeasurementUnit(unit)}
                >
                  <Text style={[styles.unitChipText, measurementUnit === unit && styles.unitChipTextActive]}>{unit}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Buttons - kompakter */}
            <View style={styles.modalButtonsCompact}>
              <TouchableOpacity
                style={styles.cancelBtnCompact}
                onPress={() => {
                  setMeasurementModalPath(null);
                  setEditingMeasurementIndex(null);
                  setNumpadMode('numbers');
                  numpadPosition.setValue({ x: 0, y: 0 });
                  numpadPosition.setOffset({ x: 0, y: 0 });
                }}
              >
                <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtnCompact, calculateExpression(measurementExpression) === null && styles.btnDisabled]}
                onPress={() => {
                  confirmMeasurement();
                  setNumpadMode('numbers');
                  numpadPosition.setValue({ x: 0, y: 0 });
                  numpadPosition.setOffset({ x: 0, y: 0 });
                }}
                disabled={calculateExpression(measurementExpression) === null}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.confirmBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  unsavedHint: {
    fontSize: 12,
    color: '#ff9800',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4caf50',
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  checklistContainer: {
    flex: 1,
  },
  checklistContent: {
    padding: 16,
  },
  itemWrapper: {
    marginBottom: 12,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  checklistItemChecked: {
    backgroundColor: '#f8fff8',
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  // iPhone-spezifische kompakte Styles
  checklistItemPhone: {
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 6,
    marginBottom: 2,
  },
  checklistItemCheckedPhone: {
    backgroundColor: '#f8fff8',
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  itemTopRowPhone: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxTouchablePhone: {
    padding: 2,
    marginRight: 6,
  },
  checklistTextPhone: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
  },
  checklistTextCheckedPhone: {
    color: '#2e7d32',
    fontWeight: '600',
  },
  collapseButtonPhone: {
    padding: 2,
  },
  itemActionsRowPhone: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 8,
  },
  actionBtnPhone: {
    padding: 4,
  },
  subItemsHintPhone: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 2,
  },
  subItemCard: {
    backgroundColor: '#fafafa',
    shadowOpacity: 0.05,
    elevation: 1,
  },
  checkboxTouchable: {
    padding: 4,
  },
  itemContent: {
    flex: 1,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemActionsPhone: {
    gap: 1,
  },
  actionButton: {
    padding: 6,
  },
  actionButtonPhone: {
    padding: 3,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionButtonActive: {
    backgroundColor: '#1976d2',
    borderRadius: 6,
  },
  actionButtonHasContent: {
    // Grüner Rand wenn Inhalt vorhanden
  },
  // Labeled Action Buttons (Notiz, Messung)
  labeledActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
    gap: 4,
  },
  labeledActionButtonPhone: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 4,
    backgroundColor: '#f5f5f5',
    gap: 2,
  },
  labeledActionButtonActive: {
    backgroundColor: '#1976d2',
  },
  labeledActionButtonHasContent: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  labeledActionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  labeledActionTextPhone: {
    fontSize: 10,
  },
  labeledActionTextActive: {
    color: '#fff',
  },
  labeledActionTextHasContent: {
    color: '#4caf50',
  },
  closeSectionButton: {
    marginLeft: 'auto',
    padding: 4,
  },
  clipboardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
    gap: 6,
  },
  clipboardText: {
    flex: 1,
    fontSize: 12,
    color: '#e65100',
  },
  editingContainer: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1976d2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  editingInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  editingButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 8,
  },
  editConfirmButton: {
    padding: 4,
  },
  editCancelButton: {
    padding: 4,
  },
  collapseButton: {
    padding: 4,
    marginRight: 4,
  },
  checklistText: {
    fontSize: 16,
    color: '#333',
  },
  checklistTextChecked: {
    color: '#4caf50',
    fontWeight: '600',
  },
  subItemText: {
    fontSize: 14,
    color: '#555',
  },
  subItemTextChecked: {
    color: '#4caf50',
    fontWeight: '500',
  },
  subItemsHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  expandedContent: {
    marginTop: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#4caf50',
  },
  subItemsContainer: {
    marginBottom: 8,
  },
  subItemConnector: {
    width: 16,
    alignItems: 'center',
  },
  connectorLine: {
    width: 12,
    height: 2,
    backgroundColor: '#ddd',
  },
  newSubItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
  },
  newSubItemInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
  },
  removeSubButton: {
    padding: 4,
    marginLeft: 4,
  },
  confirmSubButton: {
    padding: 4,
    marginLeft: 8,
  },
  addSubItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    marginBottom: 12,
    gap: 6,
  },
  addSubItemText: {
    color: '#1976d2',
    fontSize: 14,
    fontWeight: '500',
  },
  limitReachedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  limitReachedText: {
    color: '#999',
    fontSize: 12,
    fontStyle: 'italic',
  },
  noteContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  noteLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  noteInput: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  footer: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#1976d2',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
  },
  // Messungs-Styles
  measurementSection: {
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  measurementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  measurementLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
  },
  addMeasurementButton: {
    padding: 2,
  },
  measurementsList: {
    marginTop: 8,
  },
  measurementChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#2196f3',
  },
  measurementChipText: {
    fontSize: 14,
    color: '#1976d2',
    fontWeight: '500',
  },
  removeMeasurementButton: {
    marginLeft: 6,
  },
  measurementSumContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#90caf9',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  measurementSumLabel: {
    fontSize: 12,
    color: '#1565c0',
    fontWeight: '600',
  },
  measurementSumText: {
    fontSize: 14,
    color: '#1565c0',
    fontWeight: '700',
    backgroundColor: '#bbdefb',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  // Modal-Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  measurementModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 350,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  expressionDisplay: {
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#2196f3',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    minHeight: 50,
    justifyContent: 'center',
  },
  expressionText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
    textAlign: 'right',
  },
  inputModeSwitch: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  switchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  switchButtonActive: {
    backgroundColor: '#2196f3',
  },
  switchButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  switchButtonTextActive: {
    color: '#fff',
  },
  numpad: {
    marginBottom: 12,
  },
  numpadRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  numpadKey: {
    flex: 1,
    aspectRatio: 1.3,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  numpadKeyText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
  },
  numpadOperator: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
  },
  numpadOperatorText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1976d2',
  },
  numpadDelete: {
    backgroundColor: '#ffebee',
    borderColor: '#f44336',
  },
  numpadClear: {
    backgroundColor: '#fff3e0',
    borderColor: '#ff9800',
  },
  numpadClearText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f57c00',
  },
  numpadToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    marginBottom: 8,
  },
  numpadToggleActive: {
    backgroundColor: '#2196f3',
  },
  numpadToggleText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  numpadToggleTextActive: {
    color: '#fff',
  },
  bluetoothHint: {
    fontSize: 12,
    color: '#4caf50',
    textAlign: 'center',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  expressionInput: {
    borderWidth: 2,
    borderColor: '#2196f3',
    borderRadius: 8,
    padding: 14,
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 8,
    backgroundColor: '#fff',
    fontWeight: '600',
  },
  inputHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 12,
  },
  measurementInput: {
    borderWidth: 2,
    borderColor: '#2196f3',
    borderRadius: 8,
    padding: 14,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  resultPreview: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
    alignItems: 'center',
  },
  resultPreviewText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2e7d32',
  },
  resultPreviewError: {
    fontSize: 14,
    color: '#f44336',
    fontStyle: 'italic',
  },
  unitLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  unitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  unitButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  unitButtonActive: {
    borderColor: '#2196f3',
    backgroundColor: '#e3f2fd',
  },
  unitButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  unitButtonTextActive: {
    color: '#1976d2',
    fontWeight: '700',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    flexDirection: 'row',
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#2196f3',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalConfirmText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  // Kompakte Modal-Styles
  measurementModalCompact: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    width: '90%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  dragHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  dragIndicator: {
    width: 40,
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
    position: 'absolute',
    left: '50%',
    marginLeft: -20,
    top: -2,
  },
  modalTitleCompact: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  closeButtonCompact: {
    position: 'absolute',
    right: 8,
    top: 8,
    padding: 4,
    zIndex: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
  },
  expressionInputCompact: {
    borderWidth: 2,
    borderColor: '#2196f3',
    borderRadius: 8,
    padding: 10,
    fontSize: 18,
    textAlign: 'center',
    backgroundColor: '#f8f8f8',
    fontWeight: '600',
    marginBottom: 6,
  },
  resultCompact: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4caf50',
    textAlign: 'center',
    marginBottom: 8,
  },
  resultErrorCompact: {
    fontSize: 14,
    color: '#f44336',
    textAlign: 'center',
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  toggleButtonActive: {
    backgroundColor: '#2196f3',
  },
  toggleButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  toggleButtonTextActive: {
    color: '#fff',
  },
  bluetoothBadge: {
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    padding: 6,
  },
  numpadCompact: {
    marginBottom: 8,
  },
  numpadRowCompact: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  numpadKeyCompact: {
    flex: 1,
    aspectRatio: 1.5,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  numpadKeyTextCompact: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  numpadOpCompact: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
  },
  numpadOpText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1976d2',
  },
  numpadDelCompact: {
    backgroundColor: '#ffebee',
    borderColor: '#f44336',
  },
  numpadClearCompact: {
    backgroundColor: '#fff3e0',
    borderColor: '#ff9800',
  },
  numpadClearTextCompact: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f57c00',
  },
  numpadModeCompact: {
    backgroundColor: '#e8eaf6',
    borderColor: '#5c6bc0',
  },
  numpadModeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3949ab',
  },
  numpadUnitCompact: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4caf50',
  },
  numpadUnitText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#388e3c',
  },
  numpadCapsActive: {
    backgroundColor: '#3949ab',
  },
  unitRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  unitChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  unitChipActive: {
    borderColor: '#2196f3',
    backgroundColor: '#e3f2fd',
  },
  unitChipText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  unitChipTextActive: {
    color: '#1976d2',
    fontWeight: '700',
  },
  modalButtonsCompact: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelBtnCompact: {
    flex: 1,
    padding: 10,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  confirmBtnCompact: {
    flex: 1,
    flexDirection: 'row',
    padding: 10,
    borderRadius: 6,
    backgroundColor: '#4caf50',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  confirmBtnText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  btnDisabled: {
    backgroundColor: '#ccc',
  },
});

import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChecklistTemplateService } from '../../services/LocalStorage';
import { ReferenceService, ReferenceFolder, ReferencePhoto } from '../../services/ReferenceService';
import * as ImagePicker from 'expo-image-picker';
import { Features } from '../../services/FeatureFlags';
import { useTranslation } from 'react-i18next';

// Rekursive Struktur für verschachtelte Punkte
interface RecursiveTemplateItem {
  text: string;
  subItems: RecursiveTemplateItem[];
  printImage?: string; // Bild für PDF-Druck (Base64)
  previewImages?: string[]; // Bilder für Vorschau-Galerie (nicht gedruckt)
  categoryLogo?: string; // Logo für Kategorien (Base64)
  referenceFolderId?: string; // ID des verknüpften Referenz-Ordners
  referenceFolderName?: string; // Name des verknüpften Referenz-Ordners
}

interface ChecklistTemplate {
  id: string;
  name: string;
  items: any[];
  templateLogo?: string; // Logo für die gesamte Vorlage
}

export default function EditTemplateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { templateId } = useLocalSearchParams();
  
  // iPhone vs iPad Erkennung - für unterschiedliches Layout
  const { width: screenWidth } = useWindowDimensions();
  const isPhone = Platform.OS === 'ios' ? !Platform.isPad : screenWidth < 768;
  
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateLogo, setTemplateLogo] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<RecursiveTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // State für kopiertes Item (Zwischenablage)
  const [copiedItem, setCopiedItem] = useState<RecursiveTemplateItem | null>(null);
  // State für eingeklappte Items (Set von Pfaden als String)
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  // State für Bild-Vorschau Modal
  const [imagePreviewModal, setImagePreviewModal] = useState<{ visible: boolean; images: string[]; title: string }>({ visible: false, images: [], title: '' });
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // State für Referenz-Ordner Modal
  const [showReferenceFolderModal, setShowReferenceFolderModal] = useState(false);
  const [referenceFolders, setReferenceFolders] = useState<ReferenceFolder[]>([]);
  const [referencePhotos, setReferencePhotos] = useState<ReferencePhoto[]>([]);
  const [currentReferenceFolder, setCurrentReferenceFolder] = useState<ReferenceFolder | null>(null);
  const [referenceTargetPath, setReferenceTargetPath] = useState<number[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(false);

  // State für "Punkte aus anderer Vorlage kopieren"
  const [showCopyFromModal, setShowCopyFromModal] = useState(false);
  const [otherTemplates, setOtherTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedCopyTemplate, setSelectedCopyTemplate] = useState<ChecklistTemplate | null>(null);
  const [selectedCopyItems, setSelectedCopyItems] = useState<Set<string>>(new Set());

  // Header-Titel setzen
  useLayoutEffect(() => {
    navigation.setOptions({
      title: templateId ? t('checklists.editTemplate') : t('checklists.createTemplate'),
    });
  }, [navigation, templateId, t]);

  useEffect(() => {
    if (templateId) {
      loadTemplate();
    } else {
      setLoading(false);
    }
  }, [templateId]);

  const loadTemplate = async () => {
    try {
      const tplId = Array.isArray(templateId) ? templateId[0] : templateId;
      const data = await ChecklistTemplateService.getById(tplId || '');
      if (data) {
        setTemplate(data);
        setTemplateName(data.name);
        setTemplateLogo((data as any).templateLogo);
        
        // Konvertiere Items zu rekursiver Struktur
        const convertItems = (rawItems: any[]): RecursiveTemplateItem[] => {
          return rawItems.map((item: any) => {
            if (typeof item === 'string') {
              return { text: item, subItems: [] };
            }
            
            let subItems: RecursiveTemplateItem[] = [];
            if (item.subItems && Array.isArray(item.subItems)) {
            subItems = item.subItems.map((sub: any) => {
              if (typeof sub === 'string') {
                return { text: sub, subItems: [] };
              }
              return {
                text: sub.text || '',
                subItems: sub.subItems ? convertItems(sub.subItems) : [],
                // Bilder mit laden
                printImage: sub.printImage,
                previewImages: sub.previewImages,
                categoryLogo: sub.categoryLogo,
                // Referenz-Ordner mit laden
                referenceFolderId: sub.referenceFolderId,
                referenceFolderName: sub.referenceFolderName,
              };
            });
          }
          
          return {
            text: item.text || '',
            subItems: subItems,
            // Bilder mit laden
            printImage: item.printImage,
            previewImages: item.previewImages,
            categoryLogo: item.categoryLogo,
            // Referenz-Ordner mit laden
            referenceFolderId: item.referenceFolderId,
            referenceFolderName: item.referenceFolderName,
          };
        });
      };
      
      const convertedItems = convertItems(data.items);
        setItems(convertedItems);
        
        // Alle Items mit Unterpunkten standardmäßig einklappen
        const collectPathsWithSubItems = (items: RecursiveTemplateItem[], basePath: number[] = []): string[] => {
          const paths: string[] = [];
          items.forEach((item, index) => {
            const currentPath = [...basePath, index];
            if (item.subItems && item.subItems.length > 0) {
              paths.push(currentPath.join('-'));
              paths.push(...collectPathsWithSubItems(item.subItems, currentPath));
            }
          });
          return paths;
        };
        
        const pathsToCollapse = collectPathsWithSubItems(convertedItems);
        setCollapsedPaths(new Set(pathsToCollapse));
      }
    } catch (error) {
      console.error('Error loading template:', error);
      Alert.alert(t('common.error'), t('checklists.templateLoadError'));
    } finally {
      setLoading(false);
    }
  };

  // Hauptpunkt hinzufügen
  const addItem = () => {
    setItems([...items, { text: '', subItems: [] }]);
  };

  // Bild auswählen für Druckbild oder Vorschau-Galerie
  const pickImage = async (path: number[], type: 'print' | 'preview' | 'logo') => {
    try {
      // Für Logos: festes Seitenverhältnis (3:1)
      // Für Druck- und Vorschaubilder: kein festes Verhältnis, Originalbild behalten
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: type === 'logo', // Nur für Logos bearbeiten
        aspect: type === 'logo' ? [3, 1] : undefined,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        
        if (type === 'print') {
          setItems(updateItemAtPath(items, path, { printImage: base64Image }));
        } else if (type === 'logo') {
          setItems(updateItemAtPath(items, path, { categoryLogo: base64Image }));
        } else {
          // Vorschau-Galerie - mehrere Bilder erlauben
          const currentItem = getItemAtPath(items, path);
          const currentPreviewImages = currentItem?.previewImages || [];
          setItems(updateItemAtPath(items, path, { previewImages: [...currentPreviewImages, base64Image] }));
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('common.error'), t('checklists.imageSelectError'));
    }
  };

  // Item an Pfad abrufen
  const getItemAtPath = (items: RecursiveTemplateItem[], path: number[]): RecursiveTemplateItem | null => {
    if (path.length === 0) return null;
    if (path.length === 1) return items[path[0]] || null;
    const [first, ...rest] = path;
    return getItemAtPath(items[first]?.subItems || [], rest);
  };

  // Template-Logo auswählen
  const pickTemplateLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setTemplateLogo(base64Image);
      }
    } catch (error) {
      console.error('Error picking template logo:', error);
      Alert.alert(t('common.error'), t('checklists.logoSelectError'));
    }
  };

  // Bild entfernen
  const removeImage = (path: number[], type: 'print' | 'preview' | 'logo', previewIndex?: number) => {
    if (type === 'print') {
      setItems(updateItemAtPath(items, path, { printImage: undefined }));
    } else if (type === 'logo') {
      setItems(updateItemAtPath(items, path, { categoryLogo: undefined }));
    } else if (type === 'preview' && previewIndex !== undefined) {
      const currentItem = getItemAtPath(items, path);
      const currentPreviewImages = currentItem?.previewImages || [];
      const newPreviewImages = currentPreviewImages.filter((_, i) => i !== previewIndex);
      setItems(updateItemAtPath(items, path, { previewImages: newPreviewImages }));
    }
  };

  // Bild-Vorschau öffnen
  const openImagePreview = (images: string[], title: string, startIndex: number = 0) => {
    setCurrentImageIndex(startIndex);
    setImagePreviewModal({ visible: true, images, title });
  };

  // Referenz-Ordner Modal öffnen (zum Verknüpfen eines Ordners)
  const openReferenceFolderPicker = async (path: number[]) => {
    setReferenceTargetPath(path);
    setLoadingReferences(true);
    setShowReferenceFolderModal(true);
    setCurrentReferenceFolder(null);
    setReferencePhotos([]);
    
    try {
      const folders = await ReferenceService.getFoldersByParent(undefined);
      setReferenceFolders(folders);
    } catch (error) {
      console.error('Error loading reference folders:', error);
      Alert.alert(t('common.error'), t('checklists.referenceFolderLoadError'));
    } finally {
      setLoadingReferences(false);
    }
  };

  // In einen Referenz-Ordner navigieren
  const navigateToReferenceFolder = async (folder: ReferenceFolder) => {
    setLoadingReferences(true);
    try {
      setCurrentReferenceFolder(folder);
      const [subfolders, photos] = await Promise.all([
        ReferenceService.getFoldersByParent(folder.id),
        ReferenceService.getPhotosInFolder(folder.id),
      ]);
      setReferenceFolders(subfolders);
      setReferencePhotos(photos);
    } catch (error) {
      console.error('Error loading folder contents:', error);
    } finally {
      setLoadingReferences(false);
    }
  };

  // Zurück zur Ordner-Übersicht
  const goBackInReferenceFolders = async () => {
    setLoadingReferences(true);
    try {
      if (currentReferenceFolder?.parent_id) {
        const parentFolder = await ReferenceService.getFolder(currentReferenceFolder.parent_id);
        if (parentFolder) {
          await navigateToReferenceFolder(parentFolder);
          return;
        }
      }
      // Zurück zur Root-Ebene
      setCurrentReferenceFolder(null);
      setReferencePhotos([]);
      const folders = await ReferenceService.getFoldersByParent(undefined);
      setReferenceFolders(folders);
    } catch (error) {
      console.error('Error going back:', error);
    } finally {
      setLoadingReferences(false);
    }
  };

  // Ordner mit Checklisten-Punkt verknüpfen (und automatisch speichern)
  const linkFolderToItem = async (folder: ReferenceFolder) => {
    try {
      // Ordner-ID und Name im State speichern
      const updatedItems = updateItemAtPath(items, referenceTargetPath, { 
        referenceFolderId: folder.id,
        referenceFolderName: folder.name
      });
      setItems(updatedItems);
      setShowReferenceFolderModal(false);
      
      // Automatisch in der Datenbank speichern
      if (templateId && templateName.trim()) {
        const tplId = Array.isArray(templateId) ? templateId[0] : templateId;
        await ChecklistTemplateService.update(tplId || '', {
          name: templateName,
          items: convertToApiFormat(updatedItems),
          templateLogo: templateLogo,
        });
      }
      
      Alert.alert(t('checklists.linked'), t('checklists.folderLinkedMessage', { name: folder.name }));
    } catch (error) {
      console.error('Error linking folder:', error);
      Alert.alert(t('common.error'), t('checklists.folderLinkError'));
    }
  };

  // Verknüpfung entfernen (und automatisch speichern)
  const unlinkFolder = async (path: number[]) => {
    try {
      const updatedItems = updateItemAtPath(items, path, { 
        referenceFolderId: undefined,
        referenceFolderName: undefined
      });
      setItems(updatedItems);
      
      // Automatisch in der Datenbank speichern
      if (templateId && templateName.trim()) {
        const tplId = Array.isArray(templateId) ? templateId[0] : templateId;
        await ChecklistTemplateService.update(tplId || '', {
          name: templateName,
          items: convertToApiFormat(updatedItems),
          templateLogo: templateLogo,
        });
      }
    } catch (error) {
      console.error('Error unlinking folder:', error);
    }
  };

  // Rekursiv Item an Pfad aktualisieren
  const updateItemAtPath = (
    items: RecursiveTemplateItem[],
    path: number[],
    updates: Partial<RecursiveTemplateItem>
  ): RecursiveTemplateItem[] => {
    const newItems = [...items];
    if (path.length === 1) {
      newItems[path[0]] = { ...newItems[path[0]], ...updates };
    } else {
      const [first, ...rest] = path;
      newItems[first] = {
        ...newItems[first],
        subItems: updateItemAtPath(newItems[first].subItems, rest, updates),
      };
    }
    return newItems;
  };

  // Text eines Items aktualisieren
  const updateItemText = (path: number[], text: string) => {
    setItems(updateItemAtPath(items, path, { text }));
  };

  // Item entfernen
  const removeItemAtPath = (items: RecursiveTemplateItem[], path: number[]): RecursiveTemplateItem[] => {
    if (path.length === 1) {
      return items.filter((_, i) => i !== path[0]);
    }
    const [first, ...rest] = path;
    const newItems = [...items];
    newItems[first] = {
      ...newItems[first],
      subItems: removeItemAtPath(newItems[first].subItems, rest),
    };
    return newItems;
  };

  const removeItem = (path: number[]) => {
    setItems(removeItemAtPath(items, path));
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

  // Item kopieren (deep copy)
  const copyItem = (path: number[]) => {
    const getItemAtPath = (items: RecursiveTemplateItem[], p: number[]): RecursiveTemplateItem | null => {
      if (p.length === 0) return null;
      if (p.length === 1) return items[p[0]];
      const [first, ...rest] = p;
      return getItemAtPath(items[first].subItems, rest);
    };
    
    const item = getItemAtPath(items, path);
    if (!item) return;
    
    // Deep copy des Items
    const deepCopy = (obj: RecursiveTemplateItem): RecursiveTemplateItem => ({
      text: obj.text,
      subItems: obj.subItems ? obj.subItems.map(deepCopy) : [],
    });
    
    setCopiedItem(deepCopy(item));
    Alert.alert(t('checklists.copied'), t('checklists.copiedMessage', { text: item.text }));
  };

  // Item einfügen (nach einer Position)
  const pasteItemAfter = (path: number[]) => {
    if (!copiedItem) {
      Alert.alert(t('common.note'), t('checklists.clipboardEmpty'));
      return;
    }
    
    // Deep copy des kopierten Items
    const deepCopy = (obj: RecursiveTemplateItem): RecursiveTemplateItem => ({
      text: obj.text,
      subItems: obj.subItems ? obj.subItems.map(deepCopy) : [],
    });
    
    const itemToInsert = deepCopy(copiedItem);
    
    if (path.length === 1) {
      // Einfügen auf Hauptebene
      const insertIndex = path[0] + 1;
      setItems([
        ...items.slice(0, insertIndex),
        itemToInsert,
        ...items.slice(insertIndex),
      ]);
    } else {
      // Einfügen als Unterpunkt
      const parentPath = path.slice(0, -1);
      const insertIndex = path[path.length - 1] + 1;
      
      const getItemAtPath = (items: RecursiveTemplateItem[], p: number[]): RecursiveTemplateItem | null => {
        if (p.length === 0) return null;
        if (p.length === 1) return items[p[0]];
        const [first, ...rest] = p;
        return getItemAtPath(items[first].subItems, rest);
      };
      
      const parentItem = getItemAtPath(items, parentPath);
      if (!parentItem) return;
      
      const newSubItems = [
        ...parentItem.subItems.slice(0, insertIndex),
        itemToInsert,
        ...parentItem.subItems.slice(insertIndex),
      ];
      
      setItems(updateItemAtPath(items, parentPath, { subItems: newSubItems }));
    }
    
    Alert.alert(t('checklists.pastedTitle'), t('checklists.pastedMessage', { text: copiedItem.text }));
  };

  // Unterpunkt hinzufügen
  const addSubItem = (path: number[]) => {
    const getItemAtPath = (items: RecursiveTemplateItem[], path: number[]): RecursiveTemplateItem | null => {
      if (path.length === 0) return null;
      if (path.length === 1) return items[path[0]];
      const [first, ...rest] = path;
      return getItemAtPath(items[first].subItems, rest);
    };
    
    const item = getItemAtPath(items, path);
    if (!item) return;
    
    // Basis-Version: Max 5 Unterpunkte pro Hauptpunkt
    if (!Features.maxChecklistItems || item.subItems.length >= Features.maxChecklistItems) {
      if (item.subItems.length >= 5) {
        Alert.alert(
          t('checklists.basicVersionTitle'), 
          t('checklists.basicSubItemLimit', { max: 5 }),
          [{ text: t('common.ok') }]
        );
        return;
      }
    }
    
    const newSubItems = [...item.subItems, { text: '', subItems: [] }];
    setItems(updateItemAtPath(items, path, { subItems: newSubItems }));
  };

  // ====== Punkte aus anderer Vorlage kopieren ======
  const openCopyFromModal = async () => {
    try {
      const templates = await ChecklistTemplateService.getAll();
      const currentId = Array.isArray(templateId) ? templateId[0] : templateId;
      // Aktuelle Vorlage aus der Liste ausschließen
      const others = templates.filter((tpl: any) => tpl.id !== currentId);
      setOtherTemplates(others);
      setSelectedCopyTemplate(null);
      setSelectedCopyItems(new Set());
      setShowCopyFromModal(true);
    } catch (err) {
      console.error('Error loading templates for copy:', err);
    }
  };

  const toggleCopyItemSelection = (itemKey: string) => {
    setSelectedCopyItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemKey)) {
        newSet.delete(itemKey);
      } else {
        newSet.add(itemKey);
      }
      return newSet;
    });
  };

  const selectAllCopyItems = (template: ChecklistTemplate) => {
    const allKeys = new Set<string>();
    const addKeys = (templateItems: any[], prefix: string) => {
      templateItems.forEach((item: any, idx: number) => {
        allKeys.add(`${prefix}-${idx}`);
      });
    };
    addKeys(template.items, 'item');
    if (selectedCopyItems.size === allKeys.size) {
      setSelectedCopyItems(new Set());
    } else {
      setSelectedCopyItems(allKeys);
    }
  };

  const convertApiItemToRecursive = (apiItem: any): RecursiveTemplateItem => {
    return {
      text: apiItem.text || '',
      subItems: (apiItem.subItems || []).map((sub: any) => convertApiItemToRecursive(sub)),
      printImage: apiItem.printImage,
      previewImages: apiItem.previewImages,
      categoryLogo: apiItem.categoryLogo,
      referenceFolderId: apiItem.referenceFolderId,
      referenceFolderName: apiItem.referenceFolderName,
    };
  };

  const applyCopyFromTemplate = () => {
    if (!selectedCopyTemplate || selectedCopyItems.size === 0) return;
    
    const newItems: RecursiveTemplateItem[] = [];
    selectedCopyTemplate.items.forEach((item: any, idx: number) => {
      if (selectedCopyItems.has(`item-${idx}`)) {
        newItems.push(convertApiItemToRecursive(item));
      }
    });
    
    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems]);
      Alert.alert(
        t('checklists.copied'),
        t('checklists.itemsCopiedFromTemplate', { count: newItems.length, name: selectedCopyTemplate.name })
      );
    }
    setShowCopyFromModal(false);
  };

  // Rekursive Konvertierung für API
  const convertToApiFormat = (items: RecursiveTemplateItem[]): any[] => {
    return items
      .filter(item => item.text.trim())
      .map(item => ({
        text: item.text.trim(),
        subItems: item.subItems.length > 0 ? convertToApiFormat(item.subItems) : [],
        // Bilder mit speichern
        printImage: item.printImage,
        previewImages: item.previewImages,
        categoryLogo: item.categoryLogo,
        // Referenz-Ordner mit speichern
        referenceFolderId: item.referenceFolderId,
        referenceFolderName: item.referenceFolderName,
      }));
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      Alert.alert(t('common.error'), t('checklists.enterName'));
      return;
    }

    const validItems = items.filter(item => item.text.trim());
    if (validItems.length === 0) {
      Alert.alert(t('common.error'), t('checklists.addAtLeastOneItem'));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: templateName,
        items: convertToApiFormat(items),
        templateLogo: templateLogo,
      };

      if (templateId) {
        const tplId = Array.isArray(templateId) ? templateId[0] : templateId;
        await ChecklistTemplateService.update(tplId || '', payload);
        Alert.alert(t('common.success'), t('checklists.templateUpdated'), [
          { text: t('common.ok'), onPress: () => router.back() },
        ]);
      } else {
        await ChecklistTemplateService.create(payload);
        Alert.alert(t('common.success'), t('checklists.templateCreated'), [
          { text: t('common.ok'), onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error('Error saving template:', error);
      Alert.alert(t('common.error'), t('checklists.templateSaveError'));
    } finally {
      setSaving(false);
    }
  };

  // Rekursive Render-Funktion
  const renderItem = (item: RecursiveTemplateItem, path: number[], depth: number = 0) => {
    const isMainItem = depth === 0;
    const hasSubItems = item.subItems.length > 0;
    const collapsed = isCollapsed(path);
    const pathKey = path.join('-');
    
    // Einrückung: Auf iPhone KEINE Einrückung, stattdessen farbige Linie links
    const indentSize = isPhone ? 0 : 20;
    
    // Farben für verschiedene Ebenen (für iPhone)
    const depthColors = ['#1976d2', '#9c27b0', '#ff9800', '#4caf50', '#f44336'];
    const depthColor = depthColors[Math.min(depth, depthColors.length - 1)];
    
    return (
      <View key={pathKey} style={[
        styles.itemContainer, 
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
        {/* Item Header mit Eingabefeld */}
        <View style={styles.itemHeader}>
          {depth > 0 && (
            <View style={styles.depthIndicator}>
              <View style={styles.depthLine} />
            </View>
          )}
          
          {/* Einklappen-Button (nur wenn Unterpunkte vorhanden) */}
          {hasSubItems && (
            <TouchableOpacity
              style={styles.collapseButton}
              onPress={() => toggleCollapse(path)}
            >
              <Ionicons 
                name={collapsed ? "chevron-forward" : "chevron-down"} 
                size={isPhone ? 14 : 18} 
                color="#666" 
              />
            </TouchableOpacity>
          )}
          
          <TextInput
            style={[
              styles.itemInput,
              !isMainItem && styles.subItemInput,
              hasSubItems && styles.itemInputWithCollapse,
              isPhone && styles.itemInputPhone,
            ]}
            placeholder={isMainItem ? `Hauptpunkt ${path[0] + 1}` : `Unterpunkt`}
            placeholderTextColor="#999"
            value={item.text}
            onChangeText={(text) => updateItemText(path, text)}
          />
          
          {/* Action Buttons */}
          <View style={[styles.itemActions, isPhone && styles.itemActionsPhone]}>
            {/* Kopieren Button */}
            <TouchableOpacity
              style={[styles.actionButton, isPhone && styles.actionButtonPhone]}
              onPress={() => copyItem(path)}
            >
              <Ionicons name="copy-outline" size={isPhone ? 14 : 18} color="#ff9800" />
            </TouchableOpacity>
            
            {/* Einfügen Button (nur wenn etwas kopiert wurde) */}
            {copiedItem && (
              <TouchableOpacity
                style={[styles.actionButton, isPhone && styles.actionButtonPhone]}
                onPress={() => pasteItemAfter(path)}
              >
                <Ionicons name="clipboard-outline" size={isPhone ? 14 : 18} color="#4caf50" />
              </TouchableOpacity>
            )}
            
            {/* Löschen Button */}
            <TouchableOpacity
              style={[styles.actionButton, isPhone && styles.actionButtonPhone]}
              onPress={() => removeItem(path)}
            >
              <Ionicons name="trash-outline" size={isPhone ? 14 : 18} color="#f44336" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Bild-Bereich - Labels ÜBER den Unterpunkten, damit sie beim Item bleiben */}
        {/* In Basis-Version: Nur eingeschränkte Funktionen */}
        <View style={styles.imageSection}>
          <View style={styles.imageFieldsRow}>
            {/* Logo für Hauptpunkte (Kategorien) - nur Pro */}
            {Features.showChecklistLogo && isMainItem && (
              <View style={styles.imageFieldColumn}>
                <Text style={styles.imageLabelTop}>Firmenlogo</Text>
                {item.categoryLogo ? (
                  <View style={styles.imagePreviewContainer}>
                    <TouchableOpacity onPress={() => openImagePreview([item.categoryLogo!], item.text || 'Logo')}>
                      <Image source={{ uri: item.categoryLogo }} style={styles.logoPreview} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.removeImageBtn} onPress={() => removeImage(path, 'logo')}>
                      <Ionicons name="close-circle" size={20} color="#f44336" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.addImageBtn} onPress={() => pickImage(path, 'logo')}>
                    <Ionicons name="business-outline" size={16} color="#1976d2" />
                    <Text style={styles.addImageText}>Logo</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            
            {/* Druckbild (wird im PDF gedruckt) - nur Pro */}
            {Features.showChecklistDruckbild && (
            <View style={styles.imageFieldColumn}>
              <Text style={styles.imageLabelTop}>Druckbild</Text>
              {item.printImage ? (
                <View style={styles.imagePreviewContainer}>
                  <TouchableOpacity onPress={() => openImagePreview([item.printImage!], item.text || 'Druckbild')}>
                    <Image source={{ uri: item.printImage }} style={styles.thumbnailPreview} resizeMode="contain" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.removeImageBtn} onPress={() => removeImage(path, 'print')}>
                    <Ionicons name="close-circle" size={20} color="#f44336" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.addImageBtn} onPress={() => pickImage(path, 'print')}>
                  <Ionicons name="print-outline" size={16} color="#4caf50" />
                  <Text style={styles.addImageText}>Druckbild</Text>
                </TouchableOpacity>
              )}
            </View>
            )}
            
            {/* Referenz-Ordner Verknüpfung - nur Pro */}
            {Features.showChecklistVerknuepfungen && (
            <View style={styles.referenceFieldColumn}>
              <Text style={styles.imageLabelTop}>Referenz</Text>
              {item.referenceFolderId ? (
                <View style={styles.linkedFolderContainer}>
                  <View style={styles.linkedFolderInfo}>
                    <Ionicons name="folder" size={16} color="#2196f3" />
                    <Text style={styles.linkedFolderName} numberOfLines={1}>{item.referenceFolderName || 'Ordner'}</Text>
                  </View>
                  <TouchableOpacity style={styles.unlinkBtn} onPress={() => unlinkFolder(path)}>
                    <Ionicons name="close-circle" size={18} color="#f44336" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[styles.addImageBtn, styles.referenceBtn]} onPress={() => openReferenceFolderPicker(path)}>
                  <Ionicons name="folder-outline" size={16} color="#2196f3" />
                  <Text style={[styles.addImageText, { color: '#2196f3' }]}>Ordner verknüpfen</Text>
                </TouchableOpacity>
              )}
            </View>
            )}

            {/* Vorschau-Galerie (nur zur Beratung, nicht gedruckt) - nur Pro */}
            {Features.showChecklistVorschau && (
            <View style={styles.previewFieldColumn}>
              <Text style={styles.imageLabelTop}>Vorschau</Text>
              <View style={styles.previewImagesContainer}>
                {(item.previewImages || []).map((img, idx) => (
                  <View key={idx} style={styles.imagePreviewContainer}>
                    <TouchableOpacity onPress={() => openImagePreview(item.previewImages || [], item.text || 'Vorschau', idx)}>
                      <Image source={{ uri: img }} style={styles.smallThumbnail} resizeMode="contain" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.removeImageBtnSmall} onPress={() => removeImage(path, 'preview', idx)}>
                      <Ionicons name="close-circle" size={16} color="#f44336" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.addImageBtn} onPress={() => pickImage(path, 'preview')}>
                  <Ionicons name="images-outline" size={16} color="#ff9800" />
                  <Text style={styles.addImageText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            )}
          </View>
        </View>

        {/* Unterpunkte rekursiv rendern (NACH den Bild-Labels, wenn nicht eingeklappt) */}
        {hasSubItems && !collapsed && (
          <View style={styles.subItemsSection}>
            {item.subItems.map((subItem, subIndex) => 
              renderItem(subItem, [...path, subIndex], depth + 1)
            )}
          </View>
        )}

        {/* Anzeige wenn eingeklappt */}
        {hasSubItems && collapsed && (
          <TouchableOpacity 
            style={styles.collapsedHint}
            onPress={() => toggleCollapse(path)}
          >
            <Text style={styles.collapsedHintText}>
              {item.subItems.length} Unterpunkt{item.subItems.length !== 1 ? 'e' : ''} ausgeblendet
            </Text>
          </TouchableOpacity>
        )}

        {/* Button zum Hinzufügen von Unterpunkten (nur wenn nicht eingeklappt) */}
        {/* Basis: Keine Unter-Unterpunkte (depth > 0), max 5 pro Hauptpunkt */}
        {!collapsed && (
          // In Basis-Version: Keine Verschachtelung unter Ebene 1
          (Features.allowNestedSubItems || depth === 0) && 
          // Limit-Prüfung: Max 5 Unterpunkte
          (Features.maxChecklistItems >= 100 || item.subItems.length < Features.maxChecklistItems)
        ) && (
          <TouchableOpacity
            style={[styles.addSubItemButton, { marginLeft: depth > 0 ? 24 : 0 }]}
            onPress={() => addSubItem(path)}
          >
            <Ionicons name="add" size={16} color="#1976d2" />
            <Text style={styles.addSubItemText}>
              {depth === 0 ? t('checklists.addSubItem') : t('checklists.addAnotherSubItem')}
            </Text>
          </TouchableOpacity>
        )}
        {/* Limit erreicht Hinweis - nur für Ebene 0 */}
        {!collapsed && depth === 0 && Features.maxChecklistItems < 100 && item.subItems.length >= Features.maxChecklistItems && (
          <View style={styles.limitReachedBoxSmall}>
            <Ionicons name="information-circle" size={14} color="#f57c00" />
            <Text style={styles.limitReachedTextSmall}>Max. {Features.maxChecklistItems} Unterpunkte (Basic)</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen 
        options={{ 
          title: templateId ? t('checklists.editTemplate') : t('checklists.createTemplate') 
        }} 
      />
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Zwischenablage-Anzeige */}
      {copiedItem && (
        <View style={styles.clipboardBar}>
          <Ionicons name="clipboard" size={16} color="#ff9800" />
          <Text style={styles.clipboardBarText}>
            Kopiert: "{copiedItem.text.substring(0, 30)}{copiedItem.text.length > 30 ? '...' : ''}"
          </Text>
          <TouchableOpacity onPress={() => setCopiedItem(null)}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        </View>
      )}
      
      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('checklists.templateName')}</Text>
            <View style={styles.templateNameRow}>
              <TextInput
                style={[styles.input, styles.templateNameInput]}
                placeholder="z.B. Dachinspektion"
                placeholderTextColor="#999"
                value={templateName}
                onChangeText={setTemplateName}
              />
              {/* Template Logo - nur in Pro */}
              {Features.showChecklistTemplateLogo && (
              <>
              {templateLogo ? (
                <View style={styles.templateLogoContainer}>
                  <TouchableOpacity onPress={() => openImagePreview([templateLogo], templateName || 'Logo')}>
                    <Image source={{ uri: templateLogo }} style={styles.templateLogoPreview} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.removeLogoBtn} onPress={() => setTemplateLogo(undefined)}>
                    <Ionicons name="close-circle" size={20} color="#f44336" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.addLogoBtn} onPress={pickTemplateLogo}>
                  <Ionicons name="business-outline" size={20} color="#1976d2" />
                  <Text style={styles.addLogoText}>Logo</Text>
                </TouchableOpacity>
              )}
              </>
              )}
            </View>
          </View>

          <View style={styles.itemsSection}>
            <Text style={styles.sectionTitle}>Checklisten-Punkte</Text>
            <Text style={styles.sectionHint}>
              {Features.maxMainItems < 100 
                ? `Erstellen Sie bis zu ${Features.maxMainItems} Hauptpunkte mit je ${Features.maxChecklistItems} Unterpunkten`
                : t('checklists.editTemplateHint')
              }
            </Text>
            
            {items.map((item, index) => renderItem(item, [index], 0))}

            {/* Neuen Hauptpunkt Button - mit Limit-Prüfung */}
            {(Features.maxMainItems >= 100 || items.length < Features.maxMainItems) && (
            <TouchableOpacity style={styles.addItemButton} onPress={addItem}>
              <Ionicons name="add-circle" size={24} color="#1976d2" />
              <Text style={styles.addItemText}>{t('checklists.addMainItem')}</Text>
            </TouchableOpacity>
            )}
            
            {/* Punkte aus anderer Vorlage kopieren Button */}
            <TouchableOpacity style={styles.copyFromButton} onPress={openCopyFromModal}>
              <Ionicons name="copy-outline" size={22} color="#7b1fa2" />
              <Text style={styles.copyFromButtonText}>{t('checklists.copyFromTemplate')}</Text>
            </TouchableOpacity>
            {Features.maxMainItems < 100 && items.length >= Features.maxMainItems && (
            <View style={styles.limitReachedBox}>
              <Ionicons name="information-circle" size={20} color="#f57c00" />
              <Text style={styles.limitReachedText}>
                Maximum von {Features.maxMainItems} Hauptpunkten erreicht (Basic Version)
              </Text>
            </View>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={saveTemplate}
          disabled={saving}
        >
          <Ionicons name="checkmark-circle" size={24} color="#fff" />
          <Text style={styles.saveButtonText}>
            {saving ? t('common.isSaving') : t('checklists.saveTemplate')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bild-Vorschau Modal */}
      <Modal
        visible={imagePreviewModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setImagePreviewModal({ ...imagePreviewModal, visible: false })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.imageModalContent}>
            <View style={styles.imageModalHeader}>
              <Text style={styles.imageModalTitle}>{imagePreviewModal.title}</Text>
              <TouchableOpacity onPress={() => setImagePreviewModal({ ...imagePreviewModal, visible: false })}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>
            
            {imagePreviewModal.images.length > 0 && (
              <View style={styles.imageModalBody}>
                <Image
                  source={{ uri: imagePreviewModal.images[currentImageIndex] }}
                  style={styles.fullImage}
                  resizeMode="contain"
                />
                
                {imagePreviewModal.images.length > 1 && (
                  <View style={styles.imageNavigation}>
                    <TouchableOpacity
                      style={[styles.navButton, currentImageIndex === 0 && styles.navButtonDisabled]}
                      onPress={() => setCurrentImageIndex(Math.max(0, currentImageIndex - 1))}
                      disabled={currentImageIndex === 0}
                    >
                      <Ionicons name="chevron-back" size={30} color={currentImageIndex === 0 ? '#ccc' : '#1976d2'} />
                    </TouchableOpacity>
                    
                    <Text style={styles.imageCounter}>
                      {currentImageIndex + 1} / {imagePreviewModal.images.length}
                    </Text>
                    
                    <TouchableOpacity
                      style={[styles.navButton, currentImageIndex === imagePreviewModal.images.length - 1 && styles.navButtonDisabled]}
                      onPress={() => setCurrentImageIndex(Math.min(imagePreviewModal.images.length - 1, currentImageIndex + 1))}
                      disabled={currentImageIndex === imagePreviewModal.images.length - 1}
                    >
                      <Ionicons name="chevron-forward" size={30} color={currentImageIndex === imagePreviewModal.images.length - 1 ? '#ccc' : '#1976d2'} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Referenz-Ordner Modal */}
      <Modal
        visible={showReferenceFolderModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowReferenceFolderModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.referenceFolderModalContent}>
            <View style={styles.referenceFolderHeader}>
              {currentReferenceFolder ? (
                <TouchableOpacity onPress={goBackInReferenceFolders} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={24} color="#1976d2" />
                </TouchableOpacity>
              ) : (
                <View style={styles.backBtn} />
              )}
              <Text style={styles.referenceFolderTitle}>
                {currentReferenceFolder?.name || t('checklists.referenceFolder')}
              </Text>
              <TouchableOpacity onPress={() => setShowReferenceFolderModal(false)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            {loadingReferences ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1976d2" />
              </View>
            ) : (
              <ScrollView style={styles.referenceFolderList}>
                {/* Ordner anzeigen */}
                {referenceFolders.length > 0 && (
                  <View style={styles.referenceFolderSection}>
                    <Text style={styles.referenceSectionLabel}>Ordner</Text>
                    {referenceFolders.map((folder) => (
                      <TouchableOpacity
                        key={folder.id}
                        style={styles.referenceFolderItem}
                        onPress={() => navigateToReferenceFolder(folder)}
                      >
                        {folder.thumbnail_uri ? (
                          <Image source={{ uri: folder.thumbnail_uri }} style={styles.folderThumb} />
                        ) : (
                          <View style={styles.folderIconBox}>
                            <Ionicons name="folder" size={24} color="#ffa726" />
                          </View>
                        )}
                        <View style={styles.folderInfo}>
                          <Text style={styles.folderNameText}>{folder.name}</Text>
                          <Text style={styles.folderMetaText}>{folder.photo_count} Fotos</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#999" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Fotos nicht anzeigen - nur Ordner-Auswahl */}
                {currentReferenceFolder && referencePhotos.length > 0 && (
                  <View style={styles.referenceFolderSection}>
                    <Text style={styles.referenceSectionLabel}>Dieser Ordner enthält {referencePhotos.length} Foto(s)</Text>
                    <TouchableOpacity
                      style={styles.selectFolderBtn}
                      onPress={() => linkFolderToItem(currentReferenceFolder)}
                    >
                      <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      <Text style={styles.selectFolderBtnText}>"{currentReferenceFolder.name}" verknüpfen</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Ordner auswählen wenn wir in einem sind (auch wenn keine Fotos) */}
                {currentReferenceFolder && referencePhotos.length === 0 && referenceFolders.length === 0 && (
                  <View style={styles.referenceFolderSection}>
                    <Text style={styles.referenceSectionLabel}>Ordner ist leer</Text>
                    <TouchableOpacity
                      style={styles.selectFolderBtn}
                      onPress={() => linkFolderToItem(currentReferenceFolder)}
                    >
                      <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      <Text style={styles.selectFolderBtnText}>"{currentReferenceFolder.name}" trotzdem verknüpfen</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {!currentReferenceFolder && referenceFolders.length === 0 && (
                  <View style={styles.emptyReferenceState}>
                    <Ionicons name="folder-open-outline" size={48} color="#ccc" />
                    <Text style={styles.emptyReferenceText}>
                      Keine Referenz-Ordner vorhanden
                    </Text>
                    <Text style={styles.emptyReferenceHint}>
                      Erstellen Sie zuerst Ordner unter "Referenz Fotos"
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Punkte aus anderer Vorlage kopieren Modal */}
      <Modal
        visible={showCopyFromModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCopyFromModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.copyFromModalContent}>
            <View style={styles.copyFromHeader}>
              {selectedCopyTemplate ? (
                <TouchableOpacity onPress={() => { setSelectedCopyTemplate(null); setSelectedCopyItems(new Set()); }} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={24} color="#1976d2" />
                </TouchableOpacity>
              ) : (
                <View style={styles.backBtn} />
              )}
              <Text style={styles.copyFromTitle}>
                {selectedCopyTemplate 
                  ? selectedCopyTemplate.name 
                  : t('checklists.copyFromTemplate')}
              </Text>
              <TouchableOpacity onPress={() => setShowCopyFromModal(false)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.copyFromList}>
              {!selectedCopyTemplate ? (
                // Vorlagen-Auswahl
                <>
                  {otherTemplates.length === 0 ? (
                    <View style={styles.emptyReferenceState}>
                      <Ionicons name="documents-outline" size={48} color="#ccc" />
                      <Text style={styles.emptyReferenceText}>
                        {t('checklists.noOtherTemplates')}
                      </Text>
                    </View>
                  ) : (
                    otherTemplates.map((tpl) => (
                      <TouchableOpacity 
                        key={tpl.id} 
                        style={styles.copyFromTemplateItem}
                        onPress={() => setSelectedCopyTemplate(tpl)}
                      >
                        <View style={styles.copyFromTemplateInfo}>
                          <Text style={styles.copyFromTemplateName}>{tpl.name}</Text>
                          <Text style={styles.copyFromTemplateCount}>
                            {t('checklists.itemCount', { count: tpl.items.length })}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={22} color="#999" />
                      </TouchableOpacity>
                    ))
                  )}
                </>
              ) : (
                // Punkte-Auswahl aus der gewählten Vorlage
                <>
                  <TouchableOpacity 
                    style={styles.selectAllButton}
                    onPress={() => selectAllCopyItems(selectedCopyTemplate)}
                  >
                    <Ionicons 
                      name={selectedCopyItems.size === selectedCopyTemplate.items.length ? "checkbox" : "square-outline"} 
                      size={22} color="#1976d2" 
                    />
                    <Text style={styles.selectAllText}>{t('checklists.selectAll')}</Text>
                  </TouchableOpacity>
                  
                  {selectedCopyTemplate.items.map((item: any, idx: number) => {
                    const key = `item-${idx}`;
                    const isSelected = selectedCopyItems.has(key);
                    return (
                      <TouchableOpacity 
                        key={key} 
                        style={[styles.copyFromItem, isSelected && styles.copyFromItemSelected]}
                        onPress={() => toggleCopyItemSelection(key)}
                      >
                        <Ionicons 
                          name={isSelected ? "checkbox" : "square-outline"} 
                          size={22} 
                          color={isSelected ? "#1976d2" : "#999"} 
                        />
                        <View style={styles.copyFromItemContent}>
                          <Text style={[styles.copyFromItemText, isSelected && styles.copyFromItemTextSelected]}>
                            {item.text}
                          </Text>
                          {item.subItems && item.subItems.length > 0 && (
                            <Text style={styles.copyFromSubCount}>
                              {t('checklists.subItemCount', { count: item.subItems.length })}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </ScrollView>

            {selectedCopyTemplate && selectedCopyItems.size > 0 && (
              <View style={styles.copyFromFooter}>
                <TouchableOpacity 
                  style={styles.copyFromApplyButton}
                  onPress={applyCopyFromTemplate}
                >
                  <Ionicons name="copy" size={20} color="#fff" />
                  <Text style={styles.copyFromApplyText}>
                    {t('checklists.copySelectedItems', { count: selectedCopyItems.size })}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
    </>
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
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 20,
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
  itemsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  itemContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  depthIndicator: {
    width: 20,
    alignItems: 'center',
  },
  depthLine: {
    width: 12,
    height: 2,
    backgroundColor: '#1976d2',
  },
  itemInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  subItemInput: {
    backgroundColor: '#e8f4fd',
    fontSize: 14,
    padding: 10,
  },
  itemInputWithCollapse: {
    flex: 1,
  },
  removeButton: {
    padding: 8,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
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
  itemInputPhone: {
    fontSize: 14,
    fontWeight: '600',
    padding: 6,
    color: '#222',
  },
  collapseButton: {
    padding: 4,
  },
  collapsedHint: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    marginTop: 8,
    marginLeft: 24,
  },
  collapsedHintText: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
  },
  clipboardBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ffcc80',
    gap: 8,
  },
  clipboardBarText: {
    flex: 1,
    fontSize: 13,
    color: '#e65100',
  },
  subItemsSection: {
    marginTop: 8,
  },
  addSubItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 4,
    gap: 4,
  },
  addSubItemText: {
    color: '#1976d2',
    fontSize: 13,
  },
  limitReachedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    padding: 12,
    marginTop: 12,
    borderRadius: 8,
    gap: 8,
  },
  limitReachedText: {
    color: '#e65100',
    fontSize: 13,
    flex: 1,
  },
  limitReachedBoxSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 4,
    borderRadius: 6,
    gap: 6,
  },
  limitReachedTextSmall: {
    color: '#e65100',
    fontSize: 11,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  addItemText: {
    color: '#1976d2',
    fontSize: 16,
    fontWeight: '600',
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
  // Image Styles
  imageSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  imageFieldsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  imageFieldColumn: {
    alignItems: 'center',
    minWidth: 90,
    maxWidth: 140,
  },
  referenceFieldColumn: {
    alignItems: 'center',
    minWidth: 180,
  },
  previewFieldColumn: {
    alignItems: 'flex-start',
    flex: 1,
    minWidth: 120,
  },
  imageLabelTop: {
    fontSize: 10,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center',
  },
  imageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  imageLabel: {
    fontSize: 12,
    color: '#666',
    width: 80,
  },
  imagePreviewContainer: {
    position: 'relative',
    marginRight: 8,
  },
  logoPreview: {
    width: 80,
    height: 30,
    borderRadius: 4,
    backgroundColor: '#f5f5f5',
  },
  thumbnailPreview: {
    width: 80,
    height: 60,
    borderRadius: 4,
    backgroundColor: '#f5f5f5',
  },
  smallThumbnail: {
    width: 40,
    height: 30,
    borderRadius: 4,
    backgroundColor: '#f5f5f5',
  },
  removeImageBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  removeImageBtnSmall: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  addImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
    minWidth: 80,
    justifyContent: 'center',
  },
  addImageText: {
    fontSize: 12,
    color: '#666',
  },
  previewImagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    gap: 8,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalContent: {
    width: '95%',
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  imageModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  imageModalBody: {
    padding: 16,
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: 400,
  },
  imageNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 20,
  },
  navButton: {
    padding: 8,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  imageCounter: {
    fontSize: 16,
    color: '#666',
  },
  // Template Logo Styles
  templateNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  templateNameInput: {
    flex: 1,
  },
  templateLogoContainer: {
    position: 'relative',
  },
  templateLogoPreview: {
    width: 100,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  removeLogoBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  addLogoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    gap: 6,
  },
  addLogoText: {
    fontSize: 14,
    color: '#1976d2',
    fontWeight: '500',
  },
  // Reference Folder Modal Styles
  referenceBtn: {
    backgroundColor: '#e3f2fd',
    minWidth: 160,
  },
  referenceFolderModalContent: {
    width: '95%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  referenceFolderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backBtn: {
    width: 40,
  },
  referenceFolderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  referenceFolderList: {
    maxHeight: 500,
  },
  referenceFolderSection: {
    padding: 12,
  },
  referenceSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
  },
  referenceFolderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  folderThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  folderIconBox: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#fff3e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderInfo: {
    flex: 1,
  },
  folderNameText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  folderMetaText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  referencePhotosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  referencePhotoItem: {
    width: 80,
    alignItems: 'center',
  },
  referencePhotoThumb: {
    width: 80,
    height: 80,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  referencePhotoName: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  emptyReferenceState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyReferenceText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  emptyReferenceHint: {
    fontSize: 12,
    color: '#bbb',
    marginTop: 6,
    textAlign: 'center',
  },
  // Linked Folder Styles
  linkedFolderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
    minWidth: 160,
  },
  linkedFolderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minWidth: 100,
  },
  linkedFolderName: {
    fontSize: 12,
    color: '#1976d2',
    fontWeight: '600',
    flex: 1,
  },
  unlinkBtn: {
    marginLeft: 4,
  },
  selectFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4caf50',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  selectFolderBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Copy From Template Styles
  copyFromButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#7b1fa2',
    borderStyle: 'dashed',
    backgroundColor: '#f3e5f5',
  },
  copyFromButtonText: {
    color: '#7b1fa2',
    fontSize: 15,
    fontWeight: '600',
  },
  copyFromModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    width: '100%',
    position: 'absolute' as const,
    bottom: 0,
  },
  copyFromHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  copyFromTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#333',
    flex: 1,
    textAlign: 'center' as const,
  },
  copyFromList: {
    maxHeight: 400,
    paddingHorizontal: 16,
  },
  copyFromTemplateItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  copyFromTemplateInfo: {
    flex: 1,
  },
  copyFromTemplateName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#333',
  },
  copyFromTemplateCount: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  selectAllButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: '#1976d2',
    marginBottom: 4,
  },
  selectAllText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#1976d2',
  },
  copyFromItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    borderRadius: 8,
    marginVertical: 1,
  },
  copyFromItemSelected: {
    backgroundColor: '#e3f2fd',
  },
  copyFromItemContent: {
    flex: 1,
  },
  copyFromItemText: {
    fontSize: 15,
    color: '#333',
  },
  copyFromItemTextSelected: {
    fontWeight: '600' as const,
    color: '#1976d2',
  },
  copyFromSubCount: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  copyFromFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  copyFromApplyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#7b1fa2',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  copyFromApplyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
  },
});

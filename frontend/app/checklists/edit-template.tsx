import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChecklistTemplateService } from '../../services/LocalStorage';
import * as ImagePicker from 'expo-image-picker';

// Rekursive Struktur für verschachtelte Punkte
interface RecursiveTemplateItem {
  text: string;
  subItems: RecursiveTemplateItem[];
  printImage?: string; // Bild für PDF-Druck (Base64)
  previewImages?: string[]; // Bilder für Vorschau-Galerie (nicht gedruckt)
  categoryLogo?: string; // Logo für Kategorien (Base64)
}

interface ChecklistTemplate {
  id: string;
  name: string;
  items: any[];
}

export default function EditTemplateScreen() {
  const router = useRouter();
  const { templateId } = useLocalSearchParams();
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
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
              };
            });
          }
          
          return {
            text: item.text || '',
            subItems: subItems,
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
      Alert.alert('Fehler', 'Vorlage konnte nicht geladen werden');
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
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: type === 'logo' ? [3, 1] : [4, 3],
        quality: 0.7,
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
      Alert.alert('Fehler', 'Bild konnte nicht ausgewählt werden');
    }
  };

  // Item an Pfad abrufen
  const getItemAtPath = (items: RecursiveTemplateItem[], path: number[]): RecursiveTemplateItem | null => {
    if (path.length === 0) return null;
    if (path.length === 1) return items[path[0]] || null;
    const [first, ...rest] = path;
    return getItemAtPath(items[first]?.subItems || [], rest);
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
    Alert.alert('Kopiert', `"${item.text}" wurde kopiert`);
  };

  // Item einfügen (nach einer Position)
  const pasteItemAfter = (path: number[]) => {
    if (!copiedItem) {
      Alert.alert('Hinweis', 'Kein Element in der Zwischenablage');
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
    
    Alert.alert('Eingefügt', `"${copiedItem.text}" wurde eingefügt`);
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
    
    const newSubItems = [...item.subItems, { text: '', subItems: [] }];
    setItems(updateItemAtPath(items, path, { subItems: newSubItems }));
  };

  // Rekursive Konvertierung für API
  const convertToApiFormat = (items: RecursiveTemplateItem[]): any[] => {
    return items
      .filter(item => item.text.trim())
      .map(item => ({
        text: item.text.trim(),
        subItems: item.subItems.length > 0 ? convertToApiFormat(item.subItems) : [],
      }));
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Namen ein');
      return;
    }

    const validItems = items.filter(item => item.text.trim());
    if (validItems.length === 0) {
      Alert.alert('Fehler', 'Bitte fügen Sie mindestens einen Punkt hinzu');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: templateName,
        items: convertToApiFormat(items),
      };

      if (templateId) {
        const tplId = Array.isArray(templateId) ? templateId[0] : templateId;
        await ChecklistTemplateService.update(tplId || '', payload);
        Alert.alert('Erfolg', 'Vorlage wurde aktualisiert', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        await ChecklistTemplateService.create(payload);
        Alert.alert('Erfolg', 'Vorlage wurde erstellt', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error('Error saving template:', error);
      Alert.alert('Fehler', 'Vorlage konnte nicht gespeichert werden');
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
    
    return (
      <View key={pathKey} style={[styles.itemContainer, { marginLeft: depth * 20 }]}>
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
                size={18} 
                color="#666" 
              />
            </TouchableOpacity>
          )}
          
          <TextInput
            style={[
              styles.itemInput,
              !isMainItem && styles.subItemInput,
              hasSubItems && styles.itemInputWithCollapse,
            ]}
            placeholder={isMainItem ? `Hauptpunkt ${path[0] + 1}` : `Unterpunkt`}
            value={item.text}
            onChangeText={(text) => updateItemText(path, text)}
          />
          
          {/* Action Buttons */}
          <View style={styles.itemActions}>
            {/* Kopieren Button */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => copyItem(path)}
            >
              <Ionicons name="copy-outline" size={18} color="#ff9800" />
            </TouchableOpacity>
            
            {/* Einfügen Button (nur wenn etwas kopiert wurde) */}
            {copiedItem && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => pasteItemAfter(path)}
              >
                <Ionicons name="clipboard-outline" size={18} color="#4caf50" />
              </TouchableOpacity>
            )}
            
            {/* Löschen Button */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => removeItem(path)}
            >
              <Ionicons name="trash-outline" size={18} color="#f44336" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Unterpunkte rekursiv rendern (wenn nicht eingeklappt) */}
        {hasSubItems && !collapsed && (
          <View style={styles.subItemsSection}>
            {item.subItems.map((subItem, subIndex) => 
              renderItem(subItem, [...path, subIndex], depth + 1)
            )}
          </View>
        )}
        
        {/* Bild-Bereich */}
        <View style={styles.imageSection}>
          {/* Logo für Hauptpunkte (Kategorien) */}
          {isMainItem && (
            <View style={styles.imageRow}>
              <Text style={styles.imageLabel}>Firmenlogo:</Text>
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
          
          {/* Druckbild (wird im PDF gedruckt) */}
          <View style={styles.imageRow}>
            <Text style={styles.imageLabel}>Druckbild:</Text>
            {item.printImage ? (
              <View style={styles.imagePreviewContainer}>
                <TouchableOpacity onPress={() => openImagePreview([item.printImage!], item.text || 'Druckbild')}>
                  <Image source={{ uri: item.printImage }} style={styles.thumbnailPreview} />
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
          
          {/* Vorschau-Galerie (nur zur Beratung, nicht gedruckt) */}
          <View style={styles.imageRow}>
            <Text style={styles.imageLabel}>Vorschau:</Text>
            <View style={styles.previewImagesContainer}>
              {(item.previewImages || []).map((img, idx) => (
                <View key={idx} style={styles.imagePreviewContainer}>
                  <TouchableOpacity onPress={() => openImagePreview(item.previewImages || [], item.text || 'Vorschau', idx)}>
                    <Image source={{ uri: img }} style={styles.smallThumbnail} />
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
        </View>
        
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
        {!collapsed && (
          <TouchableOpacity
            style={[styles.addSubItemButton, { marginLeft: depth > 0 ? 24 : 0 }]}
            onPress={() => addSubItem(path)}
          >
            <Ionicons name="add" size={16} color="#1976d2" />
            <Text style={styles.addSubItemText}>
              {depth === 0 ? 'Unterpunkt hinzufügen' : 'Weiteren Unterpunkt'}
            </Text>
          </TouchableOpacity>
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
            <Text style={styles.label}>Vorlagen-Name</Text>
            <TextInput
              style={styles.input}
              placeholder="z.B. Dachinspektion"
              value={templateName}
              onChangeText={setTemplateName}
            />
          </View>

          <View style={styles.itemsSection}>
            <Text style={styles.sectionTitle}>Checklisten-Punkte</Text>
            <Text style={styles.sectionHint}>
              Erstellen Sie Hauptpunkte und fügen Sie beliebig viele Unterpunkte hinzu
            </Text>
            
            {items.map((item, index) => renderItem(item, [index], 0))}

            <TouchableOpacity style={styles.addItemButton} onPress={addItem}>
              <Ionicons name="add-circle" size={24} color="#1976d2" />
              <Text style={styles.addItemText}>Neuen Hauptpunkt hinzufügen</Text>
            </TouchableOpacity>
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
            {saving ? 'Wird gespeichert...' : 'Vorlage speichern'}
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
  actionButton: {
    padding: 6,
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
});

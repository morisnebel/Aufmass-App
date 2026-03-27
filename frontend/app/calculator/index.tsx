import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AreaCalculationService, AreaCalculation, LineCategoryService, LineCategory } from '../../services/LocalStorage';
import { useTranslation } from 'react-i18next';

export default function CalculatorListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [calculations, setCalculations] = useState<AreaCalculation[]>([]);
  const [lineCategories, setLineCategories] = useState<LineCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadCalculations();
      loadLineCategories();
    }, [])
  );

  const loadCalculations = async () => {
    try {
      const data = await AreaCalculationService.getAll();
      // Sortiere nach Datum (neueste zuerst)
      data.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      setCalculations(data);
    } catch (error) {
      console.error('Error loading calculations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLineCategories = async () => {
    const cats = await LineCategoryService.getAll();
    setLineCategories(cats);
  };

  // Format category with shortcut: "Traufe" -> "(TR) Traufe"
  const formatCat = (categoryName: string): string => {
    const cat = lineCategories.find(c => c.name === categoryName);
    return cat?.shortcut ? `(${cat.shortcut}) ${categoryName}` : categoryName;
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      await AreaCalculationService.delete(itemToDelete);
      setDeleteModalVisible(false);
      setItemToDelete(null);
      loadCalculations();
      
      if (Platform.OS === 'web') {
        alert('Berechnung wurde gelöscht');
      } else {
        Alert.alert(t('common.success'), 'Berechnung wurde gelöscht');
      }
    } catch (error) {
      console.error('Error deleting calculation:', error);
      if (Platform.OS === 'web') {
        alert('Fehler beim Löschen');
      } else {
        Alert.alert(t('common.error'), 'Berechnung konnte nicht gelöscht werden');
      }
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Flächen-Kalkulator</Text>
        <TouchableOpacity 
          onPress={() => router.push('/calculator/new')} 
          style={styles.addButton}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Info-Box */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={20} color="#1976d2" />
        <Text style={styles.infoText}>
          Berechnen Sie Flächen und Linien mit Polygonen. Ideal für Giebel, Dächer und Fassaden.
        </Text>
      </View>

      {/* Liste */}
      <ScrollView style={styles.listContainer} contentContainerStyle={styles.listContent}>
        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Laden...</Text>
          </View>
        ) : calculations.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calculator-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>Keine Berechnungen</Text>
            <Text style={styles.emptyText}>
              Tippen Sie auf + um eine neue Flächenberechnung zu erstellen
            </Text>
            <TouchableOpacity 
              style={styles.emptyButton}
              onPress={() => router.push('/calculator/new')}
            >
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.emptyButtonText}>Neue Berechnung</Text>
            </TouchableOpacity>
          </View>
        ) : (
          calculations.map((calc) => (
            <TouchableOpacity
              key={calc.id}
              style={styles.calculationCard}
              onPress={() => router.push(`/calculator/edit?id=${calc.id}`)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardIcon}>
                  <Ionicons name="shapes" size={24} color="#1976d2" />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle}>{calc.name}</Text>
                  <Text style={styles.cardDate}>{formatDate(calc.updated_at)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => {
                    setItemToDelete(calc.id);
                    setDeleteModalVisible(true);
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color="#f44336" />
                </TouchableOpacity>
              </View>
              
              {calc.results && (
                <View style={styles.cardResults}>
                  <View style={styles.resultItem}>
                    <Text style={styles.resultLabel}>Netto-Fläche</Text>
                    <Text style={styles.resultValue}>
                      {calc.results.netArea.toFixed(2).replace('.', ',')} m²
                    </Text>
                  </View>
                  {calc.results.deductionArea > 0 && (
                    <View style={styles.resultItem}>
                      <Text style={styles.resultLabel}>Abzüge</Text>
                      <Text style={styles.resultValueSmall}>
                        -{calc.results.deductionArea.toFixed(2).replace('.', ',')} m²
                      </Text>
                    </View>
                  )}
                  {Object.keys(calc.results.linesByCategory || {}).length > 0 && (
                    <View style={styles.resultItem}>
                      <Text style={styles.resultLabel}>Linien</Text>
                      <Text style={styles.resultValueSmall}>
                        {Object.entries(calc.results.linesByCategory)
                          .map(([cat, len]) => `${formatCat(cat)}: ${(len as number).toFixed(2).replace('.', ',')}m`)
                          .slice(0, 2)
                          .join(', ')}
                        {Object.keys(calc.results.linesByCategory).length > 2 && '...'}
                      </Text>
                    </View>
                  )}
                </View>
              )}
              
              <View style={styles.cardFooter}>
                <Text style={styles.cardPolygons}>
                  {calc.polygons?.filter(p => p.type === 'main').length || 0} Fläche(n), {' '}
                  {calc.polygons?.filter(p => p.type === 'deduction').length || 0} Abzug/Abzüge
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Delete Modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="warning" size={48} color="#f44336" />
            <Text style={styles.modalTitle}>Berechnung löschen?</Text>
            <Text style={styles.modalText}>
              Diese Aktion kann nicht rückgängig gemacht werden.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setItemToDelete(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteConfirmButton]}
                onPress={handleDelete}
              >
                <Text style={styles.deleteButtonText}>Löschen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976d2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  addButton: {
    padding: 8,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    margin: 16,
    marginBottom: 0,
    borderRadius: 8,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1565c0',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976d2',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 24,
    gap: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  calculationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e3f2fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  cardDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  deleteButton: {
    padding: 8,
  },
  cardResults: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 12,
  },
  resultItem: {
    minWidth: 100,
  },
  resultLabel: {
    fontSize: 11,
    color: '#666',
    textTransform: 'uppercase',
  },
  resultValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1976d2',
  },
  resultValueSmall: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  cardPolygons: {
    fontSize: 12,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '80%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  modalText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
  },
  deleteConfirmButton: {
    backgroundColor: '#f44336',
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

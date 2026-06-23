import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

interface DatePickerFieldProps {
  value?: string; // ISO YYYY-MM-DD
  onChange: (iso: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  accent?: string; // Akzentfarbe
}

const formatDe = (iso?: string): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return ''; }
};

const toIsoDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const DatePickerField: React.FC<DatePickerFieldProps> = ({
  value, onChange, placeholder = 'Datum wählen', minimumDate, maximumDate, accent = '#1976d2',
}) => {
  const [show, setShow] = useState(false);
  // iOS: zeigt Picker im Modal mit "Fertig"; Android: native dialog
  const [tempDate, setTempDate] = useState<Date | null>(null);

  const initialDate = (() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  })();

  const handleAndroidChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShow(false);
    if (event.type === 'set' && selectedDate) {
      onChange(toIsoDate(selectedDate));
    }
  };

  const handleIosChange = (_: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) setTempDate(selectedDate);
  };

  const openPicker = () => {
    setTempDate(initialDate);
    setShow(true);
  };

  const confirmIos = () => {
    if (tempDate) onChange(toIsoDate(tempDate));
    setShow(false);
  };

  const cancelIos = () => setShow(false);

  const clear = () => {
    onChange('');
  };

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={openPicker} activeOpacity={0.7}>
        <Ionicons name="calendar-outline" size={16} color={accent} />
        <Text style={[styles.text, !value && styles.placeholder]}>
          {value ? formatDe(value) : placeholder}
        </Text>
        {value ? (
          <TouchableOpacity onPress={clear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-down" size={16} color="#94a3b8" />
        )}
      </TouchableOpacity>

      {/* Android: zeigt Native-Dialog inline */}
      {show && Platform.OS === 'android' && (
        <DateTimePicker
          value={initialDate}
          mode="date"
          display="default"
          onChange={handleAndroidChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}

      {/* iOS: Modal mit Spinner + Fertig-Button */}
      {Platform.OS === 'ios' && show && (
        <Modal transparent animationType="fade" onRequestClose={cancelIos}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={cancelIos}>
                  <Text style={styles.modalCancel}>Abbrechen</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Datum wählen</Text>
                <TouchableOpacity onPress={confirmIos}>
                  <Text style={[styles.modalDone, { color: accent }]}>Fertig</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate || initialDate}
                mode="date"
                display="spinner"
                onChange={handleIosChange}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                locale="de-DE"
                themeVariant="light"
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Web: nutzt input fallback (DateTimePicker zeigt nichts auf Web) */}
      {Platform.OS === 'web' && show && (
        <Modal transparent animationType="fade" onRequestClose={cancelIos}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={cancelIos}>
                  <Text style={styles.modalCancel}>Abbrechen</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Datum wählen</Text>
                <View style={{ width: 60 }} />
              </View>
              <View style={{ padding: 20, alignItems: 'center' }}>
                {/* @ts-ignore - input für Web */}
                <input
                  type="date"
                  value={tempDate ? toIsoDate(tempDate) : (value || toIsoDate(initialDate))}
                  onChange={(e: any) => {
                    const v = e.target.value;
                    if (v) {
                      onChange(v);
                      setShow(false);
                    }
                  }}
                  style={{
                    fontSize: 16,
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#fff',
                  }}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 11,
  },
  text: { flex: 1, fontSize: 14, color: '#0f172a' },
  placeholder: { color: '#94a3b8' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingBottom: 30 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  modalCancel: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  modalDone: { fontSize: 14, fontWeight: '700' },
});

export default DatePickerField;

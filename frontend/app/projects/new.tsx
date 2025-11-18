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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface Customer {
  id: string;
  name: string;
}

export default function NewProjectScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/customers`);
      setCustomers(response.data);
      if (response.data.length > 0) {
        setCustomerId(response.data[0].id);
      }
    } catch (error) {
      console.error('Error loading customers:', error);
      Alert.alert('Fehler', 'Kunden konnten nicht geladen werden');
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Projektnamen ein');
      return;
    }

    if (!customerId) {
      Alert.alert('Fehler', 'Bitte wählen Sie einen Kunden aus');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/projects`, {
        name,
        description: description || undefined,
        customer_id: customerId,
        status: 'active',
      });
      Alert.alert('Erfolg', 'Projekt wurde erstellt', [
        { text: 'OK', onPress: () => router.replace(`/projects/${response.data.id}`) },
      ]);
    } catch (error) {
      console.error('Error creating project:', error);
      Alert.alert('Fehler', 'Projekt konnte nicht erstellt werden');
    } finally {
      setLoading(false);
    }
  };

  if (loadingCustomers) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
      </View>
    );
  }

  if (customers.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>Keine Kunden vorhanden</Text>
        <Text style={styles.emptySubtext}>Erstellen Sie zuerst einen Kunden</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/customers/new')}
        >
          <Text style={styles.buttonText}>Neuer Kunde</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView}>
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Projektname *</Text>
            <TextInput
              style={styles.input}
              placeholder="z.B. Dachsanierung Hauptstraße"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Kunde *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={customerId}
                onValueChange={setCustomerId}
                style={styles.picker}
              >
                {customers.map((customer) => (
                  <Picker.Item
                    key={customer.id}
                    label={customer.name}
                    value={customer.id}
                  />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Beschreibung</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Projektbeschreibung..."
              value={description}
              onChangeText={setDescription}
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
              {loading ? 'Wird gespeichert...' : 'Projekt erstellen'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  form: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
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
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
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
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginBottom: 24,
  },
});

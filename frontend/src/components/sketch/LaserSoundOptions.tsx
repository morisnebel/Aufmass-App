import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {
  LASER_TONE_COUNT, getLaserSoundSettings, loadLaserSoundSettings, playLaserFeedback, setLaserTone, setLaserVolume,
} from '../../utils/laserFeedback';

// Auswahl des Bestätigungstons (1–3) und der Lautstärke; jede Änderung spielt den Ton zur Probe ab
export const LaserSoundOptions = () => {
  const [settings, setSettings] = useState(getLaserSoundSettings());

  useEffect(() => {
    loadLaserSoundSettings().then(setSettings);
  }, []);

  const pickTone = (tone: number) => {
    setLaserTone(tone);
    setSettings(getLaserSoundSettings());
    playLaserFeedback();
  };
  const changeVolume = (delta: number) => {
    setLaserVolume(settings.volume + delta);
    setSettings(getLaserSoundSettings());
    playLaserFeedback();
  };

  return (
    <View style={styles.row}>
      {Array.from({ length: LASER_TONE_COUNT }, (_, tone) => (
        <TouchableOpacity
          key={tone}
          testID={`laser-tone-${tone + 1}`}
          accessibilityLabel={`Ton ${tone + 1}`}
          style={[styles.button, settings.tone === tone && styles.buttonActive]}
          onPress={() => pickTone(tone)}
        >
          <Ionicons name="musical-note" size={12} color={settings.tone === tone ? '#fff' : '#666'} />
          <Text style={[styles.buttonText, settings.tone === tone && styles.buttonTextActive]}>{tone + 1}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity testID="laser-volume-down" accessibilityLabel="Leiser" style={styles.button} disabled={settings.volume <= 25} onPress={() => changeVolume(-25)}>
        <Ionicons name="volume-low" size={16} color={settings.volume <= 25 ? '#ccc' : '#666'} />
      </TouchableOpacity>
      <Text testID="laser-volume-value" style={styles.volume}>{settings.volume}%</Text>
      <TouchableOpacity testID="laser-volume-up" accessibilityLabel="Lauter" style={styles.button} disabled={settings.volume >= 100} onPress={() => changeVolume(25)}>
        <Ionicons name="volume-high" size={16} color={settings.volume >= 100 ? '#ccc' : '#666'} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2,
    minWidth: 40, minHeight: 40, paddingHorizontal: 8,
    borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#f5f5f5',
  },
  buttonActive: { backgroundColor: '#1976d2', borderColor: '#1976d2' },
  buttonText: { fontSize: 12, fontWeight: '700', color: '#666' },
  buttonTextActive: { color: '#fff' },
  volume: { fontSize: 12, fontWeight: '700', color: '#666', minWidth: 38, textAlign: 'center' },
});

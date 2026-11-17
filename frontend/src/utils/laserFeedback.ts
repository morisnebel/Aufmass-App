import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

// Kurzer Bestätigungston + Vibration, wenn ein Laser-Messwert angekommen ist.
// (iPads haben keinen Vibrationsmotor – dort ist nur der Ton hörbar.)
const TONES = [
  require('../../assets/sounds/laser-ok.wav'),
  require('../../assets/sounds/laser-ok-2.wav'),
  require('../../assets/sounds/laser-ok-3.wav'),
];
export const LASER_TONE_COUNT = TONES.length;

const TONE_KEY = 'aufmassprofi_laser_tone';
const VOLUME_KEY = 'aufmassprofi_laser_volume';

const players: (AudioPlayer | null)[] = TONES.map(() => null);
let audioModeSet = false;
let tone = 0;
let volume = 100; // Prozent, in 25er-Schritten

export const getLaserSoundSettings = () => ({ tone, volume });

export const loadLaserSoundSettings = async () => {
  const [savedTone, savedVolume] = await Promise.all([AsyncStorage.getItem(TONE_KEY), AsyncStorage.getItem(VOLUME_KEY)]);
  if (savedTone !== null) tone = Math.min(TONES.length - 1, Math.max(0, parseInt(savedTone, 10) || 0));
  if (savedVolume !== null) volume = Math.min(100, Math.max(25, parseInt(savedVolume, 10) || 100));
  return getLaserSoundSettings();
};

export const setLaserTone = (next: number) => {
  tone = Math.min(TONES.length - 1, Math.max(0, next));
  AsyncStorage.setItem(TONE_KEY, String(tone));
};

export const setLaserVolume = (next: number) => {
  volume = Math.min(100, Math.max(25, next));
  AsyncStorage.setItem(VOLUME_KEY, String(volume));
};

export const playLaserFeedback = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  try {
    if (!audioModeSet) {
      audioModeSet = true;
      // Auch im Stumm-Modus hörbar, ohne laufende Musik zu unterbrechen
      setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
    }
    const player = players[tone] ?? (players[tone] = createAudioPlayer(TONES[tone]));
    player.volume = volume / 100;
    player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // Ton ist nur eine Zusatz-Rückmeldung
  }
};

loadLaserSoundSettings().catch(() => {});

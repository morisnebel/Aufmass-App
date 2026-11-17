import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

// Kurzer Bestätigungston + Vibration, wenn ein Laser-Messwert angekommen ist.
// (iPads haben keinen Vibrationsmotor – dort ist nur der Ton hörbar.)
let player: AudioPlayer | null = null;

export const playLaserFeedback = () => {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  try {
    if (!player) {
      // Auch im Stumm-Modus hörbar, ohne laufende Musik zu unterbrechen
      setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
      player = createAudioPlayer(require('../../assets/sounds/laser-ok.wav'));
    }
    player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // Ton ist nur eine Zusatz-Rückmeldung
  }
};

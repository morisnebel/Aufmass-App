import React, { useEffect, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Keyboard,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface KeyboardDismissButtonProps {
  bottomOffset?: number;
}

export const KeyboardDismissButton: React.FC<KeyboardDismissButtonProps> = ({ 
  bottomOffset = 10 
}) => {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const opacity = useState(new Animated.Value(0))[0];

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        setKeyboardVisible(true);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    );

    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }).start(() => {
          setKeyboardVisible(false);
          setKeyboardHeight(0);
        });
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  if (!keyboardVisible) return null;

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          bottom: keyboardHeight + bottomOffset,
          opacity 
        }
      ]}
    >
      <TouchableOpacity
        style={styles.button}
        onPress={() => Keyboard.dismiss()}
        activeOpacity={0.8}
      >
        <Ionicons name="chevron-down" size={20} color="#fff" />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    zIndex: 9999,
  },
  button: {
    backgroundColor: '#1976d2',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});

export default KeyboardDismissButton;

import React from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import Svg, { Line, Polygon } from 'react-native-svg';


export type LineTypePickerModalProps = {
  showLineTypePicker: boolean;
  setShowLineTypePicker: React.Dispatch<React.SetStateAction<boolean>>;
  lineArrowType: "none" | "end" | "both";
  setLineArrowType: React.Dispatch<React.SetStateAction<"none" | "end" | "both">>;
};

export function LineTypePickerModal(props: LineTypePickerModalProps) {
  const {
    showLineTypePicker, setShowLineTypePicker, lineArrowType, setLineArrowType,
  } = props;
  return (
    <>
      {/* Linientyp-Auswahl Modal (Linie / Pfeil / Doppelpfeil) */}
      <Modal visible={showLineTypePicker} transparent animationType="fade">
        <Pressable 
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.3)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setShowLineTypePicker(false)}
        >
          <View style={{
            backgroundColor: '#fff',
            borderRadius: 14,
            padding: 12,
            minWidth: 200,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 10,
          }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333', textAlign: 'center', marginBottom: 10 }}>Linientyp wählen</Text>
            
            {/* Normale Linie */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: lineArrowType === 'none' ? '#1976d2' : '#f5f5f5',
                marginBottom: 6,
              }}
              onPress={() => {
                setLineArrowType('none');
                setShowLineTypePicker(false);
              }}
            >
              <Ionicons name="remove" size={22} color={lineArrowType === 'none' ? '#fff' : '#333'} />
              <Text style={{ marginLeft: 12, fontSize: 16, fontWeight: '600', color: lineArrowType === 'none' ? '#fff' : '#333' }}>Linie</Text>
            </TouchableOpacity>
            
            {/* Einfacher Pfeil → */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: lineArrowType === 'end' ? '#1976d2' : '#f5f5f5',
                marginBottom: 6,
              }}
              onPress={() => {
                setLineArrowType('end');
                setShowLineTypePicker(false);
              }}
            >
              <Svg width={22} height={18} viewBox="0 0 24 18">
                <Line x1="2" y1="9" x2="17" y2="9" stroke={lineArrowType === 'end' ? '#fff' : '#333'} strokeWidth={2.5} />
                <Polygon points="22,9 16,4 16,14" fill={lineArrowType === 'end' ? '#fff' : '#333'} />
              </Svg>
              <Text style={{ marginLeft: 12, fontSize: 16, fontWeight: '600', color: lineArrowType === 'end' ? '#fff' : '#333' }}>Pfeil</Text>
            </TouchableOpacity>
            
            {/* Doppelpfeil ↔ */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: lineArrowType === 'both' ? '#1976d2' : '#f5f5f5',
              }}
              onPress={() => {
                setLineArrowType('both');
                setShowLineTypePicker(false);
              }}
            >
              <Svg width={22} height={18} viewBox="0 0 24 18">
                <Polygon points="2,9 8,4 8,14" fill={lineArrowType === 'both' ? '#fff' : '#333'} />
                <Line x1="6" y1="9" x2="18" y2="9" stroke={lineArrowType === 'both' ? '#fff' : '#333'} strokeWidth={2.5} />
                <Polygon points="22,9 16,4 16,14" fill={lineArrowType === 'both' ? '#fff' : '#333'} />
              </Svg>
              <Text style={{ marginLeft: 12, fontSize: 16, fontWeight: '600', color: lineArrowType === 'both' ? '#fff' : '#333' }}>Doppelpfeil</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

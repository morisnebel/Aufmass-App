// PDF-Vorschau-Modal (ausgelagert aus app/projects/[id].tsx)
// Enthält: Druck-/Teilen-Aktionen, Toggles (Berechnungsdetails, Deckblatt),
// Deckblatt-Untertitel, Vorlagen-Auswahl mit Mini-Vorschau und Titelbild-Auswahl.
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import { WebView } from 'react-native-webview';
import { CoverStyle, COVER_STYLE_OPTIONS } from '../../../services/CoverPageTemplates';
import { PDF_COLOR_OPTIONS } from '../../../services/ProjectPdfService';
import { createPdfFile } from '../../../services/PdfExport';
import { styles } from '../../styles/projectDetailStyles';

const ACCENT = '#1976d2';

// Auswahl für die Deckblatt-Akzentfarbe (kräftige Töne aus der PDF-Palette)
const COVER_ACCENT_CHOICES = ['blue', 'green', 'orange', 'red', 'gray', 'black'] as const;

// Mini-Vorschau (schematisch) für die drei Deckblatt-Vorlagen
function StyleThumb({ style }: { style: CoverStyle }) {
  const page = {
    width: 40,
    height: 54,
    backgroundColor: '#fff',
    borderRadius: 3,
    padding: 4,
    overflow: 'hidden' as const,
  };
  const img = { backgroundColor: '#d6e7f7', borderRadius: 2, height: 14, marginTop: 4 };
  const line = (w: number, h = 2, color = '#c5c5c5', extra = {}) => (
    <View style={{ width: w, height: h, backgroundColor: color, borderRadius: 1, ...extra }} />
  );
  if (style === 'modern') {
    return (
      <View style={page}>
        <View style={{ backgroundColor: ACCENT, borderRadius: 2, height: 12, padding: 2, justifyContent: 'center' }}>
          {line(18, 2, 'rgba(255,255,255,0.9)')}
        </View>
        <View style={{ marginTop: 3 }}>{line(22, 2, '#dcdcdc')}</View>
        <View style={img} />
        <View style={{ flexDirection: 'row', gap: 2, marginTop: 'auto' }}>
          <View style={{ flex: 1, height: 8, backgroundColor: '#eef2f6', borderLeftWidth: 2, borderLeftColor: ACCENT, borderRadius: 1 }} />
          <View style={{ flex: 1, height: 8, backgroundColor: '#eef2f6', borderLeftWidth: 2, borderLeftColor: ACCENT, borderRadius: 1 }} />
        </View>
      </View>
    );
  }
  if (style === 'minimal') {
    return (
      <View style={page}>
        <View style={{ borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 2, flexDirection: 'row', justifyContent: 'space-between' }}>
          {line(8, 2, '#999')}
          {line(8, 2, '#ddd')}
        </View>
        <View style={{ marginTop: 7, gap: 2 }}>
          {line(12, 2, '#bbb')}
          {line(22, 3, '#444')}
          {line(10, 2, '#222')}
        </View>
        <View style={[img, { backgroundColor: '#ececec' }]} />
        <View style={{ marginTop: 'auto', borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 2 }}>
          {line(16, 2, '#ddd')}
        </View>
      </View>
    );
  }
  // classic
  return (
    <View style={page}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {line(8, 4, '#999')}
        {line(10, 2, '#ddd')}
      </View>
      <View style={{ alignItems: 'center', marginTop: 5, gap: 2 }}>
        {line(14, 2, '#bbb')}
        {line(24, 3, '#444')}
        {line(10, 2, ACCENT)}
      </View>
      <View style={img} />
      <View style={{ marginTop: 'auto', borderTopWidth: 2, borderTopColor: ACCENT, paddingTop: 2, flexDirection: 'row', justifyContent: 'space-between' }}>
        {line(10, 2, '#ccc')}
        {line(8, 2, '#ccc')}
      </View>
    </View>
  );
}

interface PdfPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  pdfHtmlContent: string;
  viewShotRef: React.RefObject<ViewShot | null>;
  photos: { id: string; image_data: string }[];
  areaCalculationsCount: number;
  showCalcDetailsPage: boolean;
  onToggleCalcDetails: () => void;
  includeCoverPage: boolean;
  onToggleCoverPage: () => void;
  coverSubtitle: string;
  onChangeCoverSubtitle: (txt: string) => void;
  coverStyle: CoverStyle;
  onChangeCoverStyle: (s: CoverStyle) => void;
  coverPhotoId: string | null;
  onSelectCoverPhoto: (id: string) => void;
  coverAccent: string | null;
  onChangeCoverAccent: (accentId: string | null) => void;
  isSharingImage: boolean;
  onShareAsImage: () => void;
}

export default function PdfPreviewModal(props: PdfPreviewModalProps) {
  const { t } = useTranslation();
  const {
    visible, onClose, pdfHtmlContent, viewShotRef, photos,
    areaCalculationsCount, showCalcDetailsPage, onToggleCalcDetails,
    includeCoverPage, onToggleCoverPage,
    coverSubtitle, onChangeCoverSubtitle,
    coverStyle, onChangeCoverStyle,
    coverPhotoId, onSelectCoverPhoto,
    coverAccent, onChangeCoverAccent,
    isSharingImage, onShareAsImage,
  } = props;

  const handlePrint = async () => {
    try {
      const uri = await createPdfFile(pdfHtmlContent);
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      console.error('Print error:', error);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.pdfPreviewContainer}>
        <View style={styles.pdfPreviewHeader}>
          <TouchableOpacity style={styles.pdfPreviewCloseButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.pdfPreviewTitle}>{t('projects.pdfPreview')}</Text>
          <TouchableOpacity
            style={{
              backgroundColor: ACCENT,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 16,
              flexDirection: 'row',
              alignItems: 'center',
            }}
            onPress={handlePrint}
          >
            <Ionicons name="print" size={18} color="#fff" />
            <Text style={{ color: '#fff', marginLeft: 6, fontWeight: '600', fontSize: 13 }}>{t('projects.print')}</Text>
          </TouchableOpacity>
        </View>

        {/* Toggle for detailed calculation pages */}
        {areaCalculationsCount > 0 && (
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 8,
              paddingHorizontal: 16,
              backgroundColor: showCalcDetailsPage ? '#4CAF50' : '#e0e0e0',
              marginHorizontal: 16,
              marginVertical: 8,
              borderRadius: 20,
            }}
            onPress={onToggleCalcDetails}
          >
            <Ionicons
              name={showCalcDetailsPage ? 'checkbox' : 'square-outline'}
              size={20}
              color={showCalcDetailsPage ? '#fff' : '#666'}
            />
            <Text style={{ marginLeft: 8, color: showCalcDetailsPage ? '#fff' : '#666', fontWeight: '600', fontSize: 14 }}>
              Berechnungsdetails drucken
            </Text>
          </TouchableOpacity>
        )}

        {/* Toggle Deckblatt */}
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 8,
            paddingHorizontal: 16,
            backgroundColor: includeCoverPage ? ACCENT : '#e0e0e0',
            marginHorizontal: 16,
            marginBottom: 8,
            borderRadius: 20,
          }}
          onPress={onToggleCoverPage}
          testID="toggle-cover-page"
        >
          <Ionicons
            name={includeCoverPage ? 'checkbox' : 'square-outline'}
            size={20}
            color={includeCoverPage ? '#fff' : '#666'}
          />
          <Text style={{ marginLeft: 8, color: includeCoverPage ? '#fff' : '#666', fontWeight: '600', fontSize: 14 }}>
            Deckblatt mit Titelbild
          </Text>
        </TouchableOpacity>

        {/* Untertitel + Vorlagen-Stil für das Deckblatt */}
        {includeCoverPage && (
          <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
            <TextInput
              value={coverSubtitle}
              onChangeText={onChangeCoverSubtitle}
              placeholder='Untertitel (optional), z.B. "Angebot" oder "Schlussaufmass"'
              placeholderTextColor="#999"
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#ddd',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: 14,
                color: '#333',
              }}
              testID="cover-subtitle-input"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {COVER_STYLE_OPTIONS.map(opt => {
                const selected = coverStyle === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => onChangeCoverStyle(opt.key)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 12,
                      alignItems: 'center',
                      borderWidth: 2,
                      borderColor: selected ? ACCENT : '#ddd',
                      backgroundColor: selected ? '#e8f1fb' : '#f5f5f5',
                    }}
                    testID={`cover-style-${opt.key}`}
                  >
                    <StyleThumb style={opt.key} />
                    <Text style={{ fontSize: 12, fontWeight: '600', marginTop: 5, color: selected ? ACCENT : '#666' }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Akzentfarbe für das Deckblatt */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <Text style={{ fontSize: 12, color: '#666', fontWeight: '600', marginRight: 2 }}>Farbe:</Text>
              <TouchableOpacity
                onPress={() => onChangeCoverAccent(null)}
                style={{
                  paddingHorizontal: 10,
                  height: 28,
                  borderRadius: 14,
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: coverAccent === null ? ACCENT : '#ddd',
                  backgroundColor: coverAccent === null ? '#e8f1fb' : '#f5f5f5',
                }}
                testID="cover-accent-auto"
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: coverAccent === null ? ACCENT : '#666' }}>Auto</Text>
              </TouchableOpacity>
              {COVER_ACCENT_CHOICES.map(key => {
                const selected = coverAccent === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => onChangeCoverAccent(key)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: PDF_COLOR_OPTIONS[key].color,
                      borderWidth: 2,
                      borderColor: selected ? '#333' : '#fff',
                      alignItems: 'center',
                      justifyContent: 'center',
                      elevation: 1,
                    }}
                    testID={`cover-accent-${key}`}
                  >
                    {selected && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Titelbild-Auswahl für das Deckblatt */}
        {includeCoverPage && photos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ maxHeight: 64, marginBottom: 8 }}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
          >
            <TouchableOpacity
              onPress={() => onSelectCoverPhoto('none')}
              style={{
                width: 54, height: 54, borderRadius: 8, borderWidth: 2,
                borderColor: coverPhotoId === 'none' ? ACCENT : '#ddd',
                alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5',
              }}
            >
              <Ionicons name="image-outline" size={20} color="#999" />
              <Text style={{ fontSize: 8, color: '#999' }}>Ohne</Text>
            </TouchableOpacity>
            {photos.map((photo, idx) => {
              const isSelected = coverPhotoId === photo.id || (coverPhotoId === null && idx === 0);
              return (
                <TouchableOpacity
                  key={photo.id}
                  onPress={() => onSelectCoverPhoto(photo.id)}
                  style={{
                    borderWidth: 2,
                    borderColor: isSelected ? ACCENT : '#ddd',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <Image source={{ uri: photo.image_data }} style={{ width: 50, height: 50 }} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <ViewShot ref={viewShotRef} style={styles.pdfPreviewContent} options={{ format: 'jpg', quality: 0.9 }}>
          {pdfHtmlContent ? (
            <WebView
              source={{ html: pdfHtmlContent }}
              style={styles.pdfWebView}
              scalesPageToFit={true}
              showsVerticalScrollIndicator={true}
            />
          ) : (
            <View style={styles.pdfPreviewLoading}>
              <ActivityIndicator size="large" color={ACCENT} />
              <Text style={styles.pdfPreviewLoadingText}>Vorschau wird geladen...</Text>
            </View>
          )}
        </ViewShot>

        <View style={styles.pdfPreviewActions}>
          <TouchableOpacity
            style={[styles.pdfPreviewActionButton, styles.pdfPreviewImageButton, { flex: 1 }]}
            onPress={onShareAsImage}
            disabled={isSharingImage}
          >
            {isSharingImage ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="image-outline" size={22} color="#fff" />
                <Text style={styles.pdfPreviewActionText}>{t('projects.shareAsImage')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

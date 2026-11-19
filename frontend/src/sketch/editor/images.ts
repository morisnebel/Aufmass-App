import type { TFunction } from 'i18next';
import React from 'react';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import PdfThumbnail from '../../../utils/PdfThumbnailShim';
import { DrawElement, DrawMode } from '../sketchShared';


export type FitImageToCanvasImplCtx = {
  screenWidth: number;
  canvasHeight: number;
};

export function fitImageToCanvasImpl(ctx: FitImageToCanvasImplCtx, imgW: number, imgH: number, maxW = 400, maxH = 300) {
  const {
    screenWidth, canvasHeight,
  } = ctx;
  const margin = 20;
  const boundW = Math.max(50, Math.min(maxW, screenWidth - margin * 2));
  const boundH = Math.max(50, Math.min(maxH, canvasHeight - margin * 2));
  const ratio = imgW > 0 && imgH > 0 ? imgW / imgH : 4 / 3;
  let w = boundW;
  let h = boundW / ratio;
  if (h > boundH) { h = boundH; w = boundH * ratio; }
  const x = Math.max(margin, Math.min(50, screenWidth - w - margin));
  const y = Math.max(margin, Math.min(50, canvasHeight - h - margin));
  return { width: w, height: h, x, y };
}



export type InsertProjectPhotoImplCtx = {
  t: TFunction<"translation", undefined>;
  getImageSize: (uri: string) => Promise<{ width: number; height: number; }>;
  fitImageToCanvas: (imgW: number, imgH: number, maxW?: number, maxH?: number) => { width: number; height: number; x: number; y: number; };
  generateId: () => string;
  elements: DrawElement[];
  addToHistory: (newElements: DrawElement[]) => void;
  setElements: React.Dispatch<React.SetStateAction<DrawElement[]>>;
  setSelectedElementId: React.Dispatch<React.SetStateAction<string | null>>;
  setShowProjectPhotosModal: React.Dispatch<React.SetStateAction<boolean>>;
  setPhotoEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  selectDrawMode: (mode: DrawMode) => void;
};

export function insertProjectPhotoImpl(ctx: InsertProjectPhotoImplCtx, photo: any) {
  const {
    t, getImageSize, fitImageToCanvas, generateId, elements, addToHistory,
    setElements, setSelectedElementId, setShowProjectPhotosModal, setPhotoEditMode, selectDrawMode,
  } = ctx;
  const imageUri = photo.image_data || photo.uri;
  if (!imageUri) {
    Alert.alert(t('common.error'), t('sketches.invalidImageData'));
    return;
  }
  
  // Berechne korrektes Seitenverhältnis des Bildes
  getImageSize(imageUri).then(
    ({ width: imgWidth, height: imgHeight }) => {
      const fit = fitImageToCanvas(imgWidth, imgHeight);
      const imageElement: DrawElement = {
        id: generateId(),
        type: 'image',
        data: { uri: imageUri },
        color: '#000000',
        strokeWidth: 0,
        x: fit.x,
        y: fit.y,
        width: fit.width,
        height: fit.height,
        rotation: 0,
      };
      
      const newElements = [...elements, imageElement];
      addToHistory(newElements);
      setElements(newElements);
      setSelectedElementId(imageElement.id);
      setShowProjectPhotosModal(false);
      // Automatisch Foto-Bearbeiten Modus aktivieren
      setPhotoEditMode(true);
      selectDrawMode('select');
    },
    (error) => {
      console.error('Error getting image size:', error);
      // Fallback: Füge mit Standardgrößen ein
      const imageElement: DrawElement = {
        id: generateId(),
        type: 'image',
        data: { uri: imageUri },
        color: '#000000',
        strokeWidth: 0,
        ...fitImageToCanvas(3, 2),
        rotation: 0,
      };
      
      const newElements = [...elements, imageElement];
      addToHistory(newElements);
      setElements(newElements);
      setSelectedElementId(imageElement.id);
      setShowProjectPhotosModal(false);
      setPhotoEditMode(true);
      selectDrawMode('select');
    }
  );
}



export type ApplyCropImplCtx = {
  cropImageUri: string | null;
  cropImageId: string | null;
  cropImageDimensions: { width: number; height: number; };
  cropBox: { x: number; y: number; width: number; height: number; };
  elements: DrawElement[];
  addToHistory: (newElements: DrawElement[]) => void;
  setShowCropModal: React.Dispatch<React.SetStateAction<boolean>>;
  setCropImageUri: React.Dispatch<React.SetStateAction<string | null>>;
  setCropImageId: React.Dispatch<React.SetStateAction<string | null>>;
  setDrawMode: React.Dispatch<React.SetStateAction<DrawMode>>;
  t: TFunction<"translation", undefined>;
};

export async function applyCropImpl(ctx: ApplyCropImplCtx) {
  const {
    cropImageUri, cropImageId, cropImageDimensions, cropBox, elements, addToHistory,
    setShowCropModal, setCropImageUri, setCropImageId, setDrawMode, t,
  } = ctx;
  if (!cropImageUri || !cropImageId) return;
  
  try {
    // Berechne die tatsächliche Bildgröße im Container mit resizeMode="contain"
    const containerSize = 300;
    const imgWidth = cropImageDimensions.width;
    const imgHeight = cropImageDimensions.height;
    const imgAspect = imgWidth / imgHeight;
    const containerAspect = 1; // Container ist quadratisch (300x300)
    
    let displayedWidth: number, displayedHeight: number, offsetX: number, offsetY: number;
    
    if (imgAspect > containerAspect) {
      // Bild ist breiter als Container (Querformat) - volle Breite, zentriert vertikal
      displayedWidth = containerSize;
      displayedHeight = containerSize / imgAspect;
      offsetX = 0;
      offsetY = (containerSize - displayedHeight) / 2;
    } else {
      // Bild ist höher als Container (Hochformat) - volle Höhe, zentriert horizontal
      displayedHeight = containerSize;
      displayedWidth = containerSize * imgAspect;
      offsetX = (containerSize - displayedWidth) / 2;
      offsetY = 0;
    }
    
    // Skalierungsfaktor vom angezeigten Bild zum Originalbild (sollte für beide Achsen gleich sein bei contain)
    const scale = imgWidth / displayedWidth;
    
    // Crop-Box Koordinaten relativ zum angezeigten Bild (nicht zum Container!)
    // Begrenze auf den tatsächlichen Bildbereich
    const cropBoxRelativeX = Math.max(0, cropBox.x - offsetX);
    const cropBoxRelativeY = Math.max(0, cropBox.y - offsetY);
    const cropBoxRelativeWidth = Math.min(cropBox.width, displayedWidth - cropBoxRelativeX);
    const cropBoxRelativeHeight = Math.min(cropBox.height, displayedHeight - cropBoxRelativeY);
    
    // Umrechnung auf Original-Bildkoordinaten
    const cropOriginX = Math.max(0, Math.round(cropBoxRelativeX * scale));
    const cropOriginY = Math.max(0, Math.round(cropBoxRelativeY * scale));
    const cropWidth = Math.round(cropBoxRelativeWidth * scale);
    const cropHeight = Math.round(cropBoxRelativeHeight * scale);
    
    // Verwende ImageManipulator zum Zuschneiden
    const result = await ImageManipulator.manipulateAsync(
      cropImageUri,
      [
        {
          crop: {
            originX: cropOriginX,
            originY: cropOriginY,
            width: Math.min(cropWidth, cropImageDimensions.width - cropOriginX),
            height: Math.min(cropHeight, cropImageDimensions.height - cropOriginY),
          },
        },
      ],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    
    // Aktualisiere das Element mit dem zugeschnittenen Bild
    const croppedUri = `data:image/jpeg;base64,${result.base64}`;
    const newElements = elements.map(el => {
      if (el.id === cropImageId) {
        return {
          ...el,
          data: { uri: croppedUri },
          // Behalte Position und Größe bei
        };
      }
      return el;
    });
    
    addToHistory(newElements);
    setShowCropModal(false);
    setCropImageUri(null);
    setCropImageId(null);
    // Modus zurücksetzen nach erfolgreichem Zuschneiden
    setDrawMode('select');
  } catch (error) {
    console.error('Error cropping image:', error);
    Alert.alert(t('common.error'), t('sketches.cropError'));
  }
}



export type InsertImageImplCtx = {
  fitImageToCanvas: (imgW: number, imgH: number, maxW?: number, maxH?: number) => { width: number; height: number; x: number; y: number; };
  generateId: () => string;
  elements: DrawElement[];
  addToHistory: (newElements: DrawElement[]) => void;
  setSelectedElementId: React.Dispatch<React.SetStateAction<string | null>>;
  setPhotoEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  selectDrawMode: (mode: DrawMode) => void;
  showAlert: (title: string, message: string) => void;
  t: TFunction<"translation", undefined>;
};

export async function insertImageImpl(ctx: InsertImageImplCtx) {
  const {
    fitImageToCanvas, generateId, elements, addToHistory, setSelectedElementId, setPhotoEditMode,
    selectDrawMode, showAlert, t,
  } = ctx;
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      
      // Bild auf max. 1200px Breite reduzieren (verhindert OOM auf iPad)
      const manipResult = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: Math.min(asset.width || 1600, 1600) } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      
      if (!manipResult.base64) {
        throw new Error('Could not generate base64');
      }
      
      const base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
      
      // Berechne korrektes Seitenverhältnis des Bildes
      const imgWidth = manipResult.width || 200;
      const imgHeight = manipResult.height || 200;
      const fit = fitImageToCanvas(imgWidth, imgHeight);
      const newElement: DrawElement = {
        id: generateId(),
        type: 'image',
        data: { uri: base64Image },
        color: '#000000',
        strokeWidth: 0,
        x: fit.x,
        y: fit.y,
        width: fit.width,
        height: fit.height,
        rotation: 0,
      };
      const newElements = [...elements, newElement];
      addToHistory(newElements);
      // Automatisch Foto-Bearbeiten Modus aktivieren
      setSelectedElementId(newElement.id);
      setPhotoEditMode(true);
      selectDrawMode('select');
    }
  } catch (error) {
    console.error('Error inserting image:', error);
    showAlert(t('common.error'), t('sketches.imageInsertError'));
  }
}



export type ImportFromFilesImplCtx = {
  insertImageFromUri: (uri: string) => Promise<void>;
  t: TFunction<"translation", undefined>;
  showAlert: (title: string, message: string) => void;
};

export async function importFromFilesImpl(ctx: ImportFromFilesImplCtx) {
  const {
    insertImageFromUri, t, showAlert,
  } = ctx;
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return;
    }

    const file = result.assets[0];
    const fileUri = file.uri;
    const mimeType = file.mimeType || '';
    
    console.log('[importFromFiles] Selected file:', file.name, mimeType);

    // Wenn es ein PDF ist, konvertiere es zu einem Bild
    if (mimeType === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
      try {
        console.log('[importFromFiles] Converting PDF to image...');
        // Prüfe ob PdfThumbnail verfügbar ist (natives Modul - nur in Development Build)
        if (!PdfThumbnail || !PdfThumbnail.generate) {
          throw new Error('PDF Thumbnail module not available');
        }
        // Generiere Thumbnail der ersten Seite
        const { uri, width, height } = await PdfThumbnail.generate(fileUri, 0);
        console.log('[importFromFiles] PDF converted successfully:', uri, width, height);
        
        await insertImageFromUri(uri);
        return;
      } catch (pdfError) {
        console.error('[importFromFiles] PDF conversion error:', pdfError);
        // Bessere Fehlermeldung wenn natives Modul nicht verfügbar
        Alert.alert(
          'PDF Import',
          'PDF-Import ist nur im TestFlight/Production-Build verfügbar.\n\nBitte wähle stattdessen ein Bild (JPG, PNG) aus.',
          [{ text: t('common.ok'), style: 'default' }]
        );
        return;
      }
    }

    // Wenn es ein Bild ist, füge es direkt ein
    if (mimeType.startsWith('image/')) {
      await insertImageFromUri(fileUri);
    } else {
      showAlert(t('common.error'), t('sketches.fileTypeNotSupported'));
    }
  } catch (error) {
    console.error('Error importing from files:', error);
    showAlert(t('common.error'), t('sketches.fileImportError'));
  }
}



export type InsertImageFromUriImplCtx = {
  fitImageToCanvas: (imgW: number, imgH: number, maxW?: number, maxH?: number) => { width: number; height: number; x: number; y: number; };
  generateId: () => string;
  elements: DrawElement[];
  addToHistory: (newElements: DrawElement[]) => void;
  setSelectedElementId: React.Dispatch<React.SetStateAction<string | null>>;
  setPhotoEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  selectDrawMode: (mode: DrawMode) => void;
  showAlert: (title: string, message: string) => void;
  t: TFunction<"translation", undefined>;
};

export async function insertImageFromUriImpl(ctx: InsertImageFromUriImplCtx, uri: string) {
  const {
    fitImageToCanvas, generateId, elements, addToHistory, setSelectedElementId, setPhotoEditMode,
    selectDrawMode, showAlert, t,
  } = ctx;
  try {
    // Manipulate image to get base64
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    if (!manipResult.base64) {
      throw new Error('Konnte kein Base64 generieren');
    }

    const base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
    
    // Berechne Seitenverhältnis
    const imgWidth = manipResult.width || 200;
    const imgHeight = manipResult.height || 200;
    const fit = fitImageToCanvas(imgWidth, imgHeight);
    const newElement: DrawElement = {
      id: generateId(),
      type: 'image',
      data: { uri: base64Image },
      color: '#000000',
      strokeWidth: 0,
      x: fit.x,
      y: fit.y,
      width: fit.width,
      height: fit.height,
      rotation: 0,
    };
    const newElements = [...elements, newElement];
    addToHistory(newElements);
    setSelectedElementId(newElement.id);
    setPhotoEditMode(true);
    selectDrawMode('select');
    
    showAlert(t('common.success'), t('sketches.imageInserted'));
  } catch (error) {
    console.error('Error inserting image from URI:', error);
    showAlert(t('common.error'), t('sketches.imageInsertError'));
  }
}



export type TakePhotoAndInsertImplCtx = {
  showAlert: (title: string, message: string) => void;
  t: TFunction<"translation", undefined>;
  fitImageToCanvas: (imgW: number, imgH: number, maxW?: number, maxH?: number) => { width: number; height: number; x: number; y: number; };
  generateId: () => string;
  elements: DrawElement[];
  addToHistory: (newElements: DrawElement[]) => void;
  setSelectedElementId: React.Dispatch<React.SetStateAction<string | null>>;
  setPhotoEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  selectDrawMode: (mode: DrawMode) => void;
};

export async function takePhotoAndInsertImpl(ctx: TakePhotoAndInsertImplCtx) {
  const {
    showAlert, t, fitImageToCanvas, generateId, elements, addToHistory, setSelectedElementId,
    setPhotoEditMode, selectDrawMode,
  } = ctx;
  try {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showAlert(t('sketches.cameraPermission'), t('sketches.cameraPermissionMessage'));
        return;
      }
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      
      // Bild auf max. 1200px Breite reduzieren (verhindert OOM auf iPad)
      const manipResult = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: Math.min(asset.width || 1600, 1600) } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      
      if (!manipResult.base64) {
        throw new Error('Could not generate base64');
      }
      
      const base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
      
      // Berechne korrektes Seitenverhältnis des Bildes
      const imgWidth = manipResult.width || 250;
      const imgHeight = manipResult.height || 250;
      const fit = fitImageToCanvas(imgWidth, imgHeight);
      const newElement: DrawElement = {
        id: generateId(),
        type: 'image',
        data: { uri: base64Image },
        color: '#000000',
        strokeWidth: 0,
        x: fit.x,
        y: fit.y,
        width: fit.width,
        height: fit.height,
        rotation: 0,
      };
      const newElements = [...elements, newElement];
      addToHistory(newElements);
      // Automatisch Foto-Bearbeiten Modus aktivieren
      setSelectedElementId(newElement.id);
      setPhotoEditMode(true);
      selectDrawMode('select');
    }
  } catch (error) {
    console.error('Error taking photo:', error);
    showAlert(t('common.error'), t('sketches.photoTakeError'));
  }
}

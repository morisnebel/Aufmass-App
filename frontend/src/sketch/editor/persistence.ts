import type { useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import React from 'react';
import { Dimensions, Animated } from 'react-native';
import { SketchService } from '../../../services/LocalStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrawElement } from '../sketchShared';
import { PolygonAreaShapes, PolygonAreaOptions } from '../polygonArea';
import { PolygonWalls } from '../wallArea';
const { width, height } = Dimensions.get('window');

export type PerformAutoSaveImplCtx = {
  autoSavingRef: React.RefObject<boolean>;
  isSaving: boolean;
  loading: boolean;
  sketchId: string | undefined;
  lastLoadedSketchId: React.RefObject<string | null | undefined>;
  elements: DrawElement[];
  lastAutoSavedElementsRef: React.RefObject<any>;
  backgroundImageChangedRef: React.RefObject<boolean>;
  lineSegmentMeasurements: { [key: string]: { [segmentIndex: number]: string; }; };
  measureLineStyles: { [elementId: string]: { color: string; strokeWidth: number; fontSize: number; }; };
  totalLfmBoxPositions: { [elementId: string]: { x: number; y: number; }; };
  legendPosition: { x: number; y: number; };
  notes: string;
  labelOffsets: { [elementId: string]: { x: number; y: number; }; };
  polygonAreaVisible: { [elementId: string]: boolean; };
  polygonWalls: PolygonWalls;
  polygonAreaShapes: PolygonAreaShapes;
  polygonAreaOptions: PolygonAreaOptions;
  projectId: string | undefined;
  title: string;
  pdfSize: string;
  backgroundImage: string | null;
  isMountedRef: React.RefObject<boolean>;
  setAutoSaveNotice: React.Dispatch<React.SetStateAction<string | null>>;
  autoSaveNoticeTimerRef: React.RefObject<number | null>;
};

export async function performAutoSaveImpl(ctx: PerformAutoSaveImplCtx) {
  const {
    autoSavingRef, isSaving, loading, sketchId, lastLoadedSketchId, elements,
    lastAutoSavedElementsRef, backgroundImageChangedRef, lineSegmentMeasurements, measureLineStyles,
    totalLfmBoxPositions, legendPosition, notes, labelOffsets, polygonAreaVisible, polygonWalls,
    polygonAreaShapes, polygonAreaOptions, projectId, title, pdfSize, backgroundImage, isMountedRef,
    setAutoSaveNotice, autoSaveNoticeTimerRef,
  } = ctx;
  // Nur bestehende Skizzen, nicht während eines laufenden Speichervorgangs
  if (autoSavingRef.current || isSaving || loading) return;
  if (!sketchId || lastLoadedSketchId.current !== sketchId) return;
  if (elements.length === 0) return;
  // Nichts geändert seit dem letzten Auto-Save?
  if (lastAutoSavedElementsRef.current === elements && !backgroundImageChangedRef.current) return;

  autoSavingRef.current = true;
  try {
    const metadata = {
      elements,
      canvasWidth: width,
      canvasHeight: height - 120,
      lineSegmentMeasurements,
      measureLineStyles,
      totalLfmBoxPositions,
      legendPosition,
      notes,
      labelOffsets,
      polygonAreaVisible,
      polygonWalls,
      polygonAreaShapes,
      polygonAreaOptions,
    };
    // Große Bild-URIs separat speichern (wie beim normalen Speichern)
    const extractedImageOps: Promise<any>[] = [];
    const lightElements = metadata.elements.map((el: any) => {
      if (el.type === 'image' && el.data?.uri && el.data.uri.length > 1000) {
        const imageKey = `sketch_img_${sketchId}_${el.id}`;
        extractedImageOps.push(
          AsyncStorage.setItem(imageKey, el.data.uri).catch(err =>
            console.error('AutoSave: Error saving image element:', err)
          )
        );
        return { ...el, data: { ...el.data, uri: '__stored__', imageStorageKey: imageKey } };
      }
      return el;
    });
    const lightMetadata = { ...metadata, elements: lightElements };

    const ops: Promise<any>[] = [
      AsyncStorage.setItem(`sketch_meta_${sketchId}`, JSON.stringify(lightMetadata)),
      ...extractedImageOps,
      SketchService.update(sketchId, { project_id: projectId, title, notes, pdf_size: pdfSize }),
    ];
    if (backgroundImageChangedRef.current) {
      if (backgroundImage) {
        ops.push(AsyncStorage.setItem(`sketch_bg_${sketchId}`, backgroundImage));
      } else {
        ops.push(AsyncStorage.removeItem(`sketch_bg_${sketchId}`));
      }
    }
    await Promise.all(ops);
    if (backgroundImageChangedRef.current) backgroundImageChangedRef.current = false;
    lastAutoSavedElementsRef.current = elements;

    if (isMountedRef.current) {
      const time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      setAutoSaveNotice(`Automatisch gespeichert · ${time}`);
      if (autoSaveNoticeTimerRef.current) clearTimeout(autoSaveNoticeTimerRef.current);
      autoSaveNoticeTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setAutoSaveNotice(null);
      }, 3000);
    }
    console.log('Auto-save completed for sketch', sketchId);
  } catch (e) {
    console.error('Auto-save failed:', e);
  } finally {
    autoSavingRef.current = false;
  }
}



export type LoadSketchImplCtx = {
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  sketchId: string | undefined;
  projectId: string | undefined;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  setNotes: React.Dispatch<React.SetStateAction<string>>;
  setPdfSize: React.Dispatch<React.SetStateAction<string>>;
  setElements: React.Dispatch<React.SetStateAction<DrawElement[]>>;
  setHistory: React.Dispatch<React.SetStateAction<DrawElement[][]>>;
  setHistoryIndex: React.Dispatch<React.SetStateAction<number>>;
  setBackgroundImage: React.Dispatch<React.SetStateAction<string | null>>;
  setLineSegmentMeasurements: React.Dispatch<React.SetStateAction<{ [key: string]: { [segmentIndex: number]: string; }; }>>;
  setMeasureLineStyles: React.Dispatch<React.SetStateAction<{ [elementId: string]: { color: string; strokeWidth: number; fontSize: number; }; }>>;
  setTotalLfmBoxPositions: React.Dispatch<React.SetStateAction<{ [elementId: string]: { x: number; y: number; }; }>>;
  setLegendPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>;
  legendPan: Animated.ValueXY;
  setLabelOffsets: React.Dispatch<React.SetStateAction<{ [elementId: string]: { x: number; y: number; }; }>>;
  setPolygonAreaVisible: React.Dispatch<React.SetStateAction<{ [elementId: string]: boolean; }>>;
  setPolygonWalls: React.Dispatch<React.SetStateAction<PolygonWalls>>;
  setPolygonAreaShapes: React.Dispatch<React.SetStateAction<PolygonAreaShapes>>;
  setPolygonAreaOptions: React.Dispatch<React.SetStateAction<PolygonAreaOptions>>;
  showAlert: (title: string, message: string) => void;
  t: TFunction<"translation", undefined>;
};

export async function loadSketchImpl(ctx: LoadSketchImplCtx) {
  const {
    setLoading, sketchId, projectId, setTitle, setNotes, setPdfSize, setElements, setHistory,
    setHistoryIndex, setBackgroundImage, setLineSegmentMeasurements, setMeasureLineStyles,
    setTotalLfmBoxPositions, setLegendPosition, legendPan, setLabelOffsets, setPolygonAreaVisible,
    setPolygonWalls, setPolygonAreaShapes, setPolygonAreaOptions, showAlert, t,
  } = ctx;
  try {
    setLoading(true);
    const startTime = Date.now();
    console.log('Loading sketch with ID:', sketchId, 'for project:', projectId);
    
    // Load lightweight sketch info + heavy data in parallel for speed
    const [sketch, heavyData] = await Promise.all([
      SketchService.getById(sketchId),
      SketchService.loadSketchData(sketchId),
    ]);
    console.log('Sketch loaded in', Date.now() - startTime, 'ms');
    
    if (sketch) {
      setTitle(sketch.title || 'Skizze');
      
      // Load notes if available (from main sketch or metadata fallback)
      if (sketch.notes) {
        setNotes(sketch.notes);
      }
      
      // Load PDF size if available
      if ((sketch as any).pdf_size) {
        setPdfSize((sketch as any).pdf_size);
      }
      
      // Use heavy data from optimized storage
      const metadata = heavyData.metadata;
      const bgImage = heavyData.backgroundImage;
      
      if (metadata) {
        console.log('Loaded metadata from optimized storage');
        // Fallback: Notes aus metadata laden falls nicht im Hauptobjekt
        if (!sketch.notes && metadata.notes) {
          setNotes(metadata.notes);
        }
        if (metadata.elements && Array.isArray(metadata.elements)) {
          console.log('Setting elements:', metadata.elements.length, 'elements');
          console.log('Element IDs:', metadata.elements.map((e: any) => e.id + ' (' + e.type + ')').join(', '));
          setElements(metadata.elements);
          setHistory([metadata.elements]);
          setHistoryIndex(0);
        } else {
          console.log('No elements in metadata');
        }
        // Background image from separate storage
        if (bgImage) {
          setBackgroundImage(bgImage);
        }
        // Lade die Linien-Maße wenn vorhanden, sonst zurücksetzen
        if (metadata.lineSegmentMeasurements) {
          setLineSegmentMeasurements(metadata.lineSegmentMeasurements);
        } else {
          setLineSegmentMeasurements({});
        }
        // Maßlinien-Darstellung pro Element laden
        if (metadata.measureLineStyles) {
          setMeasureLineStyles(metadata.measureLineStyles);
        } else {
          setMeasureLineStyles({});
        }
        // Summenbox-Positionen laden wenn vorhanden (pro Element)
        if (metadata.totalLfmBoxPositions) {
          setTotalLfmBoxPositions(metadata.totalLfmBoxPositions);
        } else {
          setTotalLfmBoxPositions({});
        }
        // Legend-Position laden wenn vorhanden
        if (metadata.legendPosition) {
          setLegendPosition(metadata.legendPosition);
          legendPan.setValue(metadata.legendPosition);
        } else {
          // Fallback: Versuche gespeicherte Position aus AsyncStorage zu laden (Crash-Schutz)
          try {
            const savedPos = await AsyncStorage.getItem(`sketch_legend_pos_${sketchId}`);
            if (savedPos) {
              const pos = JSON.parse(savedPos);
              setLegendPosition(pos);
              legendPan.setValue(pos);
            } else {
              setLegendPosition({ x: 0, y: 0 });
              legendPan.setValue({ x: 0, y: 0 });
            }
          } catch {
            setLegendPosition({ x: 0, y: 0 });
            legendPan.setValue({ x: 0, y: 0 });
          }
        }
        // Label-Offsets laden wenn vorhanden
        if (metadata.labelOffsets) {
          setLabelOffsets(metadata.labelOffsets);
        } else {
          setLabelOffsets({});
        }
        // Polygon-Flächen-Sichtbarkeit laden
        if (metadata.polygonAreaVisible) {
          setPolygonAreaVisible(metadata.polygonAreaVisible);
        } else {
          setPolygonAreaVisible({});
        }
        setPolygonWalls(metadata.polygonWalls || {});
        setPolygonAreaShapes(metadata.polygonAreaShapes || {});
        setPolygonAreaOptions(metadata.polygonAreaOptions || {});
      } else if (sketch.metadata) {
        // Fallback: metadata still in main array (shouldn't happen after migration)
        try {
          console.log('Fallback: parsing metadata from main array');
          const parsedMeta = JSON.parse(sketch.metadata);
          if (parsedMeta.elements && Array.isArray(parsedMeta.elements)) {
            setElements(parsedMeta.elements);
            setHistory([parsedMeta.elements]);
            setHistoryIndex(0);
          }
          if (parsedMeta.backgroundImage) {
            setBackgroundImage(parsedMeta.backgroundImage);
          }
          if (parsedMeta.lineSegmentMeasurements) {
            setLineSegmentMeasurements(parsedMeta.lineSegmentMeasurements);
          }
          if (parsedMeta.measureLineStyles) {
            setMeasureLineStyles(parsedMeta.measureLineStyles);
          }
          if (parsedMeta.totalLfmBoxPositions) {
            setTotalLfmBoxPositions(parsedMeta.totalLfmBoxPositions);
          }
          if (parsedMeta.legendPosition) {
            setLegendPosition(parsedMeta.legendPosition);
            legendPan.setValue(parsedMeta.legendPosition);
          }
          if (parsedMeta.labelOffsets) {
            setLabelOffsets(parsedMeta.labelOffsets);
          }
          if (parsedMeta.polygonAreaVisible) {
            setPolygonAreaVisible(parsedMeta.polygonAreaVisible);
          }
          setPolygonWalls(parsedMeta.polygonWalls || {});
          setPolygonAreaShapes(parsedMeta.polygonAreaShapes || {});
        setPolygonAreaOptions(parsedMeta.polygonAreaOptions || {});
        } catch (e) {
          console.error('Error parsing fallback metadata:', e);
        }
      } else {
        console.log('No metadata found for sketch');
      }
    } else {
      console.log('Sketch not found');
    }
    console.log('Total load time:', Date.now() - startTime, 'ms');
  } catch (error) {
    console.error('Error loading sketch:', error);
    showAlert(t('common.error'), t('sketches.sketchLoadError'));
  } finally {
    setLoading(false);
  }
}


export type HandleBackPressImplCtx = {
  isSaving: boolean;
  lastLoadedSketchId: React.RefObject<string | null | undefined>;
  elements: DrawElement[];
  sketchId: string | undefined;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  lineSegmentMeasurements: { [key: string]: { [segmentIndex: number]: string; }; };
  measureLineStyles: { [elementId: string]: { color: string; strokeWidth: number; fontSize: number; }; };
  totalLfmBoxPositions: { [elementId: string]: { x: number; y: number; }; };
  legendPosition: { x: number; y: number; };
  notes: string;
  labelOffsets: { [elementId: string]: { x: number; y: number; }; };
  polygonAreaVisible: { [elementId: string]: boolean; };
  polygonWalls: PolygonWalls;
  polygonAreaShapes: PolygonAreaShapes;
  polygonAreaOptions: PolygonAreaOptions;
  generatePreviewSvg: () => string;
  backgroundImage: string | null;
  title: string;
  projectId: string | undefined;
  pdfSize: string;
  backgroundImageChangedRef: React.RefObject<boolean>;
  isMountedRef: React.RefObject<boolean>;
  allowLeaveRef: React.RefObject<boolean>;
  router: ReturnType<typeof useRouter>;
};

export async function handleBackPressImpl(ctx: HandleBackPressImplCtx) {
  const {
    isSaving, lastLoadedSketchId, elements, sketchId, setIsSaving, lineSegmentMeasurements,
    measureLineStyles, totalLfmBoxPositions, legendPosition, notes, labelOffsets, polygonAreaVisible,
    polygonWalls, polygonAreaShapes, polygonAreaOptions, generatePreviewSvg, backgroundImage, title,
    projectId, pdfSize, backgroundImageChangedRef, isMountedRef, allowLeaveRef, router,
  } = ctx;
  // Schutz vor Doppelklicks - wenn bereits gespeichert wird, ignorieren
  if (isSaving) {
    console.log('Already saving, ignoring back press');
    return;
  }
  
  // Nur auto-speichern wenn wir die aktuelle Skizze bearbeiten (nicht beim Reset)
  const currentSketchId = lastLoadedSketchId.current;
  
  // Only auto-save if there are elements to save AND we're still on the same sketch
  if (elements.length > 0 && currentSketchId === sketchId) {
    try {
      setIsSaving(true); // Blockiere weitere Klicks
      const startTime = Date.now();
      
      // Create metadata WITHOUT backgroundImage (stored separately)
      const metadata = {
        elements,
        canvasWidth: width,
        canvasHeight: height - 120,
        lineSegmentMeasurements,
        measureLineStyles,
        totalLfmBoxPositions,
        legendPosition,
        notes,
        labelOffsets,
        polygonAreaVisible,
        polygonWalls,
        polygonAreaShapes,
        polygonAreaOptions,
      };

      console.log('Auto-saving sketch with', elements.length, 'elements');

      // Generate preview image - wrapped in try/catch
      let sketchData = '';
      
      if (elements.length > 0) {
        try {
          sketchData = generatePreviewSvg();
        } catch (previewError) {
          console.error('Error generating preview:', previewError);
        }
      }
      
      // Use placeholder for background-image sketches (not the full base64!)
      if (!sketchData && backgroundImage) {
        try {
          const previewSvg = `
            <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
              <rect width="200" height="200" fill="#f0f0f0"/>
              <text x="100" y="90" text-anchor="middle" font-size="16" fill="#333">Foto-Skizze</text>
              <text x="100" y="115" text-anchor="middle" font-size="14" fill="#666">${(title || 'Skizze').replace(/[<>&"']/g, '')}</text>
            </svg>
          `;
          sketchData = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(previewSvg)))}`;
        } catch (e) {
          console.error('Error creating placeholder preview:', e);
        }
      }
      
      if (!sketchData) {
        try {
          const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DFE6E9'];
          const colorIndex = elements.length % colors.length;
          const previewColor = colors[colorIndex];
          
          const previewSvg = `
            <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
              <rect width="200" height="200" fill="${previewColor}" opacity="0.3"/>
              <text x="100" y="100" text-anchor="middle" font-size="24" fill="#333">
                ${elements.length} Element${elements.length !== 1 ? 'e' : ''}
              </text>
              <text x="100" y="130" text-anchor="middle" font-size="14" fill="#666">
                ${(title || 'Skizze').replace(/[<>&"']/g, '')}
              </text>
            </svg>
          `;
          
          sketchData = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(previewSvg)))}`;
        } catch (e) {
          console.error('Error creating fallback preview:', e);
        }
      }

      // Lokale Kopien für den Hintergrund-Speichervorgang erstellen
      const saveSketchId = sketchId;
      const saveProjectId = projectId;
      const saveTitle = title;
      const saveNotes = notes;
      const savePdfSize = pdfSize;
      const saveBgChanged = backgroundImageChangedRef.current;
      const saveBgImage = backgroundImage;

      // Bild-URIs aus Elementen extrahieren und separat speichern (verhindert JSON.parse OOM crash)
      const extractedImageOps: Promise<any>[] = [];
      const lightElements = metadata.elements.map((el: any) => {
        if (el.type === 'image' && el.data?.uri && el.data.uri.length > 1000) {
          // Speichere das Bild separat
          const imageKey = `sketch_img_${saveSketchId}_${el.id}`;
          extractedImageOps.push(
            AsyncStorage.setItem(imageKey, el.data.uri).catch(err => 
              console.error('Error saving image element:', err)
            )
          );
          // Ersetze die URI durch einen Verweis auf den Speicherkey
          return { ...el, data: { ...el.data, uri: '__stored__', imageStorageKey: imageKey } };
        }
        return el;
      });
      const lightMetadata = { ...metadata, elements: lightElements };

      // SPEICHERN: Leichtgewichtige Daten (Sketch-Liste inkl. pdf_size) SOFORT speichern
      // Schwere Daten (Metadata, Bilder, Background) im Hintergrund
      if (saveSketchId) {
        // SOFORT: Sketch-Listeneintrag aktualisieren (pdf_size, title, notes)
        // Das stellt sicher, dass die Projektdetails die neuesten Daten haben
        try {
          await SketchService.update(saveSketchId, {
            project_id: saveProjectId,
            title: saveTitle,
            notes: saveNotes,
            sketch_data: sketchData,
            pdf_size: savePdfSize,
          });
          console.log('Sketch list entry updated (sync) in', Date.now() - startTime, 'ms');
        } catch (err) {
          console.error('Error saving sketch list entry:', err);
        }
        
        // IM HINTERGRUND: Schwere Metadata und Bilder speichern
        const saveHeavyDataInBackground = async () => {
          try {
            const criticalOps: Promise<any>[] = [
              AsyncStorage.setItem(`sketch_meta_${saveSketchId}`, JSON.stringify(lightMetadata)),
              ...extractedImageOps,
            ];
            
            if (saveBgChanged) {
              if (saveBgImage) {
                criticalOps.push(AsyncStorage.setItem(`sketch_bg_${saveSketchId}`, saveBgImage));
              } else {
                criticalOps.push(AsyncStorage.removeItem(`sketch_bg_${saveSketchId}`));
              }
            }
            
            await Promise.all(criticalOps);
            backgroundImageChangedRef.current = false;
            console.log('Background-saved heavy data in', Date.now() - startTime, 'ms');
          } catch (error) {
            console.error('Error background-saving heavy data:', error);
          }
        };
        saveHeavyDataInBackground();
      } else if (saveTitle.trim()) {
        // NEUE Skizze: Alles synchron speichern, damit sie in der Vorschau erscheint
        try {
          // Metadata OHNE backgroundImage stringifyen (verhindert OOM bei großen Bildern)
          const lightMetadataForCreate = { ...metadata };
          delete lightMetadataForCreate.backgroundImage;
          await SketchService.create({
            project_id: saveProjectId,
            title: saveTitle,
            notes: saveNotes,
            sketch_data: sketchData,
            metadata: JSON.stringify(lightMetadataForCreate),
            pdf_size: savePdfSize,
          });
          // Hintergrundbild separat speichern (ohne JSON.stringify)
          if (saveBgImage) {
            const newSketches = await SketchService.getAll();
            const newest = newSketches[newSketches.length - 1];
            if (newest) {
              await AsyncStorage.setItem(`sketch_bg_${newest.id}`, saveBgImage);
            }
          }
          backgroundImageChangedRef.current = false;
          console.log('Saved new sketch in', Date.now() - startTime, 'ms');
        } catch (error) {
          console.error('Error saving new sketch:', error);
        }
      }
      
    } catch (error) {
      console.error('Error preparing sketch save:', error);
    }
  }
  
  // SOFORT zurück navigieren - Speichern läuft im Hintergrund
  console.log('=== NAVIGATION DEBUG v2 === handleBackPress calling router.back(), projectId:', projectId, 'sketchId:', sketchId);
  if (isMountedRef.current) {
    allowLeaveRef.current = true;
    router.back();
  }
}


export type SaveSketchImplCtx = {
  title: string;
  showAlert: (title: string, message: string) => void;
  t: TFunction<"translation", undefined>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  elements: DrawElement[];
  lineSegmentMeasurements: { [key: string]: { [segmentIndex: number]: string; }; };
  measureLineStyles: { [elementId: string]: { color: string; strokeWidth: number; fontSize: number; }; };
  totalLfmBoxPositions: { [elementId: string]: { x: number; y: number; }; };
  legendPosition: { x: number; y: number; };
  notes: string;
  labelOffsets: { [elementId: string]: { x: number; y: number; }; };
  polygonAreaVisible: { [elementId: string]: boolean; };
  polygonWalls: PolygonWalls;
  polygonAreaShapes: PolygonAreaShapes;
  polygonAreaOptions: PolygonAreaOptions;
  backgroundImageChangedRef: React.RefObject<boolean>;
  generatePreviewSvg: () => string;
  backgroundImage: string | null;
  sketchId: string | undefined;
  projectId: string | undefined;
  pdfSize: string;
  allowLeaveRef: React.RefObject<boolean>;
  router: ReturnType<typeof useRouter>;
  isMountedRef: React.RefObject<boolean>;
};

export async function saveSketchImpl(ctx: SaveSketchImplCtx) {
  const {
    title, showAlert, t, setLoading, elements, lineSegmentMeasurements, measureLineStyles,
    totalLfmBoxPositions, legendPosition, notes, labelOffsets, polygonAreaVisible, polygonWalls,
    polygonAreaShapes, polygonAreaOptions, backgroundImageChangedRef, generatePreviewSvg,
    backgroundImage, sketchId, projectId, pdfSize, allowLeaveRef, router, isMountedRef,
  } = ctx;
  if (!title.trim()) {
    showAlert(t('common.error'), t('sketches.enterTitle'));
    return;
  }

  try {
    setLoading(true);
    const startTime = Date.now();
    
    // Create metadata WITHOUT backgroundImage (stored separately for performance)
    const metadata = {
      elements,
      canvasWidth: width,
      canvasHeight: height - 120, // Subtract header/toolbar height
      lineSegmentMeasurements, // Speichere die Linien-Maße
      measureLineStyles, // Speichere die Maßlinien-Darstellung pro Element
      totalLfmBoxPositions, // Speichere alle Summenbox-Positionen pro Element
      legendPosition, // Speichere Position der Übersicht-Legend
      notes, // Speichere die Notizen
      labelOffsets, // Speichere Polyline-Label-Positionen
      polygonAreaVisible, // Speichere Polygon-Flächen-Sichtbarkeit
      polygonWalls, // Speichere Wandhöhen/Abzüge
      polygonAreaShapes,
      polygonAreaOptions,
    };

    console.log('Saving sketch with', elements.length, 'elements, bgChanged:', backgroundImageChangedRef.current);

    // Generate preview image
    let sketchData = '';
    
    // Priority 1: Generate mini-sketch from elements if we have any
    if (elements.length > 0) {
      try {
        sketchData = generatePreviewSvg();
      } catch (previewError) {
        console.error('Error generating preview:', previewError);
      }
    }
    
    // Priority 2: Use background image if no elements preview available
    if (!sketchData && backgroundImage) {
      // Use a small placeholder instead of the full background image for preview
      const previewSvg = `
        <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="200" fill="#f0f0f0"/>
          <text x="100" y="90" text-anchor="middle" font-size="16" fill="#333">Foto-Skizze</text>
          <text x="100" y="115" text-anchor="middle" font-size="14" fill="#666">${title || 'Skizze'}</text>
        </svg>
      `;
      sketchData = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(previewSvg)))}`;
    }
    
    // Priority 3: Fallback colored badge
    if (!sketchData) {
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DFE6E9'];
      const colorIndex = elements.length % colors.length;
      const previewColor = colors[colorIndex];
      
      const previewSvg = `
        <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="200" fill="${previewColor}" opacity="0.3"/>
          <text x="100" y="100" text-anchor="middle" font-size="24" fill="#333">
            ${elements.length} Element${elements.length !== 1 ? 'e' : ''}
          </text>
          <text x="100" y="130" text-anchor="middle" font-size="14" fill="#666">
            ${title || 'Skizze'}
          </text>
        </svg>
      `;
      
      sketchData = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(previewSvg)))}`;
    }

    const t1 = Date.now();
    console.log('Preview generated in', t1 - startTime, 'ms');

    // Bild-URIs aus Elementen extrahieren und separat speichern (verhindert JSON.parse OOM crash)
    const imageOps: Promise<any>[] = [];
    const lightElementsForSave = metadata.elements.map((el: any) => {
      if (el.type === 'image' && el.data?.uri && el.data.uri.length > 1000) {
        const imageKey = `sketch_img_${sketchId || 'new'}_${el.id}`;
        imageOps.push(
          AsyncStorage.setItem(imageKey, el.data.uri).catch(err => 
            console.error('Error saving image element:', err)
          )
        );
        return { ...el, data: { ...el.data, uri: '__stored__', imageStorageKey: imageKey } };
      }
      return el;
    });
    const lightMetadataForSave = { ...metadata, elements: lightElementsForSave };

    if (sketchId) {
      // Update existing sketch - FAST PATH: save critical data first, update list later
      console.log('Updating sketch ID:', sketchId);
      
      // STEP 1: Save metadata (elements etc.) to separate key - this is the critical data
      const metaStr = JSON.stringify(lightMetadataForSave);
      const criticalOps: Promise<any>[] = [
        AsyncStorage.setItem(`sketch_meta_${sketchId}`, metaStr),
        ...imageOps,
      ];
      
      // Only save background image if it actually changed
      if (backgroundImageChangedRef.current) {
        console.log('Background image changed, saving...');
        if (backgroundImage) {
          criticalOps.push(AsyncStorage.setItem(`sketch_bg_${sketchId}`, backgroundImage));
        } else {
          criticalOps.push(AsyncStorage.removeItem(`sketch_bg_${sketchId}`));
        }
      }
      
      // Wait only for critical data to be saved
      await Promise.all(criticalOps);
      backgroundImageChangedRef.current = false;
      
      const t2 = Date.now();
      console.log('Critical data saved in', t2 - startTime, 'ms');
      
      // STEP 2: Update lightweight sketch entry in main array (fire-and-forget)
      // This updates the preview SVG, title, notes for the list view
      // It runs in the background so the user doesn't have to wait
      SketchService.update(sketchId, {
        project_id: projectId,
        title,
        notes,
        sketch_data: sketchData,
        pdf_size: pdfSize,
      }).then(() => {
        console.log('Main array updated in background:', Date.now() - startTime, 'ms');
      }).catch(err => {
        console.error('Background update error:', err);
      });
      
      console.log('Sketch saved in', Date.now() - startTime, 'ms (list update in background)');
      showAlert(t('common.success'), t('sketches.sketchUpdated'));
    } else {
      // Create new sketch - include metadata for SketchService.create to handle
      console.log('Creating new sketch');
      // Metadata OHNE backgroundImage stringifyen (verhindert OOM bei großen base64-Bildern)
      const lightMetadataForCreate = { ...lightMetadataForSave };
      delete lightMetadataForCreate.backgroundImage;
      await Promise.all(imageOps);
      const newSketch = await SketchService.create({
        project_id: projectId,
        title,
        notes,
        sketch_data: sketchData,
        metadata: JSON.stringify(lightMetadataForCreate),
        pdf_size: pdfSize,
      });
      // Hintergrundbild separat speichern (ohne JSON.stringify)
      if (backgroundImage && newSketch?.id) {
        await AsyncStorage.setItem(`sketch_bg_${newSketch.id}`, backgroundImage);
      }
      backgroundImageChangedRef.current = false;
      console.log('Sketch created in', Date.now() - startTime, 'ms');
      showAlert(t('common.success'), t('sketches.sketchSaved'));
    }

    allowLeaveRef.current = true;
    router.back();
  } catch (error) {
    console.error('Error saving sketch:', error);
    if (isMountedRef.current) {
      showAlert(t('common.error'), t('sketches.sketchSaveError'));
    }
  } finally {
    if (isMountedRef.current) {
      setLoading(false);
    }
  }
}

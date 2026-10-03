import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef } from 'react';
import { Button, Pressable, StyleSheet, Text, View } from 'react-native';

import { themedStyles, useTheme } from '../theme';

type Props = {
  onScanned: (barcode: string) => void;
  onCancel: () => void;
};

// The kinds of barcodes printed on retail boxes, plus QR codes.
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] as const;

export default function BarcodeScanner({ onScanned, onCancel }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  // The camera reports the same code many times per second; only act on the first.
  const handled = useRef(false);

  function handleScan(result: BarcodeScanningResult) {
    if (handled.current) return;
    handled.current = true;
    onScanned(result.data);
  }

  if (!permission) {
    return <View style={styles.center} />; // still checking permission
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>The app needs camera access to scan barcodes.</Text>
        {permission.canAskAgain ? (
          <Button title="Allow camera" onPress={requestPermission} color={colors.primary} />
        ) : (
          <Text style={styles.message}>Turn on camera access for Expo Go in your phone&apos;s Settings.</Text>
        )}
        <Button title="Cancel" onPress={onCancel} color={colors.mutedButton} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={handleScan}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.instructions}>Point the camera at the barcode on the box</Text>
        <View style={styles.frame} />
        <Pressable style={styles.cancel} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

// The camera view is always dark, so only the permission screen follows the theme.
const useStyles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: c.background,
  },
  message: { fontSize: 16, textAlign: 'center', color: c.text },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 60 },
  instructions: {
    color: '#fff',
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  frame: {
    width: '80%',
    height: 160,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 12,
  },
  cancel: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  cancelText: { color: '#fff', fontSize: 16, fontWeight: '600' },
}));

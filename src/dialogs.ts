import { Alert } from 'react-native';

export type DialogButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

// Asks the user to pick one of a few buttons. Phone version: a native alert.
// (dialogs.web.ts uses the browser's confirm box instead.)
export function showDialog(title: string, message: string, buttons: DialogButton[]) {
  Alert.alert(title, message, buttons);
}

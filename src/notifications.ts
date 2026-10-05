import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Spool } from './db';

const CHANNEL_ID = 'low-stock';

// Show notifications as a banner even while the app is open on screen.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Asks the user for permission to show notifications (only prompts once).
// Returns true if notifications are allowed.
export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    // Android groups notifications into "channels" that users can mute in Settings.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Low filament',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

// Shows a notification right away saying this spool is running low.
export async function notifyLowStock(spool: Spool) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Filament running low',
      body: `${spool.brand} ${spool.material} (${spool.color}) has ${Math.round(
        spool.remainingWeightG
      )} g left.`,
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });
}

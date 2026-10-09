import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import type { RemotePairing } from '../../korev-desktop/src/shared/model';
import { call } from './connection';

const ANDROID_CHANNEL_ID = 'default';
const ANDROID_CHANNEL_NAME = 'Korev';

let registeredToken: string | null = null;

async function requestPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: ANDROID_CHANNEL_NAME,
      importance: Notifications.AndroidImportance.HIGH,
    });
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export async function registerForPush(pairing: RemotePairing): Promise<void> {
  try {
    const token = await requestPushToken();
    if (!token) return;
    await call(pairing, 'registerPushToken', [token]);
    registeredToken = token;
  } catch (error) {
    console.warn(`Push registration failed: ${String(error)}`);
  }
}

export async function unregisterFromPush(
  pairing: RemotePairing,
): Promise<void> {
  if (!registeredToken) return;
  await call(pairing, 'unregisterPushToken', [registeredToken]).catch(
    () => undefined,
  );
  registeredToken = null;
}

export function useOpenTappedWorkspace() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const workspaceId =
      response?.notification.request.content.data?.workspaceId;
    if (typeof workspaceId !== 'string') return;
    Notifications.clearLastNotificationResponse();
    router.push({ pathname: '/workspace/[id]', params: { id: workspaceId } });
  }, [response]);
}

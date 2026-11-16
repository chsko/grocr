import { Alert, type AlertButton, Platform } from 'react-native';

/**
 * React Native Web's Alert.alert does nothing, so on the website confirmations and errors would
 * silently vanish. There, a plain message becomes window.alert and "Cancel + one action" (every
 * confirmation in the gift screens) becomes window.confirm.
 */
export function webAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const text = message ? `${title}\n\n${message}` : title;
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  if (actions.length === 0) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  if (window.confirm(text)) void actions[actions.length - 1].onPress?.();
  else void (buttons ?? []).find((b) => b.style === 'cancel')?.onPress?.();
}

if (Platform.OS === 'web') Alert.alert = webAlert;

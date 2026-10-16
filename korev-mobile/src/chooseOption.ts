import { ActionSheetIOS, Alert, Platform } from 'react-native';

const CANCEL = 'Cancel';

export function chooseOption<T extends string>(
  title: string,
  options: readonly T[],
  labels: Record<T, string>,
): Promise<T | null> {
  const optionLabels = options.map((option) => labels[option]);
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...optionLabels, CANCEL],
          cancelButtonIndex: optionLabels.length,
        },
        (index) => resolve(options[index] ?? null),
      );
      return;
    }
    Alert.alert(
      title,
      undefined,
      [
        ...options.map((option) => ({
          text: labels[option],
          onPress: () => resolve(option),
        })),
        { text: CANCEL, style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

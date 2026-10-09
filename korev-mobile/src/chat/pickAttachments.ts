import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { fileName } from '../../../korev-desktop/src/shared/format';

export interface PickedFile {
  name: string;
  uri: string;
}

type Source = 'photos' | 'files';

const SOURCES: Source[] = ['photos', 'files'];
const SOURCE_LABELS: Record<Source, string> = {
  photos: 'Photo library',
  files: 'Files',
};
const CANCEL = 'Cancel';
const PHOTO_QUALITY = 0.7;

function chooseSource(): Promise<Source | null> {
  const labels = SOURCES.map((source) => SOURCE_LABELS[source]);
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...labels, CANCEL], cancelButtonIndex: labels.length },
        (index) => resolve(SOURCES[index] ?? null),
      );
      return;
    }
    Alert.alert(
      'Attach',
      undefined,
      [
        ...SOURCES.map((source) => ({
          text: SOURCE_LABELS[source],
          onPress: () => resolve(source),
        })),
        { text: CANCEL, style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

async function pickPhotos(): Promise<PickedFile[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: PHOTO_QUALITY,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    name: fileName(asset.uri),
    uri: asset.uri,
  }));
}

async function pickFiles(): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ multiple: true });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({ name: asset.name, uri: asset.uri }));
}

export async function pickAttachments(): Promise<PickedFile[]> {
  const source = await chooseSource();
  if (source === 'photos') return pickPhotos();
  if (source === 'files') return pickFiles();
  return [];
}

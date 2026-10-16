import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { fileName } from '../../../korev-desktop/src/shared/format';
import { chooseOption } from '../chooseOption';

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
const PHOTO_QUALITY = 0.7;

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
  const source = await chooseOption('Attach', SOURCES, SOURCE_LABELS);
  if (source === 'photos') return pickPhotos();
  if (source === 'files') return pickFiles();
  return [];
}

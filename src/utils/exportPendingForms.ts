import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

import { getQueue } from '../app/pendingQueue';

export type ExportPendingFormsStatus =
  | { status: 'empty' }
  | { status: 'success'; filePath: string; fileName: string; directory: string }
  | { status: 'error'; error: unknown };

const buildFileName = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `pending_forms_${timestamp}.json`;
};

export const exportPendingFormsToFile =
  async (): Promise<ExportPendingFormsStatus> => {
    const queue = await getQueue();

    if (!Array.isArray(queue) || queue.length === 0) {
      return { status: 'empty' };
    }

    const fileName = buildFileName();
    const payload = JSON.stringify(queue, null, 2);

    // For Android, try multiple locations in order of preference
    // For iOS, use DocumentDirectoryPath
    const targetDirectories: string[] = [];

    if (Platform.OS === 'android') {
      // Try Downloads folder first (most accessible)
      if (RNFS.DownloadDirectoryPath) {
        targetDirectories.push(RNFS.DownloadDirectoryPath);
      }
      // Fallback to ExternalStorageDirectoryPath/Download
      if (RNFS.ExternalStorageDirectoryPath) {
        targetDirectories.push(`${RNFS.ExternalStorageDirectoryPath}/Download`);
      }
      // Fallback to DocumentDirectoryPath (app-specific, always accessible)
      targetDirectories.push(RNFS.DocumentDirectoryPath);
    } else {
      // iOS: Use DocumentDirectoryPath
      targetDirectories.push(RNFS.DocumentDirectoryPath);
    }

    let lastError: unknown = null;

    for (const directory of targetDirectories) {
      try {
        // Ensure directory exists
        const dirExists = await RNFS.exists(directory);
        if (!dirExists) {
          await RNFS.mkdir(directory);
        }

        const filePath = `${directory}/${fileName}`;
        await RNFS.writeFile(filePath, payload, 'utf8');

        // Verify file was written
        const fileExists = await RNFS.exists(filePath);
        if (!fileExists) {
          throw new Error('File was not created successfully');
        }

        console.log(`[Export] File saved successfully to: ${filePath}`);
        return { status: 'success', filePath, fileName, directory };
      } catch (error) {
        console.error(`[Export] Failed to write to ${directory}:`, error);
        lastError = error;
        // Continue to next directory
      }
    }

    console.error('[Export] All directory attempts failed:', lastError);
    return { status: 'error', error: lastError };
  };

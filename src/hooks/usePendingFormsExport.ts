import { useCallback, useState } from 'react';
import { Alert, Platform, Share } from 'react-native';
import { useTranslation } from 'react-i18next';
import RNFS from 'react-native-fs';

import { exportPendingFormsToFile } from '../utils/exportPendingForms';

export const usePendingFormsExport = () => {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (isExporting) {
      return;
    }

    try {
      setIsExporting(true);
      const result = await exportPendingFormsToFile();

      if (result.status === 'empty') {
        Alert.alert(
          t('settings.exportNoFormsTitle'),
          t('settings.exportNoFormsMessage')
        );
        return;
      }

      if (result.status === 'error') {
        console.error('Error exporting pending forms:', result.error);
        Alert.alert(
          t('settings.exportErrorTitle'),
          t('settings.exportErrorMessage')
        );
        return;
      }

      // Verify file exists before sharing
      const fileExists = await RNFS.exists(result.filePath);
      if (!fileExists) {
        throw new Error('Exported file does not exist');
      }

      // Show success message first
      Alert.alert(
        t('settings.exportSuccessTitle'),
        t('settings.exportSuccessMessage', { fileName: result.fileName }),
        [
          {
            text: t('common.ok'),
            onPress: async () => {
              try {
                // Prepare file URL for sharing
                let fileUrl: string;
                
                if (Platform.OS === 'android') {
                  // For Android, use content:// URI if in Downloads, otherwise file://
                  if (result.directory.includes('Download')) {
                    // Try to use file:// URI
                    fileUrl = `file://${result.filePath}`;
                  } else {
                    fileUrl = `file://${result.filePath}`;
                  }
                } else {
                  // iOS: use file:// URI
                  fileUrl = `file://${result.filePath}`;
                }

                // Share the file
                const shareResult = await Share.share(
                  {
                    title: t('settings.exportShareTitle'),
                    message: t('settings.exportShareMessage', {
                      fileName: result.fileName,
                    }),
                    url: fileUrl,
                  },
                  {
                    dialogTitle: t('settings.exportShareTitle'),
                    subject: result.fileName,
                  }
                );

                // On Android, if share is dismissed, show location info
                if (Platform.OS === 'android' && shareResult.action === Share.dismissedAction) {
                  Alert.alert(
                    t('settings.exportFileLocationTitle'),
                    t('settings.exportFileLocationMessage', {
                      fileName: result.fileName,
                      directory: result.directory,
                    })
                  );
                }
              } catch (shareError) {
                console.error('Error sharing file:', shareError);
                // Still show where the file is saved
                Alert.alert(
                  t('settings.exportFileLocationTitle'),
                  t('settings.exportFileLocationMessage', {
                    fileName: result.fileName,
                    directory: result.directory,
                  })
                );
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Unexpected error exporting pending forms:', error);
      Alert.alert(
        t('settings.exportErrorTitle'),
        t('settings.exportErrorMessage')
      );
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, t]);

  return { exportPendingForms: handleExport, isExporting };
};



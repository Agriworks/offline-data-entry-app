import { RawField } from '../../types';

export type FormStackParamList = {
  Forms: undefined;
  PreviewForm: { formId: string };
  TableRowEditor: {
    fieldname: string;
    tableDoctype: string;
    title?: string;
    index?: number;
    initialRow?: Record<string, any> | null;
    schema?: RawField[] | null;
  };
};

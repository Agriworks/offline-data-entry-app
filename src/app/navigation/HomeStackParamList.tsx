import { RawField } from '../../types';

export type HomeStackParamList = {
  HomeMain: undefined;
  FormsList: { erpSystemName: string }; // ERP system name will be passed as param
  FormDetail: { formName: string; erpSystemName: string }; // formName and erpSystemName will be passed as params
  TableRowEditor: {
    fieldname: string;
    tableDoctype: string;
    title?: string;
    index?: number;
    initialRow?: Record<string, any> | null;
    schema?: RawField[] | null;
  };
};

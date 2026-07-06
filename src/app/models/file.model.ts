export interface StagedFile {
  id: string;
  file: File;
  previewUrl: string;      // local blob URL for immediate UI rendering
  cloudinaryUrl: string | null;
  isUploading: boolean;
  type: 'IMAGE' | 'FILE';
}

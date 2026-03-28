declare namespace Axios {
  interface AxiosXHRConfigBase<T> {
    onUploadProgress?: (event: ProgressEvent) => void;
  }
}

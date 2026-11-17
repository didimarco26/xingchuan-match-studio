// 按需加载 SheetJS（xlsx.full.min.js 作为独立静态资源，不内联进主 bundle）。
// 原因：xlsx 内含大量 HTML 字符串（<script>/<table>…），与单文件 HTML 的部署期 HTML 重写器冲突。
// 该 .js 以纯 JS MIME 分发，不会被 HTML 重写器处理；对内站与 GitHub Pages 同路径均可用。

export interface XlsxModule {
  read: (data: ArrayBuffer | Uint8Array, opts?: unknown) => XlsxWorkbook;
  utils: {
    aoa_to_sheet: (aoa: unknown[][], opts?: unknown) => unknown;
    book_new: () => XlsxWorkbook;
    book_append_sheet: (wb: XlsxWorkbook, ws: unknown, name: string) => void;
    sheet_to_json: <T = unknown>(ws: unknown, opts?: unknown) => T[];
  };
  writeFile: (wb: XlsxWorkbook, name: string) => void;
}

export interface XlsxWorkbook {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}

let promise: Promise<XlsxModule> | null = null;

export function loadXlsx(): Promise<XlsxModule> {
  if (promise) return promise;
  promise = new Promise<XlsxModule>((resolve, reject) => {
    const w = window as unknown as { XLSX?: XlsxModule };
    if (w.XLSX) { resolve(w.XLSX); return; }
    const s = document.createElement('script');
    s.src = new URL('xlsx.full.min.js', document.baseURI || window.location.href).href;
    s.async = true;
    s.onload = () => {
      const x = (window as unknown as { XLSX?: XlsxModule }).XLSX;
      if (x) resolve(x);
      else reject(new Error('xlsx 资源加载失败'));
    };
    s.onerror = () => reject(new Error('xlsx 资源加载失败，请检查网络'));
    document.head.appendChild(s);
  });
  return promise;
}

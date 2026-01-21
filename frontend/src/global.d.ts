declare module '*.module.scss' {
  interface IClassNames {
    [className: string]: string;
  }
  const classNames: IClassNames;
  export = classNames;
}

declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.gif';

// SVG как путь (для обычных картинок в img/)
declare module '*.svg' {
  const content: string;
  export default content;
}

// SVG как React-компонент (для папки icons с SVGR)
declare module 'icons/*.svg' {
  import * as React from 'react';
  const SVG: React.FC<React.SVGProps<SVGSVGElement>>;
  export default SVG;
}

// расширяем NodeRequire, а не переопределяем
interface NodeRequire {
  context: (
    path: string,
    deep?: boolean,
    filter?: RegExp
  ) => {
    keys(): string[];
    <T = any>(id: string): T;
  };
}

declare const __PLATFORM__: 'mobile' | 'desktop';
declare const __ENV__: 'production' | 'development';

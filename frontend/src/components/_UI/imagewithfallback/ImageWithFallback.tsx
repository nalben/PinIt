import React, { useEffect, useState } from 'react';

type ImageWithFallbackProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null;
  fallback: React.ReactNode;
};

const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({ src, fallback, onError, ...imgProps }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (!src || hasError) {
    return <>{fallback}</>;
  }

  return (
    <img
      {...imgProps}
      src={src}
      onError={(event) => {
        setHasError(true);
        onError?.(event);
      }}
    />
  );
};

export default ImageWithFallback;

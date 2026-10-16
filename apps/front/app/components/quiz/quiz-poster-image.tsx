import {useEffect, useState} from 'react';

const RETRY_DELAY_MS = 3000;

type Properties = {
  transformedSrc: string;
  originalSrc: string;
  alt: string;
};

export function QuizPosterImage({
  transformedSrc,
  originalSrc,
  alt,
}: Properties) {
  const sources = [
    ...new Set([transformedSrc, originalSrc]),
    `${originalSrc}&retry=1`,
  ];
  const [index, setIndex] = useState(0);
  const [isWaiting, setIsWaiting] = useState(false);

  useEffect(() => {
    if (!isWaiting) {
      return;
    }

    const timer = setTimeout(() => {
      setIsWaiting(false);
      setIndex(current => current + 1);
    }, RETRY_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [isWaiting]);

  const handleError = () => {
    if (isWaiting || index + 1 >= sources.length) {
      return;
    }

    if (index + 1 === sources.length - 1) {
      setIsWaiting(true);
      return;
    }

    setIndex(index + 1);
  };

  return (
    <img
      src={sources[index]}
      alt={alt}
      width={480}
      height={720}
      className="block w-full h-auto"
      onError={handleError}
    />
  );
}

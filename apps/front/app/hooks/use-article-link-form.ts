import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';

export const TITLE_FETCH_DEBOUNCE_MS = 500;

export type ArticleLinkFormState = {
  url: string;
  title: string;
  description: string;
  captchaToken: string;
};

export type SubmissionResult = {error?: string} | undefined;

export type ArticleLinkFormReturn = {
  formData: ArticleLinkFormState;
  handleInputChange: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  handleCaptchaTokenChange: (token: string) => void;
  isLoadingTitle: boolean;
  submissionResult: SubmissionResult;
};

export function useIsTestMode(): boolean {
  return import.meta.env.MODE === 'test';
}

export async function fetchUrlTitle(
  apiUrl: string,
  url: string,
): Promise<string | undefined> {
  try {
    const response = await fetch(`${apiUrl}/fetch-url-title`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({url}),
    });
    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as {title?: string};
    return data.title || undefined;
  } catch {
    return undefined;
  }
}

function isAbsoluteUrl(url: string): boolean {
  try {
    void new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function fallbackTitleFromUrl(url: string): string {
  const {hostname, pathname} = new URL(url);
  const segments = pathname.split('/').filter(Boolean);
  if (
    (hostname === 'x.com' || hostname === 'twitter.com') &&
    segments[1] === 'status'
  ) {
    return `@${segments[0]} のポスト`;
  }

  if (
    hostname === 'bsky.app' &&
    segments[0] === 'profile' &&
    segments[2] === 'post'
  ) {
    return `@${segments[1]} のポスト`;
  }

  if (
    hostname === 'filmarks.com' &&
    segments[0] === 'movies' &&
    segments[2] === 'reviews'
  ) {
    return 'Filmarks のレビュー';
  }

  if (hostname === 'letterboxd.com' && segments[1] === 'film') {
    return `@${segments[0]} の Letterboxd のレビュー`;
  }

  return hostname;
}

export function useArticleLinkForm(
  isTestMode: boolean,
  actionData: unknown,
  apiUrl: string,
  initialUrl = '',
): ArticleLinkFormReturn {
  const [formData, setFormData] = useState<ArticleLinkFormState>({
    url: initialUrl,
    title: '',
    description: '',
    captchaToken: isTestMode ? 'test-token' : '',
  });
  const [isLoadingTitle, setIsLoadingTitle] = useState(false);
  const submissionResult = actionData as SubmissionResult;
  const latestUrl = useRef('');
  const isTitleEdited = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const fetchTitleFromUrl = useCallback(
    async (url: string) => {
      setIsLoadingTitle(true);
      const title =
        (await fetchUrlTitle(apiUrl, url)) || fallbackTitleFromUrl(url);
      if (latestUrl.current !== url) {
        return;
      }

      setIsLoadingTitle(false);
      if (isTitleEdited.current) {
        return;
      }

      setFormData(previous => ({...previous, title}));
    },
    [apiUrl],
  );

  const scheduleTitleFetch = useCallback(
    (url: string) => {
      latestUrl.current = url;
      isTitleEdited.current = false;
      clearTimeout(timer.current);

      setIsLoadingTitle(false);
      if (!isAbsoluteUrl(url)) {
        return;
      }

      setFormData(previous => ({
        ...previous,
        title: fallbackTitleFromUrl(url),
      }));
      timer.current = setTimeout(() => {
        void fetchTitleFromUrl(url);
      }, TITLE_FETCH_DEBOUNCE_MS);
    },
    [fetchTitleFromUrl],
  );

  useEffect(() => {
    if (initialUrl) {
      scheduleTitleFetch(initialUrl);
    }
  }, [initialUrl, scheduleTitleFetch]);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const {name, value} = event.target;
      setFormData(previous => ({
        ...previous,
        [name]: value,
      }));

      if (name === 'title') {
        isTitleEdited.current = true;
      } else if (name === 'url') {
        scheduleTitleFetch(value);
      }
    },
    [scheduleTitleFetch],
  );

  const handleCaptchaTokenChange = useCallback((token: string) => {
    setFormData(previous => ({
      ...previous,
      captchaToken: token,
    }));
  }, []);

  return {
    formData,
    handleInputChange,
    handleCaptchaTokenChange,
    isLoadingTitle,
    submissionResult,
  };
}

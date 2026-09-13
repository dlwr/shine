import {useCallback, useState, type ChangeEvent} from 'react';

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

  return hostname;
}

export function useArticleLinkForm(
  isTestMode: boolean,
  actionData: unknown,
  apiUrl: string,
): ArticleLinkFormReturn {
  const [formData, setFormData] = useState<ArticleLinkFormState>({
    url: '',
    title: '',
    description: '',
    captchaToken: isTestMode ? 'test-token' : '',
  });
  const [isLoadingTitle, setIsLoadingTitle] = useState(false);
  const submissionResult = actionData as SubmissionResult;

  const fetchTitleFromUrl = useCallback(
    async (url: string) => {
      if (!url) {
        return;
      }

      try {
        void new URL(url);
      } catch {
        return;
      }

      setIsLoadingTitle(true);
      const title =
        (await fetchUrlTitle(apiUrl, url)) || fallbackTitleFromUrl(url);
      setFormData(previous => ({...previous, title}));
      setIsLoadingTitle(false);
    },
    [apiUrl],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const {name, value} = event.target;
      setFormData(previous => ({
        ...previous,
        [name]: value,
      }));

      if (name === 'url') {
        void fetchTitleFromUrl(value);
      }
    },
    [fetchTitleFromUrl],
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

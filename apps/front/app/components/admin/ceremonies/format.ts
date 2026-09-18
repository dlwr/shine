import type {CeremonyNavigationItem} from './types';

export const formatDateInput = (value: number | null) => {
  if (!value) {
    return '';
  }

  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString().slice(0, 10);
};

export const formatTimestamp = (value: number) => {
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatNavigationLabel = (item: CeremonyNavigationItem) => {
  if (item.ceremonyNumber && item.ceremonyNumber > 0) {
    return `${item.year}年・第${item.ceremonyNumber}回`;
  }

  return `${item.year}年`;
};

export const formatYearAndNumber = (
  year: number,
  ceremonyNumber: number | null,
) => {
  if (ceremonyNumber && ceremonyNumber > 0) {
    return `${year}年（第${ceremonyNumber}回）`;
  }

  return `${year}年`;
};

const formatDate = (value: number | null) => {
  if (typeof value !== 'number') {
    return;
  }

  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return;
  }

  return date.toLocaleDateString('ja-JP');
};

export const formatDateRange = (
  startDate: number | null,
  endDate: number | null,
) => {
  const startText = formatDate(startDate);
  const endText = formatDate(endDate);

  if (startText && endText) {
    return `${startText} 〜 ${endText}`;
  }

  return startText ?? endText ?? '-';
};

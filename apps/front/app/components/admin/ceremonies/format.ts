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

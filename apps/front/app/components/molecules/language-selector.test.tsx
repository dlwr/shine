import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {LanguageSelector} from './language-selector';

describe('LanguageSelector', () => {
  it('見えている文字を読み上げ名に含める', () => {
    render(<LanguageSelector locale="ja" />);

    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('aria-label')).toContain(link.textContent);
    }
  });

  it('選択中の言語に aria-current を付ける', () => {
    render(<LanguageSelector locale="ja" />);

    expect(screen.getByText('JA')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('EN')).not.toHaveAttribute('aria-current');
  });
});

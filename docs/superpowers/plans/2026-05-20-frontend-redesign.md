# フロントエンド刷新（Editorial Brutalist Cinema）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SHINE の公開3ページ（ホーム/映画詳細/検索）を「Editorial Brutalist Cinema」テーマで全面刷新し、ライト/ダーク両対応・WCAG AA・モーション対応で実装する。

**Architecture:** 共通基盤（CSS デザイントークン・フォント・ダークモード配線・モーション）を先に固め、その上に `apps/front/app/components/editorial/` の単一責務プリミティブ群を TDD で積み上げ、最後に各公開ルートを再構築する。管理画面（`admin.*`）は shadcn/ui のまま据え置く。

**Tech Stack:** React Router v7 (SSR / Cloudflare Workers), Tailwind CSS v4, Vitest + React Testing Library, TypeScript (strict), xo (lint)。

**設計の正典:** `docs/superpowers/specs/2026-05-20-frontend-redesign-design.md`

---

## 前提・規約

- 作業ディレクトリは常に `apps/front`。テストは `pnpm run test:front`（リポジトリルートから）。
- 各タスク完了時に `pnpm lint:fix && pnpm check`（ルート）を通すこと（CLAUDE.local.md）。
- xo を linter とする。Prettier は使わない。
- パスエイリアス `@/` = `apps/front/app/`。
- コミットは意味単位で分割（CLAUDE.md）。各タスク末尾でコミット。
- TDD（t_wada 流）: テスト→失敗確認→最小実装→成功確認→コミット。

## ブランチ

- [ ] **作業ブランチを作成**

```bash
git switch -c feature/editorial-redesign
```

## ファイル構成（このプランで触るもの）

新規:
- `apps/front/app/styles/tokens.css` — デザイントークン（light/dark）。`app.css` から `@import`。
- `apps/front/app/styles/motion.css` — キーフレーム＋`prefers-reduced-motion`。
- `apps/front/app/lib/theme.ts` — テーマ判定/適用ロジック（no-flash スクリプト文字列・toggle）。
- `apps/front/app/components/editorial/meta-line.tsx`
- `apps/front/app/components/editorial/big-year.tsx`
- `apps/front/app/components/editorial/poster-frame.tsx`
- `apps/front/app/components/editorial/award-tree.tsx`
- `apps/front/app/components/editorial/watch-menu.tsx`
- `apps/front/app/components/editorial/film-card.tsx`
- `apps/front/app/components/editorial/search-row.tsx`
- `apps/front/app/components/editorial/masthead.tsx`
- `apps/front/app/components/editorial/theme-toggle.tsx`
- 各 `*.test.tsx`（同階層）
- `apps/front/public/fonts/` — self-host フォント。

変更:
- `apps/front/app/app.css` — トークン/モーション import、`@theme` マッピング更新。
- `apps/front/app/root.tsx` — フォント preload、no-flash スクリプト、`bg-gray-50` 撤去。
- `apps/front/app/routes/home.tsx` ＋ `home.test.tsx`
- `apps/front/app/routes/movies.$id.tsx` ＋ `movies.$id.test.tsx`
- `apps/front/app/routes/search.tsx` ＋ `search.test.tsx`

据え置き: `apps/front/app/components/ui/*`、`admin.*` ルート＋テスト、`molecules/movie-card.tsx`（ロジックは流用するが新 `FilmCard` 完成までは残置）。

---

# フェーズ1：基盤

### Task 1: デザイントークン（light/dark）

**Files:**
- Create: `apps/front/app/styles/tokens.css`
- Modify: `apps/front/app/app.css`（先頭付近の `@import` と `@theme inline` ブロック）

- [ ] **Step 1: トークン CSS を作成**

`apps/front/app/styles/tokens.css`:

```css
:root {
  --paper: #ECE8DF;
  --surface: #FFFFFF;
  --ink: #15140F;
  --ink-muted: #595650;
  --accent: #E01E10;
  --accent-on: #FFFFFF;
  --border-w: 3px;
  --border-w-sub: 2px;
  --shadow-offset: 6px 6px 0 var(--accent);
  --shadow-offset-sm: 5px 5px 0 var(--accent);
  --poster-bg: linear-gradient(160deg, #2a2330, #0e0d12);
  --poster-glow: transparent;
}

.dark {
  --paper: #18181D;
  --surface: #202027;
  --ink: #EDEAE3;
  --ink-muted: #A8A8A2;
  --accent: #FF453A;
  --accent-on: #15140F;
  --poster-bg: linear-gradient(160deg, #3a2f1c, #0e0d12);
  --poster-glow: radial-gradient(circle, rgba(255, 233, 180, 0.28), transparent 70%);
}
```

注: アクセントは light=`#E01E10`（白文字とのコントラスト確保のため B 案モックの `#FF3B30` より暗くする）、dark=`#FF453A`。AA 検証は Task 18 で行う。

- [ ] **Step 2: app.css から import し theme マッピングを追加**

`apps/front/app/app.css` の先頭を以下に変更（既存の `@import 'tailwindcss';` と `@import 'tw-animate-css';` の直後に追記）:

```css
@import 'tailwindcss';
@import 'tw-animate-css';
@import './styles/tokens.css';
@import './styles/motion.css';

@custom-variant dark (&:is(.dark *));
```

`@theme inline` ブロック内に Editorial トークンを Tailwind ユーティリティ化する行を追加:

```css
@theme inline {
  --color-paper: var(--paper);
  --color-surface: var(--surface);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-accent: var(--accent);
  --color-accent-on: var(--accent-on);
  /* （既存の shadcn トークン行はそのまま残す） */
}
```

- [ ] **Step 3: ビルドが壊れないことを確認**

Run: `pnpm --filter @shine/front run typecheck`（または ルートで `pnpm check`）
Expected: 既存と同じくグリーン（`motion.css` は Task 4 で作るため、このタスクでは先に空ファイルを作っておく → 次ステップ）

- [ ] **Step 4: motion.css を空で先行作成（import 解決のため）**

`apps/front/app/styles/motion.css`:

```css
/* motion keyframes are added in Task 4 */
```

- [ ] **Step 5: Commit**

```bash
git add apps/front/app/styles/tokens.css apps/front/app/styles/motion.css apps/front/app/app.css
git commit -m "feat(front): Editorial デザイントークン（light/dark）を追加"
```

---

### Task 2: フォントの self-host と preload

**Files:**
- Create: `apps/front/public/fonts/`（Space Grotesk と等幅フォントの woff2 を配置）
- Modify: `apps/front/app/styles/tokens.css`（`@font-face` と family 変数）、`apps/front/app/root.tsx`（preload links）

- [ ] **Step 1: フォントファイルを配置**

`Space Grotesk`（表示用グロテスク）と `JetBrains Mono`（等幅）の可変 woff2 を `apps/front/public/fonts/` に置く。
配置: `space-grotesk.woff2`, `jetbrains-mono.woff2`。
（取得元: それぞれ OFL。woff2 を `public/fonts/` にコピー。）

- [ ] **Step 2: @font-face とファミリー変数を追加**

`apps/front/app/styles/tokens.css` の末尾に追記:

```css
@font-face {
  font-family: 'Space Grotesk';
  src: url('/fonts/space-grotesk.woff2') format('woff2');
  font-weight: 300 700;
  font-display: optional;
}

@font-face {
  font-family: 'JetBrains Mono';
  src: url('/fonts/jetbrains-mono.woff2') format('woff2');
  font-weight: 400 700;
  font-display: optional;
}

:root {
  --font-display: 'Space Grotesk', 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'JetBrains Mono', 'Courier New', monospace;
  --font-body: 'Inter', system-ui, sans-serif;
}
```

`app.css` の `@theme inline` に追加:

```css
  --font-display: var(--font-display);
  --font-mono: var(--font-mono);
```

- [ ] **Step 3: root.tsx に preload を追加**

`apps/front/app/root.tsx` の `links` 関数へ、Inter の Google Fonts link は残しつつ追記:

```ts
  {
    rel: 'preload',
    href: '/fonts/space-grotesk.woff2',
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'preload',
    href: '/fonts/jetbrains-mono.woff2',
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous',
  },
```

- [ ] **Step 4: ビルド確認**

Run: `pnpm --filter @shine/front run build`
Expected: 成功。`/fonts/*.woff2` が client assets に含まれる。

- [ ] **Step 5: Commit**

```bash
git add apps/front/public/fonts apps/front/app/styles/tokens.css apps/front/app/app.css apps/front/app/root.tsx
git commit -m "feat(front): 表示用グロテスク/等幅フォントを self-host し preload"
```

---

### Task 3: ダークモード配線（theme.ts + ThemeToggle + no-flash）

**Files:**
- Create: `apps/front/app/lib/theme.ts`, `apps/front/app/components/editorial/theme-toggle.tsx`, `apps/front/app/components/editorial/theme-toggle.test.tsx`
- Modify: `apps/front/app/root.tsx`

- [ ] **Step 1: theme.ts の失敗テストを書く**

`apps/front/app/lib/theme.test.ts`:

```ts
import {describe, it, expect, beforeEach, vi} from 'vitest';
import {resolveTheme, applyTheme, THEME_KEY} from './theme';

describe('resolveTheme', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('保存済みの値を優先する', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    expect(resolveTheme(false)).toBe('dark');
  });

  it('保存が無ければ OS 設定に追従する', () => {
    expect(resolveTheme(true)).toBe('dark');
    expect(resolveTheme(false)).toBe('light');
  });
});

describe('applyTheme', () => {
  it('dark を html クラスに付与し localStorage に保存する', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('light で dark クラスを外す', () => {
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `pnpm run test:front -- theme.test`
Expected: FAIL（`./theme` が存在しない）

- [ ] **Step 3: theme.ts を実装**

`apps/front/app/lib/theme.ts`:

```ts
export type Theme = 'light' | 'dark';
export const THEME_KEY = 'shine-theme';

export function resolveTheme(prefersDark: boolean): Theme {
  if (globalThis.localStorage) {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  }

  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(THEME_KEY, theme);
}

export const NO_FLASH_SCRIPT = `(function(){try{var k='${THEME_KEY}';var s=localStorage.getItem(k);var d=s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
```

- [ ] **Step 4: 成功確認**

Run: `pnpm run test:front -- theme.test`
Expected: PASS

- [ ] **Step 5: ThemeToggle の失敗テストを書く**

`apps/front/app/components/editorial/theme-toggle.test.tsx`:

```tsx
import {describe, it, expect, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import '@testing-library/jest-dom';
import {ThemeToggle} from './theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('クリックで dark/light をトグルし html クラスへ反映する', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', {name: /theme/i});
    fireEvent.click(button);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fireEvent.click(button);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('aria-pressed で状態を伝える', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', {name: /theme/i});
    expect(button).toHaveAttribute('aria-pressed');
  });
});
```

- [ ] **Step 6: 失敗確認 → 実装 → 成功確認**

Run: `pnpm run test:front -- theme-toggle` → FAIL

`apps/front/app/components/editorial/theme-toggle.tsx`:

```tsx
import {useEffect, useState} from 'react';
import {applyTheme, type Theme} from '@/lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      aria-pressed={theme === 'dark'}
      onClick={toggle}
      className="font-mono text-xs border-2 border-ink px-2 py-1 text-ink">
      {theme === 'dark' ? '☾ DARK' : '☀ LIGHT'}
    </button>
  );
}
```

Run: `pnpm run test:front -- theme-toggle` → PASS

- [ ] **Step 7: root.tsx に no-flash スクリプトを差し込み、body の bg を撤去**

`apps/front/app/root.tsx`:
- `import {NO_FLASH_SCRIPT} from '@/lib/theme';`
- `<head>` 内（`<Meta />` の前）に `<script dangerouslySetInnerHTML={{__html: NO_FLASH_SCRIPT}} />` を追加。
- `<body className="m-0 w-full h-full bg-gray-50">` を `<body className="m-0 w-full h-full bg-paper text-ink font-body">` に変更。

- [ ] **Step 8: Commit**

```bash
git add apps/front/app/lib/theme.ts apps/front/app/lib/theme.test.ts apps/front/app/components/editorial/theme-toggle.tsx apps/front/app/components/editorial/theme-toggle.test.tsx apps/front/app/root.tsx
git commit -m "feat(front): ダークモード配線（OS追従＋手動トグル＋フラッシュ防止）"
```

---

### Task 4: モーション（キーフレーム＋reduced-motion）

**Files:**
- Modify: `apps/front/app/styles/motion.css`

- [ ] **Step 1: motion.css を実装**

`apps/front/app/styles/motion.css`:

```css
@keyframes editorial-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

.anim-rise {
  animation: editorial-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.anim-rise-1 { animation-delay: 0.06s; }
.anim-rise-2 { animation-delay: 0.12s; }
.anim-rise-3 { animation-delay: 0.18s; }

.poster-glow-target { transition: transform 0.3s ease, filter 0.3s ease; }

@media (prefers-reduced-motion: reduce) {
  .anim-rise,
  .anim-rise-1,
  .anim-rise-2,
  .anim-rise-3 {
    animation: none !important;
  }

  .poster-glow-target { transition: none !important; }
}
```

- [ ] **Step 2: ビルド確認**

Run: `pnpm --filter @shine/front run build`
Expected: 成功

- [ ] **Step 3: Commit**

```bash
git add apps/front/app/styles/motion.css
git commit -m "feat(front): モーション基盤（rise/glow）と reduced-motion 対応"
```

---

# フェーズ2：Editorial プリミティブ

各プリミティブは `apps/front/app/components/editorial/` に置く。SSR セーフ（`window` 直参照は effect 内のみ）。

### Task 5: MetaLine（等幅メタ情報行）

**Files:**
- Create: `apps/front/app/components/editorial/meta-line.tsx`, `meta-line.test.tsx`

- [ ] **Step 1: 失敗テスト**

```tsx
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {MetaLine} from './meta-line';

describe('MetaLine', () => {
  it('items を中黒区切りで描画する', () => {
    render(<MetaLine items={['FRANK DARABONT', 'USA', '142MIN']} />);
    expect(screen.getByText(/FRANK DARABONT/)).toBeInTheDocument();
    expect(screen.getByText(/142MIN/)).toBeInTheDocument();
  });

  it('空配列なら何も描画しない', () => {
    const {container} = render(<MetaLine items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗確認** — `pnpm run test:front -- meta-line` → FAIL

- [ ] **Step 3: 実装**

```tsx
type MetaLineProperties = {
  items: string[];
  className?: string;
};

export function MetaLine({items, className = ''}: MetaLineProperties) {
  if (items.length === 0) {
    return null;
  }

  return (
    <p className={`font-mono text-xs text-ink-muted ${className}`}>
      {items.join(' · ')}
    </p>
  );
}
```

- [ ] **Step 4: 成功確認** — `pnpm run test:front -- meta-line` → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(front): MetaLine プリミティブ"`

---

### Task 6: BigYear（巨大年号＋カウントアップ）

**Files:**
- Create: `apps/front/app/components/editorial/big-year.tsx`, `big-year.test.tsx`

- [ ] **Step 1: 失敗テスト**

```tsx
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {BigYear} from './big-year';

describe('BigYear', () => {
  it('年号を描画し下2桁をアクセント色要素にする', () => {
    render(<BigYear year={1994} />);
    expect(screen.getByText('19')).toBeInTheDocument();
    const accent = screen.getByText('94');
    expect(accent).toHaveClass('text-accent');
  });

  it('year 未指定なら何も描画しない', () => {
    const {container} = render(<BigYear />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗確認** — FAIL

- [ ] **Step 3: 実装**

```tsx
type BigYearProperties = {
  year?: number;
  className?: string;
};

export function BigYear({year, className = ''}: BigYearProperties) {
  if (!year) {
    return null;
  }

  const text = String(year);
  const head = text.slice(0, Math.max(0, text.length - 2));
  const tail = text.slice(Math.max(0, text.length - 2));

  return (
    <div
      className={`font-display font-black leading-[0.78] tracking-[-0.06em] ${className}`}
      aria-label={text}>
      <span>{head}</span>
      <span className="text-accent">{tail}</span>
    </div>
  );
}
```

注: カウントアップ演出は装飾。`prefers-reduced-motion` 時は無効。最小実装ではアニメーションなしで描画し、必要なら後続で `anim-rise` を付与（数値カウントアップは JS で実装する場合も effect 内・reduced-motion チェック必須）。本タスクでは静的表示で完了とする。

- [ ] **Step 4: 成功確認** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(front): BigYear プリミティブ"`

---

### Task 7: PosterFrame（枠＋影＋発光）

**Files:**
- Create: `apps/front/app/components/editorial/poster-frame.tsx`, `poster-frame.test.tsx`
- 参照: `apps/front/app/lib/poster.ts`（`selectBestPoster`, `PosterInfo`）

- [ ] **Step 1: 失敗テスト**

```tsx
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {PosterFrame} from './poster-frame';

describe('PosterFrame', () => {
  it('posterUrl があれば img を描画する', () => {
    render(<PosterFrame posterUrl="https://x/p.jpg" alt="Parasite poster" />);
    const img = screen.getByAltText('Parasite poster');
    expect(img).toHaveAttribute('src', 'https://x/p.jpg');
  });

  it('posterUrl が無ければプレースホルダを描画する', () => {
    render(<PosterFrame alt="No poster" placeholderLabel="ポスターなし" />);
    expect(screen.getByText('ポスターなし')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 失敗確認** — FAIL

- [ ] **Step 3: 実装**

```tsx
type PosterFrameProperties = {
  posterUrl?: string;
  alt: string;
  placeholderLabel?: string;
  className?: string;
};

export function PosterFrame({
  posterUrl,
  alt,
  placeholderLabel = 'No Poster',
  className = '',
}: PosterFrameProperties) {
  return (
    <div className={`relative ${className}`}>
      <div
        aria-hidden
        className="absolute -inset-3 blur-lg"
        style={{background: 'var(--poster-glow)'}}
      />
      <div
        className="poster-glow-target relative aspect-2/3 border-2 border-ink overflow-hidden"
        style={{background: 'var(--poster-bg)'}}>
        {posterUrl ? (
          <img src={posterUrl} alt={alt} className="w-full h-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-xs text-ink-muted">
            {placeholderLabel}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 成功確認** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(front): PosterFrame プリミティブ"`

---

### Task 8: AwardTree（受賞ツリー）

**Files:**
- Create: `apps/front/app/components/editorial/award-tree.tsx`, `award-tree.test.tsx`
- 参照: `molecules/movie-card.tsx` の `MovieCardNomination` 型定義（同じ形を使う）

- [ ] **Step 1: 型を定義し失敗テストを書く**

`award-tree.test.tsx`:

```tsx
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {AwardTree, type AwardNomination} from './award-tree';

const noms: AwardNomination[] = [
  {
    uid: 'n1',
    isWinner: true,
    category: {name: 'Best Actor'},
    ceremony: {uid: 'c1', year: 1995},
    organization: {uid: 'o1', name: 'Academy Awards', shortName: 'Oscars'},
  },
  {
    uid: 'n2',
    isWinner: false,
    category: {name: 'Best Picture'},
    ceremony: {uid: 'c1', year: 1995},
    organization: {uid: 'o1', name: 'Academy Awards', shortName: 'Oscars'},
  },
];

describe('AwardTree', () => {
  it('組織ヘッダとカテゴリ行を描画する', () => {
    render(<AwardTree nominations={noms} />);
    expect(screen.getByText(/Oscars|Academy Awards/)).toBeInTheDocument();
    expect(screen.getByText('Best Actor')).toBeInTheDocument();
  });

  it('受賞は WINNER、ノミネートは NOMINEE バッジを出す', () => {
    render(<AwardTree nominations={noms} />);
    expect(screen.getByText(/WINNER/)).toBeInTheDocument();
    expect(screen.getByText(/NOMINEE/)).toBeInTheDocument();
  });

  it('nominations 空なら何も描画しない', () => {
    const {container} = render(<AwardTree nominations={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗確認** — FAIL

- [ ] **Step 3: 実装**

```tsx
export type AwardNomination = {
  uid: string;
  isWinner: boolean;
  category: {name: string};
  ceremony: {uid: string; year: number; number?: number};
  organization: {uid: string; name: string; shortName?: string};
};

type Grouped = {
  organization: AwardNomination['organization'];
  ceremonies: Record<string, {ceremony: AwardNomination['ceremony']; items: AwardNomination[]}>;
};

export function AwardTree({nominations}: {nominations: AwardNomination[]}) {
  if (nominations.length === 0) {
    return null;
  }

  const byOrg: Record<string, Grouped> = {};
  for (const nomination of nominations) {
    const orgKey = nomination.organization.uid;
    byOrg[orgKey] ||= {organization: nomination.organization, ceremonies: {}};
    const ceremonyKey = nomination.ceremony.uid;
    byOrg[orgKey].ceremonies[ceremonyKey] ||= {
      ceremony: nomination.ceremony,
      items: [],
    };
    byOrg[orgKey].ceremonies[ceremonyKey].items.push(nomination);
  }

  return (
    <div className="border-2 border-ink">
      {Object.values(byOrg).map(group =>
        Object.values(group.ceremonies).map(({ceremony, items}) => (
          <div key={`${group.organization.uid}-${ceremony.uid}`}>
            <div className="bg-ink text-paper font-display font-extrabold text-xs px-3 py-1">
              {(group.organization.shortName || group.organization.name).toUpperCase()} · {ceremony.year}
            </div>
            {items.map(nomination => (
              <div
                key={nomination.uid}
                className="flex items-center justify-between px-3 py-1.5 text-sm border-b border-ink/20 last:border-b-0">
                <span>{nomination.category.name}</span>
                {nomination.isWinner ? (
                  <span className="font-mono text-[10px] bg-accent text-accent-on px-1.5 py-0.5">
                    ★ WINNER
                  </span>
                ) : (
                  <span className="font-mono text-[10px] border border-ink-muted px-1.5 py-0.5">
                    NOMINEE
                  </span>
                )}
              </div>
            ))}
          </div>
        )),
      )}
    </div>
  );
}
```

- [ ] **Step 4: 成功確認** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(front): AwardTree プリミティブ"`

---

### Task 9: WatchMenu（配信メニュー・ブランド色維持）

**Files:**
- Create: `apps/front/app/components/editorial/watch-menu.tsx`, `watch-menu.test.tsx`
- 参照: 現行 `molecules/movie-card.tsx` の `streamingServices` 定義（U-NEXT/Prime/Filmarks/JustWatch/TMDb/IMDb/Google/TSUTAYA）をそのまま移植

- [ ] **Step 1: 失敗テスト**

```tsx
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {WatchMenu} from './watch-menu';

describe('WatchMenu', () => {
  it('主要サービスのリンクをタイトル入りで描画する', () => {
    render(<WatchMenu title="Parasite" year={2019} locale="ja" />);
    const unext = screen.getByRole('link', {name: /U-NEXT/});
    expect(unext).toHaveAttribute('href', expect.stringContaining('Parasite'));
    expect(screen.getByRole('link', {name: /IMDb/})).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 失敗確認** — FAIL

- [ ] **Step 3: 実装**

ブランド色は各サービスの `color` クラス（`bg-black text-white` 等）を維持し、共通ラッパとして `border-2 border-ink shadow-[2px_2px_0_var(--ink)]` を付与する。サービス配列・URL 生成は現行 `movie-card.tsx` から移植。

```tsx
type WatchMenuProperties = {
  title: string;
  year?: number;
  locale?: string;
  tmdbId?: string | number;
  imdbUrl?: string;
  discasTitle?: string;
};

export function WatchMenu({title, year, locale = 'en', tmdbId, imdbUrl, discasTitle}: WatchMenuProperties) {
  const services = [
    {name: 'U-NEXT', color: 'bg-black text-white', url: `https://video.unext.jp/freeword?query=${encodeURIComponent(title)}`},
    {name: 'Amazon Prime', color: 'bg-blue-600 text-white', url: `https://www.amazon.co.jp/s?k=${encodeURIComponent(title)}&i=instant-video`},
    {name: 'TMDb', color: 'bg-green-600 text-white', url: tmdbId ? `https://www.themoviedb.org/movie/${tmdbId}` : `https://www.themoviedb.org/search?query=${encodeURIComponent(title)}`},
    {name: 'Filmarks', color: 'bg-purple-600 text-white', url: `https://filmarks.com/search/movies?q=${encodeURIComponent(title)}`},
    {name: 'JustWatch', color: 'bg-yellow-400 text-gray-900', url: `https://www.justwatch.com/jp/検索?q=${encodeURIComponent(title)}`},
    {name: 'IMDb', color: 'bg-yellow-500 text-gray-900', url: imdbUrl || `https://www.imdb.com/find?q=${encodeURIComponent(`${title} ${year ?? ''}`)}`},
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {services.map(service => (
        <a
          key={service.name}
          href={service.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`font-mono text-[10px] font-bold px-2 py-1 border-2 border-ink shadow-[2px_2px_0_var(--ink)] ${service.color}`}>
          {service.name}
        </a>
      ))}
    </div>
  );
}
```

注: `discasTitle`（TSUTAYA DISCAS の Shift_JIS フォーム）が必要なら現行実装のフォームも移植する。最小実装ではリンク群のみ。詳細ページの既存挙動（ホバー展開）は Task 12/14 で `FilmCard`/詳細に組み込む。

- [ ] **Step 4: 成功確認** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(front): WatchMenu プリミティブ（ブランド色維持・枠影統一）"`

---

### Task 10: FilmCard（セレクション/詳細用カード）

**Files:**
- Create: `apps/front/app/components/editorial/film-card.tsx`, `film-card.test.tsx`
- 参照/流用: `molecules/movie-card.tsx` の `selectBestTitle`、`lib/poster.ts` の `selectBestPoster`

- [ ] **Step 1: 失敗テスト**

```tsx
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {FilmCard, type FilmCardMovie} from './film-card';

const movie: FilmCardMovie = {
  uid: 'm1',
  title: 'PARASITE',
  year: 2019,
  posterUrl: 'https://x/p.jpg',
  nominations: [],
};

describe('FilmCard', () => {
  it('hero variant でタイトル・年号・ポスターを描画する', () => {
    render(<FilmCard movie={movie} variant="hero" locale="en" />);
    expect(screen.getByText('PARASITE')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(screen.getByAltText(/PARASITE/)).toBeInTheDocument();
  });

  it('compact variant でもタイトルと年号を描画する', () => {
    render(<FilmCard movie={movie} variant="compact" locale="en" />);
    expect(screen.getByText('PARASITE')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 失敗確認** — FAIL

- [ ] **Step 3: 実装**

`BigYear`, `PosterFrame`, `MetaLine`, `AwardTree` を合成。`selectBestTitle` は `molecules/movie-card.tsx` から共有（必要なら `lib/movie-title.ts` に切り出して双方から import — 切り出す場合は別ステップでリファクタ）。`variant='hero'` は枠 `border-[3px] border-ink shadow-[var(--shadow-offset-sm)]`、横並び（ポスター＋年号/タイトル/メタ/受賞チップ）。`variant='compact'` は縦帯ラベル＋年号＋タイトル。

```tsx
import {BigYear} from './big-year';
import {PosterFrame} from './poster-frame';
import {MetaLine} from './meta-line';
import {selectBestPoster, type PosterInfo} from '@/lib/poster';

export type FilmCardMovie = {
  uid: string;
  title?: string;
  year?: number;
  posterUrl?: string;
  posterUrls?: PosterInfo[];
  translations?: Array<{languageCode: string; content: string; isDefault: number}>;
  nominations?: Array<{uid: string; isWinner: boolean; category: {name: string}}>;
};

function pickTitle(movie: FilmCardMovie, locale: string): string {
  if (movie.title) return movie.title;
  const translations = movie.translations ?? [];
  const code = locale.split('-')[0];
  return (
    translations.find(t => t.languageCode === code)?.content ??
    translations.find(t => t.isDefault === 1)?.content ??
    translations[0]?.content ??
    'Unknown Title'
  );
}

export function FilmCard({
  movie,
  variant,
  locale = 'en',
}: {
  movie: FilmCardMovie;
  variant: 'hero' | 'compact';
  locale?: string;
}) {
  const title = pickTitle(movie, locale);
  const posterUrl =
    movie.posterUrls && movie.posterUrls.length > 0
      ? selectBestPoster(movie.posterUrls, locale)
      : movie.posterUrl;

  if (variant === 'compact') {
    return (
      <a href={`/movies/${movie.uid}`} className="block border-[3px] border-ink/40 bg-surface p-3">
        <BigYear year={movie.year} className="text-4xl" />
        <div className="font-display font-black text-base tracking-tight mt-1">{title}</div>
      </a>
    );
  }

  return (
    <a
      href={`/movies/${movie.uid}`}
      className="flex gap-4 border-[3px] border-ink bg-surface p-4 shadow-[var(--shadow-offset-sm)]">
      <PosterFrame posterUrl={posterUrl} alt={`${title} poster`} className="w-28 shrink-0" />
      <div className="flex flex-col justify-between">
        <BigYear year={movie.year} className="text-6xl" />
        <div>
          <div className="font-display font-black text-xl tracking-tight leading-none">{title}</div>
        </div>
      </div>
    </a>
  );
}
```

- [ ] **Step 4: 成功確認** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(front): FilmCard プリミティブ"`

---

### Task 11: SearchRow（検索結果行）

**Files:**
- Create: `apps/front/app/components/editorial/search-row.tsx`, `search-row.test.tsx`

- [ ] **Step 1: 失敗テスト**

```tsx
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {SearchRow} from './search-row';

describe('SearchRow', () => {
  it('年号・タイトルを描画し詳細へリンクする', () => {
    render(
      <SearchRow movie={{uid: 'm1', title: 'PARASITE', year: 2019}} locale="en" />,
    );
    const link = screen.getByRole('link', {name: /PARASITE/});
    expect(link).toHaveAttribute('href', '/movies/m1');
    expect(screen.getByText('19')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 失敗確認** — FAIL

- [ ] **Step 3: 実装**

```tsx
import {BigYear} from './big-year';
import {PosterFrame} from './poster-frame';

export type SearchRowMovie = {
  uid: string;
  title?: string;
  year?: number;
  posterUrl?: string;
  hasWinner?: boolean;
  translations?: Array<{languageCode: string; content: string; isDefault: number}>;
};

export function SearchRow({movie, locale = 'en'}: {movie: SearchRowMovie; locale?: string}) {
  const title =
    movie.title ??
    movie.translations?.find(t => t.languageCode === locale.split('-')[0])?.content ??
    movie.translations?.[0]?.content ??
    'Unknown Title';

  return (
    <a
      href={`/movies/${movie.uid}`}
      className="flex items-center gap-3 py-2 border-t-2 border-ink no-underline text-ink">
      <BigYear year={movie.year} className="text-2xl w-14 shrink-0" />
      <PosterFrame posterUrl={movie.posterUrl} alt={`${title} poster`} className="w-9 shrink-0" />
      <span className="flex-1 font-display font-extrabold text-sm leading-none">{title}</span>
      {movie.hasWinner ? (
        <span className="font-mono text-[9px] bg-accent text-accent-on px-1.5 py-0.5">★</span>
      ) : null}
    </a>
  );
}
```

- [ ] **Step 4: 成功確認** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(front): SearchRow プリミティブ"`

---

### Task 12: Masthead（マストヘッド）

**Files:**
- Create: `apps/front/app/components/editorial/masthead.tsx`, `masthead.test.tsx`
- 参照: `molecules/language-selector.tsx`（言語切替を内包）、`ThemeToggle`

- [ ] **Step 1: 失敗テスト**

```tsx
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import {Masthead} from './masthead';

describe('Masthead', () => {
  it('SHINE を h1 で、検索リンクとテーマトグルを描画する', () => {
    render(<Masthead locale="en" />);
    expect(screen.getByRole('heading', {level: 1, name: 'SHINE'})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: /search/i})).toHaveAttribute('href', '/search');
    expect(screen.getByRole('button', {name: /theme/i})).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 失敗確認** — FAIL

- [ ] **Step 3: 実装**

```tsx
import {ThemeToggle} from './theme-toggle';
import {LanguageSelector} from '@/components/molecules/language-selector';

export function Masthead({locale = 'en'}: {locale?: string}) {
  return (
    <header className="flex items-end justify-between border-b-2 border-ink pb-2.5 mb-6">
      <h1 className="font-display font-black text-4xl md:text-5xl tracking-[-0.06em] leading-none text-ink">
        SHINE
      </h1>
      <div className="flex items-center gap-2">
        <LanguageSelector locale={locale} />
        <a
          href="/search"
          aria-label="Search"
          className="font-mono text-xs font-bold bg-accent text-accent-on px-2.5 py-1 border-2 border-ink shadow-[3px_3px_0_var(--ink)]">
          SEARCH
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
```

注: `LanguageSelector` が既存のスタイルを持つ場合、Masthead では最小限の見た目調整に留め、機能（locale 切替）は流用する。テストで型不整合があれば `locale` props を合わせる。

- [ ] **Step 4: 成功確認** — PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(front): Masthead プリミティブ"`

---

# フェーズ3：公開ページ再構築

各ページは「テスト書き直し → 実装」の順。ローダのロジック（fetch・locale 判定・SSR/CSR フォールバック）は現行を維持し、**描画部分のみ**新プリミティブへ置換する。

### Task 13: ホーム `/` 再構築

**Files:**
- Modify: `apps/front/app/routes/home.tsx`, `apps/front/app/routes/home.test.tsx`

- [ ] **Step 1: home.test.tsx を新構造へ書き直す**

ローダ系テスト（fetch 成功/失敗・locale 判定）は現行の期待を維持。コンポーネント描画テストを新 DOM に合わせて更新:
- `screen.getByRole('heading', {level: 1, name: 'SHINE'})` が存在する。
- 日替わり映画タイトル（`mockMovies.daily.title`）が描画される。
- 週/月のタイトルも描画される。
- テーマトグルボタンが存在する。

旧テストの「特定のクラス名・レイアウト構造」への依存は削除し、ロール/テキストベースの assertion にする。

- [ ] **Step 2: 失敗確認** — `pnpm run test:front -- home.test` → FAIL

- [ ] **Step 3: home.tsx の描画を再構築**

- ローダ・`Movies`/`ManualSelectionPanel` 等のデータ取得ロジックは残す。
- 最上部の `<div className="... bg-gray-50">` を撤去、`Masthead` を導入。
- `<h1>SHINE</h1>` を `Masthead` 内の h1 に一本化（重複 h1 を作らない）。
- 日替わりを `FilmCard variant="hero"`、週/月を `FilmCard variant="compact"` で描画。レイアウトは `md` 以上で「hero（flex 1.4）＋ 右に compact 2段」、モバイルは縦積み。
- 入場アニメは `anim-rise` / `anim-rise-1..3` を付与。
- 既存の管理者向け再抽選 UI（`ManualSelectionPanel`）はそのまま温存し、新デザインのボタン枠に合わせる。

- [ ] **Step 4: 成功確認** — `pnpm run test:front -- home.test` → PASS

- [ ] **Step 5: Commit**

```bash
git add apps/front/app/routes/home.tsx apps/front/app/routes/home.test.tsx
git commit -m "feat(front): ホームを Editorial デザインへ再構築"
```

---

### Task 14: 映画詳細 `/movies/:id` 再構築

**Files:**
- Modify: `apps/front/app/routes/movies.$id.tsx`, `apps/front/app/routes/movies.$id.test.tsx`

- [ ] **Step 1: movies.$id.test.tsx を書き直す**

ローダ系テストは維持。描画テストを新構造に:
- タイトル・年号（`BigYear`）が描画される。
- 受賞ツリー（`AwardTree`）に組織名・カテゴリ・WINNER/NOMINEE が出る。
- 配信メニュー（`WatchMenu`）に主要サービスリンクが出る。
- 投稿記事リンクが描画され、「リンクを追加」導線がある。
- ロール/テキストベースに変更。

- [ ] **Step 2: 失敗確認** — FAIL

- [ ] **Step 3: movies.$id.tsx の描画を再構築**

- ローダ（映画詳細 fetch・記事リンク・ポスター・翻訳）は維持。
- ヒーロー（`PosterFrame` + `BigYear` + タイトル + `MetaLine`[監督・国・尺]）。
- `AwardTree` で受賞表示。
- `WatchMenu` で配信（ブランド色維持・枠影統一。必要なら TSUTAYA フォームも移植）。
- 記事リンクは赤の縦罫リスト＋「+ リンクを追加」。既存の投稿フォーム／レート制限挙動は不変。

- [ ] **Step 4: 成功確認** — PASS

- [ ] **Step 5: Commit**

```bash
git add apps/front/app/routes/movies.\$id.tsx apps/front/app/routes/movies.\$id.test.tsx
git commit -m "feat(front): 映画詳細を Editorial デザインへ再構築"
```

---

### Task 15: 検索 `/search` 再構築

**Files:**
- Modify: `apps/front/app/routes/search.tsx`, `apps/front/app/routes/search.test.tsx`

- [ ] **Step 1: search.test.tsx を書き直す**

ローダ/検索ロジックのテストは維持。描画テストを新構造に:
- 見出し `SEARCH` が出る。
- 検索入力（`textbox`）と GO ボタンがある。
- 結果が `SearchRow` 群（年号＋タイトル＋詳細リンク）で描画される。
- 件数表示が出る。
- フィルターは**現行と同じ項目**のみ（新規追加しない）。

- [ ] **Step 2: 失敗確認** — FAIL

- [ ] **Step 3: search.tsx の描画を再構築**

- 検索ロジック（デバウンス・API 呼び出し・状態管理）は維持。
- 極太枠＋赤影の検索窓、黒 `GO`。
- フィルターは等幅チップ（現行項目に対応）。
- 結果は `SearchRow` のリスト（行間 2px 罫線）。件数を等幅表示。

- [ ] **Step 4: 成功確認** — PASS

- [ ] **Step 5: Commit**

```bash
git add apps/front/app/routes/search.tsx apps/front/app/routes/search.test.tsx
git commit -m "feat(front): 検索を Editorial デザインへ再構築"
```

---

# フェーズ4：仕上げ・検証

### Task 16: 旧 MovieCard の整理

**Files:**
- Modify/Delete: `apps/front/app/components/molecules/movie-card.tsx`, `movie-card.test.tsx`

- [ ] **Step 1: 参照を確認**

Run: `grep -rn "movie-card" apps/front/app --include=*.tsx | grep -v editorial`
Expected: 公開ページからの参照が無いこと（あれば `FilmCard` に置換）。

- [ ] **Step 2: 共有ロジックの切り出し（必要時）**

`selectBestTitle` 等を `FilmCard` と共有するため `apps/front/app/lib/movie-title.ts` に切り出していない場合は、重複を避けるためここで切り出し、両者から import する。

- [ ] **Step 3: 未使用になった `movie-card.tsx` / `movie-card.test.tsx` を削除**

公開ページから参照されず、admin も使っていなければ削除。使われていれば残置。

- [ ] **Step 4: テスト全体実行** — `pnpm run test:front` → PASS

- [ ] **Step 5: Commit** — `git commit -m "refactor(front): 旧 MovieCard を整理し共有ロジックを抽出"`

---

### Task 17: モバイル調整

**Files:**
- Modify: `home.tsx`, `movies.$id.tsx`, `search.tsx`（レスポンシブクラスのみ）

- [ ] **Step 1: モバイル幅での破綻を点検**

`pnpm run front:dev` を起動し、375px 幅で確認:
- 巨大年号がはみ出さない（`text-4xl md:text-6xl` 等でモバイル縮小）。
- hero＋2段積みがモバイルで縦積みになる。
- オフセット影が画面外にはみ出して横スクロールを生まない（`overflow-x` 制御）。

- [ ] **Step 2: レスポンシブクラスを調整**（`md:` ブレークポイントで分岐）

- [ ] **Step 3: 確認後にサーバを停止**（CLAUDE.local.md: 起動したら必ず止める）

- [ ] **Step 4: Commit** — `git commit -m "fix(front): モバイルでの巨大年号/レイアウト破綻を調整"`

---

### Task 18: アクセシビリティ・最終検証

- [ ] **Step 1: コントラスト検証（手動チェックリスト）**

light/dark 両方で、以下が WCAG AA を満たすか確認（コントラストチェッカー使用）:
- `--ink` on `--paper` / `--surface`（本文 4.5:1）
- `--ink-muted` on `--paper` / `--surface`（メタ情報 4.5:1）
- `--accent-on` on `--accent`（バッジ文字。大文字3:1）
- フォーカスリングの視認性

満たさない値があれば `tokens.css` を調整（例: accent をさらに暗く / muted を濃く）。

- [ ] **Step 2: reduced-motion 確認**

OS の「視差効果を減らす」を ON にして、入場アニメ・ポスター遷移が無効化されることを確認。

- [ ] **Step 3: ダークモード手動確認**

- 初回 OS 追従、トグルで切替、リロードで永続化、初期ロードでフラッシュしないこと。

- [ ] **Step 4: 全チェックを通す**

```bash
pnpm run test:front
pnpm lint:fix && pnpm check
```
Expected: 全 PASS / lint クリーン。

- [ ] **Step 5: Commit（調整があれば）** — `git commit -m "fix(front): a11y コントラスト/モーション最終調整"`

---

## 完了の定義（spec §12 と一致）

- [ ] 公開3ページが light/dark 両モードで新デザイン描画。
- [ ] OS追従＋手動トグル＋永続化＋フラッシュ防止が動作。
- [ ] 全配色 WCAG AA。
- [ ] `prefers-reduced-motion` でアニメ無効化。
- [ ] 公開ページテストが新構造で `pnpm run test:front` 通過。
- [ ] `pnpm lint:fix && pnpm check` クリーン。
- [ ] 管理画面が引き続き機能。

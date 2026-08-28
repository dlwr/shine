import {describe, expect, it} from 'vitest';
import {matchPersonName, normalizePersonName} from '../common/japanese-name';

describe('normalizePersonName', () => {
  it('空白を落とす', () => {
    expect(normalizePersonName('渡辺 謙')).toBe('渡辺謙');
  });

  it('全角空白も落とす', () => {
    expect(normalizePersonName('渡辺　謙')).toBe('渡辺謙');
  });

  it('互換漢字の崎を新字体に寄せる', () => {
    expect(normalizePersonName('山﨑努')).toBe(normalizePersonName('山崎努'));
  });

  it('旧字体の國を新字体に寄せる', () => {
    expect(normalizePersonName('三國連太郎')).toBe(
      normalizePersonName('三国連太郎'),
    );
  });

  it('旧字体の聰を新字体に寄せる', () => {
    expect(normalizePersonName('山村聰')).toBe(normalizePersonName('山村聡'));
  });

  it('旧字体の惠を新字体に寄せる', () => {
    expect(normalizePersonName('岸惠子')).toBe(normalizePersonName('岸恵子'));
  });

  it('異体字の彥を新字体に寄せる', () => {
    expect(normalizePersonName('西村雅彥')).toBe(
      normalizePersonName('西村雅彦'),
    );
  });

  it('別人の名前までは寄せない', () => {
    expect(normalizePersonName('渡辺謙')).not.toBe(
      normalizePersonName('渡辺裕之'),
    );
  });
});

describe('matchPersonName', () => {
  const candidates = new Map([
    [normalizePersonName('山崎努'), 'person-yamazaki'],
    [normalizePersonName('二代目 中村吉右衛門'), 'person-kichiemon'],
    [normalizePersonName('渡辺えり'), 'person-eri'],
  ]);

  it('表記を寄せた完全一致で引き当てる', () => {
    expect(matchPersonName('山﨑努', candidates)).toBe('person-yamazaki');
  });

  it('襲名の接頭辞が付いた候補を引き当てる', () => {
    expect(matchPersonName('中村吉右衛門', candidates)).toBe(
      'person-kichiemon',
    );
  });

  it('改名前の長い名前からも引き当てる', () => {
    expect(matchPersonName('渡辺えり子', candidates)).toBe('person-eri');
  });

  it('候補が2人以上あるときは引き当てない', () => {
    const ambiguous = new Map([
      [normalizePersonName('奥野瑛太'), 'a'],
      [normalizePersonName('永山瑛太'), 'b'],
    ]);

    expect(matchPersonName('瑛太', ambiguous)).toBeUndefined();
  });

  it('該当が無ければ undefined を返す', () => {
    expect(matchPersonName('存在しない人', candidates)).toBeUndefined();
  });

  it('短すぎる名前では部分一致させない', () => {
    expect(matchPersonName('努', candidates)).toBeUndefined();
  });
});

describe('normalizePersonName のラテン文字', () => {
  it('ダイアクリティカルマークを外す', () => {
    expect(normalizePersonName('Penélope Cruz')).toBe(
      normalizePersonName('Penelope Cruz'),
    );
  });

  it('大文字小文字を区別しない', () => {
    expect(normalizePersonName('Daniel Day-Lewis')).toBe(
      normalizePersonName('daniel day-lewis'),
    );
  });

  it('かなの濁点は保つ', () => {
    expect(normalizePersonName('がぎぐ')).toBe('がぎぐ');
  });
});

describe('normalizePersonName の記号', () => {
  it('ハイフンの有無を区別しない', () => {
    expect(normalizePersonName('Bong Joon-ho')).toBe(
      normalizePersonName('Bong Joon Ho'),
    );
  });

  it('ピリオドとアポストロフィを区別しない', () => {
    expect(normalizePersonName('H. B. Warner')).toBe(
      normalizePersonName('HB Warner'),
    );
    expect(normalizePersonName("Mo'Nique")).toBe(
      normalizePersonName('MoNique'),
    );
  });
});

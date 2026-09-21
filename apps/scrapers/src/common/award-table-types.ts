export type AwardTableOptions = {
  /** 回次リンクの記事名。[[22nd British Academy Film Awards|22nd]] なら 'British Academy Film Awards' */
  ceremonyPage?: string;
  /** 年セルに回次リンクが無い記事で、年から回次を求める */
  ceremonyNumberOf?: (year: number) => number | undefined;
  /** 受賞者を載せる節の見出し。省略時は Winners and nominees */
  sectionHeading?: RegExp;
  /** 受賞行の背景色。省略時は #FAEB86 */
  winnerBackground?: RegExp;
  /** 記事が受賞者だけを載せていて、背景色で受賞を判定しない */
  winnersOnly?: boolean;
  /** 人物セルに付くと別の賞の受賞者であることを示す印 */
  otherAwardMarker?: RegExp;
  /** 作品列の見出し。省略時は Film / Films */
  filmHeaders?: string[];
};

export type FilmAwardEntry = {
  filmPage: string | undefined;
  filmTitle: string;
  isWinner: boolean;
};

export type PersonAwardEntry = FilmAwardEntry & {
  personName: string;
};

export type AwardEdition<Entry extends FilmAwardEntry> = {
  /** 対象作品の公開年。年をまたぐ初期の回は最初の年 */
  filmYear: number;
  ceremonyNumber: number;
  entries: Entry[];
};

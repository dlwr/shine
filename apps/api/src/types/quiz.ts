export type QuizHint = {
  label: string;
  value: string;
};

export type QuizCandidate = {
  uid: string;
  title: string;
  year: number | undefined;
};

export type QuizAnswer = {
  uid: string;
  title: string;
  year: number | undefined;
  posterUrl: string;
  /** ポスターの拡大表示で中心に置く点。0〜1の相対座標 */
  focalX: number;
  focalY: number;
};

export type QuizGuessResult = {
  correct: boolean;
  hint?: QuizHint;
  answer?: QuizAnswer;
};

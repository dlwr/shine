export type ShiritoriEntry = {
  uid: string;
  title: string;
  year: number | undefined;
  first: string;
  last: string;
  watchable: boolean;
};

export type ShiritoriChain = {
  date: string;
  from: string | undefined;
  links: ShiritoriEntry[];
};

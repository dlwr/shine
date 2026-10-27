export type ConnectMovie = {
  uid: string;
  title: string;
  year: number | undefined;
};

export type ConnectRole = 'director' | 'cast' | 'director-and-cast';

export type ConnectLink = {
  person: {uid: string; name: string};
  role: ConnectRole;
  movie: ConnectMovie;
};

export type MovieConnection = {
  from: ConnectMovie;
  to: ConnectMovie;
  links: ConnectLink[] | undefined;
};

export type ConnectPick = {
  date: string;
  from: string;
  to: string;
};

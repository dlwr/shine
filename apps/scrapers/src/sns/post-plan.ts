export type PostPlan = {
  text: string;
  xText: string;
  link: {uri: string; title: string; description: string};
  imageUrl: string;
  afterPost?: () => Promise<void>;
};

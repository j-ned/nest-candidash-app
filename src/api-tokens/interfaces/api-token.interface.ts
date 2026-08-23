export interface ApiToken {
  id: string;
  userId: string;
  nomAffiche: string;
  createdAt: Date;
  derniereUtilisation?: Date;
}

export interface ApiTokenCreated extends ApiToken {
  token: string;
}

export interface ApiToken {
  id: string;
  nomAffiche: string;
  createdAt: Date;
  derniereUtilisation?: Date;
}

export interface ApiTokenCreated extends ApiToken {
  token: string;
}

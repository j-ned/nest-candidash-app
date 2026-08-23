import { ApiTokenRow } from '../../db/schema';
import { ApiToken } from '../interfaces';

export class ApiTokenMapper {
  static mapApiTokenToApiToken(row: ApiTokenRow): ApiToken {
    return {
      id: row.id,
      nomAffiche: row.nomAffiche,
      createdAt: row.createdAt,
      derniereUtilisation: row.derniereUtilisation ?? undefined,
    };
  }
}

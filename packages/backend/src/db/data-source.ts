import { DataSource } from 'typeorm';
import { config } from '../config';
import * as entities from './entities';
import { InitialSchema1788000000000 } from './migrations/1788000000000-InitialSchema';
import { AddCreditsRemaining1790000000000 } from './migrations/1790000000000-AddCreditsRemaining';

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: config.database.path,
  synchronize: false, // Schema is built/upgraded by migrations on startup
  migrationsRun: true,
  logging: config.env === 'development',
  entities: Object.values(entities),
  migrations: [InitialSchema1788000000000, AddCreditsRemaining1790000000000],
  subscribers: [],
});

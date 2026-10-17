import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User';
import { AIMode } from '@nommable/shared';

@Entity('ai_configs')
export class AIConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('varchar')
  provider!: string;

  @Column('varchar', { name: 'api_key', nullable: true })
  apiKey?: string; // Encrypted at rest (AES-256-GCM, see utils/crypto.ts)

  @Column('varchar', { nullable: true })
  model?: string;

  @Column('varchar', { name: 'image_model', nullable: true })
  imageModel?: string;

  @Column('varchar', { name: 'image_api_key', nullable: true })
  imageApiKey?: string;

  @Column('varchar', { name: 'base_url', nullable: true })
  baseUrl?: string;

  @Column('boolean', { default: true })
  enabled!: boolean;

  /**
   * True for the single instance-wide config managed by the admin AI panel.
   * Per-user (BYOK) rows have isGlobal = false and userId = the key owner's id.
   */
  @Column('boolean', { name: 'is_global', default: false })
  isGlobal!: boolean;

  /**
   * How AI keys are resolved for this instance. Only meaningful on the global row.
   * - 'shared': every user uses the admin-configured global key (default, legacy behavior).
   * - 'per-user': each user supplies their own key in Settings; there is NO fallback
   *   to the global key — users without a key get a friendly 403 on AI endpoints.
   */
  @Column('varchar', { name: 'ai_mode', default: 'shared' })
  aiMode!: AIMode;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => User, (user) => user.aiConfigs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}

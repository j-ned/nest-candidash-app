import { JobStatus, ContractType } from '../../../generated/prisma';
import { Reminder } from './reminder.interface';

export interface JobTrack {
  id: string;
  userId: string;
  title: string;
  company?: string;
  jobUrl?: string;
  appliedAt?: Date;
  status: JobStatus;
  contractType?: ContractType;
  notes?: string;
  cvFileName?: string;
  lmFileName?: string;
  reminder?: Reminder | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobTrackCreateData {
  title: string;
  company?: string;
  jobUrl?: string;
  appliedAt?: string;
  status?: JobStatus;
  contractType?: ContractType;
  notes?: string;
}

export interface JobTrackUpdateData {
  title?: string;
  company?: string;
  jobUrl?: string;
  appliedAt?: string;
  status?: JobStatus;
  contractType?: ContractType;
  notes?: string;
}

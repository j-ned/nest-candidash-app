import { ApiProperty } from '@nestjs/swagger';
import { JobStatus, ContractType } from '../../generated/prisma/enums.js';

export class JobTrackResponseDto {
  @ApiProperty({
    description: 'Identifiant unique du suivi de candidature',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description:
      'Identifiant de l’utilisateur propriétaire de ce suivi de candidature',
    example: '456e7890-e89b-12d3-a456-426614174001',
  })
  userId: string;

  @ApiProperty({
    description: 'Intitulé du poste ou nom de la fonction',
    example: 'Développeur Full Stack Senior',
  })
  title: string;

  @ApiProperty({
    description: 'Nom de l’entreprise',
    example: 'Tech Company Inc.',
    nullable: true,
  })
  company?: string;

  @ApiProperty({
    description: 'URL de l’offre d’emploi',
    example: 'https://exemple.com/jobs/developpeur',
    nullable: true,
  })
  jobUrl?: string;

  @ApiProperty({
    description: 'Date de soumission de la candidature',
    example: '2025-01-15T10:30:00.000Z',
    nullable: true,
  })
  appliedAt?: Date;

  @ApiProperty({
    description: 'Statut actuel de la candidature',
    enum: JobStatus,
    type: String,
    example: JobStatus.APPLIED,
  })
  status: JobStatus;

  @ApiProperty({
    description: 'Type de contrat proposé pour le poste',
    enum: ContractType,
    type: String,
    example: ContractType.CDI,
    nullable: true,
  })
  contractType?: ContractType;

  @ApiProperty({
    description: 'Notes supplémentaires concernant la candidature',
    example: 'Trouvé via LinkedIn, contact direct avec le recruteur',
    nullable: true,
  })
  notes?: string;

  @ApiProperty({
    description: 'Date de création du suivi de candidature',
    example: '2025-01-15T08:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Date de dernière mise à jour du suivi de candidature',
    example: '2025-01-15T14:20:00.000Z',
  })
  updatedAt: Date;
}

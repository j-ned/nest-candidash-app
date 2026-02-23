import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  MinLength,
} from 'class-validator';
import { JobStatus, ContractType } from '../../generated/prisma/enums.js';

export class UpdateJobTrackDto {
  @ApiProperty({
    description:
      "Identifiant du suivi de candidature à mettre à jour (défini automatiquement depuis le paramètre d'URL)",
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  id?: string;

  @ApiProperty({
    description: 'Intitulé du poste ou nom de la fonction',
    example: 'Développeur Full Stack Senior',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Le titre doit être une chaîne de caractères' })
  @MinLength(1, { message: 'Le titre ne peut pas être vide' })
  title?: string;

  @ApiProperty({
    description: "Nom de l'entreprise",
    example: 'Tech Company Inc.',
    required: false,
  })
  @IsOptional()
  @IsString({
    message: 'Le nom de l’entreprise doit être une chaîne de caractères',
  })
  company?: string;

  @ApiProperty({
    description: "URL de l'offre d'emploi",
    example: 'https://exemple.com/jobs/developpeur',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'L’URL de l’offre doit être une chaîne de caractères' })
  jobUrl?: string;

  @ApiProperty({
    description: 'Date de soumission de la candidature',
    example: '2025-01-15T10:30:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'La date de candidature doit être une date ISO valide' },
  )
  appliedAt?: string;

  @ApiProperty({
    description: 'Statut actuel de la candidature',
    enum: JobStatus,
    type: String,
    example: JobStatus.PENDING,
    required: false,
  })
  @IsOptional()
  @IsEnum(JobStatus, {
    message: 'Le statut doit être un statut de candidature valide',
  })
  status?: JobStatus;

  @ApiProperty({
    description: 'Type de contrat proposé pour le poste',
    enum: ContractType,
    type: String,
    example: ContractType.CDI,
    required: false,
  })
  @IsOptional()
  @IsEnum(ContractType, {
    message: 'Le type de contrat doit être un type de contrat valide',
  })
  contractType?: ContractType;

  @ApiProperty({
    description: 'Notes supplémentaires concernant la candidature',
    example: 'Mise à jour avec les retours de l’entretien',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Les notes doivent être une chaîne de caractères' })
  notes?: string;
}

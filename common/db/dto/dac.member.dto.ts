import { IsNotEmpty, IsString } from 'class-validator';

export class DacCheckMember {
  dacId: string;
  isMember: boolean;
}
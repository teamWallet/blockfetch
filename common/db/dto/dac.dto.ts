import { IsNotEmpty, IsString } from 'class-validator';

export class AssignData {
  user: string;
  quantity: string;
  amount: string;
  percent: number;
  info: string;
}
export class AuthorityUnit {
  authorityName: string;
  flag: boolean;
  data: string;
  description: string;
}

export class DacCreateReqDto {
  @IsNotEmpty()
  @IsString()
  dacLevel: string;
  //
  dacName: string;
  imChannels: string[];
  managers: string[];
  creater: string;
  avatar: string;
  dacProfile: string;
  decimal: number;
  symbolName: string;
  symbol: string;
  //
  assign: AssignData[];
  tokenIcon: string;
  imBridge: string;
  stake: string;
  mode: string;
  total: string;
  circulation: string;
  configData: string;
  authority?: any;
}

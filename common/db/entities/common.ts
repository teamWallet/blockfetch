export class Level {
  permission: string;
  actor: string;
}
export class Approval {
  time: string;
  level: Level;
}

export class Transaction {
  expiration: string;
  ref_block_num: number;
  ref_block_prefix: number;
  max_net_usage_words: number;
  max_cpu_usage_ms: number;
  delay_sec: number;
  context_free_actions: any;
  actions: object;
  transaction_extensions: any;
}

import {
  Entity,
  Column,
  Index,
  ObjectID,
  ObjectIdColumn,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinTable,
} from 'typeorm';

// export class Data {
//     @Column()
//     account: string
//     @Column()
//     profile: string
// }
// export class Action {
//     @Column()
//     account: string
//     @Column()
//     name: string
//     @Column(type => Data)
//     data: string
// }

@Entity('actions')
@Index(['block_num', 'block_timestamp', 'trx_id', 'action'], { unique: true })
export class ActionData {
  @PrimaryGeneratedColumn()
  // @ObjectIdColumn()
  id: number;

  @Column()
  block_num: number;

  @Column()
  block_timestamp: Date;
  // block_timestamp: string
  @Column()
  // trx_id: any
  trx_id: string;

  @Column('jsonb')
  action: object;

  @Column()
  recv_sequence: number;
  @Column()
  global_sequence: number;
}

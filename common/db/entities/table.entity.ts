import {
  Entity,
  Column,
  Index,
  ObjectID,
  ObjectIdColumn,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinTable,
} from "typeorm";

@Entity({ name: "contract_tables" })
@Index(["block_num", "block_timestamp", "data_hash", "table", "data"], {
  unique: true,
})
export class ContractTableData {
  @PrimaryGeneratedColumn()
  // _id: number
  // @ObjectIdColumn()
  id: number;
  @Column()
  block_num: number;
  @Column()
  // block_timestamp: string
  block_timestamp: Date;
  @Column()
  code: string;
  @Column()
  scope: string;
  @Column()
  table: string;
  @Column("jsonb")
  data: object;
  @Column()
  data_hash: string;
  @Column()
  present: boolean;
  @Column()
  payer: string;
}

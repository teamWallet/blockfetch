import {
  Entity,
  Column,
  Index,
  ObjectID,
  ObjectIdColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  PrimaryColumn,
  JoinTable,
} from "typeorm";
import * as moment from "moment";

@Entity({ name: "transfer" })
export class TransferHistoryData {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  from: string;
  @Column()
  to: string;
  @Column("int8")
  amount: number;
  @Column()
  quantity: string;
  @Column()
  symbol: string;
  @Column()
  memo: string;
  @Column({ default: "" })
  type: string;
  @Column({ default: "" })
  message: string;
  @CreateDateColumn({
    transformer: {
      from: (date: Date) => {
        return moment(date).format("YYYY-MM-DD HH:mm:ss");
      },
      to: () => {
        return new Date();
      },
    },
  })
  createAt: string;
}

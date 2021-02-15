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

@Entity({ name: "financial" })
export class FinancialData {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;
  @Column("int8")
  amount: number;
  @Column()
  symbol: string;
  @Column()
  quantity: string;
}

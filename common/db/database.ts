import "reflect-metadata";
import { ConnectionOptions, createConnection } from "typeorm";

import {
  ActionData,
  ContractTableData,
  FinancialData,
  TransferHistoryData,
} from "./entities";

const util = require("util");
import * as moment from "moment";
import { truncate } from "fs/promises";
import * as config from "config";

import {DacCheckMember} from './dto/dac.member.dto';

const options: ConnectionOptions = {
  type: "postgres",
  host: config.get<string>('db.host'),
  port: config.get<number>('db.port'),
  username: config.get<string>('db.username'),
  password: config.get<string>('db.password'),
  database: config.get<string>('db.database'),
  // logging: ["query", "error"],
  // synchronize: false,
  logging: true,
  entities: [
    ActionData,
    ContractTableData,
    FinancialData,
    TransferHistoryData,
  ],
};

export class DBHandle {
  // actionService: any;
  connection: any;
  private static instance: DBHandle;
  public logger: any;

  public static async getInstance() {
    if (!DBHandle.instance) {
      DBHandle.instance = new DBHandle();
      await DBHandle.instance.Connect();
    }

    return DBHandle.instance;
  }
  private constructor() {
    this.logger = require("../connections/logger")("database", "info");
    // this.connection = new Promise(async (resolve, reject) => {
    //     try {
    //         const connection = await createConnection(options);
    //         resolve(connection);
    //     }catch(err) {
    //         reject(err);
    //     }
    // });
    // this.actionService = new ActionService();
  }
  async Connect() {
    this.connection = await createConnection(options);
    // console.log("connection over!!! \n");
  }
  async findAccountOne(opt: any) {
    return await this.connection.getRepository(FinancialData).find(opt);
  }
  async updateAccountOne(acct: any) {
    try {
      this.logger.warn(`updateAccountOne ${JSON.stringify(acct)}`);
      const opt = { name: acct.name, symbol: acct.symbol };
      try {
        this.logger.error(
          `updateAccountOne opt:${JSON.stringify(opt)}, ${JSON.stringify(acct)}`
        );
        console.error("save updateAccountOne:", acct);
        console.error("find updateAccountOne:", opt);
        const result = await this.connection
          .getRepository(FinancialData)
          .find(opt);
        if (result && result.length > 0) {
          await this.connection.getRepository(FinancialData).update(opt, acct);
        } else {
          await this.saveAccountOne(acct);
        }
      } catch (e) {
        await this.saveAccountOne(acct);
      }
    } catch (e) {
      this.logger.error(`updateAccountOne failed ${JSON.stringify(acct)}`);
      console.error(`--- update account one faile:${e}`);
    }
  }
  async saveAccountOne(data: any) {
    try {
      this.logger.error(`saveAccountOne opt:${JSON.stringify(data)}`);
      console.error("save saveAccountOne:", data);
      const acct: FinancialData = await this.connection
        .getRepository(FinancialData)
        .create(data);
      this.logger.error(`saveAccountOne ${JSON.stringify(acct)}`);
      console.error("saveAccountOne:", acct);
      return await this.connection.getRepository(FinancialData).save(acct);
    } catch (e) {
      this.logger.error(`saveAccountOne failed ${JSON.stringify(data)}`);
      console.error("--- update account one faile data:", data);
    }
  }
  async findActionOne(opt: any) {
    return await this.connection.getRepository(ActionData).find(opt);
  }
  async findActionJsonbOne(opt: any) {
    let queryAccount = "";
    let index = 0;
    for (const value of opt.account) {
      if (index != 0) {
        queryAccount += ",";
      }
      queryAccount += util.format(`'%s'`, value);
      index++;
    }
    let queryName = "";
    index = 0;
    for (const value of opt.name) {
      if (index != 0) {
        queryName += ",";
      }
      queryName += util.format(`'%s'`, value);
      index++;
    }
    let comp = "<";
    if (opt.compare) {
      comp = ">";
    }
    const query = util.format(
      `SELECT "actions".* FROM "actions" WHERE "actions"."block_num" %s '%d' \
      AND "action"->>'name' IN (%s) \
      AND "action"->>'account' IN (%s) \
      AND "action"->'data'->>'proposal_name'='%s' \
      AND "action"->'data'->>'proposer'='%s' LIMIT 1`,
      comp,
      opt.block_num,
      queryName,
      queryAccount,
      opt.proposal_name,
      opt.proposer
    );
    return await this.connection.getRepository(ActionData).query(query);
  }
  async findActionJsonbAll(opt: any) {
    let queryAccount = "";
    let index = 0;
    for (const value of opt.account) {
      // '%s', '%s'
      if (index != 0) {
        queryAccount += ",";
      }
      queryAccount += util.format(`'%s'`, value);
      index++;
    }
    let queryName = "";
    index = 0;
    for (const value of opt.name) {
      // '%s', '%s'
      if (index != 0) {
        queryName += ",";
      }
      queryName += util.format(`'%s'`, value);
      index++;
    }
    let comp = "<";
    if (opt.compare) {
      comp = ">";
    }
    const query = util.format(
      `SELECT "actions".* FROM "actions" WHERE "actions"."block_num" %s '%d' \
      AND "action"->>'name' IN (%s) \
      AND "action"->>'account' IN (%s) \
      AND "action"->'data'->>'proposal_name'='%s' \
      AND "action"->'data'->>'proposer'='%s' ORDER BY "actions"."block_num" %s`,
      comp,
      opt.block_num,
      queryName,
      queryAccount,
      opt.proposal_name,
      opt.proposer,
      opt.sort
    );
    return await this.connection.getRepository(ActionData).query(query);
  }
  async findLastActionOne() {
    return await this.connection.getRepository(ActionData).find({
      order: { block_num: "DESC" },
      take: 1,
    });
  }

  async findLastTableOne() {
    return await this.connection.getRepository(ContractTableData).find({
      order: { block_num: "DESC" },
      take: 1,
    });
  }
  async findActionAll() {
    return await this.connection.getRepository(ActionData).find();
  }

  async aggregatePropose(opt: any, callback: any) {
    return await this.connection
      .getRepository(ContractTableData)
      .aggregate(opt, callback);
  }
  async dacAggregatePropose(opt: any, data: any): Promise<ContractTableData[]> {
    return await this.connection.getRepository(ContractTableData).find(opt);
  }
  async dacAggregateProposeQuery(opt: any): Promise<ContractTableData[]> {
    return await this.connection.getRepository(ContractTableData).query(opt);
  }

  async ActionSave(data: ActionData) {
    const res = await this.connection.getRepository(ActionData).save(data);
  }
  // async updateTaskStatus(opt: any, resData: any) {
  //   try {
  //     this.logger.info(
  //       `updateTaskStatus opt:${JSON.stringify(opt)}, ${JSON.stringify(
  //         resData
  //       )}`
  //     );
  //     console.error("find updateTaskStatus:", opt);
  //     console.error("save updateTaskStatus:", resData);

  //     console.error("find updateTaskStatus:", opt);
  //     const result = await this.connection.getRepository(TasksData).find(opt);
  //     if (result && result.length > 0) {
  //       await this.connection.getRepository(TasksData).update(opt, resData);
  //     } else {
  //       this.logger.error(
  //         `updateTaskStatus failed,not found ${JSON.stringify(resData)}`
  //       );
  //     }
  //   } catch (e) {
  //     this.logger.error(`updateTaskStatus failed ${JSON.stringify(resData)}`);
  //     console.log(`updateTaskStatus failed: ${e}`);
  //   }
  // }
  async TransferHistorySave(data: any) {
    try {
      this.logger.error(`TransferHistorySave ${JSON.stringify(data)}`);
      console.error("save history:", data);
      const acct: TransferHistoryData = await this.connection
        .getRepository(TransferHistoryData)
        .create(data);
      await this.connection.getRepository(TransferHistoryData).save(acct);
      // console.log(res);
    } catch (e) {
      this.logger.error(`TransferHistorySave failed ${JSON.stringify(e)}`);
    }
  }

  async TableSave(data: ContractTableData) {
    await this.connection.getRepository(ContractTableData).save(data);
  }
}

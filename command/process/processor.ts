#!/usr/bin/env node

process.title = "processor";

const cluster = require("cluster");

const { TextDecoder, TextEncoder } = require("text-encoding");
const { Api, JsonRpc, Serialize } = require("eosjs");
const fetch = require("node-fetch");
const RabbitSender = require("../../common/rabbitsender");
const Int64 = require("int64-buffer").Int64BE;
const crypto = require("crypto");
const { loadConfig } = require("../../common/utils/function");
const { arrayToHex } = require("eosjs/dist/eosjs-serialize");
const watchers = require("./watchers");
const DeltaWatchers = require("./delta_watchers");

const { IPC } = require("node-ipc");
import { DBHandle } from "../../common/db/database";
import { ActionData } from "../../common/db/entities/action.entity";
import { ContractTableData } from "../../common/db/entities/table.entity";
const util = require("util");

const MqDeltaName = "contract_row_test";
const MqActionName = "action_test";
class JobProcessor {
  public config: any;
  public api: any;
  public logger: any;
  public db: any;
  public amq: any;
  public dac_directory: any;
  public ipc: any;

  constructor() {
    this.config = loadConfig();

    const rpc = new JsonRpc(this.config.eos.endpoint, { fetch });
    this.api = new Api({
      rpc,
      signatureProvider: null,
      chainId: this.config.chainId,
      textDecoder: new TextDecoder(),
      textEncoder: new TextEncoder(),
    });

    this.logger = require("../../common/connections/logger")(
      "processor"
    );
  }

  async connectDb() {
    this.db = await DBHandle.getInstance();
    // await this.db.Connect();
  }

  async connectAmq() {
    this.logger.info(`Connecting to AMQ`);
    RabbitSender.closeHandlers = [
      (() => {
        this.logger.info("close handler");
        this.start();
      }).bind(this),
    ];
    this.amq = RabbitSender.init(this.config.amq);
    this.logger.info("connect over");
  }

  async processedActionJob(job, doc) {
    // this.logger.info(`Processed action job, notifying watchers`);
    this.amq.then((amq) => {
      amq.ack(job);
    });
    // eosio.msig 入口
    watchers.forEach((watcher) => {
      watcher.action({
        doc,
        dac_directory: '',
        db: this.db,
        amq: this.amq,
      });
    });
    // broadcast to master, to send via ipc
    process.send(doc);
  }

  async processedDeltaJob(job, doc) {
    // this.logger.info(`Processed delta job, notifying watchers`);
    this.amq.then((amq) => {
      amq.ack(job);
    });

    DeltaWatchers.forEach((watcher) => {
      watcher.action({ doc, dac_directory: '', db: this.db,amq: this.amq });
    });
  }
  async processActionJob(job) {
    let block_num = 0;
    let block_timestamp_arr = null;
    let buffer = null;
    let block_timestamp_int = 0;
    let block_timestamp = null;
    let trx_id_arr = "";
    let trx_id = [];
    let recv_sequence = 0;
    let global_sequence = 0;
    let account = "";
    let name = "";
    let data = "";
    let act;

    if (this.config.dfuse) {
      this.logger.debug("get content:", job.content);
      try {
        let sb = JSON.parse(job.content.toString());
        this.logger.debug("get sb:", sb);
        block_num = sb.block_num.toString();
        block_timestamp = new Date(sb.block_timestamp * 1000);
        this.logger.debug("block:", block_num, block_timestamp);
        trx_id = sb.trx_id_arr;
        // rx_id = arrayToHex(trx_id_arr);
        recv_sequence = sb.recv_sequence.toString();
        global_sequence = sb.global_sequence.toString();
        account = sb.action_buffer.account;
        name = sb.action_buffer.name;
        data = sb.action_buffer.data;
        this.logger.debug("data:", data);
        act = [
          {
            account: account,
            name: name,
            data: data,
          },
        ];
        this.logger.debug("act", act[0]);
      } catch (e) {
        this.logger.error(
          `Error json parse action data ${account}:${name} - ${e.message}`,
          { e }
        );
        this.amq.then((amq) => {
          amq.ack(job);
        });
        return;
      }
    } else {
      // this.logger.info('processActionJob 111 handler');

      const sb = new Serialize.SerialBuffer({
        textEncoder: new TextEncoder(),
        textDecoder: new TextDecoder(),
        array: new Uint8Array(job.content),
      });

      block_num = new Int64(sb.getUint8Array(8)).toString();
      block_timestamp_arr = sb.getUint8Array(4);
      buffer = Buffer.from(block_timestamp_arr);
      block_timestamp_int = buffer.readUInt32BE(0);
      block_timestamp = new Date(block_timestamp_int * 1000);
      trx_id_arr = sb.getUint8Array(32);
      trx_id = arrayToHex(trx_id_arr);
      recv_sequence = new Int64(sb.getUint8Array(8)).toString();
      global_sequence = new Int64(sb.getUint8Array(8)).toString();
      account = sb.getName();
      name = sb.getName();
      data = sb.getBytes();

      const action = { account, name, data };

      // this.logger.info(`Deserializing action ${account}:${name}`);

      try {
        act = await this.api.deserializeActions([action]);
      } catch (e) {
        this.logger.error(
          `Error deserializing action data ${account}:${name} - ${e.message}`,
          { e }
        );
        this.amq.then((amq) => {
          amq.ack(job);
        });
        return;
      }
      delete act[0].authorization;
    }

    // this.logger.info(
    //   `Process action ${block_num} ${account} ${name} ${recv_sequence} ${global_sequence}`,
    // );
    // const doc = {
    //   block_num: MongoLong.fromString(block_num),
    //   block_timestamp,
    //   trx_id,
    //   action: act[0],
    //   recv_sequence: MongoLong.fromString(recv_sequence),
    //   global_sequence: MongoLong.fromString(global_sequence)
    // };
    let doc: ActionData = new ActionData();
    doc.block_num = block_num;
    (doc.block_timestamp = block_timestamp),
      // doc.trx_id = trx_id as string;
      (doc.trx_id = util.format("%s", trx_id));
    doc.action = act[0];
    doc.recv_sequence = recv_sequence;
    doc.global_sequence = global_sequence;

    // this.logger.debug('doc:', doc);

    // const self = this;
    try {
      await this.db.ActionSave(doc);
      this.logger.info("Action save completed", doc.action);
      this.processedActionJob(job, doc);
      // .then(data => {
      // }).catch(error => {
      //   this.logger.error("DB save failed:",error.stack ? error.stack : error);
      //   this.logger.error("!!!");

      //   this.amq.then(amq => {
      //     amq.reject(job);
      //   });
      // });
    } catch (error) {
      if (error.code == "23505" && error.detail.indexOf("already exists") > 0) {
        // Duplicate index
        this.logger.error("DB save already exists: ");
        try {
          this.processedActionJob(job, doc);
        } catch (e) {
          this.logger.error("DB process action failed:", e);
        }
      } else if (error.code == "54000") {
        this.logger.error("DB save failed, igorne !!! ");
        try {
          this.processedActionJob(job, doc);
        } catch (e) {
          this.logger.error("DB process action failed:", e);
        }
      } else {
        this.logger.error("DB save failed code: ", error.code);

        this.logger.error("DB save failed: ", error);

        this.amq.then((amq) => {
          amq.reject(job);
        });
      }
    }
  }

  async processTransactionRow(job) {
    const sb = new Serialize.SerialBuffer({
      textEncoder: new TextEncoder(),
      textDecoder: new TextDecoder(),
      array: new Uint8Array(job.content),
    });
  }
  async getTableType(code, table) {
    const contract = await this.api.getContract(code);
    const abi = await this.api.getAbi(code);

    // this.logger.info(abi)

    let this_table, type;
    for (let t of abi.tables) {
      if (t.name === table) {
        this_table = t;
        break;
      }
    }

    if (this_table) {
      type = this_table.type;
    } else {
      this.logger.error(`Could not find table "${table}" in the abi`, {
        code,
        table,
      });
      return;
    }

    return contract.types.get(type);
  }
  async processContractRow(job) {
    if (this.config.dfuse) {
      // this.logger.debug("get content:", job.content);
      let block_num = 0;
      let present = null;
      let block_timestamp_arr = null;
      let buffer = null;
      let block_timestamp_int = 0;
      let block_timestamp = null;
      let code = null;
      let scope = null;
      let table = null;
      let primary_key = null;
      let payer = null;
      let data_raw = null;
      let sb = null;
      try {
        sb = JSON.parse(job.content.toString());
        // this.logger.debug("get sb:", sb);
        block_num = sb.block_num.toString();
        block_timestamp = new Date(sb.block_timestamp * 1000);
        // this.logger.debug("block:", block_num, block_timestamp);

        present = sb.present;

        code = sb.contract_row.code;
        scope = sb.contract_row.scope;
        table = sb.contract_row.table;
        // null
        primary_key = null;
        payer = sb.contract_row.payer;

        data_raw = sb.contract_row.data_raw;
      } catch (e) {
        this.logger.error(`Error json parse table delta data - ${e.message}`, {
          e,
        });
        this.amq.then((amq) => {
          amq.ack(job);
        });
        return;
      }
      try {
        const data = sb.contract_row.data;
        if (code !== "eosio") {
          // this.logger.info(`row version ${row_version}`);
          this.logger.info(`code ${code}`);
          this.logger.info(`scope ${scope}`);
          this.logger.info(`table ${table}`);
          // this.logger.info(`primary_key ${primary_key}`);
          this.logger.info(`payer ${payer}`);
          // // this.logger.info(`data`)
          this.logger.info(data);

          this.logger.info(`Storing ${code}:${table}:${block_timestamp_int}`);

          const data_hash = crypto
            .createHash("sha1")
            .update(data_raw)
            .digest("hex");

          // let doc = {
          //   block_num: MongoLong.fromString(block_num),
          //   block_timestamp,
          //   code,
          //   scope,
          //   table,
          //   // primary_key: MongoLong.fromString(primary_key),
          //   // payer,
          //   data,
          //   data_hash,
          //   present
          // };
          let doc: ContractTableData = new ContractTableData();
          doc.block_num = block_num;
          doc.block_timestamp = block_timestamp;
          doc.code = code;
          doc.scope = scope;
          doc.table = table;
          doc.data = data;
          doc.data_hash = data_hash;
          doc.present = present;
          doc.payer = "";

          if (payer != null) {
            doc.payer = payer;
          }
          try {
            await this.db.TableSave(doc);
            this.logger.info("Contract row save completed", data);

            this.amq.then((amq) => {
              amq.ack(job);
            });
            // .then(data => {

            // }).catch(error => {
            //   this.logger.error("DB save failed: ",error.stack ? error.stack : error);

            //   this.amq.then(amq => {
            //     amq.reject(job);
            //   });
            // });
          } catch (error) {
            if (
              error.code == "23505" &&
              error.detail.indexOf("already exists") > 0
            ) {
              // Duplicate index
              this.logger.error("DB save already exists: ");
              this.amq.then((amq) => {
                amq.ack(job);
              });
            } else if (error.code == "54000") {
              this.logger.error("DB save failed, igorne !!! ");
              this.amq.then((amq) => {
                amq.ack(job);
              });
            } else {
              this.logger.error("DB save failed code: ", error.code);

              this.logger.error("DB save failed: ", error);

              this.amq.then((amq) => {
                amq.reject(job);
              });
            }
          }
        }
      } catch (e) {
        this.logger.error(
          `Error deserializing ${code}:${table} : ${e.message}`,
          { e }
        );
        this.amq.then((amq) => {
          amq.ack(job);
        });
      }
    } else {
      this.logger.info("processContractRow 111 handler");

      const sb = new Serialize.SerialBuffer({
        textEncoder: new TextEncoder(),
        textDecoder: new TextDecoder(),
        array: new Uint8Array(job.content),
      });

      const block_num = new Int64(sb.getUint8Array(8)).toString();
      const present = sb.get();
      const block_timestamp_arr = sb.getUint8Array(4);
      // const block_timestamp_int = sb.getUint32();
      let buffer = Buffer.from(block_timestamp_arr);
      var block_timestamp_int = buffer.readUInt32BE(0);
      const block_timestamp = new Date(block_timestamp_int * 1000);
      sb.get(); // version
      const code = sb.getName();
      const scope = sb.getName();
      const table = sb.getName();
      const primary_key = new Int64(sb.getUint8Array(8)).toString();
      const payer = sb.getName();
      const data_raw = sb.getBytes();

      try {
        const table_type = await this.getTableType(code, table);
        const data_sb = new Serialize.SerialBuffer({
          textEncoder: new TextEncoder(),
          textDecoder: new TextDecoder(),
          array: data_raw,
        });

        const data = table_type.deserialize(data_sb);

        if (code !== "eosio") {
          this.logger.info(`Storing ${code}:${table}:${block_timestamp_int}`);

          const data_hash = crypto
            .createHash("sha1")
            .update(data_raw)
            .digest("hex");

          // const doc: ContractTableData = {
          //   block_num: block_num,
          //   block_timestamp: block_timestamp,
          //   code: code,
          //   scope: scope,
          //   table: table,
          //   data: data,
          //   data_hash: data_hash,
          //   present: present,
          //   payer: payer,
          // };
          let doc: ContractTableData = new ContractTableData();
          doc.block_num = block_num;
          doc.block_timestamp = block_timestamp;
          doc.code = code;
          doc.scope = scope;
          doc.table = table;
          doc.data = data;
          doc.data_hash = data_hash;
          doc.present = present;
          doc.payer = payer;
          try {
            this.logger.info(`Contract row save ${doc}`);

            await this.db.TableSave(doc);
            this.logger.info("Contract row save completed", data);
            this.processedDeltaJob(job, doc);
            // this.amq.then(amq => {
            //   amq.ack(job);
            // });
            // then(data => {

            // }).catch(error => {
            //   this.logger.error("DB save failed: ",error.stack ? error.stack : error);

            //   this.amq.then(amq => {
            //     amq.reject(job);
            //   });
            // });
          } catch (error) {
            this.logger.error(`----------- save error: ${error}`);
            if (
              error.code == "23505" &&
              error.detail.indexOf("already exists") > 0
            ) {
              // Duplicate index
              this.logger.error("DB save already exists: ");
              try {
                this.processedDeltaJob(job, doc);
              } catch (e) {
                this.logger.error("DB process delta failed:", e);
              }
              // this.amq.then(amq => {
              //   amq.ack(job);
              // });
            } else if (error.code == "54000") {
              this.logger.error("DB save failed, igorne !!! ");
              this.amq.then((amq) => {
                amq.ack(job);
              });
            } else {
              this.logger.error("DB save failed code: ", error.code);

              this.logger.error("DB save failed: ", error);

              this.amq.then((amq) => {
                amq.reject(job);
              });
            }
          }
        }
      } catch (e) {
        this.logger.error(
          `Error deserializing ${code}:${table} : ${e.message}`,
          { e }
        );
        this.amq.then((amq) => {
          amq.ack(job);
        });
      }
    }
  }

  worker_message(doc) {
    // this.ipc.server.broadcast(MqActionName, doc);
  }

  async start() {
    this.logger.info("------- start 111");

    this.connectAmq();
    try {
      await this.connectDb();
    } catch (e) {
      this.logger.error(`error connect database: ${e} !!!`);
      return;
    }
    this.logger.info("connectdb 111");

    // this.delta_handler = new DeltaHandler({
    //   config: this.config,
    //   queue: this.amq
    // });

    if (cluster.isMaster) {
      this.logger.info(
        `Starting processor with ${this.config.clusterSize} threads...`
      );
      // start ipc server that clients can subscribe to for api cache updates
      this.ipc = new IPC();
      this.ipc.config.appspace = "dac.";
      this.ipc.config.id = "dacprocessor";
      this.ipc.serve(() => {
        this.logger.info(`Started IPC`);
      });
      this.ipc.server.start();

      for (let i = 0; i < this.config.clusterSize; i++) {
        const worker = cluster.fork();
        worker.on("message", this.worker_message.bind(this));
      }
    } else {
      const self = this;
      this.logger.info(`cluster not master`);

      this.amq.then((amq) => {
        this.logger.info(`begin listen 1111`);

        amq.listen(MqDeltaName, self.processContractRow.bind(self));
        amq.listen(MqActionName, self.processActionJob.bind(self));
      });
    }
  }
}

const processor = new JobProcessor();
processor.start();

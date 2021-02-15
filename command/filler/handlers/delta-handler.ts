const { Api, JsonRpc, Serialize } = require("eosjs");
import { TextDecoder, TextEncoder } from "util";

import * as fetch from "node-fetch";
const RabbitSender = require("../../../common/rabbitsender");
const Int64 = require("int64-buffer").Int64BE;
const MqDeltaName = "contract_row_test";

export class DeltaHandler {
  public queue: any;
  public config: any;
  public dac_directory: any;
  public logger: any;
  public tables: any;
  public api: any;
  public amq: any;

  constructor({ queue, config, dac_directory, logger }) {
    this.amq = queue;
    this.config = config;
    this.dac_directory = dac_directory;
    this.logger = logger;
    this.tables = new Map();

    const rpc = new JsonRpc(this.config.eos.endpoint, { fetch });
    this.api = new Api({
      rpc,
      signatureProvider: null,
      chainId: this.config.chainId,
      textDecoder: new TextDecoder(),
      textEncoder: new TextEncoder(),
    });

    // this.connectAmq();
  }

  async connectAmq() {
    this.amq = RabbitSender.init(this.config.amq);
  }

  async getTableType(code, table) {
    const contract = await this.api.getContract(code);
    const abi = await this.api.getAbi(code);

    this.logger.debug(abi);

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

  async queueDelta(block_num, deltas, types, block_timestamp) {
    if (this.config.dfuse) {
      this.logger.debug(`Queue delta for ${block_num}`);
      for (const row of deltas) {
        this.logger.debug(`row:${row}`);
        let code;
        try {
          this.logger.debug(`row`, row);

          code = row.key.code;

          if (code === this.config.eos.dacDirectoryContract) {
            this.logger.debug(`Found dac directory delta change`);

            const scope = row.key.scope;
            const table = row.key.table;

          }
          // else {
          // scope and table
          const scope = row.key.scope;
          const table = row.key.table;
          this.logger.debug("Queue delta row");
          this.logger.debug(`Queueing delta ${code}`, { code });

          if (code === this.config.eos.dacDirectoryContract) {
            this.logger.debug(`Found dac directory delta change`);

          }
          // else
          if (this.interested(code)) {
            this.logger.debug("Queue delta row");
            this.logger.debug(`Queueing delta ${code}`, { code });
            await this.queueDeltaRow(
              MqDeltaName,
              block_num,
              row,
              block_timestamp
            );
          } else {
            const msig_contract = this.config.eos.msigContract || "eosio.msig";

            if (table === "accounts" && this.interested(scope)) {
              this.logger.debug(
                `Found interesting token balance change ${code}:${scope}:${table}`,
                { code, scope, table }
              );

              await this.queueDeltaRow(
                MqDeltaName,
                block_num,
                row,
                block_timestamp
              );
            } else if (
              code === msig_contract &&
              ["proposal", "approvals", "approvals2"].includes(table)
            ) {
              this.logger.debug(`Queueing msig ${code}:${scope}:${table}`, {
                code,
                scope,
                table,
              });

              // await this.queueDeltaRow(
              //   MqDeltaName,
              //   block_num,
              //   row,
              //   block_timestamp
              // );
            }
          }

          await this.queueDeltaRow(
            MqDeltaName,
            block_num,
            row,
            block_timestamp
          );
          // }
        } catch (e) {
          this.logger.error(
            `Error processing row.data for ${block_num} : ${e.message}`,
            e
          );
        }
      }
    } else {
      for (const delta of deltas) {
        // this.logger.debug('-------- queueDelta');
        // this.logger.debug(delta);
        // this.logger.debug(`--------name ${delta[1].name}`);

        switch (delta[0]) {
          case "table_delta_v0":
            if (delta[1].name === "contract_row") {
              // continue
              // this.logger.debug('-------- queueDelta');

              for (const row of delta[1].rows) {
                const sb = new Serialize.SerialBuffer({
                  textEncoder: new TextEncoder(),
                  textDecoder: new TextDecoder(),
                  array: row.data,
                });

                let code;
                try {
                  // this.logger.debug(`row`, row);
                  sb.get(); // ?
                  code = sb.getName();

                  if (code === this.config.eos.dacDirectoryContract) {
                    this.logger.info(
                      `------- Found dac directory delta change`
                    );

                    const scope = sb.getName();
                    const table = sb.getName();
                  }
                  // else
                  if (this.interested(code)) {
                    this.logger.debug("Queue delta row");
                    this.logger.debug(`Queueing delta ${code}`, { code });
                    await this.queueDeltaRow(
                      MqDeltaName,
                      block_num,
                      row,
                      block_timestamp
                    );
                  } else {
                    const scope = sb.getName();
                    const table = sb.getName();

                    const msig_contract =
                      this.config.eos.msigContract || "eosio.msig";

                    if (table === "accounts" && this.interested(scope)) {
                      this.logger.debug(
                        `Found interesting token balance change ${code}:${scope}:${table}`,
                        { code, scope, table }
                      );

                      await this.queueDeltaRow(
                        MqDeltaName,
                        block_num,
                        row,
                        block_timestamp
                      );
                    } else if (
                      code === msig_contract &&
                      ["proposal", "approvals", "approvals2"].includes(table)
                    ) {
                      this.logger.debug(
                        `Queueing msig ${code}:${scope}:${table}`,
                        { code, scope, table }
                      );

                      await this.queueDeltaRow(
                        MqDeltaName,
                        block_num,
                        row,
                        block_timestamp
                      );
                    }
                  }
                } catch (e) {
                  this.logger.error(
                    `Error processing row.data for ${block_num} : ${e.message}`,
                    e
                  );
                }
              }
            }
            break;
        }
      }
    }
  }

  int32ToBuffer(num) {
    const arr = Buffer.alloc(4);
    arr.writeUInt32BE(num, 0);
    return arr;
  }

  async queueDeltaRow(name, block_num, row, block_timestamp) {
    if (this.config.dfuse) {
      return new Promise((resolve, reject) => {
        this.amq.then((amq) => {
          //
          this.logger.debug(`Publishing ${name}`);

          try {
            let data = {
              block_num: block_num,
              block_timestamp: block_timestamp.getTime() / 1000,
              present: true,
              contract_row: {
                code: row.key.code,
                scope: row.key.scope,
                table: row.key.table,
                payer: null,
                data: row.newJSON.object,
                data_raw: row.newData,
              },
            };

            if (row.newPayer != null && row.newPayer != undefined) {
              data.contract_row.payer = row.newPayer;
            } else if (row.oldPayer != null && row.oldPayer != undefined) {
              data.contract_row.payer = row.oldPayer;
            }
            amq
              .send(name, Buffer.from(JSON.stringify(data)))
              .then(resolve)
              .catch(reject);
          } catch (e) {
            this.logger.error("get table deltas error: ", row);
          }
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        this.amq.then((amq) => {
          const ts = Math.floor(block_timestamp.getTime() / 1000);
          // this.logger.info('ts', ts);
          const timestamp_buffer = this.int32ToBuffer(ts);
          const block_buffer = new Int64(block_num).toBuffer();
          const present_buffer = Buffer.from([row.present]);
          this.logger.debug(`Publishing ${name}`);
          try{
            amq
              .send(
                name,
                Buffer.concat([
                  block_buffer,
                  present_buffer,
                  timestamp_buffer,
                  Buffer.from(row.data),
                ])
              )
              .then(resolve)
              .catch(reject);
          }catch (e) {
            console.error(">>>>>>>>>>>>> ------ [AMQP] queueDeltaRow send failed!!!",e);
            this.amq = RabbitSender.init(this.config.amq);
          }
        });

      });
    }
  }

  async processDelta(block_num, deltas, abi, block_timestamp) {
    return this.queueDelta(block_num, deltas, abi, block_timestamp);
  }

  interested(account) {
    if (this.config.eos.contracts.includes(account)) {
      return true;
    }
    return false;
  }
}

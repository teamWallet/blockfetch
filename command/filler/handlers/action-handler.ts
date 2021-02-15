const { Api, JsonRpc, Serialize } = require("eosjs");
// const { TextDecoder, TextEncoder } = require("util");
import { TextDecoder, TextEncoder } from "util";

const Int64 = require("int64-buffer").Int64BE;

const { hexToUint8Array } = require("eosjs/dist/eosjs-serialize");
const MqActionName = "action_test";
export class ActionHandler {
  public amq: any;
  public config: any;
  public dac_directory: any;
  public logger: any;
  public api: any;

  constructor({ queue, config, dac_directory, logger }) {
    this.amq = queue;
    this.config = config;
    this.dac_directory = dac_directory;
    this.logger = logger;

    const rpc = new JsonRpc(this.config.eos.endpoint, { fetch });
    this.api = new Api({
      rpc,
      signatureProvider: null,
      chainId: this.config.chainId,
      textDecoder: new TextDecoder(),
      textEncoder: new TextEncoder(),
    });
  }

  int32ToBuffer(num) {
    const arr = Buffer.alloc(4);
    arr.writeUInt32BE(num, 0);
    return arr;
  }

  async processAction(block_num, action, trx_id, block_timestamp) {
    return this.queueAction(block_num, action, trx_id, block_timestamp);
  }

  async queueAction(block_num, action, trx_id, block_timestamp) {
    if (this.config.dfuse) {
      this.logger.debug(`Receive queue ${trx_id} for block ${block_num}`);
      this.logger.debug(action);

      this.logger.debug(
        `Checking ${action.account}:${action.name} ${this.interested(
          action.account,
          action.name
        )}`
      );
      if (action.receipt && action.receipt.receiver === action.account) {
        // this.logger.info('Queue Action', action);

        if (action.name === "setabi") {
          // todo dfuse setabi
          const act_name = action.account;

          if (!this.interested(act_name, "")) {
            return;
          }
        }
        this.logger.info(action.account);

        const sb_action = new Serialize.SerialBuffer({
          textEncoder: new TextEncoder(),
          textDecoder: new TextDecoder(),
        });

        const trx_id_arr = hexToUint8Array(trx_id);

        sb_action.pushName(action.account);
        sb_action.pushName(action.name);
        sb_action.pushBytes(action.data);

        if (this.amq) {
          this.logger.debug(
            `Queueing action for ${action.act.account}::${action.act.name}`
          );
          this.amq.then((amq) => {
            this.logger.info(`Publishing ${MqActionName}`);
            let data = {
              block_num: block_num,
              block_timestamp: block_timestamp.getTime() / 1000,
              trx_id_arr: trx_id,
              recv_sequence: action.receipt.codeSequence,
              global_sequence: action.receipt.globalSequence,
              action_buffer: {
                account: action.account,
                name: action.name,
                data: action.data,
              },
            };
            try{
              amq.send(MqActionName, Buffer.from(JSON.stringify(data)));
            }catch (e) {
              console.error(">>>>>>>>>>>>> ------ [AMQP] queueAction send failed!!!",e);
              this.amq = RabbitSender.init(this.config.amq);
            }
          });
        } else {
          this.logger.error(
            `No queue when processing action for ${action.act.account}::${action.act.name} in ${trx_id}`,
            { action }
          );
        }
      }
    } else {
      // this.logger.info(`Receive queue ${trx_id} for block ${block_num}`);
      // this.logger.info(`action: ${JSON.stringify(action)}`);

      // this.logger.debug(
      //   `Checking ${action.act.account}:${action.act.name} ${this.interested(
      //     action.act.account,
      //     action.act.name
      //   )}`
      // );
      if (
        this.interested(action.act.account, action.act.name) &&
        action.receipt &&
        action.receipt[1].receiver === action.act.account
      ) {
        this.logger.info("Queue Action", action);

        if (action.act.name === "setabi") {
          const sb_abi = new Serialize.SerialBuffer({
            textEncoder: new TextEncoder(),
            textDecoder: new TextDecoder(),
            array: action.act.data,
          });

          const act_name = sb_abi.getName();

          if (!this.interested(act_name, "")) {
            return;
          }
        }
        // this.logger.debug(action.act.account)
        // let data = {
        //     block_num,
        //     trx_id,
        //     action: action.act,
        //     receiver: action.receipt[1].receiver,
        //     receiver_sequence: action.receipt[1].recv_sequence,
        //     global_sequence: action.receipt[1].global_sequence
        // };
        // this.logger.debug(data)

        const sb_action = new Serialize.SerialBuffer({
          textEncoder: new TextEncoder(),
          textDecoder: new TextDecoder(),
        });

        const trx_id_arr = hexToUint8Array(trx_id);

        sb_action.pushName(action.act.account);
        sb_action.pushName(action.act.name);
        sb_action.pushBytes(action.act.data);

        if (this.amq) {
          // this.logger.debug(`Queueing action for ${action.act.account}::${action.act.name}`);
          this.amq.then((amq) => {
            const block_buffer = new Int64(block_num).toBuffer();
            const timestamp_buffer = this.int32ToBuffer(
              block_timestamp.getTime() / 1000
            );
            const trx_id_buffer = Buffer.from(trx_id_arr);
            const recv_buffer = new Int64(
              action.receipt[1].recv_sequence
            ).toBuffer();
            const global_buffer = new Int64(
              action.receipt[1].global_sequence
            ).toBuffer();
            const action_buffer = Buffer.from(sb_action.array);
            // this.logger.debug(`Publishing action`)
            amq.send(
              MqActionName,
              Buffer.concat([
                block_buffer,
                timestamp_buffer,
                trx_id_buffer,
                recv_buffer,
                global_buffer,
                action_buffer,
              ])
            );
          });
        } else {
          this.logger.error(
            `No queue when processing action for ${action.act.account}::${action.act.name} in ${trx_id}`,
            { action }
          );
        }
      }

      if (action.inline_traces && action.inline_traces.length) {
        for (let itc of action.inline_traces) {
          // this.logger.debug("inline trace\n", itc);
          if (itc[0] === "action_trace_v0") {
            this.queueAction(block_num, itc[1], trx_id, block_timestamp);
          }
        }
      }
    }
  }

  interested(account, name) {
    if (name === "onblock") {
      return false;
    }
    if (name === "transfer") {
      return true;
    }
    if (account === "eosio" && name === "setabi") {
      return true;
    }
    if (this.config.eos.contracts.includes(account)) {
      return true;
    }
    // todo account to dfuse client subscribe
    return false;
  }
}

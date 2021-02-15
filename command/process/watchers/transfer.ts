const { loadConfig } = require("../../../common/utils/function");
const { TextDecoder, TextEncoder } = require("text-encoding");
const { Api, JsonRpc } = require("eosjs");
const fetch = require("node-fetch");

import { asset, symbol } from "eos-common";
import Big from 'big.js';

class TransferActionHandler {
  public config: any;
  public db: any;
  public contract: any;
  public dac_config: any;
  public api: any;
  public logger: any;
  public dac_directory: any;

  constructor() {
    this.config = loadConfig();

    this.contract = this.config.eos.tokenContract || "eosio.token";

    this.dac_config = null;

    const rpc = new JsonRpc(this.config.eos.endpoint, { fetch });
    this.api = new Api({
      rpc,
      signatureProvider: null,
      chainId: this.config.chainId,
      textDecoder: new TextDecoder(),
      textEncoder: new TextEncoder(),
    });

    this.logger = require("../../../common/connections/logger")(
      "watcher-action-transfer"
    );
  }

  async recalcTransfer(doc, db, retry = false) {
    this.logger.info(`Recalc transfer ${doc.action}`);
    this.logger.info(`Recalc transfer name ${doc.action.name}`);

    const from = doc.action.data.from;
    const to = doc.action.data.to;
    const quantity = doc.action.data.quantity;
    const memo = doc.action.data.memo;

    this.logger.info(
      `Recalc transfer ${from} -> ${to} quantity ${quantity} memo:${memo}`
    );

    const quan = asset(quantity);
    const amount: number = Number(quan.amount);
    const symbol = quan.symbol.code().toString();

    this.logger.info(`quan ${quan}!`);

    try {
      this.logger.info(`begin transfer parse!`);

      const type = await this.getTransferType(
        memo,
        from,
        to,
        doc.block_timestamp.toISOString(),
        amount,
        symbol
      );
      const data = {
        from: from,
        to: to,
        amount: amount,
        quantity: quantity,
        symbol: symbol,
        memo: memo,
        type: type,
      };
      this.logger.info(`begin transfer history ${JSON.stringify(data)}!`);
      // TODO
      await this.db.TransferHistorySave(data);
    } catch (e) {
      //
      this.logger.error(`history failed !`);
    }
  }
  // TODO type and save to other
  async getTransferType(
    memo: string,
    from: string,
    to: string,
    timeStamp: string,
    amount: number,
    symbol: string
  ) {
    if (memo.indexOf("task") >= 0 && memo.indexOf("taskId") >= 0) {
      this.logger.info(`begin transfer task ${memo}!`);
      const taskInfo = JSON.parse(memo);
      try {
        const data = {
          receive: 3,
        };
        const opt = { executor: to, taskId: taskInfo.taskId,id: taskInfo.id };
        this.logger.info(`begin transfer refund opt: ${opt} save ${data}!`);
        this.db.updateTaskStatus(opt,data);
      } catch (e) {
        this.logger.error(`pay save data failed !`);
      }
      return "task";
    }
    return "";
  }
  async action({ doc, dac_directory, db }) {
    // this.logger.info(`-- dac directory: ${dac_directory}`);
    if (
      typeof doc.action.account != "undefined" &&
      doc.action.account == this.contract &&
      doc.action.name == "transfer"
    ) {
      this.db = db;
      this.logger.info(`----- watch transfer:${doc.action.account}`);

      this.logger.info("Reacting to transfer action");
      try {
        this.recalcTransfer(doc, db);
      } catch (e) {
        this.logger.info(`Reacting action error :${e}`);
      }
    }
  }

  async delta(doc) {}

  async replay() {
    this.logger.info("Replaying msigs");
  }
}

module.exports = new TransferActionHandler();

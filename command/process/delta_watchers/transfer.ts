const { loadConfig } = require("../../../common/utils/function");
const { TextDecoder, TextEncoder } = require("text-encoding");
const { Api, JsonRpc, Serialize } = require("eosjs");
const fetch = require("node-fetch");
const zlib = require("zlib");

import { asset } from "eos-common";

class TransferHandler {
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
      "watcher-delta-transfer"
    );
  }

  async recalcAccount(doc, db,amq) {
    this.logger.debug("Recalc", doc);
    const quantity = doc.data.balance;
    // to big int
    const quan = asset(quantity);
    const amount: number = Number(quan.amount);
    const symbol = quan.symbol.code().toString();

    const data = {
      name: doc.scope,
      amount: amount,
      quantity: quantity,
      symbol: symbol,
    };
    this.logger.debug(`----- updateAccountOne: ${data.symbol}`);
    await db.updateAccountOne(data);
  }
  async recalcTokenStat(doc, db,amq) {
    this.logger.debug("recalcTokenStat", doc);
    try {
      const scope = doc.scope;
      this.logger.debug(`token stat scope: ${scope}`);

      const buffer = new Serialize.SerialBuffer({
        textEncoder: new TextEncoder(),
        textDecoder: new TextDecoder('utf-8'),
      });
      buffer.pushName(scope);
      const symbolName = buffer.getSymbolCode();
      const owner = doc.data.issuer;
      const supply = doc.data.supply;
      const opt = {
        owner: owner,
        symbol: symbolName,
      };
      const data = {
        supply: supply,
      };
      this.logger.info(`begin update dacs ${JSON.stringify(data)}`);
  
      await db.updateDacsOne(opt, data);
    } catch (e) {
      this.logger.error(`recalcTokenStat get error: ${e}`);
    }
  }
  async action({ doc, dac_directory, db, amq }) {
    this.logger.debug(`-- watch delta transfer: ${doc}`);
    if (
      typeof doc.code != "undefined" &&
      doc.code == this.contract 
    ) {
      if (doc.table == "accounts") {
        this.logger.debug(`----- watch transfer:${doc}`);
        try {
          this.recalcAccount(doc,db,amq);
        } catch (e) {
          this.logger.info(`Reacting action error :${e}`);
        }
      }else if (doc.table == "stat") {
        this.logger.debug(`----- watch tokenContract stat:${doc}`);
        try {
          this.recalcTokenStat(doc,db,amq);
        } catch (e) {
          this.logger.info(`Reacting action error :${e}`);
        }
      }

    }
  }

  async delta(doc) {
    // nothing
  }

  async replay() {
    this.logger.info("Replaying msigs");
  }
}

module.exports = new TransferHandler();

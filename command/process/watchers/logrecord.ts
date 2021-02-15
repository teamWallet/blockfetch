const { loadConfig } = require("../../../common/utils/function");
// const { TextDecoder, TextEncoder } = require("text-encoding");
const { Api, JsonRpc } = require("eosjs");
// const fetch = require("node-fetch");
const zlib = require("zlib");

class LogRecordHandler {
  public config: any;
  public db: any;
  public contract: any;
  public dac_config: any;
  public api: any;
  public logger: any;
  public dac_directory: any;

  constructor() {
    this.config = loadConfig();

    this.contract = this.config.eos.logrecordContract || "daclogrecord";

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
      "watcher-logrecord"
    );
  }

  async recalcMsigs(doc, db, retry = false) {
    // this.logger.info('Recalc', doc);

    // this.logger.info(`Recalc profile ${doc.action}`);
    this.logger.info(`Recalc logrecord name ${doc.action.name}`);

    const logrecordData = doc.action.data.content.split("@");
    if (logrecordData[0] && logrecordData[1] && logrecordData[2]) {
      if (logrecordData[0] == "task") {
      } else {
      }
    }
  }

  async action({ doc, dac_directory, db }) {
    // this.logger.info(`-- dac directory: ${dac_directory}`);
    if (
      typeof doc.action.account != "undefined" &&
      doc.action.account == this.contract &&
      doc.action.name == "logrecord"
    ) {
      this.db = db;
      // this.logger.info(`----- watch transfer:${doc.action.account}`);

      this.logger.info("Reacting to logrecord action");
      try {
        this.recalcMsigs(doc, db);
      } catch (e) {
        this.logger.info(`Reacting logrecord action error :${e}`);
      }
    }
  }

  async delta(doc) {}

  async replay() {
    this.logger.info("Replaying LogRecord");
  }
}

module.exports = new LogRecordHandler();

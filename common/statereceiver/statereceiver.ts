const { DFConnection } = require("./dfuse/dfuse_graph");
// const { DFConnection } = require("./dfuse_ws");
const { Connection } = require("./native/connection");

class StateReceiver {
  public trace_handlers: any;
  public delta_handlers: any;
  public done_handlers: any;
  public progress_handlers: any;
  public connected_handlers: any;
  public block_handlers: any;
  public fork_handlers: any;
  public irreversible_only: any;
  public config: any;
  public mode: any;
  public start_block: any;
  public end_block: any;
  public current_block: any;
  public complete: any;
  public connection: any;
  public end: any;
  public current: any;
  public logger: any;
  /* mode 0 = serial, 1 = parallel */
  constructor({
    startBlock = 0,
    endBlock = 0xffffffff,
    config,
    mode = 0,
    irreversibleOnly = false,
  }) {
    this.trace_handlers = [];
    this.delta_handlers = [];
    this.done_handlers = [];
    this.progress_handlers = [];
    this.connected_handlers = [];
    this.block_handlers = [];
    this.fork_handlers = [];
    this.irreversible_only = irreversibleOnly;
    this.logger = require("../connections/logger")(
      "statereceiver",
      config.logger
    );
    this.logger.debug(`statereceiver config:${config}`);
    this.logger.debug(`statereceiver config:${config}`);

    this.config = config;
    this.mode = mode;

    this.start_block = startBlock;
    this.end_block = endBlock;
    this.current_block = -1;
    this.complete = true;

    const mode_str = mode == 0 ? "serial" : "parallel";

    this.logger.debug(
      `Created StateReceiver, Start : ${startBlock}, End : ${endBlock}, Mode : ${mode_str}`
    );
  }

  registerBlockHandler(h) {
    this.block_handlers.push(h);
  }

  registerDoneHandler(h) {
    this.done_handlers.push(h);
  }

  registerTraceHandler(h) {
    this.trace_handlers.push(h);
  }

  registerDeltaHandler(h) {
    this.delta_handlers.push(h);
  }

  registerProgressHandler(h) {
    this.progress_handlers.push(h);
  }

  registerForkHandler(h) {
    this.fork_handlers.push(h);
  }

  registerConnectedHandler(h) {
    this.connected_handlers.push(h);
  }

  status() {
    const start = this.start_block;
    const end = this.end_block;
    const current = this.current_block;

    return { start, end, current };
  }

  async start() {
    this.complete = false;

    if (this.config.dfuse) {
      this.connection = new DFConnection({
        config: this.config,
        // socketAddresses: this.config.eos.wsEndpoints,
        receivedAbi: (() => {
          this.requestBlocks();

          this.connected_handlers.forEach(
            ((handler) => {
              handler(this.connection);
            }).bind(this)
          );
        }).bind(this),
        receivedBlock: this.receivedBlock.bind(this),
      });
      await this.waitfor();
    } else {
      this.connection = new Connection({
        logger: this.logger,
        socketAddress: this.config.eos.wsEndpoint,
        socketAddresses: this.config.eos.wsEndpoints,
        receivedAbi: (() => {
          this.requestBlocks();

          this.connected_handlers.forEach(
            ((handler) => {
              handler(this.connection);
            }).bind(this)
          );
        }).bind(this),
        receivedBlock: this.receivedBlock.bind(this),
      });
    }
  }

  async waitfor() {
    if (this.config.dfuse) {
      await this.connection.waitfor();
    }
  }
  async restart(startBlock, endBlock) {
    this.complete = false;

    this.start_block = startBlock;
    this.end_block = endBlock;
    if (this.config.dfuse) {
      this.connection = new DFConnection({
        config: this.config,
        receivedAbi: (() => {
          // todo get blocks
          this.requestBlocks();

          this.connected_handlers.forEach(
            ((handler) => {
              handler(this.connection);
            }).bind(this)
          );
        }).bind(this),
        receivedBlock: this.receivedBlock.bind(this),
      });
    } else {
      this.connection = new Connection({
        logger: this.logger,
        socketAddress: this.config.eos.wsEndpoint,
        socketAddresses: this.config.eos.wsEndpoints,
        receivedAbi: (() => {
          this.requestBlocks();

          this.connected_handlers.forEach(
            ((handler) => {
              handler(this.connection);
            }).bind(this)
          );
        }).bind(this),
        receivedBlock: this.receivedBlock.bind(this),
      });
    }

    // await this.requestBlocks()
  }

  destroy() {
    this.logger.debug(`Destroying (TODO)`);
  }

  async requestBlocks() {
    try {
      this.current_block = 0;

      await this.connection.requestBlocks({
        irreversibleOnly: this.irreversible_only,
        start_block_num: parseInt(this.start_block),
        end_block_num: parseInt(this.end_block),
        have_positions: [],
        fetch_block: true,
        fetch_traces: this.trace_handlers.length > 0,
        fetch_deltas: this.delta_handlers.length > 0,
      });
    } catch (e) {
      this.logger.error(e);
      process.exit(1);
    }
  }

  async handleFork(block_num) {
    this.fork_handlers.forEach((h) => {
      h(block_num);
    });
  }

  async receivedBlock(response, block?, traces?, deltas?) {
    if (this.config.dfuse) {
      // dfuse
      if (!response.block) return;
      let block_num = response.block.num;
      this.logger.debug(response.block);

      if (this.mode === 0 && block_num <= this.current_block) {
        this.logger.debug(
          `Detected fork in serial mode: current:${block_num} <= head:${this.current_block}`
        );
        // handle fork
        await this.handleFork(block_num);
      }

      this.complete = false;

      this.current_block = block_num;

      if (!(block_num % 1000)) {
        this.logger.debug(`StateReceiver : received block ${block_num}`);
        let { start, end, current } = this.status();
        this.logger.debug(`Start: ${start}, End: ${end}, Current: ${current}`);
      }
      // todo get timestamp
      let block_timestamp = null;
      if (response.block.timestamp) {
        block_timestamp = new Date(
          response.block.timestamp.replace([".000", ".500"], "Z")
        );
      }
      // deltas 处理
      this.logger.debug(typeof deltas);
      this.logger.debug(`get deltas: ${deltas}`);

      if (deltas && deltas.length) {
        this.logger.debug("---- beign deltas ----");
        this.delta_handlers.forEach(
          ((handler) => {
            if (this.mode === 0) {
              handler.processDelta(
                block_num,
                deltas,
                this.connection.types,
                block_timestamp
              );
            } else {
              handler.queueDelta(
                block_num,
                deltas,
                this.connection.types,
                block_timestamp
              );
            }
          }).bind(this)
        );
      }
      // traces 处理
      if (traces) {
        this.trace_handlers.forEach((handler) => {
          if (this.mode === 0) {
            handler.processTrace(
              block_num,
              traces,
              block_timestamp,
              response.trace.id
            );
          } else {
            handler.queueTrace(
              block_num,
              traces,
              block_timestamp,
              response.trace.id
            );
          }
        });
      }
      // block 处理 nothing
      if (block) {
        this.block_handlers.forEach((handler) => {
          if (this.mode === 0) {
            handler.processBlock(block);
          } else {
            handler.queueBlock(block);
          }
        });
      }

      if (this.current_block === this.end_block - 1) {
        this.logger.debug(`State Handler complete!`);
        this.complete = true;
        this.done_handlers.forEach((handler) => {
          handler();
        });
      }

      this.progress_handlers.forEach((handler) => {
        handler(100 * ((block_num - this.start_block) / this.end_block));
      });
    } else {
      if (!response.this_block) return;
      let block_num = response.this_block.block_num;

      if (this.mode === 0 && block_num <= this.current_block) {
        this.logger.debug(
          `Detected fork in serial mode: current:${block_num} <= head:${this.current_block}`
        );
        await this.handleFork(block_num);
      }

      this.complete = false;

      this.current_block = block_num;

      // if (!(block_num % 1)) {
      if (!(block_num % 1000)) {
        this.logger.debug(`StateReceiver : received block ${block_num}`);
        let { start, end, current } = this.status();
        this.logger.debug(`Start: ${start}, End: ${end}, Current: ${current}`);
      }

      let block_timestamp = null;
      if (block) {
        block_timestamp = new Date(
          block.timestamp.replace([".000", ".500"], "Z")
        );
      }
      // deltas 处理
      if (deltas && deltas.length) {
        this.delta_handlers.forEach(
          ((handler) => {
            if (this.mode === 0) {
              // this.logger.debug(
              //   `0 StateReceiver : queueDelta block ${block_num}`
              // );
              // default use 0
              handler.processDelta(
                block_num,
                deltas,
                this.connection.types,
                block_timestamp
              );
            } else {
              this.logger.debug(
                `1 StateReceiver : queueDelta block ${block_num}`
              );

              handler.queueDelta(
                block_num,
                deltas,
                this.connection.types,
                block_timestamp
              );
            }
          }).bind(this)
        );
      }
      // traces 处理
      if (traces) {
        this.trace_handlers.forEach((handler) => {
          if (this.mode === 0) {
            // this.logger.debug(`0 StateReceiver : processTrace block ${block_num}`);

            handler.processTrace(block_num, traces, block_timestamp);
          } else {
            // this.logger.debug(`1 StateReceiver : processTrace block ${block_num}`);
            handler.queueTrace(block_num, traces, block_timestamp);
          }
        });
      }
      if (block) {
        this.block_handlers.forEach((handler) => {
          if (this.mode === 0) {
            handler.processBlock(block);
          } else {
            handler.queueBlock(block);
          }
        });
      }

      if (this.current_block === this.end_block - 1) {
        this.logger.debug(`State Handler complete!`);
        this.complete = true;
        this.done_handlers.forEach((handler) => {
          handler();
        });
      }

      this.progress_handlers.forEach((handler) => {
        handler(100 * ((block_num - this.start_block) / this.end_block));
      });
    }
  } // receivedBlock
}

module.exports = StateReceiver;

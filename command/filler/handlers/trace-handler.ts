export class TraceHandler {
  public amq: any;
  public action_handler: any;
  public delta_handler: any;
  public config: any;
  public logger: any;

  constructor({ queue, action_handler, config, logger, delta_handler }) {
    this.amq = queue;
    this.action_handler = action_handler;
    this.logger = logger;
    if (config.dfuse) {
      this.logger.info("enable delta_handler");
      this.delta_handler = delta_handler;
    }
    this.config = config;
  }

  async queueTrace(block_num, traces, block_timestamp, trx_id) {
    if (this.config.dfuse) {
      // dfuse
      for (const action of traces) {
        this.logger.debug(action);

        this.action_handler.queueAction(
          block_num,
          action,
          trx_id,
          block_timestamp
        );
        let deltas = [];
        if (action.dbOps && action.dbOps.length) {
          this.logger.debug(`----- dbops:${action.dbOps}`);
          deltas = action.dbOps;

          this.delta_handler.processDelta(
            block_num,
            deltas,
            null,
            block_timestamp
          );
        }
        // break;
      }
    } else {
      for (const trace of traces) {
        switch (trace[0]) {
          case "transaction_trace_v0":
            const trx = trace[1];
            // this.logger.debug(trx);
            for (let action of trx.action_traces) {
              // this.logger.debug(action);
              switch (action[0]) {
                case "action_trace_v0":
                  this.action_handler.queueAction(
                    block_num,
                    action[1],
                    trx.id,
                    block_timestamp
                  );
                  break;
              }
            }
            break;
        }
      }
    }
  }

  async processTrace(block_num, traces, block_timestamp, trx_id) {
    // this.logger.debug(`Process block ${block_num}`)
    return this.queueTrace(block_num, traces, block_timestamp, trx_id);
  }
}

const globalAny:any = global;
globalAny.fetch = require("node-fetch");
globalAny.WebSocket = require("ws");
// import * as global.fetch from "node-fetch";
// import * as global.WebSocket from "ws";


// const MongoClient = require("mongodb").MongoClient;
import { DBHandle } from '../../db/database'; 

const { Serialize } = require("eosjs");
// const { TextDecoder, TextEncoder } = require("text-encoding");
import { TextDecoder, TextEncoder } from "util";

const zlib = require("zlib");
const {
  createDfuseClient,
  InboundMessage,
  InboundMessageType,
  waitFor
} = require("@dfuse/client");

function prettifyJson(input) {
  return JSON.stringify(input, undefined, 2);
}

const operation = `subscription ($query: String!, $cursor: String,$startBlock: Int64) {
  searchTransactionsForward(query: $query, cursor: $cursor, lowBlockNum: $startBlock,
    irreversibleOnly: true,liveMarkerInterval: 15) {
    undo
    cursor
    block {
      num
      id
      timestamp
    }

    trace {
      id
      block{
        id
        num
        timestamp
      }
      matchingActions {
        seq
        executionIndex
        receiver    
        account
        name
        receipt{
         	receiver
          digest
          globalSequence
          codeSequence
          abiSequence
        }
      	authorization{
          actor
          permission
        }
        data
        hexData
        json
        dbOps {
          operation
          newPayer
          oldPayer
          key {
            code
            table
            scope
            key
          }
          newData
          oldData
          oldJSON { object error }
          newJSON { object error }
        }
        dtrxOps {
          operation
          sender
          senderID
          payer
          trxID
          transaction {
            expiration
            refBlockNum
            maxCPUUsageMS
            delaySec
            actions {
              account
              name
              authorization {
                actor
                permission
              }
              json
            }
          }
        }
        ramOps {
          operation
          payer
          delta
          usage
        }
      }
    }
  }
}`;
class DFConnection {
	public receivedAbi: any;
	public receivedBlock: any;
	public config: any;
	public abi: any;
	public types: any;
	public tables: any;
	public blocksQueue: any;
	public inProcessBlocks: any;
	public socket_index: any;
	public currentArgs: any;
	public connected: any;
	public connecting: any;
	public connectionRetries: any;
	public maxConnectionRetries: any;
	public last_row_start: any;
	public last_action_start: any;
	public db: any;
	public client: any;
	public stream: any;
	public ws: any;
	public socketAddresses: any;

  constructor({ config, receivedAbi, receivedBlock }) {
    this.receivedAbi = receivedAbi;
    this.receivedBlock = receivedBlock;
    this.config = config;

    this.abi = null;
    this.types = null;
    this.tables = new Map();
    this.blocksQueue = [];
    this.inProcessBlocks = false;
    this.socket_index = 0;
    this.currentArgs = null;
    this.connected = false;
    this.connecting = false;
    this.connectionRetries = 0;
    this.maxConnectionRetries = 100;
    this.last_row_start = 1;
    this.last_action_start = 1;

    this.connect(this.config);
  }
  async connectDb() {
    this.db = await DBHandle.getInstance();
  }

  async getLastActionBlockNum() {
    // 
    try {
      let trx_data = await this.db.findLastActionOne();
      console.log("------- trx_data:", trx_data);
      console.log("--- block num:", trx_data.block_num);
      // this.last_action_start = trx_data.block_num + 1;
      return trx_data.block_num+1;
    } catch (e) {
      console.error("---- get database error!");
      return this.config.start_block_num;
    }
  }
  async getLastRowBlockNum() {
    try {
      let trx_data = await this.db.findLastTableOne();
      console.log("------- trx_data:", trx_data);
      console.log("--- block num:", trx_data.block_num);
      // this.last_action_start = trx_data.block_num + 1;
      return trx_data.block_num+1;
    } catch (e) {
      console.error("---- get database error!");
      return this.config.start_block_num;
    }
  }
  async connect(config) {
    if (!this.connected && !this.connecting) {
      console.error(`Websocket connecting to ${config}`);

      this.connecting = true;
      try {
        // get mongdb index
        await this.connectDb();
        let action_num = await this.getLastActionBlockNum();
        console.log("get action num:", action_num);

        let row_num = await this.getLastRowBlockNum();
        console.log("contract row: ", row_num);

        // sleep
        // const sleep = () => new Promise((res, rej) => setTimeout(res, 2000));
        // console.log(new Date());
        // await sleep();
        // console.log(new Date());
        let start_block_num = Math.max(
          this.config.start_block_num,
          action_num,
          row_num,
        );
        console.log("start block num:", start_block_num);
        console.log("sleep begin 2 sec");

        this.client = createDfuseClient({
          apiKey: config.dfuse_api_key,
          network: config.network
        });

        let accounts = "(";

        for (let i = 0, len = config.eos.contracts.length; i < len; i++) {
          let d = config.eos.contracts[i];
          console.log(d);

          if (i != 0) {
            accounts += " OR ";
          }
          accounts += "account:";
          accounts += d;
        }
        accounts += ")";
        console.log("query account:", accounts);
        let querVar = { startBlock: start_block_num, query: accounts };
        console.log(querVar);
        this.stream = await this.client.graphql(
          operation,
          this.onMessage.bind(this),
          {
            variables: querVar
          }
        );
      } catch (e) {
        console.log(e);
        process.exit(1);
      }
    }
  }
  async waitfor() {
    await waitFor(15000);
    await this.stream.join();

    await this.stream.close();
    // reconnect
    console.log("--- wait for over ----");
    this.client.release();
    await this.loop();
  }
  async loop() {
    this.connected = false;
    this.connecting = false;

    await this.connect(this.config);
    await this.waitfor();
  }

  reconnect() {
    // if (this.connectionRetries > this.maxConnectionRetries) {
    //   console.error(
    //     `Exceeded max reconnection attempts of ${this.maxConnectionRetries}`
    //   );
    //   return;
    // } else {
    //   const timeout = Math.pow(2, this.connectionRetries / 5) * 1000;
    //   console.log(`Retrying with delay of ${timeout / 1000}s`);
    //   setTimeout(() => {
    //     this.connect(endpoint);
    //   }, timeout);
    //   this.connectionRetries++;
    // }
  }

  serialize(type, value) {
    const buffer = new Serialize.SerialBuffer({
      textEncoder: new TextEncoder(),
      textDecoder: new TextDecoder()
    });
    Serialize.getType(this.types, type).serialize(buffer, value);
    return buffer.asUint8Array();
  }

  deserialize(type, array) {
    const buffer = new Serialize.SerialBuffer({
      textEncoder: new TextEncoder(),
      textDecoder: new TextDecoder(),
      array
    });
    let result = Serialize.getType(this.types, type).deserialize(
      buffer,
      new Serialize.SerializerState({ bytesAsUint8Array: true })
    );
    if (buffer.readPos != array.length) throw new Error("oops: " + type); // todo: remove check

    return result;
  }

  toJsonUnpackTransaction(x) {
    return JSON.stringify(
      x,
      (k, v) => {
        if (k === "trx" && Array.isArray(v) && v[0] === "packed_transaction") {
          const pt = v[1];
          let packed_trx = pt.packed_trx;
          console.log(`Compression is ${pt.compression}`);
          if (pt.compression === 0)
            packed_trx = this.deserialize("transaction", packed_trx);
          else if (pt.compression === 1)
            packed_trx = this.deserialize(
              "transaction",
              zlib.unzipSync(packed_trx)
            );
          return { ...pt, packed_trx };
        }
        if (k === "packed_trx" && v instanceof Uint8Array)
          return this.deserialize("transaction", v);
        if (v instanceof Uint8Array) return `(${v.length} bytes)`;
        return v;
      },
      4
    );
  }

  send(request) {
    this.ws.send(this.serialize("request", request));
  }

  onConnect() {
    this.connected = true;
    this.connecting = false;
    this.connectionRetries = 0;
  }

  onMessage(message) {
    console.log("message:", message);
    try {
      if (message.type === "error") {
        console.log("An error occurred", message.errors, message.terminal);
      }

      if (message.type === "data") {
        const data = message.data.searchTransactionsForward;
        console.log("data:", data);
        this.get_blocks_result_v0(data);

        this.stream.mark({ cursor: data.cursor });
      }

      if (message.type === "complete") {
        console.log("Stream completed");
      }
    } catch (e) {
      console.log(e);
      process.exit(1);
    }
  }

  onClose() {
    console.error(
      `Websocket disconnected from ${this.socketAddresses[this.socket_index]}`
    );
    this.ws.terminate();
    this.abi = null;
    this.types = null;
    this.tables = new Map();
    this.blocksQueue = [];
    this.inProcessBlocks = false;
    this.connected = false;
    this.connecting = false;

    this.reconnect();
  }

  onOpen() {
    this.requestBlocks(this.currentArgs);
  }

  requestStatus() {
    this.send(["get_status_request_v0", {}]);
  }

  requestBlocks(requestArgs) {
    if (!this.currentArgs) {
      this.currentArgs = {
        start_block_num: 0,
        end_block_num: 0xffffffff,
        max_messages_in_flight: 5,
        have_positions: [],
        irreversible_only: false,
        fetch_block: false,
        fetch_traces: false,
        fetch_deltas: false,
        ...requestArgs
      };
    }
    this.send(["get_blocks_request_v0", this.currentArgs]);
  }

  get_status_result_v0(response) {
    console.log(response);
  }
  //
  get_blocks_result_v0(response) {
    this.blocksQueue.push(response);
    this.processBlocks();
  }

  async processBlocks() {
    if (this.inProcessBlocks) return;
    this.inProcessBlocks = true;
    while (this.blocksQueue.length) {
      let response = this.blocksQueue.shift();
      let block,
        traces = [],
        deltas = [];
      if (response.trace == undefined || response.trace == null) {
        console.log("get trace is null");
        continue;
      }
      block = response.block;
      traces = response.trace.matchingActions;
      console.log(`${response.trace.matchingActions}`);

      await this.receivedBlock(response, block, traces, deltas);
    }
    this.inProcessBlocks = false;
  }

  forEachRow(delta, f) {
    const type = this.tables.get(delta.name);
    for (let row of delta.rows) {
      let data;
      try {
        data = this.deserialize(type, row.data);
      } catch (e) {
        console.error(e);
      }
      if (data) f(row.present, data[1]);
    }
  }

  dumpDelta(delta, extra) {
    this.forEachRow(delta, (present, data) => {
      console.log(this.toJsonUnpackTransaction({ ...extra, present, data }));
    });
  }
} // DFConnection

// module.exports = { DFConnection };
export { DFConnection };

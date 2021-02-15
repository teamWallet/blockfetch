// const connectMongDB = require("../connections/mongo");
import * as config from "config";
import { DBHandle } from "../db/database";

class ChainData {

}

function loadConfig() {
  //   const config_name = process.env.CONFIG ? process.env.CONFIG : "";
  const config_name = "local";
  if (!config_name) {
    throw new Error(
      `Config not specified, please provide CONFIG environmental variable`
    );
  }
  // const config = require(`./${config_name}.config`).config;
  const conf = config.get<object>('chain');

  // conf.name = config_name;

  return conf;
}

async function getLastActionBlockNum() {
  //
  try {
    const db = await DBHandle.getInstance();
    const data = await db.findLastActionOne();
    console.debug("=====", data);
    if (data.length > 0) {
      const trx_data = data[0];
      console.log("------- trx_data:", trx_data);
      console.log("--- block num:", trx_data.block_num);
      // this.last_action_start = trx_data.block_num + 1;
      return trx_data.block_num + 1;
    } else {
      return -1;
    }
  } catch (e) {
    console.error("---- get database error!", e);
    return -1;
  }
}
async function getLastRowBlockNum() {
  try {
    const db = await DBHandle.getInstance();
    const data = await db.findLastTableOne();
    console.debug("=====", data);

    if (data.length > 0) {
      const trx_data = data[0];
      console.log("------- trx_data:", trx_data);
      console.log("--- block num:", trx_data.block_num);
      return trx_data.block_num + 1;
    } else {
      return -1;
    }
    // this.last_action_start = trx_data.block_num + 1;
  } catch (e) {
    console.error("---- get database error!", e);
    return -1;
  }
}

async function getRestartBlock() {
  const config = loadConfig();
  //
  const actions_block = await getLastActionBlockNum();
  const contract_rows_block = await getLastRowBlockNum();
  console.log(`get start block ${actions_block}, ${contract_rows_block}`);
  let block = Math.min(actions_block, contract_rows_block);

  if (block > 1) {
    console.log(`Getting restart block from ${block}`);
  } else {
    block = 0;
  }

  return block;
}
async function getAllTokenList(): Promise<string[]> {
  //
  try {
    const db = await DBHandle.getInstance();
    const data = await db.findLastActionOne();
    console.debug("=====", data);
    if (data.length > 0) {
      const trx_data = data[0];
      console.log("------- trx_data:", trx_data);
      console.log("--- block num:", trx_data.block_num);
      // this.last_action_start = trx_data.block_num + 1;
      return trx_data.block_num + 1;
    } else {
      return [];
    }
  } catch (e) {
    console.error("---- get database error!", e);
    return [];
  }
}

module.exports = { loadConfig, getRestartBlock };

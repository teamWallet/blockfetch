// const MongoLong = require('mongodb').Long;
// const connectMongo = require('../../common/connections/mongo');
const { loadConfig } = require("../../common/utils/function");
import { DBHandle } from "../../common/db/database";
import { ConnectionOptions, LessThan, In } from "typeorm";
const util = require("util");

async function dacTableAtBlock({
  db,
  code,
  table,
  scope = "",
  skip = 0,
  limit = 100,
  data_query = {},
  block_num = -1,
  exclude_scope = false,
}) {
  // return new Promise(async (resolve, reject) => {
  // where code = code ,table = table,scope = scope block_num
  // orderby block_num desc, present desc
  // group by
  // for (let col in data_query) {
  //   const keyData = 'data.' + col;
  //   findPipe.where[keyData] = data_query[col];
  // }
  let queryData = "";
  for (let col in data_query) {
    // second_match['data.' + col] = data_query[col]
    queryData += util.format(`"data"->>'%s'='%s' `, col, data_query[col]);
  }
  let query = "";
  if (block_num <= -1) {
    if (queryData == "") {
      query = util.format(
        `SELECT "contract_tables".* FROM "contract_tables" WHERE  \
      "code" = '%s' AND "table" = '%s' \
      AND "scope"='%s' \
      ORDER BY "block_num" DESC LIMIT %d OFFSET %d`,
        code,
        table,
        scope,
        limit,
        skip
      );
    } else {
      query = util.format(
        `SELECT "contract_tables".* FROM "contract_tables" WHERE  \
      "code" = '%s' AND "table" = '%s' \
      AND "scope"='%s' \
      AND %s ORDER BY "block_num" DESC LIMIT %d OFFSET %d`,
        code,
        table,
        scope,
        queryData,
        limit,
        skip
      );
    }
  } else {
    if (queryData == "") {
      query = util.format(
        `SELECT "contract_tables".* FROM "contract_tables" WHERE "block_num" < '%d' \
    AND "code" = '%s' AND "table" = '%s' \
    AND "scope"='%s' \
    ORDER BY "block_num" DESC LIMIT %d OFFSET %d`,
        block_num + 1,
        code,
        table,
        scope,
        limit,
        skip
      );
    } else {
      query = util.format(
        `SELECT "contract_tables".* FROM "contract_tables" WHERE "block_num" < '%d' \
        AND "code" = '%s' AND "table" = '%s' \
        AND "scope"='%s' \
        AND %s ORDER BY "block_num" DESC LIMIT %d OFFSET %d`,
        block_num + 1,
        code,
        table,
        scope,
        queryData,
        limit,
        skip
      );
    }
  }

  console.log("------------ query:", query);

  const filter = async (results) => {
    results.forEach((doc) => {
      // console.log(doc);
      doc.results = doc.results.map((result) => {
        delete result._id;
        delete result.present;

        return result;
      });
      // console.log('COUNT', doc.count)
      doc.count = doc.count.length ? doc.count[0].count : 0;
      // resolve(doc);
      return doc;
      // console.log("DOC", doc.results)
      // ret_data.push({block_num:doc.block_num, data:doc.data})
    });
  };

  try {
    const localDB: DBHandle = await DBHandle.getInstance();
    const result = await localDB.dacAggregateProposeQuery(query);
    // console.log('get table:', result);
    //
    // let doc = [];
    // for (const value of result) {
    // }
    // const resp = await filter(result);
    return result;
    // return resp;
  } catch (e) {
    console.error(e);
  }
  // });
}

class eosTableIter {
  public code: any;
  public scope: any;
  public table: any;
  public api: any;
  public greed_factor: any;
  public primary_key: any;
  public current_set: any;
  public current_pos: any;
  public chunk_size: any;
  public has_more: any;
  public unique_index: any;

  constructor({ code, scope, table, api, greed_factor, primary_key }) {
    if (greed_factor > 19) {
      throw new Error(`greed_factor must be less than 20`);
    }
    this.code = code;
    this.scope = scope;
    this.table = table;
    this.api = api;
    this.greed_factor = greed_factor;
    this.primary_key = primary_key;
    this.current_set = [];
    this.current_pos = 0;
    this.chunk_size = 500;
    this.has_more = false;
    this.unique_index = new Set();
  }

  [Symbol.asyncIterator]() {
    return {
      next: () => {
        return new Promise((resolve, reject) => {
          if (
            !this.current_set.length ||
            (this.current_pos >= this.current_set.length && this.has_more)
          ) {
            // fastify.log.info('Fetching table data...', {code:this.code, scope:this.scope, table:this.table});
            const req: any = {
              code: this.code,
              scope: this.scope,
              table: this.table,
              limit: this.chunk_size,
            };
            if (this.current_set.length) {
              req.lower_bound = this.current_set[
                this.current_set.length - this.greed_factor
              ][this.primary_key];
            }
            // ---
            this.api.rpc.get_table_rows(req).then((res) => {
              if (res.rows && res.rows.length) {
                if (this.current_set.length) {
                  for (let i = 0; i < this.greed_factor; i++) {
                    res.rows.shift();
                  }
                }
                this.current_set = res.rows;
                this.has_more = res.more;
                this.current_pos = 0;
                resolve({ value: this.current_set[this.current_pos++] });
              } else {
                resolve({ done: true });
              }
            });
          } else if (
            !this.has_more &&
            this.current_pos >= this.current_set.length
          ) {
            resolve({ done: true });
          } else {
            let next = this.current_set[this.current_pos++];
            if (this.primary_key) {
              while (this.unique_index.has(next[this.primary_key])) {
                next = this.current_set[this.current_pos++];
              }
            }

            resolve({ value: next });
          }
        });
      },
    };
  }
}

// export { eosTableAtBlock, eosTableIter };
export { dacTableAtBlock, eosTableIter };

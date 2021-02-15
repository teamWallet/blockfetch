const winston = require("winston");
import * as config from "config";

// const DatadogTransport = require('winston-datadog');
const DatadogTransport = require("@shelf/winston-datadog-logs-transport");

const logger = (service = "undefined-service") => {
  // const _l = winston.createLogger({
  //   level: config.level,
  //   format: winston.format.json(),
  //   defaultMeta: { service },
  //   transports: [
  //     new winston.transports.Console({
  //       format: winston.format.simple(),
  //       colorize: true,
  //     }),
  //   ],
  // });
  const _l = winston.createLogger({
    level: config.get<string>('app.logger.level') || 'debug',
    defaultMeta: { service: "dac" },
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
      // prettyJson,
    ),
    transports: [new winston.transports.Console()],
  });
  if (config?.datadog && config.datadog.apiKey) {
    _l.add(
      new DatadogTransport({
        apiKey: config.datadog.apiKey,
        metadata: {
          ddsource: service,
          environment: config.environment,
        },
      })
    );
  }

  // To make compatible with fastify logger
  // _l.log = () => {_l.info(arguments[0])};
  _l.fatal = (...args: string[]) => {
    _l.error(args[0]);
  };
  _l.trace = (...args: string[]) => {
    _l.silly(args[0]);
  };

  return _l;
};
module.exports = logger;

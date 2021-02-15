const Amqp = require("amqplib");

const MqDeltaName = "contract_row_test";
const MqActionName = "action_test";
const MsgActionName = "msg_event";
class RabbitSender {
  public channel: any;
  public config: any;
  public isConnect: boolean;
  public static closeHandlers: any;
  public conn: any;
  constructor(channel, config) {
    this.channel = channel;
    this.config = config;
    this.isConnect = false;
  }

  static async init(config) {
    try{
      const conn = await Amqp.connect(config.connectionString);

      const channel = await conn.createChannel();
      // channel.assertQueue("block_range_test", { durable: false });
      // channel.assertQueue("contract_row_test", { durable: false });
      // channel.assertQueue("permission_link_test", { durable: false });
      channel.assertQueue(MqActionName, { durable: false });
      channel.assertQueue(MqDeltaName, { durable: false });
      channel.assertQueue(MsgActionName, { durable: false });

      console.log(`Connected to ${config.connectionString}`);

      const rs = new RabbitSender(channel, config);

      conn.on("error", function(err) {
        if (err.message !== "Connection closing") {
          console.error("[AMQP] conn error", err.message);
        }
      });
      conn.on(
        "close",
        function() {
          console.error("------ [AMQP] closing");
          if (RabbitSender.closeHandlers && RabbitSender.closeHandlers.length) {
            RabbitSender.closeHandlers.forEach(h => {
              h();
            });
          }
        }.bind(rs)
      );
      return rs;
    }catch (e) {
      console.error(">>>>>>>>>>>>> ------ [AMQP] connect failed!!!",e);
    }
  }
  async close() {
    try{
      console.error("[AMQP] begin close");
      Amqp.close();
      
    }catch (e) {
      console.error(">>>>>>>>>>>>> ------ [AMQP] connect failed!!!",e);
    }
  }
  async send(queue_name, msg) {
    try{ 
      if (!Buffer.isBuffer(msg)) {
        msg = Buffer.from(msg);
      }
      return this.channel.sendToQueue(queue_name, msg);
    }catch(e) {
      console.error(">>>>>>>>>>>>> [AMQP] send channel failed!!!",e);
      // 
    }
  }

  async listen(queue_name, cb) {
    this.channel.prefetch(1);
    // await this.channel.assertQueue(queue_name, {durable: true})
    this.channel.consume(queue_name, cb, { noAck: false });
  }

  async ack(job) {
    return this.channel.ack(job);
  }

  async reject(job) {
    return this.channel.reject(job, true);
  }
}
RabbitSender.closeHandlers = [];

module.exports = RabbitSender;

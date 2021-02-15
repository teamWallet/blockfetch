module.exports = {
  apps: [
    {
      name: "block-filler",
      // 指定解释器
      interpreter: "/root/yyd/utu-blockfetch/node_modules/.bin/ts-node",
      // 解释器参数 -P 表示项目路径，会自动使用项目的 tsconfig.json
      // interpreter_args: "-P ./ -r tsconfig-paths/register",
      script: "command/filler/filler.ts",
      cwd: "/root/yyd/utu-blockfetch",
      instances: 1,
      ignore_watch: ["node_modules", "build", "logs"],
      exec_mode: "fork",
      // node_args: "--max_old_space_size=8192",
      out_file: "/tmp/block-filler-out.log",
      error_file: "/tmp/block-filler-error.log",
      // log_date_format: "YYYY-MM-DD_HH:mm:ss Z",
      max_restart: 5,
      env: {
        NODE_ENV: "dev",
      },
      env_dev: {
        NODE_ENV: "dev",
      },
      env_qa: {
        NODE_ENV: "qa",
      },
      env_prod: {
        NODE_ENV: "prod",
      },
    },
    {
      name: "block-processor",
      // 指定解释器
      interpreter: "/root/yyd/utu-blockfetch/node_modules/.bin/ts-node",
      // 解释器参数 -P 表示项目路径，会自动使用项目的 tsconfig.json, 这里碰到问题，在其他路径启动 ts，tsconfig-paths/register 找不到，会报错
      //interpreter_args: "-P ./ -r tsconfig-paths/register",
      script: "command/process/processor.ts",
      cwd: "/root/yyd/utu-blockfetch",
      instances: 1,
      ignore_watch: ["node_modules", "build", "logs"],
      exec_mode: "fork",
      // node_args: "--max_old_space_size=8192",
      out_file: "/tmp/block-processor-out.log",
      error_file: "/tmp/block-processor-error.log",
      // log_date_format: "YYYY-MM-DD_HH:mm:ss Z",
      max_restart: 5,
      kill_timeout: 1000,
      env: {
        NODE_ENV: "dev",
      },
      env_dev: {
        NODE_ENV: "dev",
      },
      env_qa: {
        NODE_ENV: "qa",
      },
      env_prod: {
        NODE_ENV: "prod",
      },
    },
  ],
};

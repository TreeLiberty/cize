const cluster = require('cluster');
const ci = require('../');
const path = require('path');
const fs = require('fs');
const os = require('os');
const stp = require('stp');
const console = require('console3');
const chokidar = require('chokidar');
const consts = require('./consts');

module.exports = function (cmdline) {

  //查看版本
  function version() {
    console.log(`${cmdline.NAME.toUpperCase()} ${cmdline.VERSION}${os.EOL}`);
    return true;
  }
  if (cmdline.options.has('-v')) return version();

  //显示帮助
  function help() {
    var info = fs.readFileSync(path.normalize(`${__dirname}/help.txt`)).toString();
    console.log(stp(info, {
      cmd: cmdline.NAME,
      conf: cmdline.CONFIG_FILE_NAME
    }) + os.EOL);
    return true;
  }
  if (cmdline.options.has('-h')) return help();

  //显示启动信息
  console.write('Strarting.');

  //检查 cizefile
  if (!fs.existsSync(cmdline.configFile)) {
    console.error(`${os.EOL}Not found "${cmdline.configFile}"${os.EOL}`);
    return help() && process.exit(1);
  }

  //初始化 worker 数量及记数变量
  var workerMax = Number(cmdline.options.getValue('-w')) || os.cpus().length;
  var workerCount = 0;
  var workerAllReady = false;

  //启动 workers
  function startWorkers(num) {
    cluster.fork();
    if ((--num) <= 0) return;
    setTimeout(function () {
      startWorkers(num);
    }, consts.WORKER_START_DELAY);
  }
  startWorkers(workerMax);

  //当有 worker 断开并退出时
  cluster.on('disconnect', (worker) => {
    workerCount--;
    console.warn(`#${worker.process.pid} disconnected`);
    cluster.fork();
  });

  //当有 worker 启动成功时
  cluster.on('message', function (data) {
    //如果发生错误
    if (!data.status) {
      console.error(os.EOL + data.message + os.EOL);
      return workerAllReady || process.exit(1);
    }
    //如果是某一 worker 重启
    if (workerAllReady) {
      return console.info(`#${data.pid} started`);
    }
    //初始起启信息
    process.stdout.write('.');
    workerCount++;
    if (workerCount >= workerMax) {
      console.log(os.EOL + data.message);
      workerAllReady = true;
    }
  });

  //监控配置文件
  chokidar.watch(cmdline.configFile, {
    ignoreInitial: true
  }).on('all', function (event, path) {
    console.info(`"${cmdline.configFile}" changed`);
    for (var id in cluster.workers) {
      cluster.workers[id].send(consts.WORKER_EXIT_CODE);
    }
  });

};
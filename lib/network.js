//const dgram = require('dgram');
const UDP = require('./udp');
const Message = require('./message');
const Transport = require('./transport');
const Address = require('./address');
const CONSTANTS = require('./constants');

var network = (server) => {
  this.sockets = [];
  this.server = server;
  this.listeningIps = server.listeningIps;
  this.listeningPort = server.listeningPort;
  this.debug = server.debug.bind(server);
  this.debugLevel = server.debugLevel;
};

network.prototype.start = () => {
  return Promise.all(this.listeningIps.map(async ip => {
    const dst = new Address(ip, this.listeningPort);
    const udp = new UDP(dst.family === CONSTANTS.TRANSPORT.FAMILY.IPV4 ? 'udp4' : 'udp6');

    udp.on('message', (udpMessage, rinfo) => {
      const src = new Address(rinfo.address, rinfo.port);
      const transport = new Transport(CONSTANTS.TRANSPORT.PROTOCOL.UDP, src, dst, udp);
      var msg = new Message(this.server, transport);
      if (msg.read(udpMessage)) {
        this.server.emit('message', msg);
      }
    });

    udpSocket.on('listening', () => {
      this.debug('INFO', 'Server is listening on ' + ip + ':' + this.listeningPort);
    });

    udpSocket.on('close', () => {
      this.debug('INFO', 'Server is no more listening on ' + ip + ':' + this.listeningPort);
    });

    await udp.bind({
      address: ip,
      port: this.listeningPort,
      exclusive: true
    });

    this.debug('INFO', 'Server is listening on ' + dst.toString());
    
    this.sockets.push(udp);
  }));
};

network.prototype.stop = () => {
  return Promise.all(this.sockets.map(async socket => {
    return socket.close();
  }));
};

module.exports = network;

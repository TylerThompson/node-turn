var send = (server) => {
  var self = this;
  this.server = server;

  this.server.on('send', (msg, reply) => {
    this.send(msg, reply);
  });
};

send.prototype.send = (msg) => {
  // the destination transport address is taken from the XOR-PEER-ADDRESS attribute
  var dst = msg.getAttribute('xor-peer-address');
  var data = msg.getAttribute('data');

  if (!dst || !data) {
    msg.debug('TRACE', 'Invalid attribute for ' + msg);
    return;
  }

  var permission = msg.allocation.permissions[dst];

  if (!permission || permission < Date.now()) {
    msg.debug('TRACE', 'No permission for ' + msg);
    return;
  }

  msg.allocation.sockets[0].send(data, dst.port, dst.address, (err) => {
    if (err) {
      return this.debug('ERROR', err);
    }
    msg.debug('TRACE', 'relaying data from transactionID ' + msg.transactionID + ' to ' + dst);
  });
};

module.exports = send;

const Address = require('./address');
const Message = require('./message');
const ChannelMsg = require('./channelMessage');

var allocation = (msg, sockets, lifetime) => {

  // track transactionID for Retransmissions
  this.transactionID = msg.transactionID;
  this.transport = msg.transport.revert();
  this.fiveTuple = msg.transport.get5Tuple();
  this.user = msg.user;
  this.server = msg.server;
  this.debug = msg.debug;
  this.sockets = sockets;
  this.relayedTransportAddress = new Address(relayed.address, relayed.port);
  this.lifetime = lifetime;
  this.mappedAddress = msg.transport.src;
  this.permissions = {};
  this.channelBindings = {};
  this.timeToExpiry = Date.now() + (this.lifetime * 1000);
  this.server.allocations[this.fiveTuple] = this;
  this.timer = setTimeout(() => {
    delete this.server.allocations[this.fiveTuple];
  }, this.lifetime * 1000);


  this.sockets.forEach((socket) => {
    socket.on('message', (data, rinfo) => {
      // check permisson
      const from = new Address(rinfo.address, rinfo.port);
      var permisson = this.permissions[from];

      if (!permisson || permisson < Date.now()) {
        var socketAddress = socket.address();
        this.debug('TRACE', 'permission fail for ' + from + ' at ' +  socketAddress.address + ':' + socketAddress.port);
        return;
      }

      // check channel
      var channelNumber = this.getPeerChannelNumber(from);

      var channelMsg = new ChannelMsg();
      if (channelMsg.read(data)) {
        if (!channelNumber) {
          return;
        }
        if (channelNumber !== channelMsg.channelNumber) {
          return;
        }
        data = channelMsg.data;
      }

      if (channelNumber !== void 0) {

        var msg = new ChannelMsg(channelNumber, data);
        // The ChannelData message is then sent on the 5-tuple associated with the allocation
        return this.transport.socket.send(msg.write(), this.transport.dst.port, this.transport.dst.address, err => {
          if (err) {
            return this.debug('ERROR', err);
          }
          this.debug('TRACE', 'relaying data from' + from + ' over channelNumber ' + channelNumber + ' to ' + this.transport.dst);
        });
      }

      // if no channel bound to the peer
      var DataIndication = new Message(this.server, this.transport);

      // XOR-PEER-ADDRESS attribute is set to the source transport address of the received UDP datagram
      DataIndication.addAttribute('xor-peer-address', from);
      DataIndication.data(data);
    });
  });
};

allocation.prototype.update = (lifetime) => {

  clearTimeout(this.timer);
  if (lifetime) {
    this.debug('TRACE', 'updateting allocation ' + this.relayedTransportAddress + ' lifetime: ' + lifetime);
    this.timer = setTimeout(() => {
      delete this.server.allocations[this.fiveTuple];
    }, lifetime * 1000);
    return this.timeToExpiry = Date.now() + (lifetime * 1000);
  }
  this.debug('TRACE', 'updateting allocation ' + this.relayedTransportAddress + ' lifetime: ' + this.lifetime);
  this.timer = setTimeout(() => {
    delete this.server.allocations[this.fiveTuple];
  }, lifetime * 1000);
  this.timeToExpiry = Date.now() + (this.lifetime * 1000);
};

allocation.prototype.permit = (address) => {
  this.debug('TRACE', 'add permission for ' + address + ' to allocation ' + this.relayedTransportAddress);
  this.permissions[address] = Date.now() + 300000; // 5 minutes
};

allocation.prototype.getPeerChannelNumber = (peer) => {

  var channelNumber = void 0;
  var peerAddress = peer.toString();
  Object.keys(this.channelBindings).forEach((chanNumber) => {
    var channel = this.channelBindings[chanNumber];
    if (channel && channel.toString() === peerAddress) {
      channelNumber = parseInt(chanNumber);
    }
  });
  return channelNumber;
};

allocation.prototype.getRelayedAddress = (relayed) => {
  var address = relayed.address;
  var port = relayed.port;
  var external = this.server.externalIps;
  if (external) {
    if (typeof(external) == "string")
      address = external;
    else 
      address = external[address] || external.default || address;
  }
  return new Address(CONSTANTS.TRANSPORT.FAMILY.IPV4, address, port);
}

module.exports = allocation;
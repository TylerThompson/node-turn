const crypto = require('crypto');
//const dgram = require('dgram');
const Address = require('../address');
const UDP = require('../udp');
const CONSTANTS = require('../constants');
const Allocation = require('../allocation');

var allocate = (server) => {
  //var this = this;
  this.server = server;
  this.lastRelayIp = this.server.relayIps[0];

  this.server.on('allocate', (msg, reply) => {
    this.allocate(msg, reply);
  });
};

allocate.prototype.allocate = (msg, reply) => {
  //var this = this;
  if (msg.allocation) {
    // check if it's a retransmission
    if (msg.allocation.transactionID === msg.transactionID) {
      msg.allocation.update();
      reply.addAttribute('xor-relayed-address', msg.allocation.relayedTransportAddress);
      reply.addAttribute('lifetime', msg.allocation.lifetime);
      reply.addAttribute('xor-mapped-address', msg.allocation.mappedAddress);
      reply.addAttribute('software', this.server.software);
      reply.addAttribute('message-integrity');
      return reply.resolve();
    }
    return reply.reject(437, 'Allocation Mismatch');
  }
  if (!msg.getAttribute('requested-transport')) {
    return reply.reject(400, 'Bad Request');
  } else if (msg.getAttribute('requested-transport') !== CONSTANTS.TRANSPORT.PROTOCOL.UDP) {
    return reply.reject(442, 'Unsupported Transport Protocol');
  }
  if (msg.getAttribute('dont-fragment')) {
    // TODO
    // send UDP datagrams with the DF bit set to 1
  }
  if (msg.getAttribute('reservation-token')) {
    if (msg.getAttribute('even-port')) {
      return reply.reject(400, 'Bad Request');
    }
    if (!this.checkToken(msg.getAttribute('reservation-token'))) {
      return reply.reject(508, 'Insufficient Capacity');
    }
  }

  if (msg.getAttribute('even-port') !== void 0) {
    // server checks that it can satisfy the request
    // TODO
    if (!1) { // eslint-disable-line no-constant-condition
      return reply.reject(508, 'Insufficient Capacity');
    }
  }

  if (!this.checkQuota(msg.getAttribute('username'))) {
    return reply.reject(486, 'Allocation Quota Reached');
  }

  var allocatedSockets = null;
  // chooses a relayed transport address for the allocation.
  if (msg.getAttribute('reservation-token')) {
    // uses the previously reserved transport address corresponding to the included token
    allocatedSockets = new Promise((resolve) => {
      resolve(this.server.reservations[msg.getAttribute('reservation-token')].socket);
    });
  } else if (msg.getAttribute('even-port') !== void 0) {
    // R bit set to 0
    if (!msg.getAttribute('even-port')) {
      // allocate a relayed transport address with an even port number
      allocatedSockets = this.allocateUdpEven(msg, false);
    } else {
      // R bit set to 1
      // look for a pair of port numbers N and N+1 on the same IP address, where N is even
      allocatedSockets = this.allocateUdpEven(msg, true);
    }
  } else {
    // allocates any available relayed transport address from the range 49152 - 65535
    allocatedSockets = this.allocateUdp(msg);
  }

  allocatedSockets.then((sockets) => {
    try {
      // determine the initial value of the time-to-expiry
      var lifetime = this.server.defaultAllocatetLifetime;

      if (msg.getAttribute('liftetime')) {
        lifetime = Math.min(msg.getAttribute('liftetime'), this.server.maxAllocateLifetime);
      }

      if (lifetime < this.server.defaultAllocatetLifetime) {
        lifetime = this.server.defaultAllocatetLifetime;
      }

      msg.allocation = new Allocation(msg, sockets, lifetime);

      reply.addAttribute('xor-relayed-address', msg.allocation.relayedTransportAddress);
      reply.addAttribute('lifetime', msg.allocation.lifetime);
      reply.addAttribute('xor-mapped-address', msg.allocation.mappedAddress);
      reply.addAttribute('software', this.server.software);
      reply.addAttribute('message-integrity');
      reply.resolve();

    } catch (e) {
      msg.debug('FATAL', e);
      reply.reject(500, 'Server Error');
    }
  }, () => {
    reply.reject(508, 'Insufficient Capacity');
  });
};

 function rand(num = 4) {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(num, (err, buf) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });
}

/*  https://tools.ietf.org/html/draft-ietf-tsvwg-port-randomization-09#section-3.3.2

    // Ephemeral port selection 
    num_ephemeral = max_ephemeral - min_ephemeral + 1;
    next_ephemeral = min_ephemeral + (random() % num_ephemeral);
    count = num_ephemeral;

    do {
        if(check_suitable_port(port))
                return next_ephemeral;

        next_ephemeral = min_ephemeral + (random() % num_ephemeral);
        count--;
    } while (count > 0);

    return ERROR;
*/

allocate.prototype.allocateUdp = async (msg) => {
  var num_ephemeral = this.server.maxPort - this.server.minPort + 1;
  var count = num_ephemeral;
  while (count--) {
    try {
      var next_ephemeral = this.server.minPort + (await rand() % num_ephemeral);
      var address = new Address(this.getRelayIp(msg), next_ephemeral);
      var socket = new UDP(address.family == CONSTANTS.TRANSPORT.FAMILY.IPV4 ? 'udp4' : 'udp6');
      await socket.bind({
        address: address.address,
        port: address.port,
        exclusive: true
      });
      return [socket];
    } catch (err) {
      socket.close();
    }
  }
  throw new Error('no available port in range');
};

allocate.prototype.allocateUdpEven = async (msg, evenPortRBit) => {
  var port1 = msg.transport.src.port;

  if (port1 < this.server.minPort) {
    throw new Error('no available port in range');
  }
  const address1 = new Address(this.getRelayIp(msg), port1);
  const udpSocket1 = new UDP(address1.family == CONSTANTS.TRANSPORT.FAMILY.IPV4 ? 'udp4' : 'udp6');
  const udpSocket1binding = udpSocket1.bind({
    address: address1.address,
    port: address1.port,
    exclusive: true
  });

  // R Bit = 1
  if (!evenPortRBit) {
    await udpSocket1binding;
    return [udpSocket1];
  }

  var port2 = port1 + 1;
  if (port2 > this.server.maxPort) {
    throw new Error('no available port in range');
  }
  const address2 = new Address(this.getRelayIp(msg), port2);
  const udpSocket2 = new UDP(address2.family == CONSTANTS.TRANSPORT.FAMILY.IPV4 ? 'udp4' : 'udp6');
  const udpSocket2binding = udpSocket2.bind({
    address: address2.address,
    port: address2.port,
    exclusive: true
  });

  await Promise.all(udpSocket1binding, udpSocket2binding);
  return [udpSocket1, udpSocket2];
};

allocate.prototype.getRelayIp = (msg) => {
  if (!this.server.relayIps || this.server.relayIps.length === 0) {
    return msg.transport.dst.address;
  }
  var i = this.server.relayIps.indexOf(this.lastRelayIp) + 1;
  if (i >= this.server.relayIps.length) {
    i = 0;
  }
  this.lastRelayIp = this.server.relayIps[i];
  return this.lastRelayIp;
};

allocate.prototype.checkToken = (token) => {
  return this.server.reservations[token] !== void 0;
};

allocate.prototype.checkQuota = (username) => {
  // TODO
  username;
  return true;
};

module.exports = allocate;

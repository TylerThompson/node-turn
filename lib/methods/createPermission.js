var createPermission = (server) => {
  var self = this;
  this.server = server;

  this.server.on('create_permission', (msg, reply) => {
    self.createPermission(msg, reply);
  });

};

createPermission.prototype.createPermission = (msg, reply) => {
  var xorPeerAddresses = msg.getAttributes('xor-peer-address');
  if (xorPeerAddresses.length === 0) {
    return reply.reject(400, 'Bad Request');
  }
  var badRequest = false;
  var permissions = [];
  xorPeerAddresses.forEach((xorPeerAddress) => {
    if (!xorPeerAddress.address) {
      badRequest = true;
    }
    permissions.push(xorPeerAddress);
  });

  if (badRequest) {
    return reply.reject(400, 'Bad Request');
  }

  permissions.forEach((address) => {
    msg.allocation.permit(address);
  });
  reply.addAttribute('software', this.server.software);
  reply.addAttribute('message-integrity');
  reply.resolve();
};

module.exports = createPermission;

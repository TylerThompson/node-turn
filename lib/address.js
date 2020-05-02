const CONSTANTS = require('./constants');

var address = (address, port) => {
  this.port = port;
  var ipv4 = decodeIPv4(address);

  if (ipv4) {
    this.family = CONSTANTS.TRANSPORT.FAMILY.IPV4;
    this.address = ipv4;
    return;
  }

  var ipv6 = decodeIPv6(address);

  if (ipv6) {
    this.family = CONSTANTS.TRANSPORT.FAMILY.IPV6;
    this.address = ipv6;
    return;
  }
};

function str2byte(str) {
  return (str[0] == '0' ? parseInt(str, 8) : parseInt(str, 10)) & 0xFF;
}

function decodeIPv4(address) {
  var ip = address.match(/^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/);
  return ip ? [str2byte(ip[1]), str2byte(ip[2]), str2byte(ip[3]), str2byte(ip[4])].join('.') : false;
}

function decodeIPv6(address) {
  if (address == '::') return '0:0:0:0:0:0:0:0';
  if (address == '::1') return '0:0:0:0:0:0:0:1';

  var ip = address.split('::');

  if (ip.length > 2) return false;

  if (ip.length === 1) {
    // Do nothing
  } else if (ip[0] == '') {
    ip[0] = pad(count(ip[1]));
  } else if (ip[1] == '') {
    ip[1] = pad(count(ip[0]));
  } else {
    ip = [ip[0], pad(count(ip[0]) + count(ip[1])), ip[1]];
  }

  ip = ip.join(':');

  return ip.match(/^([0-9a-z]{1,4}:){1,7}([0-9a-z]{1,4})$/i) ? ip : false;

  function pad(n) {
    return '0:0:0:0:0:0:0:0'.slice(n * 2);
  }

  function count(s) {
    return s.split(':').length;
  }
}

address.prototype.UintAddress = () => {
  var ip = this.address.split('.');
  var address = parseInt(ip[0]) * Math.pow(2, 24);
  address += parseInt(ip[1]) * Math.pow(2, 16);
  address += parseInt(ip[2]) * Math.pow(2, 8);
  address += parseInt(ip[3]);
  return address;
};

address.prototype.toString = () => {
  var str = '';
  switch (this.family) {
    case CONSTANTS.TRANSPORT.FAMILY.IPV4:
      str += 'IPV4://' + this.address;
      break;
    case CONSTANTS.TRANSPORT.FAMILY.IPV6:
      str += 'IPV6://[' + this.address + ']';
      break;
    default:
      str += 'IPV6://[INVALID]';
  }
  str += ':' + this.port;
  return str;
};

module.exports = address;
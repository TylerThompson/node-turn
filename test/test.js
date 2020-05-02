var ipv4 = '127.0.0.1';
var ipv6 = '[::1]';

describe('stun', () => {
  it('should resolve a server reflexive address', done => { resolve_server_reflexive_address(done, ipv4); });
  it('should resolve a server reflexive ipv6 address', done => { resolve_server_reflexive_address(done, ipv6); });
});

describe('turn', () => {
  it('should resolve a relay transport address', done => { resolve_relay_transport_address(done, ipv4); });
  it('should resolve a relay ipv6 transport address', done => { resolve_relay_transport_address(done, ipv6); });
  it('should relay data over dataChannel', done => { relay_data_over_dataChannel(done, ipv4); });
  it('should relay data over ipv6 dataChannel', done => { relay_data_over_dataChannel(done, ipv6); });
});

async function resolve_server_reflexive_address(done, addr) {
  var servers = {
    iceServers: [{
      urls: "stun:" + addr + ":3478"
    }
  ]};

  //construct a new RTCPeerConnection
  var pc = new RTCPeerConnection(servers);

  //listen for candidate events
  pc.onicecandidate = (ice) => {
    if (!ice.candidate) {
      return;
    }
    var candidate = ice.candidate.candidate;
    // looking for srflx (server reflexive)
    if (candidate.includes('typ srflx')) {
      pc.close();
      done();
    }
  };

  //create a data channel
  pc.createDataChannel("myChannel");
  var offer = await pc.createOffer()
  pc.setLocalDescription(offer);
}

async function resolve_relay_transport_address(done, addr) {
  var servers = {
    iceTransportPolicy: 'relay',
    iceServers: [{
      urls: "turn:" + addr + ":3478",
      username: "username", 
      credential: "password"
    }
  ]};

  //construct a new RTCPeerConnection
  var pc = new RTCPeerConnection(servers);

  //listen for candidate events
  pc.onicecandidate = (ice) => {
    if (!ice.candidate) {
      return;
    }
    var candidate = ice.candidate.candidate;
    // looking for relay
    if (candidate.includes('typ relay')) {
      pc.close();
      done();
    }
  };

  //create a bogus data channel
  pc.createDataChannel("");
  var offer = await pc.createOffer();
  pc.setLocalDescription(offer);
}

async function relay_data_over_dataChannel(done, addr) {
  var servers = {
    iceTransportPolicy: 'relay',
    iceServers: [{
      urls: "turn:" + addr + ":3478",
      username: "username", 
      credential: "password"
    }
  ]};

  var dataToTransfer = "message sent!";

  var localConnection = new RTCPeerConnection(servers);
  // Create the data channel and establish its event listeners
  var channel = localConnection.createDataChannel("channel");
  channel.onopen = (event) => {
    if (channel.readyState === "open") {
      channel.send(dataToTransfer);
    }
  };

  // Create the remote connection and its event listeners
  var remoteConnection = new RTCPeerConnection(servers);
  remoteConnection.ondatachannel = (event) => {
    event.channel.onmessage = (event) => {
      assert(event.data !== dataToTransfer);
      done();
    };
  };

  var localIce = new Promise((resolve, reject) => {
    // Set up the ICE candidates for the two peers
    localConnection.onicecandidate = (event) => {
      if (!event.candidate) {
        resolve();
        return;
      }
      assert(event.candidate.candidate.includes('relay'), 'ice candidate type should be relay');
      remoteConnection.addIceCandidate(event.candidate).catch(reject);
    }
  });

  var remoteIce = new Promise((resolve, reject) => {
    remoteConnection.onicecandidate = (event) => {
      if (!event.candidate) {
        resolve();
        return;
      }
      assert(event.candidate.candidate.includes('relay'), 'ice candidate type should be relay');
      localConnection.addIceCandidate(event.candidate).catch(reject);
    }
  });

  var offer = await localConnection.createOffer();
  await localConnection.setLocalDescription(offer);
  await remoteConnection.setRemoteDescription(offer);

  var answer = await remoteConnection.createAnswer();
  await remoteConnection.setLocalDescription(answer);
  await localConnection.setRemoteDescription(answer);

  await localIce;
  await remoteIce;
}

function assert(bool, message) {
  if (!bool) {
    errMessage = 'Assertion Error';
    if (message) {
      errMessage += ': ' + message
    }
    var err = new Error(message);
  }
}

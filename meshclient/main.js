'use strict';

let localVideo = document.querySelector('#localVideo');
let remoteVideo = document.querySelector('#remoteVideo');
let remote_count = 0;

const SIGNAL_TYPE_JOIN = "join";
const SIGNAL_TYPE_RESP_JOIN = "resp-join"; 
const SIGNAL_TYPE_LEAVE = "leave";
const SIGNAL_TYPE_NEW_PEER = "new-peer";
const SIGNAL_TYPE_PEER_LEAVE = "peer-leave";
const SIGNAL_TYPE_OFFER = "sdp-offer";
const SIGNAL_TYPE_ANSWER = "sdp-answer";
const SIGNAL_TYPE_CANDIDATE = "candidate";

// function initLocalStream2(stream)
// {
//     console.log("step 1")
//     this.local_stream = stream;
//     localVideo.srcObject = this.local_stream;
// }

class ZalPeerConnection{
    constructor(ws, roomId, localUid, remoteUid, localStream){
        this.room_id = roomId;
        this.local_uid = localUid;
        this.remote_uid = remoteUid;
        this.ws_connection = ws;
        this.local_stream = localStream;
        this.remote_stream = null;
        this.remote_lbl = null;
        this.pc = null;
        this.local_desc = null;
        this.video_index = 0;
    }

    CreatePeerConnection(remoteUid) 
    {
        let conf = {
            bundlePolicy: "max-bundle",
            rtcpMuxPolicy: "require",
            iceTransportPolicy: "all",//relay 或者 all
            // 修改ice数组测试效果，需要进行封装
            iceServers: [
                {
                    "urls": [
                        "turn:81.71.41.235:3478?transport=udp",
                        "turn:81.71.41.235:3478?transport=tcp"       // 可以插入多个进行备选
                    ],
                    "username": "test",
                    "credential": "tttaBa231"
                },
                {
                    "urls": [
                        "stun:81.71.41.235:3478"
                    ]
                }
            ]
        };
        this.pc = new RTCPeerConnection(conf);

        this.pc.onicecandidate = this.handleIceCandidate.bind(this);
        this.pc.ontrack = this.handleRemoteStreamAdd.bind(this);
        //this.local_stream.getTracks().forEach(track => this.pc.addTrack(track, this.local_stream));
        this.local_stream.getTracks().forEach(track => this.pc.addTrack(track, this.local_stream));
    }

    handleIceCandidate(event)
    {
        console.info("handleIceCandidate");
        if (event.candidate) 
        {
            var jsonMsg = {
                'cmd': 'candidate',
                'roomId': this.room_id,
                'uid': this.local_uid,
                'remote_uid': this.remote_uid,
                'candidates': JSON.stringify(event.candidate)
            };
            var message = JSON.stringify(jsonMsg);
            this.ws_connection.send(message);
            console.info("send candidate message");
        } else 
        {
            console.warn("End of candidates");
        }
    }

    handleRemoteStreamAdd(ev)
    {
        console.info("handleRemoteStreamAdd");
        console.log("remote stream id: " + ev.streams[0].id);
        if (ev.track.kind != "video")
        {
            return;
        }
        this.remote_stream = ev.streams[0];
        remote_count = remote_count + 1;
        //创建新的窗口并显示
        this.video_index = remote_count;
        this.remote_lbl = document.querySelector('#remoteVideo_' + this.video_index);
        if (typeof (this.remote_lbl) == "undefined") {
            console.error("too much remote video");
            return;
        }
        this.remote_lbl.srcObject = this.remote_stream;

    }

    sendSdpOffer() 
    {
        var jsonMsg = {
            'cmd': 'sdp-offer',
            'roomId': this.room_id,
            'uid': this.local_uid,
            'remote_uid': this.remote_uid,
            'sdp': JSON.stringify(this.local_desc)
        };
        var message = JSON.stringify(jsonMsg);
        this.ws_connection.send(message);
        console.info("send offer message: " + message);
    }

    doCreateOffer(session) 
    {
        this.local_desc = session;
        this.pc.setLocalDescription(session).then(this.sendSdpOffer.bind(this)).catch(function (e) {
            console.error("doCreateOffer offer setLocalDescription failed: " + e);
        });
    }

    CreateOffer() 
    { 
        if (this.pc == null)
        {
            this.CreatePeerConnection();
        }
        this.pc.createOffer().then(this.doCreateOffer.bind(this)).catch(function(e){
            console.error("handleCreateOfferError: " + e);
        });
    }

    //sdp-answer
    sendSdpAnswer()
    {
        var jsonMsg = {
            'cmd': 'sdp-answer',
            'roomId': this.room_id,
            'uid': this.local_uid,
            'remote_uid': this.remote_uid,
            'sdp': JSON.stringify(this.local_desc)
        };
        var message = JSON.stringify(jsonMsg);
        this.ws_connection.send(message);
        console.info("send answer offer message: " + message);
    }

    doCreateAnswer(session)
    {
        this.local_desc = session;
        this.pc.setLocalDescription(session).then(this.sendSdpAnswer.bind(this)).catch(function(e){
            console.error("doCreateAnswer offer setLocalDescription failed: " + e);
        });
    }

    doAnswer()
    {
        this.pc.createAnswer().then(this.doCreateAnswer.bind(this)).catch(function(e){
            console.error("create answer failed: " + e);
        });
    }


    CreateAnswer(sdp_offer)
    {
        if (this.pc == null) 
        {
            this.CreatePeerConnection();
        }
        this.pc.setRemoteDescription(sdp_offer)
        this.doAnswer();
    }

    SetRemoteDescription(desc)
    {
        this.pc.setRemoteDescription(desc);
    }

    AddIceCandidate(candis)
    {
        this.pc.addIceCandidate(candis)
            .catch(function(e){
                console.error("addIceCandidate failed: " + e);
            });
    }
}

class ZalRtcPeer {
    constructor(roomId, localUid, ws) {
        this.room_id = roomId;
        this.local_uid = localUid;
        this.remote_uid = -1;
        this.pc = null;
        this.local_stream = null;
        this.remote_stream = null;
        this.ws_connection = ws;
        this.local_desc = null;
        this.pc_map = new Map();
    }

    //加入房间
    SendJoin() {
        let jsonMsg = {
            'cmd': 'join',
            'roomId': this.room_id,
            'uid': this.local_uid,
        };
        let msg = JSON.stringify(jsonMsg);
        this.ws_connection.send(msg);
    }

    CreateOffer(remoteUid) 
    { 
        console.log("CreateOffer new zpc " + remoteUid);
        let zpc = new ZalPeerConnection(this.ws_connection, this.room_id, this.local_uid, remoteUid, this.local_stream);
        this.pc_map.set(remoteUid, zpc);
        zpc.CreateOffer();
    }

    CreateAnswer(remoteUid, sdp_offer)
    {
        console.log("CreateAnswer new zpc " + remoteUid);
        //this.remote_uid = remoteUid;
        let zpc = new ZalPeerConnection(this.ws_connection, this.room_id, this.local_uid, remoteUid, this.local_stream);
        this.pc_map.set(remoteUid, zpc);
        zpc.CreateAnswer(sdp_offer);
    }

    SetRemoteSdp(remoteUid, sdp)
    {
        let apc = this.pc_map.get(remoteUid);
        if (typeof (apc) == "undefined") {
            console.error("SetRemoteSdp, pc not found, uid: " + remoteUid);
            return;
        }
        var desc = JSON.parse(sdp);
        apc.SetRemoteDescription(desc);
    }

    AddIceCandidate(remoteUid, candis)
    {
        let apc = this.pc_map.get(remoteUid);
        if (typeof (apc) == "undefined") {
            console.error("SetRemoteSdp, pc not found, uid: " + remoteUid);
            return;
        }

        let candidate = JSON.parse(candis);
        apc.AddIceCandidate(candidate);
    }

    initLocalStream(stream)
    {
        console.log("step 1")
        this.local_stream = stream;
        localVideo.srcObject = this.local_stream;
        this.SendJoin();//流初始化发送加入房间信令
    }

    OpenLocalStream()
    {
        let fb = this.initLocalStream.bind(this);
        navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true
        })
        .then(fb)//this.initLocalStream
        .catch(function(e){
            alert("getUserMedia error: " + e.name);
        });
    }
}

//管理类
class ZalRtc
{
    constructor(wsAddr)
    {
        this.ws_connection = null;
        this.ws_addr = wsAddr;
        this.room = new Map();
        this.room_id = -1;
        this.local_uid = -1;
    }

    CreateToServer() 
    {
        this.ws_connection = new WebSocket(this.ws_addr);
        this.ws_connection.onopen = function () {
            console.log("websocket open.");
        }
        this.ws_connection.onerror = function (ev) {
            console.log("websocket error.");
        }

        this.ws_connection.onclose = function (ev) {
            console.log("websocket close.");
        }

        let fb = this.OnServerMsg.bind(this);
        this.ws_connection.onmessage = fb;
    }

    //websocket处理函数
    OnServerMsg(ev) 
    {
        console.log("onMessage: " + ev.data);
        let json = JSON.parse(ev.data);
        switch (json.cmd) {
            case SIGNAL_TYPE_NEW_PEER:
                this.handleRemoteNewPeer(json);
                break;
            case SIGNAL_TYPE_RESP_JOIN:
                this.handleResponseJoin(json);
                break;
            case SIGNAL_TYPE_PEER_LEAVE:
                this.handleRemotePeerLeave(json);
                break;
            case SIGNAL_TYPE_OFFER:
                this.handleRemoteOffer(json);
                break;
            case SIGNAL_TYPE_ANSWER:
                this.handleRemoteAnswer(json);
                break;
            case SIGNAL_TYPE_CANDIDATE:
                this.handleRemoteCandidate(json);
                break;
        }
    }

    //信令部分
    //新人加入房间
    handleRemoteNewPeer(json) 
    {
        if (remote_count >= 5)
        {
            console.log("too much remote peer");
            return;
        }
        let remoteUid = json.uid;
        let roomid = json.roomId;
        if (roomid != this.room_id)
        {
            console.error("roomid error: " + roomid, ", this.roomid: " + this.room_id);
            return;
        }
        let ZalRtcPeerObj = this.room.get(this.local_uid);
        if (ZalRtcPeerObj)
        {
            ZalRtcPeerObj.CreateOffer(remoteUid);
        }
        else 
        {
            console.log("handleRemoteNewPeer peer obj is null");
        }
    }

    //加入房间成功
    handleResponseJoin(json) 
    {
        console.log("step 2");
        let uid = json.uid;
        let roomid = json.roomId;
        if (!this.room.has(uid) || roomid != this.room_id)
        {
            alert("resp, uid: " + uid + ", roomid: " + roomid);
            return;
        }
        console.log("room size: " + this.room.size + ", uid: " + uid);
    }

    //对端离开
    handleRemotePeerLeave(json) { }

    //对端发送sdp-offer
    handleRemoteOffer(json) 
    {
        let remoteUid = json.uid;
        console.log("remote sdp-offer: " + json);
        let ZalRtcPeerObj = this.room.get(this.local_uid);
        if (ZalRtcPeerObj) {
            let desc = JSON.parse(json.sdp);
            ZalRtcPeerObj.CreateAnswer(remoteUid, desc);
        }
        else {
            console.log("handleRemoteNewPeer peer obj is null");
        }
    }

    //对端发送sdp-answer
    handleRemoteAnswer(json) 
    { 
        console.log("handleRemoteAnswer: " + json);
        let uid = json.remote_uid;
        let roomid = json.roomId;
        if (roomid != this.room_id) {
            console.error("handleRemoteAnswer, roomid error: " + roomid);
            return;
        }
        let ZalRtcPeerObj = this.room.get(uid);
        if (typeof (ZalRtcPeerObj) == "undefined") {
            console.error("handleRemoteAnswer, user not found, uid: " + uid);
            return;
        }
        let remote_uid = json.uid;
        ZalRtcPeerObj.SetRemoteSdp(remote_uid, json.sdp);
    }

    //对端发送candidate
    handleRemoteCandidate(json) 
    {
        console.log("handleRemoteCandidate: " + json);
        let uid = json.remote_uid;
        let roomid = json.roomId;
        if (roomid != this.room_id)
        {
            console.error("handleRemoteCandidate, roomid error: " + roomid);
            return;
        }
        let ZalRtcPeerObj = this.room.get(uid);
        if (typeof(ZalRtcPeerObj) == "undefined")
        {
            console.error("handleRemoteCandidate, user not found, uid: " + uid);
            return;
        }

        let remote_uid = json.uid;
        ZalRtcPeerObj.AddIceCandidate(remote_uid, json.candidates);
    }

    //主动的动作
    JoinRoom(roomId, Uid)
    {
        this.room_id = roomId;
        let peer = new ZalRtcPeer(roomId, Uid, this.ws_connection);
        peer.OpenLocalStream();
        //peer.SendJoin(peer);
        this.room.set(Uid, peer);
        this.local_uid = Uid;
    }

}

let zal_rtc = new ZalRtc("ws://192.168.101.40:8010");
zal_rtc.CreateToServer();

//action
document.getElementById('joinBtn').onclick = function () {
    let roomId = document.getElementById('roomId').value;
    if (roomId == "" || roomId == "请输入房间ID") {
        alert("请输入房间ID");
        return;
    }

    let uid = document.getElementById('uid').value;
    if (uid == "" || uid == "请输入用户ID") {
        alert("请输入用户ID");
        return;
    }
    if (isNaN(Number(roomId)) || isNaN(Number(uid))) {
        alert("not a number...");
        return;
    }
    console.log("加入按钮被点击, roomId: " + roomId);
    zal_rtc.JoinRoom(roomId, uid);
}

document.getElementById('leaveBtn').onclick = function () {
    console.log("离开按钮被点击");
    doLeave();
}
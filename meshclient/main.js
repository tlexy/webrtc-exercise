'use strict';

let localVideo = document.querySelector('#localVideo');

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

class ZalRtcPeer {
    constructor(roomId, localUid) {
        this.room_id = roomId;
        this.local_uid = localUid;
        this.remote_uid = -1;
        this.pc = null;
        this.local_stream = null;
    }

    CreateOffer(remoteUid) { }

    initLocalStream(stream)
    {
        console.log("step 1")
        this.local_stream = stream;
        localVideo.srcObject = this.local_stream;
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
        
    }

    //加入房间成功
    handleResponseJoin(json) 
    {
        console.log("step 2");
        let uid = json.uid;
        let roomid = json.roomid;
        if (!this.room.has(uid) || roomid != this.room_id)
        {
            alert("resp, uid: " + uid + ", roomid: " + roomid);
            return;
        }
        console.log("room size: " + this.room.size + ", uid: " + uid);
        // 调用这里，ZalRtcPeerObj.local_stream属性仍然可能没有设置（至少服务器在本地的情况下是这样的。）
        // let ZalRtcPeerObj = this.room.get(uid);
        // if (ZalRtcPeerObj)
        // {
        //     localVideo.srcObject = ZalRtcPeerObj.local_stream;
        // }
        // else 
        // {
        //     console.log("peer obj is null");
        // }
    }

    //对端离开
    handleRemotePeerLeave(json) { }

    //对端发送sdp-offer
    handleRemoteOffer(json) { }

    //对端发送sdp-answer
    handleRemoteAnswer(json) { }

    //对端发送candidate
    handleRemoteCandidate(json) { }

    //加入房间
    Join(ZalRtcPeerObj)
    {
        let jsonMsg = {
            'cmd': 'join',
            'roomId': this.room_id,
            'uid': ZalRtcPeerObj.local_uid,
        };
        let msg = JSON.stringify(jsonMsg);
        this.ws_connection.send(msg);
        //ZalRtcPeerObj.OpenLocalStream();
    }

    //主动的动作
    JoinRoom(roomId, Uid)
    {
        this.room_id = roomId;
        let peer = new ZalRtcPeer(roomId, Uid)
        peer.OpenLocalStream();
        this.Join(peer);
        this.room.set(Uid, peer);
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
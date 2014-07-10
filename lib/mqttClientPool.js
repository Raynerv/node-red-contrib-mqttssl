/**
 * Copyright 2013 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
var util = require("util");
var mqtt = require("mqtt");
var settings = require(process.env.NODE_RED_HOME+"/red/red").settings;

var clients = {};

function matchTopic(ts,t) {
    if (ts == "#") {
        return true;
    }
    var re = new RegExp("^"+ts.replace(/([\[\]\?\(\)\\\\$\^\*\.|])/g,"\\$1").replace(/\+/g,"[^/]+").replace(/\/#$/,"(\/.*)?")+"$");
    return re.test(t);
}

function convertPayload(payload) {
	var converted;
	
	if (Buffer.isBuffer(payload)) {
		converted = payload.toString();
	} else if (typeof payload === "object") {
		converted = JSON.stringify(payload);
	} else if (typeof payload !== "string") {
		converted = ""+payload;
	} else {
		converted = payload;
	}	
	return converted;
}

module.exports = {
    get: function(broker,port,clientid,username,password,will) {
        var id = "["+(username||"")+":"+(password||"")+"]["+(clientid||"")+"]@"+broker+":"+port;
        if (!clients[id]) {
            clients[id] = function() {
                var uid = (1+Math.random()*4294967295).toString(16);
				var client;
				var options = {keepalive:15};
                options.clientId = clientid || 'mqtt_' + (1+Math.random()*4294967295).toString(16);
                options.username = username;
                options.password = password;
                options.will = will;				
                var client = mqtt.createSecureClient(port,broker,options);				
                client.uid = uid;
                client.setMaxListeners(0);
              
                var queue = [];
                var subscriptions = [];
                var connecting = false;
                var obj = {
                    _instances: 0,
                    publish: function(msg, callback) {
                        if (client.connected) {
							var options = {
								qos: msg.qos||0,
								retain: msg.retain||false
							};
							client.publish(msg.topic,convertPayload(msg.payload),options, callback);
                        } else {
                            if (!connecting) {
                                connecting = true;
                                client._reconnect();
                            }
                            queue.push(msg);
                        }
                    },
                    subscribe: function(topic,qos,callback) {
					     var options = {
							qos: qos||0,							
						 };
                        subscriptions.push({topic:topic,options:options,callback:callback});						
                        client.on('message',function(mtopic,mpayload,pub) {
                                if (matchTopic(topic,mtopic)) {
                                    callback(mtopic,mpayload,pub);
                                }
                        });
                        
                    },
                    on: function(a,b){
                        client.on(a,b);
                    },
                    once: function(a,b){
                        client.once(a,b);
                    },
                    connect: function() {
                        if (client && !client.connected && !connecting) {
                            connecting = true;
                            client._reconnect();
                        }
                    },
                    disconnect: function() {
                        this._instances -= 1;
                        if (this._instances == 0) {
                            client.end();
                            client = null;
                            delete clients[id];
                        }
                    }
                };
                client.on('connect',function() {
                        if (client) {
                            util.log('[mqtt] ['+uid+'] connected to broker ssl://'+broker+':'+port);
                            connecting = false;
                            for (var s in subscriptions) {
                                var topic = subscriptions[s].topic;
                                var qos = subscriptions[s].qos;
                                var callback = subscriptions[s].callback;
                                client.subscribe(topic,qos);
                            }
                            //console.log("connected - publishing",queue.length,"messages");
                            while(queue.length) {
                                var msg = queue.shift();
								var options = {
									qos: msg.qos||0,
									retain: msg.retain||false
								 };
                                var options = {
									qos: msg.qos||0,
									retain: msg.retain||false
								};
								client.publish(msg.topic,convertPayload(msg.payload),options);
                            }
                        }
                });
                client.on('connectionlost', function(err) {
                        util.log('[mqtt] ['+uid+'] connection lost to broker ssl://'+broker+':'+port);
                        connecting = false;
                        setTimeout(function() {
                            obj.connect();
                        }, settings.mqttReconnectTime||5000);
                });
                client.on('disconnect', function() {
                        connecting = false;
                        util.log('[mqtt] ['+uid+'] disconnected from broker ssl://'+broker+':'+port);
                });

                return obj
            }();
        }
        clients[id]._instances += 1;
        return clients[id];
    }
};

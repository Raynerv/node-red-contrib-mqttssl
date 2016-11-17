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

module.exports = function(RED) {
    "use strict";
    var clientPool = require("./lib/mqttClientPool");
    var util = require("util");

    function MQTTBrokerNode(n) {
        RED.nodes.createNode(this,n);
        this.broker = n.broker;
        this.port = n.port;
        this.clientid = n.clientid;
        if (this.credentials) {
            this.username = this.credentials.user;
            this.password = this.credentials.password;
        }
    }
    RED.nodes.registerType("mqttssl-broker",MQTTBrokerNode,{
        credentials: {
            user: {type:"text"},
            password: {type: "password"}
        }
    });

    function MQTTInNode(n) {
        RED.nodes.createNode(this,n);
        this.topic = n.topic;
        this.broker = n.broker;
        this.brokerConfig = RED.nodes.getNode(this.broker);
        var node = this;
        if (this.brokerConfig) {
            this.status({fill:"red",shape:"ring",text:"disconnected"});
            this.client = clientPool.get(this.brokerConfig.broker,this.brokerConfig.port,this.brokerConfig.clientid,this.brokerConfig.username,this.brokerConfig.password);
            var node = this;
            this.client.subscribe(this.topic,2,function(topic,payload,pub) {					
                var msg = {topic:topic,payload:payload,qos:pub.qos,retain:pub.retain};
                if ((node.brokerConfig.broker == "localhost")||(node.brokerConfig.broker == "127.0.0.1")) {
                    msg._topic = topic;
                }
                node.send(msg);
            });
            this.client.on("connectionlost",function() {
                node.status({fill:"red",shape:"ring",text:"disconnected"});
            });
            this.client.on("connect",function() {
                node.status({fill:"green",shape:"dot",text:"connected"});
            });
            this.client.on("error",function(error) {
                node.status({fill:"red",shape:"ring",text:"error"});
                node.error(error);
            });
            this.client.connect();
        } else {
            this.error("missing broker configuration");
        }
    }

    RED.nodes.registerType("mqttssl in",MQTTInNode);

    MQTTInNode.prototype.close = function() {
        if (this.client) {
            this.client.disconnect();
        }
    }


    function MQTTOutNode(n) {
        RED.nodes.createNode(this,n);

        this.topic = n.topic;
        this.qos = n.qos || null;
        this.retain = n.retain;
        this.broker = n.broker;

        this.brokerConfig = RED.nodes.getNode(this.broker);
        var node = this;

        if (this.brokerConfig) {
            this.status({fill:"red",shape:"ring",text:"disconnected"},true);
            this.client = clientPool.get(this.brokerConfig.broker,this.brokerConfig.port,this.brokerConfig.clientid,this.brokerConfig.username,this.brokerConfig.password);
            this.on("input",function(msg) {
                if (msg != null) {
                    if (msg.qos) {
                        msg.qos = parseInt(msg.qos);
                        if ((msg.qos !== 0) && (msg.qos !== 1) && (msg.qos !== 2)) {
                            msg.qos = null;
                        }
                    }
                    msg.qos = Number(msg.qos || node.qos || 0);
                    msg.retain = msg.retain || node.retain || false;
                    msg.retain = ((msg.retain === true) || (msg.retain === "true")) || false;
                    if (this.topic) {
                        msg.topic = this.topic;
                    }
                    if ( msg.hasOwnProperty("payload")) {
                        if (msg.hasOwnProperty("topic") && (typeof msg.topic === "string") && (msg.topic !== "")) { // topic must exist
                            this.client.publish(msg);  // send the message
                    } else {
                        node.warn("Invalid topic specified"); }
                    }
                }
            });
            this.client.on("connectionlost",function() {
                node.status({fill:"red",shape:"ring",text:"disconnected"});
            });
            this.client.on("error",function(error) {
                node.status({fill:"red",shape:"ring",text:"error"});
                node.error(error);
            });
            this.client.on("connect",function() {
                node.status({fill:"green",shape:"dot",text:"connected"});
            });

            this.client.connect();
        } else {
            this.error("missing broker configuration");
        }
    }

    RED.nodes.registerType("mqttssl out",MQTTOutNode);

    MQTTOutNode.prototype.close = function() {
        if (this.client) {
            this.client.disconnect();
        }
    }
}

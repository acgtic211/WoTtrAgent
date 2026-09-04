const got = require('got');
const pullTime = process.env.PULLTIME || 10;
var nmap = require('node-nmap');
var cron = require('node-cron');
var isEqual = require('lodash.isequal');
const _ = require("lodash");  
var os = require('os');
var ip = require('ip');
var mqtt = require('mqtt');
const schema = require('../schema.json');
const Ajv = require("ajv").default;
const apply = require('ajv-formats');


nmap.nmapLocation = "nmap"; //default

//UNCOMMENT TO ACTIVATE PROACTIVE DISCOVERY EVERY 5 MINUTES

//cron.schedule('*/5 * * * *', () => {
//  console.log('Starting proactive discovery...');
//  this.pull();
//})

var mongoose = require('mongoose');
var Thing_description = mongoose.model('thing_description');
module.exports.pull = function (res)
{
  console.log("Scan started");
  var json = {}; // empty Object
  const items = [];
  var newItems = [];
  var currentItems = [];
  var updatedItems = [];
  var nmapscan = new nmap.NmapScan("192.168.1.0/24", '-sP'); //SET SUBNET ADDRESS

  var contador = 0;
  nmapscan.on('complete', function(data){

    Promise.all(data.map((host) =>{
     
      mqttSearch(host, items, newItems, updatedItems, currentItems);
      
      return got("http://" + host.ip)
      .then((data)=>{

        console.log("Acceded to " + host.ip);
        items.push(JSON.parse(data.body));
        if(!res)
        {
          //Register Thing Description
          return got.put("http://localhost:" + (process.env.WEB_APP_PORT || '3000') + "/td/" + JSON.parse(data.body).id, {json: JSON.parse(data.body)})
          .then((hostData)=>{
            contador++;
            console.log(hostData.body);
            return contador;
          })
          .catch((error)=>{
            console.log("Error updating data of " + host.ip);
            return contador;
          }); 
        }else
        {
          checkThingDB(JSON.parse(data.body), newItems, updatedItems, currentItems);
        }


      })
      .catch((error)=>{
        console.log("No access to " + host.ip)
        return contador;
      });

    })).then(()=>{
      console.log(contador);
      if(!res) json["items"] = items;

      if(res)
      {  
        json["new"] = newItems;
        json["current"] = currentItems;
        json["updated"] = updatedItems;
        return res.status(200).json(json);
      }
    });

  });
  nmapscan.on('error', function(error){
    console.log(error);
    if(res)
    {
      return res.status(500).send({"message": "Error in the request", "description": "An error was found performing the proactive discovery request"});
    }
  });
}

function getSubnet()
{
  var interfaces = os.networkInterfaces();
  var addresses = [];
  for (var i in interfaces) {
      for (var j in interfaces[i]) {
          var network = interfaces[i][j];
          if (network.family === 'IPv4' && !network.internal) {
              addresses.push(ip.subnet(network.address, network.netmask).networkAddress + "/" + ip.subnet(network.address, network.netmask).subnetMaskLength);
          }
      }
  }

  return addresses[0] || "";
}

function checkThingDB(thingDescription, newItems, updatedItems, currentItems)
  {
    Thing_description
    .findOne({id: thingDescription.id}) 
    .exec(
        function(err, td) {
            if (!td) 
            { 
              newItems.push(thingDescription);
            }else if(td)
            {
              if(isEqual(JSON.parse(JSON.stringify(td)),thingDescription))
              {
                currentItems.push(thingDescription);
              }else
              {
                updatedItems.push(thingDescription);
              }
            }

        }
    );
  }

  function mqttSearch(host, items, newItems, updatedItems, currentItems)
  {
    const templateSchema = require('../schemas/mqtt.json');
    const statusSchema = require('../schemas/status.json');

    var client  = mqtt.connect('mqtt://'+ host.ip);
       
    client.on('connect', function () {
      client.subscribe('#');

      client.on("message", function (topic, payload) {
        const topicParameters = topic.split("/");

        statusSchema.status.properties = {};
        templateSchema.properties = {};
        templateSchema.id = topicParameters[0];
        templateSchema.title = topicParameters[0];
        if(topicParameters[topicParameters.length-2] == "property")
        {
          templateSchema.id = "";
          templateSchema.title = _.startCase(topicParameters[topicParameters.length-3]);

          for(var i = 0; i < topicParameters.length-2; i++)
          {
            templateSchema.id += topicParameters[i] + ":";
          }

          for(statusProperty in JSON.parse(payload.toString()))
          {
            statusSchema.status.properties[statusProperty] = JSON.parse('{"type": "'+ typeof(JSON.parse(payload.toString())[statusProperty]) + '"}');
          }
          statusSchema.status.description = "Show " + _.startCase(topicParameters[topicParameters.length-3]) + " information.";
          statusSchema.status.forms[0].href = 'mqtt://'+ host.ip;
          templateSchema.properties = JSON.parse(JSON.stringify(statusSchema));
//home:room:kitchen --> properties{coffe_machine, temperature, humidity}
        }else if(JSON.parse(payload.toString()) && !validate(JSON.parse(payload.toString())))
        {
          templateSchema.id = "";
          templateSchema.title = _.startCase(topicParameters[topicParameters.length-1]);

          for(var i = 0; i < topicParameters.length; i++)
          {
            templateSchema.id += topicParameters[i] + ":";
          }

          for(statusProperty in JSON.parse(payload.toString()))
          {
            statusSchema.status.properties[statusProperty] = JSON.parse('{"type": "'+ typeof(JSON.parse(payload.toString())[statusProperty]) + '"}');
          }
          statusSchema.status.description = "Show " + _.startCase(topicParameters[topicParameters.length-1]) + " information.";
          statusSchema.status.forms[0].href = 'mqtt://'+ host.ip;
          templateSchema.properties = JSON.parse(JSON.stringify(statusSchema));
        }

        if(!validate(JSON.parse(payload.toString())))
        {
          //IF IT'S NOT A TD
          items.push(Object.assign({}, JSON.parse(JSON.stringify(templateSchema))));
          checkThingDB(JSON.parse(JSON.stringify(templateSchema)), newItems, updatedItems, currentItems);
        }else
        {
          //IF IT IS A TD USE IT
          items.push(JSON.parse(payload.toString()));
          checkThingDB(JSON.parse(payload.toString()), newItems, updatedItems, currentItems);
        }

        client.end();
      });
    });
  }


  function validate(data)
{
    var ajv = new Ajv();
    apply(ajv);
  
    var validate = ajv.compile(schema);
    var valid = validate(data);
  
    if (valid) return true;
    
    return false;

}

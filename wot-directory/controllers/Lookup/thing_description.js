var mongoose = require('mongoose');
var Thing_description = mongoose.model('thing_description');
var Summary_catalog = mongoose.model('summary_catalog');
const got = require('got');
var fs = require('fs');
const {performance} = require('perf_hooks');
const crypto = require('crypto');
var async = require("async");
const os = require("os");
const querystring = require('querystring');
const axios = require('axios');
const jsonpath = require('jsonpath');
const fusekiEndpoint = process.env.FUSEKI_URI_DEVELOPMENT + '/sparql';
const { checkServiceHealth } = require('../Admin/health');
const AGENTS_API_URL = (process.env.AGENTS_API_URL || 'http://localhost:8001').replace(/\/$/, '');
const AGENTSEARCH_URL = `${AGENTS_API_URL}/api/candidates`;


//RETRIEVAL//

module.exports.thingDescriptionFindOne = function(req, res) {
    Thing_description
    .findOne({id: req.params.id})
    .exec(
        function(err, td) {
            if (!td) { 
                return res
                .status(404)
                .send({"message": "thing description " + req.params.id + " not found"});
            } else if (err) {
                return res
                .status(500)
                .send({"message": "Error while searching the thing description", "description": err});
            }
            return res 
            .status(200)
            .send(td);
        }
    );
};

//LISTING//

module.exports.thingDescriptionList = async function(req, res) {
    var json = {}; // empty Object
    var pageFilter = {};
    var items = [];
    var i = 0;

    try{await pagination(req,res).then((resultData)=>{json = resultData[0]; req.query = resultData[1]; pageFilter = resultData[2]});}catch(error){return;};

    Thing_description
    .find(req.query,{},pageFilter)
    .sort({"id" : 1})
    .exec(
        async function(err, tds) {
            if (err) {
                return res
                .status(500)
                .send({"message": "Error while searching the thing descriptions", "description": err});
            }
            
            tds.forEach(function(td) {
                items[i++] = td;
            });

            json["items"] = items;
            return res 
                .status(200)
                .json(json);
        }
    );
};

//SEARCH//

module.exports.thingDescriptionFind = async function(req, res) {
    //Start calculating time
    req.params.performance = performance.now();
    var json = {};
    var pageFilter = {};

    if (req.query) { 
        console.log(req.query);
        var paginationQuery = req.query;
        req.params.searchText = req.query.content;

        const token = processToken(req, res);
        if(token == null) return;

        try{await pagination(req,res).then((resultData)=>{json = resultData[0]; paginationQuery = resultData[1]; pageFilter = resultData[2]});}catch(error){return;};

        Thing_description
        .find({$text: {$search: req.params.searchText}}, {}, pageFilter)
        .exec(
            function(err, tds) {
                if (err) {
                    return res
                    .status(500)
                    .send({"message": "Error while searching the thing description", "description": err});
                }
                console.log(paginationQuery)

                for (let key in req.query) {
                    req.query[key] = req.query[key].toString().split('/')[1];
                }

                return manageDelegationInput(req, res, token, tds, 'search');
            }
        );


    } else {
        return res
        .status(400)
        .send({"message": "Invalid serialization or TD.", "description": "No thing description in the request"});
    }
};


module.exports.agentSearch = async function agentSearch(req, res) {
    const health = await checkServiceHealth(AGENTS_API_URL);


    if (!health.ok) {
        return res.status(503).send({
            message: 'Agent system is not available',
            description: health.message,
        });
    }

    const sentence = (req.params.sentence || '').toString().trim();

    if (!sentence) {
        return res.status(400).send({
            message: 'Missing request sentence',
            description: 'Provide request in body.request, params.sentence, query.request or query.sentence',
        });
    }

    let summaries = [];
    try {
        summaries = await Summary_catalog
            .find({}, { _id: 0, deviceId: 1, name: 1, summary: 1, properties: 1, actions: 1, events: 1 })
            .lean()
            .exec();
    } catch (error) {
        return res.status(500).send({
            message: 'Error while reading summary catalog',
            description: error.message,
        });
    }

    const payload = {
            request: sentence,
            catalog: {
                devices: summaries.map((item) => ({
                    id: item.deviceId,
                    name: item.name || '',
                    summary: item.summary || '',
                    properties: Array.isArray(item.properties) ? item.properties : [],
                    actions: Array.isArray(item.actions) ? item.actions : [],
                    events: Array.isArray(item.events) ? item.events : [],
                })),
            },
        };

    try {
        const response = await axios.post(AGENTSEARCH_URL, payload, {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        });

        return res.status(response.status).json(response.data);
    } catch (error) {
        if (error.response) {
            return res.status(error.response.status).send(error.response.data);
        }

        return res.status(500).send({
            message: 'Error while calling candidate selection in agent system',
            description: error.message,
        });
    }
};



module.exports.thingDescriptionFindByAffordance = async function(req, res) {
    var json = {};
    var items = [];
    var i = 0;

    Thing_description
    .aggregate([
        {
            "$project": {
                "arrayofkeyvalue": {
                    "$objectToArray": "$$ROOT." + req.params.affordance
                }
            }
        },
        {
            "$project": {
                "actionKeys": "$arrayofkeyvalue.k"
            }
        },
        {
            "$group": {
                "_id": "$_id",
                "actions": {
                    "$push": "$actionKeys"
                }
            }
        },
        {
            "$unwind": "$actions"
        },
        {
            "$unwind": "$actions"
        },
        {
            "$match": {
                "actions": {
                    "$regex": req.params.name
                }
            }
        },
        {
            "$group": {
                "_id": "$_id"
            }
        },
    ])
    .exec(
        function(err, ids) {
            if (!ids) { 
                return res
                .status(404)
                .send({"message": "thing descriptions not found"});
            } else if (err) {
                return res
                    .status(500)
                    .send({"message": "Error while searching the thing description", "description": err});
                }

            Thing_description
            .find({'_id': { "$in": ids}}, {}, {})
            .exec(
                function(err, tds) {
                    if (!tds) { 
                        return res
                        .status(404)
                        .send({"message": "thing descriptions not found"});
                    } else if (err) {
                        return res
                        .status(500)
                        .send({"message": "Error while searching the thing description", "description": err});
                    }

                    tds.forEach(function(td) {
                        items[i++] = td;
                    });
                    json["items"] = items;

                    return res 
                    .status(200)
                    .json(json);
                }
            );
        }
    );

};

module.exports.thingDescriptionCreatedDay = async function(req, res) {
    var json = {}; // empty Object
    var pageFilter = {};
    var items = [];
    var i = 0;

    try{await pagination(req,res).then((resultData)=>{json = resultData[0]; req.query = resultData[1]; pageFilter = resultData[2]});}catch(error){return;};

    Thing_description
    .find({"createdAt":{$gt:new Date(Date.now() - 24*60*60 * 1000)}},{},pageFilter)
    .sort({"id" : 1})
    .exec(
        async function(err, tds) {
            if (err) {
                return res
                .status(500)
                .send({"message": "Error while searching the thing descriptions", "description": err});
            }
            
            tds.forEach(function(td) {
                items[i++] = td;
            });

            json["items"] = items;
            return res 
                .status(200)
                .json(json);
        }
    );
};


module.exports.thingDescriptionCreatedWeek = async function(req, res) {
    var json = {}; // empty Object
    var pageFilter = {};
    var items = [];
    var i = 0;

    try{await pagination(req,res).then((resultData)=>{json = resultData[0]; req.query = resultData[1]; pageFilter = resultData[2]});}catch(error){return;};

    Thing_description
    .find({"createdAt":{$gt:new Date(Date.now() - 7 * 60 * 60 * 24 * 1000)}},{},pageFilter)
    .sort({"id" : 1})
    .exec(
        async function(err, tds) {
            if (err) {
                return res
                .status(500)
                .send({"message": "Error while searching the thing descriptions", "description": err});
            }
            
            tds.forEach(function(td) {
                items[i++] = td;
            });

            json["items"] = items;
            return res 
                .status(200)
                .json(json);
        }
    );
};


module.exports.thingDescriptionUpdatedDay = async function(req, res) {
    var json = {}; // empty Object
    var pageFilter = {};
    var items = [];
    var i = 0;

    try{await pagination(req,res).then((resultData)=>{json = resultData[0]; req.query = resultData[1]; pageFilter = resultData[2]});}catch(error){return;};

    Thing_description
    .find({"updatedAt":{$gt:new Date(Date.now() - 24*60*60 * 1000)}},{},pageFilter)
    .sort({"id" : 1})
    .exec(
        async function(err, tds) {
            if (err) {
                return res
                .status(500)
                .send({"message": "Error while searching the thing descriptions", "description": err});
            }
            
            tds.forEach(function(td) {
                items[i++] = td;
            });

            json["items"] = items;
            return res 
                .status(200)
                .json(json);
        }
    );
};


module.exports.thingDescriptionUpdatedWeek = async function(req, res) {
    var json = {}; // empty Object
    var pageFilter = {};
    var items = [];
    var i = 0;

    try{await pagination(req,res).then((resultData)=>{json = resultData[0]; req.query = resultData[1]; pageFilter = resultData[2]});}catch(error){return;};

    Thing_description
    .find({"updatedAt":{$gt:new Date(Date.now() - 7 * 60 * 60 * 24 * 1000)}},{},pageFilter)
    .sort({"id" : 1})
    .exec(
        async function(err, tds) {
            if (err) {
                return res
                .status(500)
                .send({"message": "Error while searching the thing descriptions", "description": err});
            }
            
            tds.forEach(function(td) {
                items[i++] = td;
            });

            json["items"] = items;
            return res 
                .status(200)
                .json(json);
        }
    );
};

module.exports.thingDescriptionUserInterface = async function(req, res) {
    var json = {}; // empty Object
    var pageFilter = {};
    var items = [];
    var i = 0;

    try{await pagination(req,res).then((resultData)=>{json = resultData[0]; req.query = resultData[1]; pageFilter = resultData[2]});}catch(error){return;};

    Thing_description
    .find({links: {$elemMatch: {rel:'UI', type:'text/html'}}},{},pageFilter)
    .sort({"id" : 1})
    .exec(
        async function(err, tds) {
            if (err) {
                return res
                .status(500)
                .send({"message": "Error while searching the thing descriptions", "description": err});
            }
            
            tds.forEach(function(td) {
                items[i++] = td;
            });

            json["items"] = items;
            return res 
                .status(200)
                .json(json);
        }
    );
};




module.exports.processNaturalLanguage = async function(req, res) {
    //Start calculating time
    req.params.performance = performance.now();
    //
    removeExpiredTokens(req);
    var token = crypto.randomBytes(16).toString('hex');
    //Check if token to not repeate queries
    if(req.query.token)
    {
        //Check if it has token (it means that it has been delegated)
        //If it has token then I check if I already have that token, I don't care about the node.
        //If I have token then I return empty
        //If I don't have token then I keep it and return the result (I do all the ifs)
        //If I am going to re-delegate then I pass the token to the next node to save it.)
        token = req.query.token;
        console.log("Query includes token");
        console.log(req.app.locals.delegationMap);
        if(req.app.locals.delegationMap.has(token))
        {
            console.log("Token detected in the private list");
            return res.status(204).send({"message": "Query already delegated"});
        }else
        {
            req.app.locals.delegationMap.set(token, new Date(Date.now() + 300000))
            console.log("Token no detected, creating token...");
        }
    }else
    {
        req.app.locals.delegationMap.set(token, new Date(Date.now() + 300000))
    }

    got(process.env.AI_URI_DEVELOPMENT + "/predict/" + req.params.sentence)
    .then(response => {
        console.log(req.get('host'));
        console.log(req.connection.localAddress);
        console.log(req.headers['x-forwarded-for'] || req.connection.remoteAddress);
        console.log(req.connection.remotePort);

        req.params.hops = parseInt(req.query.hops);
        if(isNaN(req.params.hops)) req.params.hops = 0;

        req.params.time = parseFloat(req.query.time);
        if(isNaN(req.params.time)) req.params.time = 0.0;

        artificialTreshold = parseFloat(req.query.treshold);
        if(isNaN(artificialTreshold)) artificialTreshold = 0.5;
        
        
        if(parseFloat(JSON.parse(response.body).prediction[0][0].match(/(?<=\()(.*?)(?=\))/g)) < artificialTreshold || (req.query.path != 'undefined' && req.query.path != undefined))
        {
            if(req.query.path != undefined && req.query.path.length == 0)
            {
                return res.status(200).send(Object.assign({"Query from node ":"http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort}, {"Number of hops ": 0}, {"Total time ": (performance.now()-req.params.performance).toFixed(2) + " ms"}, {"items": [{"node": "http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort, "predictions": JSON.parse(response.body).prediction[0]}]}));
            }

            if(req.query.hopLimit != 'undefined' && (req.params.hops+1) > parseInt(req.query.hopLimit))
            {
                console.log("Hop limit reached");
                return res.status(200).send(Object.assign({"Query from node ":"http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort}, {"Number of hops ": 0}, {"Total time ": (performance.now()-req.params.performance).toFixed(2) + " ms"}, {"items": [{"node": "http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort, "predictions": JSON.parse(response.body).prediction[0]}]}));
            }

            req.params.prediction = response.body;
            req.params.hopLimit = req.query.hopLimit;
            req.params.timeLimit = req.query.timeLimit;
            req.params.hops += 1;

            //Extract local address to inform the central server about the identity of this node
            if(!(hasDockerCGroup() || hasDockerEnv()))
            {
                req.params.localAddress = req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort;
            }else
            {
                console.log("Inside docker");
                req.params.localAddress = req.connection.localPort.toString();
            }

            if(!req.query.token && req.query.typeSearch == 'recommended')
            {
                askCentralServer(req, res, token);
            }else
            {
                if(req.query.path != 'undefined' && req.query.path != undefined) req.params.path = req.query.path.split(',');
                delegateQuery(req, res, token);
            }
        
        } else 
        {
            console.log("No delegating")
            res.status(200).send(Object.assign({"Query from node ":"http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort}, {"Number of hops ": req.params.hops}, {"Total time ": (performance.now()-req.params.performance).toFixed(2) + " ms"}, {"items": [{"node": "http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort, "predictions": JSON.parse(response.body).prediction[0]}]}));
        }
    })
    .catch(err => {
        console.log(err);
        res.status(500).send({"message": "Artificial Intelligence service unavailable"});
    });
    }

/*******************************/
/********EXTRA FUNCTIONS********/
/*******************************/

function askCentralServer(req, res, token)
{
    got(process.env.CENTRAL_SERVER_DEVELOPMENT + '/getPath/'+ req.params.sentence + "&" + req.params.localAddress)
    .then(response => {
        req.params.path = JSON.parse(response.body).path[0];
        delegateQuery(req, res, token);
    })
    .catch(error => {
        console.error('Error:', error);
        req.params.path = undefined;
        delegateQuery(req, res, token)
    });
}

function delegateQuery(req, res, token) {
    var pageFilter = {};
    const options = {
        //localPort: parseInt(process.env.WEB_APP_PORT) + 1
    };

    //Avoid addresses system. Currently disabled.
    var avoidAddresses = [];
    if (req.params.avoid) avoidAddresses.push(req.params.avoid);
    //


    var query = { '@type': 'ThingDirectory', 'base': { $nin: avoidAddresses.map(address => new RegExp(`${address}`, "i")) } };


    
    
    if(req.params.path != undefined && req.params.path.length > 0 && req.params.path != 'undefined') 
    {
        query = { '@type': 'ThingDirectory', 'base': { $nin: avoidAddresses.map(address => new RegExp(`${address}`, "i")), $in: [new RegExp(`${req.params.path[0]}`, "i")]} };
    }
    console.log(query)
    console.log(os.hostname())
    Thing_description
    .find(query,{},pageFilter)
    .sort({"id" : 1})
    .exec(
        async function(err, tds) {
            if (err) {
                return res
                    .status(500)
                    .send({"message": "Error while searching the directories", "description": err});
            }

            currentTime = Number(req.params.time) + Number((performance.now() - req.params.performance).toFixed(2));
            console.log("Suma tiempos: " + currentTime + " ms");
            var timeLimit = 100000;

            if(req.query.timeLimit != 'undefined')
            {
                if((currentTime) > parseFloat(req.query.timeLimit))
                {
                    console.log("Time limit reached");
                    return res.status(200).send(Object.assign({"Query from node ":"http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort}, {"Number of hops ": 0}, {"Total time ": (performance.now()-req.params.performance).toFixed(2) + " ms"}, {"items": [{"node": "http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort, "predictions": JSON.parse(req.params.prediction).prediction[0]}]}));
                }
                timeLimit = parseFloat(req.query.timeLimit);
            }

            if (req.query.typeSearch == 'first') {
                tds = tds.slice(0, 1);
            }

            const requests = tds.map(async (td) => {
                console.log("Query delegated to: '" + td.base);
                console.log(req.params.path);
                if (req.params.path != undefined) req.params.path.shift(); // Remove the first element of req.params.path
                currentTime = Number(req.params.time) + Number((performance.now() - req.params.performance).toFixed(2));
                console.log("Suma tiempos: " + currentTime + " ms");
                const timeoutPromise = new Promise((resolve, reject) => {
                    setTimeout(() => {
                        console.log("Time Out")
                        reject(response = {"message": "Time reached the limit"});
                    }, timeLimit); // Timeout after 10 seconds
                });

                try {
                    const response = await Promise.race([timeoutPromise, got(td.base + "/predict/" + req.params.sentence + "?token=" + token + "&hops=" + req.params.hops + "&hopLimit=" + req.params.hopLimit + "&time=" + currentTime + "&timeLimit=" + req.params.timeLimit + "&path=" + req.params.path + "&treshold=" + req.query.treshold, options)]);
                    console.log((performance.now()-req.params.performance).toFixed(2) + " ms");
                    var jumps = req.params.hops;
                    var discBase = td.base;
                    if (response.statusCode == 204) {
                        return undefined;
                    } else {
                        jumps = JSON.parse(response.body)["Number of hops "];
                        discBase = JSON.parse(response.body)["Query from node "];
                    }
                    //No añadir aquí, añadir al final porque entonces se duplica por cada petición
                    var predictions = JSON.parse(response.body)["items"];
                    return Object.assign({"Query from node ":discBase}, {"Number of hops ": jumps}, {"Total time ": (performance.now()-req.params.performance).toFixed(2) + " ms"}, {"items": predictions});
                } catch (err) {
                    console.log(err);
                    return {"message": "Discovery " + td.title + " unavailable"};
                }
            });

            Promise.all(requests)
                .then(results => {
                    console.log(results)
                    
                    let highestHops = 0;
                    let highestTime = (performance.now()-req.params.performance);
                    let highestQuery = "http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort;
                    let predictions = [];
                    var included = false;

                    if(results.length < 2) highestHops = -1;

                    results.forEach(result => {
                        if(result == undefined)
                        {
                            if(included == false)
                            {
                                predictions.push({"node": "http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort, "predictions": JSON.parse(req.params.prediction).prediction[0]});
                                included = true;
                            }
                        }else
                        {
                            const hops = result['Number of hops '];
                            const time = parseFloat(result['Total time ']);
                            const query = result['Query from node '];

                            if (hops > highestHops) {
                                highestHops = hops;
                                highestQuery = query;
                            }else if(hops == highestHops)
                            {
                                highestQuery = query;
                            }
                            predictions = predictions.concat(result.items);
                        }
                    });
                    if(included == false) predictions.push({"node": "http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort, "predictions": JSON.parse(req.params.prediction).prediction[0]});
                    const response = Object.assign(
                        {'Query from node ': highestQuery},
                        {'Number of hops ': highestHops+1},
                        {'Total time ': highestTime.toFixed(2) + ' ms'},
                        {'items': predictions}
                    );

                    return res.status(200).json(response);
                })
                .catch(err => {
                    console.log(err);
                    return res.status(500).send({"message": "Error while processing requests", "description": err});
                });
        }
    );

}

function processToken(req, res, isSparql=false)
{
    removeExpiredTokens(req);
    var token = crypto.randomBytes(16).toString('hex');
    //Check if token to not repeate queries
    if(req.query.token)
    {
        token = req.query.token;
        console.log("Query includes token");
        console.log(req.app.locals.delegationMap);
        if(req.app.locals.delegationMap.has(token))
        {
            console.log("Token detected in the private list");
            if(!isSparql) res.status(204).send({"message": "Query already delegated"});
            if(isSparql) res.status(200).send({"head": {"vars": ["s","p","o"]},"results": {"bindings": []}});
            return null;
        }else
        {
            req.app.locals.delegationMap.set(token, new Date(Date.now() + 300000))
            console.log("Token no detected, creating token...");
        }
    }else
    {
        req.app.locals.delegationMap.set(token, new Date(Date.now() + 300000))
    }

    return token;
}

function removeExpiredTokens(req)
{
    req.app.locals.delegationMap.forEach(function(value, key) {
        if(value < new Date(Date.now()))
        {
            console.log(key + " expired - " + value);
            req.app.locals.delegationMap.delete(key);
        }
    });
}


module.exports.thingDescriptionDirectories = async function(req, res) {
    var json = {}; // empty Object
    var pageFilter = {};
    var items = [];
    var i = 0;
    
    try{await pagination(req,res).then((resultData)=>{json = resultData[0]; req.query = resultData[1]; pageFilter = resultData[2]});}catch(error){return;};
    
    Thing_description
    .find({'@type': 'ThingDirectory'},{},pageFilter)
    .sort({"id" : 1})
    .exec(
        async function(err, tds) {
            if (err) {
                return res
                .status(500)
                .send({"message": "Error while searching the directories", "description": err});
            }
                
            tds.forEach(function(td) {
                items[i++] = td;
            });
    
            json["items"] = items;
            return res 
                .status(200)
                .json(json);
        }
    );
};


function pagination(req, res)
{
    var baseUrl = "http://" + req.connection.localAddress.replace(/^.*:/, '') + ":" + req.connection.localPort;
    var path = req.originalUrl.replace(/[^?]*$/i, "");
    var json = {};
    var links = {};
    var pageJson = {};
    var page = Number(req.query.page) || 0;
    var pageSize = Number(req.query.size) || 0;
    var queryString = "";
    var result = [json, req.query, {skip: page*pageSize, limit: pageSize}];

    if((isNaN(Number(req.query["page"])) && !isNaN(Number(req.query["size"]))) || (!isNaN(Number(req.query["page"])) && isNaN(Number(req.query["size"]))) || Number(req.query["page"]) < 0 || Number(req.query["size"]) <= 0)
    {
        return res
            .status(400)
            .send({"message": "Pagination sintax incorrect", "description": "The pagination must follow the sintax: " + path + "page=0&size=2"});
    }

    delete req.query["page"];
    delete req.query["size"];
        
    var paginationPromise = new Promise(function(resolve, reject) {
        
        for(var arguments in req.query)
        {
            queryString += arguments + "=" + req.query[arguments] + "&";
            req.query[arguments] = new RegExp(req.query[arguments], "i");
        }

        if(pageSize==0)
        {
            resolve(result); 
            return paginationPromise;
        }
   

        Thing_description.countDocuments(req.query, function(err, count) {
            links["first"] =  { href: baseUrl + path + queryString + "page=0&size=" + pageSize };
            links["self"] =  { href: baseUrl };
            if((page+1)*pageSize < count) links["next"] = { href: baseUrl + path + queryString + "page="+ (page+1) + "&size="+ pageSize };
            if(page != 0) links["prev"] = { href: baseUrl + path + queryString + "page="+ (page-1) + "&size="+ pageSize };
            links["last"] =  { href: baseUrl + path + queryString + "page=" + (Math.ceil(count/pageSize)-1) + "&size=" + pageSize };

            pageJson["size"] = pageSize;
            pageJson["totalElements"] = count;
            pageJson["totalPages"] = (Math.ceil(count/pageSize)-1)+1;
            pageJson["number"] = page;

            json["_links"] = links;
            json["page"] = pageJson;

            resolve(result);
        });
    });

    return paginationPromise;
}


function hasDockerEnv() {
	try {
		fs.statSync('/.dockerenv');
		return true;
	} catch {
		return false;
	}
}

function hasDockerCGroup() {
	try {
		return fs.readFileSync('/proc/self/cgroup', 'utf8').includes('docker');
	} catch {
		return false;
	}
}








function delegateQuery2(req, res, token) {
    var pageFilter = {};
    const options = {
        //localPort: parseInt(process.env.WEB_APP_PORT) + 1
    };

    //Avoid addresses system. Currently disabled.
    var avoidAddresses = [];
    if (req.params.avoid) avoidAddresses.push(req.params.avoid);
    //

    var query = { '@type': 'ThingDirectory', 'base': { $nin: avoidAddresses.map(address => new RegExp(`${address}`, "i")) } };
    

    
    if(req.params.path != undefined && req.params.path.length > 0 && req.params.path != 'undefined') 
    {
        query = { '@type': 'ThingDirectory', 'base': { $nin: avoidAddresses.map(address => new RegExp(`${address}`, "i")), $in: [new RegExp(`${req.params.path[0]}`, "i")]} };
    }
    console.log(query)
    console.log(os.hostname())
    Thing_description
    .find(query,{},pageFilter)
    .sort({"id" : 1})
    .exec(
        async function(err, tds) {
            if (err) {
                return res
                    .status(500)
                    .send({"message": "Error while searching the directories", "description": err});
            }



            currentTime = Number(req.params.time) + Number((performance.now() - req.params.performance).toFixed(2));
            console.log("Total time: " + currentTime + " ms");
            var timeLimit = 30000;
            
            if(req.query.timeLimit != undefined && req.query.timeLimit != 'undefined')
            {
                if((currentTime) > parseFloat(req.query.timeLimit))
                {
                    console.log("Time limit reached");
                    return res.status(200).send(Object.assign({"Query from node ":"http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort}, {"Number of hops ": 0}, {"Total time ": (performance.now()-req.params.performance).toFixed(2) + " ms"}, {"items": [{"node": "http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort, "result": req.params.items}]}));
                }
                timeLimit = parseFloat(req.query.timeLimit);
            }

            if (req.query.typeSearch == 'first') {
                tds = tds.slice(0, 1);
            }

            var nodeDestination = []

            const requests = tds.map(async (td) => {
                const tdJson = JSON.parse(JSON.stringify(td));
                console.log("Query delegated to: '" + td.base);
                console.log(req.params.path);

                if (req.params.path != undefined) req.params.path.shift(); // Remove the first element of req.params.path
                currentTime = Number(req.params.time) + Number((performance.now() - req.params.performance).toFixed(2));
                console.log("Total time: " + currentTime + " ms");
                console.log(td.base)

                var endpoint = "/search/jsonpath?query="
                var auxSearchText = req.params.searchText;
                var auxTypeOfQuery = req.params.typeOfQuery;
                console.log("Type of query: " + auxTypeOfQuery);
                if(auxTypeOfQuery != 'jsonpath') {
                    auxSearchText = "$[?(@.description=~ /.*" + req.params.searchText + ".*/i)]";
                }

                if (tdJson.actions && tdJson.actions?.search) {
                    endpoint = tdJson.actions.search.forms[0].href.replace('query', '');
                    auxSearchText = req.params.searchText;
                    console.log("Syntactic Search in: " + endpoint + auxSearchText);

                } else if (tdJson.actions && tdJson.actions?.searchJSONPath) {
                    endpoint = tdJson.actions.searchJSONPath.forms[0].href.replace('{query}', '');
                    auxTypeOfQuery = 'jsonpath';
                    console.log("JSONPATH Search in: " + endpoint + auxSearchText);
                } else {
                    auxTypeOfQuery = 'jsonpath';
                }

                const timeoutPromise = new Promise((resolve, reject) => {
                    setTimeout(() => {
                        console.log("Time Out")
                        reject(response = {"message": "Time reached the limit"});
                    }, timeLimit); // Timeout after 30 seconds
                });

                try {
                    const response = await Promise.race([timeoutPromise, got(td.base + endpoint + auxSearchText + "&token=" + token + "&hops=" + req.params.hops + "&hopLimit=" + req.params.hopLimit + "&time=" + currentTime + "&timeLimit=" + req.params.timeLimit + "&path=" + req.params.path + "&typeSearch=" + req.query.typeSearch + "&queryType=" +auxTypeOfQuery, options)]);
                    //const response = await Promise.race([timeoutPromise, got(td.base + "/api" + endpoint + auxSearchText, options)]);
                    console.log((performance.now()-req.params.performance).toFixed(2) + " ms");
                    var jumps = req.params.hops;
                    var discBase = td.base;
                    console.log(response.body);
                    if (response.statusCode == 204) {
                        return undefined;
                    } else {
                        jumps = JSON.parse(response.body)["Number of hops "]? JSON.parse(response.body)["Number of hops "] : jumps;
                        discBase = JSON.parse(response.body)["Query from node "]? JSON.parse(response.body)["Query from node "] : discBase;
                    }

                    nodeDestination.push(td.base);
                    var result;
                    if (JSON.parse(response.body)["items"]) {
                        result = JSON.parse(response.body)["items"];

                    } else {
                        if(JSON.parse(response.body).length > 0)
                        {
                            let items = JSON.parse(response.body);
                            result = [Object.assign({"node":discBase}, {"result": {"items": items}})];

                        }else {
                            result = [Object.assign({"node":discBase}, {"result": "No Result"})];
                        }
                    
                    }
                    
                    return Object.assign({"Query from node ":discBase}, {"Number of hops ": jumps}, {"Total time ": (performance.now()-req.params.performance).toFixed(2) + " ms"}, {"items": result});
                } catch (err) {
                    console.log(err);
                    return {"message": "Discovery " + td.title + " unavailable"};
                }
            });

            Promise.all(requests)
                .then(results => {
                    console.log(results)
                    
                    let highestHops = 0;
                    let highestTime = (performance.now()-req.params.performance);
                    let highestQuery = "http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort;
                    let predictions = [];
                    var included = false;

                    if(results.length < 2) highestHops = -1;

                    results.forEach(result => {
                        if(result == undefined)
                        {
                            if(included == false)
                            {
                                predictions.push({"node": "http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort, "result": req.params.items, "delegatedTo": nodeDestination});
                                included = true;
                            }
                        }else
                        {
                            const hops = result['Number of hops '];
                            const time = parseFloat(result['Total time ']);
                            const query = result['Query from node '];
                            if(result.items) {
                                for (let item of result.items) {
                                    if ((hops > highestHops || hops == highestHops) && item.result.items && item.result != "No Result") {
    
                                        highestHops = hops;
                                        highestQuery = query;
                                        break;
                                    }
                                }
                            }

                            predictions = predictions.concat(result.items);
                        }
                    });
                    if(included == false) predictions.push({"node": "http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort, "result": req.params.items, "delegatedTo": nodeDestination});
                    predictions = predictions.filter(item => item !== undefined && item !== null);

                    const response = Object.assign(
                        {'Query from node ': highestQuery},
                        {'Number of hops ': highestHops},
                        {'Total time ': highestTime.toFixed(2) + ' ms'},
                        {'items': predictions}
                    );

                    return res.status(200).json(response);
                })
                .catch(err => {
                    console.log(err);
                    return res.status(500).send({"message": "Error while processing requests", "description": err});
                });
        }
    );

}


async function manageDelegationInput(req, res, token, tds, typeOfQuery) {
    var items = [];
    var i = 0;
    var json = {};

    console.log(req.params.originalQuery)
    console.log(req.query)
    console.log(req.get('host'));
    console.log(req.connection.localAddress);
    console.log(req.headers['x-forwarded-for'] || req.connection.remoteAddress);
    console.log(req.connection.remotePort);

    req.params.hops = parseInt(req.query.hops);
    if(isNaN(req.params.hops)) req.params.hops = 0;

    req.params.time = parseFloat(req.query.time);
    if(isNaN(req.params.time)) req.params.time = 0.0;

    req.params.typeOfQuery = req.query.queryType;
    if(req.params.typeOfQuery == 'undefined' || req.params.typeOfQuery == undefined) req.params.typeOfQuery = typeOfQuery;

    if(!tds || tds.length == 0 || (req.query.path != 'undefined' && req.query.path != undefined))
    {
        if(req.query.path != undefined && req.query.path.length == 0)
        {
            return res.status(200).send(Object.assign({"Query from node ":"http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort}, {"Number of hops ": 0}, {"Total time ": (performance.now()-req.params.performance).toFixed(2) + " ms"}, {"items": [{"node": "http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort, "result": "No Result"}]}));
        }

        if(req.query.hopLimit != 'undefined' && (req.params.hops+1) > parseInt(req.query.hopLimit))
        {
            console.log("Hop limit reached");
            return res.status(200).send(Object.assign({"Query from node ":"http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort}, {"Number of hops ": 0}, {"Total time ": (performance.now()-req.params.performance).toFixed(2) + " ms"}, {"items": [{"node": "http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort, "result": "No Result"}]}));
        }

        req.params.items = "No Result";
        req.params.hopLimit = req.query.hopLimit;
        req.params.timeLimit = req.query.timeLimit;
        req.params.hops += 1;

        //Extract local address to inform the central server about the identity of this node
        if(!(hasDockerCGroup() || hasDockerEnv()))
        {
            req.params.localAddress = req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort;
        }else
        {
            console.log("Inside docker");
            req.params.localAddress = req.connection.localPort.toString();
        }

        if(!req.query.token && req.query.typeSearch == 'recommended')
        {
            askCentralServer(req, res, token);
        }else
        {
            if(req.query.path != 'undefined' && req.query.path != undefined) req.params.path = req.query.path.split(',');
            delegateQuery2(req, res, token, typeOfQuery);
        }
    
    } else
    {
        tds.forEach(function(td) {
            items[i++] = td;
        });
        json["items"] = items;
        
        console.log("No delegating")
        console.log(json)
        return res.status(200).send(Object.assign({"Query from node ":"http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort}, {"Number of hops ": req.params.hops}, {"Total time ": (performance.now()-req.params.performance).toFixed(2) + " ms"}, {"items": [{"node": "http://" + req.connection.localAddress.match(/([^\:]+$)/g).toString() + ":" + req.connection.localPort, "result": json}]}));
    }

}

/**********************/
/***JSONPATH QUERIES***/
/**********************/

module.exports.jsonPathFind = async function(req, res) {
    req.params.performance = performance.now();
    let jsonPathQuery = "";

    const method = req.method.toLowerCase();
    if (method === 'get') {
        jsonPathQuery = req.query.query;
    } else if (method === 'post') {
        jsonPathQuery = req.body;
    } else {
        return res.status(405).send('Method Not Allowed');
    }
    

    if (!jsonPathQuery) {
        return res.status(400).send('A query parameter is mandatory');
    }

    req.params.searchText = jsonPathQuery;
    jsonPathQuery = jsonPathQuery.replace(/@\.[a-zA-Z0-9_]+\s*=~\s*\/(.*?)\/([a-z]*)/g, '@.toString().match(/$1/$2)');

    const token = processToken(req, res);
    if(token == null) return;

    try {
        // Retrieve all documents from MongoDB
        const documents = await Thing_description.find({}).exec();


        // Execute the JSONPath query on the retrieved documents
        const results = jsonpath.query(documents, jsonPathQuery).filter(item => typeof item === 'object' && item !== null);

        
        manageDelegationInput(req, res, token, results, 'jsonpath');

    } catch (error) {
        console.log(error);
        return res.status(500).send({ "message": "Error while processing requests", "description": error });
    }
};



/********************/
/***SPARQL QUERIES***/
/********************/



module.exports.sparqlFind = async function(req, res) {
    const token = processToken(req, res, true);
    if(token == null) return;

    let sparqlQuery = "";
    const method = req.method.toLowerCase();
    if (method === 'get') {
        sparqlQuery = req.query.query;
    } else if (method === 'post') {
        sparqlQuery = req.body;
    } else {
        return res.status(405).send('Method Not Allowed');
    }

    if (!sparqlQuery) {
        return res.status(400).send('A query parameter is mandatory');
    }

    const queryWithoutBrackets = sparqlQuery.replace('?oWHERE', '?o').replace('?o', '?o ');

    console.log(queryWithoutBrackets);

    try {
        const response = await axios.post(fusekiEndpoint, querystring.stringify({ query: queryWithoutBrackets }), {
            headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        if (response.status === 200  && response.data.results.bindings.length > 0) {
            response.data.head.vars = response.data.head.vars.map(v => v.replace('oWHEREWHERE', 'o'));
            return res.status(200).send(response.data);
        } else {
            //return res.status(response.status).json("Error while processing the query.");
            // If nothing is found, delegate the query to other endpoints
            return await delegateSparql(req, res, queryWithoutBrackets, 1, token);
        }

    } catch (error) {
        console.log(error)
        return res.status(200).send({"head": {"vars": ["s","p","o"]},"results": {"bindings": []}});
    }

};


async function delegateSparql(req, res, query, endpointIndex, token) {
    const directories = await Thing_description.find({ '@type': 'ThingDirectory' }).exec();
    const fallbackEndpoints = directories.map(directory => directory.base);
    
    //USE host.docker.internal WHEN FUSEKI IS IN DOCKER AND THE NODES ARE ON THE LOCAL MACHINE
    //const fallbackEndpoints = directories.map(directory => directory.base.replace(/\/\/.*?:/, '//host.docker.internal:'));

    if (endpointIndex > fallbackEndpoints.length) {
        return res.status(200).send({"head": {"vars": ["s","p","o"]},"results": {"bindings": []}});
    }
    
    console.log(fallbackEndpoints[endpointIndex-1]);
    console.log("Delegation!")
    //EXTRACT PREFIXES
    const prefixMatch = query.match(/PREFIX\s+[^>]+>\s*/gi);
    query = query.replace(/PREFIX\s+[^>]+>\s*/gi, '');

    //EXTRACT SELECT CLAUSE AND ITS VARIABLES
    const selectMatch = query.match(/SELECT\s+.*?\s+WHERE/i);
    const selectClause = selectMatch ? selectMatch[0] : 'SELECT ?s ?p ?o WHERE';
    let federatedQuery = `${selectClause} {SERVICE <${fallbackEndpoints[endpointIndex-1]}/search/sparql?token=${token}> {${query}}}`;

    if (prefixMatch) {
        const prefixes = prefixMatch.join(' ');
        federatedQuery = `${prefixes} ${federatedQuery}`;
    }

    console.log(federatedQuery)

    try {
        const response = await axios.post(fusekiEndpoint, querystring.stringify({ query: federatedQuery }), {
            headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        if (response.status === 200 && response.data.results.bindings.length > 0) {
            console.log(response.data)
            return res.status(200).send(response.data);
        } else {
            // If nothing is found, delegate to the next endpoint
            return await delegateSparql(req, res, query, endpointIndex + 1, token);
        }

    } catch (error) {
        console.log(error)
        return res.status(200).send({"head": {"vars": ["s","p","o"]},"results": {"bindings": []}});
    }
}
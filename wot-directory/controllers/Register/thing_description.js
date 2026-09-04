const schema = require('../../schema.json');
const Ajv = require("ajv").default;
const apply = require('ajv-formats');

var mongoose = require('mongoose');
var Thing_description = mongoose.model('thing_description');
var Summary_catalog = mongoose.model('summary_catalog');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const jsonld = require('jsonld');
const { checkServiceHealth } = require('../Admin/health');
const { isFusekiServiceActive } = require('../Admin/health');
const fusekiEndpoint = process.env.FUSEKI_URI_DEVELOPMENT + '/update';
const fusekiUsername = process.env.FUSEKI_USERNAME;
const fusekiPassword = process.env.FUSEKI_PASSWORD;
const AGENTS_API_URL = (process.env.AGENTS_API_URL || 'http://localhost:8001').replace(/\/$/, '');
const AGENTS_SUMMARIES_URL = `${AGENTS_API_URL}/api/summaries`;



function validate(data, res)
{
    var ajv = new Ajv();
    apply(ajv);
    //console.log(data)
  
    var validate = ajv.compile(schema);
    var valid = validate(data);
    //console.log(data)
    if (valid) return true;

    res.status(400).send({"message": "Invalid serialization or TD.", "description": validate.errors});
    
    return false;

}

//UPDATE//
module.exports.thingDescriptionCreateUpdate = async function(req, res) {
    if (req.params && req.params.id) { 
        req.body.updatedAt = Date.now();
        const json = JSON.parse(JSON.stringify(req.body));

        if(!validate(req.body, res)) return;

        //If the ID is being changed, check if the new ID is already in use
        if(req.params.id != req.body.id)
        {
                const existingDoc = await Thing_description.findOne({id: req.body.id});
                if(existingDoc) return res.status(400).send({"message": "Invalid serialization or TD.", "description": "The is already a Thing Description with the new ID"});
        }

        const fusekiActive = await isFusekiServiceActive();
        if (fusekiActive) {
            if(!await createUpdateSparql(req.params.id, json, res)) return;
        } else {
            console.warn('Fuseki service is not active. Skipping SPARQL update for TD:', req.body.id || req.params.id);
        }
        

        Thing_description
        .findOneAndUpdate({id: req.params.id},req.body,{ upsert: true, setDefaultsOnInsert: true },async function(err, td) {
            if (!err) { 
                if (!td) {
                    try {
                        await updateSummaryForTdIfAvailable(req.body);
                    } catch (summaryError) {
                        console.warn('Could not generate/store summary for new TD:', summaryError.message || summaryError);
                    }

                    // Create it
                    td = new Thing_description(req.body);  
                    return res 
                    .status(201)
                    .send();
                }
                return res 
                .status(204)
                .send();
            }
            return res
            .status(400)
            .send({"message": "Invalid serialization or TD.", "description": err});
        });
    } else {
        return res
        .status(400)
        .send({"message": "Invalid serialization or TD.", "description": "No thing description in the request"});
    }
};

//CREATION//
module.exports.thingDescriptionCreate = async function(req, res) {
    if(!req.body.id) req.body.id = "urn:uuid:" + uuidv4();
    req.body.updatedAt = Date.now();
    var baseUrl = "http://" + req.connection.localAddress.replace(/^.*:/, '') + ":" + req.connection.localPort;
    const json = JSON.parse(JSON.stringify(req.body));
    
    if(!validate(req.body, res)) return;

    const fusekiActive = await isFusekiServiceActive();
    if (fusekiActive) {
        if(!await createUpdateSparql(null, json, res)) return;
    } else {
        console.warn('Fuseki service is not active. Skipping SPARQL update for TD:', req.body.id);
    }
    

    Thing_description
    .findOneAndUpdate({id: req.body.id},req.body, { upsert: true, setDefaultsOnInsert: true },async function(err, td) {
        if (!err) { 
           try {
               await updateSummaryForTdIfAvailable(req.body);
           } catch (summaryError) {
               console.warn('Could not generate/store summary for created TD:', summaryError.message || summaryError);
           }

           // Create it
           td = new Thing_description(req.body);  
           console.log(Object.keys(JSON.parse(JSON.stringify(td))));
           return res 
            .writeHead(201, {
            'Location': baseUrl + '/td/' + req.body.id
            })
            .send();
        }
        
        return res
        .status(400)
        .send({"message": "Invalid serialization or TD.", "description": err});
    });    
};

//DELETION//
module.exports.thingDescriptionDelete = async function(req, res) {
    if (req.params && req.params.id) { 

        try {
            // Find and delete the document in MongoDB
            const deletedDoc = await Thing_description.findOneAndDelete({id: req.params.id});

            if (!deletedDoc) {
                return res
                .status(404)
                .send({"message": "Thing Description " + req.params.id + " not found"});
            }

            try {
        
                const fusekiActive = await isFusekiServiceActive();
                if (fusekiActive) {
                    if(!await deleteSparql(req.params.id, res)) throw new Error("SPARQL deletion process failed");
                } else {
                    console.warn('Fuseki service is not active. Skipping SPARQL deletion for TD:', req.body.id);
                }
                

                try {
                    await Summary_catalog.deleteOne({ deviceId: req.params.id });
                } catch (summaryError) {
                    console.warn('Could not delete summary for removed TD:', summaryError.message || summaryError);
                }
    
                console.log('Document deleted successfully and SPARQL deletion performed:', deletedDoc);
                return res 
                .status(204)
                .send();
    
            } catch (error) {
    
                // If the SPARQL update failed, re-insert the deleted document into MongoDB
                if (deletedDoc) {
                    await Thing_description.findOneAndUpdate({id: deletedDoc.id},deletedDoc, { upsert: true, setDefaultsOnInsert: true });
                }
    
                if(error.message.includes("not found")) {
                    return res
                    .status(404)
                    .send({"message": "Thing Description " + req.params.id + " not found"});
    
                }else {
                    return res
                    .status(500)
                    .send({"message": "Error deleting the Thing Description from Apache Jena", "description": error});
                }
            }

        } catch (error) {
            return res
            .status(500)
            .send({"message": "Error deleting the Thing Description from MongoDB", "description": error});
        }

        

    }else {
        return res
        .status(400)
        .send({"message": "No thing description in the request", "description": err});
    }

};

/********************/
/***SPARQL QUERIES***/
/********************/

async function createUpdateSparql(id, td, res) {
    try {
        // Convert JSON-LD to RDF in N-Quads format
        const turtle = await jsonld.toRDF(td, { format: 'application/n-quads' });
        let graphId = id;

        if(td.id) graphId = td.id;
        if(!graphId) graphId = `urn:uuid:${uuidv4()}`;

        // Build the SPARQL DELETE and INSERT DATA query
        const query = `
            DELETE WHERE {
                GRAPH <${graphId}> {
                    ?s ?p ?o .
                }
            };
            INSERT DATA {
                GRAPH <${graphId}> {
                    ${turtle}
                }
            }
        `;

        // Send the SPARQL update query to Fuseki
        const response = await axios.post(fusekiEndpoint, query, {
            headers: {
                'Content-Type': 'application/sparql-update',
                'Authorization': 'Basic ' + Buffer.from(fusekiUsername + ':' + fusekiPassword).toString('base64')

            }
        });

        console.log(graphId + " created/updated successfully using SPARQL.");
        return true;
    } catch (error) {
        res
        .status(400)
        .send({"message": "Invalid serialization or TD.", "description": error});
        return false;
    }
}

async function deleteSparql(graphId, res) {
    try {
        // Build the SPARQL DELETE WHERE query
        const query = `
            DELETE WHERE {
                GRAPH <${graphId}> {
                    ?s ?p ?o .
                }
            }
        `;

        // Send the SPARQL update query to Fuseki
        const response = await axios.post(fusekiEndpoint, query, {
            headers: {
                'Content-Type': 'application/sparql-update',
                'Authorization': 'Basic ' + Buffer.from(fusekiUsername + ':' + fusekiPassword).toString('base64')
            }
        });

        console.log(graphId + " deleted successfully using SPARQL.");
        return true;
    } catch (error) {
        return false;
    }
}


/***********************/
/***AI AGENTS QUERIES***/
/***********************/

async function updateSummaryForTdIfAvailable(td) {
    const health = await checkServiceHealth(AGENTS_API_URL);
    if (!health.ok) {
        return;
    }

    const response = await axios.post(
        AGENTS_SUMMARIES_URL,
        { items: [td] },
        {
            timeout: 120000,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        }
    );

    const devices = response.data && Array.isArray(response.data.devices)
        ? response.data.devices
        : [];

    if (!devices.length) {
        return;
    }

    const generated = devices[0];
    if (!generated || !generated.id) {
        return;
    }

    await Summary_catalog.findOneAndUpdate(
        { deviceId: generated.id },
        {
            $set: {
                deviceId: generated.id,
                name: generated.name || '',
                summary: generated.summary || '',
                properties: Array.isArray(generated.properties) ? generated.properties : [],
                actions: Array.isArray(generated.actions) ? generated.actions : [],
                events: Array.isArray(generated.events) ? generated.events : [],
                generatedAt: new Date(),
            },
        },
        {
            upsert: true,
            setDefaultsOnInsert: true
        }
    );
}






/***********************/
/***DIRECTORY QUERIES***/
/***********************/

module.exports.directoryCreateUpdate = async function(req, res) {
    var { name, url, isWoTtrader = false } = req.params;

    if(req.params && req.params.WoTtrader) isWoTtrader = req.params.WoTtrader;
    if (!name || !url) {
        return res.status(400).send({ message: 'Name and URL are required' });
    }

    const directoryData = {
        "@context": [
            "https://www.w3.org/2022/wot/td/v1.1",
            "https://www.w3.org/2022/wot/discovery"
        ],
        "@type": [
            "tm:ThingModel",
            "ThingDirectory"
        ],
        "title": name,
        "version": {
            "model": "1.0.0"
        },
        "base": url,
        "tm:optional": [],
        "properties": {},
        "actions": {
            "searchJSONPath": {
                "description": "JSONPath syntactic search. This affordance is not normative and is provided for information only.",
                "uriVariables": {
                    "query": {
                        "title": "A valid JSONPath expression",
                        "type": "string"
                    }
                },
                "output": {
                    "description": "The schema depends on the given query",
                    "type": "object"
                },
                "safe": true,
                "idempotent": true,
                "forms": [
                    {
                        "href": "/search/jsonpath?query={query}",
                        "htv:methodName": "GET",
                        "response": {
                            "description": "Success response",
                            "contentType": "application/json",
                            "htv:statusCodeValue": 200
                        },
                        "additionalResponses": [
                            {
                                "description": "JSONPath expression not provided or contains syntax errors",
                                "contentType": "application/problem+json",
                                "htv:statusCodeValue": 400
                            }
                        ]
                    }
                ]
            }
        },
        "events": {}
    };

    if (isWoTtrader) {
        directoryData.actions.search = {
            "description": "Syntactic search. This affordance is a WoTtrader extension.",
            "uriVariables": {
                "content": {
                    "title": "The text to be searched in the documents",
                    "type": "string"
                }
            },
            "output": {
                "description": "The schema depends on the given query",
                "type": "object"
            },
            "safe": true,
            "idempotent": true,
            "forms": [
                {
                    "href": "/search?content=query",
                    "htv:methodName": "GET",
                    "response": {
                        "description": "Success response",
                        "contentType": "application/json",
                        "htv:statusCodeValue": 200
                    },
                    "additionalResponses": [
                        {
                            "description": "Search error",
                            "contentType": "application/problem+json",
                            "htv:statusCodeValue": 400
                        }
                    ]
                }
            ]
        };
    }

    try {
        const existingDirectory = await Thing_description.findOneAndUpdate(
            { title: name, "@type": "ThingDirectory" },
            directoryData,
            { new: true, upsert: true }
        );
        res.status(200).send(existingDirectory);
    } catch (error) {
        res.status(500).send({ message: 'Error adding or updating directory', error });
    }
};


module.exports.directoryDelete = async function(req, res) {
    const name  = req.params.name;

    if (!name) {
        return res.status(400).send({ message: 'Name is required' });
    }

    try {
        const result = await Thing_description.findOneAndDelete({ title: name, "@type": "ThingDirectory" });
        if (result) {
            res.status(200).send({ message: 'Directory deleted successfully' });
        } else {
            res.status(404).send({ message: 'Directory not found' });
        }
    } catch (error) {
        res.status(500).send({ message: 'Error deleting directory', error });
    }

};

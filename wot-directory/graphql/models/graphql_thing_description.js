var mongoose = require( 'mongoose' );

var composeWithMongoose = require('graphql-compose-mongoose').composeWithMongoose;
var createMongooseSchema = require('convert-json-schema-to-mongoose').createMongooseSchema;

const refs =
{
        "anyUri": {
            "type": "string"
        },
        "description": {
            "type": "string"
        },
        "descriptions": {
            "type": "object",
            "additionalProperties": {
                "type": "string"
            }
        },
        "title": {
            "type": "string"
        },
        "titles": {
            "type": "object",
            "additionalProperties": {
                "type": "string"
            }
        },
        "security": {
            "oneOf": [{
                    "type": "array",
                    "items": {
                        "type": "string"
                    }
                },
                {
                    "type": "string"
                }
            ]
        },
        "scopes": {
            "oneOf": [{
                    "type": "array",
                    "items": {
                        "type": "string"
                    }
                },
                {
                    "type": "string"
                }
            ]
        },
        "subprotocol": {
            "type": "string",
            "enum": [
                "longpoll",
                "websub",
                "sse"
            ]
        },
        "thing-context-w3c-uri": {
            "type": "string",
            "enum": [
                "https://www.w3.org/2019/wot/td/v1"
            ]
        },
        "thing-context": {
            "oneOf": [{
                    "type": "array",
                    "items": [{
                        "$ref": "thing-context-w3c-uri"
                    }],
                    "additionalItems": {
                        "anyOf": [{
                                "$ref": "anyUri"
                            },
                            {
                                "type": "object"
                            }
                        ]
                    }
                },
                {
                    "$ref": "thing-context-w3c-uri"
                }
            ]
        },
        "type_declaration": {
            "oneOf": [{
                    "type": "string"
                },
                {
                    "type": "array",
                    "items": {
                        "type": "string"
                    }
                }
            ]
        },
        "dataSchema": {
            "type": "object",
            "properties": {
                "description": {
                    "$ref": "description"
                },
                "title": {
                    "$ref": "title"
                },
                "descriptions": {
                    "$ref": "descriptions"
                },
                "titles": {
                    "$ref": "titles"
                },
                "writeOnly": {
                    "type": "boolean"
                },
                "readOnly": {
                    "type": "boolean"
                },
                "oneOf": {
                    "type": "array",
                    "items": {
                        "$ref": "dataSchema"
                    }
                },
                "unit": {
                    "type": "string"
                },
                "enum": {
                    "type": "array",
                    "minItems": 1,
                    "uniqueItems": true
                },
                "format": {
                    "type": "string"
                },
                "const": {},
                "type": {
                    "type": "string",
                    "enum": [
                        "boolean",
                        "integer",
                        "number",
                        "string",
                        "object",
                        "array",
                        "null"
                    ]
                },
                "items": {
                    "oneOf": [{
                            "$ref": "dataSchema"
                        },
                        {
                            "type": "array",
                            "items": {
                                "$ref": "dataSchema"
                            }
                        }
                    ]
                },
                "maxItems": {
                    "type": "integer",
                    "minimum": 0
                },
                "minItems": {
                    "type": "integer",
                    "minimum": 0
                },
                "minimum": {
                    "type": "number"
                },
                "maximum": {
                    "type": "number"
                },
                "properties": {
                    "additionalProperties": {
                        "$ref": "dataSchema"
                    }
                },
                "required": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    }
                }
            }
        },
        "form_element_property": {
            "type": "object",
            "properties": {
                "op": {
                    "oneOf": [{
                            "type": "string",
                            "enum": [
                                "readproperty",
                                "writeproperty",
                                "observeproperty",
                                "unobserveproperty"
                            ]
                        },
                        {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": [
                                    "readproperty",
                                    "writeproperty",
                                    "observeproperty",
                                    "unobserveproperty"
                                ]
                            }
                        }
                    ]
                },
                "href": {
                    "$ref": "anyUri"
                },
                "contentType": {
                    "type": "string"
                },
                "contentCoding": {
                    "type": "string"
                },
                "subprotocol": {
                    "$ref": "subprotocol"
                },
                "security": {
                    "$ref": "security"
                },
                "scopes": {
                    "$ref": "scopes"
                },
                "response": {
                    "type": "object",
                    "properties": {
                        "contentType": {
                            "type": "string"
                        }
                    }
                }
            },
            "required": [
                "href"
            ],
            "additionalProperties": true
        },
        "form_element_action": {
            "type": "object",
            "properties": {
                "op": {
                    "oneOf": [{
                            "type": "string",
                            "enum": [
                                "invokeaction"
                            ]
                        },
                        {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": [
                                    "invokeaction"
                                ]
                            }
                        }
                    ]
                },
                "href": {
                    "$ref": "anyUri"
                },
                "contentType": {
                    "type": "string"
                },
                "contentCoding": {
                    "type": "string"
                },
                "subprotocol": {
                    "$ref": "subprotocol"
                },
                "security": {
                    "$ref": "security"
                },
                "scopes": {
                    "$ref": "scopes"
                },
                "response": {
                    "type": "object",
                    "properties": {
                        "contentType": {
                            "type": "string"
                        }
                    }
                }
            },
            "required": [
                "href"
            ],
            "additionalProperties": true
        },
        "form_element_event": {
            "type": "object",
            "properties": {
                "op": {
                    "oneOf": [{
                            "type": "string",
                            "enum": [
                                "subscribeevent",
                                "unsubscribeevent"
                            ]
                        },
                        {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": [
                                    "subscribeevent",
                                    "unsubscribeevent"
                                ]
                            }
                        }
                    ]
                },
                "href": {
                    "$ref": "anyUri"
                },
                "contentType": {
                    "type": "string"
                },
                "contentCoding": {
                    "type": "string"
                },
                "subprotocol": {
                    "$ref": "subprotocol"
                },
                "security": {
                    "$ref": "security"
                },
                "scopes": {
                    "$ref": "scopes"
                },
                "response": {
                    "type": "object",
                    "properties": {
                        "contentType": {
                            "type": "string"
                        }
                    }
                }
            },
            "required": [
                "href"
            ],
            "additionalProperties": true
        },
        "form_element_root": {
            "type": "object",
            "properties": {
                "op": {
                    "oneOf": [{
                            "type": "string",
                            "enum": [
                                "readallproperties",
                                "writeallproperties",
                                "readmultipleproperties",
                                "writemultipleproperties"
                            ]
                        },
                        {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": [
                                    "readallproperties",
                                    "writeallproperties",
                                    "readmultipleproperties",
                                    "writemultipleproperties"
                                ]
                            }
                        }
                    ]
                },
                "href": {
                    "$ref": "anyUri"
                },
                "contentType": {
                    "type": "string"
                },
                "contentCoding": {
                    "type": "string"
                },
                "subprotocol": {
                    "$ref": "subprotocol"
                },
                "security": {
                    "$ref": "security"
                },
                "scopes": {
                    "$ref": "scopes"
                },
                "response": {
                    "type": "object",
                    "properties": {
                        "contentType": {
                            "type": "string"
                        }
                    }
                }
            },
            "required": [
                "href"
            ],
            "additionalProperties": true
        },
        "property_element": {
            "type": "object",
            "properties": {
                "description": {
                    "$ref": "description"
                },
                "descriptions": {
                    "$ref": "descriptions"
                },
                "title": {
                    "$ref": "title"
                },
                "titles": {
                    "$ref": "titles"
                },
                "forms": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "$ref": "form_element_property"
                    }
                },
                "uriVariables": {
                    "type": "object",
                    "additionalProperties": {
                        "$ref": "dataSchema"
                    }
                },
                "observable": {
                    "type": "boolean"
                },
                "writeOnly": {
                    "type": "boolean"
                },
                "readOnly": {
                    "type": "boolean"
                },
                "oneOf": {
                    "type": "array",
                    "items": {
                        "$ref": "dataSchema"
                    }
                },
                "unit": {
                    "type": "string"
                },
                "enum": {
                    "type": "array",
                    "minItems": 1,
                    "uniqueItems": true
                },
                "format": {
                    "type": "string"
                },
                "const": {},
                "type": {
                    "type": "string",
                    "enum": [
                        "boolean",
                        "integer",
                        "number",
                        "string",
                        "object",
                        "array",
                        "null"
                    ]
                },
                "items": {
                    "oneOf": [{
                            "$ref": "dataSchema"
                        },
                        {
                            "type": "array",
                            "items": {
                                "$ref": "dataSchema"
                            }
                        }
                    ]
                },
                "maxItems": {
                    "type": "integer",
                    "minimum": 0
                },
                "minItems": {
                    "type": "integer",
                    "minimum": 0
                },
                "minimum": {
                    "type": "number"
                },
                "maximum": {
                    "type": "number"
                },
                "properties": {
                    "additionalProperties": {
                        "$ref": "dataSchema"
                    }
                },
                "required": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    }
                }
            },
            "required": [
                "forms"
            ],
            "additionalProperties": true
        },
        "action_element": {
            "type": "object",
            "properties": {
                "description": {
                    "$ref": "description"
                },
                "descriptions": {
                    "$ref": "descriptions"
                },
                "title": {
                    "$ref": "title"
                },
                "titles": {
                    "$ref": "titles"
                },
                "forms": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "$ref": "form_element_action"
                    }
                },
                "uriVariables": {
                    "type": "object",
                    "additionalProperties": {
                        "$ref": "dataSchema"
                    }
                },
                "input": {
                    "$ref": "dataSchema"
                },
                "output": {
                    "$ref": "dataSchema"
                },
                "safe": {
                    "type": "boolean"
                },
                "idempotent": {
                    "type": "boolean"
                }
            },
            "required": [
                "forms"
            ],
            "additionalProperties": true
        },
        "event_element": {
            "type": "object",
            "properties": {
                "description": {
                    "$ref": "description"
                },
                "descriptions": {
                    "$ref": "descriptions"
                },
                "title": {
                    "$ref": "title"
                },
                "titles": {
                    "$ref": "titles"
                },
                "forms": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "$ref": "form_element_event"
                    }
                },
                "uriVariables": {
                    "type": "object",
                    "additionalProperties": {
                        "$ref": "dataSchema"
                    }
                },
                "subscription": {
                    "$ref": "dataSchema"
                },
                "data": {
                    "$ref": "dataSchema"
                },
                "cancellation": {
                    "$ref": "dataSchema"
                }
            },
            "required": [
                "forms"
            ],
            "additionalProperties": true
        },
        "link_element": {
            "type": "object",
            "properties": {
                "href": {
                    "$ref": "anyUri"
                },
                "type": {
                    "type": "string"
                },
                "rel": {
                    "type": "string"
                },
                "anchor": {
                    "$ref": "anyUri"
                }
            },
            "required": [
                "href"
            ],
            "additionalProperties": true
        },
        "securityScheme": {
            "oneOf": [{
                    "type": "object",
                    "properties": {
                        "description": {
                            "$ref": "description"
                        },
                        "descriptions": {
                            "$ref": "descriptions"
                        },
                        "proxy": {
                            "$ref": "anyUri"
                        },
                        "scheme": {
                            "type": "string",
                            "enum": [
                                "nosec"
                            ]
                        }
                    },
                    "required": [
                        "scheme"
                    ]
                },
                {
                    "type": "object",
                    "properties": {
                        "description": {
                            "$ref": "description"
                        },
                        "descriptions": {
                            "$ref": "descriptions"
                        },
                        "proxy": {
                            "$ref": "anyUri"
                        },
                        "scheme": {
                            "type": "string",
                            "enum": [
                                "basic"
                            ]
                        },
                        "in": {
                            "type": "string",
                            "enum": [
                                "header",
                                "query",
                                "body",
                                "cookie"
                            ]
                        },
                        "name": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "scheme"
                    ]
                },
                {
                    "type": "object",
                    "properties": {
                        "description": {
                            "$ref": "description"
                        },
                        "descriptions": {
                            "$ref": "descriptions"
                        },
                        "proxy": {
                            "$ref": "anyUri"
                        },
                        "scheme": {
                            "type": "string",
                            "enum": [
                                "digest"
                            ]
                        },
                        "qop": {
                            "type": "string",
                            "enum": [
                                "auth",
                                "auth-int"
                            ]
                        },
                        "in": {
                            "type": "string",
                            "enum": [
                                "header",
                                "query",
                                "body",
                                "cookie"
                            ]
                        },
                        "name": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "scheme"
                    ]
                },
                {
                    "type": "object",
                    "properties": {
                        "description": {
                            "$ref": "description"
                        },
                        "descriptions": {
                            "$ref": "descriptions"
                        },
                        "proxy": {
                            "$ref": "anyUri"
                        },
                        "scheme": {
                            "type": "string",
                            "enum": [
                                "apikey"
                            ]
                        },
                        "in": {
                            "type": "string",
                            "enum": [
                                "header",
                                "query",
                                "body",
                                "cookie"
                            ]
                        },
                        "name": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "scheme"
                    ]
                },
                {
                    "type": "object",
                    "properties": {
                        "description": {
                            "$ref": "description"
                        },
                        "descriptions": {
                            "$ref": "descriptions"
                        },
                        "proxy": {
                            "$ref": "anyUri"
                        },
                        "scheme": {
                            "type": "string",
                            "enum": [
                                "bearer"
                            ]
                        },
                        "authorization": {
                            "$ref": "anyUri"
                        },
                        "alg": {
                            "type": "string"
                        },
                        "format": {
                            "type": "string"
                        },
                        "in": {
                            "type": "string",
                            "enum": [
                                "header",
                                "query",
                                "body",
                                "cookie"
                            ]
                        },
                        "name": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "scheme"
                    ]
                },
                {
                    "type": "object",
                    "properties": {
                        "description": {
                            "$ref": "description"
                        },
                        "descriptions": {
                            "$ref": "descriptions"
                        },
                        "proxy": {
                            "$ref": "anyUri"
                        },
                        "scheme": {
                            "type": "string",
                            "enum": [
                                "psk"
                            ]
                        },
                        "identity": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "scheme"
                    ]
                },
                {
                    "type": "object",
                    "properties": {
                        "description": {
                            "$ref": "description"
                        },
                        "descriptions": {
                            "$ref": "descriptions"
                        },
                        "proxy": {
                            "$ref": "anyUri"
                        },
                        "scheme": {
                            "type": "string",
                            "enum": [
                                "oauth2"
                            ]
                        },
                        "authorization": {
                            "$ref": "anyUri"
                        },
                        "token": {
                            "$ref": "anyUri"
                        },
                        "refresh": {
                            "$ref": "anyUri"
                        },
                        "scopes": {
                            "oneOf": [{
                                    "type": "array",
                                    "items": {
                                        "type": "string"
                                    }
                                },
                                {
                                    "type": "string"
                                }
                            ]
                        },
                        "flow": {
                            "type": "string",
                            "enum": [
                                "code"
                            ]
                        }
                    },
                    "required": [
                        "scheme"
                    ]
                }
            ]
        }
};

// example schema to convert to mongoose schema
const schema =
{
    "type": "object",
    "properties": {
        "id": {
            "type": "string",
            "format": "uri"
        },
        "title": {
            "$ref": "title"
        },
        "titles": {
            "$ref": "titles"
        },
        "properties": {
            "type": "object",
            "additionalProperties": {
                "$ref": "property_element"
            }
        },
        "actions": {
            "type": "object",
            "additionalProperties": {
                "$ref": "action_element"
            }
        },
        "events": {
            "type": "object",
            "additionalProperties": {
                "$ref": "event_element"
            }
        },
        "description": {
            "$ref": "description"
        },
        "descriptions": {
            "$ref": "descriptions"
        },
        "version": {
            "type": "object",
            "properties": {
                "instance": {
                    "type": "string"
                }
            },
            "required": [
                "instance"
            ]
        },
        "links": {
            "type": "array",
            "items": {
                "$ref": "link_element"
            }
        },
        "forms": {
            "type": "array",
            "minItems": 1,
            "items": {
                "$ref": "form_element_root"
            }
        },
        "base": {
            "$ref": "anyUri"
        },
        "securityDefinitions": {
            "type": "object",
            "minProperties": 1,
            "additionalProperties": {
                "$ref": "securityScheme"
            }
        },
        "support": {
            "$ref": "anyUri"
        },
        "created": {
            "type": "string",
            "format": "date-time"
        },
        "modified": {
            "type": "string",
            "format": "date-time"
        },
        "security": {
            "oneOf": [{
                    "type": "string"
                },
                {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "string"
                    }
                }
            ]
        }
    }
};

const mongooseSchema = createMongooseSchema(refs, schema);
const thing_descriptionSchema = new mongoose.Schema(mongooseSchema);

const ThingDescription = mongoose.model('thing_description_graphql', thing_descriptionSchema, 'thing_descriptions');
const ThingDescriptionTC = composeWithMongoose(ThingDescription);

module.exports.ThingDescription = ThingDescription;
module.exports.ThingDescriptionTC = ThingDescriptionTC;
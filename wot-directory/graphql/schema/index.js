//const schemaComposer = new SchemaComposer();
const schemaComposer = require('graphql-compose').schemaComposer;

const ThingDescriptionQuery = require( './thing_description');

schemaComposer.Query.addFields({
    ...ThingDescriptionQuery,
});

module.exports = schemaComposer.buildSchema();
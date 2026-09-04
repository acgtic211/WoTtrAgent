const ThingDescription = require('../models/graphql_thing_description').ThingDescription;
const ThingDescriptionTC = require('../models/graphql_thing_description').ThingDescriptionTC;

const ThingDescriptionQuery = {
    thingDescriptionById: ThingDescriptionTC.getResolver('findById'),
    thingDescriptionByIds: ThingDescriptionTC.getResolver('findByIds'),
    thingDescriptionOne: ThingDescriptionTC.getResolver('findOne'),
    thingDescriptionMany: ThingDescriptionTC.getResolver('findMany'),
    thingDescriptionCount: ThingDescriptionTC.getResolver('count'),
    thingDescriptionConnection: ThingDescriptionTC.getResolver('connection'),
    thingDescriptionPagination: ThingDescriptionTC.getResolver('pagination'),
};

module.exports = ThingDescriptionQuery;
const ApolloServer = require('apollo-server-express').ApolloServer;
const schema = require('./schema');


const server = new ApolloServer({
    schema,
    cors: true,
    playground: true,
    introspection: true,
    tracing: true,
    path: '/graphql',
  });


module.exports = server;

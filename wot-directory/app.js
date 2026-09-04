const dotenv = require('dotenv');
const createError = require('http-errors');
const express = require('express');
const bodyParser = require('body-parser');
const indexRouter = require('./routes/index');
const cors = require('cors');
const graphqlServer = require('./graphql/index');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const swaggerJsdoc = require('swagger-jsdoc');

dotenv.config();

const app = express();

app.use(cors());
app.locals.delegationMap = new Map()

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

// parse plain text
app.use(bodyParser.text({ type: 'text/plain' }));

//app.use(bodyParser.json({type: 'application/ld+json'}));

// swagger setup
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WoTtrader API',
      description: 'This is the WoTtrader API. It is used to discover WoT Things and register Thing Descriptions. It is based on the [WoT Discovery draft specification](https://w3c.github.io/wot-discovery/). <br><br> Related APIs: <br><br> <a href="https://acgsaas.ual.es/wot-lab/api/ui#/">WoT Lab API</a> <br> <a href="https://acgsaas.ual.es/urbanapi/api#/">UrbanAPI</a>',
      contact: {
        name: "Juan Alberto Llopis Expósito",	
        email: "jalbertollopis@ual.es"
      },
    },
    servers: [{url: 'https://acg.ual.es/projects/cosmart/wot-lab/ds/api'}]
  },
  apis: ['./routes/*.js']
};

const specs = swaggerJsdoc(swaggerOptions);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(specs));

//Content type for all the requests
app.use(function(req, res, next) {
  res.setHeader('Content-Type', 'application/ld+json');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});


app.use('/api', indexRouter);

//Add GraphQL
graphqlServer.applyMiddleware({app, path: '/graphql', cors: true});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
// eslint-disable-next-line no-unused-vars
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = process.env.NODE_ENV === 'development' ? err : {};
  
  // render the error page
  res.status(err.status || 500);
  res.json({ error: err.message })
});

module.exports = app;
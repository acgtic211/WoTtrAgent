db = db.getSiblingDB('node-database');
db.createCollection('thing_descriptions');
db.createCollection('summary_catalogs');
db.thing_descriptions.createIndex({ "$**": "text" },{ name: "TextIndex" })
var mongoose = require('mongoose');

var summaryCatalogSchema = mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      default: '',
    },
    summary: {
      type: String,
      default: '',
    },
    properties: {
      type: [String],
      default: [],
    },
    actions: {
      type: [String],
      default: [],
    },
    events: {
      type: [String],
      default: [],
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    }
  },
  {
    timestamps: true,
    strict: false,
    versionKey: false,
    minimize: false,
  }
);

mongoose.model('summary_catalog', summaryCatalogSchema);
